import { describe, expect, it } from "vitest";
import { TEST_DB, useTestDb } from "../../test/db";
import { siteStats } from "../lib/stats";
import { utcDay } from "../lib/traffic";
import { recordHit, rollUpTraffic } from "./traffic";

describe.skipIf(!TEST_DB)("traffic", () => {
  useTestDb();

  it("counts views per page, visitors once a day, and referrers", async () => {
    const day = utcDay();
    await recordHit({ day, path: "/", visitor: "a", referrer: "github.com" });
    await recordHit({ day, path: "/games", visitor: "a", referrer: null });
    await recordHit({ day, path: "/", visitor: "b", referrer: "github.com" });
    const s = await siteStats(30);
    expect(s.today).toMatchObject({ visitors: 2, views: 3 });
    expect(s.pages).toEqual([
      { path: "/", views: 2 },
      { path: "/games", views: 1 },
    ]);
    expect(s.referrers).toEqual([{ host: "github.com", visits: 2 }]);
    expect(s.days).toHaveLength(30);
  });

  it("rolls finished days up into counts and forgets their visitors", async () => {
    const today = utcDay();
    const old = utcDay(new Date(Date.now() - 3 * 86400_000));
    for (const v of ["a", "b", "c"]) await recordHit({ day: old, path: "/", visitor: v, referrer: null });
    await recordHit({ day: today, path: "/", visitor: "a", referrer: null });
    expect(await rollUpTraffic(today)).toBe(3);
    const s = await siteStats(30);
    expect(s.days.find((d) => d.day === old)).toMatchObject({ visitors: 3, views: 3 });
    expect(s.today.visitors).toBe(1);
    // Rolling up again changes nothing.
    await rollUpTraffic(today);
    expect((await siteStats(30)).days.find((d) => d.day === old)?.visitors).toBe(3);
  });
});
