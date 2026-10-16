import { gunzipSync, gzipSync } from "node:zlib";
import { and, asc, desc, eq, isNotNull, sql as dsql } from "drizzle-orm";
import { sha256 } from "../lib/crypto";
import { ACCESS_ERROR_PATTERN, HIDE_AFTER_DAYS } from "../lib/visibility";
import { encodeReport, parseReport } from "../report/parse";
import type { Measures, Report } from "../report/types";
import { db } from "./client";
import { functionalLists, projects, reportBlobs, reports, type Project, type ReportRow, type VersionGame } from "./schema";
import { summarizeFunctional, type FunctionalList, type StoredFunctional } from "../report/functional";

export interface CommitInfo {
  sha: string;
  message?: string | null;
  timestamp: Date;
}

export interface StoreInput {
  project: Project;
  version: string;
  commit: CommitInfo;
  report: Report;
  source: "artifact" | "upload" | "import";
  runId?: number | null;
  /** The project's functional list, if it sent one, or why it couldn't be read. */
  functional?: FunctionalList | { error: string } | null;
}

/** Saves one version's report at one commit (replacing an earlier one for the same commit). */
export async function storeReport(input: StoreInput): Promise<ReportRow> {
  const { project, version, commit, report } = input;
  const encoded = encodeReport(report);
  const hash = sha256(encoded);
  const d = db();
  return d.transaction(async (tx) => {
    let [blob] = await tx.select({ id: reportBlobs.id }).from(reportBlobs).where(eq(reportBlobs.sha256, hash));
    if (!blob) {
      [blob] = await tx
        .insert(reportBlobs)
        .values({ sha256: hash, data: gzipSync(encoded, { level: 9 }), size: encoded.length })
        .onConflictDoUpdate({ target: reportBlobs.sha256, set: { sha256: hash } })
        .returning({ id: reportBlobs.id });
    }
    let functional: StoredFunctional | null = null;
    let functionalListId: number | null = null;
    if (input.functional instanceof Map) {
      functional = summarizeFunctional(report, input.functional);
      const entries = Object.fromEntries([...input.functional].sort(([a], [b]) => (a < b ? -1 : 1)));
      const listHash = sha256(JSON.stringify(entries));
      const [list] = await tx
        .insert(functionalLists)
        .values({ sha256: listHash, entries })
        .onConflictDoUpdate({ target: functionalLists.sha256, set: { sha256: listHash } })
        .returning({ id: functionalLists.id });
      functionalListId = list.id;
    } else if (input.functional) {
      functional = { error: input.functional.error };
    }
    const values = {
      projectId: project.id,
      version,
      commitSha: commit.sha,
      commitMessage: commit.message ?? null,
      commitTimestamp: commit.timestamp,
      source: input.source,
      runId: input.runId ?? null,
      measures: report.measures,
      categories: report.categories.map(({ id, name, measures }) => ({ id, name, measures })),
      blobId: blob.id,
      functional,
      functionalListId,
    };
    const [row] = await tx
      .insert(reports)
      .values(values)
      .onConflictDoUpdate({ target: [reports.projectId, reports.version, reports.commitSha], set: { ...values, createdAt: new Date() } })
      .returning();
    await tx
      .update(projects)
      .set({ lastError: null, lastErrorAt: null, errorSince: null, updatedAt: new Date() })
      .where(eq(projects.id, project.id));
    return row;
  });
}

/**
 * History rows that carry only measures (decomp.dev imports and uploaded history files); never
 * overwrites a commit that already has data. Returns how many rows were new.
 */
export async function storeMeasuresOnly(
  project: Project,
  version: string,
  rows: { commit: CommitInfo; measures: Measures }[],
  source: "import" | "history" = "import",
) {
  let added = 0;
  // In chunks, to stay well under Postgres' 65,535 parameters per statement on long histories.
  for (let i = 0; i < rows.length; i += 2000) {
    const inserted = await db()
      .insert(reports)
      .values(
        rows.slice(i, i + 2000).map((r) => ({
          projectId: project.id,
          version,
          commitSha: r.commit.sha,
          commitMessage: r.commit.message ?? null,
          commitTimestamp: r.commit.timestamp,
          source,
          measures: r.measures,
        })),
      )
      .onConflictDoNothing()
      .returning({ id: reports.id });
    added += inserted.length;
  }
  return added;
}

