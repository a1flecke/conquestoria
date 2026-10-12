import type { HexCoord } from '@/core/types/hex';
import {
  isCityCenterTerrain,
  MIN_CITY_CENTER_DISTANCE,
} from '@/systems/city-territory-system';

/**
 * Minimum viable start (#1453): "viable agency".
 *
 * A major civilization's first city must have a credible, LEGAL path toward a
 * second city. It does not promise equal terrain, resources or ease -- only that
 * the civilization is not trapped by the map for reasons outside its control.
 *
 * A start S is viable when EITHER
 *  - land route: its connected landmass (any non-water tile; mountains cost
 *    movement but are walkable, water is not -- the same connectivity the
 *    movement rules and `tagLandmassRegions` use, wrapping across the seam)
 *    holds a tile T where a city may legally stand
 *    (`isCityCenterTerrain`) at distance >= `MIN_CITY_CENTER_DISTANCE` from S; OR
 *  - sea route: a city on S is coastal (so it can build ships at all) and a
 *    DIFFERENT landmass holding such a legal site T borders a body of water that
 *    also borders S's city.
 *
 * Deliberately NOT part of the contract: landmass tile count (a big island can
 * still hold no legal second site and a small one can be fine), the tech a ship
 * needs, travel time, or the competition of other civilizations. Those make a
 * start hard, not impossible.
 *
 * The terrain rule and the separation constant are imported from the canonical
 * founding rules, and the metric below is `cityDistance`'s (wrap-aware iff the
 * map wraps), so the start contract cannot drift from `canFoundCityAt`.
 *
 * Performance: the index is built once per map with flat typed arrays (no
 * per-tile string keys or allocations) -- placement asks it about every
 * candidate tile of a 80x80 map.
 */
export interface StartViability {
  viable: boolean;
  route: 'land' | 'sea' | 'none';
  /** Tiles in the start's connected landmass (diagnostic). */
  landmassTiles: number;
  /** Whether a city on the start can build ships (diagnostic). */
  coastal: boolean;
}

export interface StartViabilityIndex {
  assess(coord: HexCoord): StartViability;
  isViable(coord: HexCoord): boolean;
  /**
   * Legal second-city sites reachable on foot from `coord`: tiles on its
   * landmass where a city may stand at >= `MIN_CITY_CENTER_DISTANCE`. O(sites):
   * for diagnostics and tests, never for the placement hot path.
   */
  countLandExpansionSites(coord: HexCoord): number;
}

/**
 * The slice of `GameMap` this module reads. Structural on purpose: it keeps the
 * module off the shrink-only `@/core/types` barrel (#1361) -- a real `GameMap`
 * is assignable.
 */
export interface StartViabilityMap {
  width: number;
  height: number;
  wrapsHorizontally?: boolean;
  tiles: Record<string, { coord: HexCoord; terrain: string }>;
}

/** Hexes within `MIN_CITY_CENTER_DISTANCE - 1` of a start: 1 + 3r(r+1) = 37 for r = 3. */
const EXCLUDED_NEIGHBORHOOD = 1 + 3 * (MIN_CITY_CENTER_DISTANCE - 1) * MIN_CITY_CENTER_DISTANCE;

// Axial neighbor offsets, same order as hex-utils DIRECTIONS.
const DQ = [1, 1, 0, -1, -1, 0];
const DR = [0, -1, -1, 0, 1, 1];

const MISSING = 0;
const WATER = 1;
const LAND = 2; // walkable, but no city centre (mountain)
const LAND_SITE = 3; // walkable and a legal city centre

