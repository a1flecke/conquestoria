/**
 * Owns app startup and the main game loop's one-time setup: `init`,
 * `createUI`, `startGame`, the `inputInitialized` construct-once guard, and
 * the window resize listener (#787 phase 10).
 *
 * `router`, `notifier`, and several sibling controllers are constructed
 * elsewhere in `main.ts` with forward-reference cycles this controller sits
 * inside (`createUI`'s callbacks call `router.open(...)` before `router`
 * itself is assigned; `init()` constructs the real `Notifier` and must
 * publish it back to every other main.ts-local consumer that already holds
 * a lazy getter for it). Both are resolved with `main.ts`'s existing
 * deferred-but-eager pattern: `router` arrives as a thin wrapper closing
 * over the outer `let`, and `notifier` is published back via `setNotifier`
 * rather than this controller owning the binding itself (main.ts keeps
 * that `let`, matching Phase 10b's decision to defer the rest of the
 * composition-root move).
 *
 * Everything this file calls that is a pure `@/systems/*`, `@/core/*`,
 * `@/renderer/*`, `@/input/*`, `@/storage/*`, or `@/ui/*` helper is imported
 * directly, matching the precedent set by every prior controller in this
 * arc. Only concrete platform services, sibling controllers, and the
 * main.ts-local functions this phase does NOT move are threaded through as
 * deps.
 */
import type { RenderLoop } from '@/renderer/render-loop';
import type { AudioSystem } from '@/audio/audio-system';
import type { EventBus } from '@/core/event-bus';
import type { AdvisorSystem } from '@/ui/advisor-system';
import type { GameSession, SelectionStore, Notifier } from '@/app/ports';
import type { PanelHost } from '@/app/panel-host';
import type { PanelRouter } from '@/app/panel-router';
import type { UserSettingsStore } from '@/app/user-settings-store';
import type { TurnFlowController } from '@/app/controllers/turn-flow-controller';
import type { MapInteractionController } from '@/app/controllers/map-interaction-controller';
import type { SelectionController } from '@/app/controllers/selection-controller';
import type { HudController } from '@/app/controllers/hud-controller';
import type { CampaignEntryController } from '@/app/controllers/campaign-entry-controller';
import type { GameState } from '@/core/types';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { createGameShell } from '@/ui/game-shell';
import { createNotificationCenter } from '@/ui/notification-center';
import { createIconLegendOverlay } from '@/ui/icon-legend';
import { showPauseMenu } from '@/ui/pause-menu-panel';
import { TouchHandler, type InputCallbacks } from '@/input/touch-handler';
import { MouseHandler } from '@/input/mouse-handler';
import { installKeyboardShortcuts } from '@/input/keyboard-shortcuts';
import { hexToPixel } from '@/systems/hex-utils';
import { fortifyUnitInState, unfortifyUnitInState } from '@/systems/unit-lifecycle-system';
import { initSprites } from '@/renderer/sprites/sprite-loader';
import { preloadOutpostMarker } from '@/renderer/improvements/resource-outpost-marker';
import { preloadFamineBadgeMarker } from '@/renderer/improvements/famine-badge-marker';
import { preloadReligionBadgeMarker } from '@/renderer/improvements/religion-badge-marker';
import { preloadRailSegment } from '@/renderer/improvements/rail-segment-loader';
import { preloadTerrainTiles } from '@/renderer/terrain/terrain-tile-loader';
import { preloadNaturalWonderTiles } from '@/renderer/terrain/wonder-tile-loader';
import { getVisibleCityBadgeSlots, getVisibleHexViewportCopies } from '@/renderer/city-renderer';
import { autoSave, loadMostRecentAutoSaveEntry, saveGame } from '@/storage/save-manager';
import { SFX, routeSfxThrough } from '@/audio/sfx';
import { installGlobalShortcuts } from '@/app/global-shortcuts';
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';
import { initializeDesktopMenu } from '@/platform/desktop-menu';
import { resolveOpponentChallenge, setPendingOpponentChallenge, resolveChallengeForCiv, setPendingChallengeForCiv } from '@/core/opponent-challenge';
import { resolveSuperweaponsFlag } from '@/systems/superweapons-flag';

/** The narrow slice of `RenderLoop` this controller needs. */
export type GameSessionRenderer = Pick<RenderLoop, 'setGameState' | 'setTouchHandler' | 'start' | 'resizeCanvas' | 'toggleSupplyOverlay' | 'isSupplyOverlayEnabled'> & {
  readonly camera: RenderLoop['camera'];
};

