import { describe, expect, it } from "vitest";
import { orderVersions, versionLabel } from "./versions";

describe("versions", () => {
  it("puts the primary first, then the arranged order, then the rest", () => {
    expect(orderVersions(["us", "eu", "de", "jp"], { defaultVersion: "de", versionOrder: ["de", "jp", "us"] })).toEqual([
      "de",
      "jp",
      "us",
      "eu",
    ]);
    expect(orderVersions(["us", "eu"], { defaultVersion: null, versionOrder: [] })).toEqual(["us", "eu"]);
  });
  it("names versions by their label, their game, or the project's game", () => {
    const p = {
      game: "Crash Bandicoot XS",
      defaultVersion: "n2",
      versionGames: { n2: { game: "Crash Bandicoot 2: N-Tranced" } },
      versionLabels: { "us-rev1": "USA (rev 1)" },
    };
    expect(versionLabel("us-rev1", p)).toBe("USA (rev 1)");
    expect(versionLabel("n2", p)).toBe("Crash Bandicoot 2: N-Tranced");
    // The primary is the other game, so this one is the project's own.
    expect(versionLabel("europe", p)).toBe("Crash Bandicoot XS");
    expect(versionLabel("eu", { game: "Rage Wars", defaultVersion: "de" })).toBe("eu");
  });
});
