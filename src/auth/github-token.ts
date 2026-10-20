import { config } from "../lib/config";

/**
 * A signed-in user's GitHub token. A GitHub App may let these expire (8 hours, with a refresh token
 * good for 6 months); then GitHub sends both, and ByteMatch renews the access token as it runs out
 * instead of the user's repository checks quietly failing until they sign in again.
 */
export interface GithubToken {
  access: string;
  refresh: string | null;
  /** When the access token stops working; null when it doesn't expire. */
  expiresAt: Date | null;
}

export class GithubTokenError extends Error {}

/** Renew this long before expiry, so a request that starts just before it doesn't fail halfway. */
export const RENEW_EARLY_MS = 5 * 60_000;

export const needsRenewal = (t: Pick<GithubToken, "refresh" | "expiresAt">, now = Date.now()) =>
  !!t.refresh && !!t.expiresAt && t.expiresAt.getTime() - RENEW_EARLY_MS <= now;

/** Reads GitHub's token answer (for a sign-in code or a refresh). */
export function readTokenAnswer(
  body: { access_token?: string; refresh_token?: string; expires_in?: number; error?: string; error_description?: string },
  now = Date.now(),
): GithubToken {
  if (!body.access_token) throw new GithubTokenError(body.error_description ?? body.error ?? "GitHub returned no token");
  return {
    access: body.access_token,
    refresh: body.refresh_token ?? null,
    expiresAt: body.expires_in ? new Date(now + body.expires_in * 1000) : null,
  };
}

async function exchange(params: Record<string, string>): Promise<GithubToken> {
  const res = await fetch("https://github.com/login/oauth/access_token", {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({ client_id: config().GITHUB_CLIENT_ID, client_secret: config().GITHUB_CLIENT_SECRET, ...params }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new GithubTokenError(`GitHub answered ${res.status}`);
  return readTokenAnswer(await res.json());
}

/** The token for a sign-in's code. */
export const tokenForCode = (code: string) => exchange({ code, redirect_uri: `${config().PUBLIC_URL}/auth/callback` });

/** A new token for a refresh token (which GitHub replaces with a new one each time). */
export const renewToken = (refresh: string) => exchange({ grant_type: "refresh_token", refresh_token: refresh });
