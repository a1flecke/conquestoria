/**
 * Diplomacy / trade panel openers (#1242), split out of the monolithic
 * `panel-actions-controller.ts`. Covers the Diplomacy and Marketplace panels.
 *
 * No behaviour change: same panels, same publication (`session.commit`), same
 * copy. Depends only on the shared ports.
 */
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { applyRouteControl, ROUTE_CONTROL_DENIAL_MESSAGES, ROUTE_CONTROL_NOTIFICATIONS, type RouteControlAction } from '@/systems/trade-route-lifecycle';
import type { PanelActionsCommonDeps } from './panel-actions-shared';

export interface DiplomacyTradePanelActionsController {
  openDiplomacyPanel(focusMinorCivId?: string): void;
  openMarketplacePanel(): void;
}

export function createDiplomacyTradePanelActionsController(
  deps: PanelActionsCommonDeps,
): DiplomacyTradePanelActionsController {
  let stopMarketplaceUpdates: (() => void) | null = null;

  function closeMarketplacePanel(): void {
    stopMarketplaceUpdates?.();
    stopMarketplaceUpdates = null;
    deps.getElementById('marketplace-panel')?.remove();
  }

  function renderMarketplacePanel(): void {
    const previous = deps.getElementById('marketplace-panel');
    const scrollTop = previous?.scrollTop ?? 0;
    previous?.remove();
    const panel = createMarketplacePanel(deps.uiLayer, deps.session.getState(), {
      onClose: () => closeMarketplacePanel(),
      onSelectUnit: (unitId) => {
        closeMarketplacePanel();
        deps.selectionController.selectUnit(unitId);
        const unit = deps.session.getState().units[unitId];
        if (unit) deps.renderLoop.camera.centerOn(unit.position);
      },
      onRouteControl: handleRouteControl,
    });
    if (panel) panel.scrollTop = scrollTop;
  }

  function openDiplomacyPanel(focusMinorCivId?: string): void {
    deps.hud.closeDrawer();
    deps.getElementById('diplomacy-panel')?.remove();
    createDiplomacyPanel(deps.uiLayer, deps.session.getState(), {
      focusMinorCivId,
      onAction: deps.diplomacyActions.handleDiplomaticAction,
      onAcceptPeaceRequest: deps.diplomacyActions.handleAcceptPeaceRequest,
      onRejectPeaceRequest: deps.diplomacyActions.handleRejectPeaceRequest,
      onAcceptTreatyProposal: deps.diplomacyActions.handleAcceptTreatyProposal,
      onDeclineTreatyProposal: deps.diplomacyActions.handleDeclineTreatyProposal,
      onBreakTreaty: deps.diplomacyActions.handleBreakTreaty,
      onGiftGold: deps.diplomacyActions.handleGiftGold,
      onSponsorFestival: deps.diplomacyActions.handleSponsorFestival,
      onMinorCivReparations: deps.diplomacyActions.handleMinorCivReparations,
      onMinorCivWarPeace: deps.diplomacyActions.handleMinorCivWarPeace,
      onSendAid: deps.diplomacyActions.handleSendAid,
      onDeclareWarGoal: deps.diplomacyActions.handleDeclareWarGoal,
      onProposeSettlement: deps.diplomacyActions.handleProposeSettlement,
      onAcceptSettlementOffer: deps.diplomacyActions.handleAcceptSettlementOffer,
      onRejectSettlementOffer: deps.diplomacyActions.handleRejectSettlementOffer,
      onClose: () => {},
    });
  }

  function handleRouteControl(routeId: string, action: RouteControlAction): void {
    const state = deps.session.getState();
    const result = applyRouteControl(state, routeId, action, state.currentPlayer, deps.bus);
    if (!result.ok) {
      deps.showNotification(ROUTE_CONTROL_DENIAL_MESSAGES[result.reason], 'warning');
      return;
    }
    deps.session.commit(result.state);
    deps.showNotification(ROUTE_CONTROL_NOTIFICATIONS[action], 'info');
    // The open panel refreshes from the committed state through its session subscription.
  }

  function openMarketplacePanel(): void {
    deps.hud.closeDrawer();
    closeMarketplacePanel();
    const viewerId = deps.session.getState().currentPlayer;
    renderMarketplacePanel();
    stopMarketplaceUpdates = deps.session.subscribe(next => {
      if (next.currentPlayer !== viewerId) {
        closeMarketplacePanel();
        return;
      }
      renderMarketplacePanel();
    });
  }

  return { openDiplomacyPanel, openMarketplacePanel };
}
