/**
 * Border confrontations (#1766): a civ whose cities are approached by another civ's armed units can demand a
 * withdrawal, and the intruder answers with either a timed promise or a refusal.
 *
 * One legality owner (`getBorderConfrontationEligibility`) is shared by the human preview, the executor and the AI.
 * Everything it reads about the other side is viewer-safe: the approached civ must actually see an armed unit inside
 * the existing `BORDER_TENSION_RADIUS`, and a city it has not found never counts. The radius, the armed-unit test and
 * the seam handling all come from `hasBorderTension`; this module adds no second distance rule.
 *
 * Lifecycle:
 *   demand (pending request, type `withdrawal`)
 *     -> accept: a `BorderConfrontation` promise with a deadline
 *          -> fulfilled at the deadline: relations improve
 *          -> broken at the deadline: relations worsen and the existing treachery reputation applies
 *          -> invalidated when war/alliance/Open Borders/vassalage/elimination makes it moot
 *     -> refuse: immediate relationship penalty, no treachery
 *
 * A pending demand and an accepted promise are mutually exclusive for a pair, and a pair may not be confronted again
 * inside `BORDER_CONFRONTATION_COOLDOWN_TURNS`. Refusal or betrayal never declares war; that remains the actor's
 * separate decision through the ordinary war path.
 */
