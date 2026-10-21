/**
 * A project's versions as its maintainers arrange them: in their order, primary (the default
 * version) first, and under their names.
 */

export interface VersionNaming {
  game: string | null;
  defaultVersion: string | null;
  versionGames?: Record<string, { game: string }> | null;
  versionLabels?: Record<string, string> | null;
  versionOrder?: string[] | null;
}

/** VERSIONS in the project's order: the primary first, then as arranged, then any not arranged yet as given. */
export function orderVersions(versions: string[], p: Pick<VersionNaming, "defaultVersion" | "versionOrder">): string[] {
  const order = p.versionOrder ?? [];
  const rank = (v: string) => {
    if (v === p.defaultVersion) return -1;
    const i = order.indexOf(v);
    return i < 0 ? order.length + versions.indexOf(v) : i;
  };
  return [...versions].sort((a, b) => rank(a) - rank(b));
}

/**
 * What to call version V: the name its maintainers gave it; else the game it is, when it's a game
 * of its own; else, when the primary version is another game, the project's own game; else its id.
 */
export function versionLabel(v: string, p: VersionNaming): string {
  const own = p.versionLabels?.[v]?.trim();
  if (own) return own;
  const game = p.versionGames?.[v]?.game;
  if (game) return game;
  if (p.defaultVersion && p.versionGames?.[p.defaultVersion]?.game && p.game) return p.game;
  return v;
}

export const MAX_LABEL = 60;
