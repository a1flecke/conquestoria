#!/usr/bin/env tsx
/**
 * Build-time script: generate earth/old-world/new-world map data.
 * Run: yarn generate-maps
 * Output: src/systems/{earth,old-world,new-world}-map-data.ts
 *
 * Fetches Natural Earth 110m GeoJSON on first run and caches it to
 * scripts/data/ne_110m_admin_0_countries.geojson.
 */
import * as fs from 'fs';
import * as path from 'path';
import * as https from 'https';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DATA_DIR = path.join(__dirname, 'data');

const NE_URL =
  'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_110m_admin_0_countries.geojson';
const NE_CACHE = path.join(DATA_DIR, 'ne_110m_admin_0_countries.geojson');

// ── Types ──────────────────────────────────────────────────────────────────

type Polygon = [number, number][];  // [lon, lat] pairs
type Feature = { geometry: { type: string; coordinates: unknown } };
type GeoJSON = { features: Feature[] };

interface MountainRange {
  name: string;
  polygon: Polygon;
}

interface GeoTile {
  q: number;
  r: number;
  terrain: string;
  resource: string | null;
}

type HexCoord = { q: number; r: number };
type RiverSegment = { from: HexCoord; to: HexCoord };

interface MapBounds {
  lonMin: number;
  lonMax: number;
  latMin: number;
  latMax: number;
  wrapsHorizontally: boolean;
}

type MapSize = 'small' | 'medium' | 'large';

const MAP_DIMENSIONS: Record<MapSize, { width: number; height: number }> = {
  small:  { width: 30, height: 30 },
  medium: { width: 50, height: 50 },
  large:  { width: 80, height: 80 },
};

// ── Fetch / cache ───────────────────────────────────────────────────────────

async function fetchGeoJSON(): Promise<GeoJSON> {
  if (fs.existsSync(NE_CACHE)) {
    return JSON.parse(fs.readFileSync(NE_CACHE, 'utf8')) as GeoJSON;
  }
  console.log('Fetching Natural Earth GeoJSON…');
  const data = await new Promise<string>((resolve, reject) => {
    https.get(NE_URL, (res) => {
      let body = '';
      res.on('data', (chunk: string) => { body += chunk; });
      res.on('end', () => resolve(body));
    }).on('error', reject);
  });
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.writeFileSync(NE_CACHE, data);
  console.log('Cached to', NE_CACHE);
  return JSON.parse(data) as GeoJSON;
}

// ── Geometry helpers ────────────────────────────────────────────────────────

function pointInPolygon(lon: number, lat: number, polygon: Polygon): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0], yi = polygon[i][1];
    const xj = polygon[j][0], yj = polygon[j][1];
    if ((yi > lat) !== (yj > lat) && lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function distToPolygonBoundary(lon: number, lat: number, polygon: Polygon): number {
  let minDist = Infinity;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const ax = polygon[j][0], ay = polygon[j][1];
    const bx = polygon[i][0], by = polygon[i][1];
    const dx = bx - ax, dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    const t = lenSq === 0 ? 0 : Math.max(0, Math.min(1, ((lon - ax) * dx + (lat - ay) * dy) / lenSq));
    const cx = ax + t * dx, cy = ay + t * dy;
    const d = Math.sqrt((lon - cx) ** 2 + (lat - cy) ** 2);
    if (d < minDist) minDist = d;
  }
  return minDist;
}

function extractPolygons(geometry: { type: string; coordinates: unknown }): Polygon[] {
  const polys: Polygon[] = [];
  if (geometry.type === 'Polygon') {
    polys.push((geometry.coordinates as [number, number][][])[0] as Polygon);
  } else if (geometry.type === 'MultiPolygon') {
    for (const part of geometry.coordinates as [number, number][][][]) {
      polys.push(part[0] as Polygon);
    }
  }
  return polys;
}

function isLand(lon: number, lat: number, features: Feature[]): boolean {
  for (const feat of features) {
    for (const poly of extractPolygons(feat.geometry)) {
      if (pointInPolygon(lon, lat, poly)) return true;
    }
  }
  return false;
}

