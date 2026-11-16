import { getOwnedCityCount } from '@/systems/city-ownership';
import type { EventBus } from '@/core/event-bus';
import type { AirBaseRef, AirMission, City, CombatResult, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { hexesInRange, getWrappedHexesInRange } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { deterministicCombatSeed, resolveCombat } from './combat-system';
import { buildCombatContextForDefender } from './combat-context';
import { getVisibility } from './fog-of-war';
import { isHostileOwnerTo } from './owner-hostility';
import { applyCombatOutcomeToState } from './combat-reward-system';
import { appendLegendaryWonderMilitaryFacts } from './legendary-wonder-history';
import { applyCitySiegeOutcome, getCityGarrisonUnit, resolveCitySiegeDamage, type CitySiegeResult } from './city-siege-system';
import { resolveChallengeForCiv } from '@/core/opponent-challenge';
import { resolveCombatEra } from './era-resolution';
import { resolveCivilizationEra } from './tech-definitions';
import { recordCampPressureFromAirStrike } from './barbarian-pressure';
import { isWithinTacticalSamCoverage } from './air-defense-system';
import { claimTacticalFirstOwnerTurnInterception } from './legendary-wonder-tactical-effects';
import {
  getAirBaseCapacity,
  getAirBaseKind,
  getAirBaseRoster,
  getLegalRebaseDestinations,
  resolveAirBaseLoss,
  getAirBasePosition,
  isCompatibleBase,
  isSameAirBase,
  airDistance,
  type AirBaseLossResult,
} from './air-base-loss';
export { getAirBaseCapacity, getAirBaseKind, getAirBaseRoster, getLegalRebaseDestinations, resolveAirBaseLoss };
export type { AirBaseLossResult };
import { getAirMissionDenial, getAirReadinessCombatPenalty, withAirStrain } from './air-readiness';
import type { AirBaseFailureReason, AirOperationFailureReason, AirStrikeFailureReason } from './air-mission-failure';

export { AIR_MISSION_FAILURE_MESSAGES } from './air-mission-failure';
export type {
  AirBaseFailureReason,
  AirMissionFailureReason,
  AirOperationFailureReason,
  AirStrikeFailureReason,
} from './air-mission-failure';

export type AirOperationResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: AirOperationFailureReason };

export type AirStrikeResult =
  | { ok: true; state: GameState; interception?: { interceptorId: string; result: CombatResult }; targetResult?: CombatResult; cityResult?: { cityId: string; result: CitySiegeResult } }
  | { ok: false; state: GameState; reason: AirStrikeFailureReason };

export type AirBaseCheck =
  | { ok: true; base: Extract<AirBaseRef, { kind: 'city' }> }
  | { ok: false; reason: AirBaseFailureReason };

/**
 * May a new aircraft of `type` be based at `cityId`? `replacingUnitId` names an aircraft that becomes the new one
 * (an in-place upgrade): it already holds a slot, so it is not counted against the capacity.
 */
export function canCompleteAirUnitProduction(
  state: GameState,
  cityId: string,
  type: UnitType,
  replacingUnitId?: string,
): AirBaseCheck {
  const definition = UNIT_DEFINITIONS[type].airOperation;
  if (!definition) return { ok: false, reason: 'not-based-aircraft' };
  const city = state.cities[cityId];
  if (!city) return { ok: false, reason: 'base-missing' };
  const base: Extract<AirBaseRef, { kind: 'city' }> = { kind: 'city', cityId };
  if (!isCompatibleBase(state, { type } as Unit, base)) return { ok: false, reason: 'incompatible-base' };
  const occupied = getAirBaseRoster(state, base).filter(unit => unit.id !== replacingUnitId).length;
  if (occupied >= getAirBaseCapacity(state, base)) return { ok: false, reason: 'base-full' };
  return { ok: true, base };
}

export function baseNewAirUnit(state: GameState, cityId: string, unit: Unit): AirOperationResult {
  // `unit` may already be in `state` (an upgrade); its own slot is then not a competitor.
  const check = canCompleteAirUnitProduction(state, cityId, unit.type, unit.id);
  if (!check.ok) return { ok: false, state, reason: check.reason };
  const city = state.cities[cityId]!;
  return {
    ok: true,
    state: { ...state, units: { ...state.units, [unit.id]: { ...unit, airBase: check.base, position: { ...city.position } } } },
  };
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

export function getInterceptCoverage(state: GameState, unitId: string): HexCoord[] {
  const unit = state.units[unitId];
  const definition = unit && UNIT_DEFINITIONS[unit.type].airOperation;
  if (!unit || !unit.airBase || (unit.hasActed && unit.airMission !== 'intercept') || !definition?.missions.includes('intercept')) return [];
  return state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, definition.operationalRange, state.map.width)
    : hexesInRange(unit.position, definition.operationalRange);
}

