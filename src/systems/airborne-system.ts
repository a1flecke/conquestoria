import type { CombatResult, GameState, HexCoord, Unit } from '@/core/types';
import { getAirBaseKind, getAirBaseRoster, selectInterceptor } from '@/systems/air-operations-system';
import { isBlockingCityFor, UNIT_DEFINITIONS, getMovementCostForUnit } from '@/systems/unit-system';
import { isVisible } from '@/systems/fog-of-war';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { hexKey, hexesInRange, getWrappedHexesInRange, hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { deterministicCombatSeed, resolveCombat } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveCombatEra } from '@/systems/era-resolution';
import { applyCombatOutcomeToState } from '@/systems/combat-reward-system';
import { getHostileAirDefenseThreat } from '@/systems/air-defense-system';
import { appendNotification } from '@/core/notification-log';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

export type ParadropFailureReason =
  | 'not-airborne-unit' | 'no-launch-base' | 'already-acted'
  | 'out-of-range' | 'unexplored' | 'impassable-terrain'
  | 'destination-occupied' | 'foreign-city';

export type ParadropLaunchState =
  | { ok: true }
  | { ok: false; reason: ParadropFailureReason };

export const PARADROP_FAILURE_MESSAGES: Record<ParadropFailureReason, string> = {
  'not-airborne-unit': 'This unit cannot paradrop.',
  'no-launch-base': 'Stand in a friendly city with an Airfield to paradrop.',
  'already-acted': 'This unit has already acted this turn.',
  'out-of-range': 'That tile is outside paradrop range.',
  'unexplored': 'You have not explored that tile.',
  'impassable-terrain': 'A Paratrooper cannot land there.',
  'destination-occupied': 'That tile is occupied.',
  'foreign-city': 'Move adjacent, then use the city assault action.',
};

function paradropDistance(state: GameState, from: HexCoord, to: HexCoord): number {
  return state.map.wrapsHorizontally ? wrappedHexDistance(from, to, state.map.width) : hexDistance(from, to);
}

export function getParadropLaunchState(state: GameState, unitId: string): ParadropLaunchState {
  const unit = state.units[unitId];
  const capability = unit && UNIT_DEFINITIONS[unit.type].paradrop;
  if (!unit || !capability) return { ok: false, reason: 'not-airborne-unit' };
  if (unit.hasActed || unit.movementPointsLeft <= 0) return { ok: false, reason: 'already-acted' };
  const launchCity = Object.values(state.cities).find(city =>
    city.owner === unit.owner && hexKey(city.position) === hexKey(unit.position));
  const baseKind = launchCity && getAirBaseKind(state, { kind: 'city', cityId: launchCity.id });
  if (!launchCity || !baseKind || !capability.baseKinds.includes(baseKind as never)) {
    return { ok: false, reason: 'no-launch-base' };
  }
  return { ok: true };
}

function isLegalAirborneLandingTile(state: GameState, unit: Unit, coord: HexCoord, occupancy: ReturnType<typeof buildUnitOccupancy>): boolean {
  const visibility = state.civilizations[unit.owner]?.visibility;
  if (visibility && !isVisible(visibility, coord)) return false;
  const tile = state.map.tiles[hexKey(coord)];
  if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) return false;
  if (getUnitIdsAtCoord(occupancy, coord).length > 0) return false;
  const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(coord));
  if (city && isBlockingCityFor(state, unit, city)) return false;
  return true;
}

export function getParadropTargets(state: GameState, unitId: string): HexCoord[] {
  const launchState = getParadropLaunchState(state, unitId);
  if (!launchState.ok) return [];
  const unit = state.units[unitId]!;
  const capability = UNIT_DEFINITIONS[unit.type].paradrop!;
  const occupancy = buildUnitOccupancy(state.units);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, capability.range, state.map.width)
    : hexesInRange(unit.position, capability.range);

  return candidates.filter(coord => isLegalAirborneLandingTile(state, unit, coord, occupancy));
}

export function canParadrop(state: GameState, unitId: string, destination: HexCoord): { ok: true } | { ok: false; reason: ParadropFailureReason } {
  const launchState = getParadropLaunchState(state, unitId);
  if (!launchState.ok) return launchState;
  const unit = state.units[unitId]!;
  const capability = UNIT_DEFINITIONS[unit.type].paradrop!;
  const visibility = state.civilizations[unit.owner]?.visibility;

  if (paradropDistance(state, unit.position, destination) > capability.range) return { ok: false, reason: 'out-of-range' };
  if (visibility && !isVisible(visibility, destination)) return { ok: false, reason: 'unexplored' };
  const tile = state.map.tiles[hexKey(destination)];
  if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) {
    return { ok: false, reason: 'impassable-terrain' };
  }
  const occupancy = buildUnitOccupancy(state.units);
  if (getUnitIdsAtCoord(occupancy, destination).length > 0) return { ok: false, reason: 'destination-occupied' };
  const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(destination));
  if (city && isBlockingCityFor(state, unit, city)) return { ok: false, reason: 'foreign-city' };

  // Cross-check against getParadropTargets rather than trusting the individual
  // checks above to stay in sync forever -- if the two diverge, out-of-range
  // is the most informative fallback reason for an otherwise-unexplained miss.
  const inTargets = getParadropTargets(state, unitId).some(t => hexKey(t) === hexKey(destination));
  if (!inTargets) return { ok: false, reason: 'out-of-range' };
  return { ok: true };
}

