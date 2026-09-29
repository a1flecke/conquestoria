/**
 * Pending diplomatic-request lifecycle (#554): enqueue, dedupe, expiry and the
 * read helpers over `GameState.pendingDiplomacyRequests`. Deciding what an
 * accepted request *does* is the integration layer's job
 * (`diplomacy-system.ts`); this module only owns the queue. Leaf (types only).
 */
import type { GameState, PendingDiplomaticRequest, TreatyType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';

function buildPendingPeaceRequestId(fromCivId: string, toCivId: string, turn: number): string {
  return `peace:${fromCivId}:${toCivId}:${turn}`;
}

function isSamePeaceRequest(
  request: PendingDiplomaticRequest,
  fromCivId: string,
  toCivId: string,
): boolean {
  return request.type === 'peace'
    && request.fromCivId === fromCivId
    && request.toCivId === toCivId;
}

function isPeaceRequestPair(
  request: PendingDiplomaticRequest,
  civA: string,
  civB: string,
): boolean {
  return request.type === 'peace'
    && (
      (request.fromCivId === civA && request.toCivId === civB)
      || (request.fromCivId === civB && request.toCivId === civA)
    );
}

/**
 * #988: a plain white-peace request and a typed settlement offer both end the
 * same war between the same two civs -- resolving either one moots the
 * other, and a pending request of *either* type against the same pair blocks
 * enqueueing a new one of either type (see `enqueuePeaceRequest` /
 * `enqueueSettlementOffer`) so a civ can never hold both at once.
 */
export function isWarResolutionRequestPair(
  request: PendingDiplomaticRequest,
  civA: string,
  civB: string,
): boolean {
  return (request.type === 'peace' || request.type === 'settlement')
    && (
      (request.fromCivId === civA && request.toCivId === civB)
      || (request.fromCivId === civB && request.toCivId === civA)
    );
}

export function getPendingPeaceRequestForPair(
  state: GameState,
  civA: string,
  civB: string,
): PendingDiplomaticRequest | undefined {
  return (state.pendingDiplomacyRequests ?? []).find(request => isPeaceRequestPair(request, civA, civB));
}

function buildPendingTreatyProposalId(
  fromCivId: string,
  toCivId: string,
  treatyType: TreatyType,
  turn: number,
): string {
  return `treaty:${fromCivId}:${toCivId}:${treatyType}:${turn}`;
}

export function getPendingTreatyProposalsFor(
  state: GameState,
  civId: string,
): PendingDiplomaticRequest[] {
  return (state.pendingDiplomacyRequests ?? []).filter(
    request => request.type === 'treaty' && request.toCivId === civId,
  );
}

/**
 * #901: the bilateral treaty types that route through propose -> consent ->
 * commit (every `TreatyType` except `vassalage`, which #910 owns). Shared by
 * the diplomacy panel (hide a redundant "propose" action) and the diplomacy
 * actions controller (outcome-specific feedback) so the set never drifts.
 */
export const CONSENT_TREATY_TYPES: readonly Exclude<TreatyType, 'vassalage'>[] = [
  'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact',
];

/**
 * #901: is there already a pending treaty proposal of `treatyType` between
 * this pair, in *either* direction? `enqueueTreatyProposal` dedupes
 * reciprocally, so a second proposal for a pair that already has one is a
 * silent no-op -- callers use this to avoid offering (or falsely reporting a
 * decline for) an action that cannot do anything.
 */
export function hasPendingTreatyProposalBetween(
  state: GameState,
  civA: string,
  civB: string,
  treatyType: TreatyType,
): boolean {
  return (state.pendingDiplomacyRequests ?? []).some(request =>
    request.type === 'treaty'
    && request.treatyType === treatyType
    && ((request.fromCivId === civA && request.toCivId === civB)
      || (request.fromCivId === civB && request.toCivId === civA)));
}

// Enqueues a treaty offer for the recipient to accept/decline (#554) -- unlike
// signTreaty, this never touches either side's diplomacy.treaties until the
// recipient acts. Deduped on the same fromCivId+toCivId+treatyType triple.
export function enqueueTreatyProposal(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  treatyType: TreatyType,
  turnsRemaining: number,
  bus?: EventBus,
): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  if (requests.some(request => request.type === 'treaty'
    && request.treatyType === treatyType
    && ((request.fromCivId === fromCivId && request.toCivId === toCivId)
      || (request.fromCivId === toCivId && request.toCivId === fromCivId)))) {
    return state;
  }

  bus?.emit('diplomacy:treaty-proposed', { fromCiv: fromCivId, toCiv: toCivId, treaty: treatyType });
  return {
    ...state,
    pendingDiplomacyRequests: [
      ...requests,
      {
        id: buildPendingTreatyProposalId(fromCivId, toCivId, treatyType, state.turn),
        type: 'treaty',
        treatyType,
        turnsRemaining,
        fromCivId,
        toCivId,
        turnIssued: state.turn,
      },
    ],
  };
}

// TTL (in turns) on any pending peace request or treaty proposal (#554) -- a
// proposal the recipient never opens the diplomacy panel to act on should not
// rot forever. Shared with the diplomacy panel's "expires in N turns" label so
// the two never drift.
export const PENDING_DIPLOMATIC_REQUEST_TTL_TURNS = 10;

// Call once per turn from the world turn processor.
export function pruneExpiredDiplomaticRequests(state: GameState): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  const kept = requests.filter(
    request => isDiplomaticRequestLive(state, request),
  );
  if (kept.length === requests.length) return state;
  return { ...state, pendingDiplomacyRequests: kept };
}

export function enqueuePeaceRequest(
  state: GameState,
  fromCivId: string,
  toCivId: string,
  bus?: EventBus,
): GameState {
  const requests = state.pendingDiplomacyRequests ?? [];
  if (
    requests.some(request => isSamePeaceRequest(request, fromCivId, toCivId))
    || requests.some(request => isWarResolutionRequestPair(request, fromCivId, toCivId))
  ) {
    return state;
  }

  bus?.emit('diplomacy:peace-requested', { fromCivId, toCivId });
  return {
    ...state,
    pendingDiplomacyRequests: [
      ...requests,
      {
        id: buildPendingPeaceRequestId(fromCivId, toCivId, state.turn),
        type: 'peace',
        fromCivId,
        toCivId,
        turnIssued: state.turn,
      },
    ],
  };
}

export function isDiplomaticRequestLive(state: GameState, request: PendingDiplomaticRequest): boolean {
  return Number.isInteger(request.turnIssued) && request.turnIssued >= 0 && request.turnIssued <= state.turn
    && state.turn - request.turnIssued < PENDING_DIPLOMATIC_REQUEST_TTL_TURNS;
}

export function removeDiplomaticRequest(state: GameState, id: string): GameState {
  return { ...state, pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(request => request.id !== id) };
}
