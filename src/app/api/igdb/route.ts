import type { NextRequest } from "next/server";
import { currentSession } from "@/auth/session";
import { igdbEnabled, searchIgdb } from "@/lib/igdb";

export const dynamic = "force-dynamic";

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "cache-control": "private, no-store" } });

/** Lookups per signed-in user per minute; IGDB allows the whole instance four requests a second. */
const PER_MINUTE = 40;
const recent = new Map<number, number[]>();

/**
 * IGDB games matching ?q=, for the game name field on the manage page. Signed-in users only, as
 * every lookup spends the instance's IGDB allowance.
 */
export async function GET(request: NextRequest) {
  if (!igdbEnabled()) return json({ games: [], enabled: false });
  const session = await currentSession();
  if (!session) return json({ error: "Sign in to look games up." }, 401);
  const now = Date.now();
  const mine = (recent.get(session.user.id) ?? []).filter((t) => t > now - 60_000);
  if (mine.length >= PER_MINUTE) return json({ error: "Too many lookups; wait a moment." }, 429);
  recent.set(session.user.id, [...mine, now]);
  if (recent.size > 5000) recent.clear();
  try {
    return json({ games: await searchIgdb(request.nextUrl.searchParams.get("q") ?? ""), enabled: true });
  } catch (e) {
    console.error("igdb", e);
    return json({ error: "IGDB didn't answer; type the name instead." }, 502);
  }
}
