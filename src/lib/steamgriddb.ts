import { z } from "zod";

export interface HeroArtwork {
  url: string;
  sourceUrl: string | null;
  author: string | null;
}

const gamesSchema = z.object({ success: z.literal(true), data: z.array(z.object({ id: z.number().int().positive(), name: z.string() })) });
const heroesSchema = z.object({
  success: z.literal(true),
  data: z.array(
    z.object({
      id: z.number().int().positive(),
      url: z.string(),
      score: z.number().default(0),
      width: z.number().positive(),
      height: z.number().positive(),
      nsfw: z.boolean().optional(),
      humor: z.boolean().optional(),
      epilepsy: z.boolean().optional(),
      mime: z.string().optional(),
      author: z.object({ name: z.string() }).optional(),
    }),
  ),
});

/** Strip only region/revision metadata, never a sequel, subtitle or edition name. */
export function artworkTitle(name: string): string {
  return name.replace(/\s*\((?:USA?|PAL|Europe|Japan|NTSC(?:-[UJ])?)(?:\s+v[\d.]+)?\)\s*/gi, " ").trim();
}

function comparable(name: string): string {
  return artworkTitle(name)
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Duplicate exact matches are ambiguous (e.g. a remake with the same name). */
export function matchArtworkGame(name: string, games: { id: number; name: string }[]) {
  const matches = games.filter((game) => comparable(game.name) === comparable(name));
  return matches.length === 1 ? matches[0] : null;
}

function imageUrl(raw: string): string | null {
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && url.hostname === "cdn2.steamgriddb.com" && !url.username && !url.password && !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/** Server-side only. No request uses a user-provided origin or includes the key in a URL. */
export function createHeroResolver({
  apiKey,
  fetcher = fetch,
  now = Date.now,
}: {
  apiKey: string;
  fetcher?: typeof fetch;
  now?: () => number;
}) {
  const cache = new Map<string, { value: HeroArtwork | null; expires: number }>();
  const pending = new Map<string, Promise<HeroArtwork | null>>();
  const waiting: (() => void)[] = [];
  let active = 0;
  let retryAfter = 0;

  async function request(path: string) {
    if (now() < retryAfter) throw new Error("Artwork provider cooling down");
    const response = await fetcher(`https://www.steamgriddb.com/api/v2${path}`, {
      headers: { Authorization: `Bearer ${apiKey}`, Accept: "application/json" },
      signal: AbortSignal.timeout(5000),
      cache: "no-store",
      redirect: "error",
    });
    if (response.status === 429 || response.status === 401 || response.status === 403) {
      const seconds = Number(response.headers.get("retry-after"));
      retryAfter = now() + Math.max(60, Math.min(3600, Number.isFinite(seconds) ? seconds : 60)) * 1000;
    }
    if (!response.ok) throw new Error("Artwork provider unavailable");
    return response.json();
  }

  async function lookup(name: string): Promise<HeroArtwork | null> {
    const games = gamesSchema.parse(await request(`/search/autocomplete/${encodeURIComponent(artworkTitle(name))}`)).data;
    const game = matchArtworkGame(name, games);
    if (!game) return null;
    const heroes = heroesSchema.parse(await request(`/heroes/game/${game.id}?types=static&nsfw=false&humor=false&epilepsy=false`)).data;
    const hero = heroes
      .filter(
        (h) =>
          !h.nsfw &&
          !h.humor &&
          !h.epilepsy &&
          h.width / h.height >= 2 &&
          imageUrl(h.url) &&
          (!h.mime || ["image/png", "image/jpeg", "image/webp"].includes(h.mime)),
      )
      .sort((a, b) => b.score - a.score || a.id - b.id)[0];
    return hero
      ? { url: imageUrl(hero.url)!, sourceUrl: `https://www.steamgriddb.com/hero/${hero.id}`, author: hero.author?.name ?? null }
      : null;
  }

  return function resolve(name: string): Promise<HeroArtwork | null> {
    const title = artworkTitle(name);
    if (!apiKey.trim() || !title || title.length > 200) return Promise.resolve(null);
    const key = comparable(title);
    const saved = cache.get(key);
    if (saved && saved.expires > now()) return Promise.resolve(saved.value);
    const existing = pending.get(key);
    if (existing) return existing;
    // Bound both concurrent requests and queued work on large public indexes.
    if (now() < retryAfter || pending.size >= 32) return Promise.resolve(null);
    const task = (async () => {
      if (active >= 3) await new Promise<void>((ready) => waiting.push(ready));
      else active++;
      let value: HeroArtwork | null = null;
      let ttl = 60 * 60 * 1000;
      try {
        value = await lookup(title);
        if (value) ttl *= 24;
      } catch {
        ttl = 60 * 1000;
      } finally {
        const next = waiting.shift();
        if (next) next();
        else active--;
      }
      if (cache.size >= 500) cache.delete(cache.keys().next().value!);
      cache.set(key, { value, expires: now() + ttl });
      return value;
    })();
    pending.set(key, task);
    void task.finally(() => pending.delete(key));
    return task;
  };
}
