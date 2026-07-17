import type { AirBaseRef, AirMission, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { hexDistance, hexesInRange, getWrappedHexesInRange, wrappedHexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

export type AirOperationResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: string };

export type AirBaseCheck =
  | { ok: true; base: Extract<AirBaseRef, { kind: 'city' }> }
  | { ok: false; reason: 'not-based-aircraft' | 'base-missing' | 'incompatible-base' | 'base-full' };

export interface AirBaseLossResult {
  state: GameState;
  outcomes: Array<{ aircraftId: string; outcome: 'destroyed' | 'evacuated' | 'captured' }>;
}

export function isBasedAirUnit(unit: Unit): boolean {
  return unit.airBase !== undefined;
}

export function getAirBaseRoster(state: GameState, base: AirBaseRef): Unit[] {
  return Object.values(state.units)
    .filter(unit => unit.airBase !== undefined && isSameAirBase(unit.airBase, base))
    .sort((left, right) => left.id.localeCompare(right.id));
}

function hasAirForceCommand(state: GameState, civId: string): boolean {
  return Object.entries(state.builtNationalProjects ?? {})
    .some(([key, project]) => project.civId === civId && key === `${civId}:air_force_command`);
}

function isSameAirBase(left: AirBaseRef, right: AirBaseRef): boolean {
  return left.kind === right.kind
    && (left.kind === 'city' && right.kind === 'city'
      ? left.cityId === right.cityId
      : left.kind === 'carrier' && right.kind === 'carrier' && left.unitId === right.unitId);
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

export function canCompleteAirUnitProduction(state: GameState, cityId: string, type: UnitType): AirBaseCheck {
  const definition = UNIT_DEFINITIONS[type].airOperation;
  if (!definition) return { ok: false, reason: 'not-based-aircraft' };
  const city = state.cities[cityId];
  if (!city) return { ok: false, reason: 'base-missing' };
  const base: Extract<AirBaseRef, { kind: 'city' }> = { kind: 'city', cityId };
  if (!isCompatibleBase(state, { type } as Unit, base)) return { ok: false, reason: 'incompatible-base' };
  if (getAirBaseRoster(state, base).length >= getAirBaseCapacity(state, base)) return { ok: false, reason: 'base-full' };
  return { ok: true, base };
}

export function baseNewAirUnit(state: GameState, cityId: string, unit: Unit): AirOperationResult {
  const check = canCompleteAirUnitProduction(state, cityId, unit.type);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const city = state.cities[cityId]!;
  return {
    ok: true,
    state: { ...state, units: { ...state.units, [unit.id]: { ...unit, airBase: check.base, position: { ...city.position } } } },
  };
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
    if (unit.airBase && isSameAirBase(base, unit.airBase)) return false;
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
  if (!getLegalRebaseDestinations(state, unitId).some(base => isSameAirBase(base, destination))) {
    return { ok: false, state, reason: 'invalid-destination' };
  }
  const position = getAirBasePosition(state, destination)!;
  return {
    ok: true,
    state: { ...state, units: { ...state.units, [unitId]: { ...unit, airBase: destination, position: { ...position }, movementPointsLeft: 0, hasMoved: true, hasActed: true, airMission: undefined } } },
  };
}

export function startIntercept(state: GameState, unitId: string): AirOperationResult {
  const unit = state.units[unitId];
  const definition = unit && UNIT_DEFINITIONS[unit.type].airOperation;
  if (!unit || !definition?.missions.includes('intercept') || !unit.airBase) {
    return { ok: false, state, reason: 'ineligible-interceptor' };
  }
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };
  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [unitId]: { ...unit, airMission: 'intercept', movementPointsLeft: 0, hasMoved: true, hasActed: true },
      },
    },
  };
}

export function selectInterceptor(state: GameState, incoming: Unit, target: { q: number; r: number }): Unit | undefined {
  return Object.values(state.units)
    .filter(unit => {
      const definition = UNIT_DEFINITIONS[unit.type].airOperation;
      return unit.owner !== incoming.owner
        && unit.airMission === 'intercept'
        && unit.airBase !== undefined
        && (unit.interceptedTurn === undefined || unit.interceptedTurn !== state.turn)
        && definition?.missions.includes('intercept') === true
        && airDistance(state, unit.position, target) <= definition.operationalRange;
    })
    .sort((left, right) => {
      const leftDamage = UNIT_DEFINITIONS[left.type].strength * left.health / 100;
      const rightDamage = UNIT_DEFINITIONS[right.type].strength * right.health / 100;
      return rightDamage - leftDamage || right.health - left.health || left.id.localeCompare(right.id);
    })[0];
}

