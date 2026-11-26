import type { HexCoord } from '@/core/types/hex';
import { TERRAIN_YIELDS } from '@/systems/terrain-yields';
import { createStartViabilityIndex, type StartViabilityMap } from '@/systems/start-viability';
import { isPolarRow, type PolarRowBand } from '@/systems/geo-latitude';

/**
 * Start quality (design 2026-11-25, "Start Quality Model and Homeland Choice", B1): the ONE definition of how good a
 * start site is, used by every major-civilization and city-state placer.
 *
 * It judges a site from its own LAND. Water is never counted as farmland: coast is the best base-yield tile in the
 * game (2 food, 1 gold), so a food-only measure rated a one-tile island in the Arctic as fertile, which is how a
 * player started there. Production, room for a second city on the same landmass, frozen ground and (on real-world
 * maps) latitude are part of the judgement. The floor table below is the hard minimum no placed start may break.
 */

export type StartFloorKind = 'major' | 'city-state';

export type StartFloorFailure =
  | 'land-r2'
  | 'land-food'
  | 'land-production'
  | 'frozen'
  | 'polar-band'
  | 'expansion-room';

export interface StartFloor {
  /** Land (non-water) tiles within 2, centre excluded. */
  landR2: number;
  /** Food of the best six land tiles within 2 by base terrain yield. */
  landFood6: number;
  /** Production of the best six land tiles within 2 by base terrain yield. */
  landProduction6: number;
  /** Fails at or above this share of tundra/snow among land within 2. */
  maxFrozenShare: number;
  /** Legal second-city sites on the start's own landmass. City-states do not expand. */
  minExpansionSites: number;
}

/** Provisional numbers; tune here against the start outcome matrix, never per map. */
export const START_FLOORS: Record<StartFloorKind, StartFloor> = {
  major: { landR2: 8, landFood6: 6, landProduction6: 3, maxFrozenShare: 0.5, minExpansionSites: 2 },
  'city-state': { landR2: 6, landFood6: 5, landProduction6: 2, maxFrozenShare: 0.5, minExpansionSites: 0 },
};

/** One table for the site score; selection maximises the weakest start's score. */
export const START_SCORE_WEIGHTS = {
  food: 1,
  production: 1.5,
  expansionSite: 1,
  expansionSiteCap: 6,
  freshWater: 2,
  resource: 0.5,
  resourceCap: 4,
  frozenPenalty: 6,
} as const;

export interface StartSiteAssessment {
  coord: HexCoord;
  landmassTiles: number;
  expansionSites: number;
  landTilesR2: number;
  landFood6: number;
  landProduction6: number;
  frozenShare: number;
  polarBand: boolean;
  freshWater: boolean;
  coastal: boolean;
  resourceCount: number;
  score: number;
}

export interface StartQualityMap extends StartViabilityMap {
  tiles: Record<string, { coord: HexCoord; terrain: string; hasRiver?: boolean; resource?: string | null }>;
}

export interface StartQualityIndex {
  assess(coord: HexCoord): StartSiteAssessment;
  floorFailures(coord: HexCoord, kind: StartFloorKind): StartFloorFailure[];
  passesFloor(coord: HexCoord, kind: StartFloorKind): boolean;
}

const isWater = (terrain: string | undefined): boolean => terrain === 'ocean' || terrain === 'coast';
const isFrozen = (terrain: string): boolean => terrain === 'tundra' || terrain === 'snow';

/** Axial offsets of every hex within `radius` of a tile, centre excluded. */
function ringOffsets(radius: number): Array<readonly [number, number]> {
  const offsets: Array<readonly [number, number]> = [];
  for (let dq = -radius; dq <= radius; dq++) {
    for (let dr = -radius; dr <= radius; dr++) {
      if (dq === 0 && dr === 0) continue;
      if (Math.max(Math.abs(dq), Math.abs(dr), Math.abs(dq + dr)) <= radius) offsets.push([dq, dr]);
    }
  }
  return offsets;
}

const RADIUS_1 = ringOffsets(1);
const RADIUS_2 = ringOffsets(2);
const RADIUS_3 = ringOffsets(3);
/** `expansionSites` is counted up to the largest number anything reads (the score cap), not exhaustively. */
const EXPANSION_COUNT_LIMIT = Math.max(START_SCORE_WEIGHTS.expansionSiteCap, ...Object.values(START_FLOORS).map(f => f.minExpansionSites));

