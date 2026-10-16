import { redirect } from "next/navigation";
import { currentSession } from "@/auth/session";
import { db } from "@/db/client";
import { projects } from "@/db/schema";
import { userClient } from "@/github/client";
import { config } from "@/lib/config";
import { registrationOpen } from "@/lib/settings";
import { PLATFORMS } from "@/lib/platforms";
import { ChevronRight } from "@/components/ui/icons";
import { Select } from "@/components/ui/select";
import { addProject } from "../actions";
import { ActionForm } from "../forms";
import { RepoPicker, type PickableRepo } from "../repo-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "Submit a project" };

/** Public repositories the user administers, most recently pushed first. */
async function adminRepos(token: string): Promise<PickableRepo[] | null> {
  try {
    const repos = await userClient(token).paginate("GET /user/repos", {
      affiliation: "owner,organization_member,collaborator",
      sort: "pushed",
      per_page: 100,
    });
    const registered = new Map(
      (await db().select({ owner: projects.owner, repo: projects.repo }).from(projects)).map((p) => [
        `${p.owner}/${p.repo}`.toLowerCase(),
        `${p.owner}/${p.repo}`,
      ]),
    );
    return repos
      .filter((r) => r.permissions?.admin && !r.private && !r.archived)
      .slice(0, 300)
      .map((r) => ({
        fullName: r.full_name,
        description: r.description,
        pushedAt: r.pushed_at ?? null,
        registered: registered.get(r.full_name.toLowerCase()) ?? null,
      }));
  } catch {
    return null;
  }
}

export default async function NewProject() {
  const session = await currentSession();
  if (!session) redirect("/login?next=/manage/new");
  const closed = !session.admin && !(await registrationOpen());
  const repos = closed ? null : await adminRepos(session.githubToken);
  const slug = config().GITHUB_APP_SLUG;
  const installLink = slug ? (
    <a href={`https://github.com/apps/${slug}/installations/new`} className="text-accent hover:underline">
      Install the {config().SITE_NAME} GitHub App
    </a>
  ) : null;

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-semibold tracking-tight">Submit a project</h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-2">
        Pick a public repository you administer. Its CI should upload objdiff&apos;s report as an artifact named{" "}
        <code className="rounded bg-code px-1.5 py-0.5 font-mono text-xs">{"<VERSION>_report"}</code>; dtk-template projects already do.
        Coming from decomp.dev? Your badge URLs keep working once you swap the domain.
      </p>

      {closed ? (
        <div className="panel mt-6 p-6 text-sm text-ink-2">Only site admins can add projects on this instance.</div>
      ) : (
        <>
          <section className="panel mt-6 p-6">
            <div className="mb-4 flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="font-semibold">Your repositories</h2>
              {installLink ? <span className="text-xs text-ink-3">Missing one? {installLink} on it.</span> : null}
            </div>
            {repos ? (
              repos.length ? (
                <RepoPicker repos={repos} action={addProject} />
              ) : (
                <p className="text-sm leading-relaxed text-ink-2">
                  Repositories appear here once the {config().SITE_NAME} GitHub App is installed on them (that also gives instant updates
                  and pull request comments). {installLink ?? "The App isn't configured on this instance yet."} Or enter a repository below.
                </p>
              )
            ) : (
              <p className="text-sm text-ink-2">
                GitHub didn&apos;t return your repositories just now. Enter the repository below instead.
              </p>
            )}
          </section>

          <details className="panel group mt-4 p-6">
            <summary className="flex cursor-pointer list-none items-center gap-2.5 font-semibold select-none [&::-webkit-details-marker]:hidden">
              <ChevronRight size={14} className="text-ink-3 transition-transform duration-200 group-open:rotate-90" />
              Enter a repository by name
            </summary>
            <div className="mt-4">
              <ActionForm action={addProject} submit="Add project">
                <label className="grid gap-1.5 text-sm">
                  Repository
                  <input name="repo" required placeholder="owner/repo or https://github.com/owner/repo" className="field" />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-sm">
                    Display name <span className="text-xs text-ink-3">optional</span>
                    <input name="name" placeholder="Ratchet & Clank (PAL)" className="field" />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    Platform
                    <Select
                      name="platform"
                      defaultValue=""
                      options={[
                        { value: "", label: "Not set" },
                        ...Object.entries(PLATFORMS)
                          .filter(([id]) => id !== "ps1")
                          .map(([id, name]) => ({ value: id, label: name })),
                      ]}
                    />
                  </label>
                </div>
              </ActionForm>
            </div>
          </details>
        </>
      )}
    </div>
  );
}
