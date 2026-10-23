import type { NextRequest } from "next/server";
import { latestFullReport, loadFunctionalList, loadReport } from "@/db/store";
import { NotFound, resolve } from "@/lib/project-data";
import { warmSourceIndex } from "@/lib/source-fetch";

export const dynamic = "force-dynamic";

/** One unit's functions: ?unit=...[&version=...][&commit=<sha>] (the latest full report without commit). */
export async function GET(request: NextRequest, ctx: { params: Promise<{ owner: string; repo: string }> }) {
  const { owner, repo } = await ctx.params;
  const q = request.nextUrl.searchParams;
  try {
    const commit = q.get("commit");
    const r = await resolve(owner, repo, q.get("version"), null, commit);
    const row = commit ? (r.row.blobId ? r.row : undefined) : await latestFullReport(r.project.id, r.version);
    const [report, functional] = row ? await Promise.all([loadReport(row), loadFunctionalList(row)]) : [null, null];
    const unit = report?.units.find((u) => u.name === q.get("unit"));
    if (!unit) throw new NotFound("Unit not found");
    // Someone opened this unit: get the repository's source index ready for the function they pick next.
    if (row) warmSourceIndex(r.project, row.commitSha);
    return Response.json(
      {
        name: unit.name,
        source_path: unit.metadata?.source_path ?? null,
        functions: unit.functions.map((f) => ({
          name: f.metadata?.demangled_name ?? f.name,
          size: f.size,
          fuzzy_match_percent: f.fuzzy_match_percent,
          address: f.metadata?.virtual_address ?? null,
          // Has functional C (and how sure the project is), when unmatched and listed.
          // Missing for 0%: objdiff leaves zero values out.
          functional: (f.fuzzy_match_percent ?? 0) < 100 ? (functional?.get(f.name) ?? null) : null,
        })),
      },
      { headers: { "cache-control": "public, max-age=60" } },
    );
  } catch (e) {
    if (e instanceof NotFound) return Response.json({ error: e.message }, { status: 404 });
    throw e;
  }
}
