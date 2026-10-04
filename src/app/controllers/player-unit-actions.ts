/**
 * Player unit actions (#1243), split out of `player-action-controller.ts`: unit turn flow,
 * worker action, preach, rest, war-state guard, upgrade and found-city. Bodies verbatim.
 */
import type { UnitType, WorkerActionType } from '@/core/types';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import { createUnitTurnFlow } from '@/ui/unit-turn-flow';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { preach } from '@/systems/religion-system';
import { createUnitDeleteConfirmationPanel } from '@/ui/unit-delete-confirmation-panel';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { canHeal, restUnit } from '@/systems/unit-healing';
import { isMajorCivOwner } from '@/core/owner-kind';
import { declareMajorWar } from '@/systems/diplomacy-system';
import { resolveOpponentKind } from '@/systems/diplomacy-war';
import { applyOpportunisticWarPenaltyIfCrisisStruck } from '@/systems/crisis-interaction-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { formatCityFoundingBlockerMessage, getCityFoundingBlockers } from '@/systems/city-territory-system';
import { SFX } from '@/audio/sfx';
import { applyUnitUpgradeToState } from '@/systems/unit-upgrade-system';
import { updateAndRefreshVisibility } from '@/systems/last-seen-presentation';
import { syncCivilizationContactsFromVisibility } from '@/systems/discovery-system';
import { emitMinorCivLeagueNotices } from '@/systems/minor-civ-league-presentation';
import type { PlayerActionController, PlayerActionControllerDeps } from './player-action-shared';

export interface PlayerUnitActions {
  getUnitTurnFlow: PlayerActionController['getUnitTurnFlow'];
  performWorkerAction: PlayerActionController['performWorkerAction'];
  performPreach: PlayerActionController['performPreach'];
  ensurePlayerWarState: PlayerActionController['ensurePlayerWarState'];
  restAction: PlayerActionController['restAction'];
  executeUpgrade: PlayerActionController['executeUpgrade'];
  foundCityAction: PlayerActionController['foundCityAction'];
}