function axialDistance(dq: number, dr: number): number {
  return (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
}

export function createStartViabilityIndex(map: StartViabilityMap): StartViabilityIndex {
  const { width, height } = map;
  const total = width * height;
  const wraps = map.wrapsHorizontally === true;

  const kind = new Uint8Array(total);
  for (const tile of Object.values(map.tiles)) {
    const { q, r } = tile.coord;
    if (q < 0 || q >= width || r < 0 || r >= height) continue;
    kind[r * width + q] = tile.terrain === 'ocean' || tile.terrain === 'coast'
      ? WATER
      : isCityCenterTerrain(tile.terrain as Parameters<typeof isCityCenterTerrain>[0])
        ? LAND_SITE
        : LAND;
  }

  // Neighbor table (-1 = off map). Wrapping folds q across the seam, exactly as
  // `getWrappedHexNeighbors` does.
  const neighbor = new Int32Array(total * 6).fill(-1);
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      const base = (r * width + q) * 6;
      for (let d = 0; d < 6; d++) {
        const nr = r + DR[d];
        if (nr < 0 || nr >= height) continue;
        let nq = q + DQ[d];
        if (nq < 0 || nq >= width) {
          if (!wraps) continue;
          nq = ((nq % width) + width) % width;
        }
        neighbor[base + d] = nr * width + nq;
      }
    }
  }

  const landLabel = new Int32Array(total).fill(-1);
  const waterLabel = new Int32Array(total).fill(-1);
  const stack = new Int32Array(total);
  const landMembers: number[][] = [];
  let waterCount = 0;

  for (let start = 0; start < total; start++) {
    const k = kind[start];
    if (k === MISSING) continue;
    const isWaterKind = k === WATER;
    const labels = isWaterKind ? waterLabel : landLabel;
    if (labels[start] !== -1) continue;
    const id = isWaterKind ? waterCount++ : landMembers.length;
    const members: number[] = [];
    let top = 0;
    stack[top++] = start;
    labels[start] = id;
    while (top > 0) {
      const current = stack[--top];
      members.push(current);
      for (let d = 0; d < 6; d++) {
        const next = neighbor[current * 6 + d];
        if (next < 0 || labels[next] !== -1) continue;
        if ((kind[next] === WATER) !== isWaterKind || kind[next] === MISSING) continue;
        labels[next] = id;
        stack[top++] = next;
      }
    }
    if (!isWaterKind) landMembers.push(members);
  }

  const legalSites: number[][] = landMembers.map(members => members.filter(i => kind[i] === LAND_SITE));

  // For each body of water: the landmasses with a legal site that touch it.
  const landsTouchingWater: Array<Set<number> | undefined> = new Array(waterCount);
  landMembers.forEach((members, landId) => {
    if (legalSites[landId].length === 0) return;
    for (const tileIndex of members) {
      for (let d = 0; d < 6; d++) {
        const next = neighbor[tileIndex * 6 + d];
        if (next < 0) continue;
        const water = waterLabel[next];
        if (water < 0) continue;
        (landsTouchingWater[water] ??= new Set<number>()).add(landId);
      }
    }
  });

  // Same metric as `cityDistance`: wrap-aware iff the map wraps.
  const distance = (a: number, b: number): number => {
    const dq = (b % width) - (a % width);
    const dr = Math.floor(b / width) - Math.floor(a / width);
    const direct = axialDistance(dq, dr);
    if (!wraps) return direct;
    return Math.min(direct, axialDistance(dq - width, dr), axialDistance(dq + width, dr));
  };

  const hasSiteFor = (start: number, landId: number): boolean => {
    const sites = legalSites[landId];
    // More legal sites than fit inside the excluded neighborhood guarantees one outside it.
    if (sites.length > EXCLUDED_NEIGHBORHOOD) return true;
    return sites.some(site => distance(start, site) >= MIN_CITY_CENTER_DISTANCE);
  };

  const none = (landmassTiles: number, coastal: boolean): StartViability =>
    ({ viable: false, route: 'none', landmassTiles, coastal });

  const assess = (coord: HexCoord): StartViability => {
    const { q, r } = coord;
    if (q < 0 || q >= width || r < 0 || r >= height) return none(0, false);
    const start = r * width + q;
    const landId = landLabel[start];
    if (landId < 0) return none(0, false);
    const landmassTiles = landMembers[landId].length;

    const adjacentWater: number[] = [];
    for (let d = 0; d < 6; d++) {
      const next = neighbor[start * 6 + d];
      if (next < 0) continue;
      const water = waterLabel[next];
      if (water >= 0 && !adjacentWater.includes(water)) adjacentWater.push(water);
    }
    const coastal = adjacentWater.length > 0;

    if (hasSiteFor(start, landId)) {
      return { viable: true, route: 'land', landmassTiles, coastal };
    }
    for (const water of adjacentWater) {
      for (const otherLand of landsTouchingWater[water] ?? []) {
        if (otherLand !== landId && hasSiteFor(start, otherLand)) {
          return { viable: true, route: 'sea', landmassTiles, coastal };
        }
      }
    }
    return none(landmassTiles, coastal);
  };

  const countLandExpansionSites = (coord: HexCoord): number => {
    const { q, r } = coord;
    if (q < 0 || q >= width || r < 0 || r >= height) return 0;
    const start = r * width + q;
    const landId = landLabel[start];
    if (landId < 0) return 0;
    return legalSites[landId].filter(site => distance(start, site) >= MIN_CITY_CENTER_DISTANCE).length;
  };

  return { assess, isViable: coord => assess(coord).viable, countLandExpansionSites };
}
