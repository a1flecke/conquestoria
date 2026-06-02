import type { GameState, HexCoord, WorkerActionType } from '@/core/types';
import type { HexHighlight } from '@/renderer/render-loop';
import { getAttackTargets, type AttackTarget } from '@/systems/attack-targeting';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey } from '@/systems/hex-utils';
import { getAvailableWorkerActions, getKnownTileResourceForWorkerAction } from '@/systems/improvement-system';
import { buildUnitOccupancy } from '@/systems/unit-occupancy';
import { getMovementRange } from '@/systems/unit-system';

export interface SelectedUnitHighlightResult {
  movementRange: HexCoord[];
  attackTargets: AttackTarget[];
  highlights: HexHighlight[];
}

const WORKER_ACTIONS: WorkerActionType[] = ['farm', 'mine', 'lumber_camp', 'watermill', 'drain_swamp'];

function isCityTile(state: GameState, coord: HexCoord): boolean {
  const key = hexKey(coord);
  return Object.values(state.cities).some(city => hexKey(city.position) === key);
}

function isPlausibleWorkerActionTile(
  state: GameState,
  coord: HexCoord,
  completedTechs: string[],
): boolean {
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile) return false;
  const knownResource = getKnownTileResourceForWorkerAction(tile, completedTechs);
  return getAvailableWorkerActions(tile, completedTechs, undefined, { isCityTile: isCityTile(state, coord), knownResource })
    .some(action => WORKER_ACTIONS.includes(action));
}

function buildWorkerGuidanceHighlights(
  state: GameState,
  unitId: string,
  movementRange: HexCoord[],
): HexHighlight[] {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'worker') return [];

  const visibility = state.civilizations[state.currentPlayer]?.visibility;
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const coords = [unit.position, ...movementRange];
  const seenKeys = new Set<string>();
  const highlights: HexHighlight[] = [];

  for (const coord of coords) {
    const key = hexKey(coord);
    if (seenKeys.has(key)) continue;
    seenKeys.add(key);
    const tile = state.map.tiles[key];
    if (!tile) continue;
    if (visibility && getVisibility(visibility, coord) === 'unexplored') continue;

    const knownResource = getKnownTileResourceForWorkerAction(tile, completedTechs);
    const options = { isCityTile: isCityTile(state, coord), knownResource };
    const availableActions = getAvailableWorkerActions(tile, completedTechs, unit.owner, options);
    if (availableActions.length > 0) {
      highlights.push({ coord, type: 'worker-buildable' });
    } else if (tile.owner === unit.owner) {
      highlights.push({ coord, type: 'worker-owned-blocked' });
    } else if (isPlausibleWorkerActionTile(state, coord, completedTechs)) {
      highlights.push({ coord, type: 'worker-foreign-blocked' });
    }
  }

  return highlights;
}

function buildHostileOwners(state: GameState, civId: string): Set<string> {
  const civ = state.civilizations[civId];
  const hostile = new Set<string>(['barbarian', ...(civ?.diplomacy?.atWarWith ?? [])]);
  for (const [mcId, mc] of Object.entries(state.minorCivs)) {
    if (mc.diplomacy?.atWarWith?.includes(civId)) {
      hostile.add(mcId);
    }
  }
  return hostile;
}

export function buildSelectedUnitHighlights(state: GameState, unitId: string): SelectedUnitHighlightResult {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== state.currentPlayer) {
    return { movementRange: [], attackTargets: [], highlights: [] };
  }

  const occupancy = buildUnitOccupancy(state.units);
  const hostileOwners = buildHostileOwners(state, state.currentPlayer);
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const movementRange = getMovementRange(
    unit,
    state.map,
    occupancy.unitIdsByHex,
    occupancy.ownersByUnitId,
    hostileOwners,
    { completedTechs },
  );
  const attackTargets = getAttackTargets(state, unit, { viewerId: state.currentPlayer })
    .filter(target => target.result.targetType === 'unit');
  const attackKeys = new Set(attackTargets.map(target => hexKey(target.coord)));

  const moveHighlights = movementRange
    .filter(coord => !attackKeys.has(hexKey(coord)))
    .map(coord => ({ coord, type: 'move' as const }));

  const attackHighlights = attackTargets.map(target => ({ coord: target.coord, type: 'attack' as const }));
  const workerHighlights = buildWorkerGuidanceHighlights(state, unitId, movementRange);

  return {
    movementRange,
    attackTargets,
    highlights: [...moveHighlights, ...attackHighlights, ...workerHighlights],
  };
}