export function createPlayerUnitActions(deps: PlayerActionControllerDeps): PlayerUnitActions {
  function getUnitTurnFlow(): UnitTurnFlow {
    return createUnitTurnFlow({
      uiLayer: deps.uiLayer,
      getState: () => deps.session.getState(),
      commit: nextState => { deps.session.commit(nextState); },
      batch: fn => deps.session.batch(fn),
      getSelectedUnitId: () => deps.selection.getSelectedUnitId(),
      selectUnit: deps.selectionController.selectUnit,
      deselectUnit: deps.selectionController.deselectUnit,
      selectNextUnit: deps.selectionController.selectNextUnit,
      centerOn: coord => deps.renderLoop.camera.centerOn(coord),
      refreshVisibility: deps.selectionController.refreshCurrentPlayerVisibility,
      updateHUD: () => deps.hud.update(),
      showNotification: deps.showNotification,
      setBlockingOverlay: deps.setBlockingOverlay,
      endTurn: options => { void deps.turnFlow.endTurn(options); },
      bus: deps.bus,
    });
  }

  function performWorkerAction(action: WorkerActionType): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;

    const result = applyWorkerAction(deps.session.getState(), selectedUnitId, action);
    if (!result.ok) return;

    deps.session.commit(result.state);
    for (const event of result.events) {
      if (event.type === 'improvement:started') {
        deps.bus.emit('improvement:started', event.payload);
      } else if (event.type === 'road:started') {
        deps.bus.emit('road:started', event.payload);
      } else {
        deps.bus.emit('unit:destroyed', event.payload);
      }
    }


    if (result.workerConsumed || result.workerLost || !deps.session.getState().units[selectedUnitId]) {
      deps.selectionController.deselectUnit();
    } else {
      deps.selectionController.selectUnit(selectedUnitId);
    }

    deps.showNotification(result.message, result.workerLost ? 'warning' : 'info');
  }

  // #592 MR5: preach action. Mirrors performWorkerAction's state-apply + rerender pattern,
  // but adds a non-destructive confirmation dialog when the missionary is consumed on its
  // last charge -- the deletion has already happened inside preach() by this point, so the
  // dialog is an acknowledgment, not a gate (hideCancel: true, no undo possible).
  function performPreach(unitId: string, cityId: string): void {
    const unit = deps.session.getState().units[unitId];
    const cityName = deps.session.getState().cities[cityId]?.name ?? cityId;
    const result = preach(deps.session.getState(), unitId, cityId, deps.bus);
    if (!result.ok) return;

    deps.session.commit(result.state);

    // #787 phase 12 (#794): same existing-panel guard as unit-turn-flow.ts's
    // showDeleteUnitConfirmation -- both call sites share this panel/overlay id.
    if (result.unitConsumed && deps.uiLayer.querySelector('#unit-delete-confirmation-panel')) return;

    const message = result.converted
      ? `${cityName} has converted to your faith!`
      : `You preached in ${cityName}.`;

    if (result.unitConsumed) {
      deps.selectionController.deselectUnit();
      deps.setBlockingOverlay('unit-delete-confirmation');
      createUnitDeleteConfirmationPanel(deps.uiLayer, {
        unitName: unit ? UNIT_DEFINITIONS[unit.type].name : 'Missionary',
        title: 'Missionary Used Up',
        bodyText: `${message} That was its last charge, so the missionary is gone.`,
        confirmLabel: 'OK',
        hideCancel: true,
        tone: 'neutral',
        onConfirm: () => {
          deps.uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
          deps.setBlockingOverlay(null);
        },
        onCancel: () => {
          deps.uiLayer.querySelector('#unit-delete-confirmation-panel')?.remove();
          deps.setBlockingOverlay(null);
        },
      });
    } else {
      deps.selectionController.selectUnit(unitId);
      deps.showNotification(message, result.converted ? 'success' : 'info');
    }
  }

  function ensurePlayerWarState(targetCivId: string): void {
    const targetCiv = deps.session.getState().civilizations[targetCivId];
    if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

    const cp = deps.session.getState().currentPlayer;
    const attackerCiv = deps.currentCiv();
    const alreadyAtWar = attackerCiv.diplomacy?.atWarWith.includes(targetCivId) ?? false;
    if (alreadyAtWar) return;

    const before = deps.session.getState();
    const declared = declareMajorWar(before, cp, targetCivId, deps.bus);
    if (declared === before) return;
    // Publish before the primary notification, whose reason reads current relationships.
    deps.session.commit(declared);
    deps.bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
    const after = applyOpportunisticWarPenaltyIfCrisisStruck(deps.session.getState(), cp, targetCivId, deps.bus);
    deps.session.commit(after);
    emitMinorCivLeagueNotices(before, after, deps.bus);
  }

  function restAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || !canHeal(unit)) return;

    deps.session.commit({
      ...deps.session.getState(),
      units: { ...deps.session.getState().units, [selectedUnitId]: restUnit(unit) },
    });
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
    deps.selectionController.deselectUnit();
  }

  function executeUpgrade(unitId: string, targetType: UnitType): boolean {
    const result = applyUnitUpgradeToState(deps.session.getState(), unitId, targetType);
    if (!result.upgraded) return false;
    deps.session.commit(result.state);
    return true;
  }

  function foundCityAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || unit.type !== 'settler') return;

    const blockers = getCityFoundingBlockers(deps.session.getState(), unit.position);
    if (blockers.length > 0) {
      deps.showNotification(formatCityFoundingBlockerMessage(blockers), 'warning');
      return;
    }

    let result;
    try {
      result = foundCityInState(deps.session.getState(), selectedUnitId, deps.bus);
    } catch (error) {
      deps.showNotification(
        error instanceof Error ? error.message : 'City cannot be founded here.',
        'warning',
      );
      return;
    }
    // One publication, after the new city's visibility is recomputed.
    deps.session.batch(() => {
      deps.session.commit(result.state);

      deps.selectionController.deselectUnit();
      const foundedCity = deps.session.getState().cities[result.cityId];
      deps.showNotification(`${foundedCity.name} has been founded!`, 'success');
      SFX.foundCity();

      // Update visibility
      deps.session.commit(updateAndRefreshVisibility(deps.session.getState(), deps.session.getState().currentPlayer));
      for (const contact of syncCivilizationContactsFromVisibility(deps.session.getState(), deps.session.getState().currentPlayer)) {
        deps.bus.emit('civilization:first-contact', contact);
      }
    });
  }

  return { getUnitTurnFlow, performWorkerAction, performPreach, ensurePlayerWarState, restAction, executeUpgrade, foundCityAction };
}
