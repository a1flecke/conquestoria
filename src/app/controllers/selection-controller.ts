/**
 * Owns unit selection: `selectUnit`, `deselectUnit`, `selectNextUnit`, and the
 * animated-move lifecycle around a selected unit (#787 phase 8c).
 *
 * #1243 split this by player use case, following the #1242 pattern. This file is
 * the selection core plus the thin composite that keeps the public
 * `SelectionController` interface:
 *   - `selection-unit-commands.ts` — the `renderSelectedUnitInfo` callback set
 *   - `selection-automation.ts`    — auto-explore / journey / context menu
 *   - `selection-visibility.ts`    — `refreshCurrentPlayerVisibility`
 *   - `selection-shared.ts`        — shared deps vocabulary + `SelectionCore` handle
 *
 * Slices reach the core through the `SelectionCore` handle the composite fills,
 * so no slice imports a peer. `getInfoPanel` exists so no controller calls
 * `document.getElementById` itself (the port-purity test bans that here).
 */
import type { HexCoord } from '@/core/types';
import type { ExecuteUnitMoveResult } from '@/systems/unit-movement-system';
import { explainMovementFailureForViewer } from '@/systems/unit-movement-explainer';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { findPath } from '@/systems/unit-pathfinding';
import { SFX } from '@/audio/sfx';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { getUnmovedUnits } from '@/systems/unit-order-state';
import { getDeniedTerritoryOwners } from '@/systems/territorial-access';
import { createSelectionAutomationSlice } from './selection-automation';
import { createSelectionVisibilitySlice } from './selection-visibility';
import { renderUnitInfoWithCommands } from './selection-unit-commands';
import type { SelectionCommonDeps, SelectionCore } from './selection-shared';

export type { SelectionControllerRenderer } from './selection-shared';
export type SelectionControllerDeps = SelectionCommonDeps;

export interface SelectionController {
  selectUnit(unitId: string, opts?: { pendingUnloadUnitName?: string; suppressSelectionSfx?: boolean }): void;
  deselectUnit(): void;
  isUnitAnimationLocked(unitId: string | null): boolean;
  animateMovedUnit(unitId: string, path: HexCoord[]): void;
  executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult;
  startAutoExplore(unitId: string): void;
  cancelAutoExplore(unitId: string): void;
  cancelJourney(unitId: string): void;
  openUnitContextMenu(unitId: string): void;
  selectNextUnit(): void;
  refreshSelectedUnitAfterCombat(): void;
  refreshCurrentPlayerVisibility(): void;
}

// #1039: how long the unit slide is given to play before focus settles on the
// next actionable unit. A plain timer, not the animation's completion callback
// (which is unreliable). Matches the post-combat `selectNextUnit` delay.
const MOVE_FOCUS_SETTLE_MS = 400;


