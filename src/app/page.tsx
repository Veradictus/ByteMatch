import Link from "next/link";
import { Pagination } from "@/components/pagination";
import { ProjectFilters } from "@/components/project-filters";
import { DirectoryHeading, ProjectCards } from "@/components/directory";
import { ProjectList, type ProjectRow } from "@/components/project-list";
import { Plus } from "@/components/ui/icons";
import { projectIndex } from "@/db/store";
import { config } from "@/lib/config";
import { platformName } from "@/lib/platforms";
import { filterAndSort, paginate, parseListParams } from "@/lib/project-query";
import { homeMetadata } from "@/lib/seo";
import { chosenTheme } from "@/lib/theme-server";

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
    linkedPercent: p.measures ? Number(p.measures.complete_code_percent) : null,
    fuzzyPercent: p.measures ? Number(p.measures.fuzzy_match_percent) : null,
    functions: p.measures ? { done: Number(p.measures.matched_functions), total: Number(p.measures.total_functions) } : null,
    updated: p.listed_at ? new Date(p.listed_at).toISOString() : null,
    matchedFunctions: p.measures ? Number(p.measures.matched_functions) : null,
    totalCode: p.measures ? Number(p.measures.total_code) : null,
    gain30: p.gain_30d === null ? null : Number(p.gain_30d),
    createdAt: new Date(p.created_at).toISOString(),
    image: p.icon_url,
    others: (p.others ?? []).map((o) => ({ ...o, label: p.version_games?.[o.version]?.game || o.version })),
  }));
  const platforms = [
    ...new Map(all.filter((r) => r.platform).map((r) => [r.platform!.toLowerCase(), r.platformName ?? r.platform!])).entries(),
  ].sort((a, b) => a[1].localeCompare(b[1]));
  const page = paginate(filterAndSort(all, params), params.page, PER_PAGE);
  const shownParams = { ...params, page: page.page };
  const filtered = Boolean(params.q || params.platform);
  const from = page.total ? (page.page - 1) * PER_PAGE + 1 : 0;
  const directory = (await chosenTheme()).style.layout === "directory";
  const List = directory ? ProjectCards : ProjectList;

  return (
    <div>
      {directory ? (
        <DirectoryHeading />
      ) : (
        <div className="mb-8 flex flex-wrap items-end gap-x-8 gap-y-4">
          <div className="max-w-2xl">
            <h1 className="text-3xl font-semibold tracking-tight text-balance">Decompilation progress</h1>
            <p className="mt-2 text-sm leading-relaxed text-ink-2">
              Matching decompilation projects tracked by {config().SITE_NAME}, from the objdiff reports their CI builds. Code matched is the
              share of the game&apos;s code that compiles back to identical bytes.
            </p>
          </div>
          <Link href="/manage/new" className="btn btn-primary sm:ml-auto">
            <Plus size={14} />
            Submit a project
          </Link>
        </div>
      )}
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
      <List
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
