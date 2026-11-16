import type { AirBaseRef, GameState, Unit } from '@/core/types';
import { appendNotification } from '@/core/notification-log';
import { fnv1a32CodePointLead } from './deterministic-hash';
import { hexDistance, wrappedHexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { withNewOwner } from './unit-trained-movement-bonus';
import { removeUnits } from '@/systems/unit-removal-system';

/**
 * Air bases and what happens to their aircraft when one is lost: rosters, capacity, compatible
 * rebase destinations and `resolveAirBaseLoss`. A leaf below `air-operations-system` (which
 * re-exports all of it) so systems that destroy or remove a city — the raze path, a siege that
 * destroys a city — can resolve its airfield without an import cycle.
 */
export interface AirBaseLossResult {
  state: GameState;
  outcomes: Array<{ aircraftId: string; outcome: 'destroyed' | 'evacuated' | 'captured' }>;
}

export function getAirBaseRoster(state: GameState, base: AirBaseRef): Unit[] {
  return Object.values(state.units)
    .filter(unit => unit.airBase !== undefined && isSameAirBase(unit.airBase, base))
    .sort((left, right) => left.id.localeCompare(right.id));
}

export function hasAirForceCommand(state: GameState, civId: string): boolean {
  return Object.entries(state.builtNationalProjects ?? {})
    .some(([key, project]) => project.civId === civId && key === `${civId}:air_force_command`);
}

export function isSameAirBase(left: AirBaseRef, right: AirBaseRef): boolean {
  return left.kind === right.kind
    && (left.kind === 'city' && right.kind === 'city'
      ? left.cityId === right.cityId
      : left.kind === 'carrier' && right.kind === 'carrier' && left.unitId === right.unitId);
}

export function getAirBaseCapacity(state: GameState, base: AirBaseRef): number {
  if (base.kind === 'carrier') {
    const hostType = state.units[base.unitId]?.type;
    return (hostType ? UNIT_DEFINITIONS[hostType].carrierDeckCapacity : undefined) ?? 0;
  }
  const city = state.cities[base.cityId];
  if (!city) return 0;
  if (city.buildings.includes('airfield')) return hasAirForceCommand(state, city.owner) ? 4 : 3;
  if (city.buildings.includes('helicopter_base')) return 2;
  if (city.buildings.includes('stealth_airbase')) return 2;
  return 0;
}

export function getAirBaseOwner(state: GameState, base: AirBaseRef): string | undefined {
  return base.kind === 'city' ? state.cities[base.cityId]?.owner : state.units[base.unitId]?.owner;
}

export function getAirBasePosition(state: GameState, base: AirBaseRef) {
  return base.kind === 'city' ? state.cities[base.cityId]?.position : state.units[base.unitId]?.position;
}

export function getAirBaseKind(state: GameState, base: AirBaseRef): string | undefined {
  if (base.kind === 'carrier') {
    const hostType = state.units[base.unitId]?.type;
    // #582: any carrier-family hull (Carrier, Supercarrier, ...) reports
    // 'carrier' -- driven by carrierDeckCapacity, not a hardcoded type name,
    // so a new carrier-family hull needs no change here.
    return hostType && UNIT_DEFINITIONS[hostType].carrierDeckCapacity != null ? 'carrier' : undefined;
  }
  const buildings = state.cities[base.cityId]?.buildings ?? [];
  return ['airfield', 'helicopter_base', 'stealth_airbase'].find(kind => buildings.includes(kind));
}

export function isCompatibleBase(state: GameState, unit: Unit, base: AirBaseRef): boolean {
  const definition = UNIT_DEFINITIONS[unit.type].airOperation;
  const baseKind = getAirBaseKind(state, base);
  return Boolean(definition && baseKind && definition.baseKinds.includes(baseKind as never));
}

export function airDistance(state: GameState, from: { q: number; r: number }, to: { q: number; r: number }): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(from, to, state.map.width) : hexDistance(from, to);
}

