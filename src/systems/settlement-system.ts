import type { EventBus } from '@/core/event-bus';
import type { GameState, PendingDiplomaticRequest, SettlementTerm } from '@/core/types';
import {
  isAtWar,
  makeMajorPeace,
  getVassalageEligibility,
  commitVassalageAgreement,
  releaseVassal,
  isDiplomaticRequestLive,
  isWarResolutionRequestPair,
  rejectDiplomaticRequest,
} from '@/systems/diplomacy-system';
import { transferCapturedCityOwnership } from '@/systems/city-capture-system';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';
import { evaluateSettlementConsent } from '@/ai/ai-settlement-consent';
import { recordSettlementSigned } from '@/systems/war-history-system';

export type SettlementEligibility = { ok: true } | { ok: false; reason: string };

/**
 * Validates one term against `state` as if peace had already been made
 * between the two negotiating civs -- see {@link validateSettlementOffer},
 * which is the only caller that should construct that hypothetical state.
 * Exported separately so a caller that already has a post-peace state (or is
 * validating a single edited term in a UI) does not have to re-derive it.
 */
export function validateSettlementTerm(
  state: GameState,
  proposerCivId: string,
  recipientCivId: string,
  term: SettlementTerm,
): SettlementEligibility {
  const parties = new Set([proposerCivId, recipientCivId]);
  switch (term.kind) {
    case 'transfer_city': {
      if (!term.cityId || !term.fromCivId || !term.toCivId) {
        return { ok: false, reason: 'Incomplete city transfer term.' };
      }
      if (!parties.has(term.fromCivId) || !parties.has(term.toCivId) || term.fromCivId === term.toCivId) {
        return { ok: false, reason: 'A city transfer must be between the two negotiating civilizations.' };
      }
      const city = state.cities[term.cityId];
      if (!city || city.owner !== term.fromCivId) {
        return { ok: false, reason: 'That city is not held by the ceding civilization.' };
      }
      return { ok: true };
    }
    case 'reparations': {
      if (!term.fromCivId || !term.toCivId || !term.goldAmount || term.goldAmount <= 0) {
        return { ok: false, reason: 'Incomplete reparations term.' };
      }
      if (!parties.has(term.fromCivId) || !parties.has(term.toCivId) || term.fromCivId === term.toCivId) {
        return { ok: false, reason: 'Reparations must be between the two negotiating civilizations.' };
      }
      const payer = state.civilizations[term.fromCivId];
      if (!payer || payer.gold < term.goldAmount) {
        return { ok: false, reason: 'The paying civilization cannot afford this.' };
      }
      return { ok: true };
    }
    case 'vassalize': {
      if (!term.vassalId || !term.overlordId) {
        return { ok: false, reason: 'Incomplete vassalization term.' };
      }
      if (!parties.has(term.vassalId) || !parties.has(term.overlordId) || term.vassalId === term.overlordId) {
        return { ok: false, reason: 'Vassalization must be between the two negotiating civilizations.' };
      }
      return getVassalageEligibility(state, term.vassalId, term.overlordId);
    }
    case 'release_vassal': {
      if (!term.vassalId) return { ok: false, reason: 'Incomplete vassal-release term.' };
      const overlordId = state.civilizations[term.vassalId]?.diplomacy.vassalage.overlord;
      if (!overlordId || !parties.has(term.vassalId) || !parties.has(overlordId)) {
        return { ok: false, reason: 'That civilization is not a vassal of the other negotiating party.' };
      }
      return { ok: true };
    }
  }
}

/**
 * Validates a whole settlement offer, including bilateral war state and the
 * #1054 rule that a vassal's foreign policy belongs to its overlord. Every
 * term is checked against a state where peace has *already* been made between
 * the two parties -- a term like `vassalize` is only legal once the war it is
 * ending is over, and execution applies peace first for the same reason (see
 * {@link executeSettlement}). A partial failure returns the first illegal
 * term's reason; the whole offer is rejected, never applied piecemeal.
 */
export function validateSettlementOffer(
  state: GameState,
  proposerCivId: string,
  recipientCivId: string,
  terms: readonly SettlementTerm[],
): SettlementEligibility {
  const proposer = state.civilizations[proposerCivId];
  const recipient = state.civilizations[recipientCivId];
  if (!proposer || !recipient || proposerCivId === recipientCivId) {
    return { ok: false, reason: 'Both civilizations must exist.' };
  }
  if (proposer.diplomacy.vassalage.overlord || recipient.diplomacy.vassalage.overlord) {
    return { ok: false, reason: 'A vassal\'s foreign policy belongs to its overlord.' };
  }
  if (!isAtWar(proposer.diplomacy, recipientCivId) || !isAtWar(recipient.diplomacy, proposerCivId)) {
    return { ok: false, reason: 'A settlement conference requires an active war between these civilizations.' };
  }
  const postPeaceState = makeMajorPeace(state, proposerCivId, recipientCivId);
  for (const term of terms) {
    const result = validateSettlementTerm(postPeaceState, proposerCivId, recipientCivId, term);
    if (!result.ok) return result;
  }
  return { ok: true };
}

