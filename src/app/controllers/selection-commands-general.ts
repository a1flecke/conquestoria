/**
 * General-ability and panel-chrome commands: close, tutorials, hall of fame, rally, seize the moment, last stand, strategic launch (#1243), split out of `selection-unit-commands.ts`.
 * Callbacks are moved verbatim; each reaches selection through the `SelectionCore` handle.
 */
import { mapHexesInRange } from '@/systems/hex-utils';
import { getRallyPreview, issueRally, getSeizeTheMomentEligibleUnits, issueSeizeTheMoment } from '@/systems/great-general-abilities';
import { createRallyPanel, createSeizeThePanelMoment } from '@/ui/general-command-panel';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { resolveGeneralDefinition } from '@/systems/great-general-definitions';
import { getEffectiveCommandStats } from '@/systems/great-general-system';
import type { SelectionCommonDeps, SelectionCore, SelectedUnitCommands, SelectionCommandArgs } from './selection-shared';

export function createGeneralCommands(
  deps: SelectionCommonDeps,
  core: SelectionCore,
  args: SelectionCommandArgs,
): Pick<SelectedUnitCommands, 'onClose' | 'onReopenSupplyTutorial' | 'onReopenGeneralTutorial' | 'onOpenHallOfFame' | 'onOpenRally' | 'onPrepareStrategicLaunch' | 'onOpenSeize' | 'onStartLastStandTargeting'> {
  const { session, selection } = deps;

  return {
    onClose: () => core.deselectUnit(),
    onReopenSupplyTutorial: () => {
      deps.advisorSystem.resetMessage('supply_intro');
      deps.advisorSystem.check(session.getState());
    },
    onReopenGeneralTutorial: () => {
      deps.advisorSystem.resetMessage('general_command_intro');
      deps.advisorSystem.check(session.getState());
    },
    onOpenHallOfFame: deps.openHallOfFame,
    onOpenRally: (generalUnitId: string) => {
      const preview = getRallyPreview(session.getState(), generalUnitId);
      createRallyPanel(
        deps.uiLayer,
        preview,
        () => {
          session.commit(issueRally(session.getState(), generalUnitId));
          core.selectUnit(generalUnitId); // refresh the panel so charges/cooldown reflect immediately
        },
        () => {},
      );
    },
    onPrepareStrategicLaunch: (subUnitId: string) => {
      const unit = session.getState().units[subUnitId];
      if (!unit) return;
      createStrategicLaunchFlow(deps.uiLayer, session.getState(), unit.owner, {
        onSetPreview: preview => deps.renderLoop.setStrategicLaunchPreview(preview),
        onConfirmLaunch: targetCityId => {
          const targetCivId = session.getState().cities[targetCityId]?.owner;
          const result = executeStrategicLaunch(session.getState(), unit.owner, targetCityId);
          if (result.ok && targetCivId) {
            session.commit(result.state);
            deps.showNotification('Strategic strike launched.', 'warning');
            deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, actorCivId: unit.owner, goldLost: result.goldLost });
          }
        },
        onClose: () => {},
      });
    },
    onOpenSeize: (generalUnitId: string) => {
      const { eligible } = getSeizeTheMomentEligibleUnits(session.getState(), generalUnitId);
      createSeizeThePanelMoment(
        deps.uiLayer,
        generalUnitId,
        eligible,
        (selectedUnitIds) => {
          session.commit(issueSeizeTheMoment(session.getState(), generalUnitId, selectedUnitIds));
          core.selectUnit(generalUnitId);
        },
        () => {},
      );
    },
    onStartLastStandTargeting: (generalUnitId: string) => {
      const state = session.getState();
      const general = state.units[generalUnitId];
      const definition = general ? resolveGeneralDefinition(state, general.generalDefinitionId) : undefined;
      if (!general || !definition) return;
      const { commandRange } = getEffectiveCommandStats(general, definition);
      const range = mapHexesInRange(state.map, general.position, commandRange);
      selection.setPendingIntent({ kind: 'last-stand-target', unitId: generalUnitId, range });
      deps.showNotification('Choose a hex to hold, within your General\'s command range.', 'info');
    },
  };
}
