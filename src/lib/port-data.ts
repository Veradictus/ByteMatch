import { allPorts, type ListedPort } from "@/db/ports";
import { loadGames } from "./game-data";
import type { Game } from "./games";
import type { GameRow } from "./game-data";

export type PortWithSource = ListedPort & { from: { name: string; href: string } };

export interface PortGroup {
  /** The game's title, or the project's name when it names no game. */
  title: string;
  /** The game page, when there is one. */
  slug: string | null;
  game: Game<GameRow> | null;
  ports: PortWithSource[];
}

/** Ports of public projects, grouped by the game they're of; games with a playable port first. */
export async function portsByGame(): Promise<PortGroup[]> {
  const [{ games, rows }, ports] = await Promise.all([loadGames(), allPorts()]);
  // The row a port belongs to: its version's, when that version is another game, else the project's.
  const rowOf = (p: ListedPort) =>
    (p.version ? rows.find((r) => r.id === p.projectId && r.path && r.version === p.version) : undefined) ??
    rows.find((r) => r.id === p.projectId && !r.path);
  const groups = new Map<string, PortGroup>();
  for (const p of ports) {
    const row = rowOf(p);
    if (!row) continue;
    const game = row.game ? (games.find((g) => g.projects.includes(row)) ?? null) : null;
    const key = game ? `game:${game.key}` : `project:${p.projectId}`;
    const group = groups.get(key) ?? { title: game?.title ?? p.project.name, slug: game?.slug ?? null, game, ports: [] };
    group.ports.push({ ...p, from: { name: p.project.name, href: `/${p.project.owner}/${p.project.repo}` } });
    groups.set(key, group);
  }
  const best = (g: PortGroup) => (g.ports.some((p) => p.status === "playable") ? 0 : 1);
  return [...groups.values()].sort((a, b) => best(a) - best(b) || a.title.localeCompare(b.title));
}
