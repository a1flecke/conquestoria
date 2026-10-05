/**
 * Standalone tribute (#1334): a strong civilization coerces a weaker, known one into a bounded gold payment without
 * declaring war. It sits between ordinary diplomacy and war/vassalage and is none of: pirate tribute, vassal tribute,
 * a lump-sum trade, an automatic war, or permanent subjugation.
 *
 * One legality owner (`getTributeDemandEligibility`) is consumed by the human preview, the executor, and the AI. Its
 * strength test reads only the demander's viewer-safe projection (`diplomatic-strength.ts`): the target's real army is
 * never consulted, an unobserved target is *unknown* (denied), and the comparison uses the target's upper uncertainty
 * bound so incomplete intel can never make a coercive demand legal.
 *
 * Lifecycle: demand -> (target accepts) -> mirrored `tribute` treaty -> one payment per round -> expiry. Refusal costs
 * relations and never starts a war. A war, a vassalage, or an elimination between the pair ends the contract; the
 * contract is always read through `isTributeContractLive`, so a stale mirror can never charge.
 */
import type { EventBus } from '@/core/event-bus';
import type { GameState, PendingDiplomaticRequest, Treaty, TributeTerms } from '@/core/types';
import { getCivilizationLiveness } from './civilization-liveness';
import { hasMetCivilization } from './discovery-system';
import { getRelationship, hasTreatyBetween, isAtWar } from './diplomacy-queries';
import { commitTributeAgreement } from './diplomacy-treaties';
import { modifyRelationship } from './diplomacy-state';
import { estimatePerceivedCivStrength, buildViewerMilitaryIntel, type ViewerMilitaryIntel } from './diplomatic-strength';
import { resolveCivilizationEra } from './tech-definitions';
import { isDiplomaticRequestLive } from './diplomacy-requests';

/** Iron Age: the first era that can field credible coercive force. */
export const TRIBUTE_MIN_ERA = 3;
/** The demander's own strength must reach this multiple of the target's *upper* uncertainty bound. */
export const TRIBUTE_STRENGTH_RATIO = 1.5;
/** Below this, relations are too hostile for a coercive diplomatic channel. */
export const TRIBUTE_RELATIONSHIP_FLOOR = -50;
export const TRIBUTE_DURATION_ROUNDS = 10;
export const TRIBUTE_BASE_GOLD = 5;
export const TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY = 10;
/** Rounds from the most recent demand between a pair before another may be made. */
export const TRIBUTE_COOLDOWN_ROUNDS = 10;
/** Upper bound a loaded contract's per-round gold may carry (era 13 pays 18); a larger value is not a value this game writes. */
export const TRIBUTE_MAX_GOLD_PER_ROUND = 50;

export type TributeDenialReason =
  | 'unknown-civilization'
  | 'self'
  | 'not-alive'
  | 'too-early'
  | 'no-contact'
  | 'at-war'
  | 'vassal-relationship'
  | 'allied'
  | 'non-aggression-pact'
  | 'active-tribute'
  | 'pending-demand'
  | 'cooldown'
  | 'relations-too-hostile'
  | 'unknown-military'
  | 'not-strong-enough';

/** Player-facing copy. Never quotes a strength number: the viewer has not earned the target's. */
export const TRIBUTE_DENIAL_MESSAGES: Record<TributeDenialReason, string> = {
  'unknown-civilization': 'That civilization is not known to you.',
  self: 'You cannot demand tribute from yourself.',
  'not-alive': 'One of the civilizations is no longer active.',
  'too-early': 'Your civilization has not yet reached the Iron Age, when tribute demands become credible.',
  'no-contact': 'You have not met this civilization.',
  'at-war': 'You are at war. End the war or keep fighting; a tribute demand is a way to avoid one.',
  'vassal-relationship': 'A vassal relationship already governs your dealings with them.',
  allied: 'You cannot coerce an ally.',
  'non-aggression-pact': 'A non-aggression pact protects them from demands like this.',
  'active-tribute': 'A tribute agreement between you is already in force.',
  'pending-demand': 'A tribute demand between you is already waiting for an answer.',
  cooldown: 'A tribute demand was made recently. Wait before demanding again.',
  'relations-too-hostile': 'Relations are already too hostile for a demand to be a credible alternative to war.',
  'unknown-military': 'You do not know enough about their forces to make a credible tribute demand.',
  'not-strong-enough': 'Your forces are not clearly stronger than theirs, so the demand would not be credible.',
};

export interface TributeProposedTerms extends TributeTerms {
  rounds: number;
}

export type TributeEligibility =
  | { ok: true; terms: TributeProposedTerms }
  | { ok: false; reason: TributeDenialReason };