import type { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import type { BorderConfrontation, PendingDiplomaticRequest } from '@/core/types/diplomacy';
import { getCivilizationLiveness } from './civilization-liveness';
import { resolveCivDefinition } from './civ-registry';
import { hasExploredCoord, hasMetCivilization } from './discovery-system';
import { isVisible } from './fog-of-war';
import { getRelationship, isAtWar } from './diplomacy-queries';
import { isDiplomaticRequestLive } from './diplomacy-requests';
import { modifyRelationship, withDiplomacy } from './diplomacy-state';
import { applyTreachery, broadcastTreacheryPenalty } from './diplomacy-treachery';
import { buildViewerMilitaryIntel, estimatePerceivedCivStrength } from './diplomatic-strength';
import { BORDER_TENSION_RADIUS, getBorderTensionCities, hasBorderTension, type BorderTensionKnowledge } from './border-tension';
import { classifyTerritorialRelation } from './territorial-access';
import { hexKey, mapDistance, mapHexesInRange } from './hex-utils';
import { resolveCivilizationEra } from './tech-definitions';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { findPath } from './unit-pathfinding';
import { evaluateBorderWithdrawalConsent } from '@/ai/ai-border-consent';
import type { HexCoord } from '@/core/types/hex';

/** Turns the intruder has to clear the disputed radius after accepting a demand. */
export const BORDER_WITHDRAWAL_PROMISE_TURNS = 5;
/** Turns after the most recent demand between a pair before another may be made. */
export const BORDER_CONFRONTATION_COOLDOWN_TURNS = 12;
/** Immediate, larger relationship cost of refusing outright; carries no treachery/reputation cost. */
export const BORDER_WITHDRAWAL_REFUSAL_RELATIONSHIP_PENALTY = 15;
/** Relationship benefit of clearing the radius before the deadline. */
export const BORDER_WITHDRAWAL_KEPT_RELATIONSHIP_BONUS = 8;
/** Relationship cost of an accepted promise the intruder did not honour. */
export const BORDER_WITHDRAWAL_BROKEN_RELATIONSHIP_PENALTY = 10;
/** Resolved records are kept this long for the panel's "what happened" line, then pruned (cooldown is shorter). */
export const BORDER_CONFRONTATION_RECORD_RETENTION_TURNS = 30;

export type BorderConfrontationDenialReason =
  | 'unknown-civilization'
  | 'self'
  | 'not-alive'
  | 'no-contact'
  | 'at-war'
  | 'allied'
  | 'open-borders'
  | 'vassal-relationship'
  | 'no-border-tension'
  | 'active-confrontation'
  | 'cooldown';

/** Player-facing copy. Deliberately never names a civilization (hot-seat: no leaks). */
export const BORDER_CONFRONTATION_DENIAL_MESSAGES: Record<BorderConfrontationDenialReason, string> = {
  'unknown-civilization': 'That civilization is not known to you.',
  self: 'You cannot demand that of yourself.',
  'not-alive': 'One of the civilizations is no longer active.',
  'no-contact': 'You have not met this civilization.',
  'at-war': 'You are at war with them. There is no border agreement to make; fight or seek peace.',
  allied: 'You cannot demand withdrawal from an ally.',
  'open-borders': 'Open Borders already gives their troops passage.',
  'vassal-relationship': 'A vassal relationship already governs your dealings with them.',
  'no-border-tension': 'Their armed units are not near your cities.',
  'active-confrontation': 'A border confrontation between you is already under way.',
  cooldown: 'A border demand was made recently. Wait before demanding again.',
};

export type BorderConfrontationEligibility =
  | { ok: true }
  | { ok: false; reason: BorderConfrontationDenialReason };

export interface BorderConfrontationEligibilityOptions {
  /**
   * `respond` revalidates only the structural facts when a recipient answers a pending demand: the demand was
   * legitimate when made, and the answer must not depend on whether the intruder has already moved.
   */
  mode?: 'propose' | 'respond';
  /** Override the approached civ's knowledge filter (tests and the AI's own-units assessment). */
  knowledge?: BorderTensionKnowledge;
}

/** The viewer-safe knowledge the approached civ has of the intruder's armed units. */
function demanderKnowledge(state: GameState, hostCivId: string): BorderTensionKnowledge {
  const visibility = state.civilizations[hostCivId]?.visibility;
  return {
    unitKnown: unit => Boolean(visibility && isVisible(visibility, unit.position)),
  };
}

function pendingWithdrawalBetween(
  state: GameState,
  civA: string,
  civB: string,
): PendingDiplomaticRequest | undefined {
  return (state.pendingDiplomacyRequests ?? []).find(request =>
    request.type === 'withdrawal'
    && ((request.fromCivId === civA && request.toCivId === civB)
      || (request.fromCivId === civB && request.toCivId === civA)));
}

export function getBorderConfrontations(state: GameState): BorderConfrontation[] {
  return (state.borderConfrontations ?? []).filter(record =>
    record
    && typeof record.id === 'string'
    && typeof record.hostCivId === 'string'
    && typeof record.intruderCivId === 'string'
    && Number.isInteger(record.issuedTurn));
}

/** The live promise between a pair, in either direction. A promise is live only while its status says so. */
export function getActiveBorderPromise(
  state: GameState,
  civA: string,
  civB: string,
): BorderConfrontation | undefined {
  return getBorderConfrontations(state).find(record =>
    record.status === 'promised'
    && ((record.hostCivId === civA && record.intruderCivId === civB)
      || (record.hostCivId === civB && record.intruderCivId === civA)));
}

/** The most recent answered confrontation between a pair, in either direction (for the panel's outcome line). */
export function getLastBorderConfrontation(
  state: GameState,
  civA: string,
  civB: string,
): BorderConfrontation | undefined {
  let latest: BorderConfrontation | undefined;
  for (const record of getBorderConfrontations(state)) {
    if ((record.hostCivId === civA && record.intruderCivId === civB)
      || (record.hostCivId === civB && record.intruderCivId === civA)) {
      if (!latest || record.issuedTurn >= latest.issuedTurn) latest = record;
    }
  }
  return latest;
}

/**
 * Has the visible situation cleared the disputed radius, as `viewerId` can legitimately tell? The host sees only
 * units it currently sees; the intruder sees its own units against cities it has explored. Never reveals a hidden
 * unit or an unexplored city, and is the single derivation the panel/renderer use.
 */
export function getBorderConfrontationStatusForViewer(
  state: GameState,
  viewerId: string,
  record: BorderConfrontation,
): boolean {
  if (viewerId === record.hostCivId) {
    const visibility = state.civilizations[viewerId]?.visibility;
    return !hasBorderTension(state, record.hostCivId, record.intruderCivId, {
      unitKnown: unit => Boolean(visibility && isVisible(visibility, unit.position)),
    });
  }
  if (viewerId === record.intruderCivId) {
    return !hasBorderTension(state, record.hostCivId, record.intruderCivId, {
      cityKnown: city => hasExploredCoord(state, viewerId, city.position),
    });
  }
  return true;
}

/** One pending demand or live promise for the pair counts as an active confrontation. */
export function hasActiveBorderConfrontation(state: GameState, civA: string, civB: string): boolean {
  return Boolean(pendingWithdrawalBetween(state, civA, civB) ?? getActiveBorderPromise(state, civA, civB));
}

/** Turn of the most recent demand between the pair, from either side's diplomatic history (nothing extra persisted). */
export function getLastBorderDemandTurn(state: GameState, civA: string, civB: string): number | null {
  let latest: number | null = null;
  const scan = (holderId: string, otherId: string) => {
    for (const event of state.civilizations[holderId]?.diplomacy.events ?? []) {
      if (event.type === 'border_withdrawal_demanded' && event.otherCiv === otherId
        && (latest === null || event.turn > latest)) latest = event.turn;
    }
  };
  scan(civA, civB);
  scan(civB, civA);
  return latest;
}

/**
 * May `hostCivId` demand that `intruderCivId` pull back? The approached civ must see an armed unit inside the existing
 * border-tension radius, the pair must be at peace, and no treaty that grants passage may be in force.
 */
export function getBorderConfrontationEligibility(
  state: GameState,
  hostCivId: string,
  intruderCivId: string,
  options: BorderConfrontationEligibilityOptions = {},
): BorderConfrontationEligibility {
  const mode = options.mode ?? 'propose';
  const deny = (reason: BorderConfrontationDenialReason): BorderConfrontationEligibility => ({ ok: false, reason });
  const host = state.civilizations[hostCivId];
  const intruder = state.civilizations[intruderCivId];
  if (!host || !intruder) return deny('unknown-civilization');
  if (hostCivId === intruderCivId) return deny('self');
  if (!getCivilizationLiveness(state, hostCivId).living || !getCivilizationLiveness(state, intruderCivId).living) {
    return deny('not-alive');
  }
  if (!hasMetCivilization(state, hostCivId, intruderCivId)) return deny('no-contact');
  if (isAtWar(host.diplomacy, intruderCivId) || isAtWar(intruder.diplomacy, hostCivId)) return deny('at-war');

  const relation = classifyTerritorialRelation(state, intruderCivId, hostCivId);
  if (relation === 'alliance') return deny('allied');
  if (relation === 'open-borders') return deny('open-borders');
  if (relation === 'vassalage') return deny('vassal-relationship');

  if (mode === 'respond') return { ok: true };

  if (pendingWithdrawalBetween(state, hostCivId, intruderCivId)
    || getActiveBorderPromise(state, hostCivId, intruderCivId)) return deny('active-confrontation');
  const last = getLastBorderDemandTurn(state, hostCivId, intruderCivId);
  if (last !== null && state.turn - last < BORDER_CONFRONTATION_COOLDOWN_TURNS) return deny('cooldown');

  const knowledge = options.knowledge ?? demanderKnowledge(state, hostCivId);
  if (!hasBorderTension(state, hostCivId, intruderCivId, knowledge)) return deny('no-border-tension');
  return { ok: true };
}

export interface BorderWithdrawalFeasibility {
  /** Armed intruder units currently inside the radius of a host city the intruder knows. */
  violatingUnitCount: number;
  /** How many of those have a legal route to a tile outside every threatened radius. */
  withdrawableUnitCount: number;
}

function isArmedUnit(unit: Pick<Unit, 'type'>): boolean {
  return (UNIT_DEFINITIONS[unit.type]?.strength ?? 0) > 0;
}

function unitMovementDomain(unit: Pick<Unit, 'type'>): 'land' | 'naval' | 'air' {
  const domain = UNIT_DEFINITIONS[unit.type]?.domain;
  return domain === 'naval' || domain === 'air' ? domain : 'land';
}

/**
 * Can this unit reach any tile outside every threatened radius? Used both by the AI's acceptance decision and by the
 * withdrawal planner, so "will you comply?" and "can you comply?" never disagree about reachability.
 */
export function canUnitWithdrawFromBorder(
  state: GameState,
  unit: Pick<Unit, 'type' | 'position'> & { owner: string },
  cityPositions: readonly HexCoord[],
): boolean {
  if (cityPositions.length === 0) return true;
  const candidates: HexCoord[] = [];
  const seen = new Set<string>();
  for (const city of cityPositions) {
    for (const coord of mapHexesInRange(state.map, city, BORDER_TENSION_RADIUS + 1)) {
      const key = `${coord.q},${coord.r}`;
      if (seen.has(key) || !state.map.tiles[key]) continue;
      seen.add(key);
      if (cityPositions.some(position => mapDistance(state.map, coord, position) <= BORDER_TENSION_RADIUS)) continue;
      candidates.push(coord);
    }
  }
  const completedTechs = state.civilizations[unit.owner]?.techState.completed;
  for (const candidate of candidates) {
    if (findPath(unit.position, candidate, state.map, unitMovementDomain(unit), { unit, completedTechs })) return true;
  }
  return false;
}

/** The intruder's own, legitimate view: its units against the host cities it has actually found. */
export function assessBorderWithdrawalFeasibility(
  state: GameState,
  intruderCivId: string,
  hostCivId: string,
): BorderWithdrawalFeasibility {
  const intruder = state.civilizations[intruderCivId];
  const host = state.civilizations[hostCivId];
  if (!intruder || !host) return { violatingUnitCount: 0, withdrawableUnitCount: 0 };
  const cities = host.cities
    .map(id => state.cities[id])
    .filter((city): city is NonNullable<typeof city> =>
      Boolean(city && city.owner === hostCivId && hasExploredCoord(state, intruderCivId, city.position)))
    .map(city => city.position);
  const violating = intruder.units
    .map(id => state.units[id])
    .filter((unit): unit is Unit => Boolean(unit && unit.owner === intruderCivId && isArmedUnit(unit)))
    .filter(unit => cities.some(city => mapDistance(state.map, unit.position, city) <= BORDER_TENSION_RADIUS));
  return {
    violatingUnitCount: violating.length,
    withdrawableUnitCount: violating.filter(unit => canUnitWithdrawFromBorder(state, unit, cities)).length,
  };
}

export type BorderWithdrawalDecision = {
  accepted: boolean;
  feasibility: BorderWithdrawalFeasibility;
};

/**
 * The intruder AI's answer, from its own perception only: its relationship view of the host, its personality, its own
 * strength against the host's conservative perceived strength, and whether it can actually clear the radius.
 */
export function decideBorderWithdrawalAsAI(
  state: GameState,
  intruderCivId: string,
  hostCivId: string,
): BorderWithdrawalDecision {
  const intruder = state.civilizations[intruderCivId];
  const feasibility = assessBorderWithdrawalFeasibility(state, intruderCivId, hostCivId);
  if (!intruder) return { accepted: false, feasibility };
  const definition = resolveCivDefinition(state, intruder.civType ?? '');
  const era = resolveCivilizationEra(intruder.techState.completed);
  const intel = buildViewerMilitaryIntel(state, intruderCivId);
  const ownStrength = estimatePerceivedCivStrength(intel, intruderCivId, era).midpoint;
  const hostStrength = estimatePerceivedCivStrength(intel, hostCivId, era);
  return {
    accepted: evaluateBorderWithdrawalConsent({
      relationship: getRelationship(intruder.diplomacy, hostCivId),
      diplomacyFocus: definition?.personality.diplomacyFocus ?? 0.5,
      warLikelihood: definition?.personality.warLikelihood ?? 0.5,
      ownStrength,
      hostStrengthLower: hostStrength.uncertaintyLower,
      hostObserved: hostStrength.hasUsableObservation,
      violatingUnitCount: feasibility.violatingUnitCount,
      withdrawableUnitCount: feasibility.withdrawableUnitCount,
    }).accepted,
    feasibility,
  };
}

function withDiplomaticEvent(state: GameState, civId: string, type: string, otherCiv: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  return withDiplomacy(state, civId, {
    ...civ.diplomacy,
    events: [...civ.diplomacy.events, { type, turn: state.turn, otherCiv, weight: 1 }],
  });
}

function appendRecord(state: GameState, record: BorderConfrontation): GameState {
  return { ...state, borderConfrontations: [...(state.borderConfrontations ?? []), record] };
}

function removeRequest(state: GameState, requestId: string): GameState {
  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request => request.id !== requestId),
  };
}

