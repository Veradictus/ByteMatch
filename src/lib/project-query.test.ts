import { describe, expect, it } from "vitest";
import { filterAndSort, listQuery, matches, paginate, pageWindow, parseListParams } from "./project-query";

const rows = [
  { owner: "OpenRAC", repo: "rac1-decomp", name: "Ratchet & Clank (PAL)", platform: "ps2", codePercent: 86, updated: "2026-10-14" },
  { owner: "OpenRAC", repo: "rac2-gc-decomp", name: "Going Commando", platform: "ps2", codePercent: 12, updated: "2026-10-15" },
  { owner: "zeldaret", repo: "tp", name: "Twilight Princess", platform: "gc", codePercent: 40, updated: "2026-10-01" },
  { owner: "x", repo: "new", name: "Fresh", platform: null, codePercent: null, updated: null },
];

describe("project list queries", () => {
  it("parses and sanitises URL parameters", () => {
    expect(parseListParams(new URLSearchParams("q= ratchet &platform=PS2&sort=progress&page=3"))).toEqual({
      q: "ratchet",
      platform: "ps2",
      sort: "progress",
      page: 3,
    });
    expect(parseListParams({ sort: "bogus", page: "-4" })).toEqual({ q: "", platform: "", sort: "updated", page: 1 });
  });

  it("searches every word, filters by platform and sorts", () => {
    expect(filterAndSort(rows, { q: "clank pal", platform: "", sort: "updated" }).map((r) => r.repo)).toEqual(["rac1-decomp"]);
    expect(filterAndSort(rows, { q: "openrac", platform: "", sort: "updated" }).map((r) => r.repo)).toEqual([
      "rac2-gc-decomp",
      "rac1-decomp",
    ]);
    expect(filterAndSort(rows, { q: "", platform: "ps2", sort: "progress" }).map((r) => r.repo)).toEqual(["rac1-decomp", "rac2-gc-decomp"]);
    expect(filterAndSort(rows, { q: "", platform: "", sort: "progress" }).at(-1)?.repo).toBe("new");
  });

  it("sorts by functions, 30-day gain, size and newest, unknowns last", () => {
    const more = [
      { ...rows[0], matchedFunctions: 4520, gain30: 2.5, totalCode: 3_700_000, createdAt: "2026-10-01" },
      { ...rows[1], matchedFunctions: 9000, gain30: 0.4, totalCode: 48_000_000, createdAt: "2026-10-12" },
      { ...rows[2], matchedFunctions: 100, gain30: 7, totalCode: 1_000_000, createdAt: "2026-09-01" },
      { ...rows[3] },
    ];
    const order = (sort: "functions" | "gain" | "size" | "newest") => filterAndSort(more, { q: "", platform: "", sort }).map((r) => r.repo);
    expect(order("functions")).toEqual(["rac2-gc-decomp", "rac1-decomp", "tp", "new"]);
    expect(order("gain")).toEqual(["tp", "rac1-decomp", "rac2-gc-decomp", "new"]);
    expect(order("size")).toEqual(["rac2-gc-decomp", "rac1-decomp", "tp", "new"]);
    expect(order("newest")).toEqual(["rac2-gc-decomp", "rac1-decomp", "tp", "new"]);
  });

  it("pages and clamps past the end", () => {
    const list = Array.from({ length: 50 }, (_, i) => i);
    expect(paginate(list, 2, 24)).toMatchObject({ items: list.slice(24, 48), total: 50, page: 2, pages: 3 });
    expect(paginate(list, 99, 24).page).toBe(3);
    expect(paginate([], 1, 24)).toMatchObject({ items: [], pages: 1, page: 1 });
  });

  it("builds short URLs and page windows", () => {
    expect(listQuery({ q: "zelda", sort: "updated", page: 1 })).toBe("?q=zelda");
    expect(listQuery({ platform: "gc", sort: "name", page: 2 })).toBe("?platform=gc&sort=name&page=2");
    expect(listQuery({})).toBe("");
    expect(pageWindow(6, 20)).toEqual([1, null, 4, 5, 6, 7, 8, null, 20]);
    expect(pageWindow(2, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });
  it("matches platform names in search", () => {
    const row = { owner: "o", repo: "SM3Dcomp", name: "Super Mario 3D World", platform: "wiiu", codePercent: 1, updated: null };
    expect(matches(row, "wii u")).toBe(true);
    expect(matches(row, "wiiu mario")).toBe(true);
    expect(matches({ ...row, platform: "gc" }, "wii u")).toBe(false);
  });
});
