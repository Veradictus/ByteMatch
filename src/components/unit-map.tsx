"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition } from "react";
import { grouped, ordered, squarify, type Rect } from "./treemap";
import { parseUnitFilter } from "./unit-filter";
import { ChevronRight, Close, Search } from "./ui/icons";
import { Select } from "./ui/select";
import { MatchProgress } from "./directory";
import { SourcePanel } from "./source-panel";
import { diffSnapshots, nextComparison, type Change, type Changes, type Snapshot } from "./map-changes";

export interface MapUnit {
  name: string;
  totalCode: number;
  matchedCodePercent: number;
  /** How much of its code is fully linked (complete); 0 to 100. */
  completeCodePercent: number;
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
  /** Has functional C (not matched), and the project's confidence in it. */
  functional?: string | null;
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
  /** How it differs from the commit the viewer came from. */
  change?: Change;
}

const fmt = new Intl.NumberFormat("en-US");
const bytes = (n: number) =>
  n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(2)} MB` : n >= 1024 ? `${(n / 1024).toFixed(1)} KB` : `${n} B`;

// ---- Tile shading: one hue per state, lit from the centre and falling off to the edges. ----

// Tile colours are the theme's --tile-* tokens (globals.css), so the grid follows the theme.
// In progress blends from --tile-low to --tile-high by how close the unit is to matching.

function baseColor(matched: number, fuzzy: number): string {
  if (matched >= 100) return "var(--tile-done)";
  if (fuzzy <= 0) return "var(--idle)";
  const t = Math.round(Math.min(1, fuzzy / 100) * 100);
  return `color-mix(in srgb, var(--tile-high) ${t}%, var(--tile-low))`;
}

/** Lit from the centre, falling off to the edges. The flat colour stays as a fallback. */
function shade(matched: number, fuzzy: number): React.CSSProperties {
  const base = baseColor(matched, fuzzy);
  const lit = (k: number) => `rgb(from ${base} calc(r * ${k}) calc(g * ${k}) calc(b * ${k}))`;
  return {
    backgroundColor: base,
    backgroundImage: `radial-gradient(ellipse 85% 85% at 50% 42%, ${lit(1.18)} 0%, ${base} 52%, ${lit(0.62)} 100%)`,
  };
}

const CHANGE_COLOR: Record<Change["kind"], string> = { up: "var(--good)", down: "var(--bad)", new: "var(--accent)" };

/** A tile's change, for its readout: what it was at the older commit and what it is at the newer. */
function changeNote(c: Change | undefined, all: Changes | undefined): string {
  if (!c || !all) return "";
  const pct = (n: number) => `${n >= 100 ? 100 : n.toFixed(1)}%`;
  if (c.kind === "new") return ` · new since ${all.older.slice(0, 7)}`;
  return ` · ${c.kind === "up" ? "improved" : "regressed"} ${pct(c.from ?? 0)} → ${pct(c.to)} (${all.older.slice(0, 7)} → ${all.newer.slice(0, 7)})`;
}

const LEGEND = [
  { label: "Matched", color: baseColor(100, 100) },
  { label: "In progress", color: baseColor(0, 70) },
  { label: "Not started", color: baseColor(0, 0) },
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
  sha,
  time,
}: {
  units: MapUnit[];
  categories: { id: string; name: string }[];
  /** The shown commit, in full, and its time (ms): moving to another commit compares against it. */
  sha: string;
  time: number;
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

  // In the URL, so it stays put when the page moves to another commit.
  const category = search.get("category") ?? "";
  const setCategory = (next: string) => {
    const qs = new URLSearchParams(search.toString());
    if (next) qs.set("category", next);
    else qs.delete("category");
    const s = qs.toString();
    start(() => router.replace(`${path}${s ? `?${s}` : ""}`, { scroll: false }));
  };
  const [query, setQuery] = useState("");
  const [focus, setFocus] = useState<Tile | null>(null);
  const [pinned, setPinned] = useState<Tile | null>(null);
  /** Whose source is shown under the map: the open unit's (fn null) or one of its functions. */
  const [source, setSource] = useState<{ unit: string; fn: string | null } | null>(null);
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
      setSource(null);
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

  // What each level of the map last showed (the units, or one unit's functions), at which commit.
  // Moving to another commit compares against it, and a unit's functions stay on screen from the
  // last commit until this one's arrive, instead of the grid going blank.
  const level = openUnit ? `fn:${openUnit}` : "units";
  const [seen, setSeen] = useState<Record<string, Snapshot<MapUnit | FunctionRow>>>({});
  const [changes, setChanges] = useState<Record<string, Changes & { n: number }>>({});
  const [onlyChanged, setOnlyChanged] = useState(false);
  const current: MapUnit[] | FunctionRow[] | null = openUnit ? (Array.isArray(loaded) ? loaded : null) : units;
  const last = seen[level];
  if (current && last?.sha !== sha) {
    // Adjusting state while rendering, as React suggests for "props changed": it runs once per commit change.
    const now: Snapshot<MapUnit | FunctionRow> = { sha, time, items: current };
    if (last) {
      const d = openUnit
        ? diffSnapshots(
            last as Snapshot<FunctionRow>,
            now as Snapshot<FunctionRow>,
            (f) => `${f.name}@${f.address}`,
            (f) => ((f.fuzzy_match_percent ?? 0) >= 100 ? 100 : 0),
            (f) => f.fuzzy_match_percent ?? 0,
          )
        : diffSnapshots(
            last as Snapshot<MapUnit>,
            now as Snapshot<MapUnit>,
            (u) => u.name,
            (u) => u.matchedCodePercent,
            (u) => u.fuzzy ?? 0,
          );
      setChanges((c) => ({ ...c, [level]: { ...d, n: nextComparison() } }));
    }
    setSeen((v) => ({ ...v, [level]: now }));
  }
  const levelChanges = changes[level];
  const stale = openUnit && !Array.isArray(loaded) && last ? (last.items as FunctionRow[]) : null;
  const shownFunctions = Array.isArray(loaded) ? loaded : stale;

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
    const changed = levelChanges && !stale ? levelChanges.byKey : null;
    const keep = (k: string) => !onlyChanged || !changed || changed.has(k);
    if (openUnit) {
      const list = shownFunctions ?? [];
      return list
        .filter((f) => test({ name: f.name, totalCode: f.size, matchedCodePercent: f.fuzzy_match_percent }))
        .filter((f) => keep(`${f.name}@${f.address}`))
        .map((f) => ({
          key: `${f.name}@${f.address}`,
          label: f.name,
          size: f.size,
          matched: f.fuzzy_match_percent >= 100 ? 100 : 0,
          fuzzy: f.fuzzy_match_percent,
          address: f.address ?? 0,
          detail: `${f.address !== null ? `0x${f.address.toString(16).toUpperCase().padStart(8, "0")} · ` : ""}${bytes(f.size)} · ${f.fuzzy_match_percent >= 100 ? "matched" : `${f.fuzzy_match_percent.toFixed(1)}% match`}${f.functional ? ` · functional C (${f.functional} confidence)` : ""}${changeNote(changed?.get(`${f.name}@${f.address}`), levelChanges)}`,
          change: changed?.get(`${f.name}@${f.address}`),
        }));
    }
    return units
      .filter((u) => (!category || u.categories.includes(category)) && test(u) && keep(u.name))
      .map((u) => ({
        key: u.name,
        label: u.name,
        size: u.totalCode,
        matched: u.matchedCodePercent,
        fuzzy: u.fuzzy,
        detail: `${bytes(u.totalCode)} · ${u.matchedCodePercent.toFixed(2)}% matched · ${fmt.format(u.matchedFunctions)} / ${fmt.format(u.totalFunctions)} functions${changeNote(changed?.get(u.name), levelChanges)}`,
        unit: u,
        change: changed?.get(u.name),
      }));
  }, [openUnit, shownFunctions, stale, units, category, query, levelChanges, onlyChanged]);

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
          <Select
            value={category}
            onChange={(v) => setCategory(v)}
            aria-label="Category"
            options={[{ value: "", label: "All" }, ...usedCategories.map((c) => ({ value: c.id, label: c.name || c.id }))]}
          />
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
              <button
                type="button"
                onClick={() => setSource({ unit: openUnit, fn: null })}
                aria-pressed={source?.fn === null}
                className="ml-1 rounded-md border border-line px-2 py-0.5 text-xs text-ink-2 hover:border-line-strong hover:text-ink"
              >
                View source
              </button>
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
            <span>
              {openUnit ? "Point at a function for details; select it to see its code" : "Point at a unit for details; select it to open"}
            </span>
          )}
        </div>
      </div>

      {levelChanges && !stale ? (
        <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink-3" role="status">
          {levelChanges.byKey.size ? (
            <>
              {levelChanges.up ? (
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2.5 rounded-sm" style={{ boxShadow: "inset 0 0 0 2px var(--good)" }} />
                  {levelChanges.up} improved
                </span>
              ) : null}
              {levelChanges.down ? (
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2.5 rounded-sm" style={{ boxShadow: "inset 0 0 0 2px var(--bad)" }} />
                  {levelChanges.down} regressed
                </span>
              ) : null}
              {levelChanges.added ? (
                <span className="flex items-center gap-1.5 text-ink-2">
                  <span className="size-2.5 rounded-sm" style={{ boxShadow: "inset 0 0 0 2px var(--accent)" }} />
                  {levelChanges.added} new
                </span>
              ) : null}
            </>
          ) : (
            <span className="text-ink-2">No {openUnit ? "function" : "unit"} changed</span>
          )}
          <span>
            between <span className="font-mono">{levelChanges.older.slice(0, 7)}</span> and{" "}
            <span className="font-mono">{levelChanges.newer.slice(0, 7)}</span>
          </span>
          <span className="ml-auto flex items-center gap-2">
            {levelChanges.byKey.size ? (
              <button
                type="button"
                aria-pressed={onlyChanged}
                onClick={() => setOnlyChanged((v) => !v)}
                className={`rounded-md border px-2 py-0.5 ${onlyChanged ? "border-line-strong text-ink" : "border-line hover:text-ink"}`}
              >
                Only changed
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setChanges((c) => {
                  const { [level]: _gone, ...rest } = c;
                  return rest;
                });
                setOnlyChanged(false);
              }}
              className="rounded p-0.5 hover:text-ink"
              aria-label="Hide changes"
            >
              <Close size={12} />
            </button>
          </span>
        </div>
      ) : null}

      {unit ? (
        <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg border border-line bg-surface-2 px-3 py-2.5 text-xs text-ink-3">
          <div className="min-w-48 flex-1">
            <MatchProgress
              matched={unit.matchedCodePercent}
              linked={unit.completeCodePercent}
              fuzzy={unit.fuzzy}
              color={baseColor(unit.matchedCodePercent, unit.fuzzy)}
              label={`${unit.name} progress`}
              className="unit-progress"
            />
          </div>
          <span className="tabular-nums">
            <span className="text-sm font-semibold text-ink">{unit.matchedCodePercent.toFixed(2)}%</span> matched
            {unit.fuzzy > unit.matchedCodePercent ? <> · {unit.fuzzy.toFixed(2)}% fuzzy</> : null} · {fmt.format(unit.matchedFunctions)} /{" "}
            {fmt.format(unit.totalFunctions)} functions · {bytes(unit.totalCode)}
          </span>
        </div>
      ) : null}

      <div
        ref={grid}
        className="relative w-full overflow-hidden rounded-xl border border-line bg-bg"
        data-changes={levelChanges?.byKey.size && !stale ? (levelChanges.n % 2 ? "a" : "b") : undefined}
        style={{ height: "clamp(360px, calc(100vh - 360px), 720px)" }}
        onMouseLeave={() => setFocus(null)}
      >
        {rects.map(({ item: t, x, y, w, h }) => (
          <button
            // A changed tile takes a new key per comparison, so its pulse plays again.
            key={t.change && levelChanges ? `${t.key}~${levelChanges.older}:${levelChanges.newer}` : t.key}
            type="button"
            tabIndex={-1}
            onMouseEnter={() => setFocus(t)}
            onClick={() => {
              if (t.unit) return navigate(t.unit.name);
              // A function: select it and show its code (again to deselect).
              const off = pinned?.key === t.key;
              setPinned(off ? null : t);
              setSource(off || !openUnit ? null : { unit: openUnit, fn: t.label });
            }}
            aria-label={`${t.label}: ${t.detail}`}
            className={`absolute transition-[filter] duration-100 hover:brightness-125 ${t.change ? "tile-change" : ""}`}
            style={{
              ...(t.change ? ({ "--change": CHANGE_COLOR[t.change.kind] } as React.CSSProperties) : {}),
              left: x,
              top: y,
              width: w,
              height: h,
              ...shade(t.matched, t.fuzzy),
              boxShadow: pinned?.key === t.key ? "inset 0 0 0 2px var(--text)" : "inset 0 0 0 0.5px var(--seam)",
            }}
          />
        ))}
        {groups.map((g) => (
          <div
            key={`g:${g.item}`}
            aria-hidden
            className="pointer-events-none absolute"
            style={{ left: g.x, top: g.y, width: g.w, height: g.h, boxShadow: "inset 0 0 0 1.5px var(--seam-strong)" }}
          />
        ))}
        {openUnit && !loaded && !stale ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">Loading functions…</p>
        ) : null}
        {stale ? (
          <p className="pointer-events-none absolute top-2 right-2 rounded-md border border-line bg-surface/90 px-2 py-1 text-xs text-ink-2">
            Loading this commit…
          </p>
        ) : null}
        {loaded === "error" ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-bad">Could not load this unit&apos;s functions.</p>
        ) : null}
        {onlyChanged && rects.length === 0 && box.w ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">Nothing here changed.</p>
        ) : null}
        {openUnit && !unit && Array.isArray(loaded) && loaded.length === 0 ? (
          <p className="absolute inset-0 grid place-items-center text-sm text-ink-3">This unit has no functions.</p>
        ) : null}
        {!openUnit && !onlyChanged && rects.length === 0 && box.w ? (
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
      {source && openUnit ? (
        <SourcePanel
          owner={owner}
          repo={repo}
          version={version}
          commit={commit}
          unit={source.unit}
          fn={source.fn}
          onClose={() => {
            setSource(null);
            setPinned(null);
          }}
        />
      ) : null}
    </div>
  );
}