/** The narrow slice of `AudioSystem` this controller needs. */
export type GameSessionAudio = Pick<
  AudioSystem,
  'start' | 'setMasterVolume' | 'getSfxRoutingNode' | 'setMusicVolume' | 'setSfxVolume'
  | 'setStingerVolume' | 'setMusicEnabled' | 'setSfxEnabled' | 'setStingerEnabled' | 'playReligionStinger'
>;

export interface GameSessionController {
  init(): Promise<void>;
  createUI(): void;
  startGame(): Promise<void>;
}

export interface GameSessionControllerDeps {
  readonly session: GameSession;
  readonly selection: SelectionStore;
  readonly renderLoop: GameSessionRenderer;
  readonly audio: GameSessionAudio;
  readonly bus: EventBus;
  readonly canvas: HTMLCanvasElement;
  readonly uiLayer: HTMLDivElement;
  readonly documentRef: Document;
  readonly host: Pick<PanelHost, 'isInteractionBlocked'>;
  /** Lazy wrapper over the outer `let router` -- see file docblock. */
  readonly router: PanelRouter;
  readonly roundPresentationGate: RoundPresentationGate;
  readonly advisorSystem: Pick<AdvisorSystem, 'check'>;
  readonly userSettingsStore: Pick<UserSettingsStore, 'getMasterVolume' | 'setMasterVolume' | 'refresh'>;
  readonly turnFlow: Pick<
    TurnFlowController,
    'centerOnCurrentPlayer' | 'maybeShowCouncilInterrupt' | 'endTurn'
    | 'emitCurrentPlayerAudioSnapshot' | 'showRequiredChoicesIfNeeded'
  >;
  readonly mapInteraction: Pick<MapInteractionController, 'handleHexTap' | 'handleHexLongPress'>;
  readonly selectionController: Pick<SelectionController, 'selectNextUnit' | 'selectUnit'>;
  readonly hud: HudController;
  readonly campaignEntry: Pick<CampaignEntryController, 'showStartSavePanel' | 'showGameModeSelection' | 'enterCampaignForE2E' | 'enterCampaign'>;
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  /** Phase 13's future home -- passed as a dep until `PlayerActionController` exists. */
  readonly foundCityAction: () => void;
  /** Phase 10b's future home -- passed as a dep until it gets a controller. */
  readonly maybeShowPendingHoardChoice: () => void;
  /** #544 MR3: mirrors maybeShowPendingHoardChoice's shape/call site exactly. */
  readonly maybeShowPendingGeneralChoice: () => void;
  /** Publishes the `Notifier` `init()` constructs back to main.ts's own `let notifier`. */
  readonly setNotifier: (notifier: Notifier) => void;
  readonly focusNotificationTarget: (target: Parameters<Notifier['toast']>[2]) => void;
}

