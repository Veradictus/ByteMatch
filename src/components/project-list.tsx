import Link from "next/link";
import { ExternalImage } from "./external-image";
import { ProgressBar } from "./progress-bar";

export interface ProjectRow {
  /** Where the row links: the project page, or one version's page for a version that's its own game. */
  path?: string;
  owner: string;
  repo: string;
  name: string;
  platform: string | null;
  platformName: string | null;
  game?: string | null;
  franchise?: string | null;
  version: string | null;
  codePercent: number | null;
  linkedPercent?: number | null;
  fuzzyPercent?: number | null;
  functions: { done: number; total: number } | null;
  updated: string | null;
  image: string | null;
  matchedFunctions?: number | null;
  totalCode?: number | null;
  gain30?: number | null;
  createdAt?: string | null;
}

const fmt = new Intl.NumberFormat("en-US");

function Initial({ name }: { name: string }) {
  return (
    <div
      className="grid size-11 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-sm font-semibold text-ink-3"
      aria-hidden
    >
      {name.slice(0, 1)}
    </div>
  );
}

/** One page of projects. Filtering, sorting and paging happen on the server, from the URL. */
export function ProjectList({ rows, empty }: { rows: ProjectRow[]; empty: React.ReactNode }) {
  return (
    <ul className="panel divide-y divide-line overflow-hidden">
      {rows.map((r) => (
        <li key={`${r.owner}/${r.repo}`}>
          <Link
            href={r.path ?? `/${r.owner}/${r.repo}`}
            className="grid gap-x-6 gap-y-2 px-5 py-4 transition-colors hover:bg-surface-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_9rem] sm:items-center"
          >
            <div className="flex min-w-0 items-center gap-3.5">
              {r.image ? (
                <ExternalImage
                  src={r.image}
                  className="size-11 shrink-0 rounded-lg border border-line object-cover"
                  fallback={<Initial name={r.name} />}
                />
              ) : (
                <Initial name={r.name} />
              )}
              <div className="min-w-0">
                <div className="truncate font-medium">{r.name}</div>
                <div className="truncate text-xs text-ink-3">
                  {r.owner}/{r.repo}
                  {r.platformName ? ` · ${r.platformName}` : ""}
                  {r.version ? ` · ${r.version}` : ""}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {r.codePercent === null ? (
                <span className="text-sm text-ink-3">Syncing, no reports yet</span>
              ) : (
                <>
                  <ProgressBar value={r.codePercent} label={`${r.name}: code matched`} />
                  <span className="w-16 shrink-0 text-right font-mono text-sm">{r.codePercent.toFixed(2)}%</span>
                  {r.gain30 && r.gain30 >= 0.01 ? (
                    <span className="hidden shrink-0 font-mono text-xs text-good md:inline" title="Matched code gained in the last 30 days">
                      +{r.gain30.toFixed(2)}
                    </span>
                  ) : null}
                </>
              )}
            </div>
            <div className="text-sm text-ink-2 sm:text-right">
              {r.functions ? (
                <span className="font-mono">
                  {fmt.format(r.functions.done)} / {fmt.format(r.functions.total)}
                </span>
              ) : null}
              <div className="text-xs text-ink-3">functions</div>
            </div>
          </Link>
        </li>
      ))}
      {rows.length === 0 ? <li className="px-5 py-12 text-center text-sm text-ink-3">{empty}</li> : null}
    </ul>
  );
}
