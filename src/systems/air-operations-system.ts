import { getOwnedCityCount } from '@/systems/city-ownership';
import { fnv1a32CodePointLead } from './deterministic-hash';
import type { EventBus } from '@/core/event-bus';
import type { AirBaseRef, AirMission, City, CombatResult, GameState, HexCoord, Unit, UnitType } from '@/core/types';
import { hexDistance, hexesInRange, getWrappedHexesInRange, wrappedHexDistance } from './hex-utils';
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
import { appendNotification } from '@/core/notification-log';
import { recordCampPressureFromAirStrike } from './barbarian-pressure';
import { isWithinTacticalSamCoverage } from './air-defense-system';
import { claimTacticalFirstOwnerTurnInterception } from './legendary-wonder-tactical-effects';
import { removeUnits } from '@/systems/unit-removal-system';
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

export interface AirBaseLossResult {
  state: GameState;
  outcomes: Array<{ aircraftId: string; outcome: 'destroyed' | 'evacuated' | 'captured' }>;
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
          units: { ...nextState.units, [unit.id]: { ...current, owner: cause.victorId } },
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
