import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  GEOGRAPHIC_MAP_SCRIPTS,
  loadGeoMapData,
  setGeoMapDataFetcher,
  type GeoMapData,
  type GeographicMapScript,
} from '@/systems/geo-map-data';

/**
 * Geographic tile/river data is a JSON asset loaded on demand (#1456), and `createNewGame` /
 * `createHotSeatGame` read only what is already loaded. Under Node there is no bundled asset URL to fetch, so
 * tests read the same file from disk.
 */
const cache = new Map<GeographicMapScript, GeoMapData>();

/** Synchronous read of a script's data straight from the repository, for tests that build maps at collection time. */
export function readGeoMapDataFromDisk(script: GeographicMapScript): GeoMapData {
  let data = cache.get(script);
  if (!data) {
    // Vitest runs from the repo root; import.meta.url is not a file URL under the jsdom environment.
    const path = resolve(process.cwd(), `src/systems/geo-data/${script}-map.json`);
    data = JSON.parse(readFileSync(path, 'utf8')) as GeoMapData;
    cache.set(script, data);
  }
  return data;
}

/** Makes `loadGeoMapData` read from disk. Idempotent. */
export function useDiskGeoMapDataFetcher(): void {
  setGeoMapDataFetcher(async script => readGeoMapDataFromDisk(script));
}

/** A test that creates a game on a geographic script awaits this in `beforeAll`. */
export async function preloadGeoMapData(...scripts: GeographicMapScript[]): Promise<void> {
  useDiskGeoMapDataFetcher();
  await Promise.all((scripts.length > 0 ? scripts : [...GEOGRAPHIC_MAP_SCRIPTS]).map(loadGeoMapData));
}
