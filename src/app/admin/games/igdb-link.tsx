"use client";

import { useActionState, useState } from "react";
import { ExternalImage } from "@/components/external-image";
import type { IgdbGame } from "@/lib/igdb";
import type { AdminState } from "../actions";

/** Search IGDB for one game page's game and link it; the server reads the picked game from IGDB again. */
export function IgdbLink({
  gameKey,
  title,
  action,
}: {
  gameKey: string;
  title: string;
  action: (state: AdminState, form: FormData) => Promise<AdminState>;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState(title);
  const [found, setFound] = useState<IgdbGame[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [searching, setSearching] = useState(false);
  const [state, run, pending] = useActionState(action, {});

  const search = async () => {
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/igdb?q=${encodeURIComponent(q)}`);
      const body = (await res.json()) as { games?: IgdbGame[]; error?: string };
      setFound(body.games ?? []);
      setError(body.error ?? null);
    } catch {
      setError("IGDB didn't answer.");
    } finally {
      setSearching(false);
    }
  };

  if (state.message) return <span className="text-xs text-good">{state.message}</span>;
  if (!open)
    return (
      <button type="button" onClick={() => setOpen(true)} className="rounded-lg px-2 py-1 text-xs text-accent hover:bg-surface-2">
        Link to IGDB
      </button>
    );
  return (
    <div className="grid w-full gap-2 sm:w-[26rem]">
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input value={q} onChange={(e) => setQ(e.target.value)} className="field h-8 min-w-0 flex-1 px-2 text-xs" autoFocus />
        <button disabled={searching} className="btn btn-ghost h-8 px-3 text-xs">
          {searching ? "Searching…" : "Search"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-1 text-xs text-ink-3 hover:text-ink">
          Cancel
        </button>
      </form>
      {error || state.error ? <p className="text-xs text-bad">{error ?? state.error}</p> : null}
      {found ? (
        found.length ? (
          <ul className="grid gap-0.5 rounded-lg border border-line bg-surface-2 p-1">
            {found.map((g) => (
              <li key={g.id}>
                <form action={run} className="flex items-center gap-2.5 rounded-md px-2 py-1.5 hover:bg-surface-3">
                  <input type="hidden" name="key" value={gameKey} />
                  <input type="hidden" name="igdbId" value={g.id} />
                  {g.cover ? (
                    <ExternalImage src={g.cover} className="h-8 w-6 shrink-0 rounded-sm object-cover" />
                  ) : (
                    <span className="h-8 w-6 shrink-0 rounded-sm bg-surface-3" aria-hidden />
                  )}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">
                      {g.url ? (
                        <a href={g.url} target="_blank" rel="noopener noreferrer" className="hover:underline">
                          {g.name}
                        </a>
                      ) : (
                        g.name
                      )}
                    </span>
                    <span className="block truncate text-xs text-ink-3">
                      {[g.year, g.platforms.slice(0, 4).join(", ") || null, g.franchise].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <button disabled={pending} className="rounded-lg px-2 py-1 text-xs text-accent hover:bg-surface-2">
                    Link
                  </button>
                </form>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-xs text-ink-3">Nothing on IGDB by that name; try another spelling.</p>
        )
      ) : null}
    </div>
  );
}
