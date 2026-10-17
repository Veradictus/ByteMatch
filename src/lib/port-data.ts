import { allPorts, type ListedPort } from "@/db/ports";
import { loadGames } from "./game-data";
import { resolveKey, type Game } from "./games";
import { portGame } from "./ports";
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
  const [{ games, aliases, rows }, ports] = await Promise.all([loadGames(), allPorts()]);
  const shown = new Set(rows.map((r) => r.id));
  const groups = new Map<string, PortGroup>();
  for (const p of ports) {
    if (!shown.has(p.projectId)) continue;
    const name = portGame(p, p.project);
    const key = name ? resolveKey(name, aliases.games) : `project:${p.projectId}`;
    const game = name ? (games.find((g) => g.key === key) ?? null) : null;
    const group = groups.get(key) ?? { title: game?.title ?? name ?? p.project.name, slug: game?.slug ?? null, game, ports: [] };
    group.ports.push({ ...p, from: { name: p.project.name, href: `/${p.project.owner}/${p.project.repo}` } });
    groups.set(key, group);
  }
  const best = (g: PortGroup) => (g.ports.some((p) => p.status === "playable") ? 0 : 1);
  return [...groups.values()].sort((a, b) => best(a) - best(b) || a.title.localeCompare(b.title));
}
