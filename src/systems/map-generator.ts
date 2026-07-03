import type { GameMap, HexTile, HexCoord, TerrainType, Elevation, MapScript, ResourceType, LegendaryWonderDefinition } from '@/core/types';
import {
  hexKey,
  hexDistance,
  hexesInRange,
  getWrappedHexesInRange,
  wrappedHexDistance,
} from './hex-utils';
import { generateRivers, applyRiversToMap } from './river-system';
import { RESOURCE_DEFINITIONS } from './trade-system';
import { LEGENDARY_WONDER_DEFINITIONS } from './legendary-wonder-definitions';
// Geo data imports — populated by `yarn generate-maps`. Placeholder empty exports are safe.
import { EARTH_START_POSITIONS } from './earth-map-data';
import { isValidStartTile } from './map-validation';
import { OLD_WORLD_START_POSITIONS } from './old-world-map-data';
import { NEW_WORLD_START_POSITIONS } from './new-world-map-data';

// Simple seeded PRNG (mulberry32)
export function createRng(seed: string): () => number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(31, h) + seed.charCodeAt(i) | 0;
  }
  return () => {
    h |= 0; h = h + 0x6D2B79F5 | 0;
    let t = Math.imul(h ^ h >>> 15, 1 | h);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Simple 2D value noise for terrain generation
export function createNoise(rng: () => number) {
  const perm = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }

  function fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  function lerp(a: number, b: number, t: number): number {
    return a + t * (b - a);
  }

  function grad(hash: number, x: number, y: number): number {
    const h = hash & 3;
    const u = h < 2 ? x : y;
    const v = h < 2 ? y : x;
    return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
  }

  return function noise2d(x: number, y: number): number {
    const X = Math.floor(x) & 255;
    const Y = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);
    const u = fade(xf);
    const v = fade(yf);

    const aa = perm[(perm[X] + Y) & 255];
    const ab = perm[(perm[X] + Y + 1) & 255];
    const ba = perm[(perm[(X + 1) & 255] + Y) & 255];
    const bb = perm[(perm[(X + 1) & 255] + Y + 1) & 255];

    return lerp(
      lerp(grad(aa, xf, yf), grad(ba, xf - 1, yf), u),
      lerp(grad(ab, xf, yf - 1), grad(bb, xf - 1, yf - 1), u),
      v,
    );
  };
}

function getElevation(noiseVal: number): Elevation {
  if (noiseVal > 0.6) return 'mountain';
  if (noiseVal > 0.3) return 'highland';
  return 'lowland';
}

function getTerrain(
  landNoise: number,
  moistureNoise: number,
  elevationNoise: number,
  tempNoise: number,
  r: number,
  height: number,
): TerrainType {
  // Polar regions
  const distFromEdge = Math.min(r, height - 1 - r) / (height / 2);
  if (distFromEdge < 0.1) return tempNoise > 0.5 ? 'tundra' : 'snow';

  // Ocean and coast
  if (landNoise < -0.15) return 'ocean';
  if (landNoise < 0) return 'coast';

  const elevation = getElevation(elevationNoise);

  // Mountains
  if (elevation === 'mountain') return 'mountain';

  // Volcanic — rare, near high elevation
  if (elevationNoise > 0.45 && moistureNoise < 0.2 && landNoise > 0.3) return 'volcanic';

  // Hills
  if (elevation === 'highland') {
    if (moistureNoise > 0.5) return 'forest';
    return 'hills';
  }

  // Lowland terrain by climate
  // Swamp — low-lying, very wet
  if (moistureNoise > 0.6 && landNoise < 0.2 && tempNoise > 0.3) return 'swamp';

  // Jungle — hot and wet
  if (tempNoise > 0.65 && moistureNoise > 0.5) return 'jungle';

  // Forest — moderate moisture
  if (moistureNoise > 0.5) return 'forest';

  // Desert — hot and dry
  if (tempNoise > 0.6 && moistureNoise < 0.3) return 'desert';

  // Plains vs grassland
  if (moistureNoise > 0.3) return 'grassland';
  return 'plains';
}

