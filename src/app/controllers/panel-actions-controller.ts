/**
 * Owns the utility and world-event panel openers (#787 phase 10b-b, part 1 of 3
 * for `PanelActionsController` -- see 10b-c/10b-d for the remaining panels):
 * `openPacingDebugPanel`, `openBestiary`, `openWonderAtlas`, `openPirateWaters`,
 * `openPirateHeadquartersAssault`, `openNotificationLog`.
 *
 * `openWonderAtlas` and `openNotificationLog` both open `openCityPanelForCity`
 * (a not-yet-extracted panel opener, phase 10b-c/d); `openNotificationLog` also
 * opens `openWonderPanelForCityId` (same). Both arrive as injected deps to
 * avoid a forward reference regardless of which sub-phase lands first, same
 * pattern as 10b-a's `openDiplomacyPanel` dep.
 *
 * `showNotification`, `focusNotificationTarget`, `focusPirateTarget`, and
 * `applyPirateActionResult` are cross-cutting helpers (phase 10b-f's domain)
 * still living in `main.ts` -- threaded through as deps until that phase
 * gives them a real home.
 *
 * Everything this file calls that is a pure `@/systems/*`, `@/input/*`, or
 * `@/ui/*` helper is imported directly, matching the precedent set by every
 * prior controller in this arc. Only concrete platform services, sibling
 * controllers/stores, and the main.ts-local functions this phase does NOT
 * move are threaded through as deps.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { EventBus } from '@/core/event-bus';
import type { GameSession, SelectionStore } from '@/app/ports';
import type { HudController } from '@/app/controllers/hud-controller';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { City } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { getBestiaryEntriesForPlayer } from '@/systems/beast-presentation';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import { createWonderAtlasPanel } from '@/ui/wonder-atlas-panel';
import { createPirateWatersPanel } from '@/ui/pirate-waters-panel';
import { getPirateWatersPresentation, type PirateFocusTarget } from '@/systems/pirate-presentation';
import { hirePirateFlotilla, payPirateTribute, type PirateActionResult } from '@/systems/pirate-actions';
import { confirmPirateHeadquartersAssault, preparePirateHeadquartersAssault } from '@/input/pirate-headquarters-assault';
import { createPirateHeadquartersAssaultPanel } from '@/ui/pirate-headquarters-assault-panel';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import { getNotificationsForPlayer } from '@/core/notification-log';
import { markNotificationRead, resolvePirateNotificationReview } from '@/ui/pirate-notification-listeners';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderEligibility } from '@/systems/legendary-wonder-system';
import { SFX } from '@/audio/sfx';

export interface PanelActionsController {
  openPacingDebugPanel(): void;
  openBestiary(): void;
  openWonderAtlas(initialWonderId?: string): void;
  openPirateWaters(focus?: { factionId?: string; historyId?: string }): void;
  openPirateHeadquartersAssault(factionId: string, unitId: string): void;
  openNotificationLog(): void;
}

/** The narrow slice of `RenderLoop` this controller needs. */
export type PanelActionsRenderer = Pick<
  RenderLoop,
  'setSelectedPirateFactionId' | 'applyPirateHeadquartersAssaultVisual' | 'setGameState'
> & { readonly camera: Pick<RenderLoop['camera'], 'centerOn'> };

/** The narrow slice of `AudioSystem` this controller needs. */
export type PanelActionsAudio = Pick<
  AudioSystem,
  'stopNaturalWonderAmbient' | 'startNaturalWonderCodexAmbient' | 'playNaturalWonderReplay'
  | 'stopPirateAmbience' | 'startPirateHeadquartersAmbience'
>;

export interface PanelActionsControllerDeps {
  readonly session: GameSession;
  readonly bus: EventBus;
  readonly uiLayer: HTMLDivElement;
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly selection: Pick<SelectionStore, 'setPirateSelection' | 'getPirateSelection' | 'getSelectedUnitId'>;
  readonly selectionController: Pick<SelectionController, 'selectUnit' | 'deselectUnit'>;
  readonly hud: Pick<HudController, 'closeDrawer' | 'update'>;
  readonly audio: PanelActionsAudio;
  readonly renderLoop: PanelActionsRenderer;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  readonly focusNotificationTarget: (target: NotificationEntry['target']) => void;
  readonly focusPirateTarget: (target: PirateFocusTarget) => void;
  readonly applyPirateActionResult: (result: PirateActionResult, successMessage: string) => void;
  /** `PanelActionsController`'s own function (phase 10b-c/d) -- injected to avoid a forward reference. */
  readonly openCityPanelForCity: (city: City) => void;
  /** `PanelActionsController`'s own function (phase 10b-c/d) -- injected to avoid a forward reference. */
  readonly openWonderPanelForCityId: (selectedCityId: string) => void;
}

