import { config } from "./config";
import { checkImageUrl } from "./images";
import { createHeroResolver, type HeroArtwork } from "./steamgriddb";

let resolver: ReturnType<typeof createHeroResolver> | undefined;

/** A maintainer's cover always wins; empty settings opt into optional automatic artwork. */
export async function projectArtwork(name: string, manualUrl: string | null): Promise<HeroArtwork | null> {
  if (manualUrl) {
    const checked = checkImageUrl(manualUrl);
    return "url" in checked && checked.url ? { url: checked.url, sourceUrl: null, author: null } : null;
  }
  const apiKey = config().STEAMGRIDDB_API_KEY;
  if (!apiKey) return null;
  resolver ??= createHeroResolver({ apiKey });
  return resolver(name);
}
