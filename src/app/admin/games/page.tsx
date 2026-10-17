import Link from "next/link";
import { LocalTime } from "@/components/local-time";
import { loadGames } from "@/lib/game-data";
import { resolveKey, similarKeys } from "@/lib/games";
import { linkIgdbAction, mergeNamesAction, unlinkIgdbAction, unmergeNameAction } from "../actions";
import { igdbEnabled } from "@/lib/igdb";
import { IgdbLink } from "./igdb-link";
import { ActionButton, MergeButton, MergeForm } from "../ui";

interface Named {
  title: string;
  key: string;
  count: number;
  href: string;
}

/** Pairs of names that probably mean the same thing, the bigger one first. */
function likelyDuplicates(items: Named[]): [Named, Named][] {
  const pairs: [Named, Named][] = [];
  for (let i = 0; i < items.length; i++)
    for (let j = i + 1; j < items.length; j++)
      if (similarKeys(items[i].key, items[j].key))
        pairs.push(items[i].count >= items[j].count ? [items[i], items[j]] : [items[j], items[i]]);
  return pairs;
}

/**
 * Keeping games and franchises grouped: names that look like duplicates, merging any two names
 * (regional titles never look alike), and undoing merges.
 */
export default async function AdminGames() {
  const { games, franchises, aliases } = await loadGames();
  const gameItems: Named[] = games.map((g) => ({ title: g.title, key: g.key, count: g.projects.length, href: `/games/${g.slug}` }));
  const franchiseItems: Named[] = franchises.map((f) => ({
    title: f.title,
    key: resolveKey(f.title, aliases.franchises),
    count: f.games.length,
    href: `/franchises/${f.slug}`,
  }));
  const dupes = [
    ...likelyDuplicates(gameItems).map((p) => ({ kind: "game" as const, pair: p })),
    ...likelyDuplicates(franchiseItems).map((p) => ({ kind: "franchise" as const, pair: p })),
  ];

  const igdb = igdbEnabled();
  const isLinked = (g: (typeof games)[number]) => g.projects.every((p) => p.igdbId && p.igdbId === g.projects[0].igdbId);
  const linked = games.filter(isLinked).length;
  // Games still to link first, the ones with most projects at the top.
  const byLink = [...games].sort((a, b) => Number(isLinked(a)) - Number(isLinked(b)) || b.projects.length - a.projects.length);

  return (
    <div className="grid gap-4">
      <section className="panel overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">
          Likely duplicates{" "}
          <span className="font-normal text-ink-3">
            · spellings already agree on case, punctuation, “&amp;”, “The”, region tags and Roman numerals; these differ by a typo or a
            missing series name
          </span>
        </h2>
        <ul className="divide-y divide-line">
          {dupes.map(({ kind, pair: [a, b] }) => (
            <li
              key={`${kind}:${a.key}:${b.key}`}
              className="grid gap-2 px-5 py-3 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0">
                <span className="mr-2 rounded-full bg-surface-3 px-2 py-0.5 text-xs text-ink-3 capitalize">{kind}</span>
                <Link href={a.href} className="hover:underline">
                  {a.title}
                </Link>{" "}
                <span className="text-ink-3">({a.count})</span> <span className="text-ink-3">and</span>{" "}
                <Link href={b.href} className="hover:underline">
                  {b.title}
                </Link>{" "}
                <span className="text-ink-3">({b.count})</span>
              </div>
              <div className="flex flex-wrap gap-1">
                <MergeButton action={mergeNamesAction} kind={kind} from={b.title} to={a.title} />
                <MergeButton action={mergeNamesAction} kind={kind} from={a.title} to={b.title} />
              </div>
            </li>
          ))}
          {dupes.length === 0 ? <li className="px-5 py-8 text-center text-sm text-ink-3">No likely duplicates.</li> : null}
        </ul>
      </section>

      <section className="panel overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">
          IGDB{" "}
          <span className="font-normal text-ink-3">
            · {linked} of {games.length} games linked. Linking gives every project on the page IGDB&apos;s name and id (and its year where
            none is set); old spellings are merged into it, so their links still work
          </span>
        </h2>
        {igdb ? (
          <ul className="divide-y divide-line">
            {byLink.map((g) => {
              const ids = [...new Set(g.projects.map((p) => p.igdbId).filter((x): x is number => !!x))];
              const all = ids.length === 1 && g.projects.every((p) => p.igdbId === ids[0]);
              return (
                <li key={g.key} className="flex flex-wrap items-center gap-x-3 gap-y-2 px-5 py-2.5 text-sm">
                  <Link href={`/games/${g.slug}`} className="min-w-0 hover:underline">
                    {g.title}
                  </Link>
                  <span className="text-xs text-ink-3">
                    {g.projects.length} project{g.projects.length === 1 ? "" : "s"}
                    {ids.length
                      ? all
                        ? ` · IGDB ${ids[0]}`
                        : ` · ${g.projects.filter((p) => p.igdbId).length} linked (${ids.join(", ")})`
                      : ""}
                  </span>
                  <span className="ml-auto flex items-center gap-1">
                    {ids.length ? <ActionButton action={unlinkIgdbAction} fields={{ key: g.key }} label="Unlink" /> : null}
                    {all ? null : <IgdbLink gameKey={g.key} title={g.title} action={linkIgdbAction} />}
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="px-5 py-6 text-sm text-ink-3">
            IGDB lookups are off: set <code className="font-mono text-xs">IGDB_CLIENT_ID</code> and{" "}
            <code className="font-mono text-xs">IGDB_CLIENT_SECRET</code> (docs/self-hosting.md, IGDB).
          </p>
        )}
      </section>

      <section className="panel p-5">
        <h2 className="mb-1 text-sm font-semibold">Merge two names</h2>
        <p className="mb-4 text-sm text-ink-2">
          For names that mean one game but don&apos;t look alike, such as regional titles. Projects using either name then share one page, a
          maintainer typing the merged name joins it, and the merged name&apos;s old URL redirects.
        </p>
        <MergeForm action={mergeNamesAction} games={games.map((g) => g.title)} franchises={franchises.map((f) => f.title)} />
      </section>

      <section className="panel overflow-hidden">
        <h2 className="border-b border-line px-5 py-3.5 text-sm font-semibold">Merged names ({aliases.rows.length})</h2>
        <ul className="divide-y divide-line">
          {aliases.rows.map((a) => (
            <li key={`${a.kind}:${a.fromKey}`} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-5 py-3 text-sm">
              <span className="rounded-full bg-surface-3 px-2 py-0.5 text-xs text-ink-3 capitalize">{a.kind}</span>
              <span>
                “{a.fromName}” <span className="text-ink-3">→</span> “{a.toName}”
              </span>
              <span className="text-xs text-ink-3">
                <LocalTime value={a.createdAt} />
              </span>
              <span className="ml-auto">
                <ActionButton action={unmergeNameAction} fields={{ kind: a.kind, key: a.fromKey }} label="Undo" />
              </span>
            </li>
          ))}
          {aliases.rows.length === 0 ? <li className="px-5 py-8 text-center text-sm text-ink-3">Nothing merged yet.</li> : null}
        </ul>
      </section>
    </div>
  );
}