export type BorderWithdrawalDemandResult =
  | { ok: true; state: GameState; request: PendingDiplomaticRequest }
  | { ok: false; state: GameState; reason: BorderConfrontationDenialReason };

/**
 * Makes the demand: legality is re-resolved here (never trusted from a preview), and a pending request is addressed to
 * the intruder. The recipient answers through `acceptWithdrawalDemand` / `refuseWithdrawalDemand`; nothing is
 * auto-accepted here.
 */
export function demandWithdrawal(
  state: GameState,
  hostCivId: string,
  intruderCivId: string,
  bus?: EventBus,
  options: BorderConfrontationEligibilityOptions = {},
): BorderWithdrawalDemandResult {
  const eligibility = getBorderConfrontationEligibility(state, hostCivId, intruderCivId, {
    ...options,
    mode: 'propose',
  });
  if (!eligibility.ok) return { ok: false, state, reason: eligibility.reason };

  const request: PendingDiplomaticRequest = {
    id: `withdrawal:${hostCivId}:${intruderCivId}:${state.turn}`,
    type: 'withdrawal',
    fromCivId: hostCivId,
    toCivId: intruderCivId,
    turnIssued: state.turn,
    turnsRemaining: BORDER_WITHDRAWAL_PROMISE_TURNS,
  };
  let next: GameState = { ...state, pendingDiplomacyRequests: [...(state.pendingDiplomacyRequests ?? []), request] };
  next = withDiplomaticEvent(next, hostCivId, 'border_withdrawal_demanded', intruderCivId);
  next = withDiplomaticEvent(next, intruderCivId, 'border_withdrawal_demanded', hostCivId);
  bus?.emit('diplomacy:withdrawal-demanded', { hostCivId, intruderCivId, requestId: request.id });
  return { ok: true, state: next, request };
}

export type BorderWithdrawalResponseResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: 'request-not-found' | 'request-no-longer-valid' };

function findWithdrawalRequest(
  state: GameState,
  actingCivId: string,
  requestId: string,
): PendingDiplomaticRequest | undefined {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  return request && request.type === 'withdrawal' && request.toCivId === actingCivId ? request : undefined;
}

/**
 * Accepting creates the timed promise after revalidating the structural facts. The deadline is fixed now; a later
 * change (war, alliance, Open Borders, vassalage, elimination) invalidates the promise without penalty.
 */
export function acceptWithdrawalDemand(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus?: EventBus,
): BorderWithdrawalResponseResult {
  const request = findWithdrawalRequest(state, actingCivId, requestId);
  if (!request) return { ok: false, state, reason: 'request-not-found' };
  if (!isDiplomaticRequestLive(state, request)) return { ok: false, state, reason: 'request-no-longer-valid' };
  const eligibility = getBorderConfrontationEligibility(state, request.fromCivId, request.toCivId, { mode: 'respond' });
  if (!eligibility.ok) return { ok: false, state, reason: 'request-no-longer-valid' };

  const record: BorderConfrontation = {
    id: request.id,
    hostCivId: request.fromCivId,
    intruderCivId: request.toCivId,
    issuedTurn: request.turnIssued,
    deadlineTurn: state.turn + BORDER_WITHDRAWAL_PROMISE_TURNS,
    status: 'promised',
  };
  const next = appendRecord(removeRequest(state, requestId), record);
  bus?.emit('diplomacy:withdrawal-promised', {
    hostCivId: record.hostCivId,
    intruderCivId: record.intruderCivId,
    deadlineTurn: record.deadlineTurn!,
  });
  return { ok: true, state: next };
}

