/**
 * Diplomacy / trade panel openers (#1242), split out of the monolithic
 * `panel-actions-controller.ts`. Covers the Diplomacy and Marketplace panels.
 *
 * No behaviour change: same panels, same publication (`session.commit`), same
 * copy. Depends only on the shared ports.
 */
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import type { PanelActionsCommonDeps } from './panel-actions-shared';

export interface DiplomacyTradePanelActionsController {
  openDiplomacyPanel(focusMinorCivId?: string): void;
  openMarketplacePanel(): void;
}

export function createDiplomacyTradePanelActionsController(
  deps: PanelActionsCommonDeps,
): DiplomacyTradePanelActionsController {
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

  function openMarketplacePanel(): void {
    deps.hud.closeDrawer();
    deps.getElementById('marketplace-panel')?.remove();
    // No purchase action is wired (#1498): instant resource imports are contained, so the panel
    // exposes no callback that could commit a purchase or show a success toast. The canonical
    // denial lives in `resource-acquisition-system` and refuses even a direct or stale call.
    createMarketplacePanel(deps.uiLayer, deps.session.getState(), {
      onClose: () => {},
      onSelectUnit: (unitId) => {
        deps.getElementById('marketplace-panel')?.remove();
        deps.selectionController.selectUnit(unitId);
        const unit = deps.session.getState().units[unitId];
        if (unit) deps.renderLoop.camera.centerOn(unit.position);
      },
    });
  }

  return { openDiplomacyPanel, openMarketplacePanel };
}