export function generateBaseTerrain(width: number, height: number, seed: string): Record<string, HexTile> {
  const rng = createRng(seed);
  const landNoise = createNoise(rng);
  const moistureNoise = createNoise(rng);
  const elevationNoise = createNoise(rng);
  const tempNoise = createNoise(rng);

  const tiles: Record<string, HexTile> = {};

  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const nx = (q / width) * 4;
      const ny = (r / height) * 4;

      const land = landNoise(nx, ny) + 0.5 * landNoise(nx * 2, ny * 2);
      const moisture = moistureNoise(nx + 100, ny + 100);
      const elev = elevationNoise(nx + 200, ny + 200);
      const temp = (tempNoise(nx + 300, ny + 300) + 1) / 2;

      const terrain = getTerrain(land, moisture, elev, temp, r, height);
      const elevation = getElevation(elev);
      const key = hexKey({ q, r });

      tiles[key] = {
        coord: { q, r },
        terrain,
        elevation:
          terrain === 'mountain' ? 'mountain'
          : terrain === 'hills' ? 'highland'
          : terrain === 'volcanic' ? 'highland'
          : elevation === 'mountain' ? 'highland'
          : elevation,
        resource: null,
        improvement: 'none',
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
      };
    }
  }
  return tiles;
}

/** Terrain classifier for a known-land hex — never returns ocean or coast. */
export function getLandTerrain(
  moistureVal: number,
  elevationVal: number,
  tempVal: number,
  r: number,
  height: number,
): TerrainType {
  const distFromEdge = Math.min(r, height - 1 - r) / (height / 2);
  if (distFromEdge < 0.1) return tempVal > 0.5 ? 'tundra' : 'snow';
  const elevation = getElevation(elevationVal);
  if (elevation === 'mountain') return 'mountain';
  if (elevationVal > 0.45 && moistureVal < 0.2) return 'volcanic';
  if (elevation === 'highland') return moistureVal > 0.5 ? 'forest' : 'hills';
  if (moistureVal > 0.6 && tempVal > 0.3) return 'swamp';
  if (tempVal > 0.65 && moistureVal > 0.5) return 'jungle';
  if (moistureVal > 0.5) return 'forest';
  if (tempVal > 0.6 && moistureVal < 0.3) return 'desert';
  if (moistureVal > 0.3) return 'grassland';
  return 'plains';
}

export function generateMap(width: number, height: number, seed: string): GameMap {
  const tiles = generateBaseTerrain(width, height, seed);
  const resourceRng = createRng(seed + '-resources');
  placeResources(tiles, resourceRng);
  const mapResult: GameMap = { width, height, tiles, wrapsHorizontally: true, rivers: [] };
  const rivers = generateRivers(mapResult, seed);
  applyRiversToMap(mapResult, rivers);
  return mapResult;
}

// Probability overrides per terrain type.
// Hills reduced to 10% because it hosts many resources after S2a; keeps individual
// resource frequency at a reasonable level (≈1.4% per resource vs 15%/7 ≈ 2.1% if left at 15%).
const TERRAIN_PROBABILITIES: Record<string, number> = {
  hills: 0.10,
};
const DEFAULT_RESOURCE_PROBABILITY = 0.20;

// Derived at module load from RESOURCE_DEFINITIONS — eliminates dual-maintenance.
// terrain field is string | string[]; we expand multi-terrain entries here.
function buildTerrainResourceMap(): Record<string, ResourceType[]> {
  const map: Record<string, ResourceType[]> = {};
  for (const def of RESOURCE_DEFINITIONS) {
    const terrains = Array.isArray(def.terrain) ? def.terrain : [def.terrain];
    for (const t of terrains) {
      (map[t] ??= []).push(def.id);
    }
  }
  return map;
}