export function getLegalAirMissionTargets(state: GameState, unitId: string, mission: Extract<AirMission, 'recon'>): HexCoord[] {
  const unit = state.units[unitId];
  const definition = unit && UNIT_DEFINITIONS[unit.type].airOperation;
  if (!unit || !definition?.missions.includes(mission) || !unit.airBase || unit.hasActed) return [];
  return state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, definition.operationalRange, state.map.width)
    : hexesInRange(unit.position, definition.operationalRange);
}

export function resolveReconMission(state: GameState, unitId: string, center: HexCoord): AirOperationResult {
  const unit = state.units[unitId];
  if (!unit || !getLegalAirMissionTargets(state, unitId, 'recon')
    .some(target => target.q === center.q && target.r === center.r)) {
    return { ok: false, state, reason: 'invalid-recon-target' };
  }
  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [unitId]: { ...unit, movementPointsLeft: 0, hasMoved: true, hasActed: true },
      },
      reconReveals: [
        ...(state.reconReveals ?? []).filter(reveal => reveal.expiresAtTurn >= state.turn),
        { ownerCivId: unit.owner, center: { ...center }, range: 3, expiresAtTurn: state.turn },
      ],
    },
  };
}

export function resolveAirBaseLoss(
  state: GameState,
  base: AirBaseRef,
  cause: { kind: 'captured'; victorId: string } | { kind: 'facility-removed' } | { kind: 'carrier-destroyed' },
): AirBaseLossResult {
  const roster = getAirBaseRoster(state, base);
  if (cause.kind === 'facility-removed') {
    let nextState = state;
    const outcomes: AirBaseLossResult['outcomes'] = [];
    for (const unit of roster) {
      const destination = getLegalRebaseDestinations(nextState, unit.id)[0];
      if (destination) {
        const position = getAirBasePosition(nextState, destination)!;
        nextState = {
          ...nextState,
          units: {
            ...nextState.units,
            [unit.id]: { ...nextState.units[unit.id]!, airBase: destination, position: { ...position } },
          },
        };
        outcomes.push({ aircraftId: unit.id, outcome: 'evacuated' });
      } else {
        const removed = removeAirUnits(nextState, new Set([unit.id]));
        nextState = removed;
        outcomes.push({ aircraftId: unit.id, outcome: 'destroyed' });
      }
    }
    return { state: nextState, outcomes };
  }
  if (cause.kind === 'captured') {
    // Capture handling is owned by city-capture-system, after the city owner changes.
    // Until then the facility remains a valid base and must not be mutated here.
    return { state, outcomes: roster.map(unit => ({ aircraftId: unit.id, outcome: 'captured' as const })) };
  }
  const removedIds = new Set(roster.map(unit => unit.id));
  const removed = removeAirUnits(state, removedIds);
  return {
    state: removed,
    outcomes: roster.map(unit => ({ aircraftId: unit.id, outcome: 'destroyed' })),
  };
}

function removeAirUnits(state: GameState, removedIds: ReadonlySet<string>): GameState {
  const units = Object.fromEntries(Object.entries(state.units).filter(([unitId]) => !removedIds.has(unitId)));
  const civilizations = Object.fromEntries(Object.entries(state.civilizations).map(([civId, civilization]) => [
    civId,
    { ...civilization, units: civilization.units.filter(unitId => !removedIds.has(unitId)) },
  ]));
  return { ...state, units, civilizations };
}

export function syncCarrierBasedAircraft(state: GameState, carrierId: string): GameState {
  const carrier = state.units[carrierId];
  if (!carrier || carrier.type !== 'carrier') return state;
  let changed = false;
  const units = { ...state.units };
  for (const unit of Object.values(units)) {
    if (unit.airBase?.kind !== 'carrier' || unit.airBase.unitId !== carrierId) continue;
    if (unit.position.q === carrier.position.q && unit.position.r === carrier.position.r) continue;
    units[unit.id] = { ...unit, position: { ...carrier.position } };
    changed = true;
  }
  return changed ? { ...state, units } : state;
}