// ── Hex ↔ lat/lon ───────────────────────────────────────────────────────────

function hexToLatLon(
  q: number,
  r: number,
  width: number,
  height: number,
  bounds: MapBounds,
): { lon: number; lat: number } {
  const lon = bounds.lonMin + (q + 0.5) / width * (bounds.lonMax - bounds.lonMin);
  const lat = bounds.latMax - (r + 0.5) / height * (bounds.latMax - bounds.latMin);
  return { lon, lat };
}

// ── Terrain assignment ───────────────────────────────────────────────────────

function assignTerrain(
  lon: number,
  lat: number,
  landFlag: boolean,
  isCoast: boolean,
  mountainRanges: MountainRange[],
  q: number,
  r: number,
): string {
  if (!landFlag) return 'ocean';
  if (isCoast) return 'coast';

  for (const range of mountainRanges) {
    if (pointInPolygon(lon, lat, range.polygon)) return 'mountain';
    if (distToPolygonBoundary(lon, lat, range.polygon) <= 1) return 'hills';
  }

  const absLat = Math.abs(lat);

  if (absLat > 70) return 'snow';
  if (absLat > 65) return 'tundra';

  if (absLat < 20 && isCoast) return 'jungle';
  if (absLat < 30 && !isCoast) return 'desert';

  if (lat >= 35 && lat <= 55 && lon >= 50 && lon <= 100) return 'plains';
  if (lat >= 30 && lat <= 47 && lon >= -5 && lon <= 37) return 'grassland';
  if (absLat >= 47 && absLat <= 65) return 'forest';

  return (q + r) % 2 === 0 ? 'grassland' : 'plains';
}

// ── Resource placement ───────────────────────────────────────────────────────

type ResourceZone = {
  resource: string;
  terrain: string;
  lonMin: number; lonMax: number;
  latMin: number; latMax: number;
};

const RESOURCE_ZONES: ResourceZone[] = [
  { resource: 'horses',  terrain: 'plains',    lonMin: 50,   lonMax: 100,  latMin: 40, latMax: 55 },
  { resource: 'horses',  terrain: 'plains',    lonMin: -110, lonMax: -95,  latMin: 30, latMax: 50 },
  { resource: 'iron',    terrain: 'hills',     lonMin: 5,    lonMax: 30,   latMin: 50, latMax: 65 },
  { resource: 'iron',    terrain: 'hills',     lonMin: 105,  lonMax: 120,  latMin: 30, latMax: 45 },
  { resource: 'iron',    terrain: 'hills',     lonMin: -95,  lonMax: -75,  latMin: 40, latMax: 50 },
  { resource: 'silk',    terrain: 'grassland', lonMin: 95,   lonMax: 115,  latMin: 30, latMax: 40 },
  { resource: 'spices',  terrain: 'jungle',    lonMin: 95,   lonMax: 140,  latMin: -10, latMax: 20 },
  { resource: 'spices',  terrain: 'jungle',    lonMin: 70,   lonMax: 85,   latMin: 8,  latMax: 20 },
  { resource: 'incense', terrain: 'desert',    lonMin: 40,   lonMax: 60,   latMin: 15, latMax: 30 },
  { resource: 'incense', terrain: 'desert',    lonMin: 10,   lonMax: 40,   latMin: 15, latMax: 30 },
  { resource: 'gems',    terrain: 'hills',     lonMin: 20,   lonMax: 40,   latMin: -30, latMax: 5 },
  { resource: 'gems',    terrain: 'hills',     lonMin: 75,   lonMax: 85,   latMin: 10, latMax: 25 },
  { resource: 'gems',    terrain: 'jungle',    lonMin: -80,  lonMax: -65,  latMin: -20, latMax: 5 },
  { resource: 'ivory',   terrain: 'forest',    lonMin: 10,   lonMax: 40,   latMin: -15, latMax: 10 },
  { resource: 'wine',    terrain: 'grassland', lonMin: -5,   lonMax: 30,   latMin: 35, latMax: 47 },
  { resource: 'copper',  terrain: 'hills',     lonMin: -80,  lonMax: -65,  latMin: -35, latMax: 10 },
  { resource: 'copper',  terrain: 'hills',     lonMin: -9,   lonMax: -5,   latMin: 37, latMax: 43 },
];

