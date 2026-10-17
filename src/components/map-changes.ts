/**
 * What changed on the unit map between two commits, so moving between commits can point at the
 * tiles that moved instead of just redrawing the grid. Pure, for the map and its tests.
 */

export type ChangeKind = "up" | "down" | "new";

export interface Change {
  kind: ChangeKind;
  /** Match at the older commit (null for a tile new at the newer one), and at the newer. */
  from: number | null;
  to: number;
}

export interface Snapshot<T> {
  sha: string;
  /** Commit time, ms; decides which side is older. */
  time: number;
  items: T[];
}

export interface Changes {
  older: string;
  newer: string;
  byKey: Map<string, Change>;
  up: number;
  down: number;
  added: number;
}

let comparisons = 0;
/** Counts comparisons, so the map can restart its animations for each one. */
export const nextComparison = () => ++comparisons;

/**
 * Tiles whose match differs between two snapshots, read from the older commit to the newer
 * whichever way the viewer moved: "up" is progress, "down" a regression. Matched percentage
 * decides; fuzzy match breaks ties, so a function edging closer still counts.
 */
export function diffSnapshots<T>(
  a: Snapshot<T>,
  b: Snapshot<T>,
  key: (t: T) => string,
  matched: (t: T) => number,
  fuzzy: (t: T) => number,
): Changes {
  const [older, newer] = a.time <= b.time ? [a, b] : [b, a];
  const before = new Map(older.items.map((t) => [key(t), t]));
  const byKey = new Map<string, Change>();
  let up = 0;
  let down = 0;
  let added = 0;
  const eps = 1e-6;
  for (const t of newer.items) {
    const k = key(t);
    const o = before.get(k);
    if (!o) {
      // A tile only the newer commit has (a split, a new unit); none at all when the older had nothing.
      if (older.items.length) {
        byKey.set(k, { kind: "new", from: null, to: fuzzy(t) });
        added++;
      }
      continue;
    }
    const dm = matched(t) - matched(o);
    const df = fuzzy(t) - fuzzy(o);
    const d = Math.abs(dm) > eps ? dm : df;
    if (Math.abs(d) <= eps) continue;
    const kind = d > 0 ? "up" : "down";
    byKey.set(k, { kind, from: fuzzy(o), to: fuzzy(t) });
    if (kind === "up") up++;
    else down++;
  }
  return { older: older.sha, newer: newer.sha, byKey, up, down, added };
}
