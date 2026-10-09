import type { City, GameState, HexCoord } from '@/core/types';
import { hexKey, hexNeighbors, getWrappedHexNeighbors } from './hex-utils';
import { getCapitalCityId } from './capital-system';
import { canBuildRoad } from './road-system';
import { getMovementCostForUnit } from './unit-movement-cost';
import { findPath } from './unit-pathfinding';
import { getWorkerChargesRemaining } from './worker-action-system';
import { isWorkerBusy } from './unit-movement-system';
import { getDeniedTerritoryOwners } from './territorial-access';
import { getBlockingMapEntityKeys } from './unit-movement-legality';

export type CapitalRoadPolicy = 'any-road' | 'owned-road';

function isLandPassable(tile: GameState['map']['tiles'][string]): boolean {
  return tile !== undefined && getMovementCostForUnit(tile.terrain, 'land') !== Infinity;
}

/**
 * Cities (other than the capital itself) reachable from the capital by walking
 * only road tiles or the civ's own city tiles. Pure/memoizable per turn.
 */
export function getCitiesConnectedToCapital(
  state: GameState,
  civId: string,
  policy: CapitalRoadPolicy = 'any-road',
): Set<string> {
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
      const traversableRoad = tile.hasRoad
        && (policy === 'any-road' || (tile.owner === civId && isLandPassable(tile)));
      if (!traversableRoad && !cityIdHere) continue;
      visited.add(key);
      queue.push(neighbor);
      if (cityIdHere) connected.add(cityIdHere);
    }
  }

  return connected;
}

/**
 * Whether this city has a fully owned, land-based corridor to the capital that
 * could be completed using the current road-building rules. This is deliberately
 * stricter than generic road targeting: it prevents UI guidance from promising
 * a connection through water or foreign territory.
 */
function getOwnedRoadConnectionPath(
  state: GameState,
  civId: string,
  cityId: string,
): HexCoord[] | null {
  const civ = state.civilizations[civId];
  const capitalId = getCapitalCityId(state, civId);
  const capital = capitalId ? state.cities[capitalId] : undefined;
  const destination = state.cities[cityId];
  if (!civ || !capital || !destination || destination.owner !== civId
    || !civ.techState.completed.includes('road-building')) return null;

  const ownCityTileKeys = new Set(
    civ.cities
      .map(ownedCityId => state.cities[ownedCityId])
      .filter((city): city is City => city !== undefined && city.owner === civId)
      .map(city => hexKey(city.position)),
  );
  const destinationKey = hexKey(destination.position);
  const startKey = hexKey(capital.position);
  if (destinationKey === startKey) return [capital.position];
  const visited = new Set<string>([startKey]);
  const previousByTileKey = new Map<string, HexCoord>();
  const queue: HexCoord[] = [capital.position];

  while (queue.length > 0) {
    const current = queue.shift()!;
    const neighbors = state.map.wrapsHorizontally
      ? getWrappedHexNeighbors(current, state.map.width)
      : hexNeighbors(current);
    for (const neighbor of neighbors) {
      const key = hexKey(neighbor);
      if (visited.has(key)) continue;
      if (key === destinationKey) {
        previousByTileKey.set(key, current);
        const path: HexCoord[] = [destination.position];
        let step = destination.position;
        while (hexKey(step) !== startKey) {
          const previous = previousByTileKey.get(hexKey(step));
          if (!previous) return null;
          path.push(previous);
          step = previous;
        }
        return path.reverse();
      }
      const tile = state.map.tiles[key];
      const traversable = ownCityTileKeys.has(key)
        || (tile?.owner === civId && isLandPassable(tile)
          && (tile.hasRoad || canBuildRoad(tile, civ.techState.completed, civId)));
      if (!traversable) continue;
      visited.add(key);
      previousByTileKey.set(key, current);
      queue.push(neighbor);
    }
  }

  return null;
}

export function canConnectCityToCapitalByOwnedRoad(
  state: GameState,
  civId: string,
  cityId: string,
): boolean {
  return getOwnedRoadConnectionPath(state, civId, cityId) !== null;
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
 * owned city. After Military Logistics, that path is constrained to an owned,
 * land-based corridor so foreign infrastructure cannot satisfy the network.
 * Returns null if the civ has no road tech or is fully connected.
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

  const connected = getCitiesConnectedToCapital(
    state,
    civId,
    completedTechs.includes('military-logistics') ? 'owned-road' : 'any-road',
  );
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
    const path = completedTechs.includes('military-logistics')
      ? getOwnedRoadConnectionPath(state, civId, cityId)
      : findPath(capital.position, city.position, state.map, 'land', { completedTechs });
    if (!path) continue;

    for (const coord of path) {
      const key = hexKey(coord);
      if (cityKeys.has(key)) continue;
      const tile = state.map.tiles[key];
      if ((tile?.roadTurnsLeft ?? 0) > 0) continue;
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

  const workers = Object.values(state.units)
    .filter(unit =>
      unit.owner === civId
      && unit.type === 'worker'
      && !unit.hasActed
      && unit.movementPointsLeft > 0
      && !unit.transportId
      && !isWorkerBusy(state, unit.id)
      && getWorkerChargesRemaining(unit) > 0)
    .map(worker => {
      const blockedHexKeys = getBlockingMapEntityKeys(state, worker);
      for (const unit of Object.values(state.units)) {
        if (!unit.transportId && unit.owner !== worker.owner) blockedHexKeys.add(hexKey(unit.position));
      }
      const path = findPath(worker.position, target, state.map, 'land', {
        unit: worker, completedTechs: state.civilizations[civId]?.techState.completed ?? [],
        deniedOwnerIds: getDeniedTerritoryOwners(state, worker),
        blockedHexKeys,
      });
      return { worker, length: path && !blockedHexKeys.has(hexKey(target)) ? path.length : Infinity };
    })
    .filter(candidate => Number.isFinite(candidate.length))
    .sort((left, right) =>
      left.length - right.length || left.worker.id.localeCompare(right.worker.id));

  const worker = workers[0]?.worker;
  return worker ? { workerId: worker.id, targetCoord: target } : null;
}