/**
 * Could `unit` ever intercept `incoming` over `target`? Capability only — hostile, based, interceptor-
 * capable, in range. Whether it is actually on an intercept stance, or already spent its interception
 * this turn, is private to its owner and is `selectInterceptor`'s extra condition, not this one's.
 * The strike forecast (#1213) uses this alone, so it can only ever reason about what is public.
 */
export function canInterceptIncomingStrike(state: GameState, unit: Unit, incoming: Unit, target: { q: number; r: number }): boolean {
  const definition = UNIT_DEFINITIONS[unit.type].airOperation;
  return isHostileOwnerTo(state, unit.owner, incoming.owner)
    && unit.airBase !== undefined
    && definition?.missions.includes('intercept') === true
    && airDistance(state, unit.position, target) <= definition.operationalRange;
}

/** The interception order: strongest effective interception strength, then health, then id. */
export function pickStrongestInterceptor(candidates: readonly Unit[]): Unit | undefined {
  return [...candidates].sort((left, right) => {
    const leftStrength = getInterceptionStrength(left);
    const rightStrength = getInterceptionStrength(right);
    return rightStrength - leftStrength || right.health - left.health || left.id.localeCompare(right.id);
  })[0];
}

export function selectInterceptor(state: GameState, incoming: Unit, target: { q: number; r: number }): Unit | undefined {
  return pickStrongestInterceptor(Object.values(state.units)
    .filter(unit => canInterceptIncomingStrike(state, unit, incoming, target)
      && unit.airMission === 'intercept'
      && (unit.interceptedTurn === undefined || unit.interceptedTurn !== state.turn)));
}

/** Raw damage an air strike deals a city: strength x health x readiness (the one formula; see `resolveAirStrike`). */
export function getAirStrikeCityRawDamage(striker: Unit): number {
  return Math.max(1, Math.round(UNIT_DEFINITIONS[striker.type].strength * striker.health / 100 * getAirReadinessCombatPenalty(striker).multiplier));
}

function getInterceptionStrength(unit: Unit): number {
  const definition = UNIT_DEFINITIONS[unit.type];
  const multiplier = definition.airOperation?.interceptionStrengthMultiplier ?? 1;
  return definition.strength * unit.health / 100 * multiplier;
}

export function getLegalAirMissionTargets(state: GameState, unitId: string, mission: Extract<AirMission, 'recon' | 'strike' | 'patrol'>): HexCoord[] {
  const unit = state.units[unitId];
  const definition = unit && UNIT_DEFINITIONS[unit.type].airOperation;
  if (!unit || !definition?.missions.includes(mission) || !unit.airBase || unit.hasActed) return [];
  if (mission === 'strike') {
    // #884: readiness is one gate; the UI shows its typed denial, so an empty list is never unexplained.
    if (getAirMissionDenial(state, unitId, 'strike')) return [];
    const visibility = state.civilizations[unit.owner]?.visibility;
    return Object.values(state.units)
      .filter(candidate => !candidate.airBase
        && isHostileOwnerTo(state, unit.owner, candidate.owner)
        && (!visibility || getVisibility(visibility, candidate.position) === 'visible')
        && airDistance(state, unit.position, candidate.position) <= definition.operationalRange)
      .map(candidate => ({ ...candidate.position }))
      .concat(Object.values(state.cities)
        .filter(city => isHostileOwnerTo(state, unit.owner, city.owner)
          && (!visibility || getVisibility(visibility, city.position) === 'visible')
          && airDistance(state, unit.position, city.position) <= definition.operationalRange)
        .map(city => ({ ...city.position })));
  }
  return state.map.wrapsHorizontally
    ? getWrappedHexesInRange(unit.position, definition.operationalRange, state.map.width)
    : hexesInRange(unit.position, definition.operationalRange);
}

