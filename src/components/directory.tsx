import Link from "next/link";
import { platformName } from "@/lib/platforms";
import type { ProjectRow } from "./project-list";

/**
 * The Directory layout's own markup (a theme's style picks it; see docs/theming.md), after the
 * redesign proposed in PR #1: a kicker-and-title heading and wide project cards with big figures.
 */

const fmt = new Intl.NumberFormat("en-US");
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

export function DirectoryHeading() {
  return (
    <header className="directory-heading">
      <div>
        <p className="directory-kicker">Matching decompilation</p>
        <h1 className="directory-title">Project directory</h1>
      </div>
      <div className="directory-intro">
        <p>Following the work of rebuilding games from source, one matching function at a time.</p>
        <Link href="/manage/new">
          Add your project <span aria-hidden>↗</span>
        </Link>
        <Link href="/docs">How it works</Link>
      </div>
    </header>
  );
}

/** A platform as a short code in a tile ("PS2", "GC"), so cards line up without logos. */
export function PlatformChip({ platform }: { platform: string | null }) {
  if (!platform) return <span className="platform-chip" aria-hidden />;
  return (
    <span className="platform-chip" title={platformName(platform) ?? platform}>
      {platform.length > 5 ? platform.slice(0, 4) : platform}
    </span>
  );
}

/** One wide bar: fully linked (solid), the rest of the match (hatched) and fuzzy (faint). */
export function MatchProgress({
  matched,
  linked = 0,
  fuzzy = 0,
  label,
}: {
  matched: number;
  linked?: number;
  fuzzy?: number;
  label: string;
}) {
  const clamp = (n: number) => Math.max(0, Math.min(100, Number.isFinite(n) ? n : 0));
  const l = clamp(linked);
  const m = Math.max(l, clamp(matched));
  const f = Math.max(m, clamp(fuzzy));
  const hatch = (c: string, d: string) => `repeating-linear-gradient(135deg, ${c} 0 7px, ${d} 7px 14px)`;
  const segments = [
    { key: "linked", width: l, background: "var(--done)" },
    { key: "matched", width: m - l, background: l ? hatch("var(--done)", "var(--done-deep)") : "var(--done)" },
    { key: "fuzzy", width: f - m, background: hatch("var(--partial)", "color-mix(in srgb, var(--partial) 55%, var(--surface))") },
  ].filter((s) => s.width > 0);
  return (
    <div
      className="match-track"
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={clamp(matched)}
      aria-valuetext={`${clamp(matched).toFixed(2)}% matched${l ? `, ${l.toFixed(2)}% fully linked` : ""}`}
    >
      {segments.map((s) => (
        <span key={s.key} style={{ width: `${s.width}%`, background: s.background }} />
      ))}
    </div>
  );
}

export function ProjectCards({ rows, empty }: { rows: ProjectRow[]; empty: React.ReactNode }) {
  return (
    <ul className="project-cards">
      {rows.map((r) => (
        <li key={`${r.owner}/${r.repo}`}>
          <article className="project-card">
            <div className="flex min-w-0 items-center gap-5">
              <PlatformChip platform={r.platform} />
              <div className="min-w-0">
                <p className="mb-1.5 font-mono text-[0.7rem] [overflow-wrap:anywhere] text-ink-3">
                  {r.owner}/{r.repo}
                </p>
                <h2 className="text-xl leading-snug font-semibold tracking-tight [overflow-wrap:anywhere]">
                  <Link href={r.path ?? `/${r.owner}/${r.repo}`} className="project-card-link">
                    {r.name}
                  </Link>
                </h2>
                <p className="mt-1.5 text-xs text-ink-3">
                  {r.platformName ?? "Other platform"}
                  {r.version ? ` · ${r.version}` : ""}
                </p>
              </div>
            </div>
            <div className="min-w-0">
              <div className="mb-2.5 flex items-baseline justify-between gap-3">
                {r.codePercent === null ? (
                  <span className="text-sm text-ink-3">Awaiting the first report</span>
                ) : (
                  <span className="flex items-baseline gap-2">
                    <strong className="big-figure text-2xl">
                      {r.codePercent.toFixed(2)}
                      <small>%</small>
                    </strong>
                    <span className="text-xs text-ink-3">matched</span>
                  </span>
                )}
                {r.gain30 != null && Math.abs(r.gain30) >= 0.01 ? (
                  <span
                    className={`font-mono text-xs whitespace-nowrap ${r.gain30 > 0 ? "text-good" : "text-bad"}`}
                    title="Percentage points changed in the last 30 days"
                  >
                    {r.gain30 > 0 ? "+" : "−"}
                    {Math.abs(r.gain30).toFixed(2)} <span className="text-ink-3">/ 30d</span>
                  </span>
                ) : null}
              </div>
              {r.codePercent !== null ? (
                <MatchProgress
                  matched={r.codePercent}
                  linked={r.linkedPercent ?? 0}
                  fuzzy={r.fuzzyPercent ?? 0}
                  label={`${r.name}: code matched`}
                />
              ) : (
                <div className="match-track" aria-hidden />
              )}
              <div className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-ink-3">
                {r.functions ? (
                  <span>
                    {fmt.format(r.functions.done)} / {fmt.format(r.functions.total)} functions
                  </span>
                ) : null}
                {r.linkedPercent ? <span>{r.linkedPercent.toFixed(2)}% linked</span> : null}
                {r.updated ? <time dateTime={r.updated}>Updated {date.format(new Date(r.updated))}</time> : null}
              </div>
            </div>
          </article>
        </li>
      ))}
      {rows.length === 0 ? (
        <li className="border border-t-0 border-line bg-surface px-5 py-12 text-center text-sm text-ink-3">{empty}</li>
      ) : null}
    </ul>
  );
}
