import type { EventBus } from '@/core/event-bus';
import type { GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { foundCityInState } from '@/systems/city-founding-system';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { getUnloadDestinations, unloadUnitFromTransport } from '@/systems/transport-system';
import { findPath } from '@/systems/unit-system';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';

function sameCoord(left: HexCoord, right: HexCoord): boolean {
  return left.q === right.q && left.r === right.r;
}

function isFoundingTerrain(terrain: string): boolean {
  return terrain !== 'ocean' && terrain !== 'coast' && terrain !== 'mountain';
}

function planningMap(state: GameState, civId: string, settler: Unit): GameMap {
  const visibility = state.civilizations[civId].visibility;
  const tiles = Object.fromEntries(Object.entries(state.map.tiles).filter(([key, tile]) =>
    key === hexKey(settler.position) || getVisibility(visibility, tile.coord) === 'visible'));
  return { ...state.map, tiles };
}

function visibleFoundingSites(state: GameState, civId: string, settler: Unit): HexCoord[] {
  const map = planningMap(state, civId, settler);
  return Object.values(map.tiles)
    .filter(tile => isFoundingTerrain(tile.terrain) && !sameCoord(tile.coord, settler.position))
    .map(tile => tile.coord)
    .sort((left, right) => hexKey(left).localeCompare(hexKey(right)));
}

function processEmbarkedSettler(state: GameState, civId: string, settler: Unit): GameState {
  if (!settler.transportId) return state;
  const visibility = state.civilizations[civId].visibility;
  const destinations = getUnloadDestinations(state, settler.transportId, settler.id)
    .filter(destination => getVisibility(visibility, destination) === 'visible')
    .sort((left, right) => hexKey(left).localeCompare(hexKey(right)));
  const destination = destinations.find(candidate => canFoundCityAt(state, candidate))
    ?? destinations[0];
  if (!destination) return state;
  const unloaded = unloadUnitFromTransport(state, settler.transportId, settler.id, destination);
  return unloaded.ok ? unloaded.state : state;
}

/**
 * Gives a cityless AI one fog-bounded rebuilding action before its regular
 * strategic plan. It reads only currently visible terrain to select routes;
 * canonical founding, unloading, and movement helpers still validate the
 * real state when the action executes.
 */
export function processAIResettlement(
  state: GameState,
  civId: string,
  bus: EventBus,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman || getCivilizationLiveness(state, civId).reason !== 'settler') {
    return state;
  }

  const settlers = Object.values(state.units)
    .filter(unit => unit.owner === civId && unit.type === 'settler')
    .sort((left, right) => left.id.localeCompare(right.id));
  const settler = settlers[0];
  if (!settler || settler.hasActed || settler.movementPointsLeft <= 0) return state;

  if (settler.transportId) return processEmbarkedSettler(state, civId, settler);
  if (canFoundCityAt(state, settler.position)) {
    return foundCityInState(state, settler.id, bus).state;
  }

  const map = planningMap(state, civId, settler);
  const path = visibleFoundingSites(state, civId, settler)
    .map(destination => ({ destination, path: findPath(
      settler.position,
      destination,
      map,
      'land',
      { unit: settler, completedTechs: civ.techState.completed },
    ) }))
    .filter((candidate): candidate is { destination: HexCoord; path: HexCoord[] } =>
      candidate.path !== null && candidate.path.length > 1)
    .sort((left, right) => left.path.length - right.path.length
      || hexKey(left.destination).localeCompare(hexKey(right.destination)))[0];
  if (!path) return state;

  const next = structuredClone(state);
  const movement = executeUnitMove(next, settler.id, path.path[1], { actor: 'ai', civId, bus });
  if (!movement.ok) return state;
  const movedSettler = next.units[settler.id];
  if (movedSettler && !movedSettler.hasActed && movedSettler.movementPointsLeft > 0 && canFoundCityAt(next, movedSettler.position)) {
    return foundCityInState(next, movedSettler.id, bus).state;
  }
  return next;
}
