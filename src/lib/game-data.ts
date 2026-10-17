import type { ProjectRow } from "@/components/project-list";
import { loadAliases } from "@/db/aliases";
import { latestReport, projectIndex } from "@/db/store";
import { groupFranchises, groupGames, resolveKey, type Game } from "./games";
import { platformName } from "./platforms";

export type GameRow = ProjectRow & {
  id: number;
  game: string | null;
  franchise: string | null;
  releaseYear: number | null;
  cover: string | null;
};

const row = (p: Awaited<ReturnType<typeof projectIndex>>[number]): GameRow => ({
  id: p.id,
  owner: p.owner,
  repo: p.repo,
  name: p.name,
  platform: p.platform,
  platformName: platformName(p.platform),
  game: p.game,
  franchise: p.franchise,
  releaseYear: p.release_year,
  version: p.version,
  codePercent: p.measures ? Number(p.measures.matched_code_percent) : null,
  functions: p.measures ? { done: Number(p.measures.matched_functions), total: Number(p.measures.total_functions) } : null,
  updated: p.listed_at ? new Date(p.listed_at).toISOString() : null,
  gain30: p.gain_30d === null ? null : Number(p.gain_30d),
  createdAt: new Date(p.created_at).toISOString(),
  image: p.icon_url,
  cover: p.image_url,
});

/**
 * Public projects as list rows, with the game fields the games pages group on. A project whose
 * versions are different games (one repository, one engine, two games) gives a row per such
 * version, linking to that version and carrying its own measures; the rest of the project is one
 * row as usual.
 */
export async function gameRows(): Promise<GameRow[]> {
  const out: GameRow[] = [];
  for (const p of await projectIndex()) {
    const base = row(p);
    const own = p.version_games ?? {};
    const mine = p.version ? own[p.version] : undefined;
    out.push(
      mine ? { ...base, game: mine.game, franchise: mine.franchise ?? base.franchise, releaseYear: mine.releaseYear ?? null } : base,
    );
    for (const [version, g] of Object.entries(own)) {
      if (version === p.version || !g?.game) continue;
      const latest = await latestReport(p.id, version);
      if (!latest) continue;
      const m = latest.measures;
      out.push({
        ...base,
        path: `/${p.owner}/${p.repo}/${encodeURIComponent(version)}`,
        version,
        game: g.game,
        franchise: g.franchise ?? base.franchise,
        releaseYear: g.releaseYear ?? null,
        codePercent: Number(m.matched_code_percent),
        functions: { done: Number(m.matched_functions), total: Number(m.total_functions) },
        updated: latest.commitTimestamp.toISOString(),
        gain30: null,
      });
    }
  }
  return out;
}

export async function loadGames() {
  const [rows, aliases] = await Promise.all([gameRows(), loadAliases()]);
  const games = groupGames(rows, aliases);
  return { games, franchises: groupFranchises(games), unassigned: rows.filter((r) => !r.game).length, aliases, rows };
}

/**
 * For a /games/{slug} or /franchises/{slug} URL that matches nothing: the page it should redirect
 * to, if the slug is an old or differently spelled name of one (merged, retitled, "the-…").
 */
export function redirectSlug<T extends { slug: string; title: string }>(
  slug: string,
  items: T[],
  aliases: Map<string, string>,
): string | null {
  const key = resolveKey(slug.replace(/-/g, " "), aliases);
  if (!key) return null;
  return items.find((i) => resolveKey(i.title, aliases) === key && i.slug !== slug)?.slug ?? null;
}

/** The game's furthest-along project first; projects still syncing last. */
export function byProgress(a: GameRow, b: GameRow) {
  return (b.codePercent ?? -1) - (a.codePercent ?? -1) || a.name.localeCompare(b.name);
}

/** The picture that stands for a game: the cover (else icon) of its furthest-along project that has one. */
export function gameArt(g: Game<GameRow>): { cover: string | null; icon: string | null } {
  const sorted = [...g.projects].sort(byProgress);
  return { cover: sorted.find((p) => p.cover)?.cover ?? null, icon: sorted.find((p) => p.image)?.image ?? null };
}

/** The highest code-matched percentage among the game's projects. */
export function bestPercent(g: Game<GameRow>): number | null {
  const v = g.projects.map((p) => p.codePercent).filter((x): x is number => x !== null);
  return v.length ? Math.max(...v) : null;
}
