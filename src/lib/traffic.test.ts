import { describe, expect, it } from "vitest";
import { countedPath, isBot, referrerHost, visitorHash } from "./traffic";

describe("traffic", () => {
  it("counts public pages, normalised, and nothing private", () => {
    expect(countedPath("/OpenRAC/rac1-decomp?unit=core%2F1#x")).toBe("/OpenRAC/rac1-decomp");
    expect(countedPath("/games/")).toBe("/games");
    expect(countedPath("/")).toBe("/");
    expect(countedPath("/theme/brave%20otter")).toBe("/theme/brave otter");
    for (const p of ["/admin", "/admin/stats", "/manage/x/y", "/api/hit", "/auth/login", "//evil.com", "https://x", "", 42, "/%E0%A4%A"]) {
      expect(countedPath(p), String(p)).toBeNull();
    }
    expect(countedPath("/" + "a".repeat(300))).toBeNull();
  });

  it("knows crawlers and missing user agents", () => {
    expect(isBot("Mozilla/5.0 (compatible; Googlebot/2.1)")).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh) Discordbot/2.0")).toBe(true);
    expect(isBot(null)).toBe(true);
    expect(isBot("Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15")).toBe(false);
  });

  it("keeps only another site's host from a referrer", () => {
    expect(referrerHost("https://www.github.com/OpenRAC/rac1-decomp?tab=readme", "bytematch.dev")).toBe("github.com");
    expect(referrerHost("https://bytematch.dev/games", "bytematch.dev")).toBeNull();
    expect(referrerHost("android-app://com.discord", "bytematch.dev")).toBeNull();
    expect(referrerHost("", "bytematch.dev")).toBeNull();
  });

  it("gives one visitor one hash a day, and another the next day", () => {
    const a = visitorHash("2026-10-16", "s", "203.0.113.7", "UA");
    expect(visitorHash("2026-10-16", "s", "203.0.113.7", "UA")).toBe(a);
    expect(visitorHash("2026-10-17", "s", "203.0.113.7", "UA")).not.toBe(a);
    expect(visitorHash("2026-10-16", "s", "203.0.113.8", "UA")).not.toBe(a);
  });
});
