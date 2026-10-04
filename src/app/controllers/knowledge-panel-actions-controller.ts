/**
 * Knowledge / reference panel openers (#1242), split out of the monolithic
 * `panel-actions-controller.ts`. Covers the pacing-debug overlay, Bestiary,
 * Hall of Fame, Wonder atlas, Notification log, Council, and Tech panels —
 * the "read and learn about the world" surfaces plus the Council/Tech action
 * callbacks.
 *
 * No behaviour change: same panels, same publication (`session.commit`), same
 * copy. Cross-use-case openers (City, Wonder, Diplomacy) go through
 * `PanelActionsCrossCalls` so this module never imports a peer controller.
 */
import type { CouncilCardAction } from '@/core/types';
import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { getBestiaryEntriesForPlayer } from '@/systems/beast-presentation';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import { getHallOfFameForViewer } from '@/systems/great-general-hall-of-fame';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
import { createWonderAtlasPanel } from '@/ui/wonder-atlas-panel';
import { createNotificationLogPanel } from '@/ui/notification-log-panel';
import { getNotificationsForPlayer } from '@/core/notification-log';
import { markNotificationRead, resolvePirateNotificationReview } from '@/ui/pirate-notification-listeners';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderEligibility } from '@/systems/legendary-wonder-system';
import { createCouncilPanel } from '@/ui/council-panel';
import { createTechPanel } from '@/ui/tech-panel';
import { enqueueResearch, moveQueuedId, removeQueuedId } from '@/systems/planning-system';
import { saveSettings } from '@/storage/save-manager';
import { chooseEventChainOption } from '@/systems/event-chain-choices';
import { parseEventChainCardId } from '@/systems/event-chain-presentation';
import { findReadyScoutUnitId } from '@/systems/scout-readiness';
import type { PanelActionsCommonDeps, PanelActionsCrossCalls } from './panel-actions-shared';

export interface KnowledgePanelActionsController {
  openPacingDebugPanel(): void;
  openBestiary(): void;
  openHallOfFame(): void;
  openWonderAtlas(initialWonderId?: string): void;
  openNotificationLog(): void;
  openCouncilPanel(): void;
  openTechPanel(): void;
}

