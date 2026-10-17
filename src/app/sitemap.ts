import { stat } from "node:fs/promises";
import { join } from "node:path";
import type { MetadataRoute } from "next";
import { projectIndex, projectVersions } from "@/db/store";
import { config } from "@/lib/config";
import { loadGames } from "@/lib/game-data";
import { DOCS } from "@/lib/docs";
import { DOC_SLUGS, projectPath } from "@/lib/seo";

// Built per request: `next build` has no database, and the project list changes with every CI run.
export const dynamic = "force-dynamic";

type Entry = MetadataRoute.Sitemap[number];

/**
 * Every page /docs/{slug} serves (src/lib/docs.ts), with the markdown file's mtime when it can be read.
 * The stat is excluded from file tracing; a missing file just means no <lastmod>.
 */
async function docsEntries(base: string): Promise<Entry[]> {
  const docs: { slug: string; file?: string }[] = DOCS.length ? [...DOCS] : DOC_SLUGS.map((slug) => ({ slug }));
  return Promise.all(
    docs.map(async (d): Promise<Entry> => {
      const lastModified = d.file
        ? await stat(join(/*turbopackIgnore: true*/ process.cwd(), d.file)).then(
            (s) => s.mtime,
            () => undefined,
          )
        : undefined;
      return {
        url: `${base}/docs/${d.slug}`,
        ...(lastModified ? { lastModified } : {}),
        changeFrequency: "monthly",
        priority: d.slug === "migrating-from-decomp-dev" || d.slug === "getting-started" ? 0.8 : 0.6,
      };
    }),
  );
}

async function projectEntries(base: string): Promise<Entry[]> {
  try {
    const projects = await projectIndex();
    const perProject = await Promise.all(
      projects.map(async (p): Promise<Entry[]> => {
        const main: Entry = {
          url: `${base}${projectPath({ owner: p.owner, repo: p.repo })}`,
          ...(p.commit_timestamp ? { lastModified: new Date(p.commit_timestamp) } : {}),
          changeFrequency: "daily",
          priority: 0.9,
        };
        // Other versions get their own URL; the default version's page is canonicalised to the main one.
        const versions = await projectVersions(p.id).catch(() => []);
        const others = versions
          .filter((v) => v.version !== p.version)
          .map((v): Entry => ({
            url: `${base}${projectPath({ owner: p.owner, repo: p.repo, version: v.version })}`,
            lastModified: v.latest,
            changeFrequency: "weekly",
            priority: 0.5,
          }));
        return [main, ...others];
      }),
    );
    return perProject.flat();
  } catch (e) {
    console.error("sitemap: projects unavailable:", e instanceof Error ? e.message : e);
    return [];
  }
}

/** /games/{slug} and /franchises/{slug} for every game and franchise projects name. */
async function gameEntries(base: string): Promise<Entry[]> {
  try {
    const { games, franchises } = await loadGames();
    const newest = (dates: (string | null)[]) => {
      const d = dates
        .filter((x): x is string => !!x)
        .sort()
        .at(-1);
      return d ? { lastModified: new Date(d) } : {};
    };
    return [
      ...games.map((g): Entry => ({
        url: `${base}/games/${g.slug}`,
        ...newest(g.projects.map((p) => p.updated)),
        changeFrequency: "daily",
        priority: 0.8,
      })),
      ...franchises.map((f): Entry => ({
        url: `${base}/franchises/${f.slug}`,
        ...newest(f.games.flatMap((g) => g.projects.map((p) => p.updated))),
        changeFrequency: "weekly",
        priority: 0.6,
      })),
    ];
  } catch (e) {
    console.error("sitemap: games unavailable:", e instanceof Error ? e.message : e);
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = config().PUBLIC_URL;
  const [docs, projects, games] = await Promise.all([docsEntries(base), projectEntries(base), gameEntries(base)]);
  const latest = projects.reduce<Date | undefined>(
    (acc, e) => (e.lastModified instanceof Date && (!acc || e.lastModified > acc) ? e.lastModified : acc),
    undefined,
  );
  return [
    { url: `${base}/`, ...(latest ? { lastModified: latest } : {}), changeFrequency: "daily", priority: 1 },
    { url: `${base}/games`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/activity`, changeFrequency: "daily", priority: 0.6 },
    { url: `${base}/ports`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${base}/docs`, changeFrequency: "monthly", priority: 0.7 },
    { url: `${base}/theme`, changeFrequency: "monthly", priority: 0.3 },
    ...docs,
    { url: `${base}/login`, changeFrequency: "yearly", priority: 0.1 },
    ...projects,
    ...games,
  ];
}
