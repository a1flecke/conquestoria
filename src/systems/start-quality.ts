import type { HexCoord } from '@/core/types/hex';
import { getWrappedHexesInRange, hexKey, hexesInRange } from '@/systems/hex-utils';
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

export function createStartQualityIndex(
  map: StartQualityMap,
  options: { polarRows?: PolarRowBand } = {},
): StartQualityIndex {
  const viability = createStartViabilityIndex(map);
  const wraps = map.wrapsHorizontally === true;
  const range = (coord: HexCoord, radius: number): HexCoord[] =>
    wraps ? getWrappedHexesInRange(coord, radius, map.width) : hexesInRange(coord, radius);
  const cache = new Map<string, StartSiteAssessment>();

  const assess = (coord: HexCoord): StartSiteAssessment => {
    const key = hexKey(coord);
    const cached = cache.get(key);
    if (cached) return cached;

    const centre = map.tiles[key];
    const land: string[] = [];
    let freshWater = centre?.hasRiver === true;
    let coastal = false;
    const adjacentKeys = new Set(range(coord, 1).map(hexKey));
    for (const nearby of range(coord, 2)) {
      const nearbyKey = hexKey(nearby);
      if (nearbyKey === key) continue;
      const tile = map.tiles[nearbyKey];
      if (!tile) continue;
      const adjacent = adjacentKeys.has(nearbyKey);
      if (isWater(tile.terrain)) {
        if (adjacent) coastal = true;
        continue;
      }
      if (adjacent && tile.hasRiver) freshWater = true;
      land.push(tile.terrain);
    }
    const yields = land.map(terrain => TERRAIN_YIELDS[terrain] ?? { food: 0, production: 0 });
    const bestBy = (pick: (y: { food: number; production: number }) => number): number =>
      yields.map(pick).sort((a, b) => b - a).slice(0, 6).reduce((sum, value) => sum + value, 0);
    const landFood6 = bestBy(y => y.food);
    const landProduction6 = bestBy(y => y.production);
    const frozenShare = land.length === 0 ? 0 : land.filter(isFrozen).length / land.length;

    let resourceCount = 0;
    for (const nearby of range(coord, 3)) {
      if (map.tiles[hexKey(nearby)]?.resource) resourceCount++;
    }

    const landmassTiles = viability.assess(coord).landmassTiles;
    const expansionSites = viability.countLandExpansionSites(coord);
    const polarBand = options.polarRows ? isPolarRow(options.polarRows, coord.r, map.height) : false;

    const w = START_SCORE_WEIGHTS;
    const score = landFood6 * w.food
      + landProduction6 * w.production
      + Math.min(expansionSites, w.expansionSiteCap) * w.expansionSite
      + (freshWater ? w.freshWater : 0)
      + Math.min(resourceCount, w.resourceCap) * w.resource
      - frozenShare * w.frozenPenalty;

    const result: StartSiteAssessment = {
      coord: { q: coord.q, r: coord.r },
      landmassTiles,
      expansionSites,
      landTilesR2: land.length,
      landFood6,
      landProduction6,
      frozenShare,
      polarBand,
      freshWater,
      coastal,
      resourceCount,
      score,
    };
    cache.set(key, result);
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