export type AirAssaultFailureReason =
  | 'not-eligible-passenger' | 'no-launch-base' | 'no-launch-helicopter' | 'already-acted'
  | 'out-of-range' | 'unexplored' | 'impassable-terrain'
  | 'destination-occupied' | 'foreign-city';

export const AIR_ASSAULT_FAILURE_MESSAGES: Record<AirAssaultFailureReason, string> = {
  'not-eligible-passenger': 'This unit cannot be air-assaulted.',
  'no-launch-base': 'Stand in a friendly city with a Helicopter Base to Air Assault.',
  'no-launch-helicopter': 'Your helicopters here have already acted this turn.',
  'already-acted': 'This unit has already acted this turn.',
  'out-of-range': "That tile is outside the helicopter's operational range.",
  'unexplored': 'You have not explored that tile.',
  'impassable-terrain': 'A unit cannot land there.',
  'destination-occupied': 'That tile is occupied.',
  'foreign-city': 'Move adjacent, then use the city assault action.',
};

function findLaunchCity(state: GameState, unit: Unit) {
  return Object.values(state.cities).find(city =>
    city.owner === unit.owner && hexKey(city.position) === hexKey(unit.position));
}

function pickAirAssaultHelicopter(state: GameState, cityId: string, baseKind: string): Unit | undefined {
  return getAirBaseRoster(state, { kind: 'city', cityId })
    .find(candidate => !candidate.hasActed && UNIT_DEFINITIONS[candidate.type].airAssault?.baseKinds.includes(baseKind as never));
}

export function getAirAssaultLaunchState(state: GameState, unitId: string): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason } {
  const unit = state.units[unitId];
  if (!unit || !UNIT_DEFINITIONS[unit.type].airAssaultPassengerEligible) return { ok: false, reason: 'not-eligible-passenger' };
  if (unit.hasActed || unit.movementPointsLeft <= 0) return { ok: false, reason: 'already-acted' };
  const launchCity = findLaunchCity(state, unit);
  // Deliberately NOT getAirBaseKind here: that helper returns only the
  // single highest-priority kind for a city ('airfield' beats
  // 'helicopter_base' when a city has both), which would incorrectly
  // reject Air Assault from a dual-purpose Airfield + Helicopter Base
  // city. Air Assault only cares whether 'helicopter_base' specifically
  // is present, independent of whatever else the city also has.
  if (!launchCity || !launchCity.buildings.includes('helicopter_base')) return { ok: false, reason: 'no-launch-base' };
  const helicopter = pickAirAssaultHelicopter(state, launchCity.id, 'helicopter_base');
  if (!helicopter) return { ok: false, reason: 'no-launch-helicopter' };
  return { ok: true, helicopterId: helicopter.id };
}

function airAssaultRange(state: GameState, launchCityId: string): number {
  // Callers of this function have already passed through
  // getAirAssaultLaunchState, which only returns ok:true once baseKind is
  // confirmed 'helicopter_base' -- safe to pass the literal directly here
  // rather than re-deriving it from getAirBaseKind a second time.
  const helicopter = pickAirAssaultHelicopter(state, launchCityId, 'helicopter_base');
  return helicopter ? UNIT_DEFINITIONS[helicopter.type].airOperation!.operationalRange : 0;
}

export function getAirAssaultTargets(state: GameState, unitId: string): HexCoord[] {
  const launchState = getAirAssaultLaunchState(state, unitId);
  if (!launchState.ok) return [];
  const unit = state.units[unitId]!;
  const launchCity = findLaunchCity(state, unit)!;
  const range = airAssaultRange(state, launchCity.id);
  const occupancy = buildUnitOccupancy(state.units);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, range, state.map.width)
    : hexesInRange(unit.position, range);

  return candidates.filter(coord => isLegalAirborneLandingTile(state, unit, coord, occupancy));
}

