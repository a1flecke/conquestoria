/**
 * Unit action commands: network intent, propagandist, found city, worker, preach, rest, skip, delete, fortify, pillage, automation, stack, upgrade, outpost, route, improvement replacement (#1243), split out of `selection-unit-commands.ts`.
 * Callbacks are moved verbatim; each reaches selection through the `SelectionCore` handle.
 */
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { TRAINABLE_UNITS } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { isMajorCivOwner } from '@/core/owner-kind';
import { createWorkerReplacementConfirmPanel } from '@/ui/worker-task-warning-panel';
import { handleFriendlyUnitStackTap } from '@/input/unit-stack-selection';
import { usePropagandistAction } from '@/systems/propagandist-system';
import { fortifyUnitInState, unfortifyUnitInState } from '@/systems/unit-lifecycle-system';
import { canPillageTile, getPillageGoldReward, applyPillageToState } from '@/systems/pillage-system';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { evaluateUnitUpgrade } from '@/systems/unit-upgrade-system';
import { canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';
import { autoSave } from '@/storage/save-manager';
import { applyWorkerAction } from '@/systems/worker-action-system';
import { formatImprovementYieldLabel } from '@/systems/improvement-system';
import type { SelectionCommonDeps, SelectionCore, SelectedUnitCommands, SelectionCommandArgs } from './selection-shared';

export function createUnitActionCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  args: SelectionCommandArgs,
): Pick<SelectedUnitCommands, 'onOpenNetworkIntent' | 'onUsePropagandistAction' | 'onFoundCity' | 'onWorkerAction' | 'onPreach' | 'onRest' | 'onSkipTurn' | 'onDeleteUnit' | 'onFortify' | 'onPillage' | 'onStartAutoExplore' | 'onCancelAutoExplore' | 'onCancelJourney' | 'onOpenStack' | 'onUpgradeUnit' | 'onEstablishOutpost' | 'onEstablishRoute' | 'onReplaceImprovement'> {
  const { session, selection, renderLoop } = deps;
  const { unitId } = args;

  return {
    onOpenNetworkIntent: uid => deps.openNetworkIntentPanel(uid),
    onUsePropagandistAction: (uid, action, cityId) => {
      const result = usePropagandistAction(session.getState(), uid, action, cityId);
      if (!result.ok) {
        deps.showNotification('That civic action is no longer available.', 'warning');
        return;
      }
      session.commit(result.state);
      deps.showNotification(result.message, action === 'rally' ? 'success' : 'warning');
      core.selectUnit(uid);
    },
    onFoundCity: () => deps.foundCityAction(),
    onWorkerAction: action => deps.performWorkerAction(action),
    onPreach: (unitId, cityId) => deps.performPreach(unitId, cityId),
    onRest: () => deps.restAction(),
    onSkipTurn: uid => deps.getUnitTurnFlow().skipUnitAction(uid),
    onDeleteUnit: uid => deps.getUnitTurnFlow().showDeleteUnitConfirmation(uid),
    onFortify: uid => {
      const unit = session.getState().units[uid];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;
      if (unit.isFortified) {
        session.commit(unfortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
        deps.showNotification('Unit unfortified.', 'info');
      } else {
        session.commit(fortifyUnitInState(session.getState(), session.getState().currentPlayer, uid));
        deps.showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
      }
      core.selectUnit(uid);
    },
    onPillage: uid => {
      const unit = session.getState().units[uid];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;
      const tile = session.getState().map.tiles[hexKey(unit.position)];
      if (!tile || !canPillageTile(tile, unit.owner)) return;

      const hasFinishedImprovement = tile.improvement !== 'none' && tile.improvementTurnsLeft === 0;
      const goldPreview = hasFinishedImprovement ? getPillageGoldReward(tile.improvement) : 0;
      const targetLabel = hasFinishedImprovement ? getImprovementDisplayName(tile.improvement) : 'the road';
      const preview = goldPreview > 0
        ? `Pillage ${targetLabel}?\n\n+${goldPreview} gold, unit heals +25 HP.`
        : `Pillage ${targetLabel}?\n\nUnit heals +25 HP.`;
      if (!window.confirm(preview)) return;

      if (tile.owner && isMajorCivOwner(tile.owner)) {
        deps.ensurePlayerWarState(tile.owner);
      }

      const result = applyPillageToState(session.getState(), uid);
      if (!result.ok) return;
      session.commit(result.state);
      deps.showNotification(
        result.goldAwarded! > 0 ? `Pillaged ${targetLabel} for ${result.goldAwarded} gold.` : `Pillaged ${targetLabel}.`,
        'success',
      );
      core.selectUnit(uid);
    },
    onStartAutoExplore: uid => core.startAutoExplore(uid),
    onCancelAutoExplore: () => core.cancelAutoExplore(unitId),
    onCancelJourney: () => core.cancelJourney(unitId),
    onOpenStack: (coord) => {
      handleFriendlyUnitStackTap(session.getState(), coord, selection.getSelectedUnitId(), {
        onSelectUnit: core.selectUnit,
        onOpenStackPicker: deps.openUnitStackPicker,
      });
    },
    onUpgradeUnit: (uid) => {
      const unit = session.getState().units[uid];
      if (!unit || unit.owner !== session.getState().currentPlayer) return;
      const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
      if (!targetType) return;
      const upgrade = evaluateUnitUpgrade(session.getState(), uid, targetType);
      if (!upgrade.canUpgrade || !upgrade.targetType) return;
      if (deps.executeUpgrade(uid, upgrade.targetType)) {
        core.selectUnit(uid);
        deps.showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
      }
    },
    onEstablishOutpost: (unitId) => {
      if (!canEstablishOutpost(session.getState(), unitId)) return;
      session.commit(performEstablishOutpost(session.getState(), unitId));
      autoSave(session.getState()).catch(() => {});
      selection.setSelectedUnitId(null);
      renderLoop.setSelectedUnitId(null);
      deps.showNotification('Expedition planted a flag! Outpost completes in 2 turns.', 'success');
    },
    onEstablishRoute: deps.handleEstablishRoute,
    onReplaceImprovement: (action) => {
      const selectedUnitId = selection.getSelectedUnitId();
      if (!selectedUnitId) return;
      const unit = session.getState().units[selectedUnitId];
      if (!unit) return;
      const tileKey = hexKey(unit.position);
      const currentTile = session.getState().map.tiles[tileKey];
      if (!currentTile || currentTile.improvement === 'none') return;
      const existingName = getImprovementDisplayName(currentTile.improvement);
      const newName = getImprovementDisplayName(action);
      const existingYield = formatImprovementYieldLabel(currentTile.improvement) || undefined;
      const newYield = formatImprovementYieldLabel(action) || undefined;
      const uid = selectedUnitId;
      createWorkerReplacementConfirmPanel(deps.uiLayer, {
        existingName,
        newName,
        existingYield,
        newYield,
        onCancel: () => core.selectUnit(uid),
        onConfirm: () => {
          const result = applyWorkerAction(session.getState(), uid, action, { allowReplacement: true });
          if (!result.ok) return;
          session.commit(result.state);
          for (const event of result.events) {
            if (event.type === 'improvement:started') {
              deps.bus.emit('improvement:started', event.payload);
            } else if (event.type === 'road:started') {
              deps.bus.emit('road:started', event.payload);
            } else {
              deps.bus.emit('unit:destroyed', event.payload);
            }
          }
          if (result.workerConsumed || result.workerLost || !session.getState().units[uid]) {
            core.deselectUnit();
          } else {
            core.selectUnit(uid);
          }
          deps.showNotification(result.message, result.workerLost ? 'warning' : 'info');
        },
      });
    },
  };
}
