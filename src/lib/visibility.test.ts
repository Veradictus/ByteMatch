import { describe, expect, it } from "vitest";
import { checkDiscordUrl } from "./links";
import { HIDE_AFTER_DAYS, hiddenFromPublic, unreachable } from "./visibility";

describe("hiddenFromPublic", () => {
  const ok = { enabled: true, lastError: null };
  const noAccess = "no GitHub access to a/b: install the GitHub App there or set GITHUB_TOKEN";
  it("shows healthy projects, with or without reports yet", () => {
    expect(hiddenFromPublic(ok, true)).toBe(false);
    expect(hiddenFromPublic(ok, false)).toBe(false);
  });
  it("hides disabled projects, repositories gone for a while, and errors with nothing to show", () => {
    const longAgo = new Date(Date.now() - (HIDE_AFTER_DAYS + 1) * 86400_000);
    expect(hiddenFromPublic({ enabled: false, lastError: null }, true)).toBe(true);
    expect(hiddenFromPublic({ enabled: true, lastError: "Not Found - https://docs.github.com/rest", errorSince: longAgo }, true)).toBe(
      true,
    );
    expect(hiddenFromPublic({ enabled: true, lastError: "Repository access blocked", errorSince: longAgo }, true)).toBe(true);
    // Rows from before errorSince was kept count from their last error, or hide at once without one.
    expect(hiddenFromPublic({ enabled: true, lastError: "Not Found", lastErrorAt: longAgo }, true)).toBe(true);
    expect(hiddenFromPublic({ enabled: true, lastError: "Not Found" }, true)).toBe(true);
    expect(hiddenFromPublic({ enabled: true, lastError: noAccess }, false)).toBe(true);
    expect(hiddenFromPublic({ enabled: true, lastError: "report is not valid JSON" }, false)).toBe(true);
  });
  it("keeps a repository made private for a while visible, with its last progress", () => {
    const p = { enabled: true, lastError: "Not Found - https://docs.github.com/rest", errorSince: new Date(Date.now() - 3 * 86400_000) };
    expect(unreachable(p)).toBe(true);
    expect(hiddenFromPublic(p, true)).toBe(false);
    // ...but not one that never had a report.
    expect(hiddenFromPublic(p, false)).toBe(true);
  });

  it("keeps projects with history visible through passing errors and missing access on our side", () => {
    expect(hiddenFromPublic({ enabled: true, lastError: "API rate limit exceeded for user [id]" }, true)).toBe(false);
    expect(hiddenFromPublic({ enabled: true, lastError: "report is not valid JSON" }, true)).toBe(false);
    expect(hiddenFromPublic({ enabled: true, lastError: noAccess }, true)).toBe(false);
  });
});

describe("checkDiscordUrl", () => {
  it("accepts invites and normalises them", () => {
    expect(checkDiscordUrl("https://discord.gg/Sfd2B54PDG")).toEqual({ url: "https://discord.gg/Sfd2B54PDG" });
    expect(checkDiscordUrl("discord.gg/abc123")).toEqual({ url: "https://discord.gg/abc123" });
    expect(checkDiscordUrl("https://discord.com/invite/abc-123")).toEqual({ url: "https://discord.gg/abc-123" });
    expect(checkDiscordUrl("")).toEqual({ url: null });
  });
  it("refuses other links", () => {
    expect(checkDiscordUrl("https://evil.example/discord.gg/abc")).toHaveProperty("error");
    expect(checkDiscordUrl("https://discord.com/channels/1/2")).toHaveProperty("error");
    expect(checkDiscordUrl("javascript:alert(1)")).toHaveProperty("error");
  });
});