/** Recently decoded full reports, by blob id (blobs never change, so entries never go stale). */
const reportCache = new Map<number, Report>();
const REPORT_CACHE_SIZE = 8;

export async function loadReport(row: Pick<ReportRow, "blobId">): Promise<Report | null> {
  if (!row.blobId) return null;
  const hit = reportCache.get(row.blobId);
  if (hit) {
    reportCache.delete(row.blobId);
    reportCache.set(row.blobId, hit);
    return hit;
  }
  const [blob] = await db().select({ data: reportBlobs.data }).from(reportBlobs).where(eq(reportBlobs.id, row.blobId));
  if (!blob) return null;
  const report = parseReport(gunzipSync(blob.data));
  reportCache.set(row.blobId, report);
  if (reportCache.size > REPORT_CACHE_SIZE) reportCache.delete(reportCache.keys().next().value!);
  return report;
}

export async function findProject(owner: string, repo: string): Promise<Project | undefined> {
  const [p] = await db()
    .select()
    .from(projects)
    .where(and(dsql`lower(${projects.owner}) = lower(${owner})`, dsql`lower(${projects.repo}) = lower(${repo})`));
  return p;
}

/** Versions with at least one report, most recently updated first. */
export async function projectVersions(projectId: number): Promise<{ version: string; latest: Date }[]> {
  const rows = await db()
    .select({ version: reports.version, latest: dsql<Date>`max(${reports.commitTimestamp})` })
    .from(reports)
    .where(eq(reports.projectId, projectId))
    .groupBy(reports.version)
    .orderBy(desc(dsql`max(${reports.commitTimestamp})`));
  return rows.map((r) => ({ version: r.version, latest: new Date(r.latest) }));
}

/** The version a page or badge shows when none is asked for. */
export async function defaultVersion(project: Project): Promise<string | undefined> {
  if (project.defaultVersion) return project.defaultVersion;
  return (await projectVersions(project.id))[0]?.version;
}

/** Whether any of the project's history came from a decomp.dev import. */
export async function hasImportedHistory(projectId: number): Promise<boolean> {
  const [row] = await db()
    .select({ id: reports.id })
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.source, "import")))
    .limit(1);
  return !!row;
}

export async function latestReport(projectId: number, version: string): Promise<ReportRow | undefined> {
  const [row] = await db()
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.version, version)))
    .orderBy(desc(reports.commitTimestamp), desc(reports.id))
    .limit(1);
  return row;
}

/** The latest report for a version that still has its full report stored. */
export async function latestFullReport(projectId: number, version: string): Promise<ReportRow | undefined> {
  const [row] = await db()
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.version, version), dsql`${reports.blobId} is not null`))
    .orderBy(desc(reports.commitTimestamp), desc(reports.id))
    .limit(1);
  return row;
}

export async function reportAt(projectId: number, version: string, commitSha: string): Promise<ReportRow | undefined> {
  const [row] = await db()
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.version, version), eq(reports.commitSha, commitSha)));
  return row;
}

/** The report at a commit, by full SHA or a unique prefix of at least 7 characters. */
export async function reportAtPrefix(projectId: number, version: string, sha: string): Promise<ReportRow | undefined> {
  const clean = sha.toLowerCase();
  if (!/^[0-9a-f]{7,64}$/.test(clean)) return undefined;
  const rows = await db()
    .select()
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.version, version), dsql`${reports.commitSha} like ${clean + "%"}`))
    .limit(2);
  return rows.length === 1 ? rows[0] : undefined;
}

export async function history(projectId: number, version: string) {
  return db()
    .select({
      commitSha: reports.commitSha,
      commitMessage: reports.commitMessage,
      commitTimestamp: reports.commitTimestamp,
      measures: reports.measures,
      categories: reports.categories,
    })
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.version, version)))
    .orderBy(asc(reports.commitTimestamp), asc(reports.id));
}

