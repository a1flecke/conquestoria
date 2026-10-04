/**
 * Tap engagements that need a confirmation or hand-off (#1243), split out of
 * `map-interaction-controller.ts`: foreign-city / city-state war entry, minor-civ
 * assault and the busy-worker move warning. Bodies are moved verbatim.
 */
import type { HexCoord, ImprovementType } from '@/core/types';
import { SFX } from '@/audio/sfx';
import { hexKey } from '@/systems/hex-utils';
import { createForeignCityEntryPanel } from '@/ui/foreign-city-entry-panel';
import { createCityCapturePanel } from '@/ui/city-capture-panel';
import { beginConfirmedForeignCityEntry } from '@/input/foreign-city-entry-flow';
import { MINOR_CIV_DEFINITIONS } from '@/systems/minor-civ-definitions';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { emitMinorCivQuestTransitions } from '@/systems/quest-chain-system';
import { createWorkerTaskWarningPanel } from '@/ui/worker-task-warning-panel';
import { getImprovementDisplayName } from '@/systems/improvement-system';
import { confirmBusyWorkerMove } from '@/input/worker-movement-flow';
import type { MapInteractionControllerDeps } from './map-interaction-shared';

export function confirmWarOnCity(deps: MapInteractionControllerDeps, intent: { readonly attackerId: string; readonly cityId: string; readonly defenderId: string }): void {
  const { session, selection, selectionController, bus, uiLayer } = deps;
    const selectedId = intent.attackerId;
    const city = session.getState().cities[intent.cityId];
    const defender = session.getState().civilizations[intent.defenderId];
    createForeignCityEntryPanel(uiLayer, {
      cityName: city?.name ?? 'this city',
      defenderName: defender?.name ?? intent.defenderId,
      onConfirm: () => {
        const begun = beginConfirmedForeignCityEntry(session.getState(), selectedId, intent.cityId, bus);
        session.commit(begun.state);
        if (!begun.ok) {
          deps.showNotification(
            begun.reason === 'repelled-by-city-defense'
              ? "Your attack was repelled by the city's defenses!"
              : 'The attack could not proceed.',
            'warning',
          );
          return;
        }
        selection.setPendingIntent({ kind: 'city-capture', choice: begun.pending });
        const captureCity = session.getState().cities[intent.cityId];
        if (captureCity) {
          createCityCapturePanel(uiLayer, {
            cityName: captureCity.name,
            occupiedPopulation: begun.pending.occupiedPopulation,
            razeGold: begun.pending.razeGold,
            onOccupy: () => deps.finalizePendingCityCaptureChoice('occupy'),
            onRaze: () => deps.finalizePendingCityCaptureChoice('raze'),
          });
        }
        SFX.tap();
      },
      onCancel: () => selectionController.selectUnit(selectedId),
    });
    return;
}

export function confirmWarOnMinorCiv(deps: MapInteractionControllerDeps, intent: { readonly attackerId: string; readonly cityId: string; readonly minorCivId: string }, coord: HexCoord): void {
  const { session, selectionController, bus, uiLayer } = deps;
    const selectedId = intent.attackerId;
    const city = session.getState().cities[intent.cityId];
    const minor = session.getState().minorCivs[intent.minorCivId];
    const definition = MINOR_CIV_DEFINITIONS.find(candidate => candidate.id === minor?.definitionId);
    createForeignCityEntryPanel(uiLayer, {
      cityName: city?.name ?? 'this city-state',
      defenderName: definition?.name ?? 'the city-state',
      onConfirm: () => {
        const war = setMinorCivWarState(session.getState(), session.getState().currentPlayer, intent.minorCivId, true, bus);
        if (!war.ok) return;
        // Publishes immediately: a declared war changes how a foreign stack picks its
        // lead sprite on the canvas (unit-map-presentation's chooseLead reads
        // atWarWith), and executeMinorCivConquest below can return early with no
        // refresh of its own (#787 phase 14, #1015).
        session.commit(war.state);
        emitMinorCivQuestTransitions(bus, war.transitions, session.getState());
        deps.executeMinorCivConquest(selectedId, coord, intent.minorCivId, intent.cityId);
      },
      onCancel: () => selectionController.selectUnit(selectedId),
    });
    return;
}

export function assaultMinorCiv(deps: MapInteractionControllerDeps, intent: { readonly attackerId: string; readonly coord: HexCoord; readonly minorCivId: string; readonly cityId: string }): void {
  const { session, selectionController } = deps;
    const mc = session.getState().minorCivs[intent.minorCivId];
    if (mc && !mc.isDestroyed) {
      deps.executeMinorCivConquest(intent.attackerId, intent.coord, intent.minorCivId, intent.cityId);
    } else {
      SFX.tap();
      setTimeout(() => selectionController.selectNextUnit(), 400);
    }
    return;
}

export function confirmBusyWorkerTap(deps: MapInteractionControllerDeps, intent: { readonly unitId: string; readonly coord: HexCoord }): void {
  const { session, selectionController, bus, uiLayer } = deps;
    const selectedId = intent.unitId;
    const task = session.getState().units[selectedId]?.workerTask;
    const taskTile = task ? session.getState().map.tiles[hexKey(task.coord)] : undefined;
    const isRoadTask = task?.action === 'build_road';
    createWorkerTaskWarningPanel(uiLayer, {
      improvementName: task
        ? (isRoadTask ? 'Road' : getImprovementDisplayName(task.action as ImprovementType))
        : 'Improvement',
      turnsLeft: (isRoadTask ? taskTile?.roadTurnsLeft : taskTile?.improvementTurnsLeft) ?? 1,
      onCancel: () => selectionController.selectUnit(selectedId),
      onConfirm: () => {
        selectionController.executeAnimatedUnitMove(selectedId, () => {
          const moveResult = confirmBusyWorkerMove(session.getState(), selectedId, intent.coord, {
            actor: 'player',
            civId: session.getState().currentPlayer,
            bus,
          });
          if (moveResult.ok) session.commit(moveResult.state);
          return moveResult;
        });
        SFX.tap();
      },
    });
    return;
}
