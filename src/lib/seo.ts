import type { Metadata } from "next";
import type { Measures } from "../report/types";
import { config } from "./config";
import { platformName } from "./platforms";
import { resolve, type Resolved } from "./project-data";

/**
 * Search and social metadata, and JSON-LD structured data.
 *
 * ByteMatch is an independent, clean-room successor to decomp.dev (which is being sunset). The copy
 * here says so plainly so that people searching for decomp.dev can find it, but it never presents
 * ByteMatch as decomp.dev: the brand is always SITE_NAME, and decomp.dev is only ever named as the
 * site ByteMatch replaces.
 *
 * Note on merging: Next merges metadata from layouts and pages shallowly, so a key set in the root
 * layout (e.g. `alternates`, `openGraph`) is inherited whole by every page that does not set it.
 * That is why the site default carries no canonical URL or og:url: each page helper sets its own.
 */

const REPO_URL = "https://github.com/Veradictus/ByteMatch";

export const SITE_TAGLINE = "Decompilation progress, tracked.";

export const SITE_DESCRIPTION =
  "Progress tracking for matching decompilation projects, from objdiff reports: history, badges and pull request comments. " +
  "An open-source successor to decomp.dev and a drop-in decomp.dev alternative: existing badge and JSON URLs keep working by swapping the domain.";

export const SITE_KEYWORDS = [
  "decompilation",
  "matching decompilation",
  "decomp",
  "decompilation progress",
  "decompilation progress tracker",
  "objdiff",
  "objdiff report",
  "reverse engineering",
  "game decompilation",
  "progress badge",
  "decomp.dev",
  "decomp.dev alternative",
  "decomp.dev replacement",
  "ByteMatch",
];

const fmtInt = new Intl.NumberFormat("en-US");
const pct = (n: number | null | undefined) => `${(Number.isFinite(Number(n)) ? Number(n) : 0).toFixed(2)}%`;

export const siteName = () => config().SITE_NAME;
export const absoluteUrl = (path = "/") => `${config().PUBLIC_URL}${path.startsWith("/") ? path : `/${path}`}`;
/** "bytematch.dev", for printing on images. */
export const siteHost = () => new URL(config().PUBLIC_URL).host;

/** The site's social card (src/app/opengraph-image.tsx); projects have their own. */
const SITE_IMAGE = "/opengraph-image";
const imageFor = (path: string) => [{ url: path, width: 1200, height: 630 }];

/**
 * Open Graph fields every page repeats. A child `openGraph` replaces the layout's whole object,
 * file-based image included, so each page names its image explicitly.
 */
function openGraph(o: {
  title: string;
  description: string;
  path: string;
  type?: "website" | "article";
  image?: string;
}): Metadata["openGraph"] {
  return {
    type: o.type ?? "website",
    siteName: siteName(),
    locale: "en_US",
    title: o.title,
    description: o.description,
    url: o.path,
    images: imageFor(o.image ?? SITE_IMAGE),
  };
}

function twitter(o: { title: string; description: string; image?: string }): Metadata["twitter"] {
  return { card: "summary_large_image", title: o.title, description: o.description, images: [o.image ?? SITE_IMAGE] };
}

const INDEXABLE: Metadata["robots"] = {
  index: true,
  follow: true,
  googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
};

// ---------------------------------------------------------------------------------------------
// Metadata helpers
// ---------------------------------------------------------------------------------------------

