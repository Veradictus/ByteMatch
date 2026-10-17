/**
 * "Recently updated" lists projects by their last progress (src/db/store.ts, PROGRESS_MEASURES),
 * so commits that only touch tooling don't move them. Work a report can't show as progress (a
 * new tool, docs, a playable build) a maintainer can announce with a bump, which counts as an
 * update now; at most one per project a day, so bumps can't keep a project on top.
 */

export const BUMP_COOLDOWN_HOURS = 24;

/** When the project can be bumped again; null when it can be now. */
export function nextBump(bumpedAt: Date | null | undefined, now = new Date()): Date | null {
  if (!bumpedAt) return null;
  const next = new Date(bumpedAt.getTime() + BUMP_COOLDOWN_HOURS * 3600_000);
  return next > now ? next : null;
}
