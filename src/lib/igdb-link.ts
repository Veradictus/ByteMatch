import { eq, inArray } from "drizzle-orm";
import { db } from "../db/client";
import { projects, type Project, type VersionGame } from "../db/schema";
import { addAlias, AliasError } from "../db/aliases";
import { loadGames } from "./game-data";
import { gameKey, resolveKey } from "./games";
import type { IgdbGame } from "./igdb";

type Linkable = Pick<Project, "game" | "releaseYear" | "igdbId" | "versionGames">;

/**
 * What linking (or, with GAME null, unlinking) changes on one project, given the versions of it
 * that sit in the game's group: `null` for the project's own game, else a version that is a game
 * of its own (versionGames). Linking takes IGDB's name and fills an empty year; franchises stay.
 */
export function igdbPatch(project: Linkable, versions: (string | null)[], game: IgdbGame | null): Partial<Linkable> {
  const patch: Partial<Linkable> = {};
  const own = { ...(project.versionGames ?? {}) };
  let changedVersions = false;
  for (const v of versions) {
    if (v === null) {
      patch.igdbId = game?.id ?? null;
      if (game) {
        patch.game = game.name;
        if (!project.releaseYear && game.year) patch.releaseYear = game.year;
      }
      continue;
    }
    const entry = own[v];
    if (!entry) continue;
    const next: VersionGame = { ...entry, igdbId: game?.id ?? null };
    if (game) {
      next.game = game.name;
      if (!entry.releaseYear && game.year) next.releaseYear = game.year;
    }
    own[v] = next;
    changedVersions = true;
  }
  if (changedVersions) patch.versionGames = own;
  return patch;
}

/**
 * Links every project on the game page KEY to an IGDB game (or unlinks them with null). When the
 * name's grouping changes, the old name is merged into IGDB's, so its links and anyone still
 * typing it land on the same page.
 */
export async function linkGame(key: string, game: IgdbGame | null, actorId: number): Promise<{ projects: number; title: string } | null> {
  const { games, aliases } = await loadGames();
  const group = games.find((g) => g.key === key);
  if (!group) return null;
  // Which of each project's rows are in the group: its own game, or versions that are games of their own.
  const byProject = new Map<number, Set<string | null>>();
  for (const r of group.projects) {
    const set = byProject.get(r.id) ?? new Set();
    set.add(r.path ? r.version : null);
    byProject.set(r.id, set);
  }
  const rows = await db()
    .select()
    .from(projects)
    .where(inArray(projects.id, [...byProject.keys()]));
  for (const p of rows) {
    // The project's shown version may itself be a game of its own: then its row stands for that entry.
    const versions = [...byProject.get(p.id)!].map((v) => {
      if (v !== null) return v;
      const shown = group.projects.find((r) => r.id === p.id && !r.path)?.version;
      return shown && p.versionGames?.[shown]?.game ? shown : null;
    });
    const patch = igdbPatch(p, versions, game);
    if (Object.keys(patch).length)
      await db()
        .update(projects)
        .set({ ...patch, updatedAt: new Date() })
        .where(eq(projects.id, p.id));
  }
  if (game) {
    // Every spelling the group was found under, so old links and anyone typing them follow along.
    const target = resolveKey(game.name, aliases.games);
    const spellings = new Map<string, string>();
    for (const name of [group.title, ...group.projects.map((r) => r.game)]) {
      const k = name ? gameKey(name) : "";
      if (k && k !== target && !spellings.has(k)) spellings.set(k, name!);
    }
    for (const name of spellings.values()) {
      try {
        await addAlias("game", name, game.name, actorId);
      } catch (e) {
        if (!(e instanceof AliasError)) throw e;
      }
    }
  }
  return { projects: rows.length, title: game?.name ?? group.title };
}
