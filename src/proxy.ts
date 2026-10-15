import { NextResponse, type NextRequest } from "next/server";

/** First path segments that belong to the site, never to a project owner. */
const RESERVED = new Set([
  "platforms",
  "api",
  "auth",
  "manage",
  "docs",
  "games",
  "franchises",
  "activity",
  "admin",
  "_next",
  "healthz",
  "favicon.ico",
  "robots.txt",
]);

/**
 * decomp.dev-compatible data URLs: /{owner}/{repo}.json|svg|png and /{owner}/{repo}/{version}.json|svg|png
 * are served by one route handler. Repository and version names may contain dots; only the last
 * extension counts.
 */
export function proxy(request: NextRequest) {
  const m = /^\/([^/]+)\/([^/]+?)(?:\/([^/]+?))?\.(json|svg|png)$/.exec(request.nextUrl.pathname);
  if (!m || RESERVED.has(m[1])) return NextResponse.next();
  const [, owner, repo, version, format] = m;
  const url = request.nextUrl.clone();
  url.pathname = `/api/compat/${owner}/${repo}/${format}`;
  if (version) url.searchParams.set("version", decodeURIComponent(version));
  return NextResponse.rewrite(url);
}

export const config = {
  // Any .json/.svg/.png path outside Next's own and the API's; the regex above decides the rest.
  matcher: ["/((?!_next/|api/).+\\.(?:json|svg|png))"],
};
