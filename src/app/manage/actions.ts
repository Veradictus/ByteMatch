"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { canManage, canManageRepo, currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { projects, type Project } from "@/db/schema";
import { findProject } from "@/db/store";
import { userClient } from "@/github/client";
import { enqueue, JOBS } from "@/lib/queue";
import { cleanName, cleanYear } from "@/lib/games";
import { checkImageUrl } from "@/lib/images";
import { registrationOpen } from "@/lib/settings";
import { checkDiscordUrl } from "@/lib/links";
import { createToken, revokeToken } from "@/lib/tokens";
import { checkVersion, HistoryError, MAX_HISTORY_BYTES, parseHistory, storeHistory } from "@/ingest/history";

export interface FormState {
  error?: string;
  message?: string;
  token?: string;
}

async function requireSession() {
  const session = await currentSession();
  if (!session) redirect("/login?next=/manage");
  return session;
}

/** The project, if the signed-in user may manage it; throws otherwise. */
async function managed(owner: string, repo: string): Promise<Project> {
  const session = await requireSession();
  const project = await findProject(owner, repo);
  if (!project || !(await canManage(session, project))) throw new Error("You can't manage this project.");
  return project;
}

/** Accepts "owner/repo" or a GitHub URL. */
export async function parseRepo(input: string): Promise<{ owner: string; repo: string } | null> {
  const m = /^(?:https?:\/\/github\.com\/)?([\w.-]+)\/([\w.-]+?)(?:\.git)?\/?$/i.exec(input.trim());
  return m ? { owner: m[1], repo: m[2] } : null;
}

export async function addProject(_: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  if (!session.admin && !(await registrationOpen())) return { error: "Adding projects is closed on this instance right now." };
  const parsed = await parseRepo(String(form.get("repo") ?? ""));
  if (!parsed) return { error: "Enter the repository as owner/repo or its GitHub URL." };
  if (!(await canManageRepo(session, parsed.owner, parsed.repo))) return { error: "You need admin rights on that GitHub repository." };

  let repo;
  try {
    ({ data: repo } = await userClient(session.githubToken).request("GET /repos/{owner}/{repo}", parsed));
  } catch {
    return { error: "GitHub can't find that repository." };
  }
  if (repo.private) return { error: "Only public repositories can be tracked." };
  const existing = await findProject(repo.owner.login, repo.name);
  if (existing) redirect(`/manage/${existing.owner}/${existing.repo}`);

  const [project] = await db()
    .insert(projects)
    .values({
      githubId: Number(repo.id),
      owner: repo.owner.login,
      repo: repo.name,
      name: String(form.get("name") ?? "").trim() || repo.name,
      platform: String(form.get("platform") ?? "").trim() || null,
      description: repo.description,
      defaultBranch: repo.default_branch,
      createdBy: session.user.id,
    })
    .onConflictDoNothing()
    .returning();
  if (!project) return { error: "That repository is already registered." };
  // A new project syncs everything at once: history from decomp.dev if it was tracked there, then
  // every CI run whose artifacts have not expired (which includes the latest one).
  await enqueue(JOBS.importDecompDev, { projectId: project.id }, `import:${project.id}`);
  await enqueue(JOBS.backfill, { projectId: project.id, maxRuns: 500 }, `backfill:${project.id}`);
  redirect(`/manage/${project.owner}/${project.repo}?added=1`);
}

const text = (form: FormData, key: string) => {
  const v = String(form.get(key) ?? "").trim();
  return v === "" ? null : v;
};

export async function updateProject(owner: string, repo: string, _: FormState, form: FormData): Promise<FormState> {
  const project = await managed(owner, repo);
  const pattern = text(form, "artifactPattern") ?? "^(?<version>.+)_report$";
  try {
    new RegExp(pattern);
  } catch {
    return { error: "The artifact pattern is not a valid regular expression." };
  }
  if (text(form, "releaseYear") && !cleanYear(text(form, "releaseYear"))) return { error: "The release year should look like 2002." };
  const discord = checkDiscordUrl(String(form.get("discordUrl") ?? ""));
  if ("error" in discord) return { error: discord.error };
  await db()
    .update(projects)
    .set({
      discordUrl: discord.url,
      name: text(form, "name") ?? project.repo,
      shortName: text(form, "shortName"),
      description: text(form, "description"),
      platform: text(form, "platform"),
      game: cleanName(text(form, "game")),
      franchise: cleanName(text(form, "franchise")),
      releaseYear: cleanYear(text(form, "releaseYear")),
      defaultVersion: text(form, "defaultVersion"),
      defaultCategory: text(form, "defaultCategory"),
      defaultBranch: text(form, "defaultBranch") ?? project.defaultBranch,
      artifactPattern: pattern,
      workflow: text(form, "workflow"),
      splitVersions: form.get("splitVersions") === "on",
      prComments: form.get("prComments") === "on",
      enabled: form.get("enabled") === "on",
      updatedAt: new Date(),
    })
    .where(eq(projects.id, project.id));
  revalidatePath(`/manage/${owner}/${repo}`);
  return { message: "Saved." };
}

