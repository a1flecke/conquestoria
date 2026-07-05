import type { VisibilityMap, VisibilityState, HexCoord, Unit, GameMap, GameState } from '@/core/types';
import { hexKey, hexesInRange, hexDistance, getWrappedHexesInRange, wrapHexCoord, wrappedHexDistance, hexNeighbors, getWrappedHexNeighbors } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';
import { getWonderVisionBonus } from './wonder-system';
import { resolveCivDefinition } from './civ-registry';

export function createVisibilityMap(): VisibilityMap {
  return { tiles: {}, lastSeen: {} };
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

function getVisibilityRange(center: HexCoord, range: number, map?: GameMap): HexCoord[] {
  if (map?.wrapsHorizontally) {
    return getWrappedHexesInRange(center, range, map.width);
  }
  return hexesInRange(center, range);
}

function canonicalVisibilityCoord(coord: HexCoord, map?: GameMap): HexCoord {
  return map?.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
}

function visibilityDistance(a: HexCoord, b: HexCoord, map: GameMap): number {
  return map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);
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
  getVisionBonus?: (unit: Unit) => number,
): HexCoord[] {
  // Downgrade all 'visible' to 'fog'
  for (const key of Object.keys(vis.tiles)) {
    if (vis.tiles[key] === 'visible') {
      vis.tiles[key] = 'fog';
    }
  }

  const newlyRevealed: HexCoord[] = [];

  const revealTile = (coord: HexCoord) => {
    const canonical = canonicalVisibilityCoord(coord, map);
    const key = hexKey(canonical);
    if (!map.tiles[key]) return; // off map

    const prev = vis.tiles[key];
    vis.tiles[key] = 'visible';
    if (!prev || prev === 'unexplored') {
      newlyRevealed.push(canonical);
    }
  };

  // Reveal around each unit
  for (const unit of units) {
    const def = UNIT_DEFINITIONS[unit.type];
    const visionRange = def.visionRange;

    // Check if unit is on elevated terrain for bonus
    const unitPosition = canonicalVisibilityCoord(unit.position, map);
    const unitTile = map.tiles[hexKey(unitPosition)];
    const bonus = unitTile ? getTerrainVisionBonus(unitTile.terrain) : 0;
    const wonderBonus = unitTile?.wonder ? getWonderVisionBonus(unitTile.wonder) : 0;
    const techBonus = getVisionBonus ? getVisionBonus(unit) : 0;

    const visible = getVisibilityRange(unitPosition, visionRange + bonus + wonderBonus + techBonus, map);
    for (const coord of visible) {
      revealTile(coord);
    }
  }

  // Reveal around each city (vision range 2)
  for (const cityPos of cityPositions) {
    const visible = getVisibilityRange(canonicalVisibilityCoord(cityPos, map), 2, map);
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

function landReachableFromCity(
  cityCoord: HexCoord,
  radius: number,
  mapTiles: GameMap['tiles'],
  map: GameMap,
): Set<string> {
  const startKey = hexKey(cityCoord);
  const reachable = new Set<string>([startKey]);
  const visited = new Set<string>([startKey]);
  const queue: Array<{ coord: HexCoord; steps: number }> = [{ coord: cityCoord, steps: 0 }];
  while (queue.length > 0) {
    const { coord, steps } = queue.shift()!;
    if (steps >= radius) continue;
    const neighbors = map.wrapsHorizontally
      ? getWrappedHexNeighbors(coord, map.width)
      : hexNeighbors(coord);
    for (const neighbor of neighbors) {
      const k = hexKey(neighbor);
      if (visited.has(k)) continue;
      visited.add(k);
      const tile = mapTiles[k];
      if (!tile) continue;
      if (tile.terrain === 'ocean' || tile.terrain === 'coast') continue;
      reachable.add(k);
      queue.push({ coord: neighbor, steps: steps + 1 });
    }
  }
  return reachable;
}

export function revealMinorCivCities(
  vis: VisibilityMap,
  mcCityPositions: HexCoord[],
  map?: GameMap,
): void {
  for (const cityPos of mcCityPositions) {
    const cityCoord = map ? canonicalVisibilityCoord(cityPos, map) : cityPos;
    const key = hexKey(cityCoord);
    if (vis.tiles[key] === 'visible') continue;

    let anyExplored: boolean;
    if (map) {
      const reachable = landReachableFromCity(cityCoord, 2, map.tiles, map);
      anyExplored = [...reachable].some(k => vis.tiles[k] === 'fog' || vis.tiles[k] === 'visible');
    } else {
      const nearby = getVisibilityRange(cityCoord, 2, map);
      anyExplored = nearby.some(h => {
        const k = hexKey(h);
        return vis.tiles[k] === 'fog' || vis.tiles[k] === 'visible';
      });
    }

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
    const range = getVisibilityRange(canonicalVisibilityCoord(pos, map), 2, map);
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

  const unitPosition = canonicalVisibilityCoord(unit.position, state.map);
  const tile = state.map.tiles[hexKey(unitPosition)];
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
    .some(viewerUnit => visibilityDistance(
      canonicalVisibilityCoord(viewerUnit!.position, state.map),
      unitPosition,
      state.map,
    ) <= 1);
  if (hasAdjacentUnit) {
    return false;
  }

  const hasAdjacentCity = viewer.cities
    .map(cityId => state.cities[cityId])
    .filter(Boolean)
    .some(city => visibilityDistance(
      canonicalVisibilityCoord(city!.position, state.map),
      unitPosition,
      state.map,
    ) <= 1);
  return !hasAdjacentCity;
}
