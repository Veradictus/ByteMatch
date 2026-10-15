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

/** A project directory with comparable progress and report details on each row. */
export function ProjectList({ rows, empty }: { rows: ProjectRow[]; empty: React.ReactNode }) {
  return (
    <ul className="project-cards">
      {rows.map((r) => (
        <li key={`${r.owner}/${r.repo}`}>
          <article className="project-card">
            <div className="project-card-header">
              <div className="project-platform">
                <PlatformMark platform={r.platform} />
              </div>
              <div className="project-identity">
                <p className="project-repository">
                  {r.owner}/{r.repo}
                </p>
                <h2>
                  <Link href={`/${r.owner}/${r.repo}`} className="project-card-link">
                    {r.name}
                  </Link>
                </h2>
                <p className="project-edition">
                  {r.platformName ?? "Other platform"}
                  {r.version ? ` \u00b7 ${r.version}` : ""}
                </p>
              </div>
            </div>
            <div className="project-progress">
              <div className="project-progress-heading">
                <p className="project-card-percent">
                  {r.codePercent === null ? (
                    <span>Awaiting report</span>
                  ) : (
                    <>
                      <strong>
                        {r.codePercent.toFixed(2)}
                        <small>%</small>
                      </strong>
                      <span>matched</span>
                    </>
                  )}
                </p>
                {r.gain30 != null && Math.abs(r.gain30) >= 0.01 ? (
                  <span className={`project-gain ${r.gain30 > 0 ? "text-good" : "text-bad"}`} title="Percentage points changed in 30 days">
                    {r.gain30 > 0 ? "+" : ""}
                    {r.gain30.toFixed(2)} <span>/ 30d</span>
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
                <div className="match-track" aria-hidden="true" />
              )}
              <div className="project-card-meta">
                {r.functions ? (
                  <span>
                    {fmt.format(r.functions.done)} / {fmt.format(r.functions.total)} functions
                  </span>
                ) : (
                  <span>Waiting for the first report</span>
                )}
                {r.linkedPercent ? <span>{r.linkedPercent.toFixed(2)}% linked</span> : null}
                {r.updated ? <time dateTime={r.updated}>Updated {date.format(new Date(r.updated))}</time> : null}
              </div>
            </div>
            <Suspense fallback={null}>
              <ProjectHero name={r.name} manualUrl={r.image} kind="card" />
            </Suspense>
          </article>
        </li>
      ))}
      {!rows.length ? <li className="panel p-8 text-center text-ink-3">{empty}</li> : null}
    </ul>
  );
}
