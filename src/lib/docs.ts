import { readFile } from "node:fs/promises";
import { join } from "node:path";

/** The docs the site serves, in reading order. Files live in docs/ (CONTRIBUTING.md at the root). */
export const DOCS = [
  {
    slug: "getting-started",
    file: "docs/getting-started.md",
    group: "Projects",
    summary: "Track your project: register it, upload reports, add badges.",
  },
  {
    slug: "setup-prompt",
    file: "docs/setup-prompt.md",
    group: "Projects",
    summary: "A prompt for a coding assistant to wire a repository up, and how units are read.",
  },
  {
    slug: "migrating-from-decomp-dev",
    file: "docs/migrating-from-decomp-dev.md",
    group: "Projects",
    summary: "Move a project from decomp.dev: badges, links and history.",
  },
  {
    slug: "api",
    file: "docs/api.md",
    group: "Projects",
    summary: "Every public URL, badge parameter and JSON shape, plus the upload API.",
  },
  {
    slug: "self-hosting",
    file: "docs/self-hosting.md",
    group: "Running ByteMatch",
    summary: "Install, configure and run your own instance.",
  },
  {
    slug: "github-app",
    file: "docs/github-app.md",
    group: "Running ByteMatch",
    summary: "Create the GitHub App behind sign-in, webhooks and PR comments.",
  },
  {
    slug: "architecture",
    file: "docs/architecture.md",
    group: "Running ByteMatch",
    summary: "Processes, data model, ingest flow and job queue.",
  },
  {
    slug: "contributing",
    file: "CONTRIBUTING.md",
    group: "Development",
    summary: "Development setup, tests, code style and commit standard.",
  },
  {
    slug: "theming",
    file: "docs/theming.md",
    group: "Development",
    summary: "Palette and style slots, derived colours, layouts, and the rules for adding colour.",
  },
] as const;

export type DocSlug = (typeof DOCS)[number]["slug"];

export interface Doc {
  slug: string;
  title: string;
  summary: string;
  group: string;
  /** Markdown without its first heading (the page renders the title itself). */
  body: string;
  headings: { depth: number; text: string; id: string }[];
}

/** GitHub-style heading anchors, so links like api.md#badges keep working. */
export function headingId(text: string): string {
  return text
    .toLowerCase()
    .replace(/[`*_~[\]()]/g, "")
    .replace(/[^\p{L}\p{N}\s-]/gu, "")
    .trim()
    .replace(/\s/g, "-");
}

const BY_FILE = new Map(DOCS.map((d) => [d.file.split("/").pop()!, d.slug]));

/** Rewrites a link found in a doc so it stays on the site; external links pass through. */
export function docHref(href: string): string {
  if (/^[a-z]+:/i.test(href) || href.startsWith("#") || href.startsWith("/")) return href;
  const [path, hash] = href.split("#");
  const file = path.split("/").pop() ?? "";
  if (/^readme\.md$/i.test(file)) return `/docs${hash ? `#${hash}` : ""}`;
  const slug = BY_FILE.get(file);
  if (slug) return `/docs/${slug}${hash ? `#${hash}` : ""}`;
  // Anything else in the repository (source files, LICENSE, ...) opens on GitHub.
  const clean = path.replace(/^(\.\.\/)+/, "").replace(/^\.\//, "");
  return `https://github.com/Veradictus/ByteMatch/blob/master/${clean}${hash ? `#${hash}` : ""}`;
}

export async function loadDoc(slug: string): Promise<Doc | null> {
  const entry = DOCS.find((d) => d.slug === slug);
  if (!entry) return null;
  const raw = await readFile(join(/*turbopackIgnore: true*/ process.cwd(), entry.file), "utf8");
  const lines = raw.split("\n");
  const first = lines.findIndex((l) => /^#\s/.test(l));
  const title = first >= 0 ? lines[first].replace(/^#\s+/, "").trim() : entry.slug;
  const body = (first >= 0 ? [...lines.slice(0, first), ...lines.slice(first + 1)] : lines).join("\n").trim();
  const headings: Doc["headings"] = [];
  let fence = false;
  for (const line of body.split("\n")) {
    if (/^```/.test(line)) fence = !fence;
    const m = !fence && /^(#{2,3})\s+(.+?)\s*#*$/.exec(line);
    if (m) headings.push({ depth: m[1].length, text: m[2].replace(/`/g, ""), id: headingId(m[2]) });
  }
  return { slug: entry.slug, title, summary: entry.summary, group: entry.group, body, headings };
}
