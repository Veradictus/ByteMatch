import { sql } from "drizzle-orm";
import { db } from "../db/client";

/** Everything the admin Statistics page shows, over the last RANGE days (days in UTC). */
export async function siteStats(range: number) {
  const d = db();
  const days = await d.execute<{ day: string; visitors: number; views: number }>(sql`
    with span as (select generate_series(current_date - (${range}::int - 1), current_date, interval '1 day')::date as day),
    live as (select day, count(*)::int as visitors from traffic_visitors group by day)
    select to_char(s.day, 'YYYY-MM-DD') as day,
           coalesce(t.visitors, l.visitors, 0)::int as visitors,
           coalesce((select sum(views) from traffic_pages p where p.day = s.day), 0)::int as views
    from span s
    left join traffic_days t on t.day = s.day
    left join live l on l.day = s.day
    order by s.day`);
  const [pages, referrers, [counts], weeks] = await Promise.all([
    d.execute<{ path: string; views: number }>(sql`
      select path, sum(views)::int as views from traffic_pages
      where day > current_date - ${range}::int group by path order by views desc limit 15`),
    d.execute<{ host: string; visits: number }>(sql`
      select host, sum(visits)::int as visits from traffic_referrers
      where day > current_date - ${range}::int group by host order by visits desc limit 10`),
    d.execute<{
      users: number;
      new_users: number;
      active_users: number;
      projects: number;
      new_projects: number;
      reports: number;
      games: number;
      themes: number;
    }>(sql`
      select (select count(*) from users)::int as users,
             (select count(*) from users where created_at > now() - make_interval(days => ${range}))::int as new_users,
             (select count(distinct user_id) from sessions where created_at > now() - make_interval(days => ${range}))::int as active_users,
             (select count(*) from projects where enabled)::int as projects,
             (select count(*) from projects where enabled and created_at > now() - make_interval(days => ${range}))::int as new_projects,
             (select count(*) from reports where source in ('artifact', 'upload') and created_at > now() - make_interval(days => ${range}))::int as reports,
             (select count(distinct lower(game)) from projects where enabled and game is not null)::int as games,
             (select count(*) from shared_themes where removed_at is null)::int as themes`),
    d.execute<{ week: string; projects: number; users: number; reports: number; views: number; visitor_days: number }>(sql`
      with w as (select generate_series(date_trunc('week', current_date) - interval '11 weeks', date_trunc('week', current_date), interval '1 week')::date as week)
      select to_char(w.week, 'YYYY-MM-DD') as week,
             (select count(*) from projects p where p.created_at >= w.week and p.created_at < w.week + 7)::int as projects,
             (select count(*) from users u where u.created_at >= w.week and u.created_at < w.week + 7)::int as users,
             (select count(*) from reports r where r.source in ('artifact', 'upload') and r.created_at >= w.week and r.created_at < w.week + 7)::int as reports,
             (select coalesce(sum(views), 0) from traffic_pages t where t.day >= w.week and t.day < w.week + 7)::int as views,
             ((select coalesce(sum(visitors), 0) from traffic_days t where t.day >= w.week and t.day < w.week + 7)
               + (select count(*) from traffic_visitors v where v.day >= w.week and v.day < w.week + 7
                    and not exists (select 1 from traffic_days t where t.day = v.day)))::int as visitor_days
      from w order by w.week desc`),
  ]);
  const series = [...days];
  const today = series.at(-1) ?? { visitors: 0, views: 0 };
  const last7 = series.slice(-7);
  return {
    days: series,
    today,
    avgVisitors7: last7.length ? last7.reduce((n, x) => n + x.visitors, 0) / last7.length : 0,
    views: series.reduce((n, x) => n + x.views, 0),
    visitorDays: series.reduce((n, x) => n + x.visitors, 0),
    pages: [...pages],
    referrers: [...referrers],
    counts,
    weeks: [...weeks],
  };
}