function placeResourceForTile(
  lon: number,
  lat: number,
  terrain: string,
  seed: number,
): string | null {
  const hash = ((lon * 1000 + lat * 997) | 0) ^ seed;
  const r = (Math.abs(hash) % 1000) / 1000;

  if (terrain === 'hills' && r < 0.08) {
    return 'stone';
  }

  for (const zone of RESOURCE_ZONES) {
    if (
      terrain === zone.terrain &&
      lon >= zone.lonMin && lon <= zone.lonMax &&
      lat >= zone.latMin && lat <= zone.latMax
    ) {
      const zoneHash = (hash ^ zone.resource.charCodeAt(0) * 37) | 0;
      if ((Math.abs(zoneHash) % 1000) / 1000 < 0.15) {
        return zone.resource;
      }
    }
  }
  return null;
}

// ── Start positions ──────────────────────────────────────────────────────────

const EARTH_HOMELAND_LATLON: Record<string, [number, number]> = {
  egypt:    [31.2, 30.0],
  rome:     [12.5, 41.9],
  greece:   [23.7, 37.9],
  babylon:  [44.4, 32.5],
  persia:   [51.4, 35.7],
  india:    [74.0, 28.6],
  china:    [113.0, 34.3],
  mongolia: [106.9, 47.9],
  japan:    [137.0, 35.7],
  zulu:     [30.0, -29.0],
  england:  [-1.5, 53.0],
  france:   [2.3, 48.9],
  spain:    [-3.7, 40.4],
  viking:   [10.8, 59.9],
  germany:  [10.4, 51.2],
  russia:   [37.6, 55.8],
  ottoman:  [32.9, 39.9],
  aztec:    [-99.1, 19.4],
};

const OLD_WORLD_HOMELAND_LATLON: Record<string, [number, number]> = { ...EARTH_HOMELAND_LATLON };
delete (OLD_WORLD_HOMELAND_LATLON as Record<string, unknown>).aztec;

const NEW_WORLD_COLONIZER_LATLON: Record<string, [number, number]> = {
  england: [-75.5, 37.5],
  france:  [-71.2, 46.8],
  spain:   [-95.0, 19.4],
  viking:  [-52.7, 47.5],
  aztec:   [-99.1, 19.4],
};

function latLonToHex(
  lon: number,
  lat: number,
  width: number,
  height: number,
  bounds: MapBounds,
): HexCoord {
  const q = Math.round((lon - bounds.lonMin) / (bounds.lonMax - bounds.lonMin) * width - 0.5);
  const r = Math.round((bounds.latMax - lat) / (bounds.latMax - bounds.latMin) * height - 0.5);
  return {
    q: Math.max(0, Math.min(width - 1, q)),
    r: Math.max(0, Math.min(height - 1, r)),
  };
}

// ── Rivers ───────────────────────────────────────────────────────────────────

type NamedRiver = { name: string; latlon: Array<[number, number]> };

const EARTH_NAMED_RIVERS: NamedRiver[] = [
  { name: 'Nile',        latlon: [[32.5, 5.0],[31.5, 15.0],[31.2, 25.0],[31.2, 30.0]] },
  { name: 'Amazon',      latlon: [[-73.0,-4.0],[-60.0,-3.5],[-50.0,-1.8],[-44.0,-2.5]] },
  { name: 'Yangtze',     latlon: [[99.0, 29.0],[104.0,30.0],[111.0,30.5],[121.0,31.5]] },
  { name: 'Mississippi', latlon: [[-94.0,47.0],[-93.0,44.0],[-91.0,37.0],[-89.0,30.0]] },
  { name: 'Congo',       latlon: [[25.0,-11.0],[20.0,-4.0],[17.0, 1.0],[16.0, 4.0]] },
  { name: 'Rhine',       latlon: [[8.2, 47.5],[7.8, 50.0],[6.8, 51.5],[4.5, 51.9]] },
  { name: 'Ganges',      latlon: [[79.0,27.0],[84.0,25.5],[88.0,24.0],[90.0,23.5]] },
  { name: 'Volga',       latlon: [[33.0,57.0],[46.0,53.0],[48.0,47.0],[48.5,45.0]] },
];

