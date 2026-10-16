import type { NextRequest } from "next/server";
import { projectIndex } from "@/db/store";
import { projectUrl } from "@/lib/project-data";
import { filterAndSort, listQuery, paginate, parseListParams } from "@/lib/project-query";
import { config } from "@/lib/config";

export const dynamic = "force-dynamic";

const DEFAULT_PER_PAGE = 100;
const MAX_PER_PAGE = 500;

/**
 * Projects with their default version's latest measures. Accepts the index page's q, platform and
 * sort, plus page and per_page (default 100, at most 500). Paging is reported in X-Total-Count,
 * X-Total-Pages and a Link header with prev/next/first/last.
 */
export async function GET(request: NextRequest) {
  const params = parseListParams(request.nextUrl.searchParams);
  const asked = Number.parseInt(request.nextUrl.searchParams.get("per_page") ?? "", 10);
  const perPage = Number.isFinite(asked) && asked > 0 ? Math.min(asked, MAX_PER_PAGE) : DEFAULT_PER_PAGE;
  const rows = (await projectIndex()).map((p) => ({
    ...p,
    codePercent: p.measures ? Number(p.measures.matched_code_percent) : null,
    updated: p.commit_timestamp ? new Date(p.commit_timestamp).toISOString() : null,
    matchedFunctions: p.measures ? Number(p.measures.matched_functions) : null,
    totalCode: p.measures ? Number(p.measures.total_code) : null,
    gain30: p.gain_30d === null ? null : Number(p.gain_30d),
    createdAt: new Date(p.created_at).toISOString(),
  }));
  const page = paginate(filterAndSort(rows, params), params.page, perPage);

  const base = `${config().PUBLIC_URL}/api/v1/projects`;
  const link = (n: number) => {
    const q = listQuery({ ...params, page: n });
    const sep = q ? "&" : "?";
    return `${base}${q}${perPage === DEFAULT_PER_PAGE ? "" : `${sep}per_page=${perPage}`}`;
  };
  const links = [`<${link(1)}>; rel="first"`, `<${link(page.pages)}>; rel="last"`];
  if (page.page > 1) links.push(`<${link(page.page - 1)}>; rel="prev"`);
  if (page.page < page.pages) links.push(`<${link(page.page + 1)}>; rel="next"`);

  return Response.json(
    page.items.map((p) => ({
      owner: p.owner,
      repo: p.repo,
      name: p.name,
      short_name: p.short_name,
      platform: p.platform,
      game: p.game,
      franchise: p.franchise,
      release_year: p.release_year,
      // Versions that are a different game from the project's (one repository, several games).
      version_games: Object.fromEntries(
        Object.entries(p.version_games ?? {}).map(([v, g]) => [
          v,
          { game: g.game, franchise: g.franchise ?? null, release_year: g.releaseYear ?? null },
        ]),
      ),
      url: projectUrl(p),
      icon_url: p.icon_url,
      cover_url: p.image_url,
      version: p.version,
      timestamp: p.updated,
      gain_30d: p.gain30,
      measures: p.measures,
    })),
    {
      headers: {
        "cache-control": "public, max-age=60",
        "access-control-allow-origin": "*",
        "access-control-expose-headers": "Link, X-Total-Count, X-Total-Pages",
        "x-total-count": String(page.total),
        "x-total-pages": String(page.pages),
        link: links.join(", "),
      },
    },
  );
}
