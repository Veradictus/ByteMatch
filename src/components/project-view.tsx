import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Project } from "@/db/schema";
import { findProject, hasImportedHistory, history, latestFullReport, loadReport } from "@/db/store";
import { breadcrumbJsonLd, projectCanonicalPath, projectJsonLd, projectSeoInput } from "@/lib/seo";
import { JsonLd } from "./json-ld";
import { config } from "@/lib/config";
import { slugify } from "@/lib/games";
import { coverStyle } from "@/lib/images";
import { portGame } from "@/lib/ports";
import { projectPorts } from "@/db/ports";
import { PortList } from "./port-list";
import { CategoryList, CategorySort } from "./category-list";
import { platformName } from "@/lib/platforms";
import { publicError } from "@/lib/errors";
import { HIDE_AFTER_DAYS, hiddenFromPublic, unreachable } from "@/lib/visibility";
import { chosenTheme } from "@/lib/theme-server";
import { canManage, currentSession } from "@/auth/session";
import { projectProblem, type ProjectProblem } from "@/lib/project-problems";
import { ProblemPanel } from "./problem-panel";
import { NotFound, functionalJson, repoUrl, resolve } from "@/lib/project-data";
import { formatBytes } from "@/report/measures";
import { CopyField } from "./copy-field";
import { ExternalImage } from "./external-image";
import { ChevronRight, DiscordMark, GitHubMark } from "./ui/icons";
import { VersionSelect } from "./version-select";
import { HistoryChart, type HistoryPoint } from "./history-chart";
import { UnitMap, type MapUnit } from "./unit-map";
import { UnitTable, type UnitRow } from "./unit-table";
import { LocalTime } from "@/components/local-time";

const fmt = new Intl.NumberFormat("en-US");

function Stat({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="px-1 py-1">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 font-mono text-xl font-semibold">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-ink-2">{detail}</div> : null}
    </div>
  );
}