export function createPanelActionsController(deps: PanelActionsControllerDeps): PanelActionsController {
  /**
   * `createPacingDebugPanel` self-removes any prior instance from `uiLayer`,
   * so the router's own DOM-derived `isOpen`/`close` need no extra bookkeeping
   * here (#787 phase 5).
   */
  function openPacingDebugPanel(): void {
    if (deps.session.getState()) createPacingDebugPanel(deps.uiLayer, deps.session.getState());
  }

  function openBestiary(): void {
    createBestiaryPanel(deps.uiLayer, getBestiaryEntriesForPlayer(deps.session.getState(), deps.session.getState().currentPlayer), {
      onClose: () => {},
      slayerNameFor: (civId) => deps.session.getState().civilizations[civId]?.name ?? civId,
    });
  }

  function openWonderAtlas(initialWonderId?: string): void {
    deps.hud.closeDrawer();
    deps.audio.stopNaturalWonderAmbient('codex-page-hidden');
    createWonderAtlasPanel(deps.uiLayer, deps.session.getState(), {
      initialWonderId,
      onViewOnMap: coord => {
        deps.renderLoop.camera.centerOn(coord);
      },
      onOpenCity: cityId => {
        const city = deps.session.getState().cities[cityId];
        if (city) deps.openCityPanelForCity(city);
      },
      onNaturalWonderPageShown: wonderId => {
        void deps.audio.startNaturalWonderCodexAmbient(wonderId);
      },
      onNaturalWonderPageHidden: () => {
        deps.audio.stopNaturalWonderAmbient('codex-page-hidden');
      },
      onNaturalWonderReplay: wonderId => {
        void deps.audio.playNaturalWonderReplay(wonderId);
      },
      onClose: () => {},
    });
  }

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
        deps.session.setStateWithoutRefresh(result.state);
        panel.remove();
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
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

  /**
   * The "close if already open" behavior moved to `router.toggle('notification-log')`
   * (#787 phase 5) -- `isOpen`/`close` are DOM-derived, so this only needs to
   * build and append the panel now.
   */
  function openNotificationLog(): void {
    const entries = deps.session.getState()
      ? getNotificationsForPlayer(deps.session.getState().notificationLog ?? {}, deps.session.getState().currentPlayer)
      : [];
    const panel = createNotificationLogPanel(entries, {
      onClose: () => panel.remove(),
      onFocusTarget: deps.focusNotificationTarget,
      onOpenCity: (cityId) => {
        panel.remove();
        const city = deps.session.getState()?.cities[cityId];
        if (city) deps.openCityPanelForCity(city);
      },
      onOpenWonderCity: action => {
        const city = deps.session.getState()?.cities[action.cityId];
        const definition = getLegendaryWonderDefinition(action.wonderId);
        if (!city || !definition || city.owner !== deps.session.getState().currentPlayer
          || !getLegendaryWonderEligibility(deps.session.getState(), deps.session.getState().currentPlayer, city.id, definition).buildable) {
          deps.showNotification('That wonder is no longer available in this city.', 'warning');
          return;
        }
        panel.remove();
        deps.openWonderPanelForCityId(city.id);
      },
      onMarkRead: notificationId => {
        deps.session.setStateWithoutRefresh(markNotificationRead(deps.session.getState(), deps.session.getState().currentPlayer, notificationId));
      },
      onReviewPirate: review => {
        const resolved = resolvePirateNotificationReview(deps.session.getState(), deps.session.getState().currentPlayer, review);
        panel.remove();
        if (resolved?.kind === 'active') openPirateWaters({ factionId: resolved.factionId });
        if (resolved?.kind === 'history') openPirateWaters({ historyId: resolved.historyId });
      },
    });

    deps.uiLayer.appendChild(panel);

    setTimeout(() => {
      const handler = (e: Event) => {
        if (!panel.contains(e.target as Node)) {
          panel.remove();
          document.removeEventListener('click', handler);
        }
      };
      document.addEventListener('click', handler);
    }, 100);
  }

  return {
    openPacingDebugPanel,
    openBestiary,
    openWonderAtlas,
    openPirateWaters,
    openPirateHeadquartersAssault,
    openNotificationLog,
  };
}