export function resolveReconMission(state: GameState, unitId: string, center: HexCoord): AirOperationResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit' };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };
  if (!getLegalAirMissionTargets(state, unitId, 'recon')
    .some(target => target.q === center.q && target.r === center.r)) {
    return { ok: false, state, reason: 'invalid-recon-target' };
  }
  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [unitId]: withAirStrain({ ...unit, movementPointsLeft: 0, hasMoved: true, hasActed: true }, 'recon'),
      },
      reconReveals: [
        ...(state.reconReveals ?? []).filter(reveal => reveal.expiresAtTurn >= state.turn),
        { ownerCivId: unit.owner, center: { ...center }, range: 3, expiresAtTurn: state.turn },
      ],
    },
  };
}

export function resolvePatrolMission(state: GameState, unitId: string, center: HexCoord): AirOperationResult {
  const unit = state.units[unitId];
  if (!unit) return { ok: false, state, reason: 'missing-unit' };
  if (unit.hasActed) return { ok: false, state, reason: 'already-acted' };
  if (!getLegalAirMissionTargets(state, unitId, 'patrol')
    .some(target => target.q === center.q && target.r === center.r)) {
    return { ok: false, state, reason: 'invalid-patrol-target' };
  }
  const range = 6;
  return {
    ok: true,
    state: {
      ...state,
      units: {
        ...state.units,
        [unitId]: withAirStrain({ ...unit, movementPointsLeft: 0, hasMoved: true, hasActed: true }, 'patrol'),
      },
      // Ordinary reconnaissance half -- reused verbatim, same array and
      // consumer (applyReconReveals) 'recon' missions already use.
      reconReveals: [
        ...(state.reconReveals ?? []).filter(reveal => reveal.expiresAtTurn >= state.turn),
        { ownerCivId: unit.owner, center: { ...center }, range, expiresAtTurn: state.turn },
      ],
      // Submarine-detection half -- separate array, consumed by
      // concealment.ts's hasActiveDetectorInRange.
      patrolReveals: [
        ...(state.patrolReveals ?? []).filter(reveal => reveal.expiresAtTurn >= state.turn),
        { ownerCivId: unit.owner, center: { ...center }, range, expiresAtTurn: state.turn },
      ],
    },
  };
}

function applyAirCombatResult(state: GameState, result: CombatResult, seed: number, bus?: EventBus): GameState {
  return applyCombatOutcomeToState(state, result, seed, bus).state;
}

/** What a strike at `target` hits: a city if one stands there, else the first non-based enemy unit. Shared with the forecast. */
export function resolveAirStrikeTarget(state: GameState, striker: Unit, target: HexCoord): { city?: City; unit?: Unit } {
  const city = Object.values(state.cities).find(candidate => candidate.position.q === target.q && candidate.position.r === target.r);
  if (city) return { city };
  const unit = Object.values(state.units).find(candidate => !candidate.airBase && candidate.owner !== striker.owner && candidate.position.q === target.q && candidate.position.r === target.r);
  return { unit };
}

/**
 * The one eligibility source for an air strike (#1223): the executor (`resolveAirStrike`) and the #1213 forecast
 * preflight both ask it, so a strike the player is shown is a strike the executor will accept, and the two can only
 * ever explain a refusal in the same words. `null` means legal. Viewer-blind by design: it reads the striker's own
 * visibility the same way `getLegalAirMissionTargets` does, and an unseen hostile unit is refused exactly like an
 * empty hex.
 */
export function getAirStrikeDenial(state: GameState, unitId: string, target: HexCoord): AirStrikeFailureReason | null {
  const striker = state.units[unitId];
  const definition = striker && UNIT_DEFINITIONS[striker.type].airOperation;
  if (!striker || !definition?.missions.includes('strike') || !striker.airBase) return 'ineligible-strike';
  if (striker.hasActed) return 'already-acted';
  const readinessDenial = getAirMissionDenial(state, unitId, 'strike');
  if (readinessDenial) return readinessDenial.reason;
  if (airDistance(state, striker.position, target) > definition.operationalRange) return 'out-of-range';
  if (!getLegalAirMissionTargets(state, unitId, 'strike').some(candidate => candidate.q === target.q && candidate.r === target.r)) {
    return 'invalid-strike-target';
  }
  const { city, unit } = resolveAirStrikeTarget(state, striker, target);
  if (!unit && !city) return 'missing-target';
  return null;
}

