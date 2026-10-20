import { describe, expect, it } from "vitest";
import { GithubTokenError, needsRenewal, readTokenAnswer, RENEW_EARLY_MS } from "./github-token";

describe("GitHub user tokens", () => {
  const now = Date.parse("2026-10-20T12:00:00Z");
  it("reads expiring and non-expiring answers", () => {
    expect(readTokenAnswer({ access_token: "a", refresh_token: "r", expires_in: 28800 }, now)).toEqual({
      access: "a",
      refresh: "r",
      expiresAt: new Date(now + 28800_000),
    });
    expect(readTokenAnswer({ access_token: "a" }, now)).toEqual({ access: "a", refresh: null, expiresAt: null });
    expect(() => readTokenAnswer({ error: "bad_refresh_token", error_description: "The refresh token is invalid." })).toThrow(
      GithubTokenError,
    );
  });
  it("renews shortly before expiry, and never without a refresh token", () => {
    const soon = new Date(now + RENEW_EARLY_MS - 1);
    const later = new Date(now + RENEW_EARLY_MS + 60_000);
    expect(needsRenewal({ refresh: "r", expiresAt: soon }, now)).toBe(true);
    expect(needsRenewal({ refresh: "r", expiresAt: later }, now)).toBe(false);
    expect(needsRenewal({ refresh: null, expiresAt: soon }, now)).toBe(false);
    expect(needsRenewal({ refresh: "r", expiresAt: null }, now)).toBe(false);
  });
});
