/**
 * #1066 -- see docs/superpowers/specs/2026-09-13-issue-1066-amphibious-objective-routing-design.md
 * for the full design rationale (this is an application of Hierarchical
 * Pathfinding A*'s cluster/portal abstraction, reusing this codebase's
 * existing `tile.regionKey` landmass partition as the cluster layer).
 */
import type { GameMap, HexCoord } from '@/core/types';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { getMovementCostForUnit } from '@/systems/unit-movement-cost';

export interface RegionCrossing {
  targetRegionKey: string;
  /** Tile on the origin's own landmass where the unit would embark. */
  embarkTile: HexCoord;
  /** Tile on the target's landmass where the unit would disembark. */
  disembarkTile: HexCoord;
  /** Naval-domain tile distance from embarkTile's adjacent water to disembarkTile's adjacent water. */
  navalDistance: number;
}

function isNavalPassable(terrain: string): boolean {
  return getMovementCostForUnit(terrain, 'naval') !== Infinity;
}

function neighborsOf(map: GameMap, coord: HexCoord): HexCoord[] {
  return map.wrapsHorizontally ? getWrappedHexNeighbors(coord, map.width) : hexNeighbors(coord);
}

interface QueueEntry {
  coord: HexCoord;
  embarkTile: HexCoord;
  distance: number;
}

/**
 * From every coastal tile belonging to `originRegionKeys`, BFS outward across
 * naval-passable tiles only, recording the FIRST (shortest) crossing into
 * each OTHER region encountered. Deterministic: seeds and frontier
 * expansions are both processed in `hexKey` sort order, so the result never
 * depends on `map.tiles`' object key iteration order.
 */
export function findRegionCrossings(
  map: GameMap,
  originRegionKeys: ReadonlySet<string>,
): Map<string, RegionCrossing> {
  const crossings = new Map<string, RegionCrossing>();
  if (originRegionKeys.size === 0) return crossings;

  const visited = new Set<string>();
  const queue: QueueEntry[] = [];

  const seedKeys = Object.keys(map.tiles)
    .filter(key => {
      const regionKey = map.tiles[key]!.regionKey;
      return regionKey !== undefined && originRegionKeys.has(regionKey);
    })
    .sort();

  for (const key of seedKeys) {
    const landCoord = map.tiles[key]!.coord;
    const waterNeighbors = neighborsOf(map, landCoord)
      .filter(neighbor => {
        const neighborTile = map.tiles[hexKey(neighbor)];
        return neighborTile !== undefined && isNavalPassable(neighborTile.terrain);
      })
      .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
    for (const water of waterNeighbors) {
      const waterKey = hexKey(water);
      if (visited.has(waterKey)) continue;
      visited.add(waterKey);
      queue.push({ coord: water, embarkTile: landCoord, distance: 1 });
    }
  }

  let head = 0;
  while (head < queue.length) {
    const current = queue[head]!;
    head += 1;

    const neighbors = neighborsOf(map, current.coord)
      .sort((a, b) => hexKey(a).localeCompare(hexKey(b)));
    for (const neighbor of neighbors) {
      const neighborKey = hexKey(neighbor);
      const neighborTile = map.tiles[neighborKey];
      if (!neighborTile) continue;

      if (isNavalPassable(neighborTile.terrain)) {
        if (visited.has(neighborKey)) continue;
        visited.add(neighborKey);
        queue.push({ coord: neighbor, embarkTile: current.embarkTile, distance: current.distance + 1 });
        continue;
      }

      const targetRegionKey = neighborTile.regionKey;
      if (!targetRegionKey || originRegionKeys.has(targetRegionKey)) continue;
      if (crossings.has(targetRegionKey)) continue;

      crossings.set(targetRegionKey, {
        targetRegionKey,
        embarkTile: current.embarkTile,
        disembarkTile: neighbor,
        navalDistance: current.distance,
      });
    }
  }

  return crossings;
}
