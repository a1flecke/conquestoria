import type {
  BuildableImprovementType,
  City,
  GameEvents,
  GameState,
  HexCoord,
  TerrainType,
  Unit,
  WorkerActionType,
} from '@/core/types';
import { createRng } from './map-generator';
import { hexDistance, hexKey } from './hex-utils';
import {
  IMPROVEMENT_BUILD_TURNS,
  getKnownTileResourceForWorkerAction,
  getWorkerActionBlockerReason,
  getWorkerActionLabel,
} from './improvement-system';

export const DEFAULT_WORKER_CHARGES = 2;
export const MAX_WORKER_CHARGES = 5;
export const FOREST_FARM_PRODUCTION_BONUS = 20;
export const SWAMP_DRAIN_WORKER_LOSS_CHANCE = 0.2;

type WorkerActionEvent =
  | { type: 'improvement:started'; payload: GameEvents['improvement:started'] }
  | { type: 'unit:destroyed'; payload: GameEvents['unit:destroyed'] };

export type WorkerActionFailureReason =
  | 'missing-unit'
  | 'not-worker'
  | 'missing-tile'
  | 'invalid-action'
  | 'outside-territory'
  | 'no-charges'
  | 'already-acted';

export interface WorkerActionOptions {
  rng?: () => number;
  allowReplacement?: boolean;
}

export type WorkerActionResult =
  | {
      ok: true;
      state: GameState;
      action: WorkerActionType;
      message: string;
      events: WorkerActionEvent[];
      workerConsumed: boolean;
      workerLost: boolean;
      chargesRemaining: number;
      forestProductionBonus: number;
      boostedCityId: string | null;
    }
  | {
      ok: false;
      state: GameState;
      reason: WorkerActionFailureReason;
      events: [];
    };

function isBuildableImprovement(action: WorkerActionType): action is BuildableImprovementType {
  return action !== 'drain_swamp';
}

export function getWorkerChargesRemaining(unit: Unit): number {
  if (unit.type !== 'worker') return 0;
  return Math.min(MAX_WORKER_CHARGES, unit.chargesRemaining ?? DEFAULT_WORKER_CHARGES);
}

function findNearestOwnedCity(state: GameState, owner: string, coord: HexCoord): City | null {
  const cities = Object.values(state.cities)
    .filter(candidate => candidate.owner === owner)
    .sort((left, right) => {
      const distanceDiff = hexDistance(left.position, coord) - hexDistance(right.position, coord);
      return distanceDiff !== 0 ? distanceDiff : left.id.localeCompare(right.id);
    });
  return cities[0] ?? null;
}

function isCityCenterTile(state: GameState, coord: HexCoord): boolean {
  const key = hexKey(coord);
  return Object.values(state.cities).some(city => hexKey(city.position) === key);
}

function removeUnit(state: GameState, unit: Unit): GameState {
  const { [unit.id]: _removed, ...remainingUnits } = state.units;
  const civ = state.civilizations[unit.owner];
  if (!civ) return { ...state, units: remainingUnits };

  return {
    ...state,
    units: remainingUnits,
    civilizations: {
      ...state.civilizations,
      [unit.owner]: {
        ...civ,
        units: civ.units.filter(unitId => unitId !== unit.id),
      },
    },
  };
}

function defaultDrainRng(state: GameState, unit: Unit, action: WorkerActionType): () => number {
  const seed = `${state.gameId ?? 'game'}-${state.turn}-${unit.id}-${hexKey(unit.position)}-${action}-${getWorkerChargesRemaining(unit)}`;
  return createRng(seed);
}