export async function runAction(owner: string, repo: string, _: FormState, form: FormData): Promise<FormState> {
  const project = await managed(owner, repo);
  switch (form.get("action")) {
    case "poll":
      await enqueue(JOBS.pollProject, { projectId: project.id }, `poll:${project.id}`);
      return { message: "Queued: looking for new CI runs." };
    case "backfill":
      await enqueue(JOBS.backfill, { projectId: project.id, maxRuns: 500 }, `backfill:${project.id}`);
      return { message: "Queued: reading up to 500 older CI runs whose artifacts have not expired." };
    case "import":
      await enqueue(JOBS.importDecompDev, { projectId: project.id }, `import:${project.id}`);
      return { message: "Queued: importing history from decomp.dev." };
    default:
      return { error: "Unknown action." };
  }
}

export async function newToken(owner: string, repo: string, _: FormState, form: FormData): Promise<FormState> {
  const session = await requireSession();
  const project = await managed(owner, repo);
  const name = String(form.get("name") ?? "").trim() || "upload";
  const token = await createToken(project, name, session.user.id);
  revalidatePath(`/manage/${owner}/${repo}`);
  return { token, message: "Copy the token now: it is shown only once." };
}

export async function deleteToken(owner: string, repo: string, form: FormData) {
  const project = await managed(owner, repo);
  await revokeToken(project.id, Number(form.get("id")));
  revalidatePath(`/manage/${owner}/${repo}`);
}

/** Sets the project's cover (banner) or icon (square thumbnail) link; empty removes it. */
export async function setImageUrl(owner: string, repo: string, kind: "cover" | "icon", _: FormState, form: FormData): Promise<FormState> {
  const project = await managed(owner, repo);
  const checked = checkImageUrl(String(form.get("imageUrl") ?? ""));
  if ("error" in checked) return { error: checked.error };
  await db()
    .update(projects)
    .set({ ...(kind === "icon" ? { iconUrl: checked.url } : { imageUrl: checked.url }), updatedAt: new Date() })
    .where(eq(projects.id, project.id));
  revalidatePath(`/manage/${owner}/${repo}`);
  revalidatePath(`/${owner}/${repo}`);
  revalidatePath("/");
  const what = kind === "icon" ? "Icon" : "Cover";
  return {
    message: checked.url
      ? `${what} saved.`
      : kind === "cover"
        ? "Manual cover cleared. Automatic artwork will be used when configured and available."
        : `${what} removed.`,
  };
}

/** Adds an uploaded history file (decomp.dev's mode=history JSON) to one version's history. */
export async function uploadHistory(owner: string, repo: string, _: FormState, form: FormData): Promise<FormState> {
  const project = await managed(owner, repo);
  const version = checkVersion(String(form.get("version") ?? ""));
  if (!version) return { error: "Enter the version this history belongs to (e.g. GLMJ01, us)." };
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a history file." };
  if (file.size > MAX_HISTORY_BYTES) return { error: "That file is too large." };
  try {
    const rows = parseHistory(new Uint8Array(await file.arrayBuffer()));
    const { added, skipped } = await storeHistory(project, version, rows);
    revalidatePath(`/manage/${owner}/${repo}`);
    revalidatePath(`/${owner}/${repo}`);
    const n = (k: number) => k.toLocaleString("en-US");
    return {
      message: `Added ${n(added)} commit${added === 1 ? "" : "s"} to ${version}${skipped ? `; ${n(skipped)} already had data and were left as they were` : ""}.`,
    };
  } catch (e) {
    if (e instanceof HistoryError) return { error: e.message };
    throw e;
  }
}
