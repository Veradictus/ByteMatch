import { describe, expect, it } from "vitest";
import { cleanName, cleanYear, gameKey, groupFranchises, groupGames, resolveKey, similarKeys, slugify } from "./games";

const p = (game: string | null, franchise: string | null = null, releaseYear: number | null = null, platform: string | null = "ps2") => ({
  game,
  franchise,
  releaseYear,
  platform,
});

describe("games", () => {
  it("slugs names so spellings agree", () => {
    expect(slugify("Ratchet & Clank: Going Commando")).toBe("ratchet-and-clank-going-commando");
    expect(slugify("ratchet and clank   going commando")).toBe("ratchet-and-clank-going-commando");
    expect(slugify("Pokémon Colosseum")).toBe("pokemon-colosseum");
    expect(slugify("Kirby's Air Ride")).toBe("kirbys-air-ride");
    expect(slugify("!!!")).toBe("");
  });

  it("cleans names and years", () => {
    expect(cleanName("  Ratchet   &  Clank ")).toBe("Ratchet & Clank");
    expect(cleanName("  ")).toBeNull();
    expect(cleanName("???")).toBeNull();
    expect(cleanYear("2002")).toBe(2002);
    expect(cleanYear("02")).toBeNull();
    expect(cleanYear("")).toBeNull();
    expect(cleanYear(1900)).toBeNull();
  });

  it("groups projects into games by slug, with the majority's spelling", () => {
    const games = groupGames([
      p("Ratchet & Clank", "Ratchet & Clank", 2002),
      p("Ratchet and Clank", "Ratchet & Clank", 2002, "PS2"),
      p("Ratchet & Clank", null, 2002),
      p("Super Smash Bros. Melee", null, 2001, "gc"),
      p(null),
    ]);
    expect(games.map((g) => g.slug)).toEqual(["super-smash-bros-melee", "ratchet-and-clank"]);
    const rac = games[1];
    expect(rac.title).toBe("Ratchet & Clank");
    expect(rac.franchise).toBe("Ratchet & Clank");
    expect(rac.platforms).toEqual(["ps2"]);
    expect(rac.projects).toHaveLength(3);
  });

  it("groups games into franchises", () => {
    const games = groupGames([
      p("Going Commando", "Ratchet & Clank", 2003),
      p("Ratchet & Clank", "Ratchet and Clank", 2002),
      p("Melee", null, 2001),
    ]);
    const franchises = groupFranchises(games);
    expect(franchises).toHaveLength(1);
    expect(franchises[0].slug).toBe("ratchet-and-clank");
    expect(franchises[0].games.map((g) => g.title)).toEqual(["Ratchet & Clank", "Going Commando"]);
  });

  it("keys names so spellings of one game agree", () => {
    const same = [
      ["Ratchet & Clank", "Ratchet and Clank"],
      ["The Legend of Zelda: Ocarina of Time", "Legend of Zelda - Ocarina of Time"],
      ["Final Fantasy VII", "final fantasy 7"],
      ["Super Mario 64 (USA)", "Super Mario 64"],
      ["Ratchet & Clank [PAL]", "Ratchet and Clank PAL"],
      ["Pokémon Colosseum", "Pokemon Colosseum"],
      ["Kirby's Air Ride", "Kirbys Air Ride"],
    ];
    for (const [a, b] of same) expect(gameKey(a), `${a} / ${b}`).toBe(gameKey(b));
  });

  it("keeps different games apart", () => {
    const different = [
      ["Ratchet & Clank", "Ratchet & Clank 2"],
      ["Mega Man X", "Mega Man 10"],
      ["Super Mario Bros.", "Super Mario Bros. 3"],
      ["Paper Mario", "Paper Mario: The Thousand-Year Door"],
    ];
    for (const [a, b] of different) expect(gameKey(a), `${a} / ${b}`).not.toBe(gameKey(b));
  });

  it("flags likely duplicates, but never sequels", () => {
    const k = (a: string, b: string) => similarKeys(gameKey(a), gameKey(b));
    expect(k("Super Mario Sunshin", "Super Mario Sunshine")).toBe(true);
    expect(k("Zelda: Ocarina of Time", "The Legend of Zelda: Ocarina of Time")).toBe(true);
    expect(k("Ratchet & Clank", "Ratchet & Clank 2")).toBe(false);
    expect(k("Final Fantasy VII", "Final Fantasy VIII")).toBe(false);
    expect(k("Super Mario Sunshine", "Super Smash Bros. Melee")).toBe(false);
    expect(k("Paper Mario", "Paper Mario: The Thousand-Year Door")).toBe(false);
  });

  it("follows aliases, so admins can merge names that mean one game", () => {
    const aliases = new Map([[gameKey("Ratchet & Clank 2"), gameKey("Ratchet & Clank: Going Commando")]]);
    expect(resolveKey("Ratchet and Clank 2", aliases)).toBe(gameKey("Ratchet & Clank: Going Commando"));
    const games = groupGames(
      [p("Ratchet & Clank: Going Commando", null, 2003), p("Ratchet & Clank 2", null, 2003), p("Ratchet & Clank 2", null, 2003)],
      {
        games: aliases,
      },
    );
    expect(games).toHaveLength(1);
    // The title is the spelling most projects use, and the URL follows it.
    expect(games[0].title).toBe("Ratchet & Clank 2");
    expect(games[0].slug).toBe("ratchet-and-clank-2");
    // A loop of aliases doesn't hang.
    expect(
      resolveKey(
        "a",
        new Map([
          ["a", "b"],
          ["b", "a"],
        ]),
      ),
    ).toMatch(/^[ab]$/);
  });
  it("groups projects that picked one IGDB game, however they spell it", () => {
    const games = groupGames([
      { ...p("Ratchet & Clank"), igdbId: 1770 },
      // Picked from IGDB, then renamed: the id still puts it with the game.
      { ...p("R&C"), igdbId: 1770 },
      p("Ratchet and Clank"),
      p("R&C"),
      { ...p("Jak and Daxter"), igdbId: 1528 },
    ]);
    expect(games.map((g) => [g.title, g.projects.length])).toEqual([
      ["Jak and Daxter", 1],
      ["R&C", 1],
      ["Ratchet & Clank", 3],
    ]);
    expect(games.every((g) => g.key)).toBe(true);
  });
});
