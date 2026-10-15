"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { grouped, ordered, squarify, type Rect } from "./treemap";
import { parseUnitFilter } from "./unit-filter";
import { ChevronRight, Close, Search } from "./ui/icons";
import { Select } from "./ui/select";

export interface MapUnit {
  name: string;
  totalCode: number;
  matchedCodePercent: number;
  fuzzy: number;
  matchedFunctions: number;
  totalFunctions: number;
  categories: string[];
}

interface FunctionRow {
  name: string;
  size: number;
  fuzzy_match_percent: number;
  address: number | null;
}

/** What a tile stands for: a unit at the top level, a function inside a unit. */
interface Tile {
  key: string;
  label: string;
  size: number;
  matched: number;
  fuzzy: number;
  detail: string;
  address?: number;
  unit?: MapUnit;
}

const fmt = new Intl.NumberFormat("en-US");
const bytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

// ---- Tile shading: one hue per state, lit from the centre and falling off to the edges. ----

type Rgb = [number, number, number];
const hex = (c: Rgb) =>
  `#${c
    .map((v) =>
      Math.round(Math.max(0, Math.min(255, v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const scale = (c: Rgb, k: number): Rgb => [c[0] * k, c[1] * k, c[2] * k];

const DONE: Rgb = [31, 168, 64];
const IDLE: Rgb = [46, 55, 72];
const BLUE_LOW: Rgb = [14, 58, 104];
const BLUE_HIGH: Rgb = [37, 134, 214];

function baseColor(matched: number, fuzzy: number): Rgb {
  if (matched >= 100) return DONE;
  if (fuzzy <= 0) return IDLE;
  return mix(BLUE_LOW, BLUE_HIGH, Math.min(1, fuzzy / 100));
}

function shade(matched: number, fuzzy: number): string {
  const base = baseColor(matched, fuzzy);
  return `radial-gradient(ellipse 85% 85% at 50% 42%, ${hex(scale(base, 1.18))} 0%, ${hex(base)} 52%, ${hex(scale(base, 0.62))} 100%)`;
}

const LEGEND = [
  { label: "Matched", color: hex(DONE) },
  { label: "In progress", color: hex(mix(BLUE_LOW, BLUE_HIGH, 0.7)) },
  { label: "Not started", color: hex(IDLE) },
];

/** The grid's pixel size: full width, and as tall as the screen allows so the page needn't scroll. */
function useBox(ref: React.RefObject<HTMLDivElement | null>) {
  const [box, setBox] = useState({ w: 0, h: 0 });
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: Math.floor(e.contentRect.width), h: Math.floor(e.contentRect.height) }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref]);
  return box;
}

export function UnitMap({
  units,
  categories,
  owner,
  repo,
  version,
  commit,
}: {
  units: MapUnit[];
  categories: { id: string; name: string }[];
  owner: string;
  repo: string;
  version: string;
  commit: string | null;
}) {
  const router = useRouter();
  const path = usePathname();
  const search = useSearchParams();
  const [, start] = useTransition();
  const openUnit = search.get("unit");
  const layout = search.get("layout") === "size" ? "size" : "ordered";
  const unit = useMemo(() => units.find((u) => u.name === openUnit) ?? null, [units, openUnit]);

  const [category, setCategory] = useState("");
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<Tile | null>(null);
  const [pinned, setPinned] = useState<Tile | null>(null);
  const [functions, setFunctions] = useState<Record<string, FunctionRow[] | "error">>({});
  const grid = useRef<HTMLDivElement>(null);
  const box = useBox(grid);

  const setLayout = (next: "ordered" | "size") => {
    const qs = new URLSearchParams(search.toString());
    if (next === "size") qs.set("layout", "size");
    else qs.delete("layout");
    const s = qs.toString();
    start(() => router.replace(`${path}${s ? `?${s}` : ""}`, { scroll: false }));
  };

  const navigate = useCallback(
    (unitName: string | null) => {
      const next = new URLSearchParams(search.toString());
      if (unitName) next.set("unit", unitName);
      else next.delete("unit");
      const qs = next.toString();
      setPinned(null);
      setFocus(null);
      setQuery("");
      start(() => router.push(`${path}${qs ? `?${qs}` : ""}`, { scroll: false }));
    },
    [router, path, search],
  );

  // Load the open unit's functions once; they don't change for a given commit.
  const key = `${commit ?? "latest"}:${openUnit}`;
  const loaded = openUnit ? functions[key] : undefined;
  useEffect(() => {
    if (!openUnit || loaded) return;
    let live = true;
    const qs = new URLSearchParams({ version, unit: openUnit, ...(commit ? { commit } : {}) });
    fetch(`/api/v1/projects/${owner}/${repo}/units?${qs}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { functions: FunctionRow[] }) => live && setFunctions((f) => ({ ...f, [key]: d.functions })))
      .catch(() => live && setFunctions((f) => ({ ...f, [key]: "error" })));
    return () => {
      live = false;
    };
  }, [openUnit, loaded, key, owner, repo, version, commit]);

  // Escape goes up a level.
  useEffect(() => {
    if (!openUnit) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !(e.target instanceof HTMLInputElement)) navigate(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [openUnit, navigate]);

  const tiles: Tile[] = useMemo(() => {
    const test = parseUnitFilter(query);
    if (openUnit) {
      const list = Array.isArray(loaded) ? loaded : [];
      return list
        .filter((f) => test({ name: f.name, totalCode: f.size, matchedCodePercent: f.fuzzy_match_percent }))
        .map((f) => ({
          key: `${f.name}@${f.address}`,
          label: f.name,
          size: f.size,
          matched: f.fuzzy_match_percent >= 100 ? 100 : 0,
          fuzzy: f.fuzzy_match_percent,
          address: f.address ?? 0,
          detail: `${f.address !== null ? `0x${f.address.toString(16).toUpperCase().padStart(8, "0")} · ` : ""}${bytes(f.size)} · ${f.fuzzy_match_percent >= 100 ? "matched" : `${f.fuzzy_match_percent.toFixed(1)}% match`}`,
        }));
    }
    return units
      .filter((u) => (!category || u.categories.includes(category)) && test(u))
      .map((u) => ({
        key: u.name,
        label: u.name,
        size: u.totalCode,
        matched: u.matchedCodePercent,
        fuzzy: u.fuzzy,
        detail: `${bytes(u.totalCode)} · ${u.matchedCodePercent.toFixed(2)}% matched · ${fmt.format(u.matchedFunctions)} / ${fmt.format(u.totalFunctions)} functions`,
        unit: u,
      }));
  }, [openUnit, loaded, units, category, query]);

  // "Ordered": code order (units grouped by folder, functions by address); "size": biggest first.
  const { rects, groups } = useMemo((): { rects: Rect<Tile>[]; groups: Rect<string>[] } => {
    if (!box.w || !box.h) return { rects: [], groups: [] };
    if (layout === "size") return { rects: squarify(tiles, (t) => t.size, box.w, box.h), groups: [] };
    if (openUnit) {
      const byAddress = [...tiles].sort((a, b) => (a.address ?? 0) - (b.address ?? 0));
      return { rects: ordered(byAddress, (t) => t.size, box.w, box.h), groups: [] };
    }
    const g = grouped(
      tiles,
      (t) => t.label,
      (t) => t.size,
      box.w,
      box.h,
    );
    return { rects: g.tiles, groups: g.groups };
  }, [tiles, box.w, box.h, layout, openUnit]);
  const usedCategories = useMemo(() => categories.filter((c) => units.some((u) => u.categories.includes(c.id))), [categories, units]);
  const shownBytes = tiles.reduce((n, t) => n + t.size, 0);
  const info = focus ?? pinned;

  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-[14rem_minmax(0,1fr)]">
        {openUnit ? (
          <button onClick={() => navigate(null)} className="btn btn-ghost justify-start">
            <ChevronRight size={14} className="rotate-180" />
            All units
          </button>
        ) : (
          <Select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category">
            <option value="">All</option>
            {usedCategories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name || c.id}
              </option>
            ))}
          </Select>
        )}
        <div className="relative">
          <Search size={15} className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-ink-3" />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={openUnit ? "Filter functions, e.g. <100% >512b" : "Filter, e.g. camera <70% >10kb"}
            aria-label={openUnit ? "Filter functions" : "Filter units"}
            className="field pl-10"
          />
        </div>
      </div>

      {/* Breadcrumb and the one-line readout for whatever is under the pointer (or pinned). */}
      <div className="mb-2 flex min-h-6 items-center gap-2 text-sm">
        <nav aria-label="Unit path" className="flex min-w-0 shrink-0 items-center gap-1.5">
          {openUnit ? (
            <>
              <button onClick={() => navigate(null)} className="text-accent hover:underline">
                Units
              </button>
              <ChevronRight size={12} className="text-ink-3" />
              <span className="max-w-[18rem] truncate font-mono text-[13px] text-ink">{openUnit}</span>
            </>
          ) : (
            <span className="text-ink-2">Units</span>
          )}
        </nav>
        <div className="ml-auto flex min-w-0 items-center gap-2 text-xs text-ink-3">
          {info ? (
            <>
              <span className="truncate font-mono text-ink-2">{info.label}</span>
              <span className="hidden shrink-0 sm:inline">{info.detail}</span>
              {pinned && !focus ? (
                <button onClick={() => setPinned(null)} className="rounded p-0.5 hover:text-ink" aria-label="Clear selection">
                  <Close size={12} />
                </button>
              ) : null}
            </>
          ) : (
            <span>{openUnit ? "Point at or tap a function for details" : "Point at a unit for details; select it to open"}</span>
          )}
        </div>
      </div>

      <div
        ref={grid}
        className="report-map relative w-full overflow-hidden border border-line bg-bg"
        style={{ height: "clamp(360px, calc(100vh - 360px), 720px)" }}
        onMouseLeave={() => setFocus(null)}
      >
        {rects.map(({ item: t, x, y, w, h }) => (
          <button
            key={t.key}
            type="button"
            tabIndex={-1}
            onMouseEnter={() => setFocus(t)}
            onClick={() => (t.unit ? navigate(t.unit.name) : setPinned((p) => (p?.key === t.key ? null : t)))}
            aria-label={`${t.label}: ${t.detail}`}
            className="absolute transition-[filter] duration-100 hover:brightness-125"
            style={{
              left: x,
              top: y,
              width: w,
              height: h,
              background: shade(t.matched, t.fuzzy),
              boxShadow: pinned?.key === t.key ? "inset 0 0 0 2px #fff" : "inset 0 0 0 0.5px rgb(3 6 12 / 0.75)",
            }}
          />
        ))}
        {groups.map((g) => (
          <div
            key={`g:${g.item}`}
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: g.x, top: g.y, width: g.w, height: g.h, boxShadow: "inset 0 0 0 1.5px rgb(3 6 12 / 0.9)" }}
          />
        ))}
        {openUnit && !loaded ? <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">Loading functions…</p> : null}
        {loaded === "error" ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-bad">Could not load this unit&apos;s functions.</p>
        ) : null}
        {openUnit && !unit && Array.isArray(loaded) && loaded.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">This unit has no functions.</p>
        ) : null}
        {!openUnit && rects.length === 0 && box.w ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">No units match.</p>
        ) : null}
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-ink-3">
        {LEGEND.map((l) => (
          <span key={l.label} className="flex items-center gap-1.5">
            <span className="size-2.5 rounded-sm" style={{ background: l.color }} />
            {l.label}
          </span>
        ))}
        <div className="segmented ml-auto" role="group" aria-label="Grid layout">
          <button
            type="button"
            aria-pressed={layout === "ordered"}
            onClick={() => setLayout("ordered")}
            title="Code order: units grouped by folder, functions by address"
          >
            Ordered
          </button>
          <button type="button" aria-pressed={layout === "size"} onClick={() => setLayout("size")} title="Largest first">
            By size
          </button>
        </div>
        <span>
          {fmt.format(tiles.length)} {openUnit ? "functions" : "units"} · {bytes(shownBytes)}
          {openUnit ? " · Esc to go back" : ""}
        </span>
      </div>
    </div>
  );
}
