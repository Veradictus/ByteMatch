import { and, desc, eq, inArray, sql as dsql } from "drizzle-orm";
import type { Octokit } from "octokit";
import { db } from "../db/client";
import { ingestProblems, projects, reports, type Project } from "../db/schema";
import { storeReport, type StoreInput } from "../db/store";
import { FunctionalListError, parseFunctionalList } from "../report/functional";
import { downloadReport, fromWorkflow, getRun, listRuns, reportArtifacts, type WorkflowRun } from "../github/artifacts";
import { repoClient } from "../github/client";
import { redact } from "../lib/errors";
import { ReportProblem } from "../lib/problems";
import { parseReport, splitReport } from "../report/parse";
import type { Report } from "../report/types";

export interface RunResult {
  runId: number;
  stored: string[];
  skipped: string[];
  /** Artifacts that couldn't be used, recorded in ingest_problems. */
  problems: { artifact: string; message: string }[];
}

/** The reports in an artifact: one, or one per version for projects that report all versions together. */
export function versionsOf(project: Pick<Project, "splitVersions">, artifactVersion: string, report: Report): [string, Report][] {
  if (!project.splitVersions) return [[artifactVersion, report]];
  const parts = splitReport(report);
  return parts.size ? [...parts] : [[artifactVersion, report]];
}

async function storedVersions(projectId: number, sha: string): Promise<Set<string>> {
  const rows = await db()
    .select({ version: reports.version, source: reports.source })
    .from(reports)
    .where(and(eq(reports.projectId, projectId), eq(reports.commitSha, sha)));
  // Measures-only rows (imported or uploaded history) are filled in with the real report when CI has it.
  return new Set(rows.filter((r) => r.source !== "import" && r.source !== "history").map((r) => r.version));
}

/** Reads one run's report artifacts into the database. */
export async function ingestRun(project: Project, run: WorkflowRun, octokit: Octokit, force = false): Promise<RunResult> {
  const result: RunResult = { runId: run.id, stored: [], skipped: [], problems: [] };
  const have = force ? new Set<string>() : await storedVersions(project.id, run.headSha);
  const artifacts = await reportArtifacts(octokit, project.owner, project.repo, run.id, project.artifactPattern);
  for (const artifact of artifacts) {
    if (artifact.expired || (!project.splitVersions && have.has(artifact.version))) {
      result.skipped.push(artifact.version);
      continue;
    }
    let report: Report;
    let functional: StoreInput["functional"] = null;
    try {
      const files = await downloadReport(octokit, project.owner, project.repo, artifact.id);
      report = readReport(files.report);
      functional = readFunctional(files.functional);
    } catch (e) {
      if (!(e instanceof ReportProblem)) throw e;
      // This run's artifact will never change: record why, and carry on with the other artifacts and runs.
      await recordProblem(project, run, artifact.name, e);
      result.problems.push({ artifact: artifact.name, message: e.message });
      continue;
    }
    for (const [version, part] of versionsOf(project, artifact.version, report)) {
      if (have.has(version)) {
        result.skipped.push(version);
        continue;
      }
      await storeReport({
        project,
        version,
        commit: { sha: run.headSha, message: run.commitMessage, timestamp: run.commitTimestamp },
        report: part,
        source: "artifact",
        runId: run.id,
        functional,
      });
      result.stored.push(version);
    }
  }
  return result;
}