/** For the root layout: title template, description, keywords, social defaults, metadataBase. */
export function siteMetadata(): Metadata {
  const c = config();
  const name = c.SITE_NAME;
  const title = `${name}: matching decompilation progress tracker`;
  return {
    metadataBase: new URL(c.PUBLIC_URL),
    title: { default: title, template: `%s · ${name}` },
    description: SITE_DESCRIPTION,
    applicationName: name,
    keywords: SITE_KEYWORDS,
    category: "technology",
    referrer: "strict-origin-when-cross-origin",
    robots: INDEXABLE,
    // No canonical and no og:url here; they would be inherited by every page (see the note above).
    openGraph: { type: "website", siteName: name, locale: "en_US", title, description: SITE_DESCRIPTION },
    twitter: twitter({ title, description: SITE_DESCRIPTION }),
    formatDetection: { telephone: false, email: false, address: false },
    ...(c.GOOGLE_SITE_VERIFICATION || c.BING_SITE_VERIFICATION
      ? {
          verification: {
            ...(c.GOOGLE_SITE_VERIFICATION ? { google: c.GOOGLE_SITE_VERIFICATION } : {}),
            ...(c.BING_SITE_VERIFICATION ? { other: { "msvalidate.01": c.BING_SITE_VERIFICATION } } : {}),
          },
        }
      : {}),
  };
}

/** For `/`: the project index. */
export function homeMetadata(): Metadata {
  const name = siteName();
  const title = `${name}: matching decompilation progress tracker`;
  const description = SITE_DESCRIPTION;
  return {
    title: { absolute: title },
    description,
    alternates: { canonical: "/" },
    openGraph: openGraph({ title, description, path: "/" }),
    twitter: twitter({ title, description }),
  };
}

/** Appended to a project's description when its history was imported from decomp.dev. */
export function decompDevNote(importedFromDecompDev: boolean | null | undefined): string {
  return importedFromDecompDev ? "Previously tracked on decomp.dev." : "";
}

export interface ProjectSeoInput {
  owner: string;
  repo: string;
  name: string;
  platform?: string | null;
  /** The version this page shows. */
  version?: string | null;
  /** The project's default version; a page for it is canonicalised to /{owner}/{repo}. */
  defaultVersion?: string | null;
  /** True when the URL names a version (/{owner}/{repo}/{version}). */
  versionInUrl?: boolean;
  measures?: Measures | null;
  /** Commit time of the report shown. */
  updated?: Date | string | null;
  /** The project's history was imported from decomp.dev (reports with source "import"). */
  importedFromDecompDev?: boolean;
}

export function projectPath(p: { owner: string; repo: string; version?: string | null }) {
  return `/${p.owner}/${p.repo}${p.version ? `/${encodeURIComponent(p.version)}` : ""}`;
}

/** "Ratchet & Clank is 12.34% decompiled: 1,234 of 5,678 functions matched … on PlayStation 2." */
export function projectDescription(p: ProjectSeoInput): string {
  const m = p.measures;
  const platform = platformName(p.platform);
  const label = p.versionInUrl && p.version ? `${p.name} (${p.version})` : p.name;
  const parts: string[] = [];
  if (m) {
    parts.push(
      `${label} is ${pct(m.matched_code_percent)} decompiled: ${fmtInt.format(Number(m.matched_functions))} of ${fmtInt.format(
        Number(m.total_functions),
      )} functions matched (${pct(m.matched_functions_percent)}), ${pct(m.fuzzy_match_percent)} fuzzy match.`,
    );
  } else {
    parts.push(`Matching decompilation progress for ${label}.`);
  }
  parts.push(
    platform
      ? `A matching decompilation of the ${platform} game, tracked live on ${siteName()} from objdiff reports.`
      : `Tracked live on ${siteName()} from objdiff reports.`,
  );
  const note = decompDevNote(p.importedFromDecompDev);
  if (note) parts.push(note);
  return parts.join(" ");
}

/** Canonical path: the version-less URL for the default version, so the two don't compete. */
export function projectCanonicalPath(p: ProjectSeoInput) {
  const explicit = p.versionInUrl && p.version && p.version !== p.defaultVersion ? p.version : null;
  return projectPath({ owner: p.owner, repo: p.repo, version: explicit });
}

