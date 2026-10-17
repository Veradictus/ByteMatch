"use client";

import { useState } from "react";
import { resolveKey, similarKeys } from "@/lib/games";

export interface NameOption {
  title: string;
  key: string;
  /** Projects grouped under it, by id, so the hint can leave this project out. */
  projectIds: number[];
}

/**
 * A game or franchise name, with a line under it saying what the name will do: join an existing
 * page (and how it'll be shown there), probably mean an existing one ("Did you mean …?"), or start
 * a new page. Grouping itself happens on the server with the same functions.
 */
export function NameField({
  name,
  kind,
  defaultValue,
  placeholder,
  options,
  aliases,
  projectId,
  className,
  value: controlled,
  onChange,
  below,
}: {
  name: string;
  kind: "game" | "franchise";
  defaultValue: string;
  placeholder: string;
  options: NameOption[];
  aliases: [string, string][];
  projectId: number;
  className: string;
  /** Controlled use: the value and its setter (defaultValue is then ignored). */
  value?: string;
  onChange?: (v: string) => void;
  /** Shown between the input and its hint (suggestions from elsewhere). */
  below?: React.ReactNode;
}) {
  const [own, setOwn] = useState(defaultValue);
  const value = controlled ?? own;
  const setValue = onChange ?? setOwn;
  const map = new Map(aliases);
  const v = value.trim();
  const key = v ? resolveKey(v, map) : "";
  const match = key ? options.find((o) => o.key === key) : undefined;
  const others = match ? match.projectIds.filter((id) => id !== projectId).length : 0;
  const near = !match && key ? options.filter((o) => similarKeys(o.key, key)).slice(0, 3) : [];
  const page = kind === "game" ? "game page" : "franchise page";
  const listId = `${name}-names`;

  let hint: React.ReactNode = null;
  if (match && others) {
    hint = (
      <span className="text-good">
        Joins “{match.title}” with {others} other project{others === 1 ? "" : "s"}
        {match.title !== v ? <span className="text-ink-3"> (shown as “{match.title}”)</span> : null}.
      </span>
    );
  } else if (match) {
    hint = <span className="text-ink-3">This project&apos;s own {page}.</span>;
  } else if (near.length) {
    hint = (
      <span className="text-warn">
        Did you mean{" "}
        {near.map((o, i) => (
          <span key={o.key}>
            {i ? " or " : ""}
            <button type="button" className="underline hover:text-ink" onClick={() => setValue(o.title)}>
              {o.title}
            </button>
          </span>
        ))}
        ? Otherwise this starts a new {page}.
      </span>
    );
  } else if (v) {
    hint = <span className="text-ink-3">Starts a new {page}.</span>;
  }

  return (
    <>
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        list={listId}
        placeholder={placeholder}
        className={className}
        autoComplete="off"
        aria-describedby={`${name}-hint`}
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o.key} value={o.title} />
        ))}
      </datalist>
      {below}
      <span id={`${name}-hint`} aria-live="polite" className="min-h-4 text-xs">
        {hint}
      </span>
    </>
  );
}
