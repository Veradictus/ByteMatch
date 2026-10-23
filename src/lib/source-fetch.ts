import type { Project } from "../db/schema";
import { repoClient } from "../github/client";
import { addressInName, cleanSourcePath, findFunction, functionNames, type FoundFunction } from "./source";

/**
 * A project's source, read from GitHub at the commit a report came from. Files at a commit never
 * change, so what's fetched is kept (by size, up to a budget) and asked for once.
 */

// Some projects keep a whole split in one generated file of a megabyte or more.
const MAX_FILE = 4_000_000;
const MAX_DIR_FILES = 200;
const MAX_DIR_BYTES = 8_000_000;
const SOURCE_EXT = /\.(c|cc|cpp|cxx|c\+\+|h|hh|hpp|hxx|inc|inl|s|asm)$/i;

class ByteCache {
  private map = new Map<string, string | null>();
  private bytes = 0;
  constructor(private readonly budget: number) {}
  get(k: string) {
    const v = this.map.get(k);
    if (v !== undefined) {
      this.map.delete(k);
      this.map.set(k, v);
    }
    return v;
  }
  set(k: string, v: string | null) {
    this.bytes -= this.map.get(k)?.length ?? 0;
    this.map.delete(k);
    this.map.set(k, v);
    this.bytes += v?.length ?? 0;
    for (const [old, ov] of this.map) {
      if (this.bytes <= this.budget) break;
      this.map.delete(old);
      this.bytes -= ov?.length ?? 0;
    }
  }
}

const files = new ByteCache(64_000_000);
const listings = new Map<string, string[] | null>();
const trees = new Map<string, { path: string; size: number }[] | null>();
const aliasIndexes = new Map<string, Promise<Map<string, string[]> | null>>();
const searches = new Map<string, string[]>();
const SEARCHES_PER_MINUTE = 8;
const searchTimes: number[] = [];
let searchesPausedUntil = 0;
/** Which file in a directory a function was found in, per repository commit. */
const located = new Map<string, string>();

type Repo = Pick<Project, "owner" | "repo" | "installationId">;
const repoKey = (p: Repo, sha: string) => `${p.owner}/${p.repo}@${sha}`;

/** A file's text at SHA; null when it doesn't exist (or is a directory, or too big). */
async function fileAt(p: Repo, sha: string, path: string): Promise<string | null> {
  const key = `${repoKey(p, sha)}:${path}`;
  const hit = files.get(key);
  if (hit !== undefined) return hit;
  let text: string | null = null;
  // Public repositories: the raw host, which costs no API allowance.
  const raw = await fetch(
    `https://raw.githubusercontent.com/${p.owner}/${p.repo}/${sha}/${path.split("/").map(encodeURIComponent).join("/")}`,
    {
      signal: AbortSignal.timeout(10_000),
    },
  ).catch(() => null);
  if (raw?.ok) {
    text = Number(raw.headers.get("content-length") ?? 0) > MAX_FILE ? null : await raw.text();
  } else if (raw && raw.status !== 404) {
    throw new Error(`GitHub answered ${raw.status} for ${path}`);
  } else {
    // Not public, or not a file: ask the API, which also reaches private repositories.
    try {
      const { octokit } = await repoClient(p);
      const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", {
        owner: p.owner,
        repo: p.repo,
        path,
        ref: sha,
        headers: { accept: "application/vnd.github.raw+json" },
      });
      text = typeof data === "string" ? data : null;
    } catch {
      text = null;
    }
  }
  if (text && text.length > MAX_FILE) text = null;
  files.set(key, text);
  return text;
}

/** Source files directly in a directory at SHA; null when it isn't one. */
async function listDir(p: Repo, sha: string, path: string): Promise<string[] | null> {
  const key = `${repoKey(p, sha)}:${path}/`;
  if (listings.has(key)) return listings.get(key)!;
  let out: string[] | null = null;
  try {
    const { octokit } = await repoClient(p);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/contents/{path}", { owner: p.owner, repo: p.repo, path, ref: sha });
    if (Array.isArray(data)) {
      out = data
        .filter((e) => e.type === "file" && SOURCE_EXT.test(e.name) && e.size <= MAX_FILE)
        .map((e) => e.path)
        .slice(0, MAX_DIR_FILES);
    }
  } catch {
    out = null;
  }
  if (listings.size > 2000) listings.clear();
  listings.set(key, out);
  return out;
}

/** Every source file in the repository at SHA (one request); null when GitHub won't say. */
async function treeAt(p: Repo, sha: string): Promise<string[] | null> {
  const all = await blobsAt(p, sha);
  return all ? all.filter((b) => SOURCE_EXT.test(b.path)).map((b) => b.path) : null;
}

