"use client";

import { useLinkStatus } from "next/link";

/** Inside a Link: a small spinner while the page it opens is on its way. */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span aria-hidden className="size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent opacity-70" />
  ) : null;
}
