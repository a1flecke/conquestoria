import type { CombatResult, GameState, HexCoord, Unit } from '@/core/types';
import { getAirBaseKind, selectInterceptor } from '@/systems/air-operations-system';
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

export function getParadropTargets(state: GameState, unitId: string): HexCoord[] {
  const launchState = getParadropLaunchState(state, unitId);
  if (!launchState.ok) return [];
  const unit = state.units[unitId]!;
  const capability = UNIT_DEFINITIONS[unit.type].paradrop!;
  const visibility = state.civilizations[unit.owner]?.visibility;
  const occupancy = buildUnitOccupancy(state.units);
  const candidates = state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, capability.range, state.map.width)
    : hexesInRange(unit.position, capability.range);

  return candidates.filter(coord => {
    if (visibility && !isVisible(visibility, coord)) return false;
    const tile = state.map.tiles[hexKey(coord)];
    if (!tile || getMovementCostForUnit(tile.terrain, 'land', UNIT_DEFINITIONS[unit.type].terrainCostOverrides) === Infinity) return false;
    if (getUnitIdsAtCoord(occupancy, coord).length > 0) return false;
    const city = Object.values(state.cities).find(c => hexKey(c.position) === hexKey(coord));
    if (city && isBlockingCityFor(state, unit, city)) return false;
    return true;
  });
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
function notifyParadropOutcome(state: GameState, droppedUnit: Unit, destination: HexCoord, outcome: ParadropOutcome): GameState {
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
    message: outcome.destroyed ? `${name} was destroyed on the drop${suffix}.` : `${name} landed${suffix}. It cannot act again this turn.`,
    type: outcome.destroyed || outcome.flak || outcome.interception ? 'warning' : 'info',
    turn: state.turn,
    target: { kind: 'map', coord: { ...destination }, label: name },
  });

  for (const civId of Object.keys(nextState.civilizations)) {
    if (civId === droppedUnit.owner || !isHostileOwnerTo(nextState, droppedUnit.owner, civId)) continue;
    const visibility = nextState.civilizations[civId]?.visibility;
    if (!visibility || !isVisible(visibility, destination)) continue;
    appendNotification(nextState, civId, {
      message: 'An enemy Paratrooper has landed nearby.',
      type: 'warning',
      turn: state.turn,
      target: { kind: 'map', coord: { ...destination }, label: 'Paratrooper' },
    });
  }
  return nextState;
}

export function executeParadrop(state: GameState, unitId: string, destination: HexCoord): ParadropResult {
  const check = canParadrop(state, unitId, destination);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const unit = state.units[unitId]!;

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
      const { [unitId]: _removed, ...remainingUnits } = state.units;
      const owner = state.civilizations[unit.owner];
      const strippedState: GameState = {
        ...state,
        units: remainingUnits,
        civilizations: owner ? { ...state.civilizations, [unit.owner]: { ...owner, units: owner.units.filter(id => id !== unitId) } } : state.civilizations,
      };
      return { ok: true, state: notifyParadropOutcome(strippedState, unit, destination, { flak, destroyed: true }), flak };
    }
    workingUnit = { ...workingUnit, health };
  }

  // Interception second, against the (possibly flak-weakened) unit at its
  // destination, reusing #539's mechanism unchanged.
  let nextState: GameState = { ...state, units: { ...state.units, [unitId]: workingUnit } };
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
    if (!nextState.units[unitId]) {
      return { ok: true, state: notifyParadropOutcome(nextState, unit, destination, { flak, interception, destroyed: true }), flak, interception };
    }
  }

  const survivor = nextState.units[unitId]!;
  const landedState: GameState = {
    ...nextState,
    units: { ...nextState.units, [unitId]: { ...survivor, movementPointsLeft: 0, hasMoved: true, hasActed: true } },
  };
  return { ok: true, state: notifyParadropOutcome(landedState, unit, destination, { flak, interception, destroyed: false }), flak, interception };
}
