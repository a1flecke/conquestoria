import type { VisibilityMap, VisibilityState, HexCoord, Unit, GameMap } from '@/core/types';
import { hexKey, hexesInRange } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { getWonderVisionBonus } from './wonder-system';

export function createVisibilityMap(): VisibilityMap {
  return { tiles: {} };
}

export function getVisibility(vis: VisibilityMap, coord: HexCoord): VisibilityState {
  return vis.tiles[hexKey(coord)] ?? 'unexplored';
}

export function isVisible(vis: VisibilityMap, coord: HexCoord): boolean {
  return getVisibility(vis, coord) === 'visible';
}

export function isFog(vis: VisibilityMap, coord: HexCoord): boolean {
  return getVisibility(vis, coord) === 'fog';
}

export function isUnexplored(vis: VisibilityMap, coord: HexCoord): boolean {
  return getVisibility(vis, coord) === 'unexplored';
}

/**
 * Recalculates visibility for a player based on their units and cities.
 * Returns newly revealed tiles (were unexplored, now visible).
 */
export function updateVisibility(
  vis: VisibilityMap,
  units: Unit[],
  map: GameMap,
  cityPositions: HexCoord[] = [],
): HexCoord[] {
  // Downgrade all 'visible' to 'fog'
  for (const key of Object.keys(vis.tiles)) {
    if (vis.tiles[key] === 'visible') {
      vis.tiles[key] = 'fog';
    }
  }

  const newlyRevealed: HexCoord[] = [];

  const revealTile = (coord: HexCoord) => {
    const key = hexKey(coord);
    if (!map.tiles[key]) return; // off map

    const prev = vis.tiles[key];
    vis.tiles[key] = 'visible';
    if (!prev || prev === 'unexplored') {
      newlyRevealed.push(coord);
    }
  };

  // Reveal around each unit
  for (const unit of units) {
    const def = UNIT_DEFINITIONS[unit.type];
    const visionRange = def.visionRange;

    // Check if unit is on elevated terrain for bonus
    const unitTile = map.tiles[hexKey(unit.position)];
    const bonus = unitTile ? getTerrainVisionBonus(unitTile.terrain) : 0;
    const wonderBonus = unitTile?.wonder ? getWonderVisionBonus(unitTile.wonder) : 0;

    const visible = hexesInRange(unit.position, visionRange + bonus + wonderBonus);
    for (const coord of visible) {
      revealTile(coord);
    }
  }

  // Reveal around each city (vision range 2)
  for (const cityPos of cityPositions) {
    const visible = hexesInRange(cityPos, 2);
    for (const coord of visible) {
      revealTile(coord);
    }
  }

  return newlyRevealed;
}

export function getTerrainVisionBonus(terrain: string): number {
  if (terrain === 'hills') return 1;
  if (terrain === 'jungle') return -1;
  return 0;
}