export function createGameSessionController(deps: GameSessionControllerDeps): GameSessionController {
  let inputInitialized = false;

  function createUI(): void {
    createGameShell(deps.uiLayer, {
      onOpenCouncil: () => deps.router.open('council'),
      onOpenTech: () => deps.router.open('tech'),
      onOpenCity: () => deps.router.open('city-overview'),
      onOpenEspionage: () => deps.router.open('espionage'),
      onOpenDiplomacy: () => deps.router.open('diplomacy'),
      onOpenMarketplace: () => deps.router.open('marketplace'),
      onEndTurn: () => deps.turnFlow.endTurn(),
      onNextUnit: () => deps.selectionController.selectNextUnit(),
      onOpenNotificationLog: () => deps.router.toggle('notification-log'),
      onOpenPirateWaters: () => deps.router.open('pirate-waters'),
      onToggleIconLegend: () => {
        const existing = deps.getElementById('icon-legend');
        if (existing && existing.style.display !== 'none') {
          // Already visible — hide it
          existing.style.display = 'none';
          return;
        }
        // Stale or absent — remove old, rebuild fresh with current techs
        existing?.remove();
        const viewerTechs = new Set<string>(
          deps.session.getState().civilizations[deps.session.getState().currentPlayer]?.techState.completed ?? []
        );
        const overlay = createIconLegendOverlay(viewerTechs);
        deps.uiLayer.appendChild(overlay);
      },
      onOpenWonderAtlas: () => deps.router.open('wonder-atlas'),
      onOpenHallOfFame: () => deps.router.open('hall-of-fame'),
      supplyOverlayEnabled: deps.renderLoop.isSupplyOverlayEnabled(),
      onToggleSupplyOverlay: () => deps.renderLoop.toggleSupplyOverlay(),
      onBottomBarHeightChange: height => deps.hud.setMapViewportBottomInset(height),
      onOpenMenu: () => {
        showPauseMenu(deps.uiLayer, {
          turn: deps.session.getState().turn,
          civName: deps.session.getState().civilizations[deps.session.getState().currentPlayer].name,
          onResume: () => {},
          onSave: async (slotId, name) => {
            await saveGame(slotId, name, deps.session.getState());
            deps.showNotification('Game saved.', 'info');
          },
          onNewGame: () => deps.campaignEntry.showGameModeSelection(),
          autoSave: () => autoSave(deps.session.getState()),
          onOpenBestiary: () => deps.router.open('bestiary'),
          opponentChallenge: resolveOpponentChallenge(deps.session.getState()),
          pendingOpponentChallenge: deps.session.getState().pendingOpponentChallenge,
          onOpponentChallengeChange: (challenge) => {
            deps.session.setStateWithoutRefresh(setPendingOpponentChallenge(deps.session.getState(), challenge));
          },
          personalChallenge: resolveChallengeForCiv(deps.session.getState(), deps.session.getState().currentPlayer),
          pendingPersonalChallenge: deps.session.getState().civilizations[deps.session.getState().currentPlayer]?.pendingChallenge,
          onPersonalChallengeChange: (challenge) => {
            deps.session.setStateWithoutRefresh(setPendingChallengeForCiv(deps.session.getState(), deps.session.getState().currentPlayer, challenge));
          },
          // Spec 3: per-channel audio settings
          audioSettings: {
            masterVolume:   deps.userSettingsStore.getMasterVolume(),   // tracked in memory across menu reopens
            musicVolume:    deps.session.getState().settings.musicVolume,
            sfxVolume:      deps.session.getState().settings.sfxVolume,
            stingerVolume:  deps.session.getState().settings.stingerVolume  ?? 1.0,
            musicEnabled:   deps.session.getState().settings.musicEnabled,
            soundEnabled:   deps.session.getState().settings.soundEnabled,
            stingerEnabled: deps.session.getState().settings.stingerEnabled ?? true,
          },
          onAudioSettingChange: (key, value) => {
            // Apply to audio system immediately — no restart needed
            switch (key) {
              case 'masterVolume':
                deps.userSettingsStore.setMasterVolume(value as number);
                deps.audio.setMasterVolume(value as number);
                return; // master not in GameSettings — skip the settings write below
              case 'musicVolume':    deps.audio.setMusicVolume(value as number);   break;
              case 'sfxVolume':      deps.audio.setSfxVolume(value as number);     break;
              case 'stingerVolume':  deps.audio.setStingerVolume(value as number); break;
              case 'musicEnabled':   deps.audio.setMusicEnabled(value as boolean); break;
              case 'soundEnabled':   deps.audio.setSfxEnabled(value as boolean);   break;
              case 'stingerEnabled': deps.audio.setStingerEnabled(value as boolean); break;
            }
            // Persist all non-master settings to GameSettings (saved on next save)
            (deps.session.getState().settings as unknown as Record<string, number | boolean>)[key] = value;
          },
          // #544 MR2: end-turn supply-warning delivery filter
          supplyWarningPreference: deps.session.getState().settings.supplyWarningPreference ?? 'all',
          onChangeSupplyWarningPreference: (preference) => {
            const state = deps.session.getState();
            deps.session.setStateWithoutRefresh({
              ...state,
              settings: { ...state.settings, supplyWarningPreference: preference },
            });
          },
          // #545 MR7: mid-game superweapons toggle
          superweaponsPreference: resolveSuperweaponsFlag(deps.session.getState().settings),
          onChangeSuperweaponsPreference: (preference) => {
            const state = deps.session.getState();
            deps.session.setStateWithoutRefresh({
              ...state,
              settings: { ...state.settings, superweapons: preference },
            });
          },
        });
      },
    });

    deps.hud.placeAirDefenseButton();
  }

  function startGame(): Promise<void> {
    deps.hud.ensureDrawerMounted();

    // Warm sprite cache non-blocking — renderers fall back to emoji while loading
    const civColors: Record<string, string> = {};
    for (const [civId, civ] of Object.entries(deps.session.getState().civilizations)) {
      civColors[civId] = civ.color;
    }
    const spritesReady = initSprites(civColors);
    void spritesReady.catch(() => {});
    preloadOutpostMarker().catch(() => {});
    preloadFamineBadgeMarker().catch(() => {});
    preloadReligionBadgeMarker().catch(() => {});
    preloadRailSegment().catch(() => {});
    preloadTerrainTiles().catch(() => {});
    preloadNaturalWonderTiles().catch(() => {});

    // Center camera on current player's starting position
    deps.turnFlow.centerOnCurrentPlayer();

    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
    deps.turnFlow.maybeShowCouncilInterrupt();
    deps.maybeShowPendingHoardChoice();
    deps.maybeShowPendingGeneralChoice();

    // Auto-save immediately so closing before turn 1 doesn't lose the game
    autoSave(deps.session.getState()).catch(() => {});

    // Input (only set up once)
    if (!inputInitialized) {
      deps.canvas.addEventListener('pointerdown', () => { if (deps.hud.isDrawerOpen()) deps.hud.closeDrawer(); });

      const callbacks: InputCallbacks = {
        onHexTap: deps.mapInteraction.handleHexTap,
        onHexLongPress: deps.mapInteraction.handleHexLongPress,
      };
      const touchHandler = new TouchHandler(deps.canvas, deps.renderLoop.camera, callbacks);
      deps.renderLoop.setTouchHandler(touchHandler);
      new MouseHandler(deps.canvas, deps.renderLoop.camera, callbacks, {
        canInteract: () => !deps.host.isInteractionBlocked(),
      });
      installKeyboardShortcuts(deps.documentRef, {
        onOpenCouncil: () => deps.router.open('council'),
        onOpenTech: () => deps.router.open('tech'),
        onEndTurn: () => { void deps.turnFlow.endTurn(); },
        getSelectedUnitId: () => deps.selection.getSelectedUnitId(),
        onCenterUnit: () => {
          const selectedUnitId = deps.selection.getSelectedUnitId();
          if (!selectedUnitId) return;
          const unit = deps.session.getState().units[selectedUnitId];
          if (unit) deps.renderLoop.camera.centerOn(unit.position);
        },
        onFortify: () => {
          const selectedUnitId = deps.selection.getSelectedUnitId();
          if (!selectedUnitId) return;
          const unit = deps.session.getState().units[selectedUnitId];
          if (!unit || unit.hasActed || unit.owner !== deps.session.getState().currentPlayer) return;
          if (unit.isFortified) {
            deps.session.setStateWithoutRefresh(unfortifyUnitInState(deps.session.getState(), deps.session.getState().currentPlayer, selectedUnitId));
            deps.showNotification('Unit unfortified.', 'info');
          } else {
            deps.session.setStateWithoutRefresh(fortifyUnitInState(deps.session.getState(), deps.session.getState().currentPlayer, selectedUnitId));
            deps.showNotification('Unit fortified. +25% defense until unfortified or moved.', 'info');
          }
          deps.renderLoop.setGameState(deps.session.getState());
          deps.hud.update();
          deps.selectionController.selectUnit(selectedUnitId);
        },
        onSettle: () => {
          const selectedUnitId = deps.selection.getSelectedUnitId();
          if (!selectedUnitId) return;
          const unit = deps.session.getState().units[selectedUnitId];
          if (!unit || unit.type !== 'settler') return;
          deps.foundCityAction();
        },
        onNextUnit: () => deps.selectionController.selectNextUnit(),
        onStartJourney: () => {
          const selectedUnitId = deps.selection.getSelectedUnitId();
          if (!selectedUnitId) return;
          deps.selection.setPendingIntent({ kind: 'journey', unitId: selectedUnitId });
          deps.showNotification('Tap a destination for this unit. Press Escape to cancel.', 'info');
        },
      }, {
        canHandle: () => !deps.host.isInteractionBlocked(),
      });
      inputInitialized = true;
    }

    deps.audio.start(
      deps.session.getState(),
      deps.bus,
      () => deps.session.getState(),
      () => deps.roundPresentationGate.isSuppressed(),
    );
    deps.audio.setMasterVolume(deps.userSettingsStore.getMasterVolume());
    routeSfxThrough(deps.audio.getSfxRoutingNode());
    deps.turnFlow.emitCurrentPlayerAudioSnapshot(deps.session.getState().currentPlayer);

    // Prevent zoom-out duplication: ensure the camera cannot zoom past one full
    // map-width. hexToPixel({q: width, r:0}).x equals the wrapSpan used in
    // wrap-rendering.ts, so minZoom = camera.width / wrapSpan guarantees the
    // visible world is never wider than one map copy.
    const mapWidthPx = hexToPixel({ q: deps.session.getState().map.width, r: 0 }, deps.renderLoop.camera.hexSize).x;
    deps.renderLoop.camera.setMinZoomForMap(mapWidthPx);

    // Initial advisor check
    deps.advisorSystem.check(deps.session.getState());
    deps.turnFlow.showRequiredChoicesIfNeeded();

    // Start render loop
    deps.renderLoop.start();
    return spritesReady;
  }

  async function init(): Promise<void> {
    await registerConquestoriaServiceWorker();
    await initializeDesktopMenu();

    window.addEventListener('resize', () => deps.renderLoop.resizeCanvas());

    createUI();
    // #notifications is created by createGameShell() inside createUI(), so notifier
    // can only be constructed here, not eagerly at module scope (#787 phase 4).
    const notifier = createNotificationCenter({
      layer: deps.getElementById('notifications') as HTMLElement,
      getState: () => deps.session.getState(),
      isSuppressed: () => deps.roundPresentationGate.isSuppressed(),
      playCue: (cue) => {
        // #594 MR7: religion toasts carry a bespoke sfxCue that replaces the generic
        // synth chime -- see notification-routing.ts's routeReligionFounded/
        // routeReligionCityConverted/routeLoyaltyWarning/routeCityDefected.
        if (cue) {
          void deps.audio.playReligionStinger(cue).catch(() => {});
        } else {
          SFX.notification();
        }
      },
      onFocusTarget: deps.focusNotificationTarget,
    });
    deps.setNotifier(notifier);
    // Needs the real `notifier`, so deferred here alongside it rather than
    // installed eagerly at module scope (#787 phase 5).
    installGlobalShortcuts({ target: window, selection: deps.selection, router: deps.router, notifier });
    await deps.userSettingsStore.refresh();

    // #846: developer scenario loader. import.meta.env.DEV is a Vite
    // compile-time constant (true for `vite`/`vite dev`, false for
    // `vite build`) -- this whole branch, and the dynamic imports inside it,
    // are dead code eliminated from the production bundle. Distinct from the
    // MODE === 'e2e' branch below: this is reachable under plain `yarn dev`,
    // not only the Playwright test build.
    if (import.meta.env.DEV) {
      const scenarioName = new URLSearchParams(window.location.search).get('scenario');
      if (scenarioName) {
        const { SCENARIOS } = await import('@/testing/scenarios');
        const definition = SCENARIOS[scenarioName];
        if (!definition) {
          throw new Error(`Unknown scenario "${scenarioName}". Known scenarios: ${Object.keys(SCENARIOS).join(', ')}`);
        }
        const { buildScenario } = await import('@/testing/scenario-builder');
        await deps.campaignEntry.enterCampaign(buildScenario(definition), `Scenario: ${definition.name}`);
        return;
      }
    }

    if (import.meta.env.MODE === 'e2e') {
      // Browser tests must target the same live camera transform as player input;
      // exposing only viewport copies keeps game state and camera internals private.
      window.__CONQUESTORIA_E2E_GET_VISIBLE_HEX_COPIES__ = coord => getVisibleHexViewportCopies(
        deps.session.getState(),
        deps.renderLoop.camera,
        deps.session.getState().currentPlayer,
        coord,
      );
      const { isExactAutosaveE2ERequest } = await import('@/testing/e2e-mode');
      if (isExactAutosaveE2ERequest(import.meta.env.MODE, window.location.search)) {
        const { installE2ERuntime } = await import('@/testing/e2e-runtime');
        await installE2ERuntime({
          loadAutosave: loadMostRecentAutoSaveEntry,
          enterSoloCampaign: (state: GameState) => deps.campaignEntry.enterCampaignForE2E(state),
          getVisibleHexCopies: coord => getVisibleHexViewportCopies(
            deps.session.getState(),
            deps.renderLoop.camera,
            deps.session.getState().currentPlayer,
            coord,
          ),
          getCityBadgeSlots: (cityId, slot) => getVisibleCityBadgeSlots(
            deps.session.getState(),
            deps.renderLoop.camera,
            deps.session.getState().currentPlayer,
            cityId,
            slot,
          ),
        });
        return;
      }
    }

    await deps.campaignEntry.showStartSavePanel();
  }

  return { init, createUI, startGame };
}
