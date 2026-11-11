import type { HexCoord } from '@/core/types/hex';
import { getWrappedHexesInRange, hexKey, hexesInRange } from '@/systems/hex-utils';
import { TERRAIN_YIELDS } from '@/systems/terrain-yields';

/**
 * Minimum start fertility (#1692 E).
 *
 * `start-viability.ts` promises a start is not *trapped*. It says nothing about food, and measurement showed about
 * one start in ten (small `balanced` and `procedural` maps) with almost no farmland while the typical neighbour had
 * nine or more fertile tiles: a desert city centre with nothing to grow on. That is not a hard start, it is a lost
 * one, decided before the first turn.
 *
 * The floor is deliberately low and about food only: the SIX best tiles within two hexes of the start (what a young
 * city can actually work) must yield at least `MIN_START_FOOD` food between them, from base terrain alone. Three
 * grassland or coast tiles plus three plains, forest or tundra tiles pass; a ring of desert, snow, hills or mountain
 * does not. It promises nothing about production, resources, rivers or equality between starts.
 */
/** Structural, so this leaf does not join the importers of the core type barrel. */
export interface FertilityMap {
  width: number;
  wrapsHorizontally?: boolean;
  tiles: Record<string, { terrain: string } | undefined>;
}

export const START_FERTILITY_RADIUS = 2;
export const START_FERTILITY_TILES = 6;
export const MIN_START_FOOD = 9;

/** Food from the best `START_FERTILITY_TILES` tiles around a start, by base terrain yield. */
export function getStartFood(map: FertilityMap, coord: HexCoord): number {
  const neighborhood = map.wrapsHorizontally
    ? getWrappedHexesInRange(coord, START_FERTILITY_RADIUS, map.width)
    : hexesInRange(coord, START_FERTILITY_RADIUS);
  const centerKey = hexKey(coord);
  const foods: number[] = [];
  for (const nearby of neighborhood) {
    const key = hexKey(nearby);
    if (key === centerKey) continue;
    const tile = map.tiles[key];
    if (!tile) continue;
    foods.push(TERRAIN_YIELDS[tile.terrain]?.food ?? 0);
  }
  return foods.sort((a, b) => b - a).slice(0, START_FERTILITY_TILES).reduce((sum, food) => sum + food, 0);
}

export function isFertileStart(map: FertilityMap, coord: HexCoord): boolean {
  return getStartFood(map, coord) >= MIN_START_FOOD;
}
