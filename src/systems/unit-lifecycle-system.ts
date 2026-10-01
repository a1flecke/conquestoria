import type { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import {
  emitCivilizationLivenessTransitions,
  reconcileCivilizationLiveness,
} from '@/systems/civilization-elimination-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { getUnmovedUnits } from '@/systems/unit-order-state';

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

  // #1198: one canonical removal owns the cascade (cargo, air wing, manifests, spy record, trade route).
  // Liveness is reconciled here because disbanding is the whole transition.
  const removal = removeUnits(state, [unitId], { reason: 'disbanded', bus });
  const liveness = reconcileCivilizationLiveness(state, removal.state);
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
