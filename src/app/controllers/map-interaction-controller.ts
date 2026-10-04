/**
 * Owns the two map-input entry points: `handleHexTap` (the switch-based
 * executor over `resolveMapTapIntent`, #787 phase 8b) and `handleHexLongPress`
 * (#787 phase 8d).
 *
 * #1243 split this by player use case, following the #1242 pattern. This file
 * keeps the dispatcher and the small cases; the larger case bodies live in
 * `map-pending-intent.ts`, `map-previews.ts`, `map-engagements.ts` and
 * `map-long-press.ts` (shared vocabulary in `map-interaction-shared.ts`).
 * Precedence is owned entirely by `resolveMapTapIntent` (#787 phase 8a);
 * target legality stays in the canonical systems -- no slice re-derives it.
 *
 * `getElementById` substitutes for the distinct panel ids this code used to look
 * up via `document.getElementById` -- the port-purity test bans that call in
 * `src/app/controllers/*`.
 */
import type { HexCoord } from '@/core/types';
import { SFX } from '@/audio/sfx';
import { hexKey, wrapHexCoord } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { resolveMapTapIntent } from '@/input/map-tap-intent';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { resolveNaturalWonderAudioFocus } from '@/input/natural-wonder-audio-focus';
import { resolvePendingIntent } from './map-pending-intent';
import { showEnemyUnitInfo, showCombatPreview, showAssaultPreview, showCampAssaultPreview } from './map-previews';
import { confirmWarOnCity, confirmWarOnMinorCiv, assaultMinorCiv, confirmBusyWorkerTap } from './map-engagements';
import { createMapLongPress } from './map-long-press';
import type { MapInteractionControllerDeps } from './map-interaction-shared';

export type { MapInteractionRenderer, MapInteractionAudio, MapInteractionControllerDeps } from './map-interaction-shared';

export interface MapInteractionController {
  handleHexTap(rawCoord: HexCoord): void;
  handleHexLongPress(rawCoord: HexCoord): void;
}

