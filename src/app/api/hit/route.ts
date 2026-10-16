import type { NextRequest } from "next/server";
import { recordHit } from "@/db/traffic";
import { clientAddress } from "@/lib/client-address";
import { config } from "@/lib/config";
import { countedPath, isBot, referrerHost, utcDay, visitorHash } from "@/lib/traffic";

export const dynamic = "force-dynamic";

const done = () => new Response(null, { status: 204, headers: { "cache-control": "no-store" } });

/**
 * A page view, sent by the browser as it shows a page (src/components/page-views.tsx): {"p": path,
 * "r": referrer on a visit's first page}. Counted for the admin Statistics page; nothing personal
 * is kept (src/lib/traffic.ts). Always answers 204, so it never shows up as an error anywhere.
 */
export async function POST(request: NextRequest) {
  const ua = request.headers.get("user-agent");
  if (isBot(ua)) return done();
  let body: { p?: unknown; r?: unknown };
  try {
    body = JSON.parse((await request.text()).slice(0, 2000));
  } catch {
    return done();
  }
  const path = countedPath(body.p);
  if (!path) return done();
  const c = config();
  const day = utcDay();
  try {
    await recordHit({
      day,
      path,
      visitor: visitorHash(day, c.SECRET_KEY ?? "", clientAddress(request.headers), ua!),
      referrer: referrerHost(body.r, new URL(c.PUBLIC_URL).host),
    });
  } catch (e) {
    console.error("hit", e);
  }
  return done();
}
