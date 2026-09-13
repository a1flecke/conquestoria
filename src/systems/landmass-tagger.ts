import type { GameMap, HexCoord, HexTile } from '@/core/types';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from './hex-utils';

const MIN_CONTINENT_TILES = 9;

/**
 * Return exact default-land connectivity when both tiles have canonical
 * landmass tags. Tags encode every non-wrapping land edge. A wrapping map can
 * additionally join tags only through its horizontal seam, which this small
 * tag graph accounts for. `undefined` means the map lacks complete tags, so a
 * caller must use its canonical pathfinding fallback instead.
 */
export function areTaggedLandmassesConnected(
  map: GameMap,
  from: HexCoord,
  to: HexCoord,
): boolean | undefined {
  const fromRegion = map.tiles[hexKey(from)]?.regionKey;
  const toRegion = map.tiles[hexKey(to)]?.regionKey;
  if (!fromRegion || !toRegion) return undefined;
  if (fromRegion === toRegion) return true;
  if (!map.wrapsHorizontally) return false;

  const seamConnections = new Map<string, Set<string>>();
  const connect = (left: string, right: string): void => {
    if (left === right) return;
    const leftConnections = seamConnections.get(left) ?? new Set<string>();
    leftConnections.add(right);
    seamConnections.set(left, leftConnections);
    const rightConnections = seamConnections.get(right) ?? new Set<string>();
    rightConnections.add(left);
    seamConnections.set(right, rightConnections);
  };
  for (const tile of Object.values(map.tiles)) {
    if (tile.coord.q !== 0 && tile.coord.q !== map.width - 1) continue;
    if (!tile.regionKey) continue;
    for (const neighbor of getWrappedHexNeighbors(tile.coord, map.width)) {
      if (neighbor.q !== 0 && neighbor.q !== map.width - 1) continue;
      const neighborRegion = map.tiles[hexKey(neighbor)]?.regionKey;
      if (neighborRegion) connect(tile.regionKey, neighborRegion);
    }
  }

  const visited = new Set([fromRegion]);
  const pending = [fromRegion];
  while (pending.length > 0) {
    const region = pending.pop()!;
    for (const neighbor of seamConnections.get(region) ?? []) {
      if (neighbor === toRegion) return true;
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        pending.push(neighbor);
      }
    }
  }
  return false;
}

export function tagLandmassRegions(map: GameMap): Record<string, HexTile> {
  const tiles = { ...map.tiles };
  const visited = new Set<string>();
  const components: string[][] = [];

  for (const key of Object.keys(tiles)) {
    const tile = tiles[key];
    if (visited.has(key)) continue;
    if (tile.terrain === 'ocean' || tile.terrain === 'coast') continue;

    // BFS flood-fill
    const component: string[] = [];
    const queue: string[] = [key];
    visited.add(key);
    while (queue.length > 0) {
      const cur = queue.shift()!;
      component.push(cur);
      const [q, r] = cur.split(',').map(Number);
      for (const nb of hexNeighbors({ q, r })) {
        const nbKey = hexKey(nb);
        if (visited.has(nbKey)) continue;
        const nbTile = tiles[nbKey];
        if (!nbTile) continue;
        if (nbTile.terrain === 'ocean' || nbTile.terrain === 'coast') continue;
        visited.add(nbKey);
        queue.push(nbKey);
      }
    }
    components.push(component);
  }

  // Sort largest first
  components.sort((a, b) => b.length - a.length);

  let continentIdx = 0;
  let islandIdx = 0;
  for (const component of components) {
    const id = component.length >= MIN_CONTINENT_TILES
      ? `continent-${continentIdx++}`
      : `island-${islandIdx++}`;
    for (const key of component) {
      tiles[key] = { ...tiles[key], regionKey: id };
    }
  }

  return tiles;
}
