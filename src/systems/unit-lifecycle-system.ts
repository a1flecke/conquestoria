import type { GameState, Unit } from '@/core/types';
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

export function removePlayerUnitFromState(state: GameState, civId: string, unitId: string): GameState {
  const unit = state.units[unitId];
  const civ = state.civilizations[civId];
  if (!unit || unit.owner !== civId || !civ) {
    return state;
  }

  const { [unitId]: _removedUnit, ...remainingUnits } = state.units;
  const nextEspionage = state.espionage
    ? cleanupDeadSpyUnit(state.espionage, civId, unitId)
    : state.espionage;

  return {
    ...state,
    units: remainingUnits,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        units: civ.units.filter(id => id !== unitId),
      },
    },
    espionage: nextEspionage,
  };
}

export function getUnmovedUnitsForEndTurn(state: GameState, civId: string): Unit[] {
  const civ = state.civilizations[civId];
  if (!civ) {
    return [];
  }

  const roster = new Set(civ.units);
  return getUnmovedUnits(state.units, civId).filter(unit => roster.has(unit.id));
}