/** For /{owner}/{repo} and /{owner}/{repo}/{version}. */
export function projectMetadata(p: ProjectSeoInput): Metadata {
  const label = p.versionInUrl && p.version ? `${p.name} (${p.version})` : p.name;
  const title = `${label} decompilation progress`;
  const description = projectDescription(p);
  const canonical = projectCanonicalPath(p);
  return {
    title,
    description,
    keywords: [
      p.name,
      `${p.name} decompilation`,
      `${p.name} decomp`,
      ...(platformName(p.platform) ? [`${platformName(p.platform)} decompilation`] : []),
      "matching decompilation",
      "objdiff",
    ],
    alternates: { canonical },
    // Every version shares the project's card (src/app/[owner]/[repo]/opengraph-image.tsx).
    openGraph: openGraph({
      title,
      description,
      path: canonical,
      image: `${projectPath({ owner: p.owner, repo: p.repo })}/opengraph-image`,
    }),
    twitter: twitter({ title, description, image: `${projectPath({ owner: p.owner, repo: p.repo })}/opengraph-image` }),
  };
}

/**
 * Looks the project up and builds its metadata; never throws. For `generateMetadata`:
 *   return projectMetadataFor(owner, repo, version, { importedFromDecompDev });
 * `version` is the raw URL segment (still percent-encoded) or undefined for the default page.
 */
/**
 * Adapts what `resolve()` returns (as project-view.tsx already has it) to ProjectSeoInput.
 * `versionInUrl`: the page URL names the version (/{owner}/{repo}/{version}).
 */
export function projectSeoInput(r: Resolved, opts: { versionInUrl?: boolean; importedFromDecompDev?: boolean } = {}): ProjectSeoInput {
  return {
    owner: r.project.owner,
    repo: r.project.repo,
    name: r.project.name,
    platform: r.project.platform,
    version: r.version,
    defaultVersion: r.project.defaultVersion ?? r.versions[0] ?? null,
    versionInUrl: !!opts.versionInUrl,
    measures: r.measures,
    updated: r.row.commitTimestamp,
    importedFromDecompDev: opts.importedFromDecompDev,
  };
}

/**
 * Looks the project up and builds its metadata; never throws. For `generateMetadata`:
 *   return projectMetadataFor(owner, repo, version, { importedFromDecompDev });
 * `version` is the raw URL segment (still percent-encoded) or undefined for the default page.
 */
export async function projectMetadataFor(
  owner: string,
  repo: string,
  version?: string | null,
  opts: { importedFromDecompDev?: boolean } = {},
): Promise<Metadata> {
  const v = version ? safeDecode(version) : undefined;
  try {
    const r = await resolve(owner, repo, v);
    return projectMetadata(projectSeoInput(r, { versionInUrl: !!v, importedFromDecompDev: opts.importedFromDecompDev }));
  } catch {
    // Unknown project, no reports yet, or the database is down: the page decides what to render.
    return { title: v ? `${owner}/${repo} (${v})` : `${owner}/${repo}`, robots: { index: false, follow: true } };
  }
}

function safeDecode(s: string) {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
}