export function canAirAssault(state: GameState, unitId: string, destination: HexCoord): { ok: true; helicopterId: string } | { ok: false; reason: AirAssaultFailureReason } {
  const launchState = getAirAssaultLaunchState(state, unitId);
  if (!launchState.ok) return launchState;
  const unit = state.units[unitId]!;
  const launchCity = findLaunchCity(state, unit)!;
  const range = airAssaultRange(state, launchCity.id);
  const visibility = state.civilizations[unit.owner]?.visibility;

  if (paradropDistance(state, unit.position, destination) > range) return { ok: false, reason: 'out-of-range' };
  if (visibility && !isVisible(visibility, destination)) return { ok: false, reason: 'unexplored' };
  const tile = state.map.tiles[hexKey(destination)];
  if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) {
    return { ok: false, reason: 'impassable-terrain' };
  }
  const occupancy = buildUnitOccupancy(state.units);
  if (getUnitIdsAtCoord(occupancy, destination).length > 0) return { ok: false, reason: 'destination-occupied' };
  const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(destination));
  if (city && isBlockingCityFor(state, unit, city)) return { ok: false, reason: 'foreign-city' };

  const inTargets = getAirAssaultTargets(state, unitId).some(t => hexKey(t) === hexKey(destination));
  if (!inTargets) return { ok: false, reason: 'out-of-range' };
  return { ok: true, helicopterId: launchState.helicopterId };
}

export type ParadropResult =
  | { ok: true; state: GameState; flak?: { damage: number; providerId: string; providerLabel: string }; interception?: { interceptorId: string; result: CombatResult } }
  | { ok: false; state: GameState; reason: ParadropFailureReason };

type ParadropOutcome = {
  flak?: { damage: number; providerId: string; providerLabel: string };
  interception?: { interceptorId: string; result: CombatResult };
  destroyed: boolean;
};

// Records the drop's outcome for both sides. Lives here (not the UI
// controller) so it fires identically for a human-triggered and an
// AI-triggered drop -- see end-to-end-wiring.md's "shared state mutations
// must be actor-complete" rule. Mirrors appendAirBaseLossNotifications's
// exact pre-copy-then-mutate pattern in air-operations-system.ts:
// appendNotification mutates its `state` argument in place, so build a
// state with fresh notificationLog/idCounters copies once, then call it
// per recipient.
function notifyAirborneOutcome(state: GameState, droppedUnit: Unit, destination: HexCoord, outcome: ParadropOutcome, verb: string): GameState {
  const nextState: GameState = {
    ...state,
    idCounters: { ...state.idCounters },
    notificationLog: Object.fromEntries(Object.entries(state.notificationLog ?? {}).map(([civId, entries]) => [civId, [...entries]])),
  };
  const name = UNIT_DEFINITIONS[droppedUnit.type].name;
  const parts: string[] = [];
  if (outcome.flak) parts.push(`${outcome.flak.damage} flak damage from ${outcome.flak.providerLabel}`);
  if (outcome.interception) parts.push('intercepted');
  const suffix = parts.length ? ` (${parts.join(', ')})` : '';
  appendNotification(nextState, droppedUnit.owner, {
    message: outcome.destroyed ? `${name} was destroyed ${verb}${suffix}.` : `${name} ${verb}${suffix}. It cannot act again this turn.`,
    type: outcome.destroyed || outcome.flak || outcome.interception ? 'warning' : 'info',
    turn: state.turn,
    target: { kind: 'map', coord: { ...destination }, label: name },
  });

  for (const civId of Object.keys(nextState.civilizations)) {
    if (civId === droppedUnit.owner || !isHostileOwnerTo(nextState, droppedUnit.owner, civId)) continue;
    const visibility = nextState.civilizations[civId]?.visibility;
    if (!visibility || !isVisible(visibility, destination)) continue;
    appendNotification(nextState, civId, {
      message: `An enemy ${name} has landed nearby.`,
      type: 'warning',
      turn: state.turn,
      target: { kind: 'map', coord: { ...destination }, label: name },
    });
  }
  return nextState;
}

