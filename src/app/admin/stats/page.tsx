import Link from "next/link";
import { siteStats } from "@/lib/stats";
import { DailyBars } from "./bar-chart";

export const dynamic = "force-dynamic";

const fmt = new Intl.NumberFormat("en-US");
const RANGES = [30, 90] as const;

function Tile({ label, value, detail }: { label: string; value: string; detail?: string }) {
  return (
    <div className="panel p-4">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-1 font-mono text-2xl text-ink">{value}</div>
      {detail ? <div className="mt-0.5 text-xs text-ink-3">{detail}</div> : null}
    </div>
  );
}

function Top({ title, rows, empty }: { title: string; rows: { key: string; label: React.ReactNode; value: number }[]; empty: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <section className="panel p-5">
      <h2 className="mb-3 text-sm font-semibold">{title}</h2>
      {rows.length ? (
        <ol className="grid gap-1.5 text-sm">
          {rows.map((r) => (
            <li key={r.key} className="relative grid grid-cols-[minmax(0,1fr)_auto] gap-3 rounded px-2 py-1">
              <span aria-hidden className="absolute inset-y-0 left-0 rounded bg-surface-2" style={{ width: `${(r.value / max) * 100}%` }} />
              <span className="relative truncate">{r.label}</span>
              <span className="relative font-mono text-ink-2">{fmt.format(r.value)}</span>
            </li>
          ))}
        </ol>
      ) : (
        <p className="text-sm text-ink-3">{empty}</p>
      )}
    </section>
  );
}

/** Growth at a glance: visitors and page views, users, projects and what they're doing. */
export default async function AdminStats({ searchParams }: { searchParams: Promise<{ range?: string }> }) {
  const asked = Number((await searchParams).range);
  const range = (RANGES as readonly number[]).includes(asked) ? asked : 30;
  const s = await siteStats(range);
  const c = s.counts;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          Days are UTC. Visitors are counted per day without cookies or stored addresses, and only on public pages; browsers that ask not to
          be tracked aren&apos;t counted.
        </p>
        <div className="segmented" role="group" aria-label="Range">
          {RANGES.map((r) => (
            <Link
              key={r}
              href={`/admin/stats?range=${r}`}
              aria-current={r === range ? "page" : undefined}
              className="rounded-[0.45rem] px-2.5 py-1 text-xs text-ink-3 hover:text-ink aria-[current=page]:bg-surface-3 aria-[current=page]:text-ink"
            >
              {r} days
            </Link>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <Tile label="Visitors today" value={fmt.format(s.today.visitors)} detail={`${fmt.format(s.today.views)} page views`} />
        <Tile
          label="Visitors a day"
          // Small averages keep a decimal, so a quiet week doesn't read as nobody.
          value={s.avgVisitors7 < 10 ? s.avgVisitors7.toFixed(1) : fmt.format(Math.round(s.avgVisitors7))}
          detail="average, last 7 days"
        />
        <Tile label={`Page views, ${range} days`} value={fmt.format(s.views)} detail={`${fmt.format(s.visitorDays)} visitor-days`} />
        <Tile
          label="Users"
          value={fmt.format(c.users)}
          detail={`${fmt.format(c.new_users)} new, ${fmt.format(c.active_users)} signed in, ${range} days`}
        />
        <Tile
          label="Projects"
          value={fmt.format(c.projects)}
          detail={`${fmt.format(c.new_projects)} new in ${range} days · ${fmt.format(c.games)} games`}
        />
        <Tile
          label={`Reports, ${range} days`}
          value={fmt.format(c.reports)}
          detail={`from CI and uploads · ${fmt.format(c.themes)} shared themes`}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold">Visitors per day</h2>
          <DailyBars data={s.days.map((d) => ({ day: d.day, value: d.visitors }))} color="var(--series-1)" unit="visitors" />
        </section>
        <section className="panel p-5">
          <h2 className="mb-3 text-sm font-semibold">Page views per day</h2>
          <DailyBars data={s.days.map((d) => ({ day: d.day, value: d.views }))} color="var(--series-2)" unit="page views" />
        </section>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Top
          title={`Most viewed pages, ${range} days`}
          empty="No page views yet."
          rows={s.pages.map((p) => ({
            key: p.path,
            label: (
              <Link href={p.path} className="font-mono text-xs hover:underline">
                {p.path}
              </Link>
            ),
            value: p.views,
          }))}
        />
        <Top
          title={`Where visitors came from, ${range} days`}
          empty="No visits from other sites yet."
          rows={s.referrers.map((r) => ({ key: r.host, label: r.host, value: r.visits }))}
        />
      </div>

      <section className="panel overflow-x-auto">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">By week</h2>
        <table className="w-full min-w-[36rem] text-sm">
          <thead className="border-b border-line text-left text-xs text-ink-3">
            <tr>
              <th className="px-5 py-2.5 font-medium">Week of</th>
              {["New projects", "New users", "Reports", "Page views", "Visitor-days"].map((h) => (
                <th key={h} className="px-3 py-2.5 text-right font-medium">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-line font-mono">
            {s.weeks.map((w) => (
              <tr key={w.week}>
                <td className="px-5 py-2 font-sans text-ink-2">{w.week}</td>
                {[w.projects, w.users, w.reports, w.views, w.visitor_days].map((v, i) => (
                  <td key={i} className={`px-3 py-2 text-right ${v ? "text-ink" : "text-ink-3"}`}>
                    {fmt.format(v)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