/** SEO copy for each page in docs/, keyed by file name without ".md". */
export const DOCS_SEO: Record<string, { title: string; absoluteTitle?: boolean; description: string; keywords?: string[] }> = {
  "getting-started": {
    title: "Getting started: track your decompilation's progress",
    description:
      "Register a matching decompilation project on ByteMatch, deliver objdiff reports from GitHub Actions or the upload API, and add progress badges to your README.",
    keywords: ["objdiff report", "decompilation progress badge", "dtk-template"],
  },
  "setup-prompt": {
    title: "Set up a decompilation for ByteMatch with an AI assistant",
    description:
      "A prompt for Claude Code, Cursor or Copilot that wires a decompilation repository up for ByteMatch: objdiff units, the CI report artifact and a badge, plus how units become the project page.",
    keywords: ["objdiff.json", "objdiff units", "decompilation CI"],
  },
  "source-linking": {
    title: "Linking source code to a decompilation's units and functions",
    description:
      "How ByteMatch finds a function's code in a decompilation repository: objdiff source_path, renamed functions through #define headers, asm labels and address comments, and a script to check a project.",
    keywords: ["objdiff source_path", "decompilation source", "objdiff.json units"],
  },
  "migrating-from-decomp-dev": {
    // Aimed at people searching for "decomp.dev". Accurate: decomp.dev is closed to new projects and being sunset.
    title: "decomp.dev is being sunset: move your project to ByteMatch",
    absoluteTitle: true,
    description:
      "decomp.dev is winding down and no longer accepts new projects. ByteMatch is an independent, open-source decomp.dev alternative with the same URL shapes: swap the domain in your badges, import your history, and keep tracking.",
    keywords: ["decomp.dev", "decomp.dev alternative", "decomp.dev shutting down", "decomp.dev migration", "decomp.dev badge"],
  },
  api: {
    title: "API reference: project JSON, badges and report uploads",
    description:
      "ByteMatch's public URLs: project JSON, SVG and PNG progress badges, the project list and the report upload API. Paths and query parameters are compatible with decomp.dev's.",
    keywords: ["decompilation progress API", "progress badge", "decomp.dev API"],
  },
  "github-app": {
    title: "Creating the GitHub App",
    description:
      "Set up a GitHub App for a ByteMatch instance: webhooks, artifact downloads, pull request comments and Sign in with GitHub.",
  },
  "self-hosting": {
    title: "Self-hosting ByteMatch",
    description:
      "Run your own ByteMatch instance: a Next.js web server and a worker sharing one PostgreSQL database, with Docker Compose or plain Node.js.",
  },
  contributing: {
    title: "Contributing to ByteMatch",
    description:
      "Development setup, tests, code style and the commit standard for contributing to ByteMatch, the open-source decompilation progress tracker.",
  },
  theming: {
    title: "Theming: colours, layouts and shared themes",
    description:
      "How ByteMatch's themes work: thirteen palette slots, derived colours, the Classic and Directory layouts, and sharing custom themes by code.",
  },
  architecture: {
    title: "Architecture",
    description:
      "How ByteMatch is built: the web and worker processes, the pg-boss job queue in PostgreSQL, report storage and the code layout.",
  },
};

/** Docs slugs with SEO copy; the sitemap uses src/lib/docs.ts's DOCS and falls back to these. */
export const DOC_SLUGS = Object.keys(DOCS_SEO);

/** For /docs. */
export function docsIndexMetadata(): Metadata {
  const title = "Documentation";
  const description = `Guides for ${siteName()}: getting started, migrating from decomp.dev, the API, the GitHub App, self-hosting and architecture.`;
  return {
    title,
    description,
    alternates: { canonical: "/docs" },
    openGraph: openGraph({ title: `${title} · ${siteName()}`, description, path: "/docs" }),
    twitter: twitter({ title: `${title} · ${siteName()}`, description }),
  };
}

/**
 * For /docs/{slug}. `fallback` (e.g. the markdown's first heading and paragraph) is used for
 * slugs not listed in DOCS_SEO.
 */
export function docsPageMetadata(slug: string, fallback: { title?: string; description?: string } = {}): Metadata {
  const seo = DOCS_SEO[slug];
  const title = seo?.title ?? fallback.title ?? slug;
  const description = seo?.description ?? fallback.description ?? `${title}: ${siteName()} documentation.`;
  const path = `/docs/${slug}`;
  const fullTitle = seo?.absoluteTitle ? title : `${title} · ${siteName()}`;
  return {
    title: seo?.absoluteTitle ? { absolute: title } : title,
    description,
    ...(seo?.keywords ? { keywords: seo.keywords } : {}),
    alternates: { canonical: path },
    openGraph: openGraph({ title: fullTitle, description, path, type: "article" }),
    twitter: twitter({ title: fullTitle, description }),
  };
}

