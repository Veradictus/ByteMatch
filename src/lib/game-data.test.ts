import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { makeProject, TEST_DB, useTestDb } from "../../test/db";
import { db } from "../db/client";
import { projects } from "../db/schema";
import { storeReport } from "../db/store";
import { parseReport } from "../report/parse";
import { loadGames } from "./game-data";

const report = () => parseReport(readFileSync(new URL("../../test/fixtures/report-v2.json", import.meta.url)));

describe.skipIf(!TEST_DB)("games from versions", () => {
  useTestDb();

  it("puts a version that's its own game on that game's page, linking to the version", async () => {
    const p = await makeProject({
      owner: "Almamu",
      repo: "CrashBandicootXS-decomp",
      name: "Crash XS",
      game: "Crash Bandicoot XS",
      defaultVersion: "xs",
    });
    for (const version of ["xs", "n-tranced"]) {
      await storeReport({
        project: p,
        version,
        commit: { sha: `s-${version}`, timestamp: new Date() },
        report: report(),
        source: "upload",
      });
    }
    await db()
      .update(projects)
      .set({ versionGames: { "n-tranced": { game: "Crash Bandicoot 2: N-Tranced", franchise: "Crash Bandicoot", releaseYear: 2003 } } })
      .where(eq(projects.id, p.id));
    const { games, franchises } = await loadGames();
    expect(games.map((g) => g.title).sort()).toEqual(["Crash Bandicoot 2: N-Tranced", "Crash Bandicoot XS"]);
    const nt = games.find((g) => g.title.includes("N-Tranced"))!;
    expect(nt.year).toBe(2003);
    expect(nt.projects).toHaveLength(1);
    expect(nt.projects[0]).toMatchObject({ version: "n-tranced", path: "/Almamu/CrashBandicootXS-decomp/n-tranced" });
    expect(games.find((g) => g.title === "Crash Bandicoot XS")!.projects[0].path).toBeUndefined();
    expect(franchises.map((f) => f.title)).toEqual(["Crash Bandicoot"]);
  });
});
