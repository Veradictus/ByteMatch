"use server";

import { eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { notFound } from "next/navigation";
import { currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { audit, block, clearProjectLinks, deleteProject, setProjectsEnabled, unblock, type Actor } from "@/lib/moderation";
import { boss, enqueue, JOBS, type JobName } from "@/lib/queue";
import { appointAdmin, assertCanActOnProject, removeAdmin } from "@/lib/roles";
import { clearSetting, setSetting } from "@/lib/settings";
import { removeSharersThemes, setThemeRemoved } from "@/db/themes";
import { addAlias, AliasError, removeAlias } from "@/db/aliases";
import { igdbGame } from "@/lib/igdb";
import { linkGame } from "@/lib/igdb-link";

export interface AdminState {
  error?: string;
  message?: string;
}

/** Every admin action re-checks the session: a 404 for anyone who is not site staff. */
async function requireAdmin(): Promise<Actor> {
  const session = await currentSession();
  if (!session?.role) notFound();
  return { id: session.user.id, login: session.user.login, role: session.role };
}

/** Owner-only actions: instance settings and appointing admins. */
async function requireOwner(): Promise<Actor> {
  const actor = await requireAdmin();
  if (actor.role !== "owner") notFound();
  return actor;
}

async function projectById(id: number) {
  const [p] = await db().select().from(projects).where(eq(projects.id, id));
  return p;
}

const done = (message: string): AdminState => {
  revalidatePath("/admin", "layout");
  return { message };
};

// ---- Projects ----

export async function resyncProject(form: FormData) {
  const actor = await requireAdmin();
  const p = await projectById(Number(form.get("id")));
  if (!p) return;
  await assertCanActOnProject(actor.role, p);
  await enqueue(JOBS.importDecompDev, { projectId: p.id }, `import:${p.id}`);
  await enqueue(JOBS.backfill, { projectId: p.id, maxRuns: 500 }, `backfill:${p.id}`);
  await audit(actor, "resync-project", `${p.owner}/${p.repo}`);
  revalidatePath("/admin/projects");
}

export async function toggleProject(form: FormData) {
  const actor = await requireAdmin();
  await setProjectsEnabled(actor, [Number(form.get("id"))], form.get("enabled") === "true");
  revalidatePath("/admin/projects");
}

export async function clearImage(form: FormData) {
  const actor = await requireAdmin();
  const p = await projectById(Number(form.get("id")));
  if (p) await clearProjectLinks(actor, p, { image: true });
  revalidatePath("/admin/projects");
}

export async function clearIcon(form: FormData) {
  const actor = await requireAdmin();
  const p = await projectById(Number(form.get("id")));
  if (p) await clearProjectLinks(actor, p, { icon: true });
  revalidatePath("/admin/projects");
}

export async function clearDiscord(form: FormData) {
  const actor = await requireAdmin();
  const p = await projectById(Number(form.get("id")));
  if (p) await clearProjectLinks(actor, p, { discord: true });
  revalidatePath("/admin/projects");
}

export async function removeProject(form: FormData) {
  const actor = await requireAdmin();
  const p = await projectById(Number(form.get("id")));
  if (p) await deleteProject(actor, p, String(form.get("reason") ?? "").trim() || null);
  revalidatePath("/admin/projects");
  revalidatePath("/");
}

// ---- Users ----

export async function blockAccount(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  try {
    const takenDown = await block(
      actor,
      String(form.get("login") ?? ""),
      String(form.get("reason") ?? "").trim() || null,
      form.get("takeDown") === "on",
    );
    return done(`Blocked.${takenDown ? ` ${takenDown} project${takenDown === 1 ? "" : "s"} taken offline.` : ""}`);
  } catch (e) {
    return { error: (e as Error).message };
  }
}

export async function unblockAccount(form: FormData) {
  const actor = await requireAdmin();
  await unblock(actor, Number(form.get("id")));
  revalidatePath("/admin/users");
}

// ---- Jobs ----

export async function retryJob(form: FormData) {
  const actor = await requireAdmin();
  const name = String(form.get("name")) as JobName;
  const id = String(form.get("id"));
  await (await boss()).retry(name, id);
  await audit(actor, "retry-job", name, { id });
  revalidatePath("/admin/jobs");
}

/** Discards one failed job, or a group of identical ones (ids comma-separated). */
export async function discardJob(form: FormData) {
  const actor = await requireAdmin();
  const name = String(form.get("name")) as JobName;
  const ids = String(form.get("id")).split(",").filter(Boolean);
  await (await boss()).deleteJob(name, ids);
  await audit(actor, "discard-job", name, ids.length === 1 ? { id: ids[0] } : { count: ids.length });
  revalidatePath("/admin/jobs");
}

// ---- Game and franchise names ----

export async function mergeNamesAction(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  const kind = form.get("kind") === "franchise" ? "franchise" : "game";
  const from = String(form.get("from") ?? "").trim();
  const to = String(form.get("to") ?? "").trim();
  try {
    await addAlias(kind, from, to, actor.id);
  } catch (e) {
    if (e instanceof AliasError) return { error: e.message };
    throw e;
  }
  await audit(actor, `merge-${kind}`, from, { into: to });
  revalidatePath("/admin/games");
  revalidatePath("/games", "layout");
  return { message: `“${from}” now groups with “${to}”.` };
}

export async function unmergeNameAction(form: FormData) {
  const actor = await requireAdmin();
  const kind = form.get("kind") === "franchise" ? "franchise" : "game";
  const key = String(form.get("key"));
  if (await removeAlias(kind, key)) await audit(actor, `unmerge-${kind}`, key);
  revalidatePath("/admin/games");
  revalidatePath("/games", "layout");
}

/** Links a game page's projects to an IGDB game, read from IGDB by id (never from the form's text). */
export async function linkIgdbAction(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await requireAdmin();
  const key = String(form.get("key") ?? "");
  let game;
  try {
    game = await igdbGame(Number(form.get("igdbId")));
  } catch (e) {
    console.error("igdb", e);
    return { error: "IGDB didn't answer; try again in a moment." };
  }
  if (!game) return { error: "IGDB has no game with that id." };
  const done = await linkGame(key, game, actor.id);
  if (!done) return { error: "That game page no longer exists; reload." };
  await audit(actor, "link-igdb", key, { igdbId: game.id, name: game.name });
  revalidatePath("/admin/games");
  revalidatePath("/games", "layout");
  return { message: `Linked ${done.projects} project${done.projects === 1 ? "" : "s"} to “${game.name}” on IGDB.` };
}

export async function unlinkIgdbAction(form: FormData) {
  const actor = await requireAdmin();
  const key = String(form.get("key") ?? "");
  if (await linkGame(key, null, actor.id)) await audit(actor, "unlink-igdb", key);
  revalidatePath("/admin/games");
  revalidatePath("/games", "layout");
}

// ---- Shared themes ----

export async function setThemeRemovedAction(form: FormData) {
  const actor = await requireAdmin();
  const code = String(form.get("code"));
  const removed = form.get("removed") === "true";
  if (await setThemeRemoved(code, removed)) await audit(actor, removed ? "remove-theme" : "restore-theme", code);
  revalidatePath("/admin/themes");
}

export async function removeSharerAction(form: FormData) {
  const actor = await requireAdmin();
  const sharer = String(form.get("sharer"));
  const n = await removeSharersThemes(sharer);
  await audit(actor, "remove-sharer-themes", sharer.slice(0, 12), { count: n });
  revalidatePath("/admin/themes");
}

export async function setThemeSharingAction(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await requireOwner();
  const paused = form.get("paused") === "on";
  const limit = Number(form.get("dailyLimit"));
  if (!Number.isInteger(limit) || limit < 0 || limit > 1_000_000)
    return { error: "The daily limit should be a whole number up to 1,000,000." };
  await setSetting("themeSharingPaused", paused);
  await setSetting("themeDailyLimit", limit);
  await audit(actor, "set-theme-sharing", null, { paused, dailyLimit: limit });
  revalidatePath("/admin/themes");
  return { message: "Saved." };
}

// ---- Settings ----

export async function setRegistration(form: FormData) {
  const actor = await requireOwner();
  const v = String(form.get("registration"));
  if (v === "open" || v === "closed") await setSetting("registration", v);
  else await clearSetting("registration");
  await audit(actor, "set-registration", v);
  revalidatePath("/admin", "layout");
}

export async function setSyncPaused(form: FormData) {
  const actor = await requireOwner();
  const paused = form.get("paused") === "true";
  await setSetting("syncPaused", paused);
  await audit(actor, paused ? "pause-sync" : "resume-sync", null);
  revalidatePath("/admin", "layout");
}

// ---- Staff (owners only) ----

export async function appointAdminAction(_: AdminState, form: FormData): Promise<AdminState> {
  const actor = await requireOwner();
  const login = String(form.get("login") ?? "");
  try {
    await appointAdmin(actor, login);
  } catch (e) {
    return { error: (e as Error).message };
  }
  await audit(actor, "appoint-admin", login.trim().replace(/^@/, ""));
  return done("Appointed. They get admin access the next time they load a page.");
}

export async function removeAdminAction(form: FormData) {
  const actor = await requireOwner();
  const row = await removeAdmin(actor, Number(form.get("id")));
  if (row) await audit(actor, "remove-admin", row.login);
  revalidatePath("/admin/users");
}
