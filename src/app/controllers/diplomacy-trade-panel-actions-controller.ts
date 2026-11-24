/**
 * Diplomacy / trade panel openers (#1242), split out of the monolithic
 * `panel-actions-controller.ts`. Covers the Diplomacy and Marketplace panels.
 *
 * Depends only on the shared ports.
 */
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { setCommerceResourcePolicy } from '@/systems/resource-market-offers';
import { setFuelConservationPolicy } from '@/systems/resource-fuel-system';
import { controlTradeRoute, type PanelActionsCommonDeps } from './panel-actions-shared';
import { createBorderConfrontationActionsController } from './border-confrontation-actions-controller';

export interface DiplomacyTradePanelActionsController {
  openDiplomacyPanel(focusMinorCivId?: string): void;
  openMarketplacePanel(): void;
}

export function createDiplomacyTradePanelActionsController(
  deps: PanelActionsCommonDeps,
): DiplomacyTradePanelActionsController {
  let stopMarketplaceUpdates: (() => void) | null = null;
  // #1766: a dedicated controller, so the border-confrontation feature does not expand the shared diplomacy
  // controller. It only needs ports this controller already has.
  const borderConfrontation = createBorderConfrontationActionsController({
    session: deps.session,
    bus: deps.bus,
    showNotification: deps.showNotification,
    openDiplomacyPanel: () => openDiplomacyPanel(),
  });

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
      onRouteControl: (routeId, action) => controlTradeRoute(deps, routeId, action),
      onSetResourcePolicy: policy => {
        deps.session.commit(setCommerceResourcePolicy(deps.session.getState(), policy));
        renderMarketplacePanel();
      },
      onSetFuelConservation: policy => {
        const state = deps.session.getState();
        deps.session.commit(setFuelConservationPolicy(state, state.currentPlayer, policy));
        renderMarketplacePanel();
      },
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
      onDemandWithdrawal: borderConfrontation.handleDemandWithdrawal,
      onAcceptWithdrawalDemand: borderConfrontation.handleAcceptWithdrawalDemand,
      onRefuseWithdrawalDemand: borderConfrontation.handleRefuseWithdrawalDemand,
      onClose: () => {},
    });
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
