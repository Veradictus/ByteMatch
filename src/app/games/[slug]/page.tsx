import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { CompareChart, type CompareSeries } from "@/components/compare-chart";
import { COMPARE_COLORS } from "@/lib/chart-colors";
import { ExternalImage } from "@/components/external-image";
import { GameCard } from "@/components/game-card";
import { ProjectList } from "@/components/project-list";
import { ChevronRight } from "@/components/ui/icons";
import { history } from "@/db/store";
import { byProgress, gameArt, loadGames, redirectSlug } from "@/lib/game-data";
import { platformName } from "@/lib/platforms";
import { breadcrumbJsonLd, browseMetadata, gameJsonLd } from "@/lib/seo";
import { JsonLd } from "@/components/json-ld";
import { coverStyle } from "@/lib/images";
import { PortList } from "@/components/port-list";
import { portsByGame } from "@/lib/port-data";

export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }> };

async function find(slug: string) {
  const { games, aliases } = await loadGames();
  const game = games.find((g) => g.slug === slug);
  if (game) return { game, games };
  // An old or differently spelled name of a game (merged, retitled): send links there for good.
  const target = redirectSlug(slug, games, aliases.games);
  if (target) permanentRedirect(`/games/${target}`);
  return null;
}

export async function generateMetadata({ params }: Params) {
  const found = await find((await params).slug);
  if (!found) return { title: "Game not found" };
  const { game } = found;
  const n = game.projects.length;
  return browseMetadata(
    game.title,
    `${game.title}${game.year ? ` (${game.year})` : ""} decompilation progress: ${n} matching decompilation project${n === 1 ? "" : "s"}${
      game.platforms.length ? ` on ${game.platforms.map((p) => platformName(p)).join(", ")}` : ""
    }.`,
    `/games/${game.slug}`,
  );
}

export default async function GamePage({ params }: Params) {
  const found = await find((await params).slug);
  if (!found) notFound();
  const { game, games } = found;
  const projects = [...game.projects].sort(byProgress);
  const art = gameArt(game);
  const series: CompareSeries[] = (
    await Promise.all(
      projects.slice(0, COMPARE_COLORS.length).map(async (p) => ({
        id: `${p.owner}/${p.repo}`,
        label: projects.some((q) => q !== p && q.name === p.name) ? `${p.name} (${p.owner})` : p.name,
        points: p.version
          ? (await history(p.id, p.version)).map((h): [number, number] => [h.commitTimestamp.getTime(), h.measures.matched_code_percent])
          : [],
      })),
    )
  ).filter((s) => s.points.length);
  const ports = (await portsByGame()).find((g) => g.game?.key === game.key)?.ports ?? [];
  const siblings = game.franchiseSlug ? games.filter((g) => g.franchiseSlug === game.franchiseSlug && g.slug !== game.slug) : [];

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <JsonLd data={gameJsonLd(game)} />
      <JsonLd
        data={breadcrumbJsonLd([
          { name: "Games", path: "/games" },
          ...(game.franchise && game.franchiseSlug ? [{ name: game.franchise, path: `/franchises/${game.franchiseSlug}` }] : []),
          { name: game.title, path: `/games/${game.slug}` },
        ])}
      />
      <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/games" className="text-ink-3 hover:text-ink">
          Games
        </Link>
        {game.franchise ? (
          <>
            <ChevronRight size={12} className="text-ink-3" />
            <Link href={`/franchises/${game.franchiseSlug}`} className="text-ink-3 hover:text-ink">
              {game.franchise}
            </Link>
          </>
        ) : null}
        <ChevronRight size={12} className="text-ink-3" />
        <span className="font-medium">{game.title}</span>
      </nav>

      <section className="panel overflow-hidden">
        {art.cover ? (
          <ExternalImage
            src={art.cover}
            style={coverStyle(art.coverPosition)}
            className="aspect-[3/1] max-h-64 w-full border-b border-line object-cover"
          />
        ) : null}
        <div className="flex items-start gap-4 p-6 sm:p-7">
          {art.icon ? (
            <ExternalImage src={art.icon} className="size-14 shrink-0 rounded-xl border border-line object-cover sm:size-16" />
          ) : null}
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-3xl">{game.title}</h1>
            <p className="mt-1 text-sm text-ink-3">
              {[game.year, game.platforms.map((p) => platformName(p)).join(", ") || null].filter(Boolean).join(" · ")}
              {game.year || game.platforms.length ? " · " : ""}
              {game.projects.length} project{game.projects.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>
      </section>

      {series.length ? (
        <section className="panel p-5 sm:p-6">
          <h2 className="mb-4 text-sm font-semibold">Code matched over time</h2>
          <CompareChart series={series} />
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold">Projects</h2>
        <ProjectList rows={projects} empty="No projects." />
      </section>

      {ports.length ? (
        <section>
          <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
            Ports
            <Link href="/ports" className="text-xs font-normal text-accent hover:underline">
              All ports
            </Link>
          </h2>
          <div className="panel overflow-hidden">
            <PortList ports={ports} />
          </div>
        </section>
      ) : null}

      {siblings.length ? (
        <section>
          <h2 className="mb-3 flex items-baseline gap-2 text-sm font-semibold">
            More {game.franchise}
            <Link href={`/franchises/${game.franchiseSlug}`} className="text-xs font-normal text-accent hover:underline">
              All {siblings.length + 1} games
            </Link>
          </h2>
          <ul className="grid grid-cols-[minmax(0,1fr)] gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {siblings.slice(0, 4).map((g) => (
              <GameCard key={g.slug} game={g} showFranchise={false} />
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
