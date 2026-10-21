"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { highlight, type TokenKind } from "@/lib/source";
import { Close } from "./ui/icons";

interface SourceView {
  path: string;
  url: string;
  kind: "c" | "asm" | "file" | "not-found" | "directory";
  start: number;
  end: number;
  lines: number;
  code: string;
  files?: { path: string; url: string }[];
  commit: string;
}

const TOKEN_CLASS: Record<TokenKind, string> = {
  comment: "text-ink-3 italic",
  string: "text-good",
  keyword: "text-accent",
  type: "text-series-2",
  number: "text-warn",
  preproc: "text-partial",
  plain: "",
};

/** Code with line numbers and light highlighting. */
function Code({ code, first }: { code: string; first: number }) {
  const rows = useMemo(() => highlight(code), [code]);
  const width = String(first + rows.length - 1).length;
  return (
    <pre className="max-h-[32rem] overflow-auto bg-code py-3 font-mono text-[12.5px] leading-5">
      <code>
        {rows.map((tokens, i) => (
          <div key={i} className="flex">
            <span
              className="sticky left-0 shrink-0 bg-code pr-4 pl-4 text-right text-ink-3 select-none"
              style={{ minWidth: `calc(${width}ch + 2rem)` }}
            >
              {first + i}
            </span>
            <span className="pr-4 whitespace-pre">
              {tokens.length
                ? tokens.map(([k, s], j) =>
                    k === "plain" ? (
                      s
                    ) : (
                      <span key={j} className={TOKEN_CLASS[k]}>
                        {s}
                      </span>
                    ),
                  )
                : " "}
            </span>
          </div>
        ))}
      </code>
    </pre>
  );
}

/**
 * A unit's source (FN null) or one function's, from the project's repository at the commit its
 * report came from (GET .../source). Shown under the unit map.
 */
export function SourcePanel({
  owner,
  repo,
  version,
  commit,
  unit,
  fn,
  onClose,
}: {
  owner: string;
  repo: string;
  version: string;
  commit: string | null;
  unit: string;
  fn: string | null;
  onClose: () => void;
}) {
  const [state, setState] = useState<{ for: string; view?: SourceView; error?: string } | null>(null);
  const ref = useRef<HTMLElement>(null);
  const key = `${unit}\u0000${fn ?? ""}\u0000${commit ?? ""}`;

  useEffect(() => {
    let live = true;
    const qs = new URLSearchParams({ unit, version, ...(fn ? { function: fn } : {}), ...(commit ? { commit } : {}) });
    fetch(`/api/v1/projects/${owner}/${repo}/source?${qs}`)
      .then(async (r) => {
        const body = await r.json().catch(() => ({ error: "The answer couldn't be read." }));
        if (live) setState(r.ok ? { for: key, view: body } : { for: key, error: body.error ?? `Error ${r.status}` });
      })
      .catch(() => live && setState({ for: key, error: "ByteMatch couldn't be reached." }));
    return () => {
      live = false;
    };
  }, [owner, repo, version, commit, unit, fn, key]);

  useEffect(() => {
    ref.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [key]);

  const current = state?.for === key ? state : null;
  const v = current?.view;
  const title = fn ?? unit;

  return (
    <section
      ref={ref}
      className="mt-4 overflow-hidden rounded-xl border border-line"
      aria-label={`Source of ${title}`}
      aria-busy={!current}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-line bg-surface-2 px-4 py-2.5 text-sm">
        <span className="min-w-0 truncate font-mono text-[13px]">{title}</span>
        {v && v.kind !== "directory" && v.kind !== "not-found" ? (
          <span className="truncate font-mono text-xs text-ink-3">
            {v.path}
            {v.start ? `:${v.start}${v.end !== v.start ? `–${v.end}` : ""}` : ""}
          </span>
        ) : null}
        <span className="ml-auto flex items-center gap-3">
          {v ? (
            <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-xs text-accent hover:underline">
              Open on GitHub ↗
            </a>
          ) : null}
          <button type="button" onClick={onClose} className="rounded p-0.5 text-ink-3 hover:text-ink" aria-label="Close source">
            <Close size={14} />
          </button>
        </span>
      </div>
      {!current ? (
        <p className="px-4 py-6 text-sm text-ink-3">Fetching the source from GitHub…</p>
      ) : current.error ? (
        <p className="px-4 py-6 text-sm text-bad">{current.error}</p>
      ) : v?.kind === "directory" ? (
        <div className="px-4 py-4 text-sm">
          <p className="mb-2 text-ink-3">This unit is a folder of files. Pick a function in it to see its code, or open a file:</p>
          <ul className="grid gap-1 font-mono text-xs sm:grid-cols-2">
            {v.files?.map((f) => (
              <li key={f.path}>
                <a href={f.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
                  {f.path}
                </a>
              </li>
            ))}
          </ul>
        </div>
      ) : v?.kind === "not-found" ? (
        <p className="px-4 py-6 text-sm text-ink-3">
          {fn ? `Couldn't find ${fn} in ${v.path} at this commit.` : `Nothing to show in ${v.path}.`}{" "}
          <a href={v.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">
            Open the file on GitHub
          </a>
          , or see{" "}
          <Link href="/docs/source-linking" className="text-accent hover:underline">
            how ByteMatch finds functions
          </Link>{" "}
          for the ways a project can make it findable.
        </p>
      ) : v ? (
        <>
          {v.kind === "asm" ? (
            <p className="border-b border-line px-4 py-2 text-xs text-ink-3">
              Not written in C yet: the project includes this function as assembly here.
            </p>
          ) : null}
          <Code code={v.code} first={v.start} />
          {v.kind === "file" && v.end < v.lines ? (
            <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
              Showing {v.end} of {v.lines} lines; the rest is on GitHub.
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