/** A titled panel in the right-hand column (stacked under the grid on narrow screens). */
function Side({
  title,
  aside,
  action,
  children,
}: {
  title: string;
  aside?: React.ReactNode;
  /** A control at the heading's end (a sort order, say). */
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const heading = (
    <h2 className="flex items-baseline gap-2 text-sm font-semibold">
      {title}
      {aside ? <span className="text-xs font-normal text-ink-3">{aside}</span> : null}
    </h2>
  );
  return (
    <section className="panel p-5">
      {action ? (
        <div className="mb-3.5 flex items-center justify-between gap-3">
          {heading}
          {action}
        </div>
      ) : (
        <div className="mb-3.5">{heading}</div>
      )}
      {children}
    </section>
  );
}

/** Extra information, closed until asked for. */
function More({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <details className="panel group overflow-hidden [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 text-sm select-none hover:bg-surface-2/60">
        <ChevronRight size={14} className="text-ink-3 transition-transform duration-200 ease-out group-open:rotate-90" />
        <span className="font-medium text-ink">{title}</span>
        {aside ? <span className="text-xs text-ink-3">{aside}</span> : null}
      </summary>
      <div className="border-t border-line px-5 py-5">{children}</div>
    </details>
  );
}

/** The project's sync problem, explained, if the viewer maintains it; the public get a one-line summary. */
async function maintainerProblem(project: Project): Promise<ProjectProblem | null> {
  if (!project.lastError) return null;
  const session = await currentSession().catch(() => null);
  if (!session || !(await canManage(session, project))) return null;
  return projectProblem(project);
}

function Syncing({ project, problem }: { project: Project; problem: ProjectProblem | null }) {
  return (
    <div className="mx-auto max-w-2xl">
      <section className="panel p-7">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">{project.name}</h1>
        <div className="mt-1 text-sm text-ink-3">
          <a href={repoUrl(project)} className="hover:text-ink">
            {project.owner}/{project.repo}
          </a>
          {project.platform ? ` · ${platformName(project.platform)}` : ""}
        </div>
        <p className="mt-6 text-sm leading-relaxed text-ink-2">
          No progress reports yet. ByteMatch imports the project&apos;s decomp.dev history, if it had one, and reads its CI runs on{" "}
          <code className="rounded bg-code px-1.5 py-0.5 font-mono text-xs">{project.defaultBranch}</code> for{" "}
          <code className="rounded bg-code px-1.5 py-0.5 font-mono text-xs">{"<VERSION>_report"}</code> artifacts. This usually takes a
          minute or two.
        </p>
        {problem ? (
          <div className="mt-4">
            <ProblemPanel problem={problem} manageHref={`/manage/${project.owner}/${project.repo}`} />
          </div>
        ) : project.lastError ? (
          <p className="mt-4 rounded-xl border border-bad/40 bg-bad/5 px-4 py-3 text-sm text-bad">{publicError(project.lastError)}</p>
        ) : project.lastPolledAt ? (
          <p className="mt-4 text-sm text-ink-3">
            Last checked <LocalTime value={project.lastPolledAt} />: no report artifacts found yet.
          </p>
        ) : null}
      </section>
    </div>
  );
}

/** The code bar: fully linked (solid), matched (striped), and the rest of the fuzzy match (faint stripes). */
const fmtInt = new Intl.NumberFormat("en-US");

interface Layer {
  key: string;
  label: string;
  /** Where the layer starts and how wide it is, in percent of the bar. */
  from: number;
  width: number;
  background: string;
  /** The exact figure shown on hover. */
  detail: string;
}

/**
 * One progress section (Code or Data): fully linked (solid), matched (striped) and, for code, the
 * rest of the fuzzy match (faint stripes). Hovering or focusing a layer shows its exact figure;
 * hit areas sit above the bar so the tooltip isn't clipped and thin layers stay easy to point at.
 */
function ProgressSection({
  label,
  total,
  linkedBytes,
  matchedBytes,
  linked,
  matched,
  fuzzy,
  tone = "code",
  tall = false,
  functional = null,
}: {
  /** Functional C under the bar (code only), when the project lists it. */
  functional?: Functional | null;
  /** Code is green; data is blue, so the two sections read apart at a glance. */
  tone?: "code" | "data";
  /** The Directory layout's taller, square bar. */
  tall?: boolean;
  label: string;
  total: number;
  linkedBytes: number;
  matchedBytes: number;
  linked: number;
  matched: number;
  fuzzy?: number;
}) {
  const stripes = (a: string, b: string) => `repeating-linear-gradient(135deg, ${a} 0 7px, ${b} 7px 14px)`;
  const solid = tone === "data" ? "var(--series-1)" : "var(--done)";
  const done = tone === "data" ? stripes("var(--series-1)", "var(--series-1-deep)") : stripes("var(--done)", "var(--done-deep)");
  const faint = stripes("var(--line-strong)", "color-mix(in srgb, var(--line) 50%, var(--line-strong))");
  const of = (bytes: number) => `${fmtInt.format(Math.round(bytes))} of ${fmtInt.format(total)} bytes (${formatBytes(Math.round(bytes))})`;
  const l = Math.min(100, linked);
  const mt = Math.max(0, Math.min(100, matched) - l);
  const fz = fuzzy === undefined ? 0 : Math.max(0, Math.min(100, fuzzy) - l - mt);
  const layers: Layer[] = [
    {
      key: "linked",
      label: "Fully linked",
      from: 0,
      width: l,
      background: solid,
      detail: `${linked.toFixed(2)}% · ${of(linkedBytes)}`,
    },
    { key: "matched", label: "Matched", from: l, width: mt, background: done, detail: `${matched.toFixed(2)}% · ${of(matchedBytes)}` },
    ...(fuzzy === undefined
      ? []
      : [
          {
            key: "fuzzy",
            label: "Fuzzy match",
            from: l + mt,
            width: fz,
            background: faint,
            detail: `${fuzzy.toFixed(2)}% · ≈${of((fuzzy / 100) * total)}, counting partly matched code`,
          },
        ]),
  ];

  // Centred over its layer, except near the bar's ends, where it lines up with that end instead so
  // it never runs off the panel or the screen. Above everything else on the page.
  const tip = (layer: Layer, inLegend = false) => {
    const mid = layer.from + layer.width / 2;
    // Legend entries sit at the left, so their labels always start at the entry.
    const place = inLegend || mid < 20 ? "left-0" : mid > 80 ? "right-0" : "left-1/2 -translate-x-1/2";
    return (
      <span
        role="tooltip"
        className={`pointer-events-none absolute bottom-full ${place} z-50 mb-2 w-max max-w-72 rounded-lg border border-line-strong bg-surface-2 px-2.5 py-1.5 text-xs text-ink opacity-0 shadow-[0_8px_24px_-8px_rgb(0_0_0/0.7)] transition-opacity duration-100 group-hover:opacity-100 group-focus-visible:opacity-100`}
      >
        <span className="font-medium">{layer.label}</span>
        <span className="block font-mono text-ink-2">{layer.detail}</span>
      </span>
    );
  };

  return (
    <div>
      <div className="mb-2 text-sm text-ink-2">
        {label} <span className="text-ink-3">({formatBytes(total)})</span>
      </div>
      <div className="relative">
        <div className={`flex w-full overflow-hidden bg-track ${tall ? "h-9 rounded-[2px]" : "h-4 rounded-full"}`} aria-hidden>
          {layers.map((layer) => (
            <div key={layer.key} className="h-full" style={{ width: `${layer.width}%`, background: layer.background }} />
          ))}
        </div>
        {layers
          .filter((layer) => layer.width > 0)
          .map((layer) => (
            <span
              key={layer.key}
              tabIndex={0}
              aria-label={`${label}, ${layer.label}: ${layer.detail}`}
              className={`group absolute -top-1 cursor-default ${tall ? "h-11" : "h-6"} rounded outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)]`}
              // At least 10px wide so thin layers can be pointed at; centred on the layer.
              style={{
                left: `calc(${layer.from + layer.width / 2}% - max(5px, ${layer.width / 2}%))`,
                width: `max(10px, ${layer.width}%)`,
              }}
            >
              {tip(layer)}
            </span>
          ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-3">
        {layers.map((layer) => (
          <span key={layer.key} className="group relative flex cursor-default items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: layer.background }} />
            {layer.label} {layer.key === "linked" ? linked.toFixed(2) : layer.key === "matched" ? matched.toFixed(2) : fuzzy?.toFixed(2)}%
            {tip(layer, true)}
          </span>
        ))}
      </div>
      {functional && functional.functions > 0 ? <FunctionalLine functional={functional} matched={matched} /> : null}
    </div>
  );
}

type Functional = NonNullable<ReturnType<typeof functionalJson>>;

/**
 * Functional C, on its own line under the Code bar and never inside it: code the project has C
 * for that does what the original does without matching its bytes. The faint part is the matched
 * code it continues from, so together they show how much of the game has C at all.
 */
function FunctionalLine({ functional: f, matched }: { functional: Functional; matched: number }) {
  const covered = Math.min(100, matched + f.code_percent);
  const conf = f.by_confidence
    ? (["high", "medium", "low", "unrated"] as const)
        .filter((c) => f.by_confidence![c].functions > 0)
        .map((c) => `${fmtInt.format(f.by_confidence![c].functions)} ${c}`)
    : [];
  const summary = `Functional C: ${f.code_percent.toFixed(2)}% of code, ${fmtInt.format(f.functions)} functions. Not counted as matched; with matched code, ${covered.toFixed(2)}% of the code has C.`;
  return (
    <div className="mt-3">
      <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-xs">
        <span className="text-ink-2">
          Functional C <span className="text-ink-3">· port only, not counted as matched</span>
        </span>
        <span className="font-mono text-ink-3">
          {f.code_percent.toFixed(2)}% of code · {fmtInt.format(f.functions)} functions
        </span>
      </div>
      <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-track" role="img" aria-label={summary} title={summary}>
        <span
          className="h-full"
          style={{ width: `${Math.min(100, matched)}%`, background: "color-mix(in srgb, var(--done) 30%, var(--track))" }}
        />
        <span
          className="h-full"
          style={{
            width: `${Math.max(0, covered - Math.min(100, matched))}%`,
            background: "repeating-linear-gradient(135deg, var(--functional) 0 4px, transparent 4px 7px)",
          }}
        />
      </div>
      <div className="mt-1 text-xs text-ink-3">
        With matched code, {covered.toFixed(2)}% of the code has C{conf.length ? ` · confidence: ${conf.join(", ")}` : ""}.
      </div>
    </div>
  );
}

/** What the unit map keeps in the URL, carried along when moving between commits. */
const KEPT_PARAMS = new Set(["unit", "layout", "category"]);

export async function ProjectView({
  owner,
  repo,
  version,
  commit,
  view = {},
}: {
  owner: string;
  repo: string;
  version?: string;
  commit?: string;
  /** The page's other query parameters (the open unit, the map's layout and category), kept when moving between commits. */
  view?: Record<string, string | string[] | undefined>;
}) {
  let r;
  try {
    r = await resolve(owner, repo, version ? decodeURIComponent(version) : undefined, null, commit);
  } catch (e) {
    if (!(e instanceof NotFound)) throw e;
    // A registered project whose first reports have not arrived yet: say so instead of 404.
    const pending = version || commit ? undefined : await findProject(owner, repo);
    if (!pending) notFound();
    // Hidden from the public, but its maintainers still need to see why.
    const problem = await maintainerProblem(pending);
    if (!problem && hiddenFromPublic(pending, false)) notFound();
    return <Syncing project={pending} problem={problem} />;
  }
  const { project, measures: m, row } = r;
  const base = `/${project.owner}/${project.repo}`;
  const pagePath = version ? `${base}/${encodeURIComponent(r.version)}` : base;
  const [rows, latestFull, imported, portRows] = await Promise.all([
    history(project.id, r.version),
    commit ? Promise.resolve(undefined) : latestFullReport(project.id, r.version),
    hasImportedHistory(project.id),
    projectPorts(project.id),
  ]);
  // A port of another game this repository holds (see versionGames) belongs on that game's pages.
  const shownPorts = portRows.filter((p) => portGame(p, project) === portGame({ version: r.version }, project));
  // A past commit shows its own units (if its full report is stored); the latest view shows the newest stored breakdown.
  const unitsRow = commit ? (row.blobId ? row : undefined) : latestFull;
  const report = unitsRow ? await loadReport(unitsRow) : null;

  const at = rows.findIndex((h) => h.commitSha === row.commitSha);
  const older = at > 0 ? rows[at - 1] : undefined;
  const newer = at >= 0 && at < rows.length - 1 ? rows[at + 1] : undefined;
  const kept = Object.entries(view).filter((e): e is [string, string] => KEPT_PARAMS.has(e[0]) && typeof e[1] === "string");
  const commitHref = (sha?: string) => {
    const qs = new URLSearchParams(kept);
    if (sha && sha !== rows.at(-1)?.commitSha) qs.set("commit", sha.slice(0, 12));
    const s = qs.toString();
    return s ? `${pagePath}?${s}` : pagePath;
  };

  const points: HistoryPoint[] = rows.map((h) => ({
    t: h.commitTimestamp.getTime(),
    code: h.measures.matched_code_percent,
    functions: h.measures.matched_functions_percent,
    sha: h.commitSha,
    message: h.commitMessage,
    matchedFunctions: h.measures.matched_functions,
    totalFunctions: h.measures.total_functions,
  }));
  const units: UnitRow[] = (report?.units ?? []).map((u) => ({
    name: u.name,
    totalCode: u.measures.total_code,
    matchedCodePercent: u.measures.matched_code_percent,
    fuzzy: u.measures.fuzzy_match_percent,
    matchedFunctions: u.measures.matched_functions,
    totalFunctions: u.measures.total_functions,
    complete: !!u.metadata?.complete,
  }));
  const mapUnits: MapUnit[] = (report?.units ?? []).map((u) => ({
    name: u.name,
    totalCode: u.measures.total_code,
    matchedCodePercent: u.measures.matched_code_percent,
    completeCodePercent: u.measures.complete_code_percent ?? 0,
    fuzzy: u.measures.fuzzy_match_percent ?? 0,
    matchedFunctions: u.measures.matched_functions,
    totalFunctions: u.measures.total_functions,
    categories: u.metadata?.progress_categories ?? [],
  }));
  const recent = rows.slice(-15).reverse();
  const previous = new Map(rows.map((h, i) => [h.commitSha, rows[i - 1]?.measures]));
  const site = config().PUBLIC_URL;
  const versionPath = version ? `/${encodeURIComponent(r.version)}` : "";
  // A version can be a different game from the rest of the project (one repository, two games).
  const gameName = project.versionGames?.[r.version]?.game || project.game;
  const gameSlug = gameName ? slugify(gameName) : "";
  const navBtn = "btn btn-ghost h-9 flex-1 px-3 text-sm";
  const navOff = "btn h-9 flex-1 cursor-not-allowed border border-line px-3 text-sm text-ink-3 opacity-50";
  const directory = (await chosenTheme()).style.layout === "directory";
  const problem = await maintainerProblem(project);

  return (
    <div className="report-page grid grid-cols-[minmax(0,1fr)] gap-5">
      <JsonLd data={projectJsonLd(projectSeoInput(r, { versionInUrl: !!version, importedFromDecompDev: imported }))} />
      <JsonLd
        data={breadcrumbJsonLd([
          ...(gameSlug && gameName
            ? [
                { name: "Games", path: "/games" },
                { name: gameName, path: `/games/${gameSlug}` },
              ]
            : []),
          { name: project.name, path: projectCanonicalPath(projectSeoInput(r, { versionInUrl: !!version })) },
        ])}
      />

      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        {gameSlug ? (
          <Link href={`/games/${gameSlug}`} className="max-w-[40vw] truncate text-ink-3 hover:text-ink">
            {gameName}
          </Link>
        ) : (
          <Link href="/" className="text-ink-3 hover:text-ink">
            Projects
          </Link>
        )}
        <ChevronRight size={12} className="text-ink-3" />
        <Link href={base} className="max-w-[60vw] truncate font-medium text-ink hover:underline">
          {project.name}
        </Link>
        <ChevronRight size={12} className="text-ink-3" />
        {r.versions.length > 1 ? (
          <VersionSelect base={base} versions={r.versions} current={r.version} defaultVersion={project.defaultVersion ?? r.versions[0]} />
        ) : (
          <span className="font-mono text-xs text-ink-2">{r.version}</span>
        )}
        {project.discordUrl ? (
          <a href={project.discordUrl} rel="noopener noreferrer" target="_blank" className="btn btn-ghost ml-auto h-9 px-3 text-sm">
            <DiscordMark size={14} />
            Discord
          </a>
        ) : null}
        <a href={repoUrl(project)} className={`btn btn-ghost h-9 px-3 text-sm ${project.discordUrl ? "" : "ml-auto"}`}>
          <GitHubMark size={14} />
          Repository
        </a>
      </nav>

      {problem ? (
        <ProblemPanel problem={problem} manageHref={`/manage/${project.owner}/${project.repo}`} />
      ) : unreachable(project) ? (
        <p className="rounded-xl border border-warn/40 bg-warn/5 px-4 py-3 text-sm text-ink-2">
          ByteMatch can&apos;t reach this project&apos;s repository
          {project.errorSince ? (
            <>
              {" "}
              since <LocalTime value={project.errorSince} />
            </>
          ) : null}
          , so this is the last progress it read. If the repository stays private or gone, the project leaves the site after{" "}
          {HIDE_AFTER_DAYS} days; it comes back on its own once the repository can be read again.
        </p>
      ) : null}

      <div className={`grid grid-cols-[minmax(0,1fr)] items-start gap-5 ${directory ? "" : "xl:grid-cols-[minmax(0,1fr)_23rem]"}`}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-5">
          {/* Not overflow-hidden: the bar's hover labels must be able to rise above the panel. */}
          <section className={`panel ${directory ? "report-summary" : ""}`}>
            {project.imageUrl ? (
              <ExternalImage
                src={project.imageUrl}
                style={coverStyle(project.coverPosition)}
                className="aspect-[3/1] max-h-56 w-full rounded-t-[calc(var(--radius-panel)-1px)] border-b border-line object-cover"
              />
            ) : null}
            <div className="p-6 sm:p-7">
              {directory ? (
                <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-5">
                  <div className="flex min-w-0 items-center gap-4">
                    {project.iconUrl ? (
                      <ExternalImage src={project.iconUrl} className="size-14 shrink-0 rounded-lg border border-line object-cover" />
                    ) : null}
                    <div className="min-w-0">
                      <p className="directory-kicker">Progress report</p>
                      <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{project.name}</h1>
                      <p className="mt-2 text-sm text-ink-3">
                        {project.platform ? `${platformName(project.platform)} / ` : ""}
                        {r.version}
                      </p>
                    </div>
                  </div>
                  <div className="grid gap-1 sm:text-right">
                    <strong className="big-figure text-4xl leading-none sm:text-5xl">
                      {m.matched_code_percent.toFixed(2)}
                      <small>%</small>
                    </strong>
                    <span className="text-xs text-ink-3">code matched</span>
                    <span className="text-xs text-ink-3">{m.complete_code_percent.toFixed(2)}% fully linked</span>
                  </div>
                </div>
              ) : (
                <>
                  <div className="flex items-start gap-4">
                    {project.iconUrl ? (
                      <ExternalImage
                        src={project.iconUrl}
                        className="size-14 shrink-0 rounded-xl border border-line object-cover sm:size-16"
                      />
                    ) : null}
                    <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">
                      {project.name} is {m.matched_code_percent.toFixed(2)}% decompiled
                    </h1>
                  </div>
                  <p className="mt-1 text-base font-medium text-ink-3">
                    {m.complete_code_percent.toFixed(2)}% fully linked
                    {project.platform ? <span className="font-normal"> · {platformName(project.platform)}</span> : null}
                  </p>
                </>
              )}

              <div className={`mt-6 grid gap-5 ${directory && m.total_data > 0 ? "lg:grid-cols-2" : ""}`}>
                <ProgressSection
                  tall={directory}
                  label="Code"
                  total={m.total_code}
                  linkedBytes={m.complete_code}
                  matchedBytes={m.matched_code}
                  linked={m.complete_code_percent}
                  matched={m.matched_code_percent}
                  fuzzy={m.fuzzy_match_percent}
                  functional={functionalJson(r)}
                />
                {m.total_data > 0 ? (
                  <ProgressSection
                    tall={directory}
                    label="Data"
                    tone="data"
                    total={m.total_data}
                    linkedBytes={m.complete_data}
                    matchedBytes={m.matched_data}
                    linked={m.complete_data_percent}
                    matched={m.matched_data_percent}
                  />
                ) : null}
              </div>

              <div className="mt-6 border-t border-line pt-5">
                <div className="mb-3 truncate font-mono text-[13px] text-ink-2">
                  <a href={`${repoUrl(project)}/commit/${row.commitSha}`} className="text-accent hover:underline">
                    {row.commitSha.slice(0, 7)}
                  </a>{" "}
                  <span className="text-ink-3">|</span> {row.commitMessage?.split("\n")[0] ?? ""}
                  <span className="text-ink-3">
                    {" · "}
                    <LocalTime value={row.commitTimestamp} />
                  </span>
                </div>
                <div className="flex gap-2">
                  {older ? (
                    <Link href={commitHref(older.commitSha)} className={navBtn} scroll={false}>
                      <ChevronRight size={14} className="rotate-180" />
                      Previous
                    </Link>
                  ) : (
                    <span className={navOff} aria-disabled>
                      <ChevronRight size={14} className="rotate-180" />
                      Previous
                    </span>
                  )}
                  {newer ? (
                    <Link href={commitHref(newer.commitSha)} className={navBtn} scroll={false}>
                      Next
                      <ChevronRight size={14} />
                    </Link>
                  ) : (
                    <span className={navOff} aria-disabled>
                      Next
                      <ChevronRight size={14} />
                    </span>
                  )}
                  {commit ? (
                    <Link href={commitHref()} className="btn btn-primary h-9 flex-1 px-3 text-sm" scroll={false}>
                      Latest
                    </Link>
                  ) : (
                    <span className="btn h-9 flex-1 border border-line bg-surface-2 px-3 text-sm text-ink-2" aria-current="true">
                      Latest
                    </span>
                  )}
                </div>
              </div>
            </div>
          </section>

          <section className="panel p-5 sm:p-6">
            {report ? (
              <Suspense fallback={<div className="h-[clamp(360px,calc(100vh-360px),720px)]" />}>
                <UnitMap
                  units={mapUnits}
                  categories={row.categories.map((c) => ({ id: c.id, name: c.name }))}
                  owner={project.owner}
                  repo={project.repo}
                  version={r.version}
                  commit={commit ? row.commitSha : null}
                />
              </Suspense>
            ) : (
              <p className="py-10 text-center text-sm text-ink-3">
                {commit
                  ? "No unit breakdown is stored for this commit (it came from decomp.dev's history, which keeps totals only)."
                  : "No unit breakdown stored for this version yet."}
              </p>
            )}
          </section>

          {report ? (
            <More title="Unit list" aside={`${fmt.format(units.length)} units`}>
              <UnitTable units={units} owner={project.owner} repo={project.repo} version={r.version} />
            </More>
          ) : null}
        </div>

        <aside
          className={`grid grid-cols-[minmax(0,1fr)] gap-4 ${directory ? "items-start lg:grid-cols-2" : "xl:sticky xl:top-20"}`}
          aria-label="Project details"
        >
          <Side title="Details">
            <div className="grid grid-cols-2 gap-x-4 gap-y-4">
              <Stat
                label="Code matched"
                value={`${m.matched_code_percent.toFixed(2)}%`}
                detail={`${formatBytes(m.matched_code)} of ${formatBytes(m.total_code)}`}
              />
              <Stat
                label="Functions"
                value={fmt.format(m.matched_functions)}
                detail={`of ${fmt.format(m.total_functions)} (${m.matched_functions_percent.toFixed(1)}%)`}
              />
              <Stat label="Fuzzy match" value={`${m.fuzzy_match_percent.toFixed(2)}%`} detail="incl. partial matches" />
              {m.total_data > 0 ? (
                <Stat
                  label="Data matched"
                  value={`${m.matched_data_percent.toFixed(2)}%`}
                  detail={`${formatBytes(m.matched_data)} of ${formatBytes(m.total_data)}`}
                />
              ) : (
                <Stat label="Units complete" value={`${fmt.format(m.complete_units)}`} detail={`of ${fmt.format(m.total_units)}`} />
              )}
            </div>
          </Side>

          {shownPorts.length ? (
            <Side title="Ports" aside={`${shownPorts.length}`}>
              <PortList ports={shownPorts} compact />
            </Side>
          ) : null}

          <Side
            title="History"
            aside={
              <>
                {fmt.format(points.length)} commits ·{" "}
                <a
                  href={`${base}.json?mode=history&version=${encodeURIComponent(r.version)}`}
                  download={`${project.repo}-${r.version}-history.json`}
                  className="text-accent hover:underline"
                  title="Every commit's measures as JSON (the format decomp.dev used), to keep or upload elsewhere"
                >
                  Download
                </a>
              </>
            }
          >
            <HistoryChart points={points} />
          </Side>

          {row.categories.length > 0 ? (
            <Side title="Categories" aside={`${row.categories.length}`} action={<CategorySort />}>
              <CategoryList
                categories={row.categories.map((c) => ({
                  id: c.id,
                  name: c.name,
                  matchedCodePercent: c.measures.matched_code_percent,
                  totalCode: Number(c.measures.total_code) || 0,
                }))}
              />
            </Side>
          ) : null}

          <Side title="Recent commits">
            <ul className="-mx-1 grid grid-cols-[minmax(0,1fr)]">
              {recent.slice(0, 8).map((h) => {
                const p = previous.get(h.commitSha);
                const dCode = p ? h.measures.matched_code_percent - p.matched_code_percent : 0;
                const here = h.commitSha === row.commitSha;
                return (
                  <li key={h.commitSha}>
                    <Link
                      href={commitHref(h.commitSha)}
                      scroll={false}
                      title={`${h.measures.matched_code_percent.toFixed(2)}% code matched`}
                      className={`flex items-center gap-2 rounded-lg px-1 py-1.5 text-[13px] transition-colors hover:bg-surface-2 ${here ? "bg-surface-2" : ""}`}
                    >
                      <span className="shrink-0 font-mono text-xs text-ink-3">{h.commitSha.slice(0, 7)}</span>
                      <span className="min-w-0 flex-1 truncate text-ink-2">{h.commitMessage?.split("\n")[0] ?? ""}</span>
                      <LocalTime value={h.commitTimestamp} style="ago" className="shrink-0 text-xs text-ink-3" />
                      {Math.abs(dCode) >= 0.005 ? (
                        <span className={`shrink-0 font-mono text-xs ${dCode > 0 ? "text-good" : "text-bad"}`}>
                          {dCode > 0 ? "+" : "−"}
                          {Math.abs(dCode).toFixed(2)}
                        </span>
                      ) : null}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Side>

          <Side title="Badges">
            <div className="grid grid-cols-[minmax(0,1fr)] gap-3">
              <div className="flex flex-wrap gap-2">
                {/* eslint-disable-next-line @next/next/no-img-element -- badges are tiny SVGs served by this site */}
                <img alt="Code badge" src={`${base}${versionPath}.svg?mode=shield&label=Code&measure=matched_code_percent`} />
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img alt="Functions badge" src={`${base}${versionPath}.svg?mode=shield&label=Functions&measure=matched_functions`} />
              </div>
              <CopyField
                label="Code"
                value={`[![Code](${site}${base}${versionPath}.svg?mode=shield&label=Code&measure=matched_code_percent)](${site}${base})`}
              />
              <CopyField
                label="Functions"
                value={`[![Functions](${site}${base}${versionPath}.svg?mode=shield&label=Functions&measure=matched_functions)](${site}${base})`}
              />
              <CopyField label="JSON" value={`${site}${base}${versionPath}.json`} />
            </div>
          </Side>
        </aside>
      </div>
    </div>
  );
}
