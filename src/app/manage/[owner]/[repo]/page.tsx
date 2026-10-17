import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { canManage, currentSession } from "@/auth/session";
import { findProject, latestReport, projectVersions } from "@/db/store";
import { isSummary } from "@/report/functional";
import { loadGames } from "@/lib/game-data";
import { resolveKey } from "@/lib/games";
import type { NameOption } from "../../name-field";
import { GameFields } from "../../game-fields";
import { igdbEnabled } from "@/lib/igdb";
import { config } from "@/lib/config";
import { projectProblem, skippedRuns } from "@/lib/project-problems";
import { ProblemPanel } from "@/components/problem-panel";
import { PLATFORMS } from "@/lib/platforms";
import { listTokens } from "@/lib/tokens";
import { addPort, deleteToken, newToken, removePort, runAction, setImageUrl, updateProject, uploadHistory } from "../../actions";
import { ImageForm } from "../../image-form";
import { Select } from "@/components/ui/select";
import { ChevronRight } from "@/components/ui/icons";
import { ActionButtons, ActionForm, inputClass } from "../../forms";
import { LocalTime } from "@/components/local-time";
import { BUMP_COOLDOWN_HOURS, nextBump } from "@/lib/bump";
import { MAX_PORTS, PORT_PLATFORMS, PORT_STATUSES, portHost } from "@/lib/ports";
import { projectPorts } from "@/db/ports";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ owner: string; repo: string }>; searchParams: Promise<{ added?: string }> };

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="panel mt-5 p-6">
      <h2 className="mb-4 font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span>
        {label} {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

export default async function ManageProject({ params, searchParams }: Params) {
  const { owner, repo } = await params;
  const session = await currentSession();
  if (!session) redirect(`/login?next=/manage/${owner}/${repo}`);
  const project = await findProject(owner, repo);
  if (!project || !(await canManage(session, project))) notFound();
  const [problem, skipped] = await Promise.all([projectProblem(project), skippedRuns(project.id)]);
  const [versions, tokens, portList, names, { added }] = await Promise.all([
    projectVersions(project.id),
    listTokens(project.id),
    projectPorts(project.id),
    loadGames(),
    searchParams,
  ]);
  const shownVersion = project.defaultVersion ?? versions[0]?.version;
  const latest = shownVersion ? await latestReport(project.id, shownVersion) : undefined;
  const functional = latest?.functional ?? null;
  const gameOptions: NameOption[] = names.games.map((g) => ({ title: g.title, key: g.key, projectIds: g.projects.map((p) => p.id) }));
  const franchiseOptions: NameOption[] = names.franchises.map((f) => ({
    title: f.title,
    key: resolveKey(f.title, names.aliases.franchises),
    projectIds: f.games.flatMap((g) => g.projects.map((p) => p.id)),
  }));
  const site = config().PUBLIC_URL;
  const slug = config().GITHUB_APP_SLUG;
  const bound = (fn: typeof updateProject) => fn.bind(null, project.owner, project.repo);

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-baseline gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">{project.name}</h1>
        <Link href={`/${project.owner}/${project.repo}`} className="ml-auto text-sm text-accent">
          View page →
        </Link>
      </div>
      <p className="mt-1 text-sm text-ink-3">
        {project.owner}/{project.repo} ·{" "}
        {versions.length ? `${versions.length} version${versions.length > 1 ? "s" : ""}` : "no reports yet"}
        {project.lastPolledAt ? (
          <>
            {" · checked "}
            <LocalTime value={project.lastPolledAt} />
          </>
        ) : null}
      </p>
      {added ? (
        <p className="mt-3 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm">
          Added. ByteMatch is importing its decomp.dev history (if it had any) and reading its CI runs. This takes a minute or two; refresh
          to see progress.
        </p>
      ) : null}
      {problem ? (
        <div className="mt-5">
          <ProblemPanel problem={problem} />
        </div>
      ) : null}
      {skipped ? (
        <p className="mt-4 rounded-md border border-line bg-surface-2 px-3 py-2 text-sm text-ink-2">
          {skipped === 1 ? "1 CI run is" : `${skipped} CI runs are`} skipped because {skipped === 1 ? "its artifact" : "their artifacts"}{" "}
          had no usable report. ByteMatch doesn&apos;t retry them on its own, since a finished run never changes; once the workflow is
          fixed, new runs are read normally. To read these again (after changing the artifact pattern, say), use{" "}
          <span className="font-medium">Try skipped runs again</span> under Data.
        </p>
      ) : null}

      <Card title="Data">
        <ActionButtons
          action={runAction.bind(null, project.owner, project.repo)}
          buttons={[
            { value: "poll", label: "Check for new runs", hint: "Look for new successful CI runs now" },
            {
              value: "backfill",
              label: "Backfill",
              hint: "Read older CI runs whose artifacts have not expired (GitHub keeps them about 90 days)",
            },
            { value: "import", label: "Import from decomp.dev", hint: "Copy this project's history and latest report from decomp.dev" },
            {
              value: "reread",
              label: "Re-read latest run",
              hint: "Read the newest CI run again, e.g. after adding a functional list to its artifact",
            },
            ...(skipped
              ? [
                  {
                    value: "retry-skipped",
                    label: "Try skipped runs again",
                    hint: "Forget which runs had no usable report and read them again",
                  },
                ]
              : []),
          ]}
        />
        <p className="mt-3 text-xs text-ink-3">
          {project.installationId
            ? "The GitHub App is installed: new runs arrive instantly and pull requests get progress comments."
            : "Without the GitHub App, new runs are picked up every few minutes and pull requests get no comments."}
          {!project.installationId && slug ? (
            <>
              {" "}
              <a className="text-accent" href={`https://github.com/apps/${slug}/installations/new`}>
                Install the App
              </a>
            </>
          ) : null}
        </p>
        {functional ? (
          <p className={`mt-3 text-xs ${isSummary(functional) ? "text-ink-2" : "text-bad"}`}>
            {isSummary(functional) ? (
              <>
                Functional list ({shownVersion}): {functional.functions} function{functional.functions === 1 ? "" : "s"} shown as functional
                C, {functional.code_percent.toFixed(2)}% of code.
                {functional.already_matched
                  ? ` ${functional.already_matched} listed function${functional.already_matched === 1 ? " is" : "s are"} already matched and can come off the list.`
                  : ""}
                {functional.not_found ? ` ${functional.not_found} aren't in this version's report.` : ""}{" "}
                <Link href="/docs/getting-started#7-functional-c-optional" className="text-accent hover:underline">
                  About functional C
                </Link>
              </>
            ) : (
              <>The functional list in the latest report couldn&apos;t be read: {functional.error}</>
            )}
          </p>
        ) : null}
      </Card>

      <Card title="Recently updated">
        <p className="mb-3 text-sm text-ink-2">
          The project list puts projects whose matched code, functions or data last changed first, so commits that change no numbers (a
          tooling update across all your projects, say) don&apos;t move it. To announce other news, like a new tool or a playable build,
          bump it: it counts as updated now. One bump a day ({BUMP_COOLDOWN_HOURS} hours).
        </p>
        {nextBump(project.bumpedAt) ? (
          <p className="text-sm text-ink-3">
            Bumped <LocalTime value={project.bumpedAt!} />; the next bump is possible from <LocalTime value={nextBump(project.bumpedAt)!} />
            .
          </p>
        ) : (
          <ActionButtons
            action={runAction.bind(null, project.owner, project.repo)}
            buttons={[{ value: "bump", label: "Bump to the top", hint: "List the project as updated now" }]}
          />
        )}
      </Card>

      <Card title="History">
        <p className="mb-4 text-sm text-ink-2">
          Upload a history file to fill in progress from before ByteMatch tracked this project: the JSON decomp.dev served at{" "}
          <code className="font-mono text-xs break-all">
            decomp.dev/{project.owner}/{project.repo}.json?mode=history&amp;version=…
          </code>
          , one file per version. Commits that already have data are left alone, so uploading twice is harmless.{" "}
          <Link href="/docs/migrating-from-decomp-dev#4-keep-your-history" className="text-accent">
            How to save it
          </Link>
        </p>
        <ActionForm action={uploadHistory.bind(null, project.owner, project.repo)} submit="Upload history">
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-[12rem_minmax(0,1fr)]">
            <Field label="Version">
              <input
                name="version"
                required
                list="version-names"
                defaultValue={project.defaultVersion ?? versions[0]?.version ?? ""}
                placeholder="GLMJ01"
                className={inputClass}
                autoComplete="off"
              />
              <datalist id="version-names">
                {versions.map((v) => (
                  <option key={v.version} value={v.version} />
                ))}
              </datalist>
            </Field>
            <Field label="History file" hint=".json or .json.gz">
              <input
                type="file"
                name="file"
                required
                accept=".json,.gz,application/json,application/gzip"
                className={`${inputClass} min-w-0 file:mr-3 file:rounded-md file:border-0 file:bg-surface-3 file:px-2.5 file:py-1 file:text-sm file:text-ink`}
              />
            </Field>
          </div>
        </ActionForm>
        {versions.length ? (
          <p className="mt-4 text-xs text-ink-3">
            Download what ByteMatch has:{" "}
            {versions.map((v, i) => (
              <span key={v.version}>
                {i ? ", " : ""}
                <a
                  className="text-accent"
                  href={`/${project.owner}/${project.repo}.json?mode=history&version=${encodeURIComponent(v.version)}`}
                  download={`${project.repo}-${v.version}-history.json`}
                >
                  {v.version}
                </a>
              </span>
            ))}
          </p>
        ) : null}
      </Card>

      <Card title="Settings">
        <ActionForm action={bound(updateProject)} submit="Save">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Display name">
              <input name="name" defaultValue={project.name} className={inputClass} />
            </Field>
            <Field label="Short name" hint="optional">
              <input name="shortName" defaultValue={project.shortName ?? ""} className={inputClass} />
            </Field>
            <Field label="Platform">
              <Select
                name="platform"
                defaultValue={project.platform ?? ""}
                options={[
                  { value: "", label: "—" },
                  ...Object.entries(PLATFORMS).map(([id, name]) => ({ value: id, label: `${name} (${id})` })),
                ]}
              />
            </Field>
            <Field label="Default version">
              <Select
                name="defaultVersion"
                defaultValue={project.defaultVersion ?? ""}
                options={[{ value: "", label: "Most recently updated" }, ...versions.map((v) => ({ value: v.version, label: v.version }))]}
              />
            </Field>
            <Field label="Default branch" hint="runs on this branch are tracked">
              <input name="defaultBranch" defaultValue={project.defaultBranch} className={inputClass} />
            </Field>
            <Field label="Default category" hint="optional category id for badges">
              <input name="defaultCategory" defaultValue={project.defaultCategory ?? ""} className={inputClass} />
            </Field>
          </div>
          <GameFields
            game={project.game ?? ""}
            franchise={project.franchise ?? ""}
            year={project.releaseYear ? String(project.releaseYear) : ""}
            igdbId={project.igdbId}
            igdb={igdbEnabled()}
            gameOptions={gameOptions}
            franchiseOptions={franchiseOptions}
            gameAliases={[...names.aliases.games]}
            franchiseAliases={[...names.aliases.franchises]}
            projectId={project.id}
            inputClass={inputClass}
          />
          {versions.length > 1 ? (
            <details className="rounded-lg border border-line px-4 py-3" open={Object.keys(project.versionGames ?? {}).length > 0}>
              <summary className="cursor-pointer text-sm select-none">Different games per version</summary>
              <p className="mt-2 mb-3 text-xs text-ink-3">
                For a repository whose versions are different games (one engine, two games): give a version its own game, and it gets its
                own place on that game&apos;s page. Leave a version empty to keep it under the game above.
              </p>
              <div className="grid gap-2">
                {versions.map((v, i) => {
                  const g = project.versionGames?.[v.version];
                  return (
                    <div key={v.version} className="grid items-center gap-2 sm:grid-cols-[8rem_minmax(0,1fr)_minmax(0,1fr)_6rem]">
                      <input type="hidden" name={`vg_version_${i}`} value={v.version} />
                      <span className="truncate font-mono text-xs text-ink-2" title={v.version}>
                        {v.version}
                      </span>
                      <input
                        name={`vg_game_${i}`}
                        defaultValue={g?.game ?? ""}
                        list="game-names"
                        placeholder={project.game ?? "Game"}
                        aria-label={`Game for ${v.version}`}
                        className={inputClass}
                        autoComplete="off"
                      />
                      <input
                        name={`vg_franchise_${i}`}
                        defaultValue={g?.franchise ?? ""}
                        list="franchise-names"
                        placeholder={project.franchise ?? "Franchise"}
                        aria-label={`Franchise for ${v.version}`}
                        className={inputClass}
                        autoComplete="off"
                      />
                      <input
                        name={`vg_year_${i}`}
                        defaultValue={g?.releaseYear ?? ""}
                        inputMode="numeric"
                        placeholder="Year"
                        aria-label={`Release year for ${v.version}`}
                        className={inputClass}
                      />
                    </div>
                  );
                })}
              </div>
            </details>
          ) : null}
          <Field label="Discord invite" hint="optional, shown on the project page">
            <input
              name="discordUrl"
              defaultValue={project.discordUrl ?? ""}
              placeholder="https://discord.gg/…"
              className={inputClass}
              inputMode="url"
            />
          </Field>
          <Field label="Description" hint="optional">
            <input name="description" defaultValue={project.description ?? ""} className={inputClass} />
          </Field>
          <details className="group rounded-xl border border-line bg-surface-2/50 px-4 py-3 text-sm">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-ink-2 select-none hover:text-ink [&::-webkit-details-marker]:hidden">
              <ChevronRight size={13} className="text-ink-3 transition-transform duration-200 group-open:rotate-90" />
              Advanced
            </summary>
            <div className="mt-3 grid gap-3">
              <Field label="Artifact name pattern" hint="regex; the version group names the game version">
                <input name="artifactPattern" defaultValue={project.artifactPattern} className={`${inputClass} font-mono`} />
              </Field>
              <Field label="Workflow file" hint="e.g. build.yml; empty reads every workflow">
                <input name="workflow" defaultValue={project.workflow ?? ""} className={inputClass} />
              </Field>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  className="size-4 accent-[var(--accent-strong)]"
                  name="splitVersions"
                  defaultChecked={project.splitVersions}
                />{" "}
                One report holds every version (top-level categories are versions)
              </label>
            </div>
          </details>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent-strong)]" name="prComments" defaultChecked={project.prComments} />{" "}
            Comment on pull requests (needs the GitHub App)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="size-4 accent-[var(--accent-strong)]" name="enabled" defaultChecked={project.enabled} />{" "}
            Enabled (public page, badges and ingestion)
          </label>
        </ActionForm>
      </Card>

      <Card title="Icon and cover">
        <div className="grid gap-8 lg:grid-cols-[14rem_minmax(0,1fr)]">
          <ImageForm
            shape="square"
            current={project.iconUrl}
            name={project.name}
            action={setImageUrl.bind(null, project.owner, project.repo, "icon")}
          />
          <ImageForm
            shape="wide"
            current={project.imageUrl}
            position={project.coverPosition}
            name={project.name}
            action={setImageUrl.bind(null, project.owner, project.repo, "cover")}
          />
        </div>
      </Card>

      <Card title="Ports">
        <p className="mb-4 text-sm text-ink-2">
          Games built from this decompilation for other systems, like a native PC version. They&apos;re listed on the project&apos;s page,
          its game&apos;s page and{" "}
          <Link href="/ports" className="text-accent hover:underline">
            Ports
          </Link>
          , linking to wherever the port lives; ByteMatch hosts nothing. Up to {MAX_PORTS}.
        </p>
        {portList.length ? (
          <ul className="mb-4 divide-y divide-line text-sm">
            {portList.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <a href={p.url} rel="noopener noreferrer nofollow" target="_blank" className="font-medium hover:underline">
                  {p.name}
                </a>
                <span className="text-xs text-ink-3">
                  {PORT_STATUSES[p.status as keyof typeof PORT_STATUSES]?.label ?? p.status} ·{" "}
                  {p.platforms.map((x) => PORT_PLATFORMS[x as keyof typeof PORT_PLATFORMS] ?? x).join(", ")}
                  {p.version ? ` · from ${p.version}` : ""} · {portHost(p.url)}
                </span>
                <form action={removePort.bind(null, project.owner, project.repo)} className="ml-auto">
                  <input type="hidden" name="id" value={p.id} />
                  <button className="text-xs text-bad">Remove</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        {portList.length < MAX_PORTS ? (
          <ActionForm action={addPort.bind(null, project.owner, project.repo)} submit="Add port" className="grid gap-4" resetOnSuccess>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Name" hint="e.g. OpenRAC">
                <input name="name" required maxLength={80} className={inputClass} />
              </Field>
              <Field label="Link" hint="repository, releases or website">
                <input name="url" required type="url" placeholder="https://github.com/…" className={inputClass} />
              </Field>
              <Field label="How far along">
                <Select
                  name="status"
                  defaultValue="progress"
                  options={Object.entries(PORT_STATUSES).map(([value, s]) => ({ value, label: `${s.label}: ${s.hint.toLowerCase()}` }))}
                />
              </Field>
              {versions.length > 1 ? (
                <Field label="Built from" hint="optional">
                  <Select
                    name="version"
                    defaultValue=""
                    options={[{ value: "", label: "Any version" }, ...versions.map((v) => ({ value: v.version, label: v.version }))]}
                  />
                </Field>
              ) : null}
            </div>
            <fieldset className="grid gap-1.5 text-sm">
              <legend className="mb-1.5">Runs on</legend>
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {Object.entries(PORT_PLATFORMS).map(([value, label]) => (
                  <label key={value} className="flex items-center gap-2">
                    <input type="checkbox" name="platforms" value={value} className="size-4 accent-[var(--accent-strong)]" />
                    {label}
                  </label>
                ))}
              </div>
            </fieldset>
            <Field label="Note" hint="optional, one line">
              <input name="note" maxLength={200} placeholder="e.g. needs your own copy of the game" className={inputClass} />
            </Field>
          </ActionForm>
        ) : null}
      </Card>

      <Card title="Upload tokens">
        <p className="mb-4 text-sm text-ink-2">
          For CI that can&apos;t upload GitHub artifacts:{" "}
          <code className="font-mono text-xs break-all">
            POST {site}/api/v1/projects/{project.owner}/{project.repo}/reports?version=…&commit=…
          </code>
        </p>
        {tokens.length ? (
          <ul className="mb-4 divide-y divide-line text-sm">
            {tokens.map((t) => (
              <li key={t.id} className="flex items-center gap-3 py-2">
                <span className="font-mono text-xs">{t.prefix}…</span>
                <span>{t.name}</span>
                <span className="text-xs text-ink-3">
                  {t.lastUsedAt ? (
                    <>
                      used <LocalTime value={t.lastUsedAt} />
                    </>
                  ) : (
                    "never used"
                  )}
                </span>
                <form action={deleteToken.bind(null, project.owner, project.repo)} className="ml-auto">
                  <input type="hidden" name="id" value={t.id} />
                  <button className="text-xs text-bad">Revoke</button>
                </form>
              </li>
            ))}
          </ul>
        ) : null}
        <ActionForm action={newToken.bind(null, project.owner, project.repo)} submit="Create token" className="grid gap-3">
          <Field label="Name" hint="e.g. gitlab-ci">
            <input name="name" className={inputClass} />
          </Field>
        </ActionForm>
      </Card>
    </div>
  );
}