export function applyWorkerAction(
  state: GameState,
  unitId: string,
  action: WorkerActionType,
  options: WorkerActionOptions = {},
): WorkerActionResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit', events: [] };
  if (unit.type !== 'worker') return { ok: false, state, reason: 'not-worker', events: [] };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted', events: [] };
  const chargesBefore = getWorkerChargesRemaining(unit);
  if (chargesBefore <= 0) return { ok: false, state, reason: 'no-charges', events: [] };

  const key = hexKey(unit.position);
  const tile = state.map.tiles[key];
  if (!tile) return { ok: false, state, reason: 'missing-tile', events: [] };

  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const eligibilityOptions = {
    isCityTile: isCityCenterTile(state, unit.position),
    allowReplacement: options.allowReplacement,
    knownResource: getKnownTileResourceForWorkerAction(tile, completedTechs),
  };
  const blockerReason = getWorkerActionBlockerReason(tile, action, completedTechs, unit.owner, eligibilityOptions);
  if (blockerReason !== 'none') {
    return {
      ok: false,
      state,
      reason: blockerReason === 'outside-territory' ? 'outside-territory' : 'invalid-action',
      events: [],
    };
  }

  const chargesAfter = Math.max(0, chargesBefore - 1);
  const events: WorkerActionEvent[] = [];
  let nextTerrain: TerrainType = tile.terrain;
  let nextImprovement = tile.improvement;
  let nextImprovementTurnsLeft = tile.improvementTurnsLeft;
  let workerLost = false;
  let forestProductionBonus = 0;
  let boostedCityId: string | null = null;

  if (isBuildableImprovement(action)) {
    nextImprovement = action;
    nextImprovementTurnsLeft = IMPROVEMENT_BUILD_TURNS[action];
    events.push({
      type: 'improvement:started',
      payload: { unitId, coord: { ...tile.coord }, type: action },
    });

    if (action === 'farm' && (tile.terrain === 'forest' || tile.terrain === 'jungle')) {
      nextTerrain = 'plains';
      const boostedCity = findNearestOwnedCity(state, unit.owner, tile.coord);
      if (boostedCity) {
        forestProductionBonus = FOREST_FARM_PRODUCTION_BONUS;
        boostedCityId = boostedCity.id;
      }
    }
  } else {
    nextTerrain = 'grassland';
    nextImprovement = 'none';
    nextImprovementTurnsLeft = 0;
    const rng = options.rng ?? defaultDrainRng(state, unit, action);
    workerLost = rng() < SWAMP_DRAIN_WORKER_LOSS_CHANCE;
  }

  const nextTile = {
    ...tile,
    terrain: nextTerrain,
    improvement: nextImprovement,
    improvementTurnsLeft: nextImprovementTurnsLeft,
    improvementOwner: isBuildableImprovement(action) ? unit.owner : undefined,
  };

  const nextCities = { ...state.cities };
  if (boostedCityId) {
    const boostedCity = nextCities[boostedCityId];
    nextCities[boostedCityId] = {
      ...boostedCity,
      productionProgress: boostedCity.productionProgress + forestProductionBonus,
    };
  }

  const updatedUnit = {
    ...unit,
    hasActed: true,
    movementPointsLeft: 0,
    chargesRemaining: chargesAfter,
    workerTask: isBuildableImprovement(action)
      ? { action, coord: { ...tile.coord } }
      : undefined,
  };

  let nextState: GameState = {
    ...state,
    map: {
      ...state.map,
      tiles: {
        ...state.map.tiles,
        [key]: nextTile,
      },
    },
    cities: nextCities,
    units: {
      ...state.units,
      [unitId]: updatedUnit,
    },
  };

  const workerConsumed = chargesAfter === 0;
  if (workerConsumed || workerLost) {
    nextState = removeUnit(nextState, updatedUnit);
    events.push({
      type: 'unit:destroyed',
      payload: { unitId, position: { ...unit.position } },
    });
  }

  const messageParts = [getWorkerActionLabel(action)];
  if (forestProductionBonus > 0) messageParts.push(`+${forestProductionBonus} production in ${nextCities[boostedCityId!].name}`);
  if (workerLost) messageParts.push('worker lost draining swamp');
  else if (workerConsumed) messageParts.push('worker used up');
  else messageParts.push(`${chargesAfter}/${DEFAULT_WORKER_CHARGES} charges left`);

  return {
    ok: true,
    state: nextState,
    action,
    message: messageParts.join(' - '),
    events,
    workerConsumed,
    workerLost,
    chargesRemaining: chargesAfter,
    forestProductionBonus,
    boostedCityId,
  };
}

export function clearCompletedWorkerTasksForImprovement(
  state: GameState,
  coord: HexCoord,
): GameState {
  const key = hexKey(coord);
  const tile = state.map.tiles[key];
  if (!tile || tile.improvementTurnsLeft > 0) return state;

  let changed = false;
  const nextUnits: GameState['units'] = {};
  for (const [unitId, unit] of Object.entries(state.units)) {
    if (
      unit.workerTask
      && hexKey(unit.workerTask.coord) === key
      && unit.workerTask.action === tile.improvement
    ) {
      nextUnits[unitId] = { ...unit, workerTask: undefined };
      changed = true;
    } else {
      nextUnits[unitId] = unit;
    }
  }

  return changed ? { ...state, units: nextUnits } : state;
}
