/**
 * Owns campaign entry: the start/save panel, new-game mode selection, and
 * `enterCampaign`'s hot-seat-handoff-aware game-start ritual (#787 phase 10).
 *
 * `startGame` (GameSessionController) and this controller are mutually
 * referential -- `showGameModeSelection`'s solo path calls `startGame()`
 * directly, and `GameSessionController.init()` calls this controller's
 * `showStartSavePanel()`. The composition root breaks the cycle with the
 * same deferred-but-eager `let` + wrapper-closure pattern `main.ts` already
 * used for `router`/`notifier` before this phase: `startGame` is passed in
 * as a thunk that resolves to the real controller once both exist.
 *
 * Everything this file calls that is a pure `@/systems/*`, `@/core/*`,
 * `@/storage/*`, or `@/ui/*` helper is imported directly, matching the
 * precedent set by `TurnFlowController`/`SelectionController`. Only
 * concrete platform services and the main.ts-local functions this phase
 * does NOT move (`showNotification`) are threaded through as deps.
 */
import type { EventBus } from '@/core/event-bus';
import type { AudioSystem } from '@/audio/audio-system';
import type { GameState, MapScript } from '@/core/types';
import { isGeographicMapScript, isGeoMapDataLoaded, loadGeoMapData } from '@/systems/geo-map-data';
import type { GameSession, UnpublishedStateWriter } from '@/app/ports';
import type { PanelHost } from '@/app/panel-host';
import type { UserSettingsStore } from '@/app/user-settings-store';
import type { TurnFlowController } from '@/app/controllers/turn-flow-controller';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import {
  autoSave,
  loadMostRecentAutoSaveEntry,
  loadSaveEntry,
  rewriteLoadedSaveEntry,
} from '@/storage/save-manager';
import { applyPersistedUserSettings, applyCouncilTalkLevelOverride } from '@/storage/settings-merge';
import { createSavePanel } from '@/ui/save-panel';
import { showGameModeSelect } from '@/ui/game-mode-select';
import { showCampaignSetup } from '@/ui/campaign-setup';
import { showHotSeatSetup } from '@/ui/hotseat-setup';
import { showLegacyOpponentChallengePrompt } from '@/ui/legacy-opponent-challenge-prompt';
import { beginCampaignEntry } from '@/ui/campaign-entry-flow';
import { acknowledgeTurnHandoffSummary, showTurnHandoff } from '@/ui/turn-handoff';

export interface CampaignEntryController {
  enterCampaign(state: GameState, message: string, persistBeforeReady?: boolean): Promise<void> | null;
  enterCampaignForE2E(state: GameState): Promise<void>;
  showStartSavePanel(): Promise<void>;
  showGameModeSelection(): void;
}

export interface CampaignEntryControllerDeps {
  readonly session: GameSession;
  /** #1015: `pre-world-entry` / `viewer-not-yet-revealed` are the only reasons this controller may write silently. */
  readonly unpublished: UnpublishedStateWriter;
  readonly uiLayer: HTMLDivElement;
  readonly audio: Pick<AudioSystem, 'setMasterVolume'>;
  readonly bus: EventBus;
  readonly roundPresentationGate: RoundPresentationGate;
  readonly host: Pick<PanelHost, 'setBlockingOverlay'>;
  readonly turnFlow: Pick<TurnFlowController, 'handleVictoryIfNeeded' | 'closeNetworkPanelsForHandoff'>;
  readonly userSettingsStore: Pick<UserSettingsStore, 'getPersisted' | 'refresh' | 'getMasterVolume' | 'setCustomCivilizations' | 'getOverrides'>;
  readonly getElementById: (id: string) => HTMLElement | null;
  readonly showNotification: (message: string, type?: 'info' | 'success' | 'warning') => void;
  /** Forward reference to `GameSessionController.startGame` -- see file docblock. */
  readonly startGame: () => Promise<void>;
  readonly reloadPage: () => void;
}

