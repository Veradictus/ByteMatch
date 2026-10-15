import { afterEach, expect, it, vi } from "vitest";
import { projectArtwork } from "./artwork";
import { resetConfig } from "./config";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  resetConfig();
});
it("keeps manual covers and makes no lookup when automatic artwork is disabled", async () => {
  vi.stubEnv("STEAMGRIDDB_API_KEY", "");
  resetConfig();
  const fetcher = vi.fn();
  vi.stubGlobal("fetch", fetcher);
  expect(await projectArtwork("Any game", "https://example.com/manual.jpg")).toEqual({
    url: "https://example.com/manual.jpg",
    sourceUrl: null,
    author: null,
  });
  expect(await projectArtwork("Any game", null)).toBeNull();
  expect(fetcher).not.toHaveBeenCalled();
});
