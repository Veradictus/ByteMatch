"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { listQuery, SORT_LABELS, SORTS, type ListParams, type Sort } from "@/lib/project-query";
import { Search } from "./ui/icons";
import { Select } from "./ui/select";

/**
 * Search, platform and sort, kept in the URL: results are linkable, Back works, and the server
 * does the filtering. Typing waits 300 ms before updating; any change goes back to page 1.
 */
export function ProjectFilters({ params, platforms }: { params: ListParams; platforms: [string, string][] }) {
  const router = useRouter();
  const path = usePathname();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.q);
  // When the URL's search changes from outside (Clear filters, Back), show it; typing that only
  // reached the URL through our own update leaves the box alone, so it never loses focus.
  const [seen, setSeen] = useState(params.q);
  if (params.q !== seen) {
    setSeen(params.q);
    if (params.q !== q.trim()) setQ(params.q);
  }
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const go = (next: Partial<ListParams>) => {
    const query = listQuery({ ...params, q, ...next, page: 1 });
    start(() => router.replace(`${path}${query}`, { scroll: false }));
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="mb-4 grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_12rem]" aria-busy={pending}>
      <div className="relative">
        <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
        <input
          type="search"
          value={q}
          onChange={(e) => {
            const value = e.target.value;
            setQ(value);
            clearTimeout(timer.current);
            timer.current = setTimeout(() => go({ q: value.trim() }), 300);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              clearTimeout(timer.current);
              go({ q: q.trim() });
            }
          }}
          placeholder="Search projects"
          aria-label="Search projects"
          className="field pl-10"
        />
      </div>
      <Select
        value={params.platform}
        onChange={(v) => go({ platform: v })}
        aria-label="Platform"
        options={[{ value: "", label: "All platforms" }, ...platforms.map(([id, name]) => ({ value: id, label: name }))]}
      />
      <Select
        value={params.sort}
        onChange={(v) => go({ sort: v as Sort })}
        aria-label="Sort by"
        options={SORTS.map((s) => ({ value: s, label: SORT_LABELS[s] }))}
      />
    </div>
  );
}
