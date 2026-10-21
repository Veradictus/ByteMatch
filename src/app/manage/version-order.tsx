"use client";

import { useState } from "react";
import { ChevronDown } from "@/components/ui/icons";

export interface OrderedVersion {
  version: string;
  label: string;
  /** What it's called without a name of its own (its game, or its id). */
  fallback: string;
  percent: number;
}

/**
 * The project's versions in the order its pages list them, each with an optional name. The first
 * is the primary: the version the project's page opens on. Sent as `order` (repeated) and
 * `label:<version>` fields.
 */
export function VersionOrder({ versions, inputClass }: { versions: OrderedVersion[]; inputClass: string }) {
  const [list, setList] = useState(versions);
  const move = (i: number, by: number) =>
    setList((l) => {
      const j = i + by;
      if (j < 0 || j >= l.length) return l;
      const next = [...l];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
  return (
    <ol className="grid gap-2">
      {list.map((v, i) => (
        <li
          key={v.version}
          className={`grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border px-3 py-2 ${i === 0 ? "border-accent bg-surface-2" : "border-line"}`}
        >
          <input type="hidden" name="order" value={v.version} />
          <div className="flex flex-col">
            <button
              type="button"
              onClick={() => move(i, -1)}
              disabled={i === 0}
              aria-label={`Move ${v.version} up`}
              className="rounded p-0.5 text-ink-3 hover:text-ink disabled:opacity-30"
            >
              <ChevronDown size={14} className="rotate-180" />
            </button>
            <button
              type="button"
              onClick={() => move(i, 1)}
              disabled={i === list.length - 1}
              aria-label={`Move ${v.version} down`}
              className="rounded p-0.5 text-ink-3 hover:text-ink disabled:opacity-30"
            >
              <ChevronDown size={14} />
            </button>
          </div>
          <label className="grid min-w-0 gap-1 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center sm:gap-3">
            <span className="truncate font-mono text-xs text-ink-2">{v.version}</span>
            <input
              name={`label:${v.version}`}
              defaultValue={v.label}
              maxLength={60}
              placeholder={v.fallback}
              aria-label={`Name for ${v.version}`}
              className={`${inputClass} h-8 text-sm`}
            />
          </label>
          <span className="flex shrink-0 items-center gap-2 text-xs text-ink-3">
            <span className="font-mono">{v.percent.toFixed(2)}%</span>
            {i === 0 ? <span className="rounded-full bg-accent/15 px-2 py-0.5 font-medium text-accent">Primary</span> : null}
          </span>
        </li>
      ))}
    </ol>
  );
}