export function createMapInteractionController(deps: MapInteractionControllerDeps): MapInteractionController {
  const { session, selection, selectionController, renderLoop, audio, bus } = deps;
  const longPress = createMapLongPress(deps);

  function handleHexTap(rawCoord: HexCoord): void {
    const coord = session.getState().map.wrapsHorizontally
      ? wrapHexCoord(rawCoord, session.getState().map.width)
      : rawCoord;
    const key = hexKey(coord);
    const snapshot = selection.snapshot();
    const isAnimationLocked = selectionController.isUnitAnimationLocked(snapshot.selectedUnitId);
    const intent = resolveMapTapIntent(session.getState(), snapshot, coord, isAnimationLocked);

    switch (intent.kind) {
      case 'ignore': {
        return;
      }

      case 'resolve-pending': {
        resolvePendingIntent(deps, intent.pending, coord);
        return;
      }

      case 'mistap': {
        // Mis-tap: block the tap; first occurrence shows an error notification.
        // #544 MR4: 'last-stand-target' is a second real source of 'mistap'
        // (range-checked, same as 'unload') -- the message must distinguish
        // them or a Last Stand mistap would misleadingly tell the player to
        // "disembark."
        if (selection.shouldWarnOnMistap()) {
          const message = intent.pending.kind === 'last-stand-target'
            ? 'Tap a highlighted hex within command range to hold, or Cancel in the panel.'
            : 'Tap a highlighted hex to disembark, or Cancel in the panel.';
          deps.showNotification(message, 'warning');
          SFX.error();
        }
        return;
      }

      case 'open-pirate-faction': {
        deps.openPirateWaters({ factionId: intent.factionId });
        return;
      }

      case 'open-pirate-region': {
        renderLoop.camera.centerOn(intent.center);
        deps.openPirateWaters({ factionId: intent.factionId });
        return;
      }

      case 'animation-locked': {
        deps.showNotification('Unit is moving.', 'info');
        return;
      }

      case 'open-stack-picker': {
        deps.openUnitStackPicker(intent.coord, [...intent.unitIds]);
        return;
      }

      case 'select-unit': {
        selectionController.selectUnit(intent.unitId);
        return;
      }

      case 'blocked-caravan-committed': {
        deps.showNotification('Caravan is committed to a trade route and cannot move.', 'warning');
        selectionController.selectUnit(intent.unitId);
        return;
      }

      case 'blocked-naval-gate': {
        deps.showNotification(intent.reason, 'warning');
        selectionController.selectUnit(intent.unitId);
        return;
      }

      case 'blocked-movement': {
        // Re-invokes the same helper resolveMapTapIntent used internally to decide
        // this intent -- it recomputes getMovementBlockerReason from the same
        // inputs (a pure, cheap call) and dispatches the notification/SFX/reselect
        // side effects, which resolveMapTapIntent deliberately doesn't do itself.
        handleSelectedUnitMovementBlocker(
          session.getState(),
          intent.unitId,
          coord,
          selection.getWaterRecovery(),
          {
            showNotification: deps.showNotification,
            reselectUnit: unitId => selectionController.selectUnit(unitId, { suppressSelectionSfx: true }),
            playError: SFX.error,
          },
        );
        return;
      }

      case 'enemy-unit-info': {
        showEnemyUnitInfo(deps, intent, key);
        return;
      }

      case 'combat-preview': {
        showCombatPreview(deps, intent, key, coord);
        return; // Wait for button press
      }

      case 'assault-preview': {
        showAssaultPreview(deps, intent);
        return;
      }

      case 'assault-camp-preview': {
        showCampAssaultPreview(deps, intent);
        return;
      }

      case 'confirm-war-city': {
        confirmWarOnCity(deps, intent);
        return;
      }

      case 'confirm-war-minor-civ': {
        confirmWarOnMinorCiv(deps, intent, coord);
        return;
      }

      case 'assault-minor-civ': {
        assaultMinorCiv(deps, intent);
        return;
      }

      case 'worker-busy': {
        confirmBusyWorkerTap(deps, intent);
        return;
      }

      case 'move': {
        selectionController.executeAnimatedUnitMove(intent.unitId, () => {
          const moveResult = executeUnitMove(session.getState(), intent.unitId, intent.coord, {
            actor: 'player',
            civId: session.getState().currentPlayer,
            bus,
          });
          if (moveResult.ok) session.commit(moveResult.state);
          return moveResult;
        });
        SFX.tap();
        return;
      }

      case 'open-city': {
        const cityAtHex = session.getState().cities[intent.cityId];
        if (!cityAtHex) return;
        deps.getElementById('tech-panel')?.remove();
        deps.getElementById('city-panel')?.remove();
        deps.getElementById('espionage-panel')?.remove();
        deps.getElementById('diplomacy-panel')?.remove();
        deps.getElementById('marketplace-panel')?.remove();
        deps.getElementById('council-panel')?.remove();
        selectionController.deselectUnit();
        deps.openCityPanelForCity(cityAtHex);
        return;
      }

      case 'open-wonder-atlas': {
        selectionController.deselectUnit();
        const audioFocus = resolveNaturalWonderAudioFocus(session.getState(), session.getState().currentPlayer, intent.coord);
        if (audioFocus) void audio.startNaturalWonderMapFocusAmbient(audioFocus.wonderId);
        deps.openWonderAtlas(intent.wonderId);
        SFX.tap();
        return;
      }

      case 'deselect': {
        selectionController.deselectUnit();
        SFX.tap();
        return;
      }

      default: {
        const _exhaustive: never = intent;
        throw new Error(`Unhandled map tap intent: ${JSON.stringify(_exhaustive)}`);
      }
    }
  }

  return {
    handleHexTap,
    handleHexLongPress: longPress.handleHexLongPress,
  };
}
