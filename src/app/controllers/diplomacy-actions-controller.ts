/**
 * Owns the diplomacy, minor-civ, and crisis-interaction handlers that mutate
 * state on behalf of the player's diplomacy panel and city/city-overview
 * panels (#787 phase 10b-a): `handleDiplomaticAction`,
 * `handleAcceptPeaceRequest`, `handleRejectPeaceRequest`,
 * `handleAcceptTreatyProposal`, `handleDeclineTreatyProposal`,
 * `handleBreakTreaty`, `handleGiftGold`, `handleSponsorFestival`,
 * `handleMinorCivReparations`, `handleSendAid`, `handleMinorCivWarPeace`,
 * `handleAppeaseFaction`, `handleConcedeToMovement`, `handleEstablishRoute`.
 *
 * Most of these end by calling `openDiplomacyPanel()` to refresh the open
 * panel with post-mutation state -- that function belongs to
 * `PanelActionsController` (phase 10b-b/c/d), so it arrives here as an
 * injected dep rather than a direct import, avoiding a forward reference
 * regardless of which sub-phase lands first. `handleAppeaseFaction` and
 * `handleConcedeToMovement` are the exception: they return `GameState` and
 * let their caller (the city panel or city-overview panel) decide whether
 * and how to re-render -- preserve that return-value contract verbatim,
 * `createCityPanel`'s `onAppeaseFaction`/`onConcedeToMovement` callbacks
 * depend on it.
 *
 * Everything this file calls that is a pure `@/systems/*` or `@/ui/*` helper
 * is imported directly, matching the precedent set by every prior controller
 * in this arc. Only concrete platform services, sibling controllers, and the
 * main.ts-local `openDiplomacyPanel` function are threaded through as deps.
 */
import type { EventBus } from '@/core/event-bus';
import type { GameSession } from '@/app/ports';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { DiplomaticAction, GameState, SettlementTerm, TreatyType, WarGoalKind } from '@/core/types';
import { isAtWar } from '@/systems/diplomacy-queries';
import { CONSENT_TREATY_TYPES, hasPendingTreatyProposalBetween, isDiplomaticRequestLive } from '@/systems/diplomacy-requests';
import {
  acceptDiplomaticRequest,
  applyDiplomaticAction,
  DIPLOMATIC_ACTION_DENIAL_MESSAGES,
  DIPLOMATIC_REQUEST_DENIAL_MESSAGES,
  rejectDiplomaticRequest,
} from '@/systems/diplomacy-system';
import { breakTreaty } from '@/systems/diplomacy-treaties';
import { emitAccessLossNotices } from '@/systems/territorial-access';
import { getVassalageEligibility, canPetitionIndependence } from '@/systems/diplomacy-vassal-rules';
import { declareWarGoal, canDeclareWarGoal } from '@/systems/war-goal-system';
import { proposeSettlement, acceptSettlementOffer } from '@/systems/settlement-system';
import { TREATY_LABELS } from '@/ui/notification-routes/diplomacy-routes';
import { appeaseFaction, concedeToMovement } from '@/systems/faction-commands';
import { getCivAvailableResources } from '@/systems/resource-acquisition-system';
import { establishQuestAwareRoute } from '@/systems/quest-aware-trade-system';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import {
  performMinorCivFestival,
  performMinorCivGift,
  performMinorCivReparations,
  setMinorCivWarState,
} from '@/systems/minor-civ-actions';
import { applyOpportunisticWarPenaltyIfCrisisStruck, applySendAid, canSendAid } from '@/systems/crisis-interaction-system';
import { openEstablishRoutePanel } from '@/ui/establish-route-panel';
import { emitMinorCivLeagueNotices } from '@/systems/minor-civ-league-presentation';

export interface DiplomacyActionsController {
  handleDiplomaticAction(targetCivId: string, action: DiplomaticAction): void;
  handleAcceptPeaceRequest(requestId: string): void;
  handleRejectPeaceRequest(requestId: string): void;
  handleAcceptTreatyProposal(requestId: string): void;
  handleDeclineTreatyProposal(requestId: string): void;
  handleBreakTreaty(civId: string, treatyType: TreatyType): void;
  handleGiftGold(mcId: string): void;
  handleSponsorFestival(mcId: string): void;
  handleMinorCivReparations(mcId: string): void;
  handleSendAid(crisisId: string): void;
  handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void;
  handleAppeaseFaction(cityId: string): GameState;
  handleConcedeToMovement(cityId: string): GameState;
  handleEstablishRoute(caravanId: string): void;
  handleDeclareWarGoal(targetCivId: string, kind: WarGoalKind, targetCityId?: string): void;
  handleProposeSettlement(targetCivId: string, terms: SettlementTerm[]): void;
  handleAcceptSettlementOffer(requestId: string): void;
  handleRejectSettlementOffer(requestId: string): void;
}

export interface DiplomacyActionsControllerDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly selectionController: Pick<SelectionController, 'selectUnit'>;
  readonly uiLayer: HTMLDivElement;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  /** `PanelActionsController`'s function (phase 10b-b/c/d) -- injected to avoid a forward reference. */
  readonly openDiplomacyPanel: () => void;
}

// Bilateral treaty actions that route through the #901 propose -> consent ->
// commit lifecycle; an AI recipient can refuse any of these outright. Shares
// `CONSENT_TREATY_TYPES` with the diplomacy panel (same string values).
const CONSENT_TREATY_ACTIONS = new Set<string>(CONSENT_TREATY_TYPES);

export function createDiplomacyActionsController(deps: DiplomacyActionsControllerDeps): DiplomacyActionsController {
  function handleDiplomaticAction(targetCivId: string, action: DiplomaticAction): void {
    const cp = deps.session.getState().currentPlayer;
    const before = deps.session.getState();
    const targetWasHuman = before.civilizations[targetCivId]?.isHuman === true;
    // #1221: the executor re-checks the same eligibility the panel was built from. A refusal is typed and carries
    // copy; the panel is rebuilt so a stale button disappears instead of staying clickable.
    const attempt = applyDiplomaticAction(before, cp, targetCivId, action, deps.bus);
    if (!attempt.ok) {
      deps.showNotification(DIPLOMATIC_ACTION_DENIAL_MESSAGES[attempt.reason], 'warning');
      deps.openDiplomacyPanel();
      return;
    }
    const after = deps.session.batch(() => {
      deps.session.commit(attempt.state);
      if (action === 'declare_war' && deps.session.getState() !== before) {
        deps.session.commit(applyOpportunisticWarPenaltyIfCrisisStruck(deps.session.getState(), cp, targetCivId, deps.bus));
      }
      const settled = deps.session.getState();
      emitMinorCivLeagueNotices(before, settled, deps.bus);
      return settled;
    });
    deps.openDiplomacyPanel();

    // #901: bilateral treaties/peace now route through propose -> consent ->
    // commit. `applyDiplomaticAction` returns the same state object when nothing
    // happened. The acting player's immediate feedback must match what the panel
    // now shows: a proposal queued for a human, an AI's same-turn accept/decline,
    // or "already pending" for a reciprocal proposal that no-ops. The *other*
    // party's notification is delivered recipient-scoped from the routing events
    // (treaty-proposed / treaty-accepted), never from here.
    const resolved = after !== before;
    const targetName = after.civilizations[targetCivId]?.name ?? 'They';

    if (action === 'offer_vassalage' || action === 'petition_independence') {
      const pending = (after.pendingDiplomacyRequests ?? []).some(r => r.fromCivId === cp && r.toCivId === targetCivId
        && (action === 'offer_vassalage' ? r.treatyType === 'vassalage' : r.type === 'independence'));
      if (pending) deps.showNotification(`Awaiting ${targetName}'s decision.`, 'info');
      else if (!resolved && (targetWasHuman || (action === 'offer_vassalage' ? !getVassalageEligibility(before, cp, targetCivId).ok : !canPetitionIndependence(before, cp)))) deps.showNotification('This proposal is no longer available.', 'warning');
      // AI decisions use recipient-scoped events, including refusal.
    } else if (action === 'release_vassal' || action === 'defend_vassal') {
      if (!resolved) deps.showNotification('This action is no longer available.', 'warning');
    } else if (action === 'request_peace') {
      const stillAtWar = isAtWar(after.civilizations[cp]?.diplomacy ?? before.civilizations[cp]!.diplomacy, targetCivId);
      if (!resolved) {
        deps.showNotification(`${targetName} is unwilling to make peace.`, 'warning');
      } else if (!stillAtWar) {
        deps.showNotification(`Peace made with ${targetName}.`, 'success');
      } else {
        deps.showNotification(`Peace requested from ${targetName}.`, 'info');
      }
    } else if (CONSENT_TREATY_ACTIONS.has(action)) {
      const label = TREATY_LABELS[action as TreatyType];
      if (resolved && targetWasHuman) {
        deps.showNotification(`${label} proposed to ${targetName}.`, 'info');
      } else if (resolved) {
        // AI target accepted this turn -- the diplomacy:treaty-accepted routing
        // event already tells the acting player "<Target> accepted the <label>."
      } else if (hasPendingTreatyProposalBetween(after, cp, targetCivId, action as TreatyType)) {
        deps.showNotification(
          `${targetName} has already proposed a ${label} — accept or decline it in the Diplomacy panel.`,
          'info',
        );
      } else {
        deps.showNotification(`${targetName} declined the ${label}.`, 'warning');
      }
    } else {
      deps.showNotification(`Diplomatic action: ${action.replace(/_/g, ' ')}`, 'info');
    }
  }

  function handleAcceptPeaceRequest(requestId: string): void {
    const before = deps.session.getState();
    const accepted = acceptDiplomaticRequest(before, before.currentPlayer, requestId, deps.bus);
    if (!accepted.ok) {
      // #1221: a stale accept used to fall through to a silent rejection and still announce "Peace accepted."
      deps.showNotification(DIPLOMATIC_REQUEST_DENIAL_MESSAGES[accepted.reason], 'warning');
      deps.openDiplomacyPanel();
      return;
    }
    deps.session.commit(accepted.state);
    emitMinorCivLeagueNotices(before, accepted.state, deps.bus);
    deps.openDiplomacyPanel();
    deps.showNotification('Peace accepted.', 'success');
  }

  function handleRejectPeaceRequest(requestId: string): void {
    deps.session.commit(rejectDiplomaticRequest(deps.session.getState(), deps.session.getState().currentPlayer, requestId));
    deps.openDiplomacyPanel();
    deps.showNotification('Peace request rejected.', 'info');
  }

  function respondToProposal(requestId: string, accept: boolean): void {
    const before = deps.session.getState();
    const request = before.pendingDiplomacyRequests?.find(r => r.id === requestId && r.toCivId === before.currentPlayer);
    const accepted = accept ? acceptDiplomaticRequest(before, before.currentPlayer, requestId, deps.bus) : null;
    if (accepted && !accepted.ok) {
      deps.showNotification(DIPLOMATIC_REQUEST_DENIAL_MESSAGES[accepted.reason], 'warning');
      deps.openDiplomacyPanel();
      return;
    }
    const after = accepted ? accepted.state : rejectDiplomaticRequest(before, before.currentPlayer, requestId, deps.bus);
    deps.session.commit(after);
    emitMinorCivLeagueNotices(before, after, deps.bus);
    deps.openDiplomacyPanel();
    const panel = deps.uiLayer.querySelector<HTMLElement>('#diplomacy-panel');
    if (panel) { panel.tabIndex = -1; panel.focus(); }
    const live = request && isDiplomaticRequestLive(before, request);
    const vassalage = request?.treatyType === 'vassalage';
    const petition = request?.type === 'independence';
    const valid = live && (accept
      ? petition ? after.civilizations[request.fromCivId]?.diplomacy.vassalage.overlord !== request.toCivId && after !== before
        : after.civilizations[request.toCivId]?.diplomacy.treaties.some(t => t.type === request.treatyType
          && (t.civA === request.fromCivId || t.civB === request.fromCivId))
      : petition ? after.civilizations[request.fromCivId]?.diplomacy.vassalage.overlord !== request.toCivId && after !== before : after !== before);
    if (!valid) deps.showNotification('This proposal is no longer available.', 'warning');
    else if (!vassalage && !petition) deps.showNotification(accept ? 'Treaty signed.' : 'Proposal declined.', accept ? 'success' : 'info');
    else if (!accept && !petition) deps.showNotification('Proposal declined.', 'info');
    // Successful vassalage/petition outcomes already notify each party once via the bus.
  }

  function handleAcceptTreatyProposal(requestId: string): void { respondToProposal(requestId, true); }
  function handleDeclineTreatyProposal(requestId: string): void { respondToProposal(requestId, false); }

  function handleBreakTreaty(civId: string, treatyType: TreatyType): void {
    if (treatyType === 'vassalage') return;
    const actorId = deps.session.getState().currentPlayer;
    const actor = deps.session.getState().civilizations[actorId];
    const target = deps.session.getState().civilizations[civId];
    if (!actor || !target) return;
    const beforeBreak = deps.session.getState();
    deps.session.commit({
      ...beforeBreak,
      civilizations: {
        ...beforeBreak.civilizations,
        [actorId]: { ...actor, diplomacy: breakTreaty(actor.diplomacy, civId, treatyType, beforeBreak.turn) },
        [civId]: { ...target, diplomacy: breakTreaty(target.diplomacy, actorId, treatyType, beforeBreak.turn) },
      },
    });
    // #871: breaking Open Borders / an alliance ends passage; tell whoever has units inside.
    emitAccessLossNotices(beforeBreak, deps.session.getState(), deps.bus);
    deps.openDiplomacyPanel();
    deps.showNotification(`${TREATY_LABELS[treatyType]} broken with ${target.name}.`, 'warning');
  }

  function handleGiftGold(mcId: string): void {
    const result = performMinorCivGift(deps.session.getState(), deps.session.getState().currentPlayer, mcId);
    if (!result.ok) {
      deps.showNotification(result.reason ?? 'Gift unavailable.', 'warning');
      return;
    }
    deps.session.commit(result.state);
    emitMinorCivQuestTransitions(deps.bus, result.transitions, deps.session.getState());
    deps.showNotification('Gift delivered.', 'info');
    deps.openDiplomacyPanel();
  }

  function handleSponsorFestival(mcId: string): void {
    const result = performMinorCivFestival(deps.session.getState(), deps.session.getState().currentPlayer, mcId);
    if (!result.ok) {
      deps.showNotification(result.reason ?? 'Festival unavailable.', 'warning');
      return;
    }
    deps.session.commit(result.state);
    emitMinorCivQuestTransitions(deps.bus, result.transitions, deps.session.getState());
    deps.showNotification('Festival sponsored.', 'success');
    deps.openDiplomacyPanel();
  }

  function handleMinorCivReparations(mcId: string): void {
    const before = deps.session.getState();
    const result = performMinorCivReparations(before, before.currentPlayer, mcId);
    if (!result.ok) {
      deps.showNotification(result.reason ?? 'Reparations unavailable.', 'warning');
      return;
    }
    deps.session.commit(result.state);
    emitMinorCivLeagueNotices(before, result.state, deps.bus);
    deps.showNotification('Reparations paid.', 'success');
    deps.openDiplomacyPanel();
  }

  function handleSendAid(crisisId: string): void {
    const check = canSendAid(deps.session.getState(), deps.session.getState().currentPlayer, crisisId);
    if (!check.ok) {
      deps.showNotification('Send Aid unavailable.', 'warning');
      return;
    }
    deps.session.commit(applySendAid(deps.session.getState(), deps.session.getState().currentPlayer, crisisId, deps.bus));
    deps.showNotification('Aid sent.', 'success');
    deps.openDiplomacyPanel();
  }

  function handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void {
    const before = deps.session.getState();
    const result = setMinorCivWarState(before, before.currentPlayer, mcId, !currentlyAtWar, deps.bus);
    if (!result.ok) return;
    deps.session.commit(result.state);
    emitMinorCivLeagueNotices(before, result.state, deps.bus);
    emitMinorCivQuestTransitions(deps.bus, result.transitions, deps.session.getState());
    deps.showNotification(currentlyAtWar ? 'Peace with city-state' : 'War declared on city-state!', currentlyAtWar ? 'success' : 'warning');
    deps.openDiplomacyPanel();
  }

  function handleAppeaseFaction(cityId: string): GameState {
    const targetCity = deps.session.getState().cities[cityId];
    if (!targetCity) return deps.session.getState();
    const result = appeaseFaction(deps.session.getState(), cityId, deps.session.getState().currentPlayer);
    if (!result.success) {
      deps.showNotification(result.message, 'warning');
      return deps.session.getState();
    }
    deps.session.commit(result.state);
    deps.showNotification(result.message, 'success');
    return deps.session.getState();
  }

  function handleConcedeToMovement(cityId: string): GameState {
    const targetCity = deps.session.getState().cities[cityId];
    if (!targetCity) return deps.session.getState();
    const result = concedeToMovement(deps.session.getState(), cityId, deps.session.getState().currentPlayer);
    if (!result.success) {
      deps.showNotification(result.message, 'warning');
      return deps.session.getState();
    }
    deps.session.commit(result.state);
    deps.bus.emit('faction:unrest-resolved', { cityId, owner: deps.session.getState().currentPlayer });
    deps.bus.emit('faction:concession-made', { cityId, owner: deps.session.getState().currentPlayer, concessionType: 'charter' });
    deps.showNotification(result.message, 'success');
    return deps.session.getState();
  }

  // Trade Routes Overhaul (#553 MR4/4) — extracted so the City panel's Trade Routes
  // section and selected-unit-info's Establish Route button trigger the exact same code
  // path (per ui-panels.md's Extracted UI Flows rule), not two copies that could drift.
  function handleEstablishRoute(caravanId: string): void {
    openEstablishRoutePanel(deps.uiLayer, deps.session.getState(), caravanId, (toCityId) => {
      const resourceDiversity = getCivAvailableResources(deps.session.getState(), deps.session.getState().currentPlayer).size;
      const routeResult = establishQuestAwareRoute(deps.session.getState(), caravanId, toCityId, resourceDiversity);
      deps.session.commit(routeResult.state);
      emitMinorCivQuestTransitions(deps.bus, routeResult.questTransitions, deps.session.getState());
      deps.bus.emit('trade:route-created', { route: routeResult.route });
      deps.selectionController.selectUnit(caravanId);
      deps.showNotification('Trade route established!', 'success');
    });
  }

  // #988: state a purpose for an ongoing war. A no-op (canDeclareWarGoal fails)
  // gets a plain "no longer available" notice -- same convention as every
  // other proposal above -- rather than a silent failure.
  function handleDeclareWarGoal(targetCivId: string, kind: WarGoalKind, targetCityId?: string): void {
    const before = deps.session.getState();
    const cp = before.currentPlayer;
    if (!canDeclareWarGoal(before, cp, targetCivId, kind, targetCityId).ok) {
      deps.showNotification('That war goal is no longer available.', 'warning');
      return;
    }
    deps.session.commit(declareWarGoal(before, cp, targetCivId, kind, targetCityId, before.turn));
    deps.openDiplomacyPanel();
  }

  // #988: the real negotiated-peace path -- typed terms bundled with the war's
  // end, executed atomically or not at all. Mirrors handleDiplomaticAction's
  // request_peace branch for player feedback.
  function handleProposeSettlement(targetCivId: string, terms: SettlementTerm[]): void {
    const before = deps.session.getState();
    const cp = before.currentPlayer;
    const targetWasHuman = before.civilizations[targetCivId]?.isHuman === true;
    const targetName = before.civilizations[targetCivId]?.name ?? 'They';
    const relationship = before.civilizations[cp]?.diplomacy.relationships[targetCivId] ?? 0;
    const after = proposeSettlement(before, cp, targetCivId, terms, deps.bus, { relationship });
    deps.session.commit(after);
    emitMinorCivLeagueNotices(before, after, deps.bus);
    deps.openDiplomacyPanel();
    const resolved = after !== before;
    const stillAtWar = isAtWar(after.civilizations[cp]?.diplomacy ?? before.civilizations[cp]!.diplomacy, targetCivId);
    if (!resolved) {
      deps.showNotification(`${targetName} rejected the terms, or the offer was no longer legal.`, 'warning');
    } else if (!stillAtWar) {
      deps.showNotification(`Settlement signed with ${targetName}.`, 'success');
    } else if (targetWasHuman) {
      deps.showNotification(`Settlement offer sent to ${targetName}.`, 'info');
    }
  }

  function handleAcceptSettlementOffer(requestId: string): void {
    const before = deps.session.getState();
    const after = acceptSettlementOffer(before, before.currentPlayer, requestId, deps.bus);
    deps.session.commit(after);
    emitMinorCivLeagueNotices(before, after, deps.bus);
    deps.openDiplomacyPanel();
    deps.showNotification(after === before ? 'This offer is no longer available.' : 'Settlement accepted.', after === before ? 'warning' : 'success');
  }

  function handleRejectSettlementOffer(requestId: string): void {
    deps.session.commit(rejectDiplomaticRequest(deps.session.getState(), deps.session.getState().currentPlayer, requestId, deps.bus));
    deps.openDiplomacyPanel();
    deps.showNotification('Settlement offer rejected.', 'info');
  }

  return {
    handleDiplomaticAction,
    handleAcceptPeaceRequest,
    handleRejectPeaceRequest,
    handleAcceptTreatyProposal,
    handleDeclineTreatyProposal,
    handleBreakTreaty,
    handleGiftGold,
    handleSponsorFestival,
    handleMinorCivReparations,
    handleSendAid,
    handleMinorCivWarPeace,
    handleAppeaseFaction,
    handleConcedeToMovement,
    handleEstablishRoute,
    handleDeclareWarGoal,
    handleProposeSettlement,
    handleAcceptSettlementOffer,
    handleRejectSettlementOffer,
  };
}
