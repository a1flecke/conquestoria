/**
 * The browser-side way to obtain a geographic map's data (#1456): `fetch` of the bundled JSON asset.
 *
 * This is its own module, installed by the composition root, because it needs `import.meta.url` (so the bundler
 * emits each file as a hashed asset and gives back its URL). Code that is also loaded by Node tooling in CommonJS,
 * such as the Playwright specs that import `game-state` for fixtures, cannot contain `import.meta`, so the core
 * loader (`geo-map-data.ts`) must not.
 *
 * Each URL must be a literal `new URL(<string>, import.meta.url)` for the bundler to recognise it, and the build
 * (`scripts/version-sw-cache.mjs`) precaches the emitted files for offline play.
 */
import { setGeoMapDataFetcher, type GeographicMapScript } from './geo-map-data';

const DATA_URLS: Record<GeographicMapScript, string> = {
  earth: new URL('./geo-data/earth-map.json', import.meta.url).href,
  'old-world': new URL('./geo-data/old-world-map.json', import.meta.url).href,
  'new-world': new URL('./geo-data/new-world-map.json', import.meta.url).href,
};

async function fetchBundledAsset(script: GeographicMapScript): Promise<unknown> {
  const response = await fetch(DATA_URLS[script]);
  if (!response.ok) throw new Error(`Geographic map data request failed (${response.status}).`);
  return response.json();
}

export function installBundledGeoMapDataFetcher(): void {
  setGeoMapDataFetcher(fetchBundledAsset);
}
