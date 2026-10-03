/**
 * Diplomacy integration layer + public command surface.
 *
 * The domain logic lives in cohesive modules; this file owns only the flows
 * that coordinate several of them -- proposing a treaty or peace (consent ->
 * commit), executing a `DiplomaticAction`, and accepting/rejecting a pending
 * request -- and re-exports the cross-domain commands the app calls.
 *
 * Domain map (dependency direction is downward only; `diplomacy-system.ts` is
 * the sole module that may import from all of them, and none may import it --
 * pinned by `tests/app/architecture-boundaries.test.ts`):
 *
 *   diplomacy-system      integration: propose/apply/accept/reject + barrel
 *     diplomacy-vassalage   GameState vassalage commands, per-turn tick
 *       diplomacy-war         war/peace transitions, war-bloc propagation
 *         diplomacy-vassal-rules  vassalage constants/eligibility/pure transitions
 *           diplomacy-leagues     defensive leagues (leaf)
 *     diplomacy-treaties    sign/break/expire/commit
 *     diplomacy-actions     available-action projection
 *     diplomacy-requests    pending-request queue (leaf)
 *     diplomacy-embargoes   embargoes (leaf)
 *     diplomacy-treachery   betrayal reputation
 *       diplomacy-state       DiplomacyState construction + primitive writes (leaf)
 *       diplomacy-queries     read-only relationship/war/treaty questions (leaf)
 *
 * Reads (`isAtWar`, `getRelationship`, `hasTreatyBetween`, `hasAllianceTreaty`)
 * come from `diplomacy-queries`; domain-specific helpers come from their
 * domain module. This barrel deliberately does not re-export them, nor the
 * single-side `declareWar` / `makePeace` / `signTreaty` building blocks (#1011).
 */
import type { GameState, DiplomaticAction } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { cancelInvalidNetworkPlans } from '@/systems/network-plan-system';
import {
  REABSORB_GOLD_COST,
  REABSORB_RELATIONSHIP_MINIMUM,
  tryReabsorbBreakaway,
} from '@/systems/breakaway-system';
import { resolveCivDefinition } from '@/systems/civ-registry';
import { hasMetCivilization } from '@/systems/discovery-system';
import { hasKnownStrategicCapability, hasManhattanProject } from '@/systems/strategic-arsenal-system';
import { evaluatePeaceConsent, evaluateTreatyConsent, type AgreementKind } from '@/ai/ai-treaty-consent';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import { getRelationship, isAtWar, hasTreatyBetween } from '@/systems/diplomacy-queries';
import { commitTreatyAgreement, hasArmsControlTreaty } from '@/systems/diplomacy-treaties';
import {
  checkDiplomaticActionOffer,
  isOfferedDiplomaticAction,
  OFFERED_DIPLOMATIC_ACTIONS,
  type DiplomacyActionContext,
  type DiplomaticActionDenialReason,
} from '@/systems/diplomacy-actions';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import {
  enqueuePeaceRequest,
  enqueueTreatyProposal,
  isDiplomaticRequestLive,
  isWarResolutionRequestPair,
  removeDiplomaticRequest,
} from '@/systems/diplomacy-requests';
import {
  canPetitionIndependence,
  getVassalageEligibility,
  hasActiveVassalage,
  isVassalBlocked,
} from '@/systems/diplomacy-vassal-rules';
import { declareMajorWar, makeMajorPeace, resolveOpponentKind } from '@/systems/diplomacy-war';
import {
  commitVassalageAgreement,
  defendVassal,
  proposeIndependence,
  proposeVassalage,
  releaseVassal,
  resolveIndependence,
} from '@/systems/diplomacy-vassalage';

// Public cross-domain command surface (#1011).
export { declareMajorWar, makeMajorPeace, applyVassalageWarConsequences } from '@/systems/diplomacy-war';
export {
  getAvailableActions,
  DIPLOMATIC_ACTION_DENIAL_MESSAGES,
  type DiplomacyActionContext,
  type DiplomaticActionDenialReason,
} from '@/systems/diplomacy-actions';

