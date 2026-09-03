/**
 * Owns every panel opener extracted from `main.ts` across #787 phases
 * 10b-b, 10b-c, and 10b-d -- the full `PanelActionsController`.
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
 * Phase 10b-d (part 3, the two largest/riskiest panels): `openCityPanelForCity`
 * (~141 lines pre-move), `openEspionagePanel` (~279 lines pre-move, the
 * largest single function in this arc).
 *
 * `openWonderAtlas`, `openNotificationLog`, and `openCityOverviewPanel` all open
 * `openCityPanelForCity`, which is now a sibling function in this file (phase
 * 10b-d) -- their calls stay bare local-function calls, same pattern as
 * `openWonderPanelForCityId` becoming a sibling in 10b-c. `openCityPanelForCity`
 * also calls itself recursively (`onPrevCity`/`onNextCity` city-cycling).
 *
 * `showNotification`, `focusNotificationTarget`, `focusPirateTarget`,
 * `applyPirateActionResult`, `currentCiv`, and `currentCivDef` are cross-cutting
 * helpers (phase 10b-f's domain) still living in `main.ts` -- threaded through
 * as deps until that phase gives them a real home.
 *
 * `diplomacyActions` (phase 10b-a's `DiplomacyActionsController`) is threaded
 * through as a dep for `openDiplomacyPanel`'s, `openCityOverviewPanel`'s, and
 * `openCityPanelForCity`'s handler callbacks -- it's constructed before
 * `panelActions` in `main.ts`, so a direct reference works with no lazy
 * wrapper needed.
 *
 * `router` is threaded through as a lazy wrapper (`{ open: panel =>
 * router.open(panel) }`), not a direct reference -- `router` is a `let` not
 * assigned until `createPanelRouter(...)` much later in `main.ts` module
 * evaluation (after `panelRegistry`, which itself needs this controller's
 * methods), so a direct reference here would capture `undefined` at
 * construction time. Same deferred-but-eager pattern `turnFlow` already uses
 * for its own `router` dep.
 *
 * `executeUpgrade` stays a `main.ts`-local function (phase 13's
 * `PlayerActionController` domain, not this controller's) -- threaded through
 * as a dep for `openCityPanelForCity`'s `onUpgradeUnit` callback.
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
import type { PanelRouter } from '@/app/panel-router';
import type { City, CivDefinition, Civilization, GameState, HexCoord, SpyMissionType, UnitType } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import { createPacingDebugPanel } from '@/ui/pacing-debug-panel';
import { getBestiaryEntriesForPlayer } from '@/systems/beast-presentation';
import { createBestiaryPanel } from '@/ui/bestiary-panel';
import { getHallOfFameForViewer } from '@/systems/great-general-hall-of-fame';
import { createHallOfFamePanel } from '@/ui/hall-of-fame-panel';
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
import { getProductionDisplayName, TRAINABLE_UNITS } from '@/systems/city-system';
import { enqueueCityProduction, enqueueResearch, moveQueuedId, removeQueuedId, reorderCityProduction, setIdleProduction } from '@/systems/planning-system';
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
import { createCityPanel } from '@/ui/city-panel';
import { createStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
import { executeStrategicLaunch } from '@/systems/strategic-launch-execution-system';
import { createStrategicArsenalPanel } from '@/ui/strategic-arsenal-panel';
import { getStrategicArsenalSummaryPresentation } from '@/systems/strategic-arsenal-summary-presentation';
import { createEspionagePanel } from '@/ui/espionage-panel';
import { assignCityFocus, setCityWorkedTile } from '@/systems/city-work-system';
import { chooseCircularManufacturingMaterial } from '@/systems/national-project-system';
import { rushBuyActiveProduction } from '@/systems/economy-system';
import { applyEmpireContainment, applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { UNIT_DEFINITIONS, createUnit } from '@/systems/unit-system';
import { evaluateUnitUpgrade } from '@/systems/unit-upgrade-system';
import { hexKey, hexesInRange } from '@/systems/hex-utils';
import { getCapitalCity, getCapitalCityId } from '@/systems/capital-system';
import {
  embedSpy, unembedSpy, attemptSweep, getAvailableMissions, missionRequiresPlacedSpy,
  recallSpy, startMission, verifyAgent,
} from '@/systems/espionage-system';
import { SFX } from '@/audio/sfx';

export interface PanelActionsController {
  openPacingDebugPanel(): void;
  openBestiary(): void;
  openHallOfFame(): void;
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
  openCityPanelForCity(city: City): void;
  openEspionagePanel(): void;
  openStrategicArsenalPanel(): void;
}

/** The narrow slice of `RenderLoop` this controller needs. */
export type PanelActionsRenderer = Pick<
  RenderLoop,
  'setSelectedPirateFactionId' | 'applyPirateHeadquartersAssaultVisual' | 'setGameState' | 'setHighlights' | 'setStrategicLaunchPreview'
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
  readonly currentCivDef: () => CivDefinition | undefined;
  readonly diplomacyActions: Pick<
    DiplomacyActionsController,
    | 'handleDiplomaticAction' | 'handleAcceptPeaceRequest' | 'handleRejectPeaceRequest'
    | 'handleAcceptTreatyProposal' | 'handleDeclineTreatyProposal' | 'handleBreakTreaty'
    | 'handleGiftGold' | 'handleSponsorFestival' | 'handleMinorCivReparations' | 'handleSendAid'
    | 'handleMinorCivWarPeace' | 'handleAppeaseFaction' | 'handleConcedeToMovement' | 'handleEstablishRoute'
  >;
  /** `main.ts`-local function (phase 13's `PlayerActionController` domain) -- injected to avoid a forward reference. */
  readonly executeUpgrade: (unitId: string, targetType: UnitType) => boolean;
  /**
   * Lazy wrapper, not a direct reference -- `router` is a `let` not assigned
   * until `createPanelRouter(...)` much later in `main.ts` module evaluation.
   * Same deferred-but-eager pattern `turnFlow`'s own `router` dep already uses.
   */
  readonly router: Pick<PanelRouter, 'open'>;
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

  function openHallOfFame(): void {
    const state = deps.session.getState();
    createHallOfFamePanel(
      deps.uiLayer,
      getHallOfFameForViewer(state, state.currentPlayer),
      { onClose: () => {} },
    );
  }

  function openStrategicArsenalPanel(): void {
    const presentation = getStrategicArsenalSummaryPresentation(deps.session.getState(), deps.session.getState().currentPlayer);
    createStrategicArsenalPanel(deps.uiLayer, presentation, () => {});
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
        if (city) openCityPanelForCity(city);
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
        if (city) openCityPanelForCity(city);
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
        if (city) openCityPanelForCity(city);
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
        deps.session.commit({ ...deps.session.getState(), settings: { ...deps.session.getState().settings, councilTalkLevel: level } });
        void saveSettings(deps.session.getState().settings);
      },
    });
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
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
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
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
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
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        return deps.session.getState();
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
        openCityPanelForCity(city);
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

  function openCityPanelForCity(city: City): void {
    deps.hud.closeDrawer();
    if (city.owner !== deps.session.getState().currentPlayer) return;

    createCityPanel(deps.uiLayer, city, deps.session.getState(), {
      onBuild: (cityId, itemId) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (targetCity) {
          try {
            deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: enqueueCityProduction(targetCity, itemId) } });
            deps.renderLoop.setGameState(deps.session.getState());
            deps.showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
            return deps.session.getState();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Queue limit reached';
            deps.showNotification(`${targetCity.name}: ${message}`, 'warning');
          }
        }
      },
      onPrepareStrategicLaunch: (cityId: string) => {
        const launchingCity = deps.session.getState().cities[cityId];
        if (!launchingCity) return;
        createStrategicLaunchFlow(deps.uiLayer, deps.session.getState(), launchingCity.owner, {
          onSetPreview: preview => deps.renderLoop.setStrategicLaunchPreview(preview),
          onConfirmLaunch: targetCityId => {
            const targetCivId = deps.session.getState().cities[targetCityId]?.owner;
            const result = executeStrategicLaunch(deps.session.getState(), launchingCity.owner, targetCityId);
            if (result.ok && targetCivId) {
              deps.session.commit(result.state);
              deps.renderLoop.setGameState(deps.session.getState());
              deps.showNotification('Strategic strike launched.', 'warning');
              deps.bus.emit('city:strategic-strike', { cityId: targetCityId, recipientCivId: targetCivId, actorCivId: launchingCity.owner, goldLost: result.goldLost });
            }
          },
          onClose: () => {},
        });
      },
      onMoveQueueItem: (cityId, fromIndex, toIndex) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: reorderCityProduction(targetCity, fromIndex, toIndex) } });
        deps.renderLoop.setGameState(deps.session.getState());
        return deps.session.getState();
      },
      onRemoveQueueItem: (cityId, index) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({
          ...deps.session.getState(),
          cities: {
            ...deps.session.getState().cities,
            [cityId]: {
              ...targetCity,
              productionQueue: removeQueuedId(targetCity.productionQueue, index),
              productionProgress: index === 0 ? 0 : targetCity.productionProgress,
            },
          },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        return deps.session.getState();
      },
      onOpenWonderPanel: (selectedCityId) => {
        openWonderPanelForCityId(selectedCityId);
      },
      onSetCityFocus: (cityId, focus) => {
        const result = assignCityFocus(deps.session.getState(), cityId, focus);
        deps.session.commit(result.state);
        deps.showNotification(`${deps.session.getState().cities[cityId].name} reassigned citizens for ${focus} focus.`, 'info');
        return deps.session.getState();
      },
      onToggleWorkedTile: (cityId, coord, worked) => {
        const result = setCityWorkedTile(deps.session.getState(), cityId, coord, worked);
        deps.session.commit(result.state);
        if (!result.changed && result.reason === 'claimed') {
          deps.showNotification('That tile is already worked by another city.', 'warning');
        }
        return deps.session.getState();
      },
      onClose: () => {},
      onTip: (message) => { deps.showNotification(message, 'info'); },
      onSelectUnit: (unitId) => deps.selectionController.selectUnit(unitId),
      onEstablishRoute: deps.diplomacyActions.handleEstablishRoute,
      onPrevCity: () => {
        const cities = deps.currentCiv().cities;
        if (cities.length <= 1) return;
        const currentIdx = cities.indexOf(city.id);
        const prevIdx = (currentIdx - 1 + cities.length) % cities.length;
        const prevCity = deps.session.getState().cities[cities[prevIdx]];
        if (prevCity) openCityPanelForCity(prevCity);
      },
      onNextCity: () => {
        const cities = deps.currentCiv().cities;
        if (cities.length <= 1) return;
        const currentIdx = cities.indexOf(city.id);
        const nextIdx = (currentIdx + 1) % cities.length;
        const nextCity = deps.session.getState().cities[cities[nextIdx]];
        if (nextCity) openCityPanelForCity(nextCity);
      },
      onUpgradeUnit: (unitId) => {
        const unit = deps.session.getState().units[unitId];
        if (!unit || unit.owner !== deps.session.getState().currentPlayer) return;
        const targetType = TRAINABLE_UNITS.find(entry => entry.type === unit.type)?.upgradesTo;
        if (!targetType) return;
        const upgrade = evaluateUnitUpgrade(deps.session.getState(), unitId, targetType);
        if (!upgrade.canUpgrade || !upgrade.targetType) return;
        if (deps.executeUpgrade(unitId, upgrade.targetType)) {
          deps.showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
        }
      },
      onSetIdleProduction: (cityId, mode) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: setIdleProduction(targetCity, mode) } });
        deps.renderLoop.setGameState(deps.session.getState());
        return deps.session.getState();
      },
      onRushBuyActiveProduction: (cityId) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return deps.session.getState();
        const result = rushBuyActiveProduction(deps.session.getState(), deps.session.getState().currentPlayer, cityId, deps.bus);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(`${targetCity.name}: rush bought ${result.label} for ${result.cost} gold.`, 'success');
        return deps.session.getState();
      },
      onAppeaseFaction: (cityId) => deps.diplomacyActions.handleAppeaseFaction(cityId),
      onConcedeToMovement: (cityId) => deps.diplomacyActions.handleConcedeToMovement(cityId),
      onQuarantineCrisis: (crisisId, cityId) => {
        const result = applyQuarantine(deps.session.getState(), crisisId, cityId);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(result.message, 'success');
        return deps.session.getState();
      },
      onRemedyCrisis: (crisisId, cityId) => {
        const result = applyRemedy(deps.session.getState(), crisisId, cityId);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        deps.session.commit(result.state);
        deps.showNotification(result.message, 'success');
        return deps.session.getState();
      },
      onEmpireContainment: (crisisId) => {
        const result = applyEmpireContainment(deps.session.getState(), crisisId, deps.bus);
        if (!result.success) {
          deps.showNotification(result.message, 'warning');
          return deps.session.getState();
        }
        // Success feedback comes from the crisis:contained event via routeCrisisContained
        // (delivered immediately to the acting player, queued for a non-active hot-seat
        // player) — a showNotification here would double it.
        deps.session.commit(result.state);
        return deps.session.getState();
      },
      onFindResources: (highlights, toasts) => {
        deps.renderLoop.setHighlights(highlights.map(coord => ({ coord, type: 'worker-buildable' as const })));
        for (const t of toasts) deps.showNotification(t.message, t.type);
      },
      onChooseCircularManufacturingMaterial: (material) => {
        try {
          deps.session.setStateWithoutRefresh(chooseCircularManufacturingMaterial(deps.session.getState(), deps.session.getState().currentPlayer, material));
        } catch (error) {
          deps.showNotification(error instanceof Error ? error.message : 'That material choice is unavailable.', 'warning');
          return;
        }
        deps.renderLoop.setGameState(deps.session.getState());
        deps.showNotification(`Circular Manufacturing Network will substitute ${material.replaceAll('-', ' ')} when it helps.`, 'success');
        const refreshedCity = deps.session.getState().cities[city.id];
        if (refreshedCity) openCityPanelForCity(refreshedCity);
      },
    });
  }

  function openEspionagePanel(): void {
    deps.hud.closeDrawer();
    const chooseForeignCityTarget = (): { civId: string; cityId: string; position: HexCoord } | null => {
      const choices = Object.values(deps.session.getState().cities)
        .filter(city => city.owner !== deps.session.getState().currentPlayer)
        .sort((a, b) => a.name.localeCompare(b.name));
      if (choices.length === 0) {
        deps.showNotification('No foreign cities available for espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose target city by id:\n${choices.map(city => `${city.id} (${city.owner})`).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = deps.session.getState().cities[selection];
      if (!city || city.owner === deps.session.getState().currentPlayer) {
        deps.showNotification('Invalid espionage target.', 'warning');
        return null;
      }
      return { civId: city.owner, cityId: city.id, position: city.position };
    };

    const chooseFriendlyCityTarget = (): { cityId: string; position: HexCoord } | null => {
      const choices = deps.currentCiv().cities
        .map(cityId => deps.session.getState().cities[cityId])
        .filter((city): city is NonNullable<GameState['cities'][string]> => city !== undefined);
      if (choices.length === 0) {
        deps.showNotification('No cities available for defensive espionage.', 'info');
        return null;
      }
      const selection = window.prompt(
        `Choose friendly city by id:\n${choices.map(city => city.id).join('\n')}`,
        choices[0].id,
      );
      if (!selection) return null;
      const city = deps.session.getState().cities[selection];
      if (!city || city.owner !== deps.session.getState().currentPlayer) {
        deps.showNotification('Invalid defensive target.', 'warning');
        return null;
      }
      return { cityId: city.id, position: city.position };
    };

    const chooseMission = (spyId: string): SpyMissionType | null => {
      const spy = deps.session.getState().espionage?.[deps.session.getState().currentPlayer]?.spies[spyId];
      const completedTechs = deps.currentCiv().techState.completed ?? [];
      // #524 MR2a review fix: flip_loyalty can never succeed against a capital (see
      // resolveMissionResult's guard in espionage-system.ts) -- don't offer it as a
      // choice when the spy's current target already is one. Without this, a spy
      // stationed in an enemy capital could "succeed" an 8-turn flip_loyalty mission
      // that silently does nothing, with no explanation.
      const spyTargetsCapital = Boolean(
        spy?.targetCivId && spy.targetCityId
          && getCapitalCityId(deps.session.getState(), spy.targetCivId) === spy.targetCityId,
      );
      const missions = getAvailableMissions(completedTechs)
        .filter(mission => !missionRequiresPlacedSpy(mission) || Boolean(spy?.targetCivId))
        .filter(mission => mission !== 'flip_loyalty' || !spyTargetsCapital);
      if (missions.length === 0) {
        deps.showNotification('No missions available for this spy.', 'info');
        return null;
      }
      // `window.prompt` always returns a plain string -- cast once here to the real
      // union type instead of casting at each downstream use site with `as any`.
      return window.prompt(`Choose mission:\n${missions.join('\n')}`, missions[0]) as SpyMissionType | null;
    };

    deps.uiLayer.appendChild(createEspionagePanel(deps.session.getState(), {
      onClose: () => deps.getElementById('espionage-panel')?.remove(),
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        const currentPlayer = deps.session.getState().currentPlayer;
        const unit = deps.session.getState().units[spyId];
        const nextEspionage = {
          ...deps.session.getState().espionage,
          [currentPlayer]: embedSpy(deps.session.getState().espionage![currentPlayer], spyId, target.cityId, target.position),
        };
        let nextUnits = deps.session.getState().units;
        let nextCivilizations = deps.session.getState().civilizations;
        if (unit) {
          const { [spyId]: _removed, ...remainingUnits } = nextUnits;
          nextUnits = remainingUnits;
          nextCivilizations = {
            ...nextCivilizations,
            [currentPlayer]: { ...nextCivilizations[currentPlayer], units: nextCivilizations[currentPlayer].units.filter(id => id !== spyId) },
          };
        }
        deps.session.commit({ ...deps.session.getState(), espionage: nextEspionage, units: nextUnits, civilizations: nextCivilizations });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        const cityName = deps.session.getState().cities[target.cityId]?.name ?? target.cityId;
        deps.showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
      },
      onStartMission: (spyId) => {
        const spy = deps.session.getState().espionage?.[deps.session.getState().currentPlayer]?.spies[spyId];
        if (!spy) return;
        const mission = chooseMission(spyId);
        if (!mission) return;
        let targetCivId = spy.targetCivId ?? undefined;
        let targetCityId = spy.targetCityId ?? undefined;
        if (!missionRequiresPlacedSpy(mission)) {
          const target = chooseForeignCityTarget();
          if (!target) return;
          targetCivId = target.civId;
          targetCityId = target.cityId;
        }
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: {
            ...deps.session.getState().espionage,
            [currentPlayer]: startMission(deps.session.getState().espionage![currentPlayer], spyId, mission, deps.currentCivDef()?.bonusEffect, targetCivId, targetCityId),
          },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        deps.showNotification(`Mission ${mission} started.`, 'info');
      },
      onRecall: (spyId) => {
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: recallSpy(deps.session.getState().espionage![currentPlayer], spyId) },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        deps.showNotification('Spy recalled.', 'info');
      },
      onVerifyAgent: (spyId) => {
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: verifyAgent(deps.session.getState().espionage![currentPlayer], spyId) },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        deps.showNotification('Agent verified and cleared.', 'success');
      },
      onExfiltrate: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(deps.session.getState(), deps.session.getState().currentPlayer);
        if (!capital) { deps.showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        // Spawn occupancy: find a free tile at/near the capital
        const existingPositions = new Set(
          Object.values(deps.session.getState().units).map(u => `${u.position.q},${u.position.r}`),
        );
        let spawnPos = capital.position;
        if (existingPositions.has(`${spawnPos.q},${spawnPos.r}`)) {
          const adjacent = hexesInRange(capital.position, 1).filter(
            c => !(c.q === capital.position.q && c.r === capital.position.r) &&
                 !existingPositions.has(`${c.q},${c.r}`) &&
                 deps.session.getState().map.tiles[hexKey(c)],
          );
          if (adjacent.length === 0) {
            deps.showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
            return;
          }
          spawnPos = adjacent[0];
        }

        const currentPlayer = deps.session.getState().currentPlayer;
        const newUnit = createUnit(spy.unitType, currentPlayer, spawnPos, deps.session.getState().idCounters);
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        deps.session.commit({
          ...deps.session.getState(),
          units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
          civilizations: {
            ...deps.session.getState().civilizations,
            [currentPlayer]: { ...deps.session.getState().civilizations[currentPlayer], units: [...(deps.session.getState().civilizations[currentPlayer].units ?? []), newUnit.id] },
          },
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } } },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        // Refresh panel in place
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
      onToggleCooldownMode: (spyId) => {
        const civEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = civEsp?.spies[spyId];
        if (!spy || spy.status !== 'cooldown') return;
        const next: 'stay_low' | 'passive_observe' =
          (spy.cooldownMode ?? 'stay_low') === 'passive_observe' ? 'stay_low' : 'passive_observe';
        deps.session.commit({
          ...deps.session.getState(),
          espionage: {
            ...deps.session.getState().espionage!,
            [deps.session.getState().currentPlayer]: {
              ...civEsp!,
              spies: { ...civEsp!.spies, [spyId]: { ...spy, cooldownMode: next } },
            },
          },
        });
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
      },
      onUnembed: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = deps.session.getState().cities[spy.targetCityId];
        if (!city) return;
        const currentPlayer = deps.session.getState().currentPlayer;
        const newUnit = createUnit(spy.unitType, currentPlayer, city.position, deps.session.getState().idCounters);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        deps.session.commit({
          ...deps.session.getState(),
          units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
          civilizations: {
            ...deps.session.getState().civilizations,
            [currentPlayer]: { ...deps.session.getState().civilizations[currentPlayer], units: [...deps.session.getState().civilizations[currentPlayer].units, newUnit.id] },
          },
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } } },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
      onSweep: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        if (!ownerEsp) return;
        const seed = `sweep-${spyId}-${deps.session.getState().turn}`;
        const { detectedSpyIds, state: updatedEsp } = attemptSweep(ownerEsp, spyId, seed, deps.session.getState());
        deps.session.commit({ ...deps.session.getState(), espionage: { ...deps.session.getState().espionage, [deps.session.getState().currentPlayer]: updatedEsp } });
        if (detectedSpyIds.length > 0) {
          deps.showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
        } else {
          deps.showNotification('Sweep complete — no enemy spies detected.', 'info');
        }
        deps.renderLoop.setGameState(deps.session.getState());
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
      },
    }));
  }

  return {
    openPacingDebugPanel,
    openBestiary,
    openHallOfFame,
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
    openCityPanelForCity,
    openEspionagePanel,
    openStrategicArsenalPanel,
  };
}
