"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { listQuery, SORT_LABELS, SORTS, type ListParams, type Sort } from "@/lib/project-query";
import { PlatformMark } from "./platform-mark";
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
    clearTimeout(timer.current);
    const query = listQuery({ ...params, q, ...next, page: 1 });
    start(() => router.replace(`${path}${query}`, { scroll: false }));
  };

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <div className="project-filters" aria-busy={pending}>
      <div className="project-search relative">
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
      <details className="relative">
        <summary className="field flex cursor-pointer items-center justify-between gap-2">
          {params.platform
            ? `${params.platform.split(",").length} platform${params.platform.includes(",") ? "s" : ""} selected`
            : "All Platforms"}
          <span aria-hidden="true">⌄</span>
        </summary>
        <div
          className="panel absolute top-full left-0 z-20 mt-1 grid max-h-80 w-full min-w-60 gap-1 overflow-auto p-3"
          role="group"
          aria-label="Platforms"
        >
          <button type="button" className="platform-option text-left" aria-pressed={!params.platform} onClick={() => go({ platform: "" })}>
            All platforms
          </button>
          {platforms.map(([id, name]) => {
            const selected = params.platform.split(",").filter(Boolean);
            const checked = selected.includes(id);
            return (
              <button
                type="button"
                key={id}
                className="platform-option flex items-center gap-2 text-left"
                aria-pressed={checked}
                onClick={() => go({ platform: (checked ? selected.filter((p) => p !== id) : [...selected, id]).join(",") })}
              >
                <span aria-hidden="true">{checked ? "☑" : "☐"}</span>
                <PlatformMark platform={id} />
                <span>{name}</span>
              </button>
            );
          })}
        </div>
      </details>
      <Select value={params.sort} onChange={(e) => go({ sort: e.target.value as Sort })} aria-label="Sort by">
        {SORTS.map((s) => (
          <option key={s} value={s}>
            {SORT_LABELS[s]}
          </option>
        ))}
      </Select>
    </div>
  );
}
