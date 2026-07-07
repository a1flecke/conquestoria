import type { GameState, HexCoord } from '@/core/types';
import { hexKey, hexNeighbors, getWrappedHexNeighbors } from './hex-utils';
import { getCapitalCityId } from './capital-system';
import { canBuildRoad } from './road-system';
import { findPath } from './unit-system';
import { getWorkerChargesRemaining } from './worker-action-system';

/**
 * Cities (other than the capital itself) reachable from the capital by walking
 * only road tiles or the civ's own city tiles. Pure/memoizable per turn.
 */
export function getCitiesConnectedToCapital(state: GameState, civId: string): Set<string> {
  const connected = new Set<string>();
  const capitalId = getCapitalCityId(state, civId);
  if (!capitalId) return connected;
  const capital = state.cities[capitalId];
  if (!capital) return connected;

  const ownCityIdByTileKey = new Map<string, string>();
  for (const cityId of state.civilizations[civId]?.cities ?? []) {
    if (cityId === capitalId) continue;
    const city = state.cities[cityId];
    if (city) ownCityIdByTileKey.set(hexKey(city.position), cityId);
  }

  const startKey = hexKey(capital.position);
  const visited = new Set<string>([startKey]);
  const queue: HexCoord[] = [capital.position];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = state.map.wrapsHorizontally
      ? getWrappedHexNeighbors(current, state.map.width)
      : hexNeighbors(current);

    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      if (visited.has(key)) continue;
      const tile = state.map.tiles[key];
      if (!tile) continue;
      const cityIdHere = ownCityIdByTileKey.get(key);
      if (!tile.hasRoad && !cityIdHere) continue;
      visited.add(key);
      queue.push(neighbor);
      if (cityIdHere) connected.add(cityIdHere);
    }
  }

  return connected;
}

/**
 * Whether a road tile should render with rail visuals: it must have a road,
 * be owned, and that owner must have completed Railway Expansion. Purely
 * presentational — no gameplay effect. Used identically by live-tile
 * resolution (`tile-presentation.ts`) and last-seen snapshot capture
 * (`last-seen-presentation.ts`) so fog/last-seen tiles freeze rail status at
 * observation time instead of re-deriving the rival's current tech state.
 */
export function resolveTileHasRail(
  hasRoad: boolean,
  owner: string | null,
  ownerCompletedTechs: string[] | undefined,
): boolean {
  return hasRoad && owner != null && (ownerCompletedTechs ?? []).includes('railway-expansion');
}

export function getOwnedRoadTileCount(state: GameState, civId: string): number {
  let count = 0;
  for (const tile of Object.values(state.map.tiles)) {
    if (tile.hasRoad && tile.owner === civId) count += 1;
  }
  return count;
}

/**
 * Deterministic AI road-building target: the first tile lacking a road along
 * the shortest land path between the capital and the nearest disconnected
 * owned city. Returns null if the civ has no road tech or is fully connected.
 */
export function getRoadBuildTarget(state: GameState, civId: string): HexCoord | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const completedTechs = civ.techState.completed;
  if (!completedTechs.includes('road-building')) return null;

  const capitalId = getCapitalCityId(state, civId);
  if (!capitalId) return null;
  const capital = state.cities[capitalId];
  if (!capital) return null;

  const connected = getCitiesConnectedToCapital(state, civId);
  const cityKeys = new Set(
    Object.values(state.cities)
      .filter(city => city.owner === civId)
      .map(city => hexKey(city.position)),
  );

  const candidateCityIds = civ.cities
    .filter(cityId => cityId !== capitalId && !connected.has(cityId))
    .sort((left, right) => left.localeCompare(right));

  for (const cityId of candidateCityIds) {
    const city = state.cities[cityId];
    if (!city) continue;
    const path = findPath(capital.position, city.position, state.map, 'land', { completedTechs });
    if (!path) continue;

    for (const coord of path) {
      const key = hexKey(coord);
      if (cityKeys.has(key)) continue;
      const tile = state.map.tiles[key];
      if (!canBuildRoad(tile, completedTechs, civId, false)) continue;
      return coord;
    }
  }

  return null;
}

/**
 * Picks at most one idle worker per civ per turn to build the next road link
 * toward a disconnected city — keeps AI road-building simple and deterministic.
 */
export function chooseRoadBuilderUnit(
  state: GameState,
  civId: string,
): { workerId: string; targetCoord: HexCoord } | null {
  const target = getRoadBuildTarget(state, civId);
  if (!target) return null;

  const distanceToTarget = (coord: HexCoord): number => {
    const path = findPath(coord, target, state.map, 'land');
    return path ? path.length : Infinity;
  };

  const workers = Object.values(state.units)
    .filter(unit =>
      unit.owner === civId
      && unit.type === 'worker'
      && !unit.hasActed
      && getWorkerChargesRemaining(unit) > 0)
    .sort((left, right) =>
      distanceToTarget(left.position) - distanceToTarget(right.position)
      || left.id.localeCompare(right.id));

  const worker = workers[0];
  return worker ? { workerId: worker.id, targetCoord: target } : null;
}
