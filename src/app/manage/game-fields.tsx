"use client";

import { useEffect, useRef, useState } from "react";
import { ExternalImage } from "@/components/external-image";
import type { IgdbGame } from "@/lib/igdb";
import { NameField, type NameOption } from "./name-field";

function Label({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="grid content-start gap-1.5 text-sm">
      <span>
        {label} {hint ? <span className="text-xs text-ink-3">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

/**
 * Game, franchise and release year. With IGDB on (src/lib/igdb.ts), typing a game name offers
 * IGDB's games; picking one fills in its name, year and franchise and keeps its id, so projects of
 * one game share a page however they'd have typed it.
 */
export function GameFields({
  game: game0,
  franchise: franchise0,
  year: year0,
  igdbId: igdb0,
  igdb,
  gameOptions,
  franchiseOptions,
  gameAliases,
  franchiseAliases,
  projectId,
  inputClass,
}: {
  game: string;
  franchise: string;
  year: string;
  igdbId: number | null;
  /** Whether the instance has IGDB lookups. */
  igdb: boolean;
  gameOptions: NameOption[];
  franchiseOptions: NameOption[];
  gameAliases: [string, string][];
  franchiseAliases: [string, string][];
  projectId: number;
  inputClass: string;
}) {
  const [game, setGame] = useState(game0);
  const [franchise, setFranchise] = useState(franchise0);
  const [year, setYear] = useState(year0);
  // The IGDB game the name was picked from, as long as the name is still its name.
  const [picked, setPicked] = useState<{ id: number; name: string } | null>(igdb0 ? { id: igdb0, name: game0 } : null);
  const [found, setFound] = useState<IgdbGame[]>([]);
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const typed = useRef(false);

  useEffect(() => {
    const q = game.trim();
    if (!igdb || !typed.current || q.length < 2 || q === picked?.name) return;
    const ask = new AbortController();
    const wait = setTimeout(async () => {
      try {
        const res = await fetch(`/api/igdb?q=${encodeURIComponent(q)}`, { signal: ask.signal });
        const body = (await res.json()) as { games?: IgdbGame[]; error?: string };
        setFound(body.games ?? []);
        setNote(body.error ?? null);
        setOpen(true);
      } catch {
        // Aborted by the next keystroke, or offline: the name can still be typed.
      }
    }, 350);
    return () => {
      clearTimeout(wait);
      ask.abort();
    };
  }, [game, igdb, picked]);

  const change = (v: string) => {
    typed.current = true;
    setGame(v);
    if (picked && v.trim() !== picked.name) setPicked(null);
  };

  const pick = (g: IgdbGame) => {
    setGame(g.name);
    setPicked({ id: g.id, name: g.name });
    if (!franchise.trim() && g.franchise) setFranchise(g.franchise);
    if (!year.trim() && g.year) setYear(String(g.year));
    setOpen(false);
  };

  const suggestions =
    igdb && open && (found.length || note) ? (
      <div className="rounded-lg border border-line bg-surface-2 p-1" role="listbox" aria-label="Games on IGDB">
        {note ? <p className="px-2 py-1.5 text-xs text-warn">{note}</p> : null}
        {found.map((g) => (
          <button
            key={g.id}
            type="button"
            role="option"
            aria-selected={false}
            onClick={() => pick(g)}
            className="flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left hover:bg-surface-3"
          >
            {g.cover ? (
              <ExternalImage src={g.cover} className="h-8 w-6 shrink-0 rounded-sm object-cover" />
            ) : (
              <span className="h-8 w-6 shrink-0 rounded-sm bg-surface-3" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block truncate text-sm text-ink">{g.name}</span>
              <span className="block truncate text-xs text-ink-3">
                {[g.year, g.platforms.slice(0, 4).join(", ") || null, g.franchise].filter(Boolean).join(" · ")}
              </span>
            </span>
          </button>
        ))}
        <div className="flex items-center justify-between gap-2 px-2 pt-1 pb-0.5 text-[11px] text-ink-3">
          <span>
            Game data from{" "}
            <a href="https://www.igdb.com" target="_blank" rel="noopener noreferrer" className="underline hover:text-ink">
              IGDB.com
            </a>
          </span>
          <button type="button" onClick={() => setOpen(false)} className="hover:text-ink">
            Keep what I typed
          </button>
        </div>
      </div>
    ) : picked && igdb ? (
      <p className="text-xs text-good">Picked from IGDB: projects that pick it too share this game page.</p>
    ) : null;

  return (
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_7rem]">
      <Label label="Game" hint={igdb ? "type to look it up on IGDB" : "groups projects on one game page"}>
        <NameField
          name="game"
          kind="game"
          defaultValue={game0}
          value={game}
          onChange={change}
          placeholder="Ratchet & Clank"
          options={gameOptions}
          aliases={gameAliases}
          projectId={projectId}
          className={inputClass}
          below={suggestions}
        />
        <input type="hidden" name="igdbId" value={picked?.id ?? ""} />
      </Label>
      <Label label="Franchise" hint="optional">
        <NameField
          name="franchise"
          kind="franchise"
          defaultValue={franchise0}
          value={franchise}
          onChange={setFranchise}
          placeholder="Ratchet & Clank"
          options={franchiseOptions}
          aliases={franchiseAliases}
          projectId={projectId}
          className={inputClass}
        />
      </Label>
      <Label label="Year" hint="release">
        <input
          name="releaseYear"
          value={year}
          onChange={(e) => setYear(e.target.value)}
          inputMode="numeric"
          placeholder="2002"
          className={inputClass}
        />
      </Label>
    </div>
  );
}
