import type { GameMap, HexTile } from '@/core/types';
import { hexKey, hexNeighbors } from './hex-utils';

const MIN_CONTINENT_TILES = 9;

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
