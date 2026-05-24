import type { HexTile, HexCoord, GameMap } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

const INVALID_START_TERRAINS = new Set([
  'ocean', 'coast', 'mountain', 'snow', 'volcanic',
] as const satisfies ReadonlyArray<HexTile['terrain']>);

const UNWORKABLE_TERRAINS = new Set([
  'ocean', 'mountain', 'volcanic', 'desert', 'snow',
] as const satisfies ReadonlyArray<HexTile['terrain']>);

/**
 * Returns true if the tile is a valid city founding / starting location.
 * Matches the isLandTerrain exclusion list used by map-generator.ts, extended
 * to also reject volcanic (lava field — unlivable).
 */
export function isValidStartTile(tile: HexTile | undefined): boolean {
  if (!tile) return false;
  return !INVALID_START_TERRAINS.has(tile.terrain as never);
}

/**
 * Returns true if at least `minWorkable` of the 6 axial neighbors are
 * workable tiles (i.e. not ocean, mountain, volcanic, desert, or snow).
 */
export function hasWorkableSurroundings(
  coord: HexCoord,
  mapTiles: GameMap['tiles'],
  minWorkable = 2,
): boolean {
  const neighbors = hexNeighbors(coord);
  const workableCount = neighbors.filter(n => {
    const t = mapTiles[hexKey(n)];
    return t && !UNWORKABLE_TERRAINS.has(t.terrain as never);
  }).length;
  return workableCount >= minWorkable;
}

/**
 * BFS outward from `coord`; returns the first tile that passes both
 * isValidStartTile and hasWorkableSurroundings.  Falls back to the
 * original coord if the entire reachable graph is exhausted (should
 * never happen on a real map).
 */
export function findNearestValidStart(
  coord: HexCoord,
  mapTiles: GameMap['tiles'],
): HexCoord {
  const visited = new Set<string>();
  const queue: HexCoord[] = [coord];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const key = hexKey(current);
    if (visited.has(key)) continue;
    visited.add(key);

    const tile = mapTiles[key];
    if (isValidStartTile(tile) && hasWorkableSurroundings(current, mapTiles)) {
      return current;
    }
    for (const n of hexNeighbors(current)) {
      const nKey = hexKey(n);
      // Only explore tiles that exist in the map; off-map coords have no tile entry.
      if (!visited.has(nKey) && mapTiles[nKey] !== undefined) queue.push(n);
    }
  }

  return coord; // fallback — should not happen on a real map
}