/** Terms are a pure function of the demander's own civilization era, fixed when the demand is made. */
export function getTributeTerms(demanderId: string, payerId: string, demanderEra: number): TributeProposedTerms {
  return {
    demanderId,
    payerId,
    goldPerRound: TRIBUTE_BASE_GOLD + Math.max(1, Math.floor(demanderEra)),
    rounds: TRIBUTE_DURATION_ROUNDS,
  };
}

export function isTributeTreaty(treaty: Treaty): treaty is Treaty & { tribute: TributeTerms } {
  return treaty.type === 'tribute'
    && treaty.tribute !== undefined
    && typeof treaty.tribute.demanderId === 'string'
    && typeof treaty.tribute.payerId === 'string'
    && Number.isFinite(treaty.tribute.goldPerRound);
}

function hasVassalLink(state: GameState, civA: string, civB: string): boolean {
  const a = state.civilizations[civA]?.diplomacy.vassalage;
  const b = state.civilizations[civB]?.diplomacy.vassalage;
  return a?.overlord === civB || b?.overlord === civA
    || (a?.vassals ?? []).includes(civB) || (b?.vassals ?? []).includes(civA);
}

/** A contract binds only while both parties live, are at peace, and neither is the other's vassal or overlord. */
export function isTributeContractLive(state: GameState, terms: TributeTerms): boolean {
  const { demanderId, payerId } = terms;
  return getCivilizationLiveness(state, demanderId).living
    && getCivilizationLiveness(state, payerId).living
    && !isAtWar(state.civilizations[demanderId].diplomacy, payerId)
    && !isAtWar(state.civilizations[payerId].diplomacy, demanderId)
    && !hasVassalLink(state, demanderId, payerId);
}

/** The live tribute contract between two civs, if any, read from the payer's record (the one that pays). */
export function getLiveTributeBetween(state: GameState, civA: string, civB: string): (Treaty & { tribute: TributeTerms }) | undefined {
  for (const holderId of [civA, civB]) {
    const found = (state.civilizations[holderId]?.diplomacy.treaties ?? []).find(treaty =>
      isTributeTreaty(treaty)
      && ((treaty.tribute.demanderId === civA && treaty.tribute.payerId === civB)
        || (treaty.tribute.demanderId === civB && treaty.tribute.payerId === civA))
      && isTributeContractLive(state, treaty.tribute));
    if (found && isTributeTreaty(found)) return found;
  }
  return undefined;
}

function pendingTributeBetween(state: GameState, civA: string, civB: string): PendingDiplomaticRequest | undefined {
  return (state.pendingDiplomacyRequests ?? []).find(request =>
    request.type === 'tribute'
    && ((request.fromCivId === civA && request.toCivId === civB) || (request.fromCivId === civB && request.toCivId === civA))
    && isDiplomaticRequestLive(state, request));
}

/** Turn of the most recent demand between the pair, from either side's diplomatic history (nothing extra is persisted). */
export function getLastTributeDemandTurn(state: GameState, civA: string, civB: string): number | null {
  let latest: number | null = null;
  const scan = (holderId: string, otherId: string) => {
    for (const event of state.civilizations[holderId]?.diplomacy.events ?? []) {
      if (event.type === 'tribute_demanded' && event.otherCiv === otherId && (latest === null || event.turn > latest)) latest = event.turn;
    }
  };
  scan(civA, civB);
  scan(civB, civA);
  return latest;
}

export interface TributeEligibilityOptions {
  /** Reuse one demander intel across many candidate targets in a diplomacy pass. */
  intel?: ViewerMilitaryIntel;
  /**
   * `respond` revalidates the structural facts when a target answers a pending demand. It ignores the demand's own
   * pending request and cooldown stamp, and does not re-test strength or relations: the terms were credible when made
   * and the target's consent, not the demander's current intel, is what makes them binding now.
   */
  mode?: 'propose' | 'respond';
}

