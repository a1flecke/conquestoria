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
import type { RenderLoop } from '@/renderer/render-loop';
import type { EventBus } from '@/core/event-bus';
import type { GameSession } from '@/app/ports';
import type { HudController } from '@/app/controllers/hud-controller';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { DiplomaticAction, GameState, TreatyType } from '@/core/types';
import {
  acceptDiplomaticRequest,
  applyDiplomaticAction,
  breakTreaty,
  CONSENT_TREATY_TYPES,
  hasPendingTreatyProposalBetween,
  isAtWar,
  rejectDiplomaticRequest,
} from '@/systems/diplomacy-system';
import { TREATY_LABELS } from '@/ui/notification-routing';
import { appeaseFaction, concedeToMovement } from '@/systems/faction-system';
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
}

export interface DiplomacyActionsControllerDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly renderLoop: Pick<RenderLoop, 'setGameState'>;
  readonly hud: Pick<HudController, 'update'>;
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
    deps.session.setStateWithoutRefresh(applyDiplomaticAction(before, cp, targetCivId, action, deps.bus));
    if (action === 'declare_war') {
      deps.session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(deps.session.getState(), cp, targetCivId, deps.bus));
    }
    const after = deps.session.getState();
    deps.renderLoop.setGameState(after);
    deps.hud.update();
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

    if (action === 'request_peace') {
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
    deps.session.commit(acceptDiplomaticRequest(deps.session.getState(), deps.session.getState().currentPlayer, requestId, deps.bus));
    deps.openDiplomacyPanel();
    deps.showNotification('Peace accepted.', 'success');
  }

  function handleRejectPeaceRequest(requestId: string): void {
    deps.session.commit(rejectDiplomaticRequest(deps.session.getState(), deps.session.getState().currentPlayer, requestId));
    deps.openDiplomacyPanel();
    deps.showNotification('Peace request rejected.', 'info');
  }

  function handleAcceptTreatyProposal(requestId: string): void {
    deps.session.commit(acceptDiplomaticRequest(deps.session.getState(), deps.session.getState().currentPlayer, requestId, deps.bus));
    deps.openDiplomacyPanel();
    deps.showNotification('Treaty signed.', 'success');
  }

  function handleDeclineTreatyProposal(requestId: string): void {
    // #901: pass the bus so the original proposer (possibly an inactive
    // hot-seat player) is told via diplomacy:treaty-declined.
    deps.session.commit(rejectDiplomaticRequest(deps.session.getState(), deps.session.getState().currentPlayer, requestId, deps.bus));
    deps.openDiplomacyPanel();
    deps.showNotification('Proposal declined.', 'info');
  }

  function handleBreakTreaty(civId: string, treatyType: TreatyType): void {
    const actorId = deps.session.getState().currentPlayer;
    const actor = deps.session.getState().civilizations[actorId];
    const target = deps.session.getState().civilizations[civId];
    if (!actor || !target) return;
    deps.session.commit({
      ...deps.session.getState(),
      civilizations: {
        ...deps.session.getState().civilizations,
        [actorId]: { ...actor, diplomacy: breakTreaty(actor.diplomacy, civId, treatyType, deps.session.getState().turn) },
        [civId]: { ...target, diplomacy: breakTreaty(target.diplomacy, actorId, treatyType, deps.session.getState().turn) },
      },
    });
    deps.openDiplomacyPanel();
    deps.showNotification(`${TREATY_LABELS[treatyType]} broken with ${target.name}.`, 'warning');
  }

  function handleGiftGold(mcId: string): void {
    const result = performMinorCivGift(deps.session.getState(), deps.session.getState().currentPlayer, mcId);
    if (!result.ok) {
      deps.showNotification(result.reason ?? 'Gift unavailable.', 'warning');
      return;
    }
    deps.session.setStateWithoutRefresh(result.state);
    emitMinorCivQuestTransitions(deps.bus, result.transitions, deps.session.getState());
    deps.showNotification('Gift delivered.', 'info');
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
    deps.openDiplomacyPanel();
  }

  function handleSponsorFestival(mcId: string): void {
    const result = performMinorCivFestival(deps.session.getState(), deps.session.getState().currentPlayer, mcId);
    if (!result.ok) {
      deps.showNotification(result.reason ?? 'Festival unavailable.', 'warning');
      return;
    }
    deps.session.setStateWithoutRefresh(result.state);
    emitMinorCivQuestTransitions(deps.bus, result.transitions, deps.session.getState());
    deps.showNotification('Festival sponsored.', 'success');
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
    deps.openDiplomacyPanel();
  }

  function handleMinorCivReparations(mcId: string): void {
    const result = performMinorCivReparations(deps.session.getState(), deps.session.getState().currentPlayer, mcId);
    if (!result.ok) {
      deps.showNotification(result.reason ?? 'Reparations unavailable.', 'warning');
      return;
    }
    deps.session.setStateWithoutRefresh(result.state);
    deps.showNotification('Reparations paid.', 'success');
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
    deps.openDiplomacyPanel();
  }

  function handleSendAid(crisisId: string): void {
    const check = canSendAid(deps.session.getState(), deps.session.getState().currentPlayer, crisisId);
    if (!check.ok) {
      deps.showNotification('Send Aid unavailable.', 'warning');
      return;
    }
    deps.session.setStateWithoutRefresh(applySendAid(deps.session.getState(), deps.session.getState().currentPlayer, crisisId, deps.bus));
    deps.showNotification('Aid sent.', 'success');
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
    deps.openDiplomacyPanel();
  }

  function handleMinorCivWarPeace(mcId: string, currentlyAtWar: boolean): void {
    const result = setMinorCivWarState(deps.session.getState(), deps.session.getState().currentPlayer, mcId, !currentlyAtWar);
    if (!result.ok) return;
    deps.session.setStateWithoutRefresh(result.state);
    emitMinorCivQuestTransitions(deps.bus, result.transitions, deps.session.getState());
    deps.showNotification(currentlyAtWar ? 'Peace with city-state' : 'War declared on city-state!', currentlyAtWar ? 'success' : 'warning');
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
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
    deps.session.setStateWithoutRefresh(result.state);
    deps.bus.emit('faction:unrest-resolved', { cityId, owner: deps.session.getState().currentPlayer });
    deps.bus.emit('faction:concession-made', { cityId, owner: deps.session.getState().currentPlayer, concessionType: 'charter' });
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
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
      deps.session.setStateWithoutRefresh(routeResult.state);
      emitMinorCivQuestTransitions(deps.bus, routeResult.questTransitions, deps.session.getState());
      deps.bus.emit('trade:route-created', { route: routeResult.route });
      deps.renderLoop.setGameState(deps.session.getState());
      deps.hud.update();
      deps.selectionController.selectUnit(caravanId);
      deps.showNotification('Trade route established!', 'success');
    });
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
  };
}
