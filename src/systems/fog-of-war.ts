import type { VisibilityMap, VisibilityState, HexCoord, Unit, GameMap, GameState } from '@/core/types';
import { hexKey, hexesInRange, hexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { getWonderVisionBonus } from './wonder-system';
import { resolveCivDefinition } from './civ-registry';

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

export function revealMinorCivCities(
  vis: VisibilityMap,
  mcCityPositions: HexCoord[],
): void {
  for (const cityPos of mcCityPositions) {
    const key = hexKey(cityPos);
    if (vis.tiles[key] === 'visible') continue;

    const nearby = hexesInRange(cityPos, 2);
    const anyExplored = nearby.some(h => {
      const k = hexKey(h);
      return vis.tiles[k] === 'fog' || vis.tiles[k] === 'visible';
    });

    if (anyExplored) {
      vis.tiles[key] = 'visible';
    }
  }
}

export function applySharedVision(
  vis: VisibilityMap,
  positions: HexCoord[],
  map: GameMap,
): void {
  for (const pos of positions) {
    const range = hexesInRange(pos, 2);
    for (const hex of range) {
      const key = hexKey(hex);
      if (map.tiles[key]) {
        vis.tiles[key] = 'visible';
      }
    }
  }
}

export function applySatelliteSurveillance(
  state: GameState,
  viewerCivId: string,
  targetCivId: string,
): GameState {
  const nextState = structuredClone(state);
  const visibility = nextState.civilizations[viewerCivId]?.visibility;
  if (!visibility) return nextState;

  for (const [key, tile] of Object.entries(nextState.map.tiles)) {
    if (tile.owner === targetCivId) {
      visibility.tiles[key] = 'visible';
    }
  }

  return nextState;
}

export function isForestConcealedUnit(
  state: GameState,
  viewerCivId: string,
  unit: Unit,
): boolean {
  if (unit.owner === viewerCivId) {
    return false;
  }

  const ownerBonus = resolveCivDefinition(state, state.civilizations[unit.owner]?.civType ?? '')?.bonusEffect;
  if (ownerBonus?.type !== 'forest_guardians' || !ownerBonus.concealmentInForest) {
    return false;
  }

  const tile = state.map.tiles[hexKey(unit.position)];
  if (tile?.terrain !== 'forest') {
    return false;
  }

  const viewer = state.civilizations[viewerCivId];
  if (!viewer) {
    return false;
  }

  const hasAdjacentUnit = viewer.units
    .map(unitId => state.units[unitId])
    .filter(Boolean)
    .some(viewerUnit => hexDistance(viewerUnit!.position, unit.position) <= 1);
  if (hasAdjacentUnit) {
    return false;
  }

  const hasAdjacentCity = viewer.cities
    .map(cityId => state.cities[cityId])
    .filter(Boolean)
    .some(city => hexDistance(city!.position, unit.position) <= 1);
  return !hasAdjacentCity;
}
