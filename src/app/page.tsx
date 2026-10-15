import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { ProjectFilters } from "@/components/project-filters";
import { ProjectList, type ProjectRow } from "@/components/project-list";
import { projectIndex } from "@/db/store";
import { platformName } from "@/lib/platforms";
import { filterAndSort, paginate, parseListParams } from "@/lib/project-query";
import { homeMetadata } from "@/lib/seo";

export function generateMetadata() {
  return homeMetadata();
}

export const dynamic = "force-dynamic";

const PER_PAGE = 24;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function Home({ searchParams }: { searchParams: SearchParams }) {
  const params = parseListParams(await searchParams);
  const all: ProjectRow[] = (await projectIndex()).map((p) => ({
    owner: p.owner,
    repo: p.repo,
    name: p.name,
    platform: p.platform,
    platformName: platformName(p.platform),
    game: p.game,
    franchise: p.franchise,
    version: p.version,
    codePercent: p.measures ? Number(p.measures.matched_code_percent) : null,
    functions: p.measures ? { done: Number(p.measures.matched_functions), total: Number(p.measures.total_functions) } : null,
    updated: p.commit_timestamp ? new Date(p.commit_timestamp).toISOString() : null,
    matchedFunctions: p.measures ? Number(p.measures.matched_functions) : null,
    totalCode: p.measures ? Number(p.measures.total_code) : null,
    gain30: p.gain_30d === null ? null : Number(p.gain_30d),
    createdAt: new Date(p.created_at).toISOString(),
    image: p.image_url,
    linkedPercent: p.measures ? Number(p.measures.complete_code_percent) : null,
    fuzzyPercent: p.measures ? Number(p.measures.fuzzy_match_percent) : null,
  }));
  const platforms = [
    ...new Map(all.filter((r) => r.platform).map((r) => [r.platform!.toLowerCase(), r.platformName ?? r.platform!])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const page = paginate(filterAndSort(all, params), params.page, PER_PAGE);
  const shownParams = { ...params, page: page.page };
  const filtered = Boolean(params.q || params.platform);
  const from = page.total ? (page.page - 1) * PER_PAGE + 1 : 0;

  return (
    <div>
      <h1 className="index-heading">Progress Reports</h1>
      <blockquote className="index-intro">
        <p>
          Matching decompilation rebuilds a program from source until the compiled code matches the original binary. Follow the progress of
          community projects below.
        </p>
        <Link href="/docs">Learn about matching decompilation</Link>
      </blockquote>
      <ProjectFilters params={params} platforms={platforms} />
      <p className="mb-3 text-xs text-ink-3" aria-live="polite">
        {page.total === 0
          ? filtered
            ? "No projects match."
            : "No projects yet."
          : page.pages > 1
            ? `${from}–${from + page.items.length - 1} of ${page.total} ${filtered ? "matching " : ""}projects`
            : `${page.total} ${filtered ? "matching " : ""}project${page.total === 1 ? "" : "s"}`}
        {filtered ? (
          <>
            {" · "}
            <Link href="/" className="text-accent hover:underline">
              Clear filters
            </Link>
          </>
        ) : null}
      </p>
      <ProjectList
        rows={page.items}
        empty={
          filtered ? (
            "No projects match these filters."
          ) : (
            <>
              No projects yet.{" "}
              <Link href="/manage/new" className="text-accent hover:underline">
                Submit the first one
              </Link>
              .
            </>
          )
        }
      />
      <Pagination params={shownParams} pages={page.pages} />
    </div>
  );
}
