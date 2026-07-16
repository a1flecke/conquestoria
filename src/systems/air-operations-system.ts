import type { AirBaseRef, GameState, Unit } from '@/core/types';
import { hexDistance, wrappedHexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

export type AirOperationResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };

export function isBasedAirUnit(unit: Unit): boolean {
  return unit.airBase !== undefined;
}

export function getAirBaseRoster(state: GameState, base: AirBaseRef): Unit[] {
  return Object.values(state.units)
    .filter(unit => unit.airBase?.kind === base.kind
      && (base.kind === 'city'
        ? unit.airBase.cityId === base.cityId
        : unit.airBase.unitId === base.unitId))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function hasAirForceCommand(state: GameState, civId: string): boolean {
  return Object.values(state.builtNationalProjects ?? {})
    .some(project => project.civId === civId && project.buildingId === 'air_force_command');
}

export function getAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') return state.units[base.unitId]?.type === 'carrier' ? 2 : 0;
  const city = state.cities[base.cityId];
  if (!city) return 0;
  if (city.buildings.includes('airfield')) return hasAirForceCommand(state, city.owner) ? 4 : 3;
  if (city.buildings.includes('helicopter_base')) return 2;
  if (city.buildings.includes('stealth_airbase')) return 2;
  return 0;
}

function getAirBaseOwner(state: GameState, base: AirBaseRef): string | undefined {
  return base.kind === 'city' ? state.cities[base.cityId]?.owner : state.units[base.unitId]?.owner;
}

function getAirBasePosition(state: GameState, base: AirBaseRef) {
  return base.kind === 'city' ? state.cities[base.cityId]?.position : state.units[base.unitId]?.position;
}

function getAirBaseKind(state: GameState, base: AirBaseRef) {
  if (base.kind === 'carrier') return state.units[base.unitId]?.type === 'carrier' ? 'carrier' : undefined;
  const buildings = state.cities[base.cityId]?.buildings ?? [];
  return ['airfield', 'helicopter_base', 'stealth_airbase'].find(kind => buildings.includes(kind));
}

function isCompatibleBase(state: GameState, unit: Unit, base: AirBaseRef): boolean {
  const definition = UNIT_DEFINITIONS[unit.type].airOperation;
  const baseKind = getAirBaseKind(state, base);
  return Boolean(definition && baseKind && definition.baseKinds.includes(baseKind as never));
}

function airDistance(state: GameState, from: { q: number; r: number }, to: { q: number; r: number }): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(from, to, state.map.width) : hexDistance(from, to);
}

export function getLegalRebaseDestinations(state: GameState, unitId: string): AirBaseRef[] {
  const unit = state.units[unitId];
  const definition = unit && UNIT_DEFINITIONS[unit.type].airOperation;
  const source = unit?.airBase && getAirBasePosition(state, unit.airBase);
  if (!unit || !definition || !source) return [];
  const candidates: AirBaseRef[] = [
    ...Object.keys(state.cities).map(cityId => ({ kind: 'city' as const, cityId })),
    ...Object.values(state.units).filter(candidate => candidate.type === 'carrier').map(candidate => ({ kind: 'carrier' as const, unitId: candidate.id })),
  ];
  return candidates.filter(base => {
    if (base.kind === unit.airBase?.kind && (base.kind === 'city' ? base.cityId === unit.airBase.cityId : base.unitId === unit.airBase.unitId)) return false;
    const position = getAirBasePosition(state, base);
    return getAirBaseOwner(state, base) === unit.owner
      && isCompatibleBase(state, unit, base)
      && getAirBaseRoster(state, base).length < getAirBaseCapacity(state, base)
      && position !== undefined
      && airDistance(state, source, position) <= definition.ferryRange;
  });
}

export function rebaseAircraft(state: GameState, unitId: string, destination: AirBaseRef): AirOperationResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit' };
  if (!unit.airBase || !UNIT_DEFINITIONS[unit.type].airOperation) return { ok: false, state, reason: 'not-based-aircraft' };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };
  if (!getLegalRebaseDestinations(state, unitId).some(base => JSON.stringify(base) === JSON.stringify(destination))) {
    return { ok: false, state, reason: 'invalid-destination' };
  }
  const position = getAirBasePosition(state, destination)!;
  return {
    ok: true,
    state: { ...state, units: { ...state.units, [unitId]: { ...unit, airBase: destination, position: { ...position }, movementPointsLeft: 0, hasMoved: true, hasActed: true, airMission: undefined } } },
  };
}