/** For the browse pages (games, franchises, activity): a title, a description and a canonical path. */
export function browseMetadata(title: string, description: string, path: string): Metadata {
  const fullTitle = `${title} · ${siteName()}`;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: openGraph({ title: fullTitle, description, path }),
    twitter: twitter({ title: fullTitle, description }),
  };
}

/** For /login. Indexable but low priority; no description of private state. */
export function loginMetadata(): Metadata {
  const title = "Sign in";
  const description = `Sign in to ${siteName()} with GitHub to register and manage decompilation projects.`;
  return {
    title,
    description,
    alternates: { canonical: "/login" },
    openGraph: openGraph({ title, description, path: "/login" }),
    twitter: twitter({ title, description }),
  };
}

/** For private pages (/manage/*): never indexed, links not followed, nothing cached. */
export function noindexMetadata(title?: string): Metadata {
  return {
    ...(title ? { title } : {}),
    robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  };
}

// ---------------------------------------------------------------------------------------------
// JSON-LD (render with <JsonLd data={...}/> from src/components/json-ld.tsx)
// ---------------------------------------------------------------------------------------------

export type JsonLdObject = Record<string, unknown>;

const siteId = () => `${absoluteUrl("/")}#website`;
const softwareId = () => `${absoluteUrl("/")}#software`;

/** For the root layout or home page: the WebSite, and the open-source software that runs it. No SearchAction: there is no search. */
export function siteJsonLd(): JsonLdObject {
  const name = siteName();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": siteId(),
        name,
        url: absoluteUrl("/"),
        description: SITE_DESCRIPTION,
        inLanguage: "en",
        about: { "@id": softwareId() },
      },
      {
        "@type": "SoftwareSourceCode",
        "@id": softwareId(),
        name: "ByteMatch",
        description:
          "Clean-room, open-source progress tracker for matching decompilation projects; a successor to decomp.dev serving the same URL shapes.",
        codeRepository: REPO_URL,
        license: "https://www.gnu.org/licenses/gpl-3.0.html",
        programmingLanguage: "TypeScript",
        keywords: SITE_KEYWORDS.join(", "),
      },
    ],
  };
}

/** A project's current progress as a Dataset (its JSON at /{owner}/{repo}.json is the distribution). */
export function projectJsonLd(p: ProjectSeoInput): JsonLdObject {
  const m = p.measures;
  const canonical = absoluteUrl(projectCanonicalPath(p));
  const jsonPath = `${projectPath({ owner: p.owner, repo: p.repo, version: p.versionInUrl ? p.version : null })}.json`;
  const platform = platformName(p.platform);
  const updated = p.updated ? new Date(p.updated).toISOString() : undefined;
  const measure = (name: string, value: number | undefined, unitText?: string) =>
    value === undefined || !Number.isFinite(Number(value))
      ? null
      : { "@type": "PropertyValue", name, value: Number(value), ...(unitText ? { unitText } : {}) };
  return {
    "@context": "https://schema.org",
    "@type": "Dataset",
    "@id": `${canonical}#dataset`,
    name: `${p.name}${p.versionInUrl && p.version ? ` (${p.version})` : ""} decompilation progress`,
    // Google requires 50+ characters.
    description: `${projectDescription(p)} Measures come from the project's objdiff reports and are updated on every CI run.`,
    url: canonical,
    isBasedOn: `https://github.com/${p.owner}/${p.repo}`,
    // The repository's owner on GitHub: an organisation or a person, so the neutral type.
    creator: { "@type": "Organization", name: p.owner, url: `https://github.com/${p.owner}` },
    isAccessibleForFree: true,
    keywords: ["decompilation", "matching decompilation", "objdiff", p.name, ...(platform ? [platform] : [])],
    ...(updated ? { dateModified: updated } : {}),
    about: { "@type": "VideoGame", name: p.name, ...(platform ? { gamePlatform: platform } : {}) },
    includedInDataCatalog: { "@type": "DataCatalog", name: siteName(), url: absoluteUrl("/") },
    distribution: [{ "@type": "DataDownload", encodingFormat: "application/json", contentUrl: absoluteUrl(jsonPath) }],
    ...(m
      ? {
          variableMeasured: [
            measure("Code matched", m.matched_code_percent, "percent"),
            measure("Fuzzy match", m.fuzzy_match_percent, "percent"),
            measure("Functions matched", m.matched_functions),
            measure("Total functions", m.total_functions),
            measure("Functions matched (percent)", m.matched_functions_percent, "percent"),
            measure("Data matched", m.matched_data_percent, "percent"),
            measure("Code linked", m.complete_code_percent, "percent"),
            measure("Units complete", m.complete_units),
            measure("Total units", m.total_units),
          ].filter(Boolean),
        }
      : {}),
  };
}