/**
 * Refusing costs relations once, immediately, and deliberately does not touch the treachery score: the intruder
 * refused openly rather than breaking a promise. No war is declared.
 */
export function refuseWithdrawalDemand(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus?: EventBus,
): BorderWithdrawalResponseResult {
  const request = findWithdrawalRequest(state, actingCivId, requestId);
  if (!request) return { ok: false, state, reason: 'request-not-found' };
  const host = state.civilizations[request.fromCivId];
  const intruder = state.civilizations[request.toCivId];
  if (!host || !intruder) return { ok: false, state, reason: 'request-no-longer-valid' };

  const record: BorderConfrontation = {
    id: request.id,
    hostCivId: request.fromCivId,
    intruderCivId: request.toCivId,
    issuedTurn: request.turnIssued,
    status: 'refused',
    resolvedTurn: state.turn,
  };
  let next: GameState = appendRecord(removeRequest(state, requestId), record);
  next = withDiplomacy(next, request.fromCivId,
    modifyRelationship(next.civilizations[request.fromCivId].diplomacy, request.toCivId, -BORDER_WITHDRAWAL_REFUSAL_RELATIONSHIP_PENALTY));
  next = withDiplomacy(next, request.toCivId,
    modifyRelationship(next.civilizations[request.toCivId].diplomacy, request.fromCivId, -BORDER_WITHDRAWAL_REFUSAL_RELATIONSHIP_PENALTY));
  next = withDiplomaticEvent(next, request.fromCivId, 'border_withdrawal_refused', request.toCivId);
  next = withDiplomaticEvent(next, request.toCivId, 'border_withdrawal_refused', request.fromCivId);
  bus?.emit('diplomacy:withdrawal-refused', { hostCivId: request.fromCivId, intruderCivId: request.toCivId });
  return { ok: true, state: next };
}

