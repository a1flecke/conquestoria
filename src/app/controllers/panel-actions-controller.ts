/**
 * Owns the panel openers extracted from `main.ts` across #787 phases 10b-b and
 * 10b-c (see 10b-d for the two remaining, largest panels: `openCityPanelForCity`,
 * `openEspionagePanel`).
 *
 * Phase 10b-b (part 1, utility/world-event panels): `openPacingDebugPanel`,
 * `openBestiary`, `openWonderAtlas`, `openPirateWaters`,
 * `openPirateHeadquartersAssault`, `openNotificationLog`.
 *
 * Phase 10b-c (part 2, unit/network/civ-management panels): `openDiplomacyPanel`,
 * `openMarketplacePanel`, `openWonderPanelForCityId`, `openCityOverviewPanel`,
 * `openCouncilPanel`, `openTechPanel`, `openUnitStackPicker`,
 * `openNetworkIntentPanel`, `openNetworkPanel`.
 *
 * `openWonderAtlas`, `openNotificationLog`, and `openCityOverviewPanel` all open
 * `openCityPanelForCity` (a not-yet-extracted panel opener, phase 10b-d) --
 * arrives as an injected dep to avoid a forward reference. `openWonderPanelForCityId`
 * itself is now a sibling function in this file (phase 10b-c), so `openNotificationLog`'s
 * `onOpenWonderCity` calls it directly instead of through a dep, same pattern as
 * `openPirateWaters`/`openPirateHeadquartersAssault` calling each other directly.
 *
 * `showNotification`, `focusNotificationTarget`, `focusPirateTarget`,
 * `applyPirateActionResult`, and `currentCiv` are cross-cutting helpers (phase
 * 10b-f's domain) still living in `main.ts` -- threaded through as deps until
 * that phase gives them a real home.
 *
 * `diplomacyActions` (phase 10b-a's `DiplomacyActionsController`) is threaded
 * through as a dep for `openDiplomacyPanel`'s and `openCityOverviewPanel`'s
 * handler callbacks -- it's constructed before `panelActions` in `main.ts`, so
 * a direct reference works with no lazy wrapper needed.
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
import type { DiplomacyActionsController } from '@/app/controllers/diplomacy-actions-controller';
import type { City, Civilization, HexCoord } from '@/core/types';
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
import { getLegendaryWonderEligibility, initializeLegendaryWonderProjectsForCity, startLegendaryWonderBuild } from '@/systems/legendary-wonder-system';
import { getProductionDisplayName } from '@/systems/city-system';
import { enqueueResearch, moveQueuedId, removeQueuedId } from '@/systems/planning-system';
import { canBuyResourceAccess, performBuyResourceAccess } from '@/systems/resource-acquisition-system';
import { assignNetworkPlan, cancelNetworkPlan, holdNetworkPlan, isAutonomyActivated, retargetNetworkPlan } from '@/systems/network-plan-system';
import { beginAutonomySurge, requestAutonomyPosture } from '@/systems/autonomy-postures';
import { saveSettings } from '@/storage/save-manager';
import { createDiplomacyPanel } from '@/ui/diplomacy-panel';
import { createMarketplacePanel } from '@/ui/marketplace-panel';
import { createWonderPanel } from '@/ui/wonder-panel';
import { createCityOverviewPanel } from '@/ui/city-overview-panel';
import { createCouncilPanel } from '@/ui/council-panel';
import { createTechPanel } from '@/ui/tech-panel';
import { renderUnitStackPanel } from '@/ui/unit-stack-panel';
import { createNetworkIntentPanel } from '@/ui/network-intent-panel';
import { createNetworkPanel, getNetworkPanelModel } from '@/ui/network-panel';
import { SFX } from '@/audio/sfx';

export interface PanelActionsController {
  openPacingDebugPanel(): void;
  openBestiary(): void;
  openWonderAtlas(initialWonderId?: string): void;
  openPirateWaters(focus?: { factionId?: string; historyId?: string }): void;
  openPirateHeadquartersAssault(factionId: string, unitId: string): void;
  openNotificationLog(): void;
  openDiplomacyPanel(): void;
  openMarketplacePanel(): void;
  openWonderPanelForCityId(selectedCityId: string): void;
  openCityOverviewPanel(): void;
  openCouncilPanel(): void;
  openTechPanel(): void;
  openUnitStackPicker(coord: HexCoord, unitIds: string[]): void;
  openNetworkIntentPanel(sourceUnitId: string): void;
  openNetworkPanel(): void;
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
  readonly currentCiv: () => Civilization;
  readonly diplomacyActions: Pick<
    DiplomacyActionsController,
    | 'handleDiplomaticAction' | 'handleAcceptPeaceRequest' | 'handleRejectPeaceRequest'
    | 'handleAcceptTreatyProposal' | 'handleDeclineTreatyProposal' | 'handleBreakTreaty'
    | 'handleGiftGold' | 'handleSponsorFestival' | 'handleMinorCivReparations' | 'handleSendAid'
    | 'handleMinorCivWarPeace' | 'handleAppeaseFaction' | 'handleConcedeToMovement'
  >;
  /** `PanelActionsController`'s own function (phase 10b-d) -- injected to avoid a forward reference. */
  readonly openCityPanelForCity: (city: City) => void;
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
        openWonderPanelForCityId(city.id);
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

  function openDiplomacyPanel(): void {
    deps.hud.closeDrawer();
    deps.getElementById('diplomacy-panel')?.remove();
    createDiplomacyPanel(deps.uiLayer, deps.session.getState(), {
      onAction: deps.diplomacyActions.handleDiplomaticAction,
      onAcceptPeaceRequest: deps.diplomacyActions.handleAcceptPeaceRequest,
      onRejectPeaceRequest: deps.diplomacyActions.handleRejectPeaceRequest,
      onAcceptTreatyProposal: deps.diplomacyActions.handleAcceptTreatyProposal,
      onDeclineTreatyProposal: deps.diplomacyActions.handleDeclineTreatyProposal,
      onBreakTreaty: deps.diplomacyActions.handleBreakTreaty,
      onGiftGold: deps.diplomacyActions.handleGiftGold,
      onSponsorFestival: deps.diplomacyActions.handleSponsorFestival,
      onMinorCivReparations: deps.diplomacyActions.handleMinorCivReparations,
      onMinorCivWarPeace: deps.diplomacyActions.handleMinorCivWarPeace,
      onSendAid: deps.diplomacyActions.handleSendAid,
      onClose: () => {},
    });
  }

  function openMarketplacePanel(): void {
    deps.hud.closeDrawer();
    deps.getElementById('marketplace-panel')?.remove();
    createMarketplacePanel(deps.uiLayer, deps.session.getState(), {
      onClose: () => {},
      onSelectUnit: (unitId) => {
        deps.getElementById('marketplace-panel')?.remove();
        deps.selectionController.selectUnit(unitId);
        const unit = deps.session.getState().units[unitId];
        if (unit) deps.renderLoop.camera.centerOn(unit.position);
      },
      onBuyResourceAccess: (sellerCivId, resource) => {
        if (!canBuyResourceAccess(deps.session.getState(), deps.session.getState().currentPlayer, sellerCivId, resource)) return;
        deps.session.commit(performBuyResourceAccess(deps.session.getState(), deps.session.getState().currentPlayer, sellerCivId, resource));
        deps.showNotification(`Purchased ${resource} access for 10 turns.`, 'success');
        openMarketplacePanel(); // re-render panel with updated state
      },
    });
  }

  function openWonderPanelForCityId(selectedCityId: string): void {
    if (!deps.session.getState().cities[selectedCityId]) return;

    const openWonderPanel = () => {
      deps.getElementById('wonder-panel')?.remove();
      createWonderPanel(deps.uiLayer, deps.session.getState(), selectedCityId, {
        onStartBuild: (buildCityId, wonderId) => {
          deps.session.setStateWithoutRefresh(startLegendaryWonderBuild(deps.session.getState(), deps.session.getState().currentPlayer, buildCityId, wonderId, deps.bus));
          const targetCity = deps.session.getState().cities[buildCityId];
          if (targetCity) {
            deps.renderLoop.setGameState(deps.session.getState());
            deps.hud.update();
            const productionItemId = `legendary:${wonderId}`;
            if (targetCity.productionQueue[0] === productionItemId) {
              deps.showNotification(`${targetCity.name}: preparing ${getProductionDisplayName(productionItemId)}`, 'info');
            } else {
              deps.showNotification(`${targetCity.name}: ${getProductionDisplayName(productionItemId)} is not ready to start.`, 'warning');
            }
            openWonderPanel();
          }
        },
        onClose: () => {
          deps.getElementById('wonder-panel')?.remove();
        },
      });
    };
    deps.session.setStateWithoutRefresh(initializeLegendaryWonderProjectsForCity(deps.session.getState(), deps.session.getState().currentPlayer, selectedCityId));
    openWonderPanel();
  }

  function openCityOverviewPanel(): void {
    deps.hud.closeDrawer();
    const existing = deps.getElementById('city-overview-panel');
    if (existing) existing.remove();
    createCityOverviewPanel(deps.uiLayer, deps.session.getState(), {
      onOpenCity: (cityId) => {
        const overview = deps.getElementById('city-overview-panel');
        overview?.remove();
        const city = deps.session.getState().cities[cityId];
        if (city) deps.openCityPanelForCity(city);
      },
      onAppeaseFaction: (cityId) => {
        deps.diplomacyActions.handleAppeaseFaction(cityId);
        openCityOverviewPanel(); // re-render with updated unrest/gold state
      },
      onConcedeToMovement: (cityId) => {
        deps.diplomacyActions.handleConcedeToMovement(cityId);
        openCityOverviewPanel(); // re-render with updated unrest/gold state
      },
      onClose: () => {
        deps.getElementById('city-overview-panel')?.remove();
      },
    });
  }

  function openCouncilPanel(): void {
    deps.hud.closeDrawer();
    createCouncilPanel(deps.uiLayer, deps.session.getState(), {
      onClose: () => {
        deps.getElementById('council-panel')?.remove();
      },
      onTalkLevelChange: (level) => {
        deps.session.getState().settings.councilTalkLevel = level;
        void saveSettings(deps.session.getState().settings);
      },
    });
  }

  function openTechPanel(): void {
    deps.hud.closeDrawer();
    createTechPanel(deps.uiLayer, deps.session.getState(), {
      onQueueResearch: (techId) => {
        try {
          deps.currentCiv().techState = enqueueResearch(deps.currentCiv().techState, techId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          deps.showNotification(message, 'warning');
          return;
        }
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.showNotification(`Queued research: ${techId}`, 'info');
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        deps.currentCiv().techState = {
          ...deps.currentCiv().techState,
          researchQueue: moveQueuedId(deps.currentCiv().techState.researchQueue, fromIndex, toIndex),
        };
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
      },
      onRemoveQueuedResearch: (index) => {
        deps.currentCiv().techState = {
          ...deps.currentCiv().techState,
          researchQueue: removeQueuedId(deps.currentCiv().techState.researchQueue, index),
        };
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
      },
      onClose: () => {},
    });
  }

  function openUnitStackPicker(coord: HexCoord, unitIds: string[]): void {
    const panel = deps.getElementById('info-panel');
    if (!panel) return;

    renderUnitStackPanel(panel, deps.session.getState(), coord, unitIds, {
      onSelectUnit: (unitId) => deps.selectionController.selectUnit(unitId),
      onOpenCity: (cityId) => {
        const city = deps.session.getState().cities[cityId];
        if (!city) return;
        deps.getElementById('tech-panel')?.remove();
        deps.getElementById('city-panel')?.remove();
        deps.getElementById('espionage-panel')?.remove();
        deps.getElementById('diplomacy-panel')?.remove();
        deps.getElementById('marketplace-panel')?.remove();
        deps.getElementById('council-panel')?.remove();
        deps.selectionController.deselectUnit();
        deps.openCityPanelForCity(city);
      },
      onClose: () => deps.selectionController.deselectUnit(),
    }, { selectedUnitId: deps.selection.getSelectedUnitId() });
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

  return {
    openPacingDebugPanel,
    openBestiary,
    openWonderAtlas,
    openPirateWaters,
    openPirateHeadquartersAssault,
    openNotificationLog,
    openDiplomacyPanel,
    openMarketplacePanel,
    openWonderPanelForCityId,
    openCityOverviewPanel,
    openCouncilPanel,
    openTechPanel,
    openUnitStackPicker,
    openNetworkIntentPanel,
    openNetworkPanel,
  };
}
