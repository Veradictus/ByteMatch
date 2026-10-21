import Link from "next/link";
import type { VersionGame } from "@/db/schema";
import type { VersionSummary } from "@/db/store";
import { MatchProgress } from "./directory";
import { LocalTime } from "./local-time";
import { LinkPending } from "./link-pending";

const fmt = new Intl.NumberFormat("en-US");

/**
 * Every version of a project side by side, each with its own progress, so a repository holding
 * several regions or several games shows all of them, not just the one open. A card switches to
 * its version; one with only totals stored (history imported, no units) says so.
 */
export function VersionStrip({
  base,
  versions,
  current,
  defaultVersion,
  versionGames,
}: {
  base: string;
  versions: VersionSummary[];
  current: string;
  defaultVersion: string;
  versionGames: Record<string, VersionGame>;
}) {
  return (
    <nav aria-label="Versions" className="-mx-1 overflow-x-auto px-1 pb-1">
      <ul className="grid auto-cols-[minmax(13.5rem,1fr)] grid-flow-col gap-3">
        {versions.map((v) => {
          const here = v.version === current;
          const game = versionGames[v.version]?.game;
          const m = v.measures;
          return (
            <li key={v.version} className="min-w-0">
              <Link
                href={v.version === defaultVersion ? base : `${base}/${encodeURIComponent(v.version)}`}
                aria-current={here ? "page" : undefined}
                className={`panel block h-full p-4 transition-colors ${here ? "border-accent" : "hover:border-line-strong"}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className={`truncate text-sm ${here ? "font-semibold text-ink" : "font-medium text-ink-2"}`}>
                      {game ?? v.version}
                    </div>
                    {game ? <div className="truncate font-mono text-[11px] text-ink-3">{v.version}</div> : null}
                  </div>
                  <LinkPending />
                  <span className="shrink-0 font-mono text-sm text-ink">{m.matched_code_percent.toFixed(2)}%</span>
                </div>
                <div className="mt-3">
                  <MatchProgress
                    matched={m.matched_code_percent}
                    linked={m.complete_code_percent ?? 0}
                    fuzzy={m.fuzzy_match_percent ?? 0}
                    label={`${game ?? v.version}: code matched`}
                    className="match-track-sm"
                  />
                </div>
                <div className="mt-2.5 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-ink-3">
                  <span>
                    {fmt.format(m.matched_functions)} / {fmt.format(m.total_functions)} functions
                  </span>
                  <span>
                    · <LocalTime value={v.latest} style="date" />
                  </span>
                  {v.hasUnits ? null : <span title="Only totals are stored for this version, no units to browse">· totals only</span>}
                </div>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