export function proposeTreatyAgreement(state: GameState, fromCivId: string, toCivId: string, kind: AgreementKind, bus: EventBus): GameState {
  const from = state.civilizations[fromCivId];
  const target = state.civilizations[toCivId];
  if (!from || !target) return state;
  if (from.diplomacy.vassalage.overlord || target.diplomacy.vassalage.overlord) return state;
  if (kind === 'peace') {
    if (!isAtWar(from.diplomacy, toCivId) || !isAtWar(target.diplomacy, fromCivId)) return state;
    if (target.isHuman) return enqueuePeaceRequest(state, fromCivId, toCivId, bus);
    // #901 follow-up: no perceived-strength estimate is threaded here yet (that
    // is AI-perception-layer work), so peace consent is currently
    // relationship-only -- see TreatyConsentInput.targetVisibleStrength.
    const consent = evaluatePeaceConsent({
      kind,
      relationship: getRelationship(target.diplomacy, fromCivId),
      diplomacyFocus: resolveCivDefinition(state, target.civType)?.personality.diplomacyFocus ?? 0.5,
      targetHasKnownStrategicCapability: false,
      actorHasKnownStrategicCapability: false,
    });
    if (!consent.accepted) {
      // #1090: previously silent -- the computed refusal reason reached nobody.
      bus.emit('diplomacy:peace-declined', { proposerCivId: fromCivId, targetCivId: toCivId, reason: consent.reason });
      return state;
    }
    bus.emit('diplomacy:peace-made', { civA: fromCivId, civB: toCivId });
    const peaced = makeMajorPeace(state, fromCivId, toCivId, bus);
    return cancelInvalidNetworkPlans({
      ...peaced,
      // Same pair-level war-resolution-request cleanup acceptDiplomaticRequest
      // does on commit -- an immediate AI-consented peace must not leave the
      // other side's now-moot "incoming peace/settlement request" rotting in
      // the panel.
      pendingDiplomacyRequests: (peaced.pendingDiplomacyRequests ?? []).filter(
        candidate => !isWarResolutionRequestPair(candidate, fromCivId, toCivId),
      ),
    }).state;
  }
  if (hasTreatyBetween(state, fromCivId, toCivId, kind)) return state;
  if (target.isHuman) return enqueueTreatyProposal(state, fromCivId, toCivId, kind, kind === 'non_aggression_pact' ? 10 : -1, bus);
  const consent = evaluateTreatyConsent({
    kind,
    relationship: getRelationship(target.diplomacy, fromCivId),
    diplomacyFocus: resolveCivDefinition(state, target.civType)?.personality.diplomacyFocus ?? 0.5,
    targetHasKnownStrategicCapability: hasManhattanProject(state, toCivId),
    actorHasKnownStrategicCapability: hasKnownStrategicCapability(state, toCivId, fromCivId),
  });
  if (consent.accepted) return commitTreatyAgreement(state, fromCivId, toCivId, kind, bus);
  // #1090: previously silent -- the computed refusal reason reached nobody.
  bus.emit('diplomacy:treaty-declined', { proposerCivId: fromCivId, targetCivId: toCivId, treaty: kind, reason: consent.reason });
  return state;
}

export function canReabsorbBreakaway(
  state: GameState,
  ownerId: string,
  breakawayId: string,
): boolean {
  const owner = state.civilizations[ownerId];
  const breakaway = state.civilizations[breakawayId];
  if (!owner || !breakaway?.breakaway) {
    return false;
  }
  if (breakaway.breakaway.originOwnerId !== ownerId) {
    return false;
  }

  const relationship = getRelationship(owner.diplomacy, breakawayId);
  return relationship >= REABSORB_RELATIONSHIP_MINIMUM && owner.gold >= REABSORB_GOLD_COST;
}

