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
import { commitTreatyAgreement } from '@/systems/diplomacy-treaties';
import {
  enqueuePeaceRequest,
  enqueueTreatyProposal,
  isDiplomaticRequestLive,
  isWarResolutionRequestPair,
  removeDiplomaticRequest,
} from '@/systems/diplomacy-requests';
import { isVassalBlocked } from '@/systems/diplomacy-vassal-rules';
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
export { getAvailableActions, type DiplomacyActionContext } from '@/systems/diplomacy-actions';

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

export function applyDiplomaticAction(
  state: GameState,
  actorId: string,
  targetCivId: string,
  action: DiplomaticAction,
  bus: EventBus,
): GameState {
  const actor = state.civilizations[actorId];
  const target = state.civilizations[targetCivId];
  if (!actor || !target) {
    return state;
  }

  if (isVassalBlocked(action, Boolean(actor.diplomacy.vassalage.overlord))) return state;
  if (action !== 'declare_war' && isVassalBlocked(action, Boolean(target.diplomacy.vassalage.overlord))) return state;

  // Issue #435 guard: a treaty (or war record) between unmet civs becomes contact
  // "evidence" and cascades into mass discovery on the next visibility sync.
  const requiresContact: DiplomaticAction[] = [
    'declare_war', 'non_aggression_pact', 'trade_agreement', 'open_borders', 'alliance', 'arms_control_pact',
  ];
  if (requiresContact.includes(action) && !hasMetCivilization(state, actorId, targetCivId)) {
    return state;
  }

  switch (action) {
    case 'offer_vassalage':
      return proposeVassalage(state, actorId, targetCivId, bus);
    case 'petition_independence':
      return proposeIndependence(state, actorId, targetCivId, bus);
    case 'release_vassal':
      return releaseVassal(state, actorId, targetCivId, bus);
    case 'defend_vassal':
      return defendVassal(state, actorId, targetCivId, bus);
    case 'declare_war': {
      const next = declareMajorWar(state, actorId, targetCivId, bus);
      if (next !== state) bus.emit('diplomacy:war-declared', { attackerId: actorId, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
      return next;
    }
    case 'request_peace':
      return proposeTreatyAgreement(state, actorId, targetCivId, 'peace', bus);
    case 'non_aggression_pact':
    case 'trade_agreement':
    case 'open_borders':
    case 'alliance': {
      return proposeTreatyAgreement(state, actorId, targetCivId, action, bus);
    }
    case 'arms_control_pact': {
      return proposeTreatyAgreement(state, actorId, targetCivId, action, bus);
    }
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
      return nextState;
    }
    default:
      return state;
  }
}

export function acceptDiplomaticRequest(
  state: GameState,
  actingCivId: string,
  requestId: string,
  bus: EventBus,
): GameState {
  const request = (state.pendingDiplomacyRequests ?? []).find(candidate => candidate.id === requestId);
  if (!request || request.toCivId !== actingCivId) {
    return state;
  }
  if (!isDiplomaticRequestLive(state, request)) {
    return rejectDiplomaticRequest(state, actingCivId, requestId);
  }

  const actor = state.civilizations[request.fromCivId];
  const target = state.civilizations[request.toCivId];
  if (!actor || !target) {
    return {
      ...state,
      pendingDiplomacyRequests: (state.pendingDiplomacyRequests ?? []).filter(candidate => candidate.id !== requestId),
    };
  }

  if (request.type === 'independence') {
    const result = resolveIndependence(state, request.fromCivId, request.toCivId, true, bus);
    return result === state ? removeDiplomaticRequest(state, requestId) : result;
  }

  if (request.type === 'treaty') {
    if (!request.treatyType) return rejectDiplomaticRequest(state, actingCivId, requestId);
    if (request.treatyType === 'vassalage') {
      const committed = commitVassalageAgreement(state, request.fromCivId, request.toCivId, bus);
      return committed === state ? rejectDiplomaticRequest(state, actingCivId, requestId) : committed;
    }
    const committed = commitTreatyAgreement(state, request.fromCivId, request.toCivId, request.treatyType, bus);
    return committed === state ? rejectDiplomaticRequest(state, actingCivId, requestId) : committed;
  }

  if (request.type !== 'peace'
    || !getCivilizationLiveness(state, request.fromCivId).living
    || !getCivilizationLiveness(state, request.toCivId).living
    || actor.diplomacy.vassalage.overlord || target.diplomacy.vassalage.overlord
    || !isAtWar(actor.diplomacy, request.toCivId) || !isAtWar(target.diplomacy, request.fromCivId)) {
    return rejectDiplomaticRequest(state, actingCivId, requestId);
  }

  bus.emit('diplomacy:peace-made', { civA: request.fromCivId, civB: request.toCivId });
  const peaced = makeMajorPeace(state, request.fromCivId, request.toCivId, bus);
  return cancelInvalidNetworkPlans({
    ...peaced,
    pendingDiplomacyRequests: (peaced.pendingDiplomacyRequests ?? []).filter(
      candidate => !isWarResolutionRequestPair(candidate, request.fromCivId, request.toCivId),
    ),
  }).state;
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
