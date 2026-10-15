import { projectArtwork } from "@/lib/artwork";
import { ExternalImage } from "./external-image";

/** Stream artwork independently so a slow provider never holds up progress reports. */
export async function ProjectHero({ name, manualUrl, kind }: { name: string; manualUrl: string | null; kind: "card" | "report" }) {
  const hero = await projectArtwork(name, manualUrl);
  if (!hero) return null;
  return (
    <div className={`project-hero project-hero--${kind}`}>
      <ExternalImage key={hero.url} src={hero.url} className="project-hero-image" />
      {hero.sourceUrl ? (
        <a
          href={hero.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="project-hero-credit"
          aria-label={`Artwork${hero.author ? ` by ${hero.author}` : ""} on SteamGridDB`}
        >
          {hero.author ? `${hero.author} / ` : ""}SteamGridDB
        </a>
      ) : null}
    </div>
  );
}
