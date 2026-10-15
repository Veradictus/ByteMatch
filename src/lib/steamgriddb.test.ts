import { afterEach, describe, expect, it, vi } from "vitest";
import { artworkTitle, createHeroResolver, matchArtworkGame } from "./steamgriddb";

const game = { id: 12, name: "Ratchet & Clank" };
const hero = {
  id: 42,
  url: "https://cdn2.steamgriddb.com/hero/example.png",
  score: 10,
  width: 1920,
  height: 620,
  author: { name: "Artist" },
};
const reply = (data: unknown) => Response.json({ success: true, data });
afterEach(() => vi.restoreAllMocks());

describe("SteamGridDB heroes", () => {
  it("does not call the provider without a key", async () => {
    const fetcher = vi.fn<typeof fetch>();
    expect(await createHeroResolver({ apiKey: "", fetcher })(game.name)).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("matches region variants but never substitutes a sequel, subtitle or ambiguous game", () => {
    expect(artworkTitle("Ratchet & Clank (USA v1.01)")).toBe(game.name);
    expect(matchArtworkGame("Ratchet and Clank (PAL)", [game])).toEqual(game);
    expect(matchArtworkGame("Ratchet & Clank 2", [game])).toBeNull();
    expect(matchArtworkGame("Ratchet & Clank (Remastered)", [game])).toBeNull();
    expect(matchArtworkGame(game.name, [game, { ...game, id: 13 }])).toBeNull();
  });

  it("uses authenticated API requests, selects a safe hero and deduplicates cached lookups", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(reply([game]))
      .mockResolvedValueOnce(
        reply([{ ...hero, id: 1, score: 999, nsfw: true }, { ...hero, id: 2, score: 999, url: "https://other.example/hero.png" }, hero]),
      );
    const resolve = createHeroResolver({ apiKey: "test-key", fetcher });
    const [a, b] = await Promise.all([resolve(game.name), resolve(game.name)]);
    expect(a).toEqual({ url: hero.url, sourceUrl: "https://www.steamgriddb.com/hero/42", author: "Artist" });
    expect(b).toEqual(a);
    expect(await resolve(game.name)).toEqual(a);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(fetcher.mock.calls[0][0]).toBe("https://www.steamgriddb.com/api/v2/search/autocomplete/Ratchet%20%26%20Clank");
    expect(fetcher.mock.calls[0][1]).toMatchObject({ headers: { Authorization: "Bearer test-key" }, redirect: "error" });
    expect(String(fetcher.mock.calls[1][0])).toContain("/heroes/game/12?types=static");
  });

  it("caches missing and failed results, then retries after their TTL", async () => {
    let time = 0;
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(reply([]));
    const resolve = createHeroResolver({ apiKey: "key", fetcher, now: () => time });
    expect(await resolve("Missing")).toBeNull();
    expect(await resolve("Missing")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
    time = 3600001;
    await resolve("Missing");
    expect(fetcher).toHaveBeenCalledTimes(2);
    fetcher.mockRejectedValue(new Error("network unavailable"));
    await expect(resolve("Another")).resolves.toBeNull();
    await resolve("Another");
    expect(fetcher).toHaveBeenCalledTimes(3);
    time += 60001;
    await resolve("Another");
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("backs off across different games when rate limited", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 429, headers: { "retry-after": "120" } }));
    const resolve = createHeroResolver({ apiKey: "key", fetcher, now: () => 0 });
    expect(await resolve("One")).toBeNull();
    expect(await resolve("Two")).toBeNull();
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("handles malformed responses and non-static artwork without breaking the page", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(Response.json({ unexpected: true }));
    const resolve = createHeroResolver({ apiKey: "key", fetcher });
    await expect(resolve(game.name)).resolves.toBeNull();
    fetcher.mockResolvedValueOnce(reply([{ id: 13, name: "Other" }])).mockResolvedValueOnce(reply([{ ...hero, mime: "image/gif" }]));
    expect(await resolve("Other")).toBeNull();
  });

  it("caps concurrent requests even when rendering many cards", async () => {
    let active = 0,
      peak = 0;
    const fetcher = vi.fn<typeof fetch>(async () => {
      active++;
      peak = Math.max(peak, active);
      await new Promise((r) => setTimeout(r, 5));
      active--;
      return reply([]);
    });
    const resolve = createHeroResolver({ apiKey: "key", fetcher });
    await Promise.all(Array.from({ length: 12 }, (_, i) => resolve(`Game ${i}`)));
    expect(peak).toBe(3);
    expect(fetcher).toHaveBeenCalledTimes(12);
  });
});
