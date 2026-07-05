import type { GameState, HexCoord } from '@/core/types';
import { getUnmovedUnitsForEndTurn, removePlayerUnitFromState, skipUnitInState } from '@/systems/unit-lifecycle-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getEffectiveGoldPerTurn, getRouteTechGoldBonus } from '@/systems/trade-system';
import { createEndTurnWarningPanel } from '@/ui/end-turn-warning-panel';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';

export interface UnitTurnFlowDeps {
  uiLayer: HTMLElement;
  getState: () => GameState;
  setState: (state: GameState) => void;
  getSelectedUnitId: () => string | null;
  selectUnit: (unitId: string) => void;
  deselectUnit: () => void;
  selectNextUnit: () => void;
  centerOn: (coord: HexCoord) => void;
  refreshVisibility: () => void;
  setRenderState: (state: GameState) => void;
  updateHUD: () => void;
  showNotification: (message: string, type: 'info' | 'success' | 'warning') => void;
  setBlockingOverlay: (id: string | null) => void;
  endTurn: (options: { allowUnmovedUnits?: boolean }) => void;
  onUnitDisbanded?: (state: GameState, unitId: string, routeId: string) => GameState;
}

export interface UnitTurnFlow {
  skipUnitAction(unitId: string): void;
  showDeleteUnitConfirmation(unitId: string): void;
  showEndTurnUnitWarningIfNeeded(): boolean;
}

export function createUnitTurnFlow(deps: UnitTurnFlowDeps): UnitTurnFlow {
  const closeUnitDeleteConfirmation = (): void => {
    deps.uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
    deps.setBlockingOverlay(null);
  };

  const closeEndTurnWarningPanel = (): void => {
    deps.uiLayer.querySelector('#end-turn-warning-panel')?.remove();
    deps.setBlockingOverlay(null);
  };

  const skipUnitAction = (unitId: string): void => {
    const state = deps.getState();
    const unit = state.units[unitId];
    if (!unit || unit.owner !== state.currentPlayer) return;

    const nextState = skipUnitInState(state, state.currentPlayer, unitId);
    deps.setState(nextState);
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} will hold position this turn.`, 'info');
    deps.setRenderState(deps.getState());
    deps.updateHUD();

    if (deps.getSelectedUnitId() === unitId) {
      deps.selectNextUnit();
    }
  };

  const showDeleteUnitConfirmation = (unitId: string): void => {
    const state = deps.getState();
    const unit = state.units[unitId];
    if (!unit || unit.owner !== state.currentPlayer) return;

    // Build caravan-aware confirmation details
    let displayName = UNIT_DEFINITIONS[unit.type].name;
    let bodyText: string | undefined;
    const committedRouteId = unit.committedToRouteId;
    if (unit.type === 'caravan' && committedRouteId) {
      const route = state.marketplace?.tradeRoutes.find(r => r.id === committedRouteId);
      if (route) {
        const fromName = state.cities[route.fromCityId]?.name ?? route.fromCityId;
        const toName = state.cities[route.toCityId]?.name ?? route.toCityId;
        const goldLoss = getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(state, route));
        displayName = `Caravan (${fromName} → ${toName})`;
        bodyText = `Disbanding this Caravan will end your ${fromName} → ${toName} trade route (-${goldLoss.toFixed(1)} gold/turn). Continue?`;
      }
    }

    deps.setBlockingOverlay('unit-delete-confirmation');
    createUnitDeleteConfirmationPanel(deps.uiLayer, {
      unitName: displayName,
      bodyText,
      onConfirm: () => {
        let currentState = deps.getState();
        const currentUnit = currentState.units[unitId];
        const deletedName = currentUnit ? UNIT_DEFINITIONS[currentUnit.type].name : UNIT_DEFINITIONS[unit.type].name;
        closeUnitDeleteConfirmation();
        // Clean up trade route before removing the unit
        const routeId = currentUnit?.committedToRouteId;
        if (routeId && deps.onUnitDisbanded) {
          currentState = deps.onUnitDisbanded(currentState, unitId, routeId);
          deps.setState(currentState);
        }
        deps.setState(removePlayerUnitFromState(deps.getState(), deps.getState().currentPlayer, unitId));
        if (deps.getSelectedUnitId() === unitId) {
          deps.deselectUnit();
        }
        deps.refreshVisibility();
        deps.setRenderState(deps.getState());
        deps.updateHUD();
        deps.showNotification(`${deletedName} deleted.`, 'warning');
        deps.selectNextUnit();
      },
      onCancel: () => {
        closeUnitDeleteConfirmation();
        if (deps.getState().units[unitId]) {
          deps.selectUnit(unitId);
        }
      },
    });
  };

  const showEndTurnUnitWarningIfNeeded = (): boolean => {
    const state = deps.getState();
    const unmovedUnits = getUnmovedUnitsForEndTurn(state, state.currentPlayer);
    if (unmovedUnits.length === 0) {
      return false;
    }

    deps.setBlockingOverlay('end-turn-warning');
    createEndTurnWarningPanel(deps.uiLayer, {
      unmovedUnits: unmovedUnits.map(unit => ({
        unitId: unit.id,
        label: UNIT_DEFINITIONS[unit.type].name,
        positionLabel: `${unit.position.q}, ${unit.position.r}`,
      })),
      onGoToUnit: unitId => {
        closeEndTurnWarningPanel();
        const target = deps.getState().units[unitId];
        if (!target) return;
        deps.selectUnit(unitId);
        deps.centerOn(target.position);
        deps.updateHUD();
      },
      onEndTurnAnyway: () => {
        closeEndTurnWarningPanel();
        deps.endTurn({ allowUnmovedUnits: true });
      },
      onCancel: () => {
        closeEndTurnWarningPanel();
      },
    });

    return true;
  };

  return {
    skipUnitAction,
    showDeleteUnitConfirmation,
    showEndTurnUnitWarningIfNeeded,
  };
}