function invalidatePromise(
  state: GameState,
  record: BorderConfrontation,
  bus?: EventBus,
): GameState {
  const invalidated: BorderConfrontation = { ...record, status: 'invalidated', resolvedTurn: state.turn };
  const next: GameState = {
    ...state,
    borderConfrontations: [
      ...getBorderConfrontations(state).filter(candidate => candidate.id !== record.id),
      invalidated,
    ],
  };
  bus?.emit('diplomacy:withdrawal-invalidated', { hostCivId: record.hostCivId, intruderCivId: record.intruderCivId });
  return next;
}

/** Applies a relationship delta symmetrically: each civ's own opinion of the other moves once. */
function applyMutualRelationship(state: GameState, civA: string, civB: string, delta: number): GameState {
  let next = state;
  if (next.civilizations[civA]) {
    next = withDiplomacy(next, civA, modifyRelationship(next.civilizations[civA].diplomacy, civB, delta));
  }
  if (next.civilizations[civB]) {
    next = withDiplomacy(next, civB, modifyRelationship(next.civilizations[civB].diplomacy, civA, delta));
  }
  return next;
}

function resolvePromise(
  state: GameState,
  record: BorderConfrontation,
  outcome: 'fulfilled' | 'broken',
  bus?: EventBus,
): GameState {
  let next = applyMutualRelationship(
    state,
    record.hostCivId,
    record.intruderCivId,
    outcome === 'fulfilled' ? BORDER_WITHDRAWAL_KEPT_RELATIONSHIP_BONUS : -BORDER_WITHDRAWAL_BROKEN_RELATIONSHIP_PENALTY,
  );
  if (outcome === 'broken') {
    const intruder = next.civilizations[record.intruderCivId];
    if (intruder) {
      next = withDiplomacy(next, record.intruderCivId, applyTreachery(intruder.diplomacy, 'border_withdrawal_promise'));
      const allDipStates = Object.fromEntries(
        Object.entries(next.civilizations).map(([id, civ]) => [id, civ.diplomacy]),
      );
      const broadcast = broadcastTreacheryPenalty(allDipStates, record.intruderCivId);
      next = {
        ...next,
        civilizations: Object.fromEntries(
          Object.entries(next.civilizations).map(([id, civ]) => [id, { ...civ, diplomacy: broadcast[id] ?? civ.diplomacy }]),
        ),
      };
    }
  }
  next = withDiplomaticEvent(
    next,
    record.hostCivId,
    outcome === 'fulfilled' ? 'border_withdrawal_fulfilled' : 'border_withdrawal_broken',
    record.intruderCivId,
  );
  next = withDiplomaticEvent(
    next,
    record.intruderCivId,
    outcome === 'fulfilled' ? 'border_withdrawal_fulfilled' : 'border_withdrawal_broken',
    record.hostCivId,
  );
  const resolved: BorderConfrontation = { ...record, status: outcome, resolvedTurn: next.turn };
  next = {
    ...next,
    borderConfrontations: [
      ...getBorderConfrontations(next).filter(candidate => candidate.id !== record.id),
      resolved,
    ],
  };
  bus?.emit(outcome === 'fulfilled' ? 'diplomacy:withdrawal-fulfilled' : 'diplomacy:withdrawal-broken', {
    hostCivId: record.hostCivId,
    intruderCivId: record.intruderCivId,
  });
  return next;
}

/**
 * Once per round, after every civ has moved: resolve promises whose deadline has arrived, invalidate promises that a
 * relationship change made moot, and prune records the panel can no longer use. Deterministic; no RNG and no
 * difficulty input.
 */
