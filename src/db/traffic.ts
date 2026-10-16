import { and, lt, sql } from "drizzle-orm";
import { db } from "./client";
import { trafficDays, trafficPages, trafficReferrers, trafficVisitors } from "./schema";

/** One page view. Three small upserts; the visitor only counts once a day. */
export async function recordHit(hit: { day: string; path: string; visitor: string; referrer: string | null }) {
  const d = db();
  await Promise.all([
    d.insert(trafficVisitors).values({ day: hit.day, hash: hit.visitor }).onConflictDoNothing(),
    d
      .insert(trafficPages)
      .values({ day: hit.day, path: hit.path, views: 1 })
      .onConflictDoUpdate({ target: [trafficPages.day, trafficPages.path], set: { views: sql`${trafficPages.views} + 1` } }),
    hit.referrer
      ? d
          .insert(trafficReferrers)
          .values({ day: hit.day, host: hit.referrer, visits: 1 })
          .onConflictDoUpdate({
            target: [trafficReferrers.day, trafficReferrers.host],
            set: { visits: sql`${trafficReferrers.visits} + 1` },
          })
      : Promise.resolve(),
  ]);
}

/**
 * Turns finished days' visitor hashes into counts and deletes the hashes (yesterday's are kept a
 * day longer, for visits that span midnight). Run nightly by the worker's prune job.
 */
export async function rollUpTraffic(today: string): Promise<number> {
  const d = db();
  await d.execute(sql`
    insert into ${trafficDays} (day, visitors)
    select day, count(*)::int from ${trafficVisitors} where day < ${today}::date group by day
    on conflict (day) do update set visitors = excluded.visitors`);
  const gone = await d
    .delete(trafficVisitors)
    .where(and(lt(trafficVisitors.day, sql`${today}::date - 1`)))
    .returning({ day: trafficVisitors.day });
  return gone.length;
}
