import { sha256 } from "./crypto";

/**
 * What a page view records, decided without storing anything personal: the path (no query), the
 * site the visitor came from (its host only, and only from elsewhere), and a visitor hash that
 * changes every day. Pure, so the hit endpoint and tests share it.
 */

/** Paths that aren't public pages: never counted. */
const PRIVATE = /^\/(admin|manage|api|auth|_next)(\/|$)/;

/** A path worth counting, normalised; null for anything else. */
export function countedPath(input: unknown): string | null {
  if (typeof input !== "string" || !input.startsWith("/") || input.startsWith("//")) return null;
  let p = input.split(/[?#]/)[0];
  try {
    p = decodeURI(p);
  } catch {
    return null;
  }
  if (p.length > 1) p = p.replace(/\/+$/, "");
  if (p.length > 200 || PRIVATE.test(p) || /[\u0000-\u001f]/.test(p)) return null;
  return p;
}

/** Crawlers, link unfurlers and automation that run scripts anyway. */
const BOT =
  /bot|crawl|spider|slurp|preview|facebookexternalhit|embedly|discord|headless|lighthouse|pingdom|monitor|curl|wget|python|axios|go-http/i;

export const isBot = (userAgent: string | null | undefined) => !userAgent || BOT.test(userAgent);

/** The referring site's host, when it's another site. */
export function referrerHost(referrer: unknown, ownHost: string): string | null {
  if (typeof referrer !== "string" || !referrer) return null;
  try {
    const u = new URL(referrer);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    const host = u.host.toLowerCase().replace(/^www\./, "");
    return host && host !== ownHost.toLowerCase().replace(/^www\./, "") ? host.slice(0, 100) : null;
  } catch {
    return null;
  }
}

/** The day (UTC) as YYYY-MM-DD. */
export const utcDay = (d = new Date()) => d.toISOString().slice(0, 10);

/**
 * A visitor for one day: the same person gets the same hash all day and an unrelated one the next,
 * and without the instance's secret the hash can't be checked against an address.
 */
export function visitorHash(day: string, secret: string, address: string | null, userAgent: string): string {
  return sha256(`visitor:${day}:${secret}:${address ?? "-"}:${userAgent}`).slice(0, 32);
}
