import Link from "next/link";
import { ExternalImage } from "@/components/external-image";
import { PortList } from "@/components/port-list";
import { gameArt } from "@/lib/game-data";
import { portsByGame } from "@/lib/port-data";
import { PORT_STATUSES } from "@/lib/ports";
import { browseMetadata } from "@/lib/seo";

export const dynamic = "force-dynamic";

export function generateMetadata() {
  return browseMetadata(
    "Ports",
    "Games ported to PC and other systems from their decompilations, listed by the decompilation projects they're built from.",
    "/ports",
  );
}

function Icon({ src, name }: { src: string | null; name: string }) {
  const initial = (
    <div
      className="grid size-9 shrink-0 place-items-center rounded-lg border border-line bg-surface-2 text-xs font-semibold text-ink-3"
      aria-hidden
    >
      {name.slice(0, 1)}
    </div>
  );
  return src ? (
    <ExternalImage src={src} className="size-9 shrink-0 rounded-lg border border-line object-cover" fallback={initial} />
  ) : (
    initial
  );
}

export default async function Ports() {
  const groups = await portsByGame();
  const count = groups.reduce((n, g) => n + g.ports.length, 0);
  const playable = groups.reduce((n, g) => n + g.ports.filter((p) => p.status === "playable").length, 0);

  return (
    <div>
      <div className="mb-8 max-w-2xl">
        <h1 className="text-3xl font-semibold tracking-tight">Ports</h1>
        <p className="mt-2 text-sm leading-relaxed text-ink-2">
          A matching decompilation is C that builds the original game, so it can be built for other systems too. These are the ports made
          from tracked projects, listed by their maintainers.
          {count
            ? ` ${count} port${count === 1 ? "" : "s"} of ${groups.length} game${groups.length === 1 ? "" : "s"}, ${playable} playable.`
            : ""}{" "}
          Most need your own copy of the game.
        </p>
      </div>

      {groups.length === 0 ? (
        <section className="panel px-5 py-10 text-center text-sm text-ink-3">
          No ports listed yet. Maintainers add them from their project&apos;s{" "}
          <Link href="/manage" className="text-accent hover:underline">
            manage page
          </Link>
          .
        </section>
      ) : (
        <div className="grid grid-cols-[minmax(0,1fr)] items-start gap-5 lg:grid-cols-2">
          {groups.map((g) => (
            <section key={g.slug ?? g.title} className="panel overflow-hidden" aria-label={g.title}>
              <h2 className="flex items-center gap-3 border-b border-line px-5 py-3.5">
                <Icon src={g.game ? gameArt(g.game).icon : null} name={g.title} />
                {g.slug ? (
                  <Link href={`/games/${g.slug}`} className="min-w-0 truncate font-semibold hover:underline">
                    {g.title}
                  </Link>
                ) : (
                  <span className="min-w-0 truncate font-semibold">{g.title}</span>
                )}
                <span className="ml-auto shrink-0 text-xs font-normal text-ink-3">
                  {g.ports.length} port{g.ports.length === 1 ? "" : "s"}
                </span>
              </h2>
              <PortList ports={g.ports} />
            </section>
          ))}
        </div>
      )}

      <p className="mt-6 text-xs text-ink-3">
        {Object.values(PORT_STATUSES)
          .map((s) => `${s.label}: ${s.hint.toLowerCase()}.`)
          .join(" ")}{" "}
        Links go to the ports&apos; own pages; nothing is hosted here.
      </p>
    </div>
  );
}
