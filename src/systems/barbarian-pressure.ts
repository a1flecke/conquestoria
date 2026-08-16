import type { BarbarianCampPressure, GameState, Unit } from '@/core/types';
import { getUnitRoleDefinition } from './combat-role-definitions';
import { mapDistance } from './hex-utils';

export type BarbarianPressureKind = 'armor' | 'air';

export const BARBARIAN_PRESSURE_EXPIRY_TURNS = 10;

const pressureFieldByKind: Record<BarbarianPressureKind, keyof BarbarianCampPressure> = {
  armor: 'armorLastObservedTurn',
  air: 'airLastObservedTurn',
};

function validTurn(turn: unknown, currentTurn: number): turn is number {
  return Number.isInteger(turn) && typeof turn === 'number' && turn >= 0 && turn <= currentTurn;
}

export function recordCampPressure(
  state: GameState,
  campId: string,
  kind: BarbarianPressureKind,
  turn: number,
): GameState {
  if (!state.barbarianCamps[campId] || !validTurn(turn, state.turn)) return state;
  const current = state.barbarianCampPressure?.[campId] ?? {};
  const field = pressureFieldByKind[kind];
  return {
    ...state,
    barbarianCampPressure: {
      ...state.barbarianCampPressure,
      [campId]: { ...current, [field]: turn },
    },
  };
}

export function getActiveCampPressure(
  state: GameState,
  campId: string,
  turn: number,
): BarbarianPressureKind[] {
  const pressure = state.barbarianCampPressure?.[campId];
  if (!pressure || !Number.isInteger(turn) || turn < 0) return [];
  return (['armor', 'air'] as const).filter(kind => {
    const observedTurn = pressure[pressureFieldByKind[kind]];
    return validTurn(observedTurn, turn) && turn - observedTurn <= BARBARIAN_PRESSURE_EXPIRY_TURNS;
  });
}

export function normalizeBarbarianCampPressure(state: GameState): GameState {
  const normalized: Record<string, BarbarianCampPressure> = {};
  for (const campId of Object.keys(state.barbarianCamps ?? {}).sort()) {
    const pressure = state.barbarianCampPressure?.[campId];
    if (!pressure) continue;
    const next: BarbarianCampPressure = {};
    if (validTurn(pressure.armorLastObservedTurn, state.turn)) next.armorLastObservedTurn = pressure.armorLastObservedTurn;
    if (validTurn(pressure.airLastObservedTurn, state.turn)) next.airLastObservedTurn = pressure.airLastObservedTurn;
    if (Object.keys(next).length > 0) normalized[campId] = next;
  }
  const existing = state.barbarianCampPressure ?? {};
  return JSON.stringify(existing) === JSON.stringify(normalized)
    ? state
    : { ...state, barbarianCampPressure: normalized };
}

function isArmoredUnit(unit: Unit): boolean {
  return getUnitRoleDefinition(unit.type)?.localInfrastructureFamilies?.includes('armored') === true;
}

function airBasePosition(state: GameState, unit: Unit) {
  if (!unit.airBase) return undefined;
  return unit.airBase.kind === 'city'
    ? state.cities[unit.airBase.cityId]?.position
    : state.units[unit.airBase.unitId]?.position;
}

/**
 * Records only observations already supplied by the camp-local planner; callers
 * must never pass a global unit scan as its sensedUnits argument.
 */
export function observeCampPressureFromSensedUnits(
  state: GameState,
  campId: string,
  sensedUnits: readonly Unit[],
): GameState {
  const camp = state.barbarianCamps[campId];
  if (!camp) return state;
  let nextState = state;
  for (const unit of sensedUnits) {
    if (unit.owner === 'barbarian' || unit.transportId) continue;
    if (isArmoredUnit(unit) && mapDistance(state.map, camp.position, unit.position) <= 6) {
      nextState = recordCampPressure(nextState, campId, 'armor', state.turn);
    }
    const basePosition = airBasePosition(state, unit);
    if (basePosition && mapDistance(state.map, camp.position, basePosition) <= 6) {
      nextState = recordCampPressure(nextState, campId, 'air', state.turn);
    }
  }
  return nextState;
}
