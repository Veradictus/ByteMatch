"use client";

import { useSyncExternalStore } from "react";
import { ProgressBar } from "./progress-bar";
import { Select } from "./ui/select";

export interface CategoryRow {
  id: string;
  name: string;
  matchedCodePercent: number;
  totalCode: number;
}

const SORTS = {
  report: "Report order",
  most: "Most matched",
  least: "Least matched",
  size: "Largest",
  name: "Name",
} as const;
type Sort = keyof typeof SORTS;

const sorted = (rows: CategoryRow[], sort: Sort) => {
  const label = (c: CategoryRow) => c.name || c.id;
  const list = [...rows];
  switch (sort) {
    case "most":
      return list.sort((a, b) => b.matchedCodePercent - a.matchedCodePercent || b.totalCode - a.totalCode);
    case "least":
      return list.sort((a, b) => a.matchedCodePercent - b.matchedCodePercent || b.totalCode - a.totalCode);
    case "size":
      return list.sort((a, b) => b.totalCode - a.totalCode);
    case "name":
      return list.sort((a, b) => label(a).localeCompare(label(b), undefined, { numeric: true }));
    default:
      return list;
  }
};

const KEY = "bytematch-category-sort";

// The viewer's pick, kept in their browser; held here too, for when storage is blocked.
let current: Sort | null = null;
const listeners = new Set<() => void>();

function read(): Sort {
  if (current) return current;
  try {
    const v = localStorage.getItem(KEY);
    current = v && v in SORTS ? (v as Sort) : "report";
  } catch {
    current = "report";
  }
  return current;
}

function choose(sort: Sort) {
  current = sort;
  try {
    localStorage.setItem(KEY, sort);
  } catch {
    // Private mode or blocked storage: the order holds until the page is left.
  }
  for (const l of listeners) l();
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

const useSort = () => useSyncExternalStore(subscribe, read, () => "report" as Sort);

/** The order picker, for the Categories panel's heading. */
export function CategorySort() {
  const sort = useSort();
  return (
    <Select
      value={sort}
      onChange={(v) => choose(v as Sort)}
      aria-label="Sort categories"
      options={Object.entries(SORTS).map(([value, label]) => ({ value, label }))}
      buttonClassName="h-7 px-2 text-xs font-normal"
    />
  );
}

/**
 * The sidebar's categories with their code matched, in the order the viewer picks (kept per
 * browser). Report order on the server and while hydrating; the remembered order right after.
 */
export function CategoryList({ categories }: { categories: CategoryRow[] }) {
  const sort = useSort();
  return (
    <div className="-mr-2 grid max-h-72 grid-cols-[minmax(0,1fr)] gap-y-3 overflow-y-auto pr-2">
      {sorted(categories, sort).map((c) => (
        <div key={c.id}>
          <div className="mb-1 flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate">{c.name || c.id}</span>
            <span className="shrink-0 font-mono text-xs text-ink-2">{c.matchedCodePercent.toFixed(2)}%</span>
          </div>
          <ProgressBar value={c.matchedCodePercent} label={`${c.name || c.id}: code matched`} />
        </div>
      ))}
    </div>
  );
}
