import { describe, expect, it } from "vitest";
import { progressSegments } from "./progress-segments";

describe("progress segments", () => {
  it("shows cumulative measures without double-counting their widths", () => {
    const segments = progressSegments(70, 30, 90);
    expect(segments.map((s) => s.width)).toEqual([30, 40, 20]);
    expect(segments.map((s) => s.value)).toEqual([30, 70, 90]);
  });
  it("uses a solid matched bar when linking is not reported", () => {
    expect(progressSegments(62)[0]).toMatchObject({ width: 62, className: "match-solid" });
  });
  it("bounds invalid, overlapping and out-of-range measures", () => {
    for (const args of [
      [-1, 0, 0],
      [NaN, Infinity, 200],
      [20, 80, 50],
      [100, 100, 100],
    ]) {
      const segments = progressSegments(...(args as [number, number, number]));
      expect(segments.every((s) => Number.isFinite(s.width) && s.width > 0)).toBe(true);
      expect(segments.reduce((n, s) => n + s.width, 0)).toBeLessThanOrEqual(100);
    }
    expect(progressSegments(0)).toEqual([]);
  });
});
