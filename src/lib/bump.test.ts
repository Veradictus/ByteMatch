import { describe, expect, it } from "vitest";
import { BUMP_COOLDOWN_HOURS, nextBump } from "./bump";

describe("nextBump", () => {
  const now = new Date("2026-10-17T12:00:00Z");
  it("allows a first bump and one after the cooldown", () => {
    expect(nextBump(null, now)).toBeNull();
    expect(nextBump(new Date(now.getTime() - BUMP_COOLDOWN_HOURS * 3600_000), now)).toBeNull();
  });
  it("says when the next one is allowed inside the cooldown", () => {
    const at = new Date(now.getTime() - 3600_000);
    expect(nextBump(at, now)).toEqual(new Date(at.getTime() + BUMP_COOLDOWN_HOURS * 3600_000));
  });
});