/** Every file in the repository at SHA with its size (one request); null when GitHub won't say. */
async function blobsAt(p: Repo, sha: string): Promise<{ path: string; size: number }[] | null> {
  const key = repoKey(p, sha);
  if (trees.has(key)) return trees.get(key)!;
  let out: { path: string; size: number }[] | null = null;
  try {
    const { octokit } = await repoClient(p);
    const { data } = await octokit.request("GET /repos/{owner}/{repo}/git/trees/{tree_sha}", {
      owner: p.owner,
      repo: p.repo,
      tree_sha: sha,
      recursive: "1",
    });
    out = data.tree.filter((e) => e.type === "blob" && e.path).map((e) => ({ path: e.path!, size: e.size ?? 0 }));
  } catch {
    out = null;
  }
  if (trees.size > 200) trees.clear();
  trees.set(key, out);
  return out;
}

/**
 * Files that may hold a unit whose report gives no source_path, best first: those whose path,
 * without its extension, ends with the unit's name ("main/audio/akao" → src/main/audio/akao.c),
 * the longest such match first; C and C++ before headers and assembly.
 */
export function guessUnitFiles(paths: string[], unit: string): string[] {
  const segs = unit
    .replace(/\\/g, "/")
    .replace(/\.[a-z+]+$/i, "")
    .split("/")
    .filter(Boolean);
  if (!segs.length) return [];
  const rank = (path: string): number => {
    const parts = path.replace(/\.[^./]+$/, "").split("/");
    let n = 0;
    while (n < segs.length && n < parts.length && parts[parts.length - 1 - n].toLowerCase() === segs[segs.length - 1 - n].toLowerCase())
      n++;
    return n;
  };
  const kind = (path: string) => (/\.(c|cc|cpp|cxx|c\+\+)$/i.test(path) ? 0 : /\.(s|asm)$/i.test(path) ? 2 : 1);
  return paths
    .map((path) => ({ path, n: rank(path) }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n || kind(a.path) - kind(b.path) || a.path.length - b.path.length)
    .map((x) => x.path)
    .slice(0, 8);
}

/**
 * Files GitHub's code search says mention NAME. A last resort (it allows few searches a minute and
 * reads the default branch, not the commit), so answers are kept.
 */
async function searchFiles(p: Repo, name: string): Promise<string[]> {
  if (!/^~?[A-Za-z_][\w:~]{2,}$/.test(name)) return [];
  const key = `${p.owner}/${p.repo}:${name}`;
  const hit = searches.get(key);
  if (hit) return hit;
  // GitHub allows about ten code searches a minute; past that, skip them rather than wait.
  const now = Date.now();
  while (searchTimes.length && searchTimes[0] < now - 60_000) searchTimes.shift();
  if (searchTimes.length >= SEARCHES_PER_MINUTE || now < searchesPausedUntil) return [];
  searchTimes.push(now);
  let out: string[] = [];
  try {
    const { octokit } = await repoClient(p);
    // Raced against a timer too: the client's rate limiter may hold a request back instead of sending it.
    const { data } = await Promise.race([
      octokit.request("GET /search/code", {
        q: `${name.split("::").pop()} repo:${p.owner}/${p.repo}`,
        per_page: 10,
        request: { signal: AbortSignal.timeout(6000), retries: 0 },
      }),
      new Promise<never>((_, no) => setTimeout(() => no(new Error("code search timed out")), 6500)),
    ]);
    out = data.items.map((i) => i.path).filter((path) => SOURCE_EXT.test(path));
  } catch (e) {
    const status = (e as { status?: number }).status;
    if (status === 403 || status === 429) searchesPausedUntil = Date.now() + 60_000;
    // Not kept: a refusal or a timeout says nothing about the repository.
    return [];
  }
  if (searches.size > 5000) searches.clear();
  searches.set(key, out);
  return out;
}

const INCLUDE_DIRS = ["include", "src", "inc", ""];
const MAX_HEADERS = 40;

/**
 * Names the source gives a symbol through macros: `#define Hero_Update func_0023BBE8` in a header
 * the file includes (projects that rename functions without renaming the symbols the build emits,
 * so the report keeps the old name). Follows `#include "..."` from TEXTS, beside the file or under
 * the usual include folders, a few levels deep.
 */
async function macroAliases(p: Repo, sha: string, texts: [string, string][], names: string[]): Promise<string[]> {
  const wanted = names.map(escapeName).join("|");
  if (!wanted) return [];
  const define = new RegExp(`^\\s*#\\s*define\\s+([A-Za-z_]\\w*)\\s+(?:${wanted})\\s*(?:$|//|/\\*)`, "gm");
  const found = new Set<string>();
  const seen = new Set<string>();
  let read = 0;
  let queue = texts;
  for (let depth = 0; depth < 4 && queue.length && read < MAX_HEADERS; depth++) {
    // Every include of this level at once, each tried beside its file and under the include folders.
    const wantedIncludes: string[][] = [];
    for (const [path, text] of queue) {
      for (const m of text.matchAll(define)) found.add(m[1]);
      const dir = path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
      for (const inc of text.matchAll(/^\s*#\s*include\s+"([^"]+)"/gm)) {
        const tries = [dir, ...INCLUDE_DIRS]
          .map((root) => cleanSourcePath(root ? `${root}/${inc[1]}` : inc[1]))
          .filter((c): c is string => !!c && !seen.has(c));
        if (!tries.length) continue;
        for (const c of tries) seen.add(c);
        wantedIncludes.push(tries);
      }
    }
    const next = (
      await Promise.all(
        // Only headers that exist count toward the limit, not every place one was looked for.
        wantedIncludes.slice(0, MAX_HEADERS - read).map(async (tries) => {
          const texts = await Promise.all(tries.map((c) => fileAt(p, sha, c)));
          const i = texts.findIndex((t) => t !== null);
          return i < 0 ? null : ([tries[i], texts[i]!] as [string, string]);
        }),
      )
    ).filter((x): x is [string, string] => x !== null);
    read += next.length;
    queue = next;
  }
  for (const n of names) found.delete(n);
  return [...found];
}

// The files an alias index reads: headers and linker scripts, outside build output and assembly dumps.
const HEADER = /\.(h|hh|hpp|hxx|inc|inl)$/i;
const LINKER = /(\.(ld|lds|lcf|x)$|\.ld\.[a-z]+$|(^|\/)[^/]*linker[^/]*$)/i;
const SKIP_DIRS = /(^|\/)(build|out|expected|asm|nonmatchings?|matchings?|\.git|node_modules|tools\/[^/]*\/(tests?|vendor))(\/|$)/i;
const INDEX_MAX_FILES = 800;
const INDEX_MAX_BYTES = 32_000_000;

/**
 * Other names the source gives symbols, across the whole repository at SHA: object-like macros
 * (`#define Hero_Update func_0023BBE8`, for projects that rename functions without renaming the
 * symbols their build emits) and linker-script assignments (`func_0011DFE8 = __divdi3;`). Symbol
 * → names. Built once per commit from every header and linker script, so it doesn't matter how a
 * project lays out its includes; null when the repository's file list can't be read.
 */
function aliasIndex(p: Repo, sha: string): Promise<Map<string, string[]> | null> {
  const key = repoKey(p, sha);
  let pending = aliasIndexes.get(key);
  if (!pending) {
    pending = buildAliasIndex(p, sha);
    if (aliasIndexes.size > 50) aliasIndexes.clear();
    aliasIndexes.set(key, pending);
  }
  return pending;
}

async function buildAliasIndex(p: Repo, sha: string): Promise<Map<string, string[]> | null> {
  const blobs = await blobsAt(p, sha);
  if (!blobs) return null;
  const wanted = blobs
    .filter((b) => (HEADER.test(b.path) || LINKER.test(b.path)) && !SKIP_DIRS.test(b.path) && b.size <= MAX_FILE)
    // Headers in include folders first: that's where rename lists live.
    .sort((a, b) => Number(!/(^|\/)inc(lude)?\//i.test(a.path)) - Number(!/(^|\/)inc(lude)?\//i.test(b.path)) || a.size - b.size);
  const picked: string[] = [];
  let bytes = 0;
  for (const b of wanted) {
    if (picked.length >= INDEX_MAX_FILES || bytes + b.size > INDEX_MAX_BYTES) break;
    picked.push(b.path);
    bytes += b.size;
  }
  const index = new Map<string, string[]>();
  const add = (symbol: string, name: string) => {
    if (symbol === name) return;
    const list = index.get(symbol) ?? [];
    if (!list.includes(name)) index.set(symbol, [...list, name]);
  };
  const define = /^[ \t]*#[ \t]*define[ \t]+([A-Za-z_]\w*)[ \t]+([A-Za-z_]\w*)[ \t]*(?:$|\/\/|\/\*)/gm;
  const assign = /^[ \t]*([A-Za-z_.$][\w.$]*)[ \t]*=[ \t]*([A-Za-z_.$][\w.$]*)[ \t]*;/gm;
  for (let i = 0; i < picked.length; i += 16) {
    const texts = await Promise.all(picked.slice(i, i + 16).map((path) => fileAt(p, sha, path).catch(() => null)));
    texts.forEach((text, j) => {
      if (!text) return;
      for (const m of text.matchAll(define)) add(m[2], m[1]);
      if (LINKER.test(picked[i + j])) for (const m of text.matchAll(assign)) add(m[1], m[2]);
    });
  }
  return index;
}

const escapeName = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** What else the report says about a function, to find it by: its demangled name and address. */
export interface FunctionHints {
  demangled?: string | null;
  address?: number | null;
}

export interface SourceView {
  /** The file shown (for a directory unit, the file the function was found in). */
  path: string;
  /** GitHub's page for it at the commit, with the lines if known. */
  url: string;
  kind: "c" | "asm" | "file" | "not-found" | "directory";
  /** 1-based, inclusive: the lines `code` holds, out of the file's `lines`. */
  start: number;
  end: number;
  lines: number;
  code: string;
  /** For a directory unit shown whole: its source files. */
  files?: { path: string; url: string }[];
}

const blob = (p: Repo, sha: string, path: string, start?: number, end?: number) =>
  `https://github.com/${p.owner}/${p.repo}/blob/${sha}/${path.split("/").map(encodeURIComponent).join("/")}${
    start ? `#L${start}${end && end !== start ? `-L${end}` : ""}` : ""
  }`;

const MAX_SHOWN_LINES = 4000;

function view(p: Repo, sha: string, path: string, text: string, found: FoundFunction | null, fn: string | null): SourceView {
  const lines = text.split("\n");
  if (fn && found) {
    // Assembly includes get a little context around them.
    const start = found.kind === "asm" ? Math.max(1, found.start - 2) : found.start;
    const end = found.kind === "asm" ? Math.min(lines.length, found.end + 2) : found.end;
    return {
      path,
      url: blob(p, sha, path, found.start, found.end),
      kind: found.kind,
      start,
      end,
      lines: lines.length,
      code: lines.slice(start - 1, end).join("\n"),
    };
  }
  const end = Math.min(lines.length, MAX_SHOWN_LINES);
  return {
    path,
    url: blob(p, sha, path),
    kind: fn ? "not-found" : "file",
    start: 1,
    end,
    lines: lines.length,
    code: lines.slice(0, end).join("\n"),
  };
}

/**
 * The order to search a directory in. Files named after the function come first. Then, when file
 * names carry the address their code starts at (`vendor_002CF2C0.c`, as split decompilations name
 * them) and the function's name carries its own, the file starting nearest below it, which is
 * nearly always the one; the rest after.
 */
export function candidates(paths: string[], fn: string): string[] {
  const hexOf = (s: string) => {
    const all = s.match(/[0-9A-Fa-f]{6,8}/g);
    return all ? parseInt(all[all.length - 1], 16) : null;
  };
  const target = hexOf(fn);
  const lower = fn.toLowerCase();
  const rank = (p: string): [number, number] => {
    const base = p.split("/").pop()!.toLowerCase();
    if (base.startsWith(lower)) return [0, 0];
    const at = hexOf(base.replace(/\.[^.]+$/, ""));
    if (target !== null && at !== null && at <= target) return [1, target - at];
    return [2, 0];
  };
  return [...paths].sort((x, y) => {
    const [a1, a2] = rank(x);
    const [b1, b2] = rank(y);
    return a1 - b1 || a2 - b2;
  });
}

/**
 * A unit's source at SHA: the whole file, or one function in it. SOURCE_PATH is the report's
 * source_path for the unit, which may be a file or a directory; without one, the unit's own name
 * is matched against the repository's files. A function not where the report says is looked for
 * with GitHub's code search before giving up.
 */
export async function loadSource(
  p: Repo,
  sha: string,
  sourcePath: string | null | undefined,
  fn: string | null,
  hints: FunctionHints & { unit?: string } = {},
): Promise<SourceView | null> {
  const names = fn ? functionNames(fn, hints.demangled) : [];
  const address = hints.address ?? (fn ? addressInName(fn) : null);
  const find = (t: string) => (fn ? findFunction(t, names.length ? names : [fn], address) : null);
  const rememberKey = (where: string) => `${repoKey(p, sha)}:${where}:${fn}`;

  /** The first of FILES holding the function, read a few at a time within a byte budget. */
  const firstHolding = async (order: string[], where: string): Promise<SourceView | null> => {
    let budget = MAX_DIR_BYTES;
    for (let i = 0; i < order.length && budget > 0; i += 6) {
      const batch = await Promise.all(order.slice(i, i + 6).map(async (f) => [f, await fileAt(p, sha, f)] as const));
      for (const [f, t] of batch) {
        if (t === null) continue;
        budget -= t.length;
        const found = find(t);
        if (found) {
          if (located.size > 20_000) located.clear();
          located.set(rememberKey(where), f);
          return view(p, sha, f, t, found, fn);
        }
      }
    }
    return null;
  };
  /** Files code search finds the function's name in, minus those already read. */
  const searched = async (except: string[]) => (fn ? (await searchFiles(p, names[0] ?? fn)).filter((f) => !except.includes(f)) : []);

  /** The function under another name the source gives its symbol (see aliasIndex), looked for in FILES. */
  const viaMacros = async (files: [string, string][]): Promise<SourceView | null> => {
    if (!fn || !files.length) return null;
    const wanted = names.length ? names : [fn];
    const index = await aliasIndex(p, sha);
    // Without the repository's file list (no access to its tree), the headers the files include.
    const aliases = index ? [...new Set(wanted.flatMap((n) => index.get(n) ?? []))] : await macroAliases(p, sha, files, wanted);
    if (!aliases.length) return null;
    for (const [f, t] of files) {
      const found = findFunction(t, aliases, address);
      if (found) return view(p, sha, f, t, found, fn);
    }
    // Defined somewhere other than the unit's files: look for the C name with code search.
    const known = new Set(files.map(([f]) => f));
    for (const alias of aliases.slice(0, 2)) {
      for (const f of (await searchFiles(p, alias)).filter((x) => !known.has(x)).slice(0, 6)) {
        const t = await fileAt(p, sha, f);
        const found = t === null ? null : findFunction(t, aliases, address);
        if (found) return view(p, sha, f, t!, found, fn);
      }
    }
    return null;
  };

  const path = cleanSourcePath(sourcePath);
  if (!path) {
    // No source_path: the unit's name against the repository's files.
    const tree = hints.unit ? await treeAt(p, sha) : null;
    const guesses = tree && hints.unit ? guessUnitFiles(tree, hints.unit) : [];
    if (!fn) {
      const first = guesses[0];
      const text = first ? await fileAt(p, sha, first) : null;
      return first && text !== null ? view(p, sha, first, text, null, null) : null;
    }
    const known = located.get(rememberKey(`unit:${hints.unit}`));
    const found = await firstHolding(
      [...(known ? [known] : []), ...guesses.filter((g) => g !== known), ...(await searched(guesses))],
      `unit:${hints.unit}`,
    );
    if (found) return found;
    const guessed = (await Promise.all(guesses.map(async (g) => [g, await fileAt(p, sha, g)] as const))).filter(
      (x): x is [string, string] => x[1] !== null,
    );
    const aliased = await viaMacros(guessed);
    if (aliased) return aliased;
    const first = guesses[0];
    const text = first ? await fileAt(p, sha, first) : null;
    return first && text !== null ? view(p, sha, first, text, null, fn) : null;
  }

  const text = await fileAt(p, sha, path);
  if (text !== null) {
    const found = find(text);
    if (found || !fn) return view(p, sha, path, text, found, fn);
    const aliased = await viaMacros([[path, text]]);
    if (aliased) return aliased;
    // Not in the file the report names: maybe it moved, or the unit spans more than that file.
    return (await firstHolding(await searched([path]), path)) ?? view(p, sha, path, text, null, fn);
  }

  const dir = await listDir(p, sha, path);
  if (!dir) return null;
  if (!fn) {
    return {
      path,
      url: blob(p, sha, path).replace("/blob/", "/tree/"),
      kind: "directory",
      start: 0,
      end: 0,
      lines: 0,
      code: "",
      files: dir.map((f) => ({ path: f, url: blob(p, sha, f) })),
    };
  }
  const known = located.get(rememberKey(path));
  const order = known ? [known, ...dir.filter((d) => d !== known)] : candidates(dir, fn);
  const found = await firstHolding(order, path);
  if (found) return found;
  // Renamed: look for the name the source gives the symbol in the folder's files (read already).
  let budget = MAX_DIR_BYTES;
  const dirFiles: [string, string][] = [];
  for (const f of order) {
    const t = await fileAt(p, sha, f);
    if (t === null) continue;
    budget -= t.length;
    dirFiles.push([f, t]);
    if (budget <= 0) break;
  }
  const aliased = await viaMacros(dirFiles);
  if (aliased) return aliased;
  const searchedFound = await firstHolding(await searched(dir), path);
  if (searchedFound) return searchedFound;
  return { path, url: blob(p, sha, path).replace("/blob/", "/tree/"), kind: "not-found", start: 0, end: 0, lines: 0, code: "" };
}
