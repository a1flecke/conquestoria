/**
 * Long-press inspection (#1243), split out of `map-interaction-controller.ts`:
 * `handleHexLongPress` and the territory-inspection-panel lifecycle (with its
 * natural-wonder ambient). Normalizes wrapped coordinates at its own input boundary.
 */
import type { HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { wrapHexCoord } from '@/systems/hex-utils';
import { resolveNaturalWonderAudioFocus } from '@/input/natural-wonder-audio-focus';
import { createTerritoryInspectionPanel } from '@/ui/territory-inspection-panel';
import { getVisibility } from '@/systems/fog-of-war';
import type { MapInteractionControllerDeps } from './map-interaction-shared';

export function createMapLongPress(deps: MapInteractionControllerDeps): { handleHexLongPress(rawCoord: HexCoord): void } {
  const { session, selectionController, audio, uiLayer } = deps;

  function openTerritoryInspectionPanel(coord: HexCoord): void {
    deps.getElementById('territory-inspection-panel')?.remove();
    const audioFocus = resolveNaturalWonderAudioFocus(session.getState(), session.getState().currentPlayer, coord);
    if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
    const panel = createTerritoryInspectionPanel(session.getState(), coord, session.getState().currentPlayer, () => {
      audio.stopNaturalWonderAmbient('panel-closed');
      deps.getElementById('territory-inspection-panel')?.remove();
    });
    uiLayer.appendChild(panel);
  }

  function closeTerritoryInspectionPanel(): void {
    audio.stopNaturalWonderAmbient('panel-closed');
    deps.getElementById('territory-inspection-panel')?.remove();
  }

  function handleHexLongPress(rawCoord: HexCoord): void {
    const coord = session.getState().map.wrapsHorizontally
      ? wrapHexCoord(rawCoord, session.getState().map.width)
      : rawCoord;
    const tile = session.getState().map.tiles[hexKey(coord)];
    if (!tile) return;

    const vis = deps.currentCiv()?.visibility;
    if (!vis) return;

    const visibility = getVisibility(vis, coord);

    if (visibility === 'unexplored') {
      closeTerritoryInspectionPanel();
      deps.showNotification('Unexplored territory');
      return;
    }

    if (visibility === 'fog') {
      openTerritoryInspectionPanel(coord);
      return;
    }

    const unitAtHex = Object.values(session.getState().units).find(unit =>
      unit.owner === session.getState().currentPlayer
        && unit.position.q === coord.q
        && unit.position.r === coord.r,
    );
    if (unitAtHex) {
      closeTerritoryInspectionPanel();
      selectionController.selectUnit(unitAtHex.id);
      selectionController.openUnitContextMenu(unitAtHex.id);
      return;
    }

    openTerritoryInspectionPanel(coord);
  }

  return { handleHexLongPress };
}
