"use client";

import { Fragment, useMemo, useState } from "react";
import { Check, ChevronRight, Search } from "./ui/icons";
import { Select } from "./ui/select";

export interface UnitRow {
  name: string;
  totalCode: number;
  matchedCodePercent: number;
  fuzzy: number;
  matchedFunctions: number;
  totalFunctions: number;
  complete: boolean;
}

interface FunctionRow {
  name: string;
  size: number;
  fuzzy_match_percent: number;
  address: number | null;
}

type Sort = "name" | "size" | "matched";
const fmt = new Intl.NumberFormat("en-US");
const PAGE = 100;

export function UnitTable({ units, owner, repo, version }: { units: UnitRow[]; owner: string; repo: string; version: string }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<Sort>("name");
  const [hideDone, setHideDone] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [open, setOpen] = useState<Record<string, FunctionRow[] | "loading" | "error">>({});

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units
      .filter((u) => (!q || u.name.toLowerCase().includes(q)) && (!hideDone || u.matchedCodePercent < 100))
      .sort((a, b) =>
        sort === "name"
          ? a.name.localeCompare(b.name)
          : sort === "size"
            ? b.totalCode - a.totalCode
            : b.matchedCodePercent - a.matchedCodePercent,
      );
  }, [units, query, sort, hideDone]);

  const toggle = async (name: string) => {
    if (open[name]) {
      setOpen(({ [name]: _, ...rest }) => rest);
      return;
    }
    setOpen((o) => ({ ...o, [name]: "loading" }));
    try {
      const res = await fetch(
        `/api/v1/projects/${owner}/${repo}/units?version=${encodeURIComponent(version)}&unit=${encodeURIComponent(name)}`,
      );
      if (!res.ok) throw new Error();
      const data = (await res.json()) as { functions: FunctionRow[] };
      setOpen((o) => ({ ...o, [name]: data.functions.sort((a, b) => (a.address ?? 0) - (b.address ?? 0)) }));
    } catch {
      setOpen((o) => ({ ...o, [name]: "error" }));
    }
  };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <div className="relative w-full sm:w-64">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setLimit(PAGE);
            }}
            placeholder="Filter units"
            aria-label="Filter units"
            className="field pl-10"
          />
        </div>
        <Select
          value={sort}
          onChange={(v) => setSort(v as Sort)}
          aria-label="Sort units"
          className="w-40"
          options={[
            { value: "name", label: "Name" },
            { value: "size", label: "Largest" },
            { value: "matched", label: "Most matched" },
          ]}
        />
        <label className="flex items-center gap-2 text-sm text-ink-2">
          <input
            type="checkbox"
            className="size-4 accent-[var(--accent-strong)]"
            checked={hideDone}
            onChange={(e) => setHideDone(e.target.checked)}
          />{" "}
          Hide fully matched
        </label>
        <span className="ml-auto text-sm text-ink-3">{fmt.format(shown.length)} units</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-line">
        <table className="w-full min-w-[40rem] table-fixed text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-3">
            <tr>
              <th className="px-3 py-2 font-medium">Unit</th>
              <th className="w-28 px-3 py-2 text-right font-medium">Code</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Matched</th>
              <th className="w-24 px-3 py-2 text-right font-medium">Fuzzy</th>
              <th className="w-32 px-3 py-2 text-right font-medium">Functions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {shown.slice(0, limit).map((u) => {
              const fns = open[u.name];
              return (
                <Fragment key={u.name}>
                  <tr className="hover:bg-surface-2">
                    <td className="px-3 py-1.5">
                      <button onClick={() => toggle(u.name)} aria-expanded={!!fns} className="flex w-full items-center gap-2 text-left">
                        <ChevronRight
                          size={13}
                          className={`shrink-0 text-ink-3 transition-transform duration-200 ${fns ? "rotate-90" : ""}`}
                        />
                        <span className="truncate font-mono text-[13px]">{u.name}</span>
                        {u.complete ? (
                          <span className="shrink-0 rounded-md bg-done/15 px-1.5 py-0.5 text-[11px] text-good">complete</span>
                        ) : null}
                      </button>
                    </td>
                    <td className="px-3 py-1.5 text-right font-mono text-ink-2">{fmt.format(u.totalCode)}</td>
                    <td className="px-3 py-1.5 text-right font-mono">{u.matchedCodePercent.toFixed(2)}%</td>
                    <td className="px-3 py-1.5 text-right font-mono text-ink-2">{u.fuzzy.toFixed(2)}%</td>
                    <td className="px-3 py-1.5 text-right font-mono text-ink-2">
                      {fmt.format(u.matchedFunctions)} / {fmt.format(u.totalFunctions)}
                    </td>
                  </tr>
                  {fns ? (
                    <tr className="bg-surface-2/50">
                      <td colSpan={5} className="px-3 py-2 pl-8">
                        {fns === "loading" ? (
                          <span className="text-xs text-ink-3">Loading…</span>
                        ) : fns === "error" ? (
                          <span className="text-xs text-bad">Could not load functions.</span>
                        ) : fns.length === 0 ? (
                          <span className="text-xs text-ink-3">No functions.</span>
                        ) : (
                          <table className="w-full table-fixed text-xs">
                            <tbody>
                              {fns.map((f) => (
                                <tr key={`${f.name}@${f.address}`}>
                                  <td className="w-24 py-0.5 pr-3 font-mono text-ink-3">
                                    {f.address !== null ? f.address.toString(16).toUpperCase().padStart(8, "0") : ""}
                                  </td>
                                  <td className="truncate py-0.5 pr-3 font-mono">{f.name}</td>
                                  <td className="w-24 py-0.5 pr-3 text-right font-mono text-ink-3">{fmt.format(f.size)} B</td>
                                  <td
                                    className={`w-20 py-0.5 text-right font-mono ${f.fuzzy_match_percent >= 100 ? "text-good" : "text-ink-2"}`}
                                  >
                                    {f.fuzzy_match_percent >= 100 ? (
                                      <span className="inline-flex items-center gap-1">
                                        <Check size={12} /> 100%
                                      </span>
                                    ) : (
                                      `${f.fuzzy_match_percent.toFixed(1)}%`
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        )}
                      </td>
                    </tr>
                  ) : null}
                </Fragment>
              );
            })}
          </tbody>
        </table>
        {shown.length > limit ? (
          <button
            onClick={() => setLimit((l) => l + PAGE * 5)}
            className="w-full border-t border-line py-2 text-sm text-ink-2 hover:text-ink"
          >
            Show more ({fmt.format(shown.length - limit)} left)
          </button>
        ) : null}
      </div>
    </div>
  );
}