/** A report from an artifact's bytes; anything that isn't one is a ReportProblem, not a sync failure. */
function readReport(bytes: Uint8Array): Report {
  try {
    return parseReport(bytes);
  } catch (e) {
    throw new ReportProblem("report-unreadable", `report could not be parsed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** The artifact's functional list; one that can't be read is kept as its error, not a failure. */
export function readFunctional(file: { name: string; data: Uint8Array } | null): StoreInput["functional"] {
  if (!file) return null;
  try {
    return parseFunctionalList(file.data, file.name);
  } catch (e) {
    return { error: e instanceof FunctionalListError ? e.message : `${file.name} could not be read` };
  }
}

async function recordProblem(project: Project, run: WorkflowRun, artifact: string, problem: ReportProblem) {
  await db()
    .insert(ingestProblems)
    .values({
      projectId: project.id,
      runId: run.id,
      commitSha: run.headSha,
      artifact,
      code: problem.code,
      message: redact(problem.message),
      detail: { ...problem.detail },
    })
    .onConflictDoNothing();
}

/** Runs already recorded as unusable, among RUN_IDS. */
async function problemRuns(projectId: number, runIds: number[]): Promise<Set<number>> {
  if (!runIds.length) return new Set();
  const rows = await db()
    .selectDistinct({ runId: ingestProblems.runId })
    .from(ingestProblems)
    .where(and(eq(ingestProblems.projectId, projectId), inArray(ingestProblems.runId, runIds)));
  return new Set(rows.map((r) => r.runId));
}

/** The newest recorded problem (in one run, if given), shown to the project's maintainers. */
export async function latestProblem(projectId: number, runId?: number) {
  const [row] = await db()
    .select()
    .from(ingestProblems)
    .where(and(eq(ingestProblems.projectId, projectId), runId === undefined ? undefined : eq(ingestProblems.runId, runId)))
    .orderBy(desc(ingestProblems.createdAt), desc(ingestProblems.id))
    .limit(1);
  return row;
}

/** Forget the project's unusable runs, so the next poll or backfill tries them again. */
export async function clearProblems(projectId: number): Promise<number> {
  const rows = await db().delete(ingestProblems).where(eq(ingestProblems.projectId, projectId)).returning({ id: ingestProblems.id });
  return rows.length;
}

async function remember(project: Project, patch: Partial<Project>) {
  await db().update(projects).set(patch).where(eq(projects.id, project.id));
}

export async function recordError(projectId: number, error: unknown) {
  await db()
    .update(projects)
    .set({
      lastError: redact(error instanceof Error ? error.message : String(error)),
      lastErrorAt: new Date(),
      // The first failure starts the clock; later ones keep it.
      errorSince: dsql`coalesce(${projects.errorSince}, now())`,
    })
    .where(eq(projects.id, projectId));
}

/** Ingests one run by id (webhook path). */
export async function ingestRunById(project: Project, runId: number, force = false): Promise<RunResult | undefined> {
  const { octokit, installationId } = await repoClient(project);
  if (installationId && installationId !== project.installationId) await remember(project, { installationId });
  const run = await getRun(octokit, project.owner, project.repo, runId);
  if (run.conclusion !== "success" || run.headBranch !== project.defaultBranch || run.event.startsWith("pull_request")) return undefined;
  if (!fromWorkflow(run, project.workflow)) return undefined;
  const result = await ingestRun(project, run, octokit, force);
  // The newest run's artifact is unusable: tell the maintainers, without failing the job.
  if (!result.stored.length && result.problems.length) await recordError(project.id, result.problems[0].message);
  return result;
}

/**
 * Looks through the newest successful default-branch runs (MAX_RUNS at most) and ingests the
 * ones whose commits are not stored yet, oldest first so history grows in order.
 */
export async function pollProject(project: Project, maxRuns = 20): Promise<RunResult[]> {
  const { octokit, installationId } = await repoClient(project);
  const runs: WorkflowRun[] = [];
  for (let page = 1; runs.length < maxRuns; page++) {
    const batch = await listRuns(octokit, project.owner, project.repo, project.defaultBranch, page, Math.min(100, maxRuns));
    runs.push(...batch.filter((r) => fromWorkflow(r, project.workflow)));
    if (batch.length < Math.min(100, maxRuns)) break;
  }
  const shas = [...new Set(runs.map((r) => r.headSha))];
  const known = shas.length
    ? new Set(
        (
          await db()
            .selectDistinct({ sha: reports.commitSha })
            .from(reports)
            .where(and(eq(reports.projectId, project.id), inArray(reports.commitSha, shas), eq(reports.source, "artifact")))
        ).map((r) => r.sha),
      )
    : new Set<string>();
  const considered = runs.slice(0, maxRuns);
  const skip = await problemRuns(
    project.id,
    considered.map((r) => r.id),
  );
  const results: RunResult[] = [];
  const seen = new Set<string>();
  for (const run of [...considered].reverse()) {
    if (known.has(run.headSha) || seen.has(run.headSha) || skip.has(run.id)) continue;
    const r = await ingestRun(project, run, octokit);
    // A commit can have several successful runs; only the one that carries reports counts.
    if (r.stored.length) seen.add(run.headSha);
    if (r.problems.length) skip.add(run.id);
    results.push(r);
  }
  // Reaching the repository clears a sync error. What's left to report is the newest run's own
  // problem, if its artifact was unusable and no newer run has stored a report since.
  const newest = considered[0];
  const stuck = newest && skip.has(newest.id) && !known.has(newest.headSha) && !seen.has(newest.headSha);
  const problem = stuck ? await latestProblem(project.id, newest.id) : undefined;
  await remember(project, {
    lastPolledAt: new Date(),
    lastError: problem ? problem.message : null,
    lastErrorAt: problem ? problem.createdAt : null,
    errorSince: problem ? (project.errorSince ?? problem.createdAt) : null,
    ...(installationId && installationId !== project.installationId ? { installationId } : {}),
  });
  return results;
}