export function createKnowledgePanelActionsController(
  deps: PanelActionsCommonDeps,
  cross: PanelActionsCrossCalls,
): KnowledgePanelActionsController {
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

  function openHallOfFame(): void {
    const state = deps.session.getState();
    createHallOfFamePanel(
      deps.uiLayer,
      getHallOfFameForViewer(state, state.currentPlayer),
      { onClose: () => {} },
    );
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
        if (city) cross.openCityPanelForCity(city);
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
        if (city) cross.openCityPanelForCity(city);
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
        cross.openWonderPanelForCityId(city.id);
      },
      onMarkRead: notificationId => {
        deps.session.commit(markNotificationRead(deps.session.getState(), deps.session.getState().currentPlayer, notificationId));
      },
      onReviewPirate: review => {
        const resolved = resolvePirateNotificationReview(deps.session.getState(), deps.session.getState().currentPlayer, review);
        panel.remove();
        if (resolved?.kind === 'active') cross.openPirateWaters({ factionId: resolved.factionId });
        if (resolved?.kind === 'history') cross.openPirateWaters({ historyId: resolved.historyId });
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

  function openCouncilPanel(): void {
    deps.hud.closeDrawer();
    createCouncilPanel(deps.uiLayer, deps.session.getState(), {
      onClose: () => {
        deps.getElementById('council-panel')?.remove();
      },
      onTalkLevelChange: (level) => {
        deps.session.commit({ ...deps.session.getState(), settings: { ...deps.session.getState().settings, councilTalkLevel: level } });
        void saveSettings(deps.session.getState().settings);
      },
      onCardAction: (cardId, action) => {
        const parsed = parseEventChainCardId(cardId);
        if (parsed) {
          const state = deps.session.getState();
          const result = chooseEventChainOption(state, parsed.chainId, parsed.optionId, state.currentPlayer, deps.bus);
          if (!result.success) {
            deps.showNotification(result.message, 'warning');
            return;
          }
          deps.session.commit(result.state);
          deps.showNotification('Decision recorded.', 'success');
          openCouncilPanel(); // re-render: the chosen card's whole option set must disappear (#787 "panel rerender after interaction")
          return;
        }
        if (!action) return; // no typed action either (see council-panel.ts's callback doc comment)
        dispatchCouncilCardAction(action);
      },
    });
  }

  /** Dispatches a non-event-chain `CouncilCard.action` (see `council-system.ts`'s
   * `CouncilCardAction` doc comment) -- the survey-frontier/food-warning/quest/wonder
   * card action wiring. Each branch removes the council panel before opening the next
   * one so the two full-height overlays never stack. */
  function dispatchCouncilCardAction(action: CouncilCardAction): void {
    switch (action.kind) {
      case 'scout': {
        const state = deps.session.getState();
        // The same predicate the Council used to offer this card (scout-readiness.ts).
        const candidateId = findReadyScoutUnitId(state, state.currentPlayer);
        if (!candidateId) {
          deps.showNotification('No units are ready to scout right now.', 'info');
          return;
        }
        deps.getElementById('council-panel')?.remove();
        deps.selectionController.startAutoExplore(candidateId);
        return;
      }
      case 'open-city': {
        const city = deps.session.getState().cities[action.cityId];
        if (!city || city.owner !== deps.session.getState().currentPlayer) {
          deps.showNotification('That city is no longer available.', 'warning');
          return;
        }
        deps.getElementById('council-panel')?.remove();
        cross.openCityPanelForCity(city);
        return;
      }
      case 'open-quest': {
        deps.getElementById('council-panel')?.remove();
        cross.openDiplomacyPanel(action.minorCivId);
        return;
      }
      case 'open-wonder': {
        if (!deps.session.getState().cities[action.cityId]) {
          deps.showNotification('That city is no longer available.', 'warning');
          return;
        }
        deps.getElementById('council-panel')?.remove();
        cross.openWonderPanelForCityId(action.cityId);
        return;
      }
      case 'open-tech': {
        deps.getElementById('council-panel')?.remove();
        openTechPanel();
        return;
      }
      case 'open-victory-progress': {
        deps.getElementById('council-panel')?.remove();
        deps.router.open('victory-progress');
        return;
      }
      default: {
        // Compile-time exhaustiveness: a new CouncilCardAction kind cannot ship without a branch here.
        const unhandled: never = action;
        return unhandled;
      }
    }
  }

  function openTechPanel(): void {
    deps.hud.closeDrawer();
    createTechPanel(deps.uiLayer, deps.session.getState(), {
      onQueueResearch: (techId) => {
        const civ = deps.currentCiv();
        let nextTechState;
        try {
          nextTechState = enqueueResearch(civ.techState, techId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          deps.showNotification(message, 'warning');
          return;
        }
        deps.session.commit({
          ...deps.session.getState(),
          civilizations: { ...deps.session.getState().civilizations, [deps.session.getState().currentPlayer]: { ...civ, techState: nextTechState } },
        });
        deps.showNotification(`Queued research: ${techId}`, 'info');
        // Return fresh state so the open panel reopens from the committed object,
        // not the pre-click reference it captured (#915).
        return deps.session.getState();
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        const civ = deps.currentCiv();
        deps.session.commit({
          ...deps.session.getState(),
          civilizations: {
            ...deps.session.getState().civilizations,
            [deps.session.getState().currentPlayer]: {
              ...civ,
              techState: { ...civ.techState, researchQueue: moveQueuedId(civ.techState.researchQueue, fromIndex, toIndex) },
            },
          },
        });
        return deps.session.getState();
      },
      onRemoveQueuedResearch: (index) => {
        const civ = deps.currentCiv();
        deps.session.commit({
          ...deps.session.getState(),
          civilizations: {
            ...deps.session.getState().civilizations,
            [deps.session.getState().currentPlayer]: {
              ...civ,
              techState: { ...civ.techState, researchQueue: removeQueuedId(civ.techState.researchQueue, index) },
            },
          },
        });
        return deps.session.getState();
      },
      onClose: () => {},
    });
  }

  return {
    openPacingDebugPanel,
    openBestiary,
    openHallOfFame,
    openWonderAtlas,
    openNotificationLog,
    openCouncilPanel,
    openTechPanel,
  };
}