/** Every enabled project with its default version's latest measures, for the index. */
export async function projectIndex() {
  const rows = await db().execute<{
    id: number;
    owner: string;
    repo: string;
    name: string;
    short_name: string | null;
    platform: string | null;
    game: string | null;
    franchise: string | null;
    release_year: number | null;
    version_games: Record<string, VersionGame>;
    version: string | null;
    measures: Measures | null;
    commit_timestamp: string | null;
    image_url: string | null;
    icon_url: string | null;
    created_at: string;
    /** Matched-code percentage points gained over the last 30 days (since the first report if newer). */
    gain_30d: number | null;
  }>(dsql`
    select p.id, p.owner, p.repo, p.name, p.short_name, p.platform, p.game, p.franchise, p.release_year, p.version_games,
           p.image_url, p.icon_url, p.created_at,
           r.version, r.measures, r.commit_timestamp,
           (r.measures->>'matched_code_percent')::float8 - (b.measures->>'matched_code_percent')::float8 as gain_30d
    from ${projects} p
    left join lateral (
      select version, measures, commit_timestamp from ${reports} r
      where r.project_id = p.id
        and r.version = coalesce(p.default_version, (
          select version from ${reports} x where x.project_id = p.id order by commit_timestamp desc limit 1))
      order by commit_timestamp desc, id desc limit 1
    ) r on true
    left join lateral (
      select measures from ${reports} o
      where o.project_id = p.id and o.version = r.version
      order by (o.commit_timestamp <= now() - interval '30 days') desc,
               case when o.commit_timestamp <= now() - interval '30 days' then o.commit_timestamp end desc nulls last,
               o.commit_timestamp asc
      limit 1
    ) b on true
    where p.enabled
      and (p.last_error is null
           or (r.version is not null
               and (p.last_error !~* ${ACCESS_ERROR_PATTERN}
                    or coalesce(p.error_since, p.last_error_at) > now() - make_interval(days => ${HIDE_AFTER_DAYS}))))
    order by lower(p.name)`);
  return [...rows];
}

/** Code-matched thresholds that count as milestones on the activity page. */
export const MILESTONES = [10, 25, 50, 75, 90, 95, 99, 100];

/** Public projects and the version their page shows (the default, else the most recently updated). */
const shownVersions = dsql`
  select p.id, p.owner, p.repo, p.name, p.icon_url,
         coalesce(p.default_version, (
           select version from ${reports} x where x.project_id = p.id order by commit_timestamp desc limit 1)) as version
  from ${projects} p
  where p.enabled
    and (p.last_error is null
         or (exists (select 1 from ${reports} e where e.project_id = p.id)
             and (p.last_error !~* ${ACCESS_ERROR_PATTERN}
                  or coalesce(p.error_since, p.last_error_at) > now() - make_interval(days => ${HIDE_AFTER_DAYS}))))`;

export type Milestone = {
  owner: string;
  repo: string;
  name: string;
  icon_url: string | null;
  version: string;
  threshold: number;
  reached: Date;
  commit_sha: string;
  commit_message: string | null;
};

/**
 * The first commit at which each project's shown version reached each threshold, newest first.
 * A threshold counts only if the project was below it before (a project whose history starts at
 * 60% did not "reach 50%" on its first report), and a commit that crosses several shows the highest.
 */