export function createCampaignEntryController(deps: CampaignEntryControllerDeps): CampaignEntryController {
  function enterCampaign(
    state: GameState,
    message: string,
    persistBeforeReady: boolean = false,
  ): Promise<void> | null {
    deps.getElementById('save-panel')?.remove();
    deps.unpublished.adopt(applyPersistedUserSettings(state, deps.userSettingsStore.getPersisted()), 'pre-world-entry');
    if (deps.session.getState().gameOver) {
      const spritesReady = deps.startGame();
      deps.turnFlow.handleVictoryIfNeeded();
      return spritesReady;
    }
    const hotSeat = deps.session.getState().hotSeat;
    if (!hotSeat) {
      const spritesReady = deps.startGame();
      deps.showNotification(message, 'info');
      return spritesReady;
    }

    deps.audio.setMasterVolume(0);
    deps.turnFlow.closeNetworkPanelsForHandoff();
    const player = hotSeat.players.find(candidate => candidate.slotId === deps.session.getState().currentPlayer);
    deps.host.setBlockingOverlay('turn-handoff');
    deps.roundPresentationGate.suppress();
    const controller = showTurnHandoff(
      deps.uiLayer,
      deps.session.getState(),
      deps.session.getState().currentPlayer,
      player?.name ?? 'Player',
      {
        initiallyReady: !persistBeforeReady,
        preparingLabel: 'Saving campaign…',
        onReady: async summary => {
          const viewerId = deps.session.getState().currentPlayer;
          const acknowledgement = acknowledgeTurnHandoffSummary(
            deps.session.getState(),
            viewerId,
            summary,
          );
          deps.unpublished.adopt(acknowledgement.state, 'viewer-not-yet-revealed');
          try {
            await autoSave(deps.session.getState());
          } catch {
            // Entry persistence already succeeded; acknowledgement may safely retry later.
          }
          deps.roundPresentationGate.resume();
          deps.host.setBlockingOverlay(null);
          deps.startGame();
          deps.audio.setMasterVolume(deps.userSettingsStore.getMasterVolume());
          if (acknowledgement.playStrategicWarningAudio) {
            deps.bus.emit('ai:strategic-warning-audio', {
              viewerId,
              turn: summary.turn,
            });
          }
          deps.showNotification(message, 'info');
        },
      },
    );

    if (!persistBeforeReady) return null;
    const persist = async (): Promise<void> => {
      try {
        await autoSave(deps.session.getState());
        controller.setReady(deps.session.getState());
      } catch {
        controller.setError(
          'The campaign could not be saved. Retry before opening the first turn.',
          {
            onRetry: () => void persist(),
            onReturnToSaves: () => {
              deps.roundPresentationGate.resume();
              deps.reloadPage();
            },
          },
        );
      }
    };
    void persist();
    return null;
  }

  function enterCampaignForE2E(state: GameState): Promise<void> {
    if (state.hotSeat) throw new Error('E2E direct entry does not bypass hot-seat handoff.');
    const spritesReady = enterCampaign(state, `Welcome back! Turn ${state.turn}`);
    if (!spritesReady) throw new Error('E2E direct entry requires a solo campaign.');
    return spritesReady;
  }

  async function showStartSavePanel(): Promise<void> {
    await createSavePanel(deps.uiLayer, {
      onNewGame: () => {
        showGameModeSelection();
      },
      onContinue: async invoker => {
        const loaded = await loadMostRecentAutoSaveEntry();
        if (!loaded) throw new Error('Autosave no longer exists.');
        await beginCampaignEntry(
          { kind: 'stored', loaded },
          invoker,
          {
            persistStoredChoice: rewriteLoadedSaveEntry,
            persistImport: autoSave,
            showChallengePrompt: showLegacyOpponentChallengePrompt,
            onReady: state => enterCampaign(state, `Welcome back! Turn ${state.turn}`),
          },
        );
      },
      onLoadEntry: async (source, invoker) => {
        const loaded = await loadSaveEntry(source);
        if (!loaded) throw new Error('Save no longer exists.');
        await beginCampaignEntry(
          { kind: 'stored', loaded },
          invoker,
          {
            persistStoredChoice: rewriteLoadedSaveEntry,
            persistImport: autoSave,
            showChallengePrompt: showLegacyOpponentChallengePrompt,
            onReady: state => enterCampaign(state, `Game loaded! Turn ${state.turn}`),
          },
        );
      },
      onImportSave: async (state, invoker) => {
        await beginCampaignEntry(
          { kind: 'import', state },
          invoker,
          {
            persistStoredChoice: rewriteLoadedSaveEntry,
            persistImport: autoSave,
            showChallengePrompt: showLegacyOpponentChallengePrompt,
            onReady: readyState => enterCampaign(
              readyState,
              `Save imported! Turn ${readyState.turn}`,
            ),
          },
        );
      },
    });
  }

  /**
   * Geographic maps need their tile/river data loaded before the synchronous game constructors run (#1456).
   * A map that needs no load starts immediately and synchronously, exactly as before; otherwise the load is
   * returned so the setup screen can show its busy state, and the game is created only once it has resolved.
   * `loadGeoMapData` is single-flight per script and clears a failed flight, so pressing Start again retries.
   */
  /**
   * While the player is still choosing, start fetching the selected geographic map in the background so pressing
   * Start finds it ready. Best effort: a failure here is silent, and Start asks again (a failed fetch leaves no
   * memory, see geo-map-data.ts), so the player only ever sees an error from a Start they actually pressed.
   */
  function prefetchGeoMapData(mapScript: MapScript): void {
    if (isGeographicMapScript(mapScript) && !isGeoMapDataLoaded(mapScript)) {
      loadGeoMapData(mapScript).catch(() => {});
    }
  }

  let pendingGeoStart: Promise<void> | null = null;
  function startAfterGeoMapData(mapScript: MapScript | undefined, start: () => void): void | Promise<void> {
    if (!isGeographicMapScript(mapScript) || isGeoMapDataLoaded(mapScript)) {
      start();
      return;
    }
    // Single flight at the owner: a second request while one is loading shares it and cannot create a second game.
    if (pendingGeoStart) return pendingGeoStart;
    const flight = loadGeoMapData(mapScript).then(start).finally(() => { pendingGeoStart = null; });
    pendingGeoStart = flight;
    return flight;
  }

  function showGameModeSelection(): void {
    let modePanel: HTMLElement;

    modePanel = showGameModeSelect(deps.uiLayer, {
      initialTitle: 'New Campaign',
      // Back returns to the main menu. It used to do nothing, leaving a blank map with no way forward but a reload.
      onCancel: () => { void showStartSavePanel(); },
      onTitleRequired: () => {
        deps.showNotification('Campaign title is required', 'warning');
      },
      onChooseSolo: async (title) => {
        const currentSettings = await deps.userSettingsStore.refresh();
        const savedCustomCivilizations = currentSettings.customCivilizations ?? [];
        modePanel.remove();
        showCampaignSetup(deps.uiLayer, {
          initialTitle: title,
          onStartSolo: (config) => {
            const start = (): void => {
              const newGame = createNewGame({
                civType: config.civType,
                mapSize: config.mapSize,
                opponentCount: config.opponentCount,
                gameTitle: config.gameTitle,
                // Merge: persisted A/V settings first, then per-game setup choices (e.g. beastsMode) win
                settingsOverrides: { ...deps.userSettingsStore.getOverrides(), ...config.settingsOverrides },
                customCivilizations: config.customCivilizations,
                seed: config.seed,
                mapScript: config.mapScript,
                startPlacementMode: config.startPlacementMode,
                opponentChallenge: config.opponentChallenge,
              });
              deps.unpublished.adopt(applyCouncilTalkLevelOverride(newGame, currentSettings.councilTalkLevel), 'pre-world-entry');
              deps.startGame();
            };
            return startAfterGeoMapData(config.mapScript, start);
          },
          onMapScriptChosen: prefetchGeoMapData,
          onCustomCivilizationsChanged: (customCivilizations) => {
            deps.userSettingsStore.setCustomCivilizations(customCivilizations);
          },
          onCancel: () => showGameModeSelection(),
        }, {
          initialCustomCivilizations: savedCustomCivilizations,
        });
      },
      onChooseHotSeat: async (title) => {
        const currentSettings = await deps.userSettingsStore.refresh();
        const savedCustomCivilizations = currentSettings.customCivilizations ?? [];
        modePanel.remove();
        showHotSeatSetup(deps.uiLayer, {
          onComplete: (config, opponentChallenge) => {
            const start = (): void => {
              const newGame = createHotSeatGame(config, undefined, title, opponentChallenge ?? 'standard');
              deps.unpublished.adopt(applyCouncilTalkLevelOverride(newGame, currentSettings.councilTalkLevel), 'pre-world-entry');
              enterCampaign(
                deps.session.getState(),
                `Hot seat game started! ${config.players.filter(p => p.isHuman).length} players`,
                true,
              );
            };
            return startAfterGeoMapData(config.mapScript, start);
          },
          onMapScriptChosen: prefetchGeoMapData,
          onCustomCivilizationsChanged: (customCivilizations) => {
            deps.userSettingsStore.setCustomCivilizations(customCivilizations);
          },
          onCancel: () => {
            showGameModeSelection();
          },
        }, {
          initialCustomCivilizations: savedCustomCivilizations,
        });
      },
    });
  }

  return { enterCampaign, enterCampaignForE2E, showStartSavePanel, showGameModeSelection };
}
