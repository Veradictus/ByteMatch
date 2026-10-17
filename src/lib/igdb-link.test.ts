import { describe, expect, it } from "vitest";
import { igdbPatch } from "./igdb-link";
import type { IgdbGame } from "./igdb";

const rac: IgdbGame = { id: 1770, name: "Ratchet & Clank", year: 2002, franchise: null, platforms: [], cover: null, url: null };

describe("igdbPatch", () => {
  const project = {
    game: "Ratchet and Clank (PAL)",
    releaseYear: null,
    igdbId: null,
    versionGames: { NTSC: { game: "Crash XS", releaseYear: 2002 }, PAL2: { game: "Ratchet n Clank" } },
  };
  it("renames the project's own game, fills an empty year and keeps its id", () => {
    expect(igdbPatch(project, [null], rac)).toEqual({ igdbId: 1770, game: "Ratchet & Clank", releaseYear: 2002 });
  });
  it("links versions that are games of their own, leaving the rest alone", () => {
    expect(igdbPatch(project, ["PAL2"], rac)).toEqual({
      versionGames: { NTSC: project.versionGames.NTSC, PAL2: { game: "Ratchet & Clank", releaseYear: 2002, igdbId: 1770 } },
    });
  });
  it("unlinks without renaming", () => {
    expect(igdbPatch({ ...project, igdbId: 1770 }, [null, "PAL2"], null)).toEqual({
      igdbId: null,
      versionGames: { NTSC: project.versionGames.NTSC, PAL2: { game: "Ratchet n Clank", igdbId: null } },
    });
  });
});
