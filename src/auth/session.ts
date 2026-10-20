import { randomBytes } from "node:crypto";
import { and, eq, gt, sql } from "drizzle-orm";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { db } from "../db/client";
import { sessions, users, type Project, type User } from "../db/schema";
import { userClient } from "../github/client";
import { needsRenewal, renewToken, type GithubToken } from "./github-token";
import { config } from "../lib/config";
import { decrypt, encrypt, sha256 } from "../lib/crypto";
import { isBlocked } from "../lib/moderation";
import { roleOf, submitterRole, type Role } from "../lib/roles";

export const SESSION_COOKIE = "bytematch_session";
export const STATE_COOKIE = "bytematch_oauth_state";
const SESSION_DAYS = 30;

export interface Session {
  user: User;
  githubToken: string;
  /** Site staff: an owner (ADMIN_GITHUB_LOGINS) or an admin appointed in the panel. */
  admin: boolean;
  owner: boolean;
  role: Role | null;
}

const secureCookies = () => config().PUBLIC_URL.startsWith("https://");

export function cookieOptions(maxAgeSeconds: number) {
  return { httpOnly: true, secure: secureCookies(), sameSite: "lax" as const, path: "/", maxAge: maxAgeSeconds };
}

/** Creates a session for a GitHub user who just signed in; returns the cookie value. */
export async function createSession(
  profile: { id: number; login: string; name?: string | null; avatar_url?: string | null },
  githubToken: GithubToken | string,
) {
  const gh: GithubToken = typeof githubToken === "string" ? { access: githubToken, refresh: null, expiresAt: null } : githubToken;
  const [user] = await db()
    .insert(users)
    .values({ githubId: profile.id, login: profile.login, name: profile.name ?? null, avatarUrl: profile.avatar_url ?? null })
    .onConflictDoUpdate({
      target: users.githubId,
      set: { login: profile.login, name: profile.name ?? null, avatarUrl: profile.avatar_url ?? null },
    })
    .returning();
  const token = randomBytes(32).toString("base64url");
  await db()
    .insert(sessions)
    .values({
      id: sha256(token),
      userId: user.id,
      githubToken: encrypt(gh.access),
      githubRefreshToken: gh.refresh ? encrypt(gh.refresh) : null,
      githubTokenExpiresAt: gh.expiresAt,
      expiresAt: new Date(Date.now() + SESSION_DAYS * 86400_000),
    });
  return { token, maxAge: SESSION_DAYS * 86400 };
}

/** The signed-in user for this request, if any (once per request). */
export const currentSession = cache(async (): Promise<Session | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || !config().SECRET_KEY) return null;
  const id = sha256(token);
  const [row] = await db()
    .select({
      user: users,
      githubToken: sessions.githubToken,
      refresh: sessions.githubRefreshToken,
      expiresAt: sessions.githubTokenExpiresAt,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.id, id), gt(sessions.expiresAt, new Date())));
  if (!row) return null;
  if (await isBlocked({ githubId: row.user.githubId, login: row.user.login })) return null;
  try {
    const githubToken = needsRenewal(row) ? await renewSessionToken(id) : decrypt(row.githubToken);
    if (!githubToken) return null;
    const role = await roleOf({ githubId: row.user.githubId, login: row.user.login });
    return { user: row.user, githubToken, admin: role !== null, owner: role === "owner", role };
  } catch {
    return null;
  }
});

/**
 * Renews a session's expiring GitHub token, returning the new one. GitHub's refresh tokens work
 * once, so concurrent requests take turns on the session's row: whoever comes second finds it
 * renewed already. When GitHub refuses (the refresh token has expired or the user revoked
 * access), the session ends and the user signs in again; null then.
 */
export async function renewSessionToken(id: string): Promise<string | null> {
  return db().transaction(async (tx) => {
    const [row] = await tx
      .select({ githubToken: sessions.githubToken, refresh: sessions.githubRefreshToken, expiresAt: sessions.githubTokenExpiresAt })
      .from(sessions)
      .where(eq(sessions.id, id))
      .for("update");
    if (!row) return null;
    if (!needsRenewal(row)) return decrypt(row.githubToken);
    let next: GithubToken;
    try {
      next = await renewToken(decrypt(row.refresh!));
    } catch (e) {
      console.error("github token renewal", e);
      await tx.delete(sessions).where(eq(sessions.id, id));
      return null;
    }
    await tx
      .update(sessions)
      .set({
        githubToken: encrypt(next.access),
        // GitHub sends a new refresh token with each renewal; keep the old one if it ever doesn't.
        githubRefreshToken: next.refresh ? encrypt(next.refresh) : row.refresh,
        githubTokenExpiresAt: next.expiresAt ?? sql`null`,
      })
      .where(eq(sessions.id, id));
    return next.access;
  });
}

export async function destroySession(token: string | undefined) {
  if (token)
    await db()
      .delete(sessions)
      .where(eq(sessions.id, sha256(token)));
}

/** GitHub turned the session's token away: expired with nothing to renew it (signed in before renewals), or revoked. */
export const tokenRejected = (e: unknown) => (e as { status?: unknown } | null)?.status === 401;

/**
 * Sends the user through "Sign in with GitHub" again and back to NEXT. GitHub skips its consent
 * screen for someone who already approved the App, so this is a couple of redirects, not a form.
 */
export function signInAgain(next: string): never {
  redirect(`/auth/login?next=${encodeURIComponent(next)}`);
}

/**
 * Can the session's user manage OWNER/REPO? Site admins can; otherwise GitHub must say "admin".
 * With NEXT, a token GitHub no longer accepts signs the user in again and returns there, rather
 * than reading as "no rights".
 */
export async function canManageRepo(session: Session, owner: string, repo: string, next?: string): Promise<boolean> {
  if (session.owner) return true;
  let rejected = false;
  try {
    const { data } = await userClient(session.githubToken).request("GET /repos/{owner}/{repo}", { owner, repo });
    return !!data.permissions?.admin;
  } catch (e) {
    rejected = tokenRejected(e);
  }
  if (rejected && next) signInAgain(next);
  return false;
}

/** Owners manage everything; admins everything except owners' projects; others need GitHub admin rights. */
export async function canManage(session: Session, project: Pick<Project, "owner" | "repo" | "createdBy">, next?: string): Promise<boolean> {
  if (session.owner) return true;
  if (session.admin && (await submitterRole(project)) !== "owner") return true;
  return canManageRepo(session, project.owner, project.repo, next);
}