export function reconcileBorderConfrontations(state: GameState, bus?: EventBus): GameState {
  let next = state;
  for (const record of getBorderConfrontations(state)) {
    if (record.status !== 'promised') continue;
    const hostLiving = getCivilizationLiveness(next, record.hostCivId).living;
    const intruderLiving = getCivilizationLiveness(next, record.intruderCivId).living;
    const relation = classifyTerritorialRelation(next, record.intruderCivId, record.hostCivId);
    const moot = !hostLiving || !intruderLiving
      || relation === 'war' || relation === 'alliance' || relation === 'open-borders' || relation === 'vassalage';
    if (moot) {
      next = invalidatePromise(next, record, bus);
      continue;
    }
    if (record.deadlineTurn !== undefined && next.turn >= record.deadlineTurn) {
      next = resolvePromise(next, record, hasBorderTension(next, record.hostCivId, record.intruderCivId) ? 'broken' : 'fulfilled', bus);
    }
  }
  const retained = getBorderConfrontations(next).filter(record =>
    record.status === 'promised'
    || next.turn - (record.resolvedTurn ?? record.issuedTurn) < BORDER_CONFRONTATION_RECORD_RETENTION_TURNS);
  if (retained.length !== (next.borderConfrontations ?? []).length || next.borderConfrontations === undefined) {
    next = { ...next, borderConfrontations: retained };
  }
  return next;
}

// ---- Disputed-radius map overlay ----
/**
 * The disputed-radius overlay (#1766, "legible near"): while a rival's armed units are within
 * `BORDER_TENSION_RADIUS` of a city, the hexes inside that radius are shown on the map to the civilization the
 * tension involves, so "near" is never a guess.
 *
 * Viewer-safe by the same rules as the diplomacy panel's tension line: as the approached civ the viewer sees a ring
 * only around its own cities that a rival unit it can currently see is close to; as the intruder it sees a ring only
 * around a city it has explored that its own armed units are close to. The ring names no one, so it reveals nothing
 * the panel's own wording does not. War, alliance, Open Borders and vassalage are exempt exactly as for the drift
 * (`getBorderTensionCities`), and it is derived every time, never persisted.
 */
export interface BorderTensionOverlayTile {
  coord: HexCoord;
  /** True on the outermost ring of a disputed area, so the renderer can outline the boundary. */
  edge: boolean;
}

export interface BorderTensionPresentation {
  tiles: BorderTensionOverlayTile[];
}

export const EMPTY_BORDER_TENSION_PRESENTATION: BorderTensionPresentation = { tiles: [] };

export function getBorderTensionPresentationForViewer(state: GameState, viewerId: string): BorderTensionPresentation {
  const viewer = state.civilizations[viewerId];
  if (!viewer || viewer.isEliminated) return EMPTY_BORDER_TENSION_PRESENTATION;
  const visibility = viewer.visibility;

  const centers = new Map<string, HexCoord>();
  for (const [otherId, other] of Object.entries(state.civilizations)) {
    if (otherId === viewerId || other.isEliminated) continue;
    if (viewer.diplomacy && isAtWar(viewer.diplomacy, otherId)) continue;
    const approached = visibility
      ? getBorderTensionCities(state, viewerId, otherId, { unitKnown: unit => isVisible(visibility, unit.position) })
      : [];
    const intruding = getBorderTensionCities(state, otherId, viewerId, {
      cityKnown: city => hasExploredCoord(state, viewerId, city.position),
    });
    for (const city of [...approached, ...intruding]) centers.set(city.id, city.position);
  }
  if (centers.size === 0) return EMPTY_BORDER_TENSION_PRESENTATION;

  const tiles = new Map<string, BorderTensionOverlayTile>();
  for (const center of [...centers.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, c]) => c)) {
    for (const coord of mapHexesInRange(state.map, center, BORDER_TENSION_RADIUS)) {
      const key = hexKey(coord);
      const edge = mapDistance(state.map, center, coord) === BORDER_TENSION_RADIUS;
      const existing = tiles.get(key);
      // A tile inside any disputed area is interior for the union, so overlapping areas outline as one region.
      if (!existing) tiles.set(key, { coord, edge });
      else if (!edge) existing.edge = false;
    }
  }
  return { tiles: [...tiles.values()] };
}