export function resolveAirStrike(state: GameState, unitId: string, target: HexCoord, bus?: EventBus): AirStrikeResult {
  const denial = getAirStrikeDenial(state, unitId, target);
  if (denial) return { ok: false, state, reason: denial };
  const striker = state.units[unitId]!;
  const { city: targetCity, unit: targetUnit } = resolveAirStrikeTarget(state, striker, target);
  let nextState = state;
  const interceptor = selectInterceptor(state, striker, target);
  let interception: { interceptorId: string; result: CombatResult } | undefined;
  if (interceptor) {
    const tacticalClaim = claimTacticalFirstOwnerTurnInterception(
      nextState,
      interceptor.owner,
      isWithinTacticalSamCoverage(nextState, interceptor.owner, interceptor.position),
    );
    nextState = tacticalClaim.state;
    // attack-contract-exempt: air-mission: interception is part of the air-mission contract (getLegalAirMissionTargets / getAirMissionDenial), see #1223
    const result = resolveCombat(interceptor, striker, state.map, deterministicCombatSeed(state.gameId, state.turn, interceptor.id, striker.id), buildCombatContextForDefender(nextState, interceptor, striker, {
      isIntercepting: true,
      tacticalInterceptionMultiplier: tacticalClaim.multiplier,
    }), resolveCombatEra(state, interceptor, striker));
    nextState = applyAirCombatResult(nextState, result, deterministicCombatSeed(state.gameId, state.turn, interceptor.id, striker.id), bus);
    if (nextState.units[interceptor.id]) nextState = { ...nextState, units: { ...nextState.units, [interceptor.id]: withAirStrain({ ...nextState.units[interceptor.id]!, interceptedTurn: state.turn }, 'interception') } };
    if (nextState.units[interceptor.id] && !nextState.units[striker.id]) {
      nextState = appendLegendaryWonderMilitaryFacts(nextState, [{
        id: `interception:${state.turn}:${interceptor.id}:${striker.id}`,
        kind: 'successful-interception',
        civId: interceptor.owner,
        interceptorId: interceptor.id,
        turn: state.turn,
      }]);
    }
    interception = { interceptorId: interceptor.id, result };
    if (!nextState.units[striker.id]) return { ok: true, state: nextState, interception };
  }
  const currentStriker = nextState.units[striker.id]!;
  if (targetCity) {
    const currentCity = nextState.cities[targetCity.id];
    const ownerCiv = currentCity && nextState.civilizations[currentCity.owner];
    if (!currentCity || !ownerCiv) return { ok: false, state, reason: 'missing-target' };
    const cityResult = resolveCitySiegeDamage({
      city: currentCity,
      ownerCiv,
      rawDamage: getAirStrikeCityRawDamage(currentStriker),
      attackerDomain: 'air',
      hasGarrison: getCityGarrisonUnit(nextState.units, currentCity) !== undefined,
      isOwnersLastCity: getOwnedCityCount(nextState, currentCity.owner) <= 1,
      era: resolveCivilizationEra(ownerCiv.techState.completed),
      challenge: resolveChallengeForCiv(nextState, currentCity.owner),
    });
    nextState = applyCitySiegeOutcome(nextState, currentCity.id, cityResult);
    if (nextState.units[unitId]) nextState = { ...nextState, units: { ...nextState.units, [unitId]: withAirStrain({ ...nextState.units[unitId]!, movementPointsLeft: 0, hasMoved: true, hasActed: true }, 'strike') } };
    return { ok: true, state: recordCampPressureFromAirStrike(nextState, striker, target), interception, cityResult: { cityId: currentCity.id, result: cityResult } };
  }
  const currentTarget = targetUnit && nextState.units[targetUnit.id];
  if (!currentTarget) return { ok: true, state: { ...nextState, units: { ...nextState.units, [unitId]: withAirStrain({ ...currentStriker, movementPointsLeft: 0, hasMoved: true, hasActed: true }, 'strike') } }, interception };
  // attack-contract-exempt: air-mission: the strike target was validated by getLegalAirMissionTargets above, see #1223
  const targetResult = resolveCombat(currentStriker, currentTarget, nextState.map, deterministicCombatSeed(nextState.gameId, nextState.turn, currentStriker.id, currentTarget.id), buildCombatContextForDefender(nextState, currentStriker, currentTarget), resolveCombatEra(nextState, currentStriker, currentTarget));
  nextState = applyAirCombatResult(nextState, targetResult, deterministicCombatSeed(nextState.gameId, nextState.turn, currentStriker.id, currentTarget.id), bus);
  if (nextState.units[unitId]) nextState = { ...nextState, units: { ...nextState.units, [unitId]: withAirStrain({ ...nextState.units[unitId]!, movementPointsLeft: 0, hasMoved: true, hasActed: true }, 'strike') } };
  return { ok: true, state: recordCampPressureFromAirStrike(nextState, striker, target), interception, targetResult };
}