/**
 * The acting civ's own gating inputs for `getAvailableActions` / `checkDiplomaticActionOffer`, derived from state
 * in one place. The panel, the AI and the executor all build the same context from this, so the tech / era /
 * arms-control inputs cannot drift between "what is offered" and "what is allowed" (#1027's World-Age bug).
 */
function getDiplomacyActionContext(state: GameState, civId: string): DiplomacyActionContext {
  const completedTechs = state.civilizations[civId]?.techState.completed ?? [];
  return {
    completedTechs,
    civilizationEra: resolveCivilizationEra(completedTechs),
    hasArmsControlTreaty: hasArmsControlTreaty(state, civId),
  };
}

export type DiplomaticActionEligibility =
  | { ok: true }
  | { ok: false; reason: DiplomaticActionDenialReason };

/** Actions that write a treaty or war record: never against a civ the actor has not met (#435). */
const ACTIONS_REQUIRING_CONTACT: ReadonlySet<DiplomaticAction> = new Set<DiplomaticAction>([
  'declare_war', 'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact',
]);

/**
 * The single answer to "may `actorId` do `action` to `targetCivId` right now, and if not why" (#1221).
 *
 * The offer list (`getAvailableDiplomaticActions`), the player's executor (`applyDiplomaticAction`) and the AI's
 * decision loop all ask this, so a direct call cannot do what the panel would withhold. It is omniscient
 * validation; the copy for a refusal never names a civilization.
 *
 * Contact is checked before anything that would describe the other civ (vassal status, treaties), so a refusal
 * towards an unmet civ cannot leak what it is. Legality is not willingness: an AI declining a legal proposal is
 * an outcome, not a denial here.
 */
export function resolveDiplomaticAction(
  state: GameState,
  actorId: string,
  targetCivId: string,
  action: DiplomaticAction,
): DiplomaticActionEligibility {
  const deny = (reason: DiplomaticActionDenialReason): DiplomaticActionEligibility => ({ ok: false, reason });
  const actor = state.civilizations[actorId];
  const target = state.civilizations[targetCivId];
  const needsContact = ACTIONS_REQUIRING_CONTACT.has(action);
  if (!actor || !target) return deny(needsContact ? 'not-met' : 'not-available');
  if (actorId === targetCivId) return deny('self-target');
  // Issue #435 guard: a treaty (or war record) between unmet civs becomes contact "evidence" and cascades
  // into mass discovery on the next visibility sync.
  if (needsContact && !hasMetCivilization(state, actorId, targetCivId)) return deny('not-met');

  if (isVassalBlocked(action, Boolean(actor.diplomacy.vassalage.overlord))) return deny('vassal-restricted');
  if (action !== 'declare_war' && isVassalBlocked(action, Boolean(target.diplomacy.vassalage.overlord))) {
    return deny('vassal-restricted');
  }

  if (isOfferedDiplomaticAction(action)) {
    return checkDiplomaticActionOffer(actor.diplomacy, targetCivId, getDiplomacyActionContext(state, actorId), action);
  }

  // Actions outside the offer table keep their own canonical predicate; the executor below calls the same one.
  switch (action) {
    case 'offer_vassalage':
      return getVassalageEligibility(state, actorId, targetCivId).ok ? { ok: true } : deny('not-available');
    case 'petition_independence':
      return hasActiveVassalage(state, actorId, targetCivId) && canPetitionIndependence(state, actorId)
        ? { ok: true } : deny('not-available');
    case 'release_vassal':
    case 'defend_vassal':
      return hasActiveVassalage(state, targetCivId, actorId) ? { ok: true } : deny('not-available');
    case 'reabsorb_breakaway':
      return canReabsorbBreakaway(state, actorId, targetCivId) ? { ok: true } : deny('not-available');
    default:
      // Embargo / league actions: removed from the offer surface in #998 / #1030 and never had an execution path.
      return deny('not-available');
  }
}