/** For /docs/{slug}. `dateModified` can be the markdown file's mtime. */
export function docsJsonLd(
  slug: string,
  o: { title?: string; description?: string; dateModified?: Date | string | null } = {},
): JsonLdObject {
  const seo = DOCS_SEO[slug];
  const url = absoluteUrl(`/docs/${slug}`);
  return {
    "@context": "https://schema.org",
    "@type": "TechArticle",
    "@id": `${url}#article`,
    headline: seo?.title ?? o.title ?? slug,
    description: seo?.description ?? o.description,
    url,
    mainEntityOfPage: url,
    inLanguage: "en",
    ...(o.dateModified ? { dateModified: new Date(o.dateModified).toISOString() } : {}),
    isPartOf: { "@type": "WebSite", "@id": siteId(), name: siteName(), url: absoluteUrl("/") },
    author: { "@type": "Organization", name: "ByteMatch contributors", url: REPO_URL },
    publisher: { "@type": "Organization", name: siteName(), url: absoluteUrl("/") },
  };
}

/** A breadcrumb trail (Home first), for Google's breadcrumb rich result. Paths are site-relative. */
export function breadcrumbJsonLd(items: { name: string; path: string }[]): JsonLdObject {
  const trail = [{ name: siteName(), path: "/" }, ...items];
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: trail.map((t, i) => ({ "@type": "ListItem", position: i + 1, name: t.name, item: absoluteUrl(t.path) })),
  };
}

interface GameSeo {
  slug: string;
  title: string;
  year: number | null;
  platforms: string[];
  projects: { owner: string; repo: string; name: string }[];
}

/** For /games/{slug}: the game, and the projects decompiling it (each a Dataset on its own page). */
export function gameJsonLd(g: GameSeo): JsonLdObject {
  const url = absoluteUrl(`/games/${g.slug}`);
  const platforms = g.platforms.map((p) => platformName(p) ?? p);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    name: `${g.title} decompilation progress`,
    url,
    isPartOf: { "@id": siteId() },
    about: {
      "@type": "VideoGame",
      name: g.title,
      ...(platforms.length ? { gamePlatform: platforms } : {}),
      ...(g.year ? { datePublished: String(g.year) } : {}),
    },
    hasPart: g.projects.map((p) => ({
      "@type": "Dataset",
      "@id": `${absoluteUrl(projectPath(p))}#dataset`,
      name: `${p.name} decompilation progress`,
      url: absoluteUrl(projectPath(p)),
    })),
  };
}

/** For /games and /franchises/{slug}: a list of game pages. */
export function gameListJsonLd(o: { name: string; path: string; games: { slug: string; title: string }[] }): JsonLdObject {
  const url = absoluteUrl(o.path);
  return {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    "@id": `${url}#page`,
    name: o.name,
    url,
    isPartOf: { "@id": siteId() },
    mainEntity: {
      "@type": "ItemList",
      numberOfItems: o.games.length,
      itemListElement: o.games.map((g, i) => ({
        "@type": "ListItem",
        position: i + 1,
        name: g.title,
        url: absoluteUrl(`/games/${g.slug}`),
      })),
    },
  };
}