export function getLegalRebaseDestinations(state: GameState, unitId: string): AirBaseRef[] {
  const unit = state.units[unitId];
  const definition = unit && UNIT_DEFINITIONS[unit.type].airOperation;
  const source = unit?.airBase && getAirBasePosition(state, unit.airBase);
  if (!unit || !definition || !source) return [];
  const candidates: AirBaseRef[] = [
    ...Object.keys(state.cities).map(cityId => ({ kind: 'city' as const, cityId })),
    // #582: any carrier-family hull, not just plain 'carrier' -- same
    // carrierDeckCapacity-driven check as getAirBaseKind above.
    ...Object.values(state.units).filter(candidate => UNIT_DEFINITIONS[candidate.type].carrierDeckCapacity != null).map(candidate => ({ kind: 'carrier' as const, unitId: candidate.id })),
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
    return { state: appendAirBaseLossNotifications(nextState, roster, outcomes), outcomes };
  }
  if (cause.kind === 'captured') {
    let nextState = state;
    const outcomes: AirBaseLossResult['outcomes'] = [];
    for (const unit of roster) {
      const roll = stableAirLossRoll(state, base, unit.id);
      const destination = getLegalRebaseDestinations(nextState, unit.id)[0];
      const resolution = roll === 0 && destination
        ? 'evacuated'
        : roll === 0
          ? (stableAirLossRoll(state, base, `${unit.id}:reroll`) % 2 === 0 ? 'destroyed' : 'captured')
          : roll === 1 ? 'destroyed' : 'captured';
      if (resolution === 'evacuated') {
        const position = getAirBasePosition(nextState, destination!)!;
        nextState = {
          ...nextState,
          units: { ...nextState.units, [unit.id]: { ...nextState.units[unit.id]!, airBase: destination!, position: { ...position } } },
        };
      } else if (resolution === 'destroyed') {
        nextState = removeAirUnits(nextState, new Set([unit.id]));
      } else {
        // #884: a captured aircraft comes up fresh for its new owner; strain is the old owner's tempo.
        const { airStrain: _capturedStrain, ...current } = nextState.units[unit.id]!;
        const previousOwner = current.owner;
        nextState = {
          ...nextState,
          units: { ...nextState.units, [unit.id]: withNewOwner(nextState, current, cause.victorId) },
          civilizations: Object.fromEntries(Object.entries(nextState.civilizations).map(([civId, civilization]) => [
            civId,
            civId === previousOwner
              ? { ...civilization, units: civilization.units.filter(id => id !== unit.id) }
              : civId === cause.victorId
                ? { ...civilization, units: civilization.units.includes(unit.id) ? civilization.units : [...civilization.units, unit.id] }
                : civilization,
          ])),
        };
      }
      outcomes.push({ aircraftId: unit.id, outcome: resolution });
    }
    return { state: appendAirBaseLossNotifications(nextState, roster, outcomes), outcomes };
  }
  const removedIds = new Set(roster.map(unit => unit.id));
  const removed = removeAirUnits(state, removedIds);
  return {
    state: appendAirBaseLossNotifications(removed, roster, roster.map(unit => ({ aircraftId: unit.id, outcome: 'destroyed' as const }))),
    outcomes: roster.map(unit => ({ aircraftId: unit.id, outcome: 'destroyed' })),
  };
}

function appendAirBaseLossNotifications(
  state: GameState,
  roster: Unit[],
  outcomes: AirBaseLossResult['outcomes'],
): GameState {
  if (outcomes.length === 0) return state;
  const nextState: GameState = {
    ...state,
    idCounters: { ...state.idCounters },
    notificationLog: Object.fromEntries(Object.entries(state.notificationLog ?? {}).map(([civId, entries]) => [civId, [...entries]])),
  };
  for (const outcome of outcomes) {
    const aircraft = roster.find(unit => unit.id === outcome.aircraftId);
    if (!aircraft) continue;
    const name = UNIT_DEFINITIONS[aircraft.type].name;
    const message = outcome.outcome === 'evacuated'
      ? `${name} evacuated after its air base was lost.`
      : outcome.outcome === 'captured'
        ? `${name} was captured when its air base fell.`
        : `${name} was destroyed when its air base was lost.`;
    appendNotification(nextState, aircraft.owner, {
      message,
      type: 'warning',
      turn: state.turn,
      target: { kind: 'map', coord: { ...aircraft.position }, label: name },
    });
  }
  return nextState;
}

function stableAirLossRoll(state: GameState, base: AirBaseRef, aircraftId: string): number {
  const baseId = base.kind === 'city' ? base.cityId : base.unitId;
  return fnv1a32CodePointLead(`${state.gameId ?? 'legacy'}:${state.turn}:${baseId}:${aircraftId}`) % 3;
}

function removeAirUnits(state: GameState, removedIds: ReadonlySet<string>): GameState {
  return removeUnits(state, removedIds, { reason: 'destroyed' }).state;
}
