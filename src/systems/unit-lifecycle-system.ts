import type { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import {
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';
import { cleanupDeadSpyUnit } from '@/systems/espionage-system';
import { getUnmovedUnits } from '@/systems/unit-system';

export function skipUnitForTurn(unit: Unit): Unit {
  return {
    ...unit,
    movementPointsLeft: 0,
    isResting: false,
    skippedTurn: true,
  };
}

export function skipUnitInState(state: GameState, civId: string, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== civId) {
    return state;
  }

  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: skipUnitForTurn(unit),
    },
  };
}

export function removePlayerUnitFromState(
  state: GameState,
  civId: string,
  unitId: string,
  bus?: EventBus,
): GameState {
  const unit = state.units[unitId];
  const civ = state.civilizations[civId];
  if (!unit || unit.owner !== civId || !civ) {
    return state;
  }

  const removedUnitIds = new Set([unitId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const candidate of Object.values(state.units)) {
      const isCargoOfRemovedTransport = candidate.transportId != null
        && removedUnitIds.has(candidate.transportId);
      const isListedCargo = [...removedUnitIds].some(removedId =>
        state.units[removedId]?.cargoUnitIds?.includes(candidate.id));
      if ((isCargoOfRemovedTransport || isListedCargo) && !removedUnitIds.has(candidate.id)) {
        removedUnitIds.add(candidate.id);
        changed = true;
      }
    }
  }

  const remainingUnits = Object.fromEntries(
    Object.entries(state.units).filter(([id]) => !removedUnitIds.has(id)),
  );
  let nextEspionage = state.espionage;
  for (const removedId of removedUnitIds) {
    const removed = state.units[removedId];
    if (removed && nextEspionage) {
      nextEspionage = cleanupDeadSpyUnit(nextEspionage, removed.owner, removedId);
    }
  }
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([id, candidate]) => [
    id,
    candidate.units.some(candidateUnitId => removedUnitIds.has(candidateUnitId))
      ? { ...candidate, units: candidate.units.filter(candidateUnitId => !removedUnitIds.has(candidateUnitId)) }
      : candidate,
  ]));
  const nextState: GameState = {
    ...state,
    units: remainingUnits,
    civilizations,
    espionage: nextEspionage,
  };
  const liveness = reconcileCivilizationLiveness(state, nextState);
  if (bus) emitCivilizationLivenessTransitions(liveness, bus);
  return liveness.state;
}

export function getUnmovedUnitsForEndTurn(state: GameState, civId: string): Unit[] {
  if (!state.civilizations[civId]) {
    return [];
  }

  return getUnmovedUnits(state.units, civId);
}

export function fortifyUnitInState(state: GameState, civId: string, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== civId) {
    return state;
  }

  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: {
        ...unit,
        isFortified: true,
        hasActed: true,
        movementPointsLeft: 0,
      },
    },
  };
}

export function unfortifyUnitInState(state: GameState, civId: string, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit || unit.owner !== civId) {
    return state;
  }

  const { isFortified: _removed, ...rest } = unit;
  return {
    ...state,
    units: {
      ...state.units,
      [unitId]: rest,
    },
  };
}
