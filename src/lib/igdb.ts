import { RenderCache } from "./render-cache";
import { config } from "./config";

/**
 * Game names from IGDB (igdb.com, run by Twitch), so projects of one game can pick its one name
 * instead of each typing their own. Optional: an instance turns it on with a Twitch application's
 * IGDB_CLIENT_ID and IGDB_CLIENT_SECRET. IGDB asks for attribution wherever its data is shown.
 */

export interface IgdbGame {
  id: number;
  name: string;
  year: number | null;
  /** Its franchise, or failing that the series IGDB files it under. */
  franchise: string | null;
  platforms: string[];
  /** A small cover, hosted by IGDB. */
  cover: string | null;
  /** Its page on IGDB. */
  url: string | null;
}

export const igdbEnabled = () => !!(config().IGDB_CLIENT_ID && config().IGDB_CLIENT_SECRET);

let token: { value: string; until: number } | null = null;

async function accessToken(refresh = false): Promise<string> {
  if (token && !refresh && token.until > Date.now()) return token.value;
  const { IGDB_CLIENT_ID: id, IGDB_CLIENT_SECRET: secret } = config();
  const res = await fetch(
    `https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id!)}&client_secret=${encodeURIComponent(secret!)}&grant_type=client_credentials`,
    { method: "POST", signal: AbortSignal.timeout(8000) },
  );
  if (!res.ok) throw new Error(`Twitch answered ${res.status} for an IGDB token`);
  const data = (await res.json()) as { access_token: string; expires_in: number };
  token = { value: data.access_token, until: Date.now() + (data.expires_in - 300) * 1000 };
  return token.value;
}

async function query(endpoint: string, body: string, retried = false): Promise<unknown[]> {
  const res = await fetch(`https://api.igdb.com/v4/${endpoint}`, {
    method: "POST",
    headers: { "Client-ID": config().IGDB_CLIENT_ID!, Authorization: `Bearer ${await accessToken(retried)}`, Accept: "application/json" },
    body,
    signal: AbortSignal.timeout(8000),
  });
  if (res.status === 401 && !retried) return query(endpoint, body, true);
  if (!res.ok) throw new Error(`IGDB answered ${res.status}`);
  return (await res.json()) as unknown[];
}

interface RawGame {
  id: number;
  name: string;
  slug?: string;
  first_release_date?: number;
  franchises?: { name: string }[];
  collections?: { name: string }[];
  platforms?: { abbreviation?: string; name: string }[];
  cover?: { image_id: string };
}

const FIELDS =
  "fields name, slug, first_release_date, franchises.name, collections.name, platforms.abbreviation, platforms.name, cover.image_id;";

export function fromRaw(g: RawGame): IgdbGame {
  return {
    id: g.id,
    name: g.name,
    year: g.first_release_date ? new Date(g.first_release_date * 1000).getUTCFullYear() : null,
    franchise: g.franchises?.[0]?.name ?? g.collections?.[0]?.name ?? null,
    platforms: (g.platforms ?? []).map((p) => p.abbreviation || p.name),
    cover: g.cover ? `https://images.igdb.com/igdb/image/upload/t_cover_small/${g.cover.image_id}.jpg` : null,
    url: g.slug ? `https://www.igdb.com/games/${g.slug}` : null,
  };
}

/** IGDB's search syntax wants the text in double quotes; drop what could end the string. */
const quoted = (s: string) => `"${s.replace(/["\\]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80)}"`;

const searches = new RenderCache<{ at: number; games: IgdbGame[] }>(1000);
const DAY = 86400_000;

/** Games matching what was typed, best first; editions and versions of a game are left out. */
export async function searchIgdb(text: string): Promise<IgdbGame[]> {
  const q = text.trim().toLowerCase();
  if (q.length < 2 || !igdbEnabled()) return [];
  const hit = searches.get(q);
  if (hit && Date.now() - hit.at < DAY) return hit.games;
  const rows = (await query("games", `search ${quoted(q)}; ${FIELDS} where version_parent = null; limit 8;`)) as RawGame[];
  const games = rows.map(fromRaw);
  searches.set(q, { at: Date.now(), games });
  return games;
}

/** One game by its IGDB id, read fresh (for linking, so a page can't hand over a made-up name). */
export async function igdbGame(id: number): Promise<IgdbGame | null> {
  if (!igdbEnabled() || !Number.isInteger(id) || id <= 0) return null;
  const rows = (await query("games", `${FIELDS} where id = ${id}; limit 1;`)) as RawGame[];
  return rows[0] ? fromRaw(rows[0]) : null;
}