function buildRiverSegments(
  rivers: NamedRiver[],
  width: number,
  height: number,
  bounds: MapBounds,
): RiverSegment[] {
  const segments: RiverSegment[] = [];
  for (const river of rivers) {
    const inBounds = river.latlon.filter(
      ([lon, lat]) => lon >= bounds.lonMin && lon <= bounds.lonMax &&
                      lat >= bounds.latMin && lat <= bounds.latMax,
    );
    if (inBounds.length < 2) continue;
    for (let i = 0; i < inBounds.length - 1; i++) {
      const from = latLonToHex(inBounds[i][0], inBounds[i][1], width, height, bounds);
      const to   = latLonToHex(inBounds[i+1][0], inBounds[i+1][1], width, height, bounds);
      if (from.q !== to.q || from.r !== to.r) {
        segments.push({ from, to });
      }
    }
  }
  return segments;
}

// ── Map generation ───────────────────────────────────────────────────────────

interface MapScriptDef {
  name: string;
  bounds: MapBounds;
  homelandLatLon: Record<string, [number, number]>;
  varPrefix: string;
}

const MAP_SCRIPTS: MapScriptDef[] = [
  {
    name: 'earth',
    bounds: { lonMin: -180, lonMax: 180, latMin: -80, latMax: 80, wrapsHorizontally: true },
    homelandLatLon: EARTH_HOMELAND_LATLON,
    varPrefix: 'EARTH',
  },
  {
    name: 'old-world',
    bounds: { lonMin: -15, lonMax: 150, latMin: -40, latMax: 70, wrapsHorizontally: false },
    homelandLatLon: OLD_WORLD_HOMELAND_LATLON,
    varPrefix: 'OLD_WORLD',
  },
  {
    name: 'new-world',
    bounds: { lonMin: -170, lonMax: -30, latMin: -60, latMax: 75, wrapsHorizontally: false },
    homelandLatLon: NEW_WORLD_COLONIZER_LATLON,
    varPrefix: 'NEW_WORLD',
  },
];

