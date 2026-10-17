/**
 * Games and franchises are not stored on their own: each project names the game it decompiles and
 * the franchise it belongs to, and projects naming the same game share one game page. "The same"
 * is decided by gameKey, which forgives spelling differences that never change which game is
 * meant, and by aliases admins set when two different names do mean one game. Pure, so pages,
 * forms and tests share it.
 */

/** "Ratchet & Clank: Going Commando" → "ratchet-and-clank-going-commando". */
export function slugify(name: string): string {
  return name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/** Roman numerals II to XX as words, for sequels. A bare "X" is left alone: Mega Man X isn't Mega Man 10. */
const ROMAN: Record<string, string> = Object.fromEntries(
  ["ii", "iii", "iv", "v", "vi", "vii", "viii", "ix", "", "xi", "xii", "xiii", "xiv", "xv", "xvi", "xvii", "xviii", "xix", "xx"]
    .map((r, i) => [r, String(i + 2)])
    .filter(([r]) => r),
);
const REGION = /\s+(usa|us|eu|europe|pal|ntsc|ntsc u|ntsc j|jp|jpn|japan|uk)$/;

/**
 * The key two names must share to be one game. On top of slugify's folding (case, accents, "&" and
 * "and", punctuation) it ignores a leading "The", bracketed or trailing region tags such as "(USA)"
 * or "[PAL]", and reads Roman numerals as digits, so "The Final Fantasy VII (USA)" and "final
 * fantasy 7" agree. Anything that could name a different game (subtitles, sequel numbers) counts.
 */
export function gameKey(name: string): string {
  let k = name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[([][^)\]]*[)\]]/g, " ")
    .replace(/[&+]/g, " and ")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/^the\s+/, "");
  for (let prev = ""; prev !== k;) {
    prev = k;
    k = k.replace(REGION, "");
  }
  return k
    .split(" ")
    .map((w) => ROMAN[w] ?? w)
    .join(" ");
}

function editDistance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let diag = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const up = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = up;
    }
  }
  return row[b.length];
}

/**
 * Whether two different game keys probably name one game: a typo apart ("super mario sunshin"), or
 * one is the other with the series name in front ("zelda ocarina of time" and "legend of zelda
 * ocarina of time"). Never when they differ by a number, which is how sequels differ ("ratchet and clank" and
 * "ratchet and clank 2"). A hint for people, not a rule: nothing merges on it alone.
 */
export function similarKeys(a: string, b: string): boolean {
  if (!a || !b || a === b) return false;
  const ta = a.split(" ");
  const tb = b.split(" ");
  const digits = (t: string[]) =>
    t
      .filter((w) => /\d/.test(w))
      .sort()
      .join(" ");
  if (digits(ta) !== digits(tb)) return false;
  const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
  // A series name left off the front ("Zelda: Ocarina of Time"); words added at the end are a
  // subtitle, which usually means a different game ("Paper Mario: The Thousand-Year Door").
  if (short.length >= 2 && long.slice(-short.length).join(" ") === short.join(" ")) return true;
  return editDistance(a, b) / Math.max(a.length, b.length) <= 0.15;
}

/** Admin-set aliases: a key that names the same game (or franchise) as another key. */
export type Aliases = Map<string, string>;

/** The key a name groups under, after following aliases (at most a few hops; cycles stop). */
export function resolveKey(name: string, aliases: Aliases = new Map()): string {
  let k = gameKey(name);
  for (let hops = 0; hops < 5 && aliases.has(k); hops++) k = aliases.get(k)!;
  return k;
}

/** A game or franchise name as typed: trimmed, inner whitespace collapsed, at most 100 characters. */
export function cleanName(input: string | null | undefined): string | null {
  const v = (input ?? "").replace(/\s+/g, " ").trim().slice(0, 100);
  return v && slugify(v) ? v : null;
}

/** A plausible release year, or null. */
export function cleanYear(input: string | number | null | undefined): number | null {
  const y = Number(String(input ?? "").trim());
  return Number.isInteger(y) && y >= 1970 && y <= new Date().getFullYear() + 2 ? y : null;
}