function applySettlementTerm(state: GameState, term: SettlementTerm, turn: number, bus: EventBus): GameState {
  switch (term.kind) {
    case 'transfer_city':
      return transferCapturedCityOwnership(state, term.cityId!, term.toCivId!, turn);
    case 'reparations': {
      const payer = state.civilizations[term.fromCivId!];
      const payee = state.civilizations[term.toCivId!];
      if (!payer || !payee) return state;
      return {
        ...state,
        civilizations: {
          ...state.civilizations,
          [term.fromCivId!]: { ...payer, gold: payer.gold - term.goldAmount! },
          [term.toCivId!]: { ...payee, gold: payee.gold + term.goldAmount! },
        },
      };
    }
    case 'vassalize':
      return commitVassalageAgreement(state, term.vassalId!, term.overlordId!, bus);
    case 'release_vassal': {
      const overlordId = state.civilizations[term.vassalId!]?.diplomacy.vassalage.overlord;
      if (!overlordId) return state;
      return releaseVassal(state, overlordId, term.vassalId!, bus);
    }
  }
}

/**
 * The single executor for a negotiated peace. Validates the whole offer
 * first (see {@link validateSettlementOffer}); an illegal offer is a no-op
 * (returns `state` unchanged) -- there is no partial application. On success:
 * peace is made first (clearing both sides' war goals against each other and
 * freeing any dragged-in vassals per #1054), then every term is applied via
 * its own canonical transition, in order.
 */
export function executeSettlement(
  state: GameState,
  proposerCivId: string,
  recipientCivId: string,
  terms: readonly SettlementTerm[],
  turn: number,
  bus: EventBus,
): GameState {
  if (!validateSettlementOffer(state, proposerCivId, recipientCivId, terms).ok) return state;
  // #991: recorded BEFORE the peace transition below -- war-history-system.ts's
  // `concludeIfResolved` looks for this exact event to decide the war
  // concluded with outcome 'settled' rather than the plain-peace default
  // 'white-peace'. Order matters; see that function's own doc comment.
  const withHistory = recordSettlementSigned(state, proposerCivId, recipientCivId, terms.length, turn);
  let next = makeMajorPeace(withHistory, proposerCivId, recipientCivId, bus);
  for (const term of terms) {
    next = applySettlementTerm(next, term, turn, bus);
  }
  bus.emit('diplomacy:settlement-signed', { civA: proposerCivId, civB: recipientCivId, termCount: terms.length });
  return next;
}

function buildPendingSettlementOfferId(fromCivId: string, toCivId: string, turn: number): string {
  return `settlement:${fromCivId}:${toCivId}:${turn}`;
}

export function getPendingSettlementOfferForPair(
  state: GameState,
  civA: string,
  civB: string,
): PendingDiplomaticRequest | undefined {
  return (state.pendingDiplomacyRequests ?? []).find(
    request => request.type === 'settlement'
      && ((request.fromCivId === civA && request.toCivId === civB) || (request.fromCivId === civB && request.toCivId === civA)),
  );
}

/** Human recipient: queue it for their review, like {@link import('./diplomacy-system').enqueuePeaceRequest}. */
export function enqueueSettlementOffer(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  terms: readonly SettlementTerm[],
  bus?: EventBus,
): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  if (requests.some(request => isWarResolutionRequestPair(request, fromCivId, toCivId))) {
    return state;
  }
  bus?.emit('diplomacy:settlement-proposed', { fromCivId, toCivId, termCount: terms.length });
  return {
    ...state,
    pendingDiplomacyRequests: [
      ...requests,
      {
        id: buildPendingSettlementOfferId(fromCivId, toCivId, state.turn),
        type: 'settlement',
        terms: [...terms],
        fromCivId,
        toCivId,
        turnIssued: state.turn,
      },
    ],
  };
}

/**
 * The single entry point for proposing a negotiated peace, mirroring
 * `proposeTreatyAgreement`'s 'peace' branch: a human recipient gets it queued
 * for review; an AI recipient consents or declines synchronously via
 * {@link evaluateSettlementConsent}, using only its own relationship and
 * (optional) perceived relative strength -- never omniscient knowledge of the
 * terms' true cost to the proposer.
 */
export function proposeSettlement(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  terms: readonly SettlementTerm[],
  bus: EventBus,
  aiConsentContext?: { relationship: number; targetVisibleStrength?: number; proposerVisibleStrength?: number },
): GameState {
  const target = state.civilizations[toCivId];
  if (!target) return state;
  if (!validateSettlementOffer(state, fromCivId, toCivId, terms).ok) return state;
  if (target.isHuman) return enqueueSettlementOffer(state, fromCivId, toCivId, terms, bus);

  const consent = evaluateSettlementConsent({
    recipientCivId: toCivId,
    terms,
    relationship: aiConsentContext?.relationship ?? 0,
    targetVisibleStrength: aiConsentContext?.targetVisibleStrength,
    proposerVisibleStrength: aiConsentContext?.proposerVisibleStrength,
  });
  if (!consent.accepted) {
    bus.emit('diplomacy:settlement-declined', { proposerCivId: fromCivId, targetCivId: toCivId, reason: consent.reason });
    return state;
  }
  return executeSettlement(state, fromCivId, toCivId, terms, state.turn, bus);
}

/** Human acceptance path for a queued settlement offer, mirroring `acceptDiplomaticRequest`'s peace branch. */
export function acceptSettlementOffer(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus: EventBus,
): GameState {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.type !== 'settlement' || request.toCivId !== actingCivId) return state;
  if (!isDiplomaticRequestLive(state, request)) return rejectDiplomaticRequest(state, actingCivId, requestId);

  const settled = executeSettlement(state, request.fromCivId, request.toCivId, request.terms ?? [], state.turn, bus);
  if (settled === state) return rejectDiplomaticRequest(state, actingCivId, requestId, bus);
  return cancelInvalidNetworkPlans({
    ...settled,
    pendingDiplomacyRequests: (settled.pendingDiplomacyRequests ?? []).filter(
      candidate => !isWarResolutionRequestPair(candidate, request.fromCivId, request.toCivId),
    ),
  }).state;
}