export function createSelectionController(deps: SelectionControllerDeps): SelectionController {
  const { session, selection, renderLoop, ceremonies } = deps;

  // Filled below once the slices exist; slices only call it from event handlers,
  // never during construction.
  const core: SelectionCore = {
    selectUnit: (id, opts) => selectUnit(id, opts),
    deselectUnit: () => deselectUnit(),
    startAutoExplore: id => automation.startAutoExplore(id),
    cancelAutoExplore: id => automation.cancelAutoExplore(id),
    cancelJourney: id => automation.cancelJourney(id),
    selectNextUnit: () => selectNextUnit(),
    isUnitAnimationLocked: id => isUnitAnimationLocked(id),
    animateMovedUnit: (id, path) => animateMovedUnit(id, path),
    executeAnimatedUnitMove: (id, move) => executeAnimatedUnitMove(id, move),
    refreshSelectedUnitAfterCombat: () => refreshSelectedUnitAfterCombat(),
    openUnitContextMenu: id => automation.openUnitContextMenu(id),
    refreshCurrentPlayerVisibility: () => visibility.refreshCurrentPlayerVisibility(),
  };

  function selectUnit(
    unitId: string,
    opts?: {
      pendingUnloadUnitName?: string;
      suppressSelectionSfx?: boolean;
    },
  ): void {
    if (renderLoop.hasMovingUnit(unitId)) {
      deps.showNotification('Unit is moving.', 'info');
      return;
    }
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;
    selection.setSelectedUnitId(unitId);
    renderLoop.setSelectedUnitId(unitId);

    const highlightResult = buildSelectedUnitHighlights(session.getState(), unitId);
    selection.setWaterRecovery(highlightResult.waterRecovery);
    if (session.getState().units[unitId]?.committedToRouteId) {
      // Committed caravans cannot move or attack — keep highlights empty
      selection.setRanges([], []);
      deps.clearUnloadState();
    } else {
      selection.setRanges(highlightResult.movementRange, highlightResult.attackTargets.map(target => target.coord));
    }
    renderLoop.setHighlights(highlightResult.highlights);

    // Update journey path overlay
    if (unit.automation?.mode === 'journey') {
      const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
      const completedTechs = session.getState().civilizations[unit.owner]?.techState.completed ?? [];
      const path = findPath(unit.position, unit.automation.destination, session.getState().map, domain, { unit, completedTechs, deniedOwnerIds: getDeniedTerritoryOwners(session.getState(), unit) });
      renderLoop.setJourneyPath(path);
    } else {
      renderLoop.setJourneyPath(null);
    }

    // Show unit info panel
    const panel = deps.getInfoPanel();
    if (panel) {
      renderUnitInfoWithCommands(deps, core, {
        panel,
        unitId,
        pendingUnloadUnitName: opts?.pendingUnloadUnitName,
        highlightResult,
        pendingIntent: selection.getPendingIntent(),
      });
    }

    if (!opts?.suppressSelectionSfx) SFX.select();
  }

  function deselectUnit(): void {
    // Clears the selection, both ranges, and any pending air mission, journey, or
    // unload. A pending city-capture choice deliberately survives — see the
    // `SelectionStore.clear()` contract.
    selection.clear();
    renderLoop.setSelectedUnitId(null);
    renderLoop.clearHighlights();
    renderLoop.setJourneyPath(null);
    const panel = deps.getInfoPanel();
    if (panel) {
      panel.style.display = 'none';
      panel.replaceChildren();
    }
  }

  function isUnitAnimationLocked(unitId: string | null): boolean {
    return Boolean(unitId && renderLoop.hasMovingUnit(unitId));
  }

  function animateMovedUnit(unitId: string, path: HexCoord[]): void {
    const movedUnit = session.getState().units[unitId];
    if (!movedUnit || path.length < 2) return;
    selection.setRanges([], []);
    deps.clearUnloadState();
    renderLoop.clearHighlights();
    renderLoop.animateUnitMove({ ...movedUnit, position: path[0]! }, path, () => {
      ceremonies.endAction();
    });
  }

  // #1039: after a player move settles, focus jumps to the next actionable own
  // unit if the mover is spent, otherwise the mover's panel is refreshed. This
  // is scheduled on a plain timer by executeAnimatedUnitMove — never off the
  // movement-animation completion callback, which can be dropped for a move into
  // an unexplored tile, a reduced-motion / degenerate-path move, or a frame the
  // render loop skips, stranding focus on the 0-move unit.
  function settleFocusAfterMove(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;
    if ((unit.movementPointsLeft ?? 0) <= 0) {
      selectNextUnit();
    } else if (selection.getSelectedUnitId() === unitId) {
      selectUnit(unitId);
    }
  }

  function executeAnimatedUnitMove(unitId: string, move: () => ExecuteUnitMoveResult): ExecuteUnitMoveResult {
    const movingUnit = session.getState().units[unitId];
    ceremonies.beginDeferredAction();
    try {
      const moveResult = move();
      if (!moveResult.ok) {
        ceremonies.endAction();
        // #1002: never echo the omniscient resolver's message — explain the refusal only from
        // what the unit owner has earned (same rule as the tap preview).
        deps.showNotification(explainMovementFailureForViewer(session.getState(), unitId, moveResult), 'warning');
        SFX.error();
        return moveResult;
      }
      if (moveResult.stopReason === 'zone-of-control') {
        deps.showNotification('Stopped — enemy nearby', 'info');
      }
      // Clear journey automation when the player manually moves a unit.
      if (movingUnit?.automation?.mode === 'journey') {
        const movedUnit = session.getState().units[unitId];
        if (movedUnit) {
          session.commit({
            ...session.getState(),
            units: { ...session.getState().units, [unitId]: { ...movedUnit, automation: undefined } },
          });
        }
        renderLoop.setJourneyPath(null);
      }
      animateMovedUnit(unitId, moveResult.path);
      // Deferred so the slide plays first, but on a timer rather than the
      // animation's completion callback — see settleFocusAfterMove (#1039).
      setTimeout(() => settleFocusAfterMove(unitId), MOVE_FOCUS_SETTLE_MS);
      return moveResult;
    } catch (error) {
      ceremonies.endAction();
      throw error;
    }
  }

  function selectNextUnit(): void {
    const unmoved = getUnmovedUnits(session.getState().units, session.getState().currentPlayer);
    if (unmoved.length === 0) {
      // All units have moved — silently deselect
      deselectUnit();
      return;
    }
    // Skip current unit if it's in the list
    const filtered = unmoved.filter(u => u.id !== selection.getSelectedUnitId());
    const next = filtered.length > 0 ? filtered[0] : unmoved[0];
    selectUnit(next.id);
    renderLoop.camera.centerOn(next.position);
  }

  function refreshSelectedUnitAfterCombat(): void {
    const selectedUnitId = selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const selectedUnit = session.getState().units[selectedUnitId];
    if (!selectedUnit || selectedUnit.owner !== session.getState().currentPlayer) {
      deselectUnit();
      return;
    }
    selectUnit(selectedUnitId, { suppressSelectionSfx: true });
  }

  const automation = createSelectionAutomationSlice(deps, core);
  const visibility = createSelectionVisibilitySlice(deps);

  return {
    selectUnit,
    deselectUnit,
    isUnitAnimationLocked,
    animateMovedUnit,
    executeAnimatedUnitMove,
    startAutoExplore: automation.startAutoExplore,
    cancelAutoExplore: automation.cancelAutoExplore,
    cancelJourney: automation.cancelJourney,
    openUnitContextMenu: automation.openUnitContextMenu,
    selectNextUnit,
    refreshSelectedUnitAfterCombat,
    refreshCurrentPlayerVisibility: visibility.refreshCurrentPlayerVisibility,
  };
}
