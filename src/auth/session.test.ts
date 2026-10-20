import { afterEach, describe, expect, it, vi } from "vitest";
import { TEST_DB, useTestDb } from "../../test/db";

describe.skipIf(!TEST_DB)("session GitHub tokens", () => {
  process.env.SECRET_KEY = "0".repeat(64);
  process.env.GITHUB_CLIENT_ID = "client";
  process.env.GITHUB_CLIENT_SECRET = "secret";
  useTestDb();
  afterEach(() => vi.unstubAllGlobals());

  const start = async (expiresAt: Date) => {
    const { createSession } = await import("./session");
    const { sha256 } = await import("../lib/crypto");
    const { token } = await createSession({ id: 1, login: "maintainer" }, { access: "old", refresh: "r1", expiresAt });
    return sha256(token);
  };
  const row = async (id: string) => {
    const { db } = await import("../db/client");
    const { sessions } = await import("../db/schema");
    const { eq } = await import("drizzle-orm");
    return (await db().select().from(sessions).where(eq(sessions.id, id)))[0];
  };

  it("renews an expiring token once, however many requests ask at the same time", async () => {
    const fetch = vi.fn(async () => Response.json({ access_token: "new", refresh_token: "r2", expires_in: 28800 }));
    vi.stubGlobal("fetch", fetch);
    const { renewSessionToken } = await import("./session");
    const { decrypt } = await import("../lib/crypto");
    const id = await start(new Date(Date.now() - 1000));
    expect(await Promise.all([renewSessionToken(id), renewSessionToken(id)])).toEqual(["new", "new"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const r = await row(id);
    expect(decrypt(r.githubToken)).toBe("new");
    expect(decrypt(r.githubRefreshToken!)).toBe("r2");
    expect(r.githubTokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 7 * 3600_000);
  });

  it("ends the session when GitHub refuses the refresh token", async () => {
    vi.stubGlobal("fetch", async () => Response.json({ error: "bad_refresh_token", error_description: "The refresh token is invalid." }));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { renewSessionToken } = await import("./session");
    const id = await start(new Date(Date.now() - 1000));
    expect(await renewSessionToken(id)).toBeNull();
    expect(await row(id)).toBeUndefined();
  });
});