function generateScript(
  script: MapScriptDef,
  size: MapSize,
  features: Feature[],
  mountainRanges: MountainRange[],
): { tiles: GeoTile[]; starts: Record<string, HexCoord>; rivers: RiverSegment[] } {
  const { width, height } = MAP_DIMENSIONS[size];
  const { bounds } = script;

  const landGrid: boolean[][] = Array.from({ length: height }, () => new Array(width).fill(false));
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const { lon, lat } = hexToLatLon(q, r, width, height, bounds);
      landGrid[r][q] = isLand(lon, lat, features);
    }
  }

  const isCoastGrid: boolean[][] = Array.from({ length: height }, () => new Array(width).fill(false));
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      if (!landGrid[r][q]) continue;
      const neighbors = [
        [q-1,r],[q+1,r],[q,r-1],[q,r+1],[q-1,r-1],[q+1,r-1],
      ];
      for (const [nq, nr] of neighbors) {
        if (nq < 0 || nq >= width || nr < 0 || nr >= height) {
          isCoastGrid[r][q] = true;
          break;
        }
        if (!landGrid[nr][nq]) {
          isCoastGrid[r][q] = true;
          break;
        }
      }
    }
  }

  const tiles: GeoTile[] = [];
  const SEED = 42;
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const { lon, lat } = hexToLatLon(q, r, width, height, bounds);
      const landFlag  = landGrid[r][q];
      const coastFlag = isCoastGrid[r][q];
      const terrain = assignTerrain(lon, lat, landFlag, coastFlag, mountainRanges, q, r);
      const resource = landFlag ? placeResourceForTile(lon, lat, terrain, SEED) : null;
      tiles.push({ q, r, terrain, resource });
    }
  }

  const starts: Record<string, HexCoord> = {};
  for (const [civId, [lon, lat]] of Object.entries(script.homelandLatLon)) {
    if (lon < bounds.lonMin || lon > bounds.lonMax || lat < bounds.latMin || lat > bounds.latMax) continue;
    const coord = latLonToHex(lon, lat, width, height, bounds);
    const tileIdx = tiles.findIndex(t => t.q === coord.q && t.r === coord.r);
    if (tileIdx < 0) continue;
    const tile = tiles[tileIdx];
    if (tile.terrain === 'ocean' || tile.terrain === 'mountain') {
      let found = false;
      for (const [dq, dr] of [[0,0],[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
        const candidate = tiles.find(
          t => t.q === coord.q + dq && t.r === coord.r + dr &&
               t.terrain !== 'ocean' && t.terrain !== 'mountain',
        );
        if (candidate) {
          starts[civId] = { q: candidate.q, r: candidate.r };
          found = true;
          break;
        }
      }
      if (!found) {
        console.warn(`  WARNING: could not place ${civId} on valid tile for ${script.name}/${size}`);
      }
    } else {
      starts[civId] = coord;
    }
  }

  const rivers = buildRiverSegments(EARTH_NAMED_RIVERS, width, height, bounds);
  return { tiles, starts, rivers };
}

// ── Code generation ──────────────────────────────────────────────────────────

function emitDataFile(
  varPrefix: string,
  sizeData: Record<MapSize, { tiles: GeoTile[]; starts: Record<string, HexCoord>; rivers: RiverSegment[] }>,
  outPath: string,
): void {
  const tiles = Object.fromEntries(
    Object.entries(sizeData).map(([size, d]) => [size, d.tiles]),
  );
  const starts = Object.fromEntries(
    Object.entries(sizeData).map(([size, d]) => [size, d.starts]),
  );
  const rivers = Object.fromEntries(
    Object.entries(sizeData).map(([size, d]) => [size, d.rivers]),
  );

  const content = `// AUTO-GENERATED by scripts/generate-earth-maps.ts — do not edit manually.
// Run \`yarn generate-maps\` to regenerate.
import type { GeoTile } from './geo-map-loader';
import type { HexCoord } from '@/core/types';

type RiverSegment = { from: HexCoord; to: HexCoord };

export const ${varPrefix}_TILES: Record<'small' | 'medium' | 'large', GeoTile[]> = ${JSON.stringify(tiles, null, 2)} as const;

export const ${varPrefix}_START_POSITIONS: Record<'small' | 'medium' | 'large', Record<string, HexCoord>> = ${JSON.stringify(starts, null, 2)} as const;

export const ${varPrefix}_RIVERS: Record<'small' | 'medium' | 'large', RiverSegment[]> = ${JSON.stringify(rivers, null, 2)} as const;
`;

  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`Wrote ${outPath}`);
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const geoJSON = await fetchGeoJSON();
  const features = geoJSON.features;

  const mountainRanges: MountainRange[] = (
    JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'mountain-ranges.json'), 'utf8')) as {
      ranges: MountainRange[];
    }
  ).ranges;

  for (const script of MAP_SCRIPTS) {
    console.log(`\nGenerating ${script.name}…`);
    const sizeData: Record<string, ReturnType<typeof generateScript>> = {};
    for (const size of ['small', 'medium', 'large'] as const) {
      console.log(`  ${size}…`);
      sizeData[size] = generateScript(script, size, features, mountainRanges);
    }
    const outPath = path.join(ROOT, 'src', 'systems', `${script.name}-map-data.ts`);
    emitDataFile(script.varPrefix, sizeData as Record<MapSize, ReturnType<typeof generateScript>>, outPath);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
