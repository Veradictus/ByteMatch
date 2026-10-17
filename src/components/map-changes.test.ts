import { describe, expect, it } from "vitest";
import { diffSnapshots, type Snapshot } from "./map-changes";

type U = { name: string; m: number; f: number };
const snap = (sha: string, time: number, items: U[]): Snapshot<U> => ({ sha, time, items });
const diff = (a: Snapshot<U>, b: Snapshot<U>) =>
  diffSnapshots(
    a,
    b,
    (u) => u.name,
    (u) => u.m,
    (u) => u.f,
  );

describe("diffSnapshots", () => {
  const old = snap("aaa", 1, [
    { name: "a", m: 50, f: 60 },
    { name: "b", m: 100, f: 100 },
    { name: "c", m: 0, f: 10 },
    { name: "d", m: 20, f: 20 },
  ]);
  const now = snap("bbb", 2, [
    { name: "a", m: 100, f: 100 },
    { name: "b", m: 80, f: 90 },
    { name: "c", m: 0, f: 30 },
    { name: "d", m: 20, f: 20 },
    { name: "e", m: 0, f: 5 },
  ]);

  it("reads changes from the older commit to the newer, either way round", () => {
    for (const d of [diff(old, now), diff(now, old)]) {
      expect(d.older).toBe("aaa");
      expect(d.newer).toBe("bbb");
      expect(Object.fromEntries(d.byKey)).toEqual({
        a: { kind: "up", from: 60, to: 100 },
        b: { kind: "down", from: 100, to: 90 },
        // Fuzzy breaks ties: still unmatched, but closer.
        c: { kind: "up", from: 10, to: 30 },
        e: { kind: "new", from: null, to: 5 },
      });
      expect([d.up, d.down, d.added]).toEqual([2, 1, 1]);
    }
  });

  it("calls nothing new when the older side had nothing to compare", () => {
    expect(diff(snap("x", 1, []), now).byKey.size).toBe(0);
  });
});