export function placeResources(tiles: Record<string, HexTile>, rng: () => number): void {
  const terrainResources = buildTerrainResourceMap();
  for (const tile of Object.values(tiles)) {
    if (tile.resource) continue;  // never overwrite existing resource
    const candidates = terrainResources[tile.terrain];
    if (!candidates || candidates.length === 0) continue;
    const prob = TERRAIN_PROBABILITIES[tile.terrain] ?? DEFAULT_RESOURCE_PROBABILITY;
    if (rng() < prob) {
      tile.resource = candidates[Math.floor(rng() * candidates.length)] as typeof tile.resource;
    }
  }
}

/**
 * Ensures every major-civ start has at least one luxury and one strategic
 * resource within radius 5 without overwriting existing resource placement.
 */
export function guaranteeStartResources(
  map: GameMap,
  startPositions: HexCoord[],
  rng: () => number,
): void {
  const terrainResourceMap = buildTerrainResourceMap();
  const luxuryIds = new Set<ResourceType>(
    RESOURCE_DEFINITIONS.filter(def => def.type === 'luxury').map(def => def.id),
  );
  const strategicIds = new Set<ResourceType>(
    RESOURCE_DEFINITIONS.filter(def => def.type === 'strategic').map(def => def.id),
  );

  for (const start of startPositions) {
    const neighborhoodData = getCandidateNeighborhood(map, start, 5)
      .map(coord => ({ coord, tile: map.tiles[hexKey(coord)] }))
      .filter((item): item is { coord: HexCoord; tile: HexTile } => item.tile !== undefined);

    const hasLuxury = neighborhoodData.some(({ tile }) =>
      isTargetResource(tile.resource, luxuryIds),
    );
    if (!hasLuxury) {
      guaranteePlaceResource(neighborhoodData, luxuryIds, terrainResourceMap, start, map, rng);
    }

    const hasStrategic = neighborhoodData.some(({ tile }) =>
      isTargetResource(tile.resource, strategicIds),
    );
    if (!hasStrategic) {
      guaranteePlaceResource(neighborhoodData, strategicIds, terrainResourceMap, start, map, rng);
    }
  }

  guaranteeSpecificWonderResources(map, startPositions, terrainResourceMap, rng);
}

// Specific resource ids (not just "any luxury"/"any strategic") required by any
// legendary wonder. Derived from wonder data, not hardcoded, so a future wonder
// introducing a new required resource is picked up automatically.
//
// Not era-filtered: checked during implementation, only 1 of 18 requiredResources
// entries across the whole roster is era <= 3 (Oracle of Delphi, stone, era 3) — the
// rest span era 4 through 11, heavily on iron. An early-era-only filter would leave
// the exact reachability problem this exists to fix unsolved for nearly every wonder
// that actually has this requirement. Since the roster only ever references 3
// distinct specific ids in total (stone, iron, gold) regardless of era, guaranteeing
// all of them has the same footprint as guaranteeing an early-only subset would.
//
// Exported (and parameterized with a real default) so a test can inject a synthetic
// wonder list and prove this reads data rather than a hardcoded set.
export function getWonderRequiredResourceIds(
  wonders: LegendaryWonderDefinition[] = LEGENDARY_WONDER_DEFINITIONS,
): Set<ResourceType> {
  return new Set(
    wonders.flatMap(wonder => wonder.requiredResources) as ResourceType[],
  );
}

// stone (mountain-only) and iron/gold (hills-only) can legitimately have zero
// eligible tiles within a small radius on terrain-sparse starts. guaranteePlaceResource
// silently no-ops when nothing is eligible, so a fixed radius alone would not actually
// guarantee anything — escalate outward until placed or genuinely nothing exists on
// the whole map (mirrors the existing "does not crash when no eligible terrain exists"
// guarantee for the generic luxury/strategic passes).
const SPECIFIC_RESOURCE_GUARANTEE_RADII = [5, 10, 20, 40];