export interface GameProject {
  game: string | null;
  franchise: string | null;
  releaseYear: number | null;
  platform: string | null;
  /** Picked from IGDB: projects with the same id are one game, however their names are spelled. */
  igdbId?: number | null;
}

export interface Game<P extends GameProject> {
  slug: string;
  /** What the game groups by (see gameKey); URLs use slug. */
  key: string;
  title: string;
  franchise: string | null;
  franchiseSlug: string | null;
  year: number | null;
  platforms: string[];
  projects: P[];
}

export interface Franchise<P extends GameProject> {
  slug: string;
  title: string;
  games: Game<P>[];
}

/** The value most projects agree on (ties: the first one listed). */
function consensus<T>(values: (T | null)[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) if (v !== null) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let most = 0;
  for (const [v, n] of counts)
    if (n > most) {
      best = v;
      most = n;
    }
  return best;
}

/** Groups projects into games; projects without a game are left out. Sorted by year, then title. */
export function groupGames<P extends GameProject>(projects: P[], aliases: { games?: Aliases; franchises?: Aliases } = {}): Game<P>[] {
  const byKey = new Map<string, P[]>();
  // An IGDB id groups by the name its first project gives it, so the rest follow that one.
  const igdbKeys = new Map<number, string>();
  for (const p of projects) {
    if (p.igdbId && p.game && !igdbKeys.has(p.igdbId)) igdbKeys.set(p.igdbId, resolveKey(p.game, aliases.games));
  }
  for (const p of projects) {
    const key = p.game ? (p.igdbId && igdbKeys.get(p.igdbId)) || resolveKey(p.game, aliases.games) : "";
    if (!key) continue;
    byKey.set(key, [...(byKey.get(key) ?? []), p]);
  }
  // Franchises group by key too: each game takes the franchise spelling most of its group uses.
  const franchiseTitles = new Map<string, string>();
  const franchiseVotes = new Map<string, (string | null)[]>();
  for (const p of projects) {
    const f = cleanName(p.franchise);
    if (!f) continue;
    const k = resolveKey(f, aliases.franchises);
    franchiseVotes.set(k, [...(franchiseVotes.get(k) ?? []), f]);
  }
  for (const [k, votes] of franchiseVotes) franchiseTitles.set(k, consensus(votes)!);
  return [...byKey]
    .map(([key, list]) => {
      // A name picked from IGDB is the game's own; otherwise the spelling most projects use.
      const picked = list.filter((p) => p.igdbId);
      const title = consensus((picked.length ? picked : list).map((p) => cleanName(p.game)))!;
      const fk = consensus(list.map((p) => (cleanName(p.franchise) ? resolveKey(p.franchise!, aliases.franchises) : null)));
      const franchise = fk ? (franchiseTitles.get(fk) ?? null) : null;
      return {
        // The URL follows the name most of its projects use, so it reads like the title.
        slug: slugify(title),
        key,
        title,
        franchise,
        franchiseSlug: franchise ? slugify(franchise) : null,
        year: consensus(list.map((p) => p.releaseYear)),
        platforms: [...new Set(list.map((p) => p.platform?.toLowerCase()).filter((x): x is string => !!x))].sort(),
        projects: list,
      };
    })
    .sort((a, b) => (a.year ?? 9999) - (b.year ?? 9999) || a.title.localeCompare(b.title));
}

/** Groups games into franchises; games without one are left out. Sorted by title. */
export function groupFranchises<P extends GameProject>(games: Game<P>[]): Franchise<P>[] {
  const bySlug = new Map<string, Game<P>[]>();
  for (const g of games) if (g.franchiseSlug) bySlug.set(g.franchiseSlug, [...(bySlug.get(g.franchiseSlug) ?? []), g]);
  return [...bySlug]
    .map(([slug, list]) => ({ slug, title: consensus(list.map((g) => g.franchise))!, games: list }))
    .sort((a, b) => a.title.localeCompare(b.title));
}
