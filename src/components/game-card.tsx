import Link from "next/link";
import type { Game } from "@/lib/games";
import { bestPercent, gameArt, type GameRow } from "@/lib/game-data";
import { platformName } from "@/lib/platforms";
import { coverStyle } from "@/lib/images";
import { ExternalImage } from "./external-image";
import { ProgressBar } from "./progress-bar";

function Placeholder({ title }: { title: string }) {
  return (
    <div
      className="grid h-full w-full place-items-center bg-[radial-gradient(circle_at_30%_20%,var(--surface-3),var(--surface-2)_70%)]"
      aria-hidden
    >
      <span className="text-4xl font-semibold text-ink-3/60">{title.slice(0, 1)}</span>
    </div>
  );
}

/** One game: its art, title, year and platforms, and how far its furthest project has got. */
export function GameCard({ game, showFranchise = true }: { game: Game<GameRow>; showFranchise?: boolean }) {
  const art = gameArt(game);
  const best = bestPercent(game);
  const n = game.projects.length;
  return (
    <li className="panel group relative flex flex-col overflow-hidden transition-colors hover:border-line-strong">
      <div className="aspect-[16/7] overflow-hidden border-b border-line bg-surface-2">
        {art.cover ? (
          <ExternalImage
            src={art.cover}
            style={coverStyle(art.coverPosition)}
            className="h-full w-full object-cover transition-transform duration-500 ease-out group-hover:scale-[1.03]"
            fallback={<Placeholder title={game.title} />}
          />
        ) : art.icon ? (
          <div className="grid h-full w-full place-items-center bg-surface-2">
            <ExternalImage
              src={art.icon}
              className="size-16 rounded-xl border border-line object-cover"
              fallback={<Placeholder title={game.title} />}
            />
          </div>
        ) : (
          <Placeholder title={game.title} />
        )}
      </div>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="min-w-0">
          <h3 className="truncate font-semibold">
            <Link href={`/games/${game.slug}`} className="after:absolute after:inset-0 focus-visible:outline-none">
              {game.title}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-ink-3">
            {[game.year, game.platforms.map((p) => platformName(p)).join(", ") || null, showFranchise ? game.franchise : null]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <div className="mt-auto">
          {best === null ? (
            <p className="text-xs text-ink-3">Syncing, no reports yet</p>
          ) : (
            <div className="flex items-center gap-3">
              <ProgressBar value={best} label={`${game.title}: code matched`} />
              <span className="shrink-0 font-mono text-sm">{best.toFixed(1)}%</span>
            </div>
          )}
          <p className="mt-2 text-xs text-ink-3">
            {n} project{n === 1 ? "" : "s"}
            {n > 1 && best !== null ? " · furthest shown" : ""}
          </p>
        </div>
      </div>
    </li>
  );
}
