/**
 * Searching, filtering, sorting and paging the project list. Pure, so the index page and the
 * projects API share one behaviour and it can be tested without a database.
 */

export const SORTS = ["updated", "progress", "functions", "gain", "size", "newest", "name"] as const;

/** Labels for the sort control, in the order it lists them. Most recently updated is the default. */
export const SORT_LABELS: Record<Sort, string> = {
  updated: "Recently updated",
  progress: "Most matched",
  functions: "Most functions matched",
  gain: "Biggest gain (30 days)",
  size: "Largest codebase",
  newest: "Newest added",
  name: "Name (A–Z)",
};
export type Sort = (typeof SORTS)[number];

export interface ListParams {
  q: string;
  platform: string;
  sort: Sort;
  page: number;
}

export interface Listable {
  owner: string;
  repo: string;
  name: string;
  platform: string | null;
  /** The game and franchise the project names; search matches them too. */
  game?: string | null;
  franchise?: string | null;
  codePercent: number | null;
  updated: string | null;
  matchedFunctions?: number | null;
  totalCode?: number | null;
  gain30?: number | null;
  createdAt?: string | null;
}

export const DEFAULT_PARAMS: ListParams = { q: "", platform: "", sort: "updated", page: 1 };

type ParamSource = URLSearchParams | Record<string, string | string[] | undefined>;

function get(source: ParamSource, key: string): string {
  const v = source instanceof URLSearchParams ? source.get(key) : source[key];
  return (Array.isArray(v) ? v[0] : (v ?? "")).trim();
}

export function parseListParams(source: ParamSource): ListParams {
  const sort = get(source, "sort") as Sort;
  const page = Number.parseInt(get(source, "page"), 10);
  return {
    q: get(source, "q").slice(0, 100),
    platform: [
      ...new Set(
        get(source, "platform")
          .toLowerCase()
          .split(",")
          .map((p) => p.trim())
          .filter(Boolean),
      ),
    ]
      .slice(0, 32)
      .join(",")
      .slice(0, 256),
    sort: SORTS.includes(sort) ? sort : "updated",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Every search word must appear in the name, owner/repo, game or franchise, in any order and case. */
export function matches(row: Listable, q: string): boolean {
  const hay = `${row.name} ${row.owner}/${row.repo} ${row.game ?? ""} ${row.franchise ?? ""}`.toLowerCase().replace(/&/g, "and");
  return q
    .toLowerCase()
    .replace(/&/g, "and")
    .split(/\s+/)
    .filter(Boolean)
    .every((w) => hay.includes(w));
}

export function filterAndSort<T extends Listable>(rows: T[], p: Pick<ListParams, "q" | "platform" | "sort">): T[] {
  const platforms = new Set(p.platform.split(",").filter(Boolean));
  const list = rows.filter((r) => (!platforms.size || platforms.has((r.platform ?? "").toLowerCase())) && (!p.q || matches(r, p.q)));
  const byName = (a: T, b: T) => a.name.localeCompare(b.name);
  // Projects without a value for the chosen measure go last; ties fall back to most recently updated.
  const num = (v: number | null | undefined) => (v === null || v === undefined || !Number.isFinite(v) ? -Infinity : v);
  const byUpdated = (a: T, b: T) => (b.updated ?? "").localeCompare(a.updated ?? "") || byName(a, b);
  return list.sort((a, b) => {
    switch (p.sort) {
      case "name":
        return byName(a, b);
      case "progress":
        return num(b.codePercent) - num(a.codePercent) || byUpdated(a, b);
      case "functions":
        return num(b.matchedFunctions) - num(a.matchedFunctions) || byUpdated(a, b);
      case "gain":
        return num(b.gain30) - num(a.gain30) || byUpdated(a, b);
      case "size":
        return num(b.totalCode) - num(a.totalCode) || byUpdated(a, b);
      case "newest":
        return (b.createdAt ?? "").localeCompare(a.createdAt ?? "") || byName(a, b);
      default:
        return byUpdated(a, b);
    }
  });
}

export interface Page<T> {
  items: T[];
  total: number;
  page: number;
  pages: number;
  perPage: number;
}

/** One page; a page past the end clamps to the last one. */
export function paginate<T>(rows: T[], page: number, perPage: number): Page<T> {
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const current = Math.min(Math.max(1, page), pages);
  return { items: rows.slice((current - 1) * perPage, current * perPage), total: rows.length, page: current, pages, perPage };
}

/** The query string for P, leaving out defaults so URLs stay short and canonical. */
export function listQuery(p: Partial<ListParams>): string {
  const params = new URLSearchParams();
  if (p.q) params.set("q", p.q);
  if (p.platform) params.set("platform", p.platform);
  if (p.sort && p.sort !== "updated") params.set("sort", p.sort);
  if (p.page && p.page > 1) params.set("page", String(p.page));
  const s = params.toString();
  return s ? `?${s}` : "";
}

/** Page numbers to show around CURRENT, with null for a gap: 1 … 4 5 [6] 7 8 … 20. */
export function pageWindow(current: number, pages: number, radius = 2): (number | null)[] {
  const keep = new Set([1, pages]);
  for (let i = current - radius; i <= current + radius; i++) if (i >= 1 && i <= pages) keep.add(i);
  const sorted = [...keep].sort((a, b) => a - b);
  const out: (number | null)[] = [];
  sorted.forEach((n, i) => {
    if (i > 0 && n - sorted[i - 1] === 2) out.push(n - 1);
    else if (i > 0 && n - sorted[i - 1] > 2) out.push(null);
    out.push(n);
  });
  return out;
}
