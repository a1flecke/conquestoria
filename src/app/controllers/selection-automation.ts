/**
 * Selection automation (#1243), split out of `selection-controller.ts`.
 *
 * Auto-explore start/cancel, journey cancel, and the unit context menu. These
 * are the "delegate a unit's movement" surface; they reach selection through the
 * `SelectionCore` handle so the slice never imports the selection core module.
 *
 * No behaviour change: same commits, same panels, same copy.
 */
import { applyAutoExploreOrder } from '@/systems/auto-explore-system';
import { createContextMenu } from '@/ui/context-menu';
import type { SelectionCommonDeps, SelectionCore } from './selection-shared';

export interface SelectionAutomationSlice {
  startAutoExplore(unitId: string): void;
  cancelAutoExplore(unitId: string): void;
  cancelJourney(unitId: string): void;
  openUnitContextMenu(unitId: string): void;
}

export function createSelectionAutomationSlice(
  deps: SelectionCommonDeps,
  core: SelectionCore,
): SelectionAutomationSlice {
  function startAutoExplore(unitId: string): void {
    const unit = deps.session.getState().units[unitId];
    if (!unit || unit.owner !== deps.session.getState().currentPlayer) return;

    const withAutomation = {
      ...unit,
      automation: {
        mode: 'auto-explore' as const,
        startedTurn: deps.session.getState().turn,
        lastTargets: unit.automation?.mode === 'auto-explore' ? unit.automation.lastTargets : [],
      },
    };
    deps.session.commit({ ...deps.session.getState(), units: { ...deps.session.getState().units, [unitId]: withAutomation } });

    if (withAutomation.movementPointsLeft > 0 && !withAutomation.hasActed) {
      const explored = applyAutoExploreOrder(deps.session.getState(), unitId, { bus: deps.bus });
      if (explored?.ok) {
        deps.session.commit(explored.state);
      }
    }

    core.selectUnit(unitId);
  }

  function cancelAutoExplore(unitId: string): void {
    const unit = deps.session.getState().units[unitId];
    if (!unit?.automation) return;
    const { automation: _removed, ...withoutAutomation } = unit;
    deps.session.commit({ ...deps.session.getState(), units: { ...deps.session.getState().units, [unitId]: withoutAutomation } });
    if (deps.selection.getSelectedUnitId() === unitId) {
      core.selectUnit(unitId);
    }
  }

  function cancelJourney(unitId: string): void {
    const unit = deps.session.getState().units[unitId];
    if (!unit?.automation) return;
    deps.session.commit({
      ...deps.session.getState(),
      units: { ...deps.session.getState().units, [unitId]: { ...unit, automation: undefined } },
    });
    deps.renderLoop.setJourneyPath(null);
    if (deps.selection.getSelectedUnitId() === unitId) {
      core.selectUnit(unitId);
    }
  }

  function openUnitContextMenu(unitId: string): void {
    const panel = deps.getInfoPanel();
    if (!panel) return;

    createContextMenu(panel, deps.session.getState(), { unitId }, {
      onStartAutoExplore: id => startAutoExplore(id),
      onCancelAutoExplore: id => cancelAutoExplore(id),
    }, deps.host);
  }

  return { startAutoExplore, cancelAutoExplore, cancelJourney, openUnitContextMenu };
}
