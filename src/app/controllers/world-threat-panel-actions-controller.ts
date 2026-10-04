/**
 * World-threat / unit-command panel openers (#1242), split out of the
 * monolithic `panel-actions-controller.ts`. Covers Pirate waters, the pirate
 * headquarters assault, and the Autonomy network intent/network panels — the
 * "act on the wider world" surfaces. (Espionage is its own peer group,
 * `espionage-panel-actions-controller.ts`.)
 *
 * No behaviour change: same panels, same publication (`session.commit`), same
 * copy. `openPirateWaters`/`openPirateHeadquartersAssault` and
 * `openNetworkIntentPanel`/`openNetworkPanel` call each other within this
 * group; there are no peer-controller cross-calls, so the `cross` handle is
 * accepted only for factory symmetry with the other groups.
 */
import { createPirateWatersPanel } from '@/ui/pirate-waters-panel';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';
import { hirePirateFlotilla, payPirateTribute } from '@/systems/pirate-actions';
import { confirmPirateHeadquartersAssault, preparePirateHeadquartersAssault } from '@/input/pirate-headquarters-assault';
import { createPirateHeadquartersAssaultPanel } from '@/ui/pirate-headquarters-assault-panel';
import { assignNetworkPlan, cancelNetworkPlan, holdNetworkPlan, isAutonomyActivated, retargetNetworkPlan } from '@/systems/network-plan-system';
import { beginAutonomySurge, requestAutonomyPosture } from '@/systems/autonomy-postures';
import { createNetworkIntentPanel } from '@/ui/network-intent-panel';
import { createNetworkPanel, getNetworkPanelModel } from '@/ui/network-panel';
import { SFX } from '@/audio/sfx';
import type { PanelActionsCommonDeps, PanelActionsCrossCalls } from './panel-actions-shared';

export interface WorldThreatPanelActionsController {
  openPirateWaters(focus?: { factionId?: string; historyId?: string }): void;
  openPirateHeadquartersAssault(factionId: string, unitId: string): void;
  openNetworkIntentPanel(sourceUnitId: string): void;
  openNetworkPanel(): void;
}