export function getTributeDemandEligibility(
  state: GameState,
  demanderId: string,
  targetId: string,
  options: TributeEligibilityOptions = {},
): TributeEligibility {
  const mode = options.mode ?? 'propose';
  const deny = (reason: TributeDenialReason): TributeEligibility => ({ ok: false, reason });
  const demander = state.civilizations[demanderId];
  const target = state.civilizations[targetId];
  if (!demander || !target) return deny('unknown-civilization');
  if (demanderId === targetId) return deny('self');
  if (!getCivilizationLiveness(state, demanderId).living || !getCivilizationLiveness(state, targetId).living) return deny('not-alive');

  const demanderEra = resolveCivilizationEra(demander.techState.completed);
  if (demanderEra < TRIBUTE_MIN_ERA) return deny('too-early');
  if (!hasMetCivilization(state, demanderId, targetId)) return deny('no-contact');
  if (isAtWar(demander.diplomacy, targetId) || isAtWar(target.diplomacy, demanderId)) return deny('at-war');
  if (hasVassalLink(state, demanderId, targetId)) return deny('vassal-relationship');
  if (hasTreatyBetween(state, demanderId, targetId, 'alliance')) return deny('allied');
  if (hasTreatyBetween(state, demanderId, targetId, 'non_aggression_pact')) return deny('non-aggression-pact');
  if (getLiveTributeBetween(state, demanderId, targetId)) return deny('active-tribute');

  if (mode === 'propose') {
    if (pendingTributeBetween(state, demanderId, targetId)) return deny('pending-demand');
    const last = getLastTributeDemandTurn(state, demanderId, targetId);
    if (last !== null && state.turn - last < TRIBUTE_COOLDOWN_ROUNDS) return deny('cooldown');
    if (getRelationship(demander.diplomacy, targetId) < TRIBUTE_RELATIONSHIP_FLOOR) return deny('relations-too-hostile');

    const intel = options.intel ?? buildViewerMilitaryIntel(state, demanderId);
    const own = estimatePerceivedCivStrength(intel, demanderId, demanderEra);
    const theirs = estimatePerceivedCivStrength(intel, targetId, demanderEra);
    if (!theirs.hasUsableObservation) return deny('unknown-military');
    if (own.midpoint < TRIBUTE_STRENGTH_RATIO * theirs.uncertaintyUpper) return deny('not-strong-enough');
  }

  return { ok: true, terms: getTributeTerms(demanderId, targetId, demanderEra) };
}

export type TributeDemandResult =
  | { ok: true; state: GameState; request: PendingDiplomaticRequest }
  | { ok: false; state: GameState; reason: TributeDenialReason };

function withEvent(state: GameState, civId: string, type: string, otherCiv: string): GameState {
  const civ = state.civilizations[civId];
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: {
        ...civ,
        diplomacy: { ...civ.diplomacy, events: [...civ.diplomacy.events, { type, turn: state.turn, otherCiv, weight: 1 }] },
      },
    },
  };
}

/**
 * Makes a demand: legality is re-resolved here (never trusted from a preview), the terms are frozen into a pending
 * request addressed to the target, and the demand is stamped in both civs' diplomatic history (the cooldown source).
 * The target answers through `acceptTributeDemand` / `refuseTributeDemand`; nothing is auto-accepted here.
 */
export function demandTribute(
  state: GameState,
  demanderId: string,
  targetId: string,
  bus?: EventBus,
  options: TributeEligibilityOptions = {},
): TributeDemandResult {
  const eligibility = getTributeDemandEligibility(state, demanderId, targetId, { ...options, mode: 'propose' });
  if (!eligibility.ok) return { ok: false, state, reason: eligibility.reason };
  const { terms } = eligibility;
  const request: PendingDiplomaticRequest = {
    id: `tribute:${demanderId}:${targetId}:${state.turn}`,
    type: 'tribute',
    fromCivId: demanderId,
    toCivId: targetId,
    turnIssued: state.turn,
    turnsRemaining: terms.rounds,
    tribute: { ...terms },
  };
  let next: GameState = { ...state, pendingDiplomacyRequests: [...(state.pendingDiplomacyRequests ?? []), request] };
  next = withEvent(next, demanderId, 'tribute_demanded', targetId);
  next = withEvent(next, targetId, 'tribute_demanded', demanderId);
  bus?.emit('diplomacy:tribute-demanded', { demanderId, targetId, goldPerRound: terms.goldPerRound, rounds: terms.rounds });
  return { ok: true, state: next, request };
}

export type TributeResponseResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: 'request-not-found' | 'request-no-longer-valid' };

function removeRequest(state: GameState, requestId: string): GameState {
  return { ...state, pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request => request.id !== requestId) };
}

function findTributeRequest(state: GameState, actingCivId: string, requestId: string): PendingDiplomaticRequest | undefined {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  return request && request.type === 'tribute' && request.toCivId === actingCivId && request.tribute ? request : undefined;
}

/** Accepting creates the bounded contract with the *proposed* terms, after revalidating the structural facts. */
export function acceptTributeDemand(state: GameState, actingCivId: string, requestId: string, bus?: EventBus): TributeResponseResult {
  const request = findTributeRequest(state, actingCivId, requestId);
  if (!request || !request.tribute) return { ok: false, state, reason: 'request-not-found' };
  if (!isDiplomaticRequestLive(state, request)) return { ok: false, state, reason: 'request-no-longer-valid' };
  const eligibility = getTributeDemandEligibility(state, request.fromCivId, request.toCivId, { mode: 'respond' });
  if (!eligibility.ok) return { ok: false, state, reason: 'request-no-longer-valid' };

  const { rounds, ...terms } = request.tribute;
  const committed = commitTributeAgreement(removeRequest(state, requestId), terms, rounds);
  if (committed.civilizations[terms.demanderId].diplomacy.treaties === state.civilizations[terms.demanderId].diplomacy.treaties) {
    return { ok: false, state, reason: 'request-no-longer-valid' };
  }
  bus?.emit('diplomacy:tribute-accepted', { demanderId: terms.demanderId, payerId: terms.payerId, goldPerRound: terms.goldPerRound, rounds });
  return { ok: true, state: committed };
}

