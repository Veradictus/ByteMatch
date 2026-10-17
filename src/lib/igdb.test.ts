import { describe, expect, it } from "vitest";
import { fromRaw } from "./igdb";

describe("fromRaw", () => {
  it("takes the year, franchise (else series), platforms and cover from IGDB's game", () => {
    expect(
      fromRaw({
        id: 1770,
        name: "Ratchet & Clank",
        slug: "ratchet-and-clank",
        first_release_date: 1036454400,
        collections: [{ name: "Ratchet & Clank" }],
        platforms: [{ abbreviation: "PS2", name: "PlayStation 2" }, { name: "Mystery" }],
        cover: { image_id: "co1abc" },
      }),
    ).toEqual({
      id: 1770,
      name: "Ratchet & Clank",
      year: 2002,
      franchise: "Ratchet & Clank",
      platforms: ["PS2", "Mystery"],
      cover: "https://images.igdb.com/igdb/image/upload/t_cover_small/co1abc.jpg",
      url: "https://www.igdb.com/games/ratchet-and-clank",
    });
    expect(fromRaw({ id: 1, name: "Untitled" })).toMatchObject({ year: null, franchise: null, platforms: [], cover: null, url: null });
  });
});
