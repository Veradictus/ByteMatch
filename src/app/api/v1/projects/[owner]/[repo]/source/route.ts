import type { NextRequest } from "next/server";
import { latestFullReport, loadReport } from "@/db/store";
import { NotFound, resolve } from "@/lib/project-data";
import { commitExists, loadSource } from "@/lib/source-fetch";

export const dynamic = "force-dynamic";

const fail = (status: number, error: string) => Response.json({ error }, { status, headers: { "cache-control": "no-store" } });

/**
 * A unit's source, or one function's, from the project's repository at the commit its report came
 * from: ?unit=...[&function=...][&version=...][&commit=<sha>]. The report says which file (its
 * unit's source_path); the code comes from GitHub.
 */
export async function GET(request: NextRequest, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await ctx.params;
  const q = request.nextUrl.searchParams;
  const unitName = q.get("unit");
  if (!unitName) return fail(400, "unit is required");
  const fn = q.get("function")?.trim() || null;
  try {
    const commit = q.get("commit");
    const r = await resolve(owner, repo, q.get("version"), null, commit);
    const row = commit ? (r.row.blobId ? r.row : undefined) : await latestFullReport(r.project.id, r.version);
    const report = row ? await loadReport(row) : null;
    const unit = report?.units.find((u) => u.name === unitName);
    if (!row || !unit) return fail(404, "Unit not found");
    const sourcePath = unit.metadata?.source_path ?? null;
    // The map names functions by their demangled names; the report knows both, and the address.
    const f = fn ? unit.functions.find((x) => x.name === fn || x.metadata?.demangled_name === fn) : undefined;
    const view = await loadSource(r.project, row.commitSha, sourcePath, f?.name ?? fn, {
      unit: unit.name,
      demangled: f?.metadata?.demangled_name,
      address: Number(f?.metadata?.virtual_address) || null,
    });
    if (!view && (await commitExists(r.project, row.commitSha)) === false)
      return fail(
        404,
        `This report came from commit ${row.commitSha.slice(0, 7)}, which isn't in the repository on GitHub: it was built from a commit that was never pushed, or one later rebased away. Reports from pushed commits show their source.`,
      );
    if (!view)
      return fail(
        404,
        sourcePath
          ? `${sourcePath} isn't in the repository at ${row.commitSha.slice(0, 7)}.`
          : "This project's report doesn't say where this unit's source is (objdiff's source_path), and no file in the repository is named after it.",
      );
    // A commit's files never change.
    return Response.json({ ...view, commit: row.commitSha }, { headers: { "cache-control": "public, max-age=3600, s-maxage=86400" } });
  } catch (e) {
    if (e instanceof NotFound) return fail(404, e.message);
    console.error("source", e);
    return fail(502, "GitHub didn't answer just now. Try again in a moment.");
  }
}