function guaranteeSpecificWonderResources(
  map: GameMap,
  startPositions: HexCoord[],
  terrainResourceMap: Record<string, ResourceType[]>,
  rng: () => number,
): void {
  const specificIds = getWonderRequiredResourceIds();

  for (const start of startPositions) {
    for (const resourceId of specificIds) {
      const targetSet = new Set<ResourceType>([resourceId]);
      const alreadyPresent = getCandidateNeighborhood(map, start, 5)
        .map(coord => map.tiles[hexKey(coord)])
        .some(tile => tile !== undefined && isTargetResource(tile.resource, targetSet));
      if (alreadyPresent) continue;

      for (const radius of SPECIFIC_RESOURCE_GUARANTEE_RADII) {
        const neighborhoodData = getCandidateNeighborhood(map, start, radius)
          .map(coord => ({ coord, tile: map.tiles[hexKey(coord)] }))
          .filter((item): item is { coord: HexCoord; tile: HexTile } => item.tile !== undefined);
        const placed = guaranteePlaceResource(neighborhoodData, targetSet, terrainResourceMap, start, map, rng);
        if (placed) break;
      }
    }
  }
}

function guaranteePlaceResource(
  neighborhoodData: Array<{ coord: HexCoord; tile: HexTile }>,
  targetIds: Set<ResourceType>,
  terrainResourceMap: Record<string, ResourceType[]>,
  start: HexCoord,
  map: GameMap,
  rng: () => number,
): boolean {
  const eligible = neighborhoodData.filter(({ tile }) => {
    if (tile.resource !== null) return false;
    const candidates = terrainResourceMap[tile.terrain] ?? [];
    return candidates.some(resource => targetIds.has(resource));
  });
  if (eligible.length === 0) return false;

  const keyed = eligible.map(item => ({
    ...item,
    distance: map.wrapsHorizontally
      ? wrappedHexDistance(item.coord, start, map.width)
      : hexDistance(item.coord, start),
    tie: rng(),
  }));
  keyed.sort((a, b) => a.distance - b.distance || a.tie - b.tie);

  const target = keyed[0];
  const candidates = (terrainResourceMap[target.tile.terrain] ?? [])
    .filter(resource => targetIds.has(resource));
  if (candidates.length === 0) return false;
  target.tile.resource = candidates[Math.floor(rng() * candidates.length)];
  return true;
}

function isTargetResource(resource: string | null, targetIds: Set<ResourceType>): resource is ResourceType {
  return resource !== null && targetIds.has(resource as ResourceType);
}

function isLandTerrain(terrain: TerrainType): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain' && terrain !== 'snow';
}

export const MIN_MAJOR_CIV_START_DISTANCE = 9;

export function getMinimumStartDistance(_map: Pick<GameMap, 'width' | 'height'>): number {
  return MIN_MAJOR_CIV_START_DISTANCE;
}

export function getStartPositionDistance(
  map: Pick<GameMap, 'width' | 'wrapsHorizontally'>,
  a: HexCoord,
  b: HexCoord,
): number {
  return map.wrapsHorizontally
    ? wrappedHexDistance(a, b, map.width)
    : hexDistance(a, b);
}

function getCandidateNeighborhood(map: GameMap, coord: HexCoord, range: number): HexCoord[] {
  return map.wrapsHorizontally
    ? getWrappedHexesInRange(coord, range, map.width)
    : hexesInRange(coord, range);
}

function getMinimumDistanceToExistingStarts(
  map: GameMap,
  coord: HexCoord,
  positions: HexCoord[],
): number {
  if (positions.length === 0) return Infinity;
  return Math.min(...positions.map(position => getStartPositionDistance(map, coord, position)));
}

const GEO_START_TABLES: Partial<Record<MapScript, Record<'small' | 'medium' | 'large', Record<string, HexCoord>>>> = {
  earth: EARTH_START_POSITIONS,
  'old-world': OLD_WORLD_START_POSITIONS,
  'new-world': NEW_WORLD_START_POSITIONS,
};