/**
 * Refusing costs relations once (applied to each civ's own view of the other) and is recorded in history. It does not
 * declare war: any later war is the demander's separate decision through the ordinary declare-war path.
 */
export function refuseTributeDemand(state: GameState, actingCivId: string, requestId: string, bus?: EventBus): TributeResponseResult {
  const request = findTributeRequest(state, actingCivId, requestId);
  if (!request) return { ok: false, state, reason: 'request-not-found' };
  let next = removeRequest(state, requestId);
  const demander = next.civilizations[request.fromCivId];
  const payer = next.civilizations[request.toCivId];
  if (demander && payer) {
    next = {
      ...next,
      civilizations: {
        ...next.civilizations,
        [request.fromCivId]: { ...demander, diplomacy: modifyRelationship(demander.diplomacy, request.toCivId, -TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY) },
        [request.toCivId]: { ...payer, diplomacy: modifyRelationship(payer.diplomacy, request.fromCivId, -TRIBUTE_REFUSAL_RELATIONSHIP_PENALTY) },
      },
    };
    next = withEvent(next, request.fromCivId, 'tribute_refused', request.toCivId);
    next = withEvent(next, request.toCivId, 'tribute_refused', request.fromCivId);
  }
  bus?.emit('diplomacy:tribute-refused', { demanderId: request.fromCivId, payerId: request.toCivId });
  return { ok: true, state: next };
}

export interface TributeSettlement {
  state: GameState;
  /** Gold to add to each civ's gross credit this round (negative for the payer). */
  goldDeltaByCiv: Record<string, number>;
}

function removeTributeBetween(state: GameState, terms: TributeTerms): GameState {
  const strip = (holderId: string): GameState['civilizations'][string] => {
    const civ = state.civilizations[holderId];
    return {
      ...civ,
      diplomacy: {
        ...civ.diplomacy,
        treaties: civ.diplomacy.treaties.filter(treaty => !(isTributeTreaty(treaty)
          && treaty.tribute.demanderId === terms.demanderId && treaty.tribute.payerId === terms.payerId)),
      },
    };
  };
  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [terms.demanderId]: strip(terms.demanderId),
      [terms.payerId]: strip(terms.payerId),
    },
  };
}

/**
 * One civ's share of the round's tribute. Run once per civ per round, before the treaty tick. The payer's own copy
 * pays (the demander's mirror is never charged, so a mirrored contract cannot double-pay); the payment is capped at the
 * payer's treasury and never creates debt or extends the term. A contract that is no longer live is removed from both
 * civs and reported once, with no payment.
 */
export function settleTributeForCiv(state: GameState, civId: string, bus?: EventBus): TributeSettlement {
  const civ = state.civilizations[civId];
  const goldDeltaByCiv: Record<string, number> = {};
  if (!civ) return { state, goldDeltaByCiv };
  let next = state;
  for (const treaty of civ.diplomacy.treaties) {
    if (!isTributeTreaty(treaty)) continue;
    const terms = treaty.tribute;
    if (terms.payerId !== civId && terms.demanderId !== civId) continue;
    if (!isTributeContractLive(next, terms)) {
      next = removeTributeBetween(next, terms);
      const reason = !getCivilizationLiveness(next, terms.demanderId).living || !getCivilizationLiveness(next, terms.payerId).living
        ? 'eliminated'
        : hasVassalLink(next, terms.demanderId, terms.payerId) ? 'vassalage' : 'war';
      bus?.emit('diplomacy:tribute-ended', { demanderId: terms.demanderId, payerId: terms.payerId, reason });
      continue;
    }
    if (terms.payerId !== civId) continue;
    const treasury = Math.max(0, Math.floor(next.civilizations[civId].gold ?? 0));
    const payment = Math.min(terms.goldPerRound, treasury);
    if (payment > 0) {
      goldDeltaByCiv[civId] = (goldDeltaByCiv[civId] ?? 0) - payment;
      goldDeltaByCiv[terms.demanderId] = (goldDeltaByCiv[terms.demanderId] ?? 0) + payment;
    }
    if (treaty.turnsRemaining <= 1) {
      bus?.emit('diplomacy:tribute-ended', { demanderId: terms.demanderId, payerId: terms.payerId, reason: 'expired' });
    }
  }
  return { state: next, goldDeltaByCiv };
}