export function createWorldThreatPanelActionsController(
  deps: PanelActionsCommonDeps,
  cross: PanelActionsCrossCalls,
): WorldThreatPanelActionsController {
  function openPirateWaters(focus?: { factionId?: string; historyId?: string }): void {
    if (focus?.factionId) {
      deps.selection.setPirateSelection(focus.factionId, null);
    } else if (focus?.historyId) {
      deps.selection.setPirateSelection(null, focus.historyId);
    }

    const renderPanel = (): void => {
      const base = getPirateWatersPresentation(deps.session.getState(), deps.session.getState().currentPlayer);
      if (!base.available) return;
      const { factionId: selectedPirateFactionId, historyId: selectedPirateHistoryId } = deps.selection.getPirateSelection();
      const factionId = selectedPirateFactionId && base.factions.some(faction => faction.factionId === selectedPirateFactionId)
        ? selectedPirateFactionId
        : base.factions[0]?.factionId;
      let historyId = selectedPirateHistoryId && base.history.some(entry => entry.id === selectedPirateHistoryId)
        ? selectedPirateHistoryId
        : undefined;
      if (!historyId && selectedPirateFactionId && !base.factions.some(faction => faction.factionId === selectedPirateFactionId)) {
        historyId = [...base.history].reverse().find(entry => entry.factionId === selectedPirateFactionId)?.id;
        deps.selection.setPirateSelection(selectedPirateFactionId, historyId ?? null);
      }
      if (!historyId) deps.selection.setPirateSelection(factionId ?? null, deps.selection.getPirateSelection().historyId);
      deps.renderLoop.setSelectedPirateFactionId(historyId ? null : (factionId ?? null));
      if (historyId || !factionId) deps.audio.stopPirateAmbience('focus-changed');
      else void deps.audio.startPirateHeadquartersAmbience(factionId);
      const presentation = {
        ...base,
        ...(factionId && !historyId ? { selectedFactionId: factionId } : {}),
        ...(historyId ? { selectedHistoryId: historyId } : {}),
      };
      createPirateWatersPanel(deps.uiLayer, presentation, {
        onClose: () => {
          deps.getElementById('pirate-waters-panel')?.remove();
          deps.renderLoop.setSelectedPirateFactionId(null);
          deps.audio.stopPirateAmbience('panel-closed');
        },
        onSelectFaction: nextFactionId => {
          deps.selection.setPirateSelection(nextFactionId, null);
          renderPanel();
        },
        onSelectHistory: nextHistoryId => {
          deps.selection.setPirateSelection(null, nextHistoryId);
          renderPanel();
        },
        onFocus: deps.focusPirateTarget,
        onPayTribute: faction => {
          const result = payPirateTribute(deps.session.getState(), faction, deps.session.getState().currentPlayer);
          deps.applyPirateActionResult(result, 'Pirate tribute paid.');
          renderPanel();
          return result;
        },
        onHireFlotilla: (faction, targetId) => {
          const result = hirePirateFlotilla(deps.session.getState(), faction, deps.session.getState().currentPlayer, targetId);
          deps.applyPirateActionResult(result, 'Pirate flotilla hired.');
          renderPanel();
          return result;
        },
        onOpenAssault: faction => {
          const selectedUnitId = deps.selection.getSelectedUnitId();
          if (selectedUnitId) {
            const pending = preparePirateHeadquartersAssault(deps.session.getState(), faction, selectedUnitId);
            if (pending.preview.available) {
              openPirateHeadquartersAssault(faction, selectedUnitId);
              return;
            }
          }
          const target = base.factions.find(entry => entry.factionId === faction)?.focusTarget;
          if (target) deps.focusPirateTarget(target);
          deps.showNotification('Select an adjacent available naval combat unit to assault this enclave.', 'info');
        },
      });
    };

    renderPanel();
  }

  function openPirateHeadquartersAssault(factionId: string, unitId: string): void {
    const pending = preparePirateHeadquartersAssault(deps.session.getState(), factionId, unitId);
    if (!pending.preview.available) {
      deps.showNotification(pending.preview.reason ?? 'This enclave cannot be assaulted now.', 'warning');
      return;
    }
    const panel = createPirateHeadquartersAssaultPanel(deps.uiLayer, pending, {
      onCancel: () => panel.remove(),
      onConfirm: () => {
        const result = confirmPirateHeadquartersAssault(deps.session.getState(), pending);
        if (!result.success) {
          panel.remove();
          deps.showNotification(result.reason ?? 'The assault is no longer available.', 'warning');
          if (deps.session.getState().units[unitId]) deps.selectionController.selectUnit(unitId);
          return;
        }
        deps.renderLoop.applyPirateHeadquartersAssaultVisual(factionId, unitId, {
          destroyed: Boolean(result.destroyed),
          attackerSurvived: Boolean(result.state.units[unitId]),
        });
        if (result.destroyed) {
          deps.bus.emit('pirate:headquarters-destroyed', {
            factionId,
            viewerIds: [deps.session.getState().currentPlayer],
          });
        }
        deps.session.commit(result.state);
        panel.remove();
        SFX.combat();
        const bountyAwarded = result.events.find(event => event.type === 'faction-destroyed')?.bountyAwarded ?? 0;
        deps.showNotification(
          result.destroyed
            ? `Pirate enclave destroyed. Bounty awarded: ${bountyAwarded} gold.`
            : `Pirate enclave damaged for ${result.damageToHeadquarters ?? 0} integrity.`,
          result.destroyed ? 'success' : 'info',
        );
        if (deps.session.getState().units[unitId]) deps.selectionController.selectUnit(unitId);
        else deps.selectionController.deselectUnit();
        openPirateWaters({ factionId });
      },
    });
  }

  function openNetworkIntentPanel(sourceUnitId: string): void {
    const source = deps.session.getState().units[sourceUnitId];
    const ownerCivId = deps.session.getState().currentPlayer;
    if (!source || source.owner !== ownerCivId || !isAutonomyActivated(deps.session.getState(), ownerCivId)) {
      deps.showNotification('This unit cannot coordinate the network right now.', 'warning');
      return;
    }
    if (source.type === 'drone_controller') {
      // Formation targets are generated and previewed by the same full Network
      // panel used for city plans, so the controller never receives a UI-only
      // legality shortcut.
      openNetworkPanel();
      return;
    }
    if (source.type !== 'cyber_unit') {
      deps.showNotification('Only a Cyber Unit or Drone Controller can coordinate the network.', 'warning');
      return;
    }

    let panel: HTMLElement | undefined;
    const close = () => panel?.remove();
    panel = createNetworkIntentPanel(deps.session.getState(), ownerCivId, sourceUnitId, {
      onAssign: (definitionId, cityId) => {
        const current = Object.values(deps.session.getState().autonomyByCiv?.[ownerCivId]?.plans ?? {})
          .find(plan => plan.sourceUnitId === sourceUnitId);
        const stateForAssignment = current && current.definitionId !== definitionId
          ? holdNetworkPlan(deps.session.getState(), ownerCivId, sourceUnitId).state
          : deps.session.getState();
        const result = current && current.definitionId === definitionId
          ? retargetNetworkPlan(deps.session.getState(), ownerCivId, current.id, { kind: 'city', cityId })
          : assignNetworkPlan(stateForAssignment, {
            ownerCivId,
            sourceUnitId,
            definitionId,
            target: { kind: 'city', cityId },
          });
        if (!result.validation.ok) {
          deps.showNotification('That network intent is no longer available. Choose another target.', 'warning');
          close();
          openNetworkIntentPanel(sourceUnitId);
          return;
        }
        deps.session.commit(result.state);
        close();
        deps.selectionController.selectUnit(sourceUnitId);
        const cityName = deps.session.getState().cities[cityId]?.name ?? 'the city';
        deps.showNotification(`${definitionId === 'harden' ? 'Harden' : 'Exploit'} assigned to ${cityName}.`, 'success');
      },
      onHold: () => {
        const result = holdNetworkPlan(deps.session.getState(), ownerCivId, sourceUnitId);
        deps.session.commit(result.state);
        close();
        deps.selectionController.selectUnit(sourceUnitId);
        deps.showNotification('Cyber Unit is holding.', 'info');
      },
      onClose: close,
    });
    deps.uiLayer.appendChild(panel);
  }

  function openNetworkPanel(): void {
    const civId = deps.session.getState().currentPlayer;
    if (!isAutonomyActivated(deps.session.getState(), civId)) return;
    let panel: HTMLElement | undefined;
    const rerender = () => {
      panel?.remove();
      panel = createNetworkPanel(getNetworkPanelModel(deps.session.getState(), civId), {
        onAssign: request => {
          const result = assignNetworkPlan(deps.session.getState(), request);
          if (!result.validation.ok) {
            deps.showNotification('That plan is no longer available.', 'warning');
            rerender();
            return;
          }
          deps.session.commit(result.state);
          deps.showNotification('Network plan assigned.', 'success');
          rerender();
        },
        onCancel: planId => {
          deps.session.commit(cancelNetworkPlan(deps.session.getState(), civId, planId).state);
          rerender();
        },
        onSurge: planId => {
          const result = beginAutonomySurge(deps.session.getState(), civId, planId);
          if (!result.validation.ok) deps.showNotification('Surge is unavailable while the network recovers or cools down.', 'warning');
          else {
            deps.session.commit(result.state);
            deps.bus.emit('network:audio-cue', { cue: 'surge', viewerIds: [civId] });
            deps.showNotification('Network Surge confirmed.', 'success');
          }
          rerender();
        },
        onPosture: posture => {
          deps.session.commit(requestAutonomyPosture(deps.session.getState(), civId, posture));
          rerender();
        },
        onClose: () => panel?.remove(),
      });
      deps.uiLayer.appendChild(panel);
    };
    rerender();
  }

  void cross; // symmetry with the other group factories (no peer cross-calls)

  return {
    openPirateWaters,
    openPirateHeadquartersAssault,
    openNetworkIntentPanel,
    openNetworkPanel,
  };
}