/**
 * Find start positions for all civs. Returns positions in the same order as civTypeIds.
 *
 * For geo scripts, precomputed historical starts are looked up first;
 * unknown civs fall back to the greedy spacing algorithm. Precomputed
 * positions bypass MIN_MAJOR_CIV_START_DISTANCE (e.g. Europe has many
 * civs in a small area). The greedy fallback respects candidateHexes if provided.
 */
export function findStartPositions(
  map: GameMap,
  civTypeIds: string[],
  mapScript: MapScript,
  size: 'small' | 'medium' | 'large',
  candidateHexes?: Set<string>,
): HexCoord[] {
  const count = civTypeIds.length;
  const positions: Array<HexCoord | null> = new Array(count).fill(null);

  // Pass 1: fill in precomputed geo starts for known civs.
  // Duplicate detection: if two civs map to the same hex, only the first keeps the
  // precomputed slot; the second falls through to the greedy Pass 2.
  const table = GEO_START_TABLES[mapScript]?.[size];
  if (table) {
    const claimedKeys = new Set<string>();
    for (let i = 0; i < civTypeIds.length; i++) {
      const precomputed = table[civTypeIds[i]];
      const precomputedTile = precomputed ? map.tiles[hexKey(precomputed)] : undefined;
      if (!precomputed || !precomputedTile || !isValidStartTile(precomputedTile)) {
        if (precomputed) {
          console.warn(
            `[findStartPositions] ${civTypeIds[i]} precomputed start ${hexKey(precomputed)}` +
            ` (${precomputedTile?.terrain ?? 'missing'}) is invalid — falling through to greedy Pass 2`,
          );
        }
        continue;
      }
      const key = hexKey(precomputed);
      if (!claimedKeys.has(key)) {
        positions[i] = precomputed;
        claimedKeys.add(key);
      }
    }
  }

  // Collect candidates for greedy fallback.
  const allCandidates: HexCoord[] = [];
  for (const tile of Object.values(map.tiles)) {
    if (!isLandTerrain(tile.terrain)) continue;
    if (tile.coord.r <= 3 || tile.coord.r >= map.height - 4) continue;
    if (candidateHexes && !candidateHexes.has(hexKey(tile.coord))) continue;
    const nearby = getCandidateNeighborhood(map, tile.coord, 2);
    const landCount = nearby.filter(n => {
      const t = map.tiles[hexKey(n)];
      return t && isLandTerrain(t.terrain);
    }).length;
    if (landCount >= 10) allCandidates.push(tile.coord);
  }

  if (allCandidates.length === 0) {
    // Relaxed fallback: any non-ocean land tile.
    for (const tile of Object.values(map.tiles)) {
      if (!isLandTerrain(tile.terrain)) continue;
      if (candidateHexes && !candidateHexes.has(hexKey(tile.coord))) continue;
      allCandidates.push(tile.coord);
    }
  }

  // Pass 2: greedy for slots without precomputed positions.
  const used = new Set<string>(
    positions.filter(Boolean).map(p => hexKey(p!)),
  );
  const placedPositions = positions.filter(Boolean) as HexCoord[];

  const minimumDistance = getMinimumStartDistance(map);
  for (let i = 0; i < count; i++) {
    if (positions[i] !== null) continue;

    let bestCandidate: HexCoord | null = null;
    let bestMinDist = -1;
    let bestFallback: HexCoord | null = null;
    let bestFallbackDist = -1;

    for (const c of allCandidates) {
      if (used.has(hexKey(c))) continue;
      const minDist = placedPositions.length === 0
        ? Infinity
        : Math.min(...placedPositions.map(p => getStartPositionDistance(map, c, p)));

      if (minDist > bestFallbackDist) {
        bestFallbackDist = minDist;
        bestFallback = c;
      }
      if (minDist >= minimumDistance && minDist > bestMinDist) {
        bestMinDist = minDist;
        bestCandidate = c;
      }
    }

    const selected = bestCandidate ?? bestFallback;
    if (!selected) break;
    positions[i] = selected;
    used.add(hexKey(selected));
    placedPositions.push(selected);
  }

  return positions.filter(Boolean) as HexCoord[];
}