export function createStartQualityIndex(
  map: StartQualityMap,
  options: { polarRows?: PolarRowBand } = {},
): StartQualityIndex {
  const viability = createStartViabilityIndex(map);
  const { width, height } = map;
  const wraps = map.wrapsHorizontally === true;
  const total = width * height;

  // Flat per-tile facts, read by index: assessing every land tile of a large map allocates nothing per neighbour.
  // (Building hex lists and string keys per tile made game creation four times slower.)
  const PRESENT = 1;
  const WATER = 2;
  const FROZEN = 4;
  const RIVER = 8;
  const RESOURCE = 16;
  const flags = new Uint8Array(total);
  const food = new Int8Array(total);
  const production = new Int8Array(total);
  for (const tile of Object.values(map.tiles)) {
    const { q, r } = tile.coord;
    if (q < 0 || q >= width || r < 0 || r >= height) continue;
    const i = r * width + q;
    let f = PRESENT;
    if (isWater(tile.terrain)) f |= WATER;
    if (isFrozen(tile.terrain)) f |= FROZEN;
    if (tile.hasRiver) f |= RIVER;
    if (tile.resource) f |= RESOURCE;
    flags[i] = f;
    const yields = TERRAIN_YIELDS[tile.terrain];
    food[i] = yields?.food ?? 0;
    production[i] = yields?.production ?? 0;
  }

  /** Index of the tile at an offset from (q, r), or -1 off the map or where no tile exists. */
  const at = (q: number, r: number, dq: number, dr: number): number => {
    const nr = r + dr;
    if (nr < 0 || nr >= height) return -1;
    let nq = q + dq;
    if (nq < 0 || nq >= width) {
      if (!wraps) return -1;
      nq = ((nq % width) + width) % width;
    }
    const i = nr * width + nq;
    return flags[i] & PRESENT ? i : -1;
  };

  const cache = new Map<number, StartSiteAssessment>();
  const foods = new Int8Array(RADIUS_2.length);
  const productions = new Int8Array(RADIUS_2.length);

  const assess = (coord: HexCoord): StartSiteAssessment => {
    const { q, r } = coord;
    const inside = q >= 0 && q < width && r >= 0 && r < height;
    const key = r * width + q;
    const cached = inside ? cache.get(key) : undefined;
    if (cached) return cached;

    const centre = inside ? flags[key] : 0;
    let freshWater = (centre & RIVER) !== 0;
    let coastal = false;
    for (const [dq, dr] of RADIUS_1) {
      const i = at(q, r, dq, dr);
      if (i < 0) continue;
      if (flags[i] & WATER) coastal = true;
      else if (flags[i] & RIVER) freshWater = true;
    }

    let landCount = 0;
    let frozenCount = 0;
    for (const [dq, dr] of RADIUS_2) {
      const i = at(q, r, dq, dr);
      if (i < 0 || flags[i] & WATER) continue;
      foods[landCount] = food[i];
      productions[landCount] = production[i];
      landCount++;
      if (flags[i] & FROZEN) frozenCount++;
    }
    const bestSix = (values: Int8Array): number => {
      const taken = values.subarray(0, landCount).slice().sort(); // ascending
      let sum = 0;
      for (let k = taken.length - 1; k >= Math.max(0, taken.length - 6); k--) sum += taken[k];
      return sum;
    };
    const landFood6 = bestSix(foods);
    const landProduction6 = bestSix(productions);
    const frozenShare = landCount === 0 ? 0 : frozenCount / landCount;

    let resourceCount = 0;
    for (const [dq, dr] of RADIUS_3) {
      const i = at(q, r, dq, dr);
      if (i >= 0 && flags[i] & RESOURCE) resourceCount++;
    }

    const landmassTiles = viability.assess(coord).landmassTiles;
    const expansionSites = viability.countLandExpansionSites(coord, EXPANSION_COUNT_LIMIT);
    const polarBand = options.polarRows ? isPolarRow(options.polarRows, coord.r, map.height) : false;

    const w = START_SCORE_WEIGHTS;
    const score = landFood6 * w.food
      + landProduction6 * w.production
      + Math.min(expansionSites, w.expansionSiteCap) * w.expansionSite
      + (freshWater ? w.freshWater : 0)
      + Math.min(resourceCount, w.resourceCap) * w.resource
      - frozenShare * w.frozenPenalty;

    const result: StartSiteAssessment = {
      coord: { q, r },
      landmassTiles,
      expansionSites,
      landTilesR2: landCount,
      landFood6,
      landProduction6,
      frozenShare,
      polarBand,
      freshWater,
      coastal,
      resourceCount,
      score,
    };
    if (inside) cache.set(key, result);
    return result;
  };

  const floorFailures = (coord: HexCoord, kind: StartFloorKind): StartFloorFailure[] => {
    const floor = START_FLOORS[kind];
    const site = assess(coord);
    const failures: StartFloorFailure[] = [];
    if (site.landTilesR2 < floor.landR2) failures.push('land-r2');
    if (site.landFood6 < floor.landFood6) failures.push('land-food');
    if (site.landProduction6 < floor.landProduction6) failures.push('land-production');
    if (site.frozenShare >= floor.maxFrozenShare) failures.push('frozen');
    if (site.polarBand) failures.push('polar-band');
    if (site.expansionSites < floor.minExpansionSites) failures.push('expansion-room');
    return failures;
  };

  return {
    assess,
    floorFailures,
    passesFloor: (coord, kind) => floorFailures(coord, kind).length === 0,
  };
}
