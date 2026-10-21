"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";

/** What the unit map keeps in the URL, carried along when moving between commits. */
const KEPT = ["unit", "layout", "category"];

/**
 * A link to the project page at another commit (or the latest, with no COMMIT) that keeps the
 * map's open unit, layout and category. Read from the URL as it is now: the map changes those
 * without asking the server, so the page's own links wouldn't know.
 */
export function CommitLink({
  base,
  commit,
  className,
  title,
  children,
}: {
  base: string;
  commit: string | null;
  className?: string;
  title?: string;
  children: React.ReactNode;
}) {
  const search = useSearchParams();
  const qs = new URLSearchParams();
  for (const k of KEPT) {
    const v = search.get(k);
    if (v) qs.set(k, v);
  }
  if (commit) qs.set("commit", commit.slice(0, 12));
  const s = qs.toString();
  return (
    <Link href={s ? `${base}?${s}` : base} className={className} title={title} scroll={false}>
      {children}
    </Link>
  );
}
