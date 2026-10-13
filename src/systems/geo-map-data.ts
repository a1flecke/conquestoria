/**
 * On-demand loader for the bulk geography (#1456).
 *
 * The Earth, Old World and New World tile and river tables are ~900 KB of JavaScript source each (about 490 KB
 * of JSON) and are only read when a campaign is created on that exact map script. Importing them statically put
 * all three (1.24 MB of the 6.1 MB entry chunk) on the start screen's critical path for every player, including
 * the balanced and continent maps that never touch them. They are now JSON assets (`./geo-data/*.json`),
 * fetched when a geographic script is chosen (the fetch itself is `geo-map-asset-fetcher.ts`).
 *
 * Why JSON fetched with `fetch`, not a dynamically imported module: a failed `import()` is remembered for the
 * life of the page (verified in Chromium 149: the retry fails while a plain `fetch` of the same URL returns
 * 200), so "press Start again" could never succeed. A failed `fetch` leaves no such memory, and a JSON asset is
 * also cheaper to parse than a 900 KB JavaScript literal is to evaluate.
 *
 * The core constructors (`createNewGame`, `createHotSeatGame`) stay synchronous and deterministic: they read
 * through `getLoadedGeoMapData`, which throws a typed `GeoMapDataNotLoadedError` instead of falling back to a
 * different map. Callers that can create a geographic campaign (`campaign-entry-controller`, the dev scenario
 * loader) `await loadGeoMapData(script)` first. The small start-anchor tables are separate modules
 * (`*-start-positions`) and stay eagerly importable.
 */
import type { GeoTile } from './geo-map-loader';

type MapSize = 'small' | 'medium' | 'large';
type RiverSegment = { from: { q: number; r: number }; to: { q: number; r: number } };

export const GEOGRAPHIC_MAP_SCRIPTS = ['earth', 'old-world', 'new-world'] as const;
export type GeographicMapScript = (typeof GEOGRAPHIC_MAP_SCRIPTS)[number];

export interface GeoMapData {
  readonly tiles: Record<MapSize, GeoTile[]>;
  readonly rivers: Record<MapSize, RiverSegment[]>;
}

export function isGeographicMapScript(script: string | undefined): script is GeographicMapScript {
  return script !== undefined && (GEOGRAPHIC_MAP_SCRIPTS as readonly string[]).includes(script);
}

export class GeoMapDataNotLoadedError extends Error {
  readonly script: GeographicMapScript;
  constructor(script: GeographicMapScript) {
    super(`Geographic map data for '${script}' is not loaded; await loadGeoMapData('${script}') before creating the game.`);
    this.name = 'GeoMapDataNotLoadedError';
    this.script = script;
  }
}

export class GeoMapDataInvalidError extends Error {
  constructor(script: GeographicMapScript) {
    super(`Geographic map data for '${script}' is malformed.`);
    this.name = 'GeoMapDataInvalidError';
  }
}

/** Returns the parsed JSON document for a script. */
export type GeoMapDataFetcher = (script: GeographicMapScript) => Promise<unknown>;

export class GeoMapDataFetcherMissingError extends Error {
  constructor() {
    super('No geographic map data fetcher is installed; the app installs one at startup (geo-map-asset-fetcher.ts).');
    this.name = 'GeoMapDataFetcherMissingError';
  }
}

// How the document is obtained is installed by the host: the browser app installs a `fetch` of the bundled asset
// (`geo-map-asset-fetcher.ts`, which needs the module-URL meta property and so cannot live here: Node tooling
// loads this file as CommonJS), and tests install one that reads the file from disk.
let fetcher: GeoMapDataFetcher | null = null;

/** Installs how the document is obtained; `null` removes it. Not a gameplay seam. */
export function setGeoMapDataFetcher(next: GeoMapDataFetcher | null): void {
  fetcher = next;
}

function parseGeoMapData(script: GeographicMapScript, raw: unknown): GeoMapData {
  const sizes: MapSize[] = ['small', 'medium', 'large'];
  const document = raw as { tiles?: Record<string, unknown>; rivers?: Record<string, unknown> } | null;
  const valid = typeof document === 'object' && document !== null
    && sizes.every(size => Array.isArray(document.tiles?.[size]) && Array.isArray(document.rivers?.[size]));
  if (!valid) throw new GeoMapDataInvalidError(script);
  return raw as GeoMapData;
}

const loaded = new Map<GeographicMapScript, GeoMapData>();
const inFlight = new Map<GeographicMapScript, Promise<GeoMapData>>();

/** Single-flight per script: overlapping callers share one load; a failed load can be retried. */
export function loadGeoMapData(script: GeographicMapScript): Promise<GeoMapData> {
  const ready = loaded.get(script);
  if (ready) return Promise.resolve(ready);
  const pending = inFlight.get(script);
  if (pending) return pending;
  const flight = fetchAndParse(script);
  inFlight.set(script, flight);
  // Cleared from a `.then`, which always runs after registration even when the body throws before any await
  // (no fetcher installed). A network failure and a malformed document both clear it, so the next call retries.
  const clear = (): void => {
    if (inFlight.get(script) === flight) inFlight.delete(script);
  };
  flight.then(clear, clear);
  return flight;
}

async function fetchAndParse(script: GeographicMapScript): Promise<GeoMapData> {
  if (!fetcher) throw new GeoMapDataFetcherMissingError();
  const data = parseGeoMapData(script, await fetcher(script));
  loaded.set(script, data);
  return data;
}

export function isGeoMapDataLoaded(script: GeographicMapScript): boolean {
  return loaded.has(script);
}

export function getLoadedGeoMapData(script: GeographicMapScript): GeoMapData {
  const data = loaded.get(script);
  if (!data) throw new GeoMapDataNotLoadedError(script);
  return data;
}