/**
 * The actions `actorId` is offered against `targetCivId`: the offer table filtered by the executor's own
 * eligibility, so a button is shown exactly when pressing it can do something (offered ⇒ executable).
 */
export function getAvailableDiplomaticActions(
  state: GameState,
  actorId: string,
  targetCivId: string,
): DiplomaticAction[] {
  return OFFERED_DIPLOMATIC_ACTIONS.filter(action => resolveDiplomaticAction(state, actorId, targetCivId, action).ok);
}

export type DiplomaticActionResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: DiplomaticActionDenialReason };

/**
 * Executes a diplomatic action after re-running `resolveDiplomaticAction` against the current state (#1221).
 *
 * `ok: false` means the action was mechanically unavailable: `state` is the input, untouched, and `reason`
 * has copy in `DIPLOMATIC_ACTION_DENIAL_MESSAGES`. `ok: true` means the action was legal and was carried out
 * as far as the other side allows: an AI that declines a legal treaty or peace proposal still returns
 * `ok: true` with the state it left (the decline is announced by its own event). Callers that need to tell
 * "done" from "declined" compare states, exactly as before.
 */
export function applyDiplomaticAction(
  state: GameState,
  actorId: string,
  targetCivId: string,
  action: DiplomaticAction,
  bus: EventBus,
): DiplomaticActionResult {
  const eligibility = resolveDiplomaticAction(state, actorId, targetCivId, action);
  if (!eligibility.ok) return { ok: false, state, reason: eligibility.reason };

  const target = state.civilizations[targetCivId]!;
  const done = (next: GameState): DiplomaticActionResult => ({ ok: true, state: next });

  switch (action) {
    case 'offer_vassalage':
      return done(proposeVassalage(state, actorId, targetCivId, bus));
    case 'petition_independence':
      return done(proposeIndependence(state, actorId, targetCivId, bus));
    case 'release_vassal':
      return done(releaseVassal(state, actorId, targetCivId, bus));
    case 'defend_vassal':
      return done(defendVassal(state, actorId, targetCivId, bus));
    case 'declare_war': {
      const next = declareMajorWar(state, actorId, targetCivId, bus);
      if (next !== state) bus.emit('diplomacy:war-declared', { attackerId: actorId, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
      return done(next);
    }
    case 'request_peace':
      return done(proposeTreatyAgreement(state, actorId, targetCivId, 'peace', bus));
    case 'non_aggression_pact':
    case 'trade_agreement':
    case 'open_borders':
    case 'alliance':
    case 'arms_control_pact':
      return done(proposeTreatyAgreement(state, actorId, targetCivId, action, bus));
    case 'reabsorb_breakaway': {
      const cityId = target.breakaway?.originCityId;
      const nextState = tryReabsorbBreakaway(state, actorId, targetCivId, bus);
      if (cityId) {
        bus.emit('faction:breakaway-reabsorbed', {
          civId: targetCivId,
          ownerId: actorId,
          cityId,
        });
      }
      return done(nextState);
    }
    default:
      // Unreachable: `resolveDiplomaticAction` denies every action without an execution path.
      return { ok: false, state, reason: 'not-available' };
  }
}

/** Why accepting a pending request did nothing. Copy never names a civilization. */
export type DiplomaticRequestDenialReason = 'request-not-found' | 'request-no-longer-valid';

export const DIPLOMATIC_REQUEST_DENIAL_MESSAGES: Record<DiplomaticRequestDenialReason, string> = {
  'request-not-found': 'That proposal is no longer there.',
  'request-no-longer-valid': 'That proposal is no longer valid, so nothing was signed.',
};

export type DiplomaticRequestResult =
  | { ok: true; state: GameState }
  | { ok: false; state: GameState; reason: DiplomaticRequestDenialReason };

/**
 * Accepts a pending request addressed to `actingCivId`.
 *
 * `ok: false` leaves the state exactly as it was. In particular a stale or no-longer-committable accept is NOT
 * quietly turned into a rejection (which used to remove the request and read to the controller as success,
 * #1221): it is a typed refusal, no decline event is sent, and the player can still decline the request
 * themselves. A request past its time-to-live is removed by the per-turn prune, not here.
 */
export function acceptDiplomaticRequest(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus: EventBus,
): DiplomaticRequestResult {
  const refuse = (reason: DiplomaticRequestDenialReason): DiplomaticRequestResult => ({ ok: false, state, reason });
  const accepted = (next: GameState): DiplomaticRequestResult => ({ ok: true, state: next });
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.toCivId !== actingCivId) return refuse('request-not-found');
  if (!isDiplomaticRequestLive(state, request)) return refuse('request-no-longer-valid');

  const actor = state.civilizations[request.fromCivId];
  const target = state.civilizations[request.toCivId];
  if (!actor || !target) return refuse('request-no-longer-valid');

  if (request.type === 'independence') {
    const result = resolveIndependence(state, request.fromCivId, request.toCivId, true, bus);
    return result === state ? refuse('request-no-longer-valid') : accepted(result);
  }

  if (request.type === 'treaty') {
    if (!request.treatyType) return refuse('request-no-longer-valid');
    const committed = request.treatyType === 'vassalage'
      ? commitVassalageAgreement(state, request.fromCivId, request.toCivId, bus)
      : commitTreatyAgreement(state, request.fromCivId, request.toCivId, request.treatyType, bus);
    return committed === state ? refuse('request-no-longer-valid') : accepted(committed);
  }

  if (request.type !== 'peace'
    || !getCivilizationLiveness(state, request.fromCivId).living
    || !getCivilizationLiveness(state, request.toCivId).living
    || actor.diplomacy.vassalage.overlord || target.diplomacy.vassalage.overlord
    || !isAtWar(actor.diplomacy, request.toCivId) || !isAtWar(target.diplomacy, request.fromCivId)) {
    return refuse('request-no-longer-valid');
  }

  bus.emit('diplomacy:peace-made', { civA: request.fromCivId, civB: request.toCivId });
  const peaced = makeMajorPeace(state, request.fromCivId, request.toCivId, bus);
  return accepted(cancelInvalidNetworkPlans({
    ...peaced,
    pendingDiplomacyRequests: (peaced.pendingDiplomacyRequests ?? []).filter(
      candidate => !isWarResolutionRequestPair(candidate, request.fromCivId, request.toCivId),
    ),
  }).state);
}

export function rejectDiplomaticRequest(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus?: EventBus,
): GameState {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.toCivId !== actingCivId) {
    return state;
  }

  if (!isDiplomaticRequestLive(state, request)) return removeDiplomaticRequest(state, requestId);

  if (request.type === 'independence') {
    if (!bus) return removeDiplomaticRequest(state, requestId);
    const result = resolveIndependence(state, request.fromCivId, request.toCivId, false, bus);
    return result === state ? removeDiplomaticRequest(state, requestId) : result;
  }

  // #901: an *explicit* decline (caller passed a bus) of a treaty proposal
  // notifies the original proposer. Internal `acceptDiplomaticRequest`
  // fall-throughs for a lapsed/invalid request pass no bus and stay silent --
  // those did not "decline" anything.
  if (bus && request.type === 'treaty' && request.treatyType) {
    bus.emit('diplomacy:treaty-declined', {
      proposerCivId: request.fromCivId,
      targetCivId: request.toCivId,
      treaty: request.treatyType,
    });
  }
  if (bus && request.type === 'settlement') {
    bus.emit('diplomacy:settlement-declined', { proposerCivId: request.fromCivId, targetCivId: request.toCivId });
  }

  return {
    ...state,
    pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
  };
}
