import { describe, expect, it } from "vitest";
import { platformOptions, samePlatform } from "./platforms";

describe("platform filter", () => {
  it("lists every known platform once, with how many projects use it", () => {
    const options = platformOptions(["ps2", "ps2", "ps1", "ps", "WiiU", null, "amiga"]);
    expect(options.find((o) => o.name === "Wii U")).toEqual({ id: "wiiu", name: "Wii U", count: 1 });
    expect(options.find((o) => o.name === "PlayStation 2")?.count).toBe(2);
    // ps and ps1 are one platform.
    expect(options.filter((o) => o.name === "PlayStation")).toEqual([{ id: "ps", name: "PlayStation", count: 2 }]);
    expect(options.find((o) => o.name === "Xbox")?.count).toBe(0);
    expect(options.find((o) => o.id === "amiga")).toEqual({ id: "amiga", name: "amiga", count: 1 });
  });
  it("matches ids of one platform", () => {
    expect(samePlatform("ps1", "ps")).toBe(true);
    expect(samePlatform("wiiu", "WIIU")).toBe(true);
    expect(samePlatform("wii", "wiiu")).toBe(false);
    expect(samePlatform(null, "ps")).toBe(false);
  });
});