function resolveAirborneLanding(state: GameState, unit: Unit, destination: HexCoord): {
  state: GameState;
  flak?: { damage: number; providerId: string; providerLabel: string };
  interception?: { interceptorId: string; result: CombatResult };
  survived: boolean;
} {
  // Relocate to the destination FIRST, before flak/interception resolve.
  // This is not cosmetic: buildCombatContextForDefender reads the
  // defender's *current position* to decide whether it's standing on a
  // city tile (cityBuildings, targetIsCity, friendly-city modifiers all
  // key off that). If the unit were still at its launch city when
  // interception resolves, it would be incorrectly treated as defending
  // inside a city -- the opposite of "lands vulnerable".
  let workingUnit: Unit = { ...unit, position: { ...destination } };

  // Flak first (deterministic chip damage from hostile ground AA covering the tile).
  const threat = getHostileAirDefenseThreat(state, unit, destination);
  const strongestProvider = threat.providers[0];
  let flak: { damage: number; providerId: string; providerLabel: string } | undefined;
  if (strongestProvider && threat.flatDefenseModifier > 0) {
    flak = { damage: threat.flatDefenseModifier, providerId: strongestProvider.id, providerLabel: strongestProvider.label };
    const health = workingUnit.health - threat.flatDefenseModifier;
    if (health <= 0) {
      const { [unit.id]: _removed, ...remainingUnits } = state.units;
      const owner = state.civilizations[unit.owner];
      const strippedState: GameState = {
        ...state,
        units: remainingUnits,
        civilizations: owner ? { ...state.civilizations, [unit.owner]: { ...owner, units: owner.units.filter(id => id !== unit.id) } } : state.civilizations,
      };
      return { state: strippedState, flak, survived: false };
    }
    workingUnit = { ...workingUnit, health };
  }

  // Interception second, against the (possibly flak-weakened) unit at its
  // destination, reusing #539's mechanism unchanged.
  let nextState: GameState = { ...state, units: { ...state.units, [unit.id]: workingUnit } };
  const interceptor = selectInterceptor(nextState, workingUnit, destination);
  let interception: { interceptorId: string; result: CombatResult } | undefined;
  if (interceptor) {
    const seed = deterministicCombatSeed(nextState.gameId, nextState.turn, interceptor.id, workingUnit.id);
    const result = resolveCombat(
      interceptor,
      workingUnit,
      nextState.map,
      seed,
      buildCombatContextForDefender(nextState, interceptor, workingUnit, { isIntercepting: true }),
      resolveCombatEra(nextState, interceptor, workingUnit),
    );
    nextState = applyCombatOutcomeToState(nextState, result, seed).state;
    if (nextState.units[interceptor.id]) {
      nextState = { ...nextState, units: { ...nextState.units, [interceptor.id]: { ...nextState.units[interceptor.id]!, interceptedTurn: state.turn } } };
    }
    interception = { interceptorId: interceptor.id, result };
    if (!nextState.units[unit.id]) {
      return { state: nextState, flak, interception, survived: false };
    }
  }

  return { state: nextState, flak, interception, survived: true };
}

export function executeParadrop(state: GameState, unitId: string, destination: HexCoord): ParadropResult {
  const check = canParadrop(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;

  const landing = resolveAirborneLanding(state, unit, destination);
  if (!landing.survived) {
    return { ok: true, state: notifyAirborneOutcome(landing.state, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: true }, 'landed'), flak: landing.flak, interception: landing.interception };
  }

  const survivor = landing.state.units[unitId]!;
  const landedState: GameState = {
    ...landing.state,
    units: { ...landing.state.units, [unitId]: { ...survivor, movementPointsLeft: 0, hasMoved: true, hasActed: true } },
  };
  return { ok: true, state: notifyAirborneOutcome(landedState, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: false }, 'landed'), flak: landing.flak, interception: landing.interception };
}

export type AirAssaultResult =
  | { ok: true; state: GameState; helicopterId: string; flak?: { damage: number; providerId: string; providerLabel: string }; interception?: { interceptorId: string; result: CombatResult } }
  | { ok: false; state: GameState; reason: AirAssaultFailureReason };

export function executeAirAssault(state: GameState, unitId: string, destination: HexCoord): AirAssaultResult {
  const check = canAirAssault(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;
  const helicopterId = check.helicopterId;

  const landing = resolveAirborneLanding(state, unit, destination);
  // The helicopter flew the mission regardless of the passenger's fate --
  // lock it out unconditionally, on top of whatever resolveAirborneLanding
  // already did to the passenger/interceptor.
  const lockedHelicopterState: GameState = {
    ...landing.state,
    units: {
      ...landing.state.units,
      [helicopterId]: { ...landing.state.units[helicopterId]!, movementPointsLeft: 0, hasMoved: true, hasActed: true },
    },
  };

  if (!landing.survived) {
    return {
      ok: true,
      state: notifyAirborneOutcome(lockedHelicopterState, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: true }, 'was flown in by helicopter'),
      helicopterId, flak: landing.flak, interception: landing.interception,
    };
  }

  const survivor = lockedHelicopterState.units[unitId]!;
  const landedState: GameState = {
    ...lockedHelicopterState,
    units: { ...lockedHelicopterState.units, [unitId]: { ...survivor, movementPointsLeft: 0, hasMoved: true, hasActed: true } },
  };
  return {
    ok: true,
    state: notifyAirborneOutcome(landedState, unit, destination, { flak: landing.flak, interception: landing.interception, destroyed: false }, 'was flown in by helicopter'),
    helicopterId, flak: landing.flak, interception: landing.interception,
  };
}