export async function milestones(limit = 60): Promise<Milestone[]> {
  const rows = await db().execute<Milestone & { reached: string }>(dsql`
    with pv as (${shownVersions}),
    h as (
      select pv.id, r.commit_timestamp as ts, r.commit_sha as sha, r.commit_message as msg,
             (r.measures->>'matched_code_percent')::float8 as pct
      from pv join ${reports} r on r.project_id = pv.id and r.version = pv.version
    ),
    firsts as (
      select h.id, t.t as threshold, min(h.ts) filter (where h.pct >= t.t) as reached, min(h.ts) as first_ts
      from h cross join unnest(${dsql.raw(`array[${MILESTONES.join(",")}]::float8[]`)}) as t(t)
      group by h.id, t.t
    )
    select pv.owner, pv.repo, pv.name, pv.icon_url, pv.version, f.threshold, f.reached, c.sha as commit_sha, c.msg as commit_message
    from firsts f
    join pv on pv.id = f.id
    join lateral (select sha, msg from h where h.id = f.id and h.ts = f.reached limit 1) c on true
    where f.reached is not null and f.reached > f.first_ts
    order by f.reached desc, f.threshold desc
    limit ${limit * 3}`);
  const seen = new Set<string>();
  const out: Milestone[] = [];
  for (const r of rows) {
    const key = `${r.owner}/${r.repo}@${r.commit_sha}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...r, threshold: Number(r.threshold), reached: new Date(r.reached) });
  }
  return out.slice(0, limit);
}

export type Mover = {
  owner: string;
  repo: string;
  name: string;
  icon_url: string | null;
  version: string;
  pct: number;
  gain: number;
  functions_gained: number;
  commits: number;
};

/** Projects that gained the most matched code over the last DAYS days (their shown version). */
export async function movers(days: number, limit = 8): Promise<Mover[]> {
  const rows = await db().execute<Mover>(dsql`
    with pv as (${shownVersions})
    select pv.owner, pv.repo, pv.name, pv.icon_url, pv.version,
           (n.measures->>'matched_code_percent')::float8 as pct,
           (n.measures->>'matched_code_percent')::float8 - (b.measures->>'matched_code_percent')::float8 as gain,
           -- Through float8 and round: a stored count that isn't a whole number must not break the page.
           round((n.measures->>'matched_functions')::float8 - (b.measures->>'matched_functions')::float8)::int as functions_gained,
           (select count(*) from ${reports} c
             where c.project_id = pv.id and c.version = pv.version
               and c.commit_timestamp > now() - make_interval(days => ${days}))::int as commits
    from pv
    join lateral (
      select measures, commit_timestamp from ${reports} r where r.project_id = pv.id and r.version = pv.version
      order by commit_timestamp desc, id desc limit 1) n on n.commit_timestamp > now() - make_interval(days => ${days})
    join lateral (
      select measures from ${reports} o where o.project_id = pv.id and o.version = pv.version
      order by (o.commit_timestamp <= now() - make_interval(days => ${days})) desc,
               case when o.commit_timestamp <= now() - make_interval(days => ${days}) then o.commit_timestamp end desc nulls last,
               o.commit_timestamp asc
      limit 1) b on true
    order by gain desc nulls last
    limit ${limit}`);
  return [...rows]
    .map((r) => ({ ...r, pct: Number(r.pct), gain: Number(r.gain), functions_gained: Number(r.functions_gained) }))
    .filter((r) => r.gain >= 0.01 || r.functions_gained > 0);
}

/** Drops full reports older than DAYS, keeping each version's latest; measures stay. */
export async function pruneReports(days: number): Promise<number> {
  if (days <= 0) return 0;
  const result = await db().execute(dsql`
    update ${reports} r set blob_id = null
    where r.blob_id is not null
      and r.commit_timestamp < now() - make_interval(days => ${days})
      and r.id <> (select id from ${reports} l where l.project_id = r.project_id and l.version = r.version
                   order by commit_timestamp desc, id desc limit 1)`);
  await db().execute(dsql`delete from ${reportBlobs} b where not exists (select 1 from ${reports} r where r.blob_id = b.id)`);
  return result.count ?? 0;
}

/** A report row's functional list, as function name → confidence. */
export async function loadFunctionalList(row: Pick<ReportRow, "functionalListId">): Promise<FunctionalList | null> {
  if (!row.functionalListId) return null;
  const [list] = await db()
    .select({ entries: functionalLists.entries })
    .from(functionalLists)
    .where(eq(functionalLists.id, row.functionalListId));
  return list ? new Map(Object.entries(list.entries)) : null;
}

/** The CI run behind the project's newest report read from an artifact, if any. */
export async function latestArtifactRun(projectId: number): Promise<number | null> {
  const [row] = await db()
    .select({ runId: reports.runId })
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.source, "artifact"), isNotNull(reports.runId)))
    .orderBy(desc(reports.commitTimestamp), desc(reports.id))
    .limit(1);
  return row?.runId ?? null;
}
