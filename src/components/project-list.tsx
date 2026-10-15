import Link from "next/link";
import { Suspense } from "react";
import { ProjectHero } from "./project-hero";
import { MatchProgress } from "./match-progress";
import { PlatformMark } from "./platform-mark";

export interface ProjectRow {
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
const date = new Intl.DateTimeFormat("en-US", { dateStyle: "medium" });

/** Full-width cards use the actual report measures; missing reports remain visibly pending. */
export function ProjectList({ rows, empty }: { rows: ProjectRow[]; empty: React.ReactNode }) {
  return (
    <ul className="project-cards">
      {rows.map((r) => (
        <li key={`${r.owner}/${r.repo}`}>
          <article className="project-card">
            <Suspense fallback={null}>
              <ProjectHero name={r.name} manualUrl={r.image} kind="card" />
            </Suspense>
            <div className="project-card-header">
              <h2>
                <Link href={`/${r.owner}/${r.repo}`} className="project-card-link">
                  {r.name}
                </Link>
              </h2>
              <PlatformMark platform={r.platform} />
            </div>
            <p className="project-card-percent">
              {r.codePercent === null ? "Awaiting report" : `${r.codePercent.toFixed(2)}% decompiled`}
              {r.linkedPercent ? ` | ${r.linkedPercent.toFixed(2)}% fully linked` : ""}
            </p>
            {r.codePercent !== null ? (
              <MatchProgress
                matched={r.codePercent}
                linked={r.linkedPercent ?? 0}
                fuzzy={r.fuzzyPercent ?? 0}
                label={`${r.name}: code matched`}
              />
            ) : (
              <div className="match-track" aria-hidden="true" />
            )}
            <div className="project-card-meta">
              {r.updated ? (
                <time dateTime={r.updated}>Updated {date.format(new Date(r.updated))}</time>
              ) : (
                <span>Waiting for the first report</span>
              )}
              {r.functions ? (
                <span>
                  {fmt.format(r.functions.done)} / {fmt.format(r.functions.total)} functions
                </span>
              ) : null}
              {r.version ? <span>{r.version}</span> : null}
              {r.gain30 != null && Math.abs(r.gain30) >= 0.01 ? (
                <span className={r.gain30 > 0 ? "text-good" : "text-bad"} title="Percentage points changed in 30 days">
                  {r.gain30 > 0 ? "+" : ""}
                  {r.gain30.toFixed(2)} in 30 days
                </span>
              ) : null}
            </div>
          </article>
        </li>
      ))}
      {!rows.length ? <li className="panel p-8 text-center text-ink-3">{empty}</li> : null}
    </ul>
  );
}
