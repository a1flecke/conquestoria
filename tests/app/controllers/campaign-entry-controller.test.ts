// @vitest-environment jsdom
import { describe, expect, it, vi, beforeAll, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState, HotSeatPlayer, SoloSetupConfig, HotSeatConfig } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createPanelHost } from '@/app/panel-host';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import * as saveManager from '@/storage/save-manager';
import * as savePanelModule from '@/ui/save-panel';
import * as legacyPrompt from '@/ui/legacy-opponent-challenge-prompt';
import * as gameModeSelectModule from '@/ui/game-mode-select';
import * as campaignSetupModule from '@/ui/campaign-setup';
import * as hotseatSetupModule from '@/ui/hotseat-setup';
import * as geoMapData from '@/systems/geo-map-data';
import { readGeoMapDataFromDisk, useDiskGeoMapDataFetcher } from '../../helpers/geo-map-data';
import {
  createCampaignEntryController,
  type CampaignEntryControllerDeps,
} from '@/app/controllers/campaign-entry-controller';

vi.mock('@/storage/save-manager', async () => {
  const actual = await vi.importActual<typeof saveManager>('@/storage/save-manager');
  return {
    ...actual,
    autoSave: vi.fn().mockResolvedValue(undefined),
    loadMostRecentAutoSaveEntry: vi.fn(),
    loadSaveEntry: vi.fn(),
    rewriteLoadedSaveEntry: vi.fn().mockResolvedValue(undefined),
  };
});

vi.mock('@/ui/save-panel', async () => {
  const actual = await vi.importActual<typeof savePanelModule>('@/ui/save-panel');
  return { ...actual, createSavePanel: vi.fn().mockResolvedValue(undefined) };
});

vi.mock('@/ui/game-mode-select', async () => {
  const actual = await vi.importActual<typeof gameModeSelectModule>('@/ui/game-mode-select');
  return { ...actual, showGameModeSelect: vi.fn(() => document.createElement('div')) };
});

vi.mock('@/ui/campaign-setup', async () => {
  const actual = await vi.importActual<typeof campaignSetupModule>('@/ui/campaign-setup');
  return { ...actual, showCampaignSetup: vi.fn() };
});

vi.mock('@/ui/hotseat-setup', async () => {
  const actual = await vi.importActual<typeof hotseatSetupModule>('@/ui/hotseat-setup');
  return { ...actual, showHotSeatSetup: vi.fn() };
});

// #1456: wrap the loader in spies that default to the real behaviour, so a test can hold a load open or fail it.
vi.mock('@/systems/geo-map-data', async () => {
  const actual = await vi.importActual<typeof geoMapData>('@/systems/geo-map-data');
  return {
    ...actual,
    loadGeoMapData: vi.fn(actual.loadGeoMapData),
    isGeoMapDataLoaded: vi.fn(actual.isGeoMapDataLoaded),
  };
});

vi.mock('@/ui/legacy-opponent-challenge-prompt', async () => {
  const actual = await vi.importActual<typeof legacyPrompt>('@/ui/legacy-opponent-challenge-prompt');
  return {
    ...actual,
    // Resolves beginCampaignEntry's pending promise immediately via cancel —
    // these tests only assert the prompt was shown, not its continuation.
    showLegacyOpponentChallengePrompt: vi.fn((_container, options: legacyPrompt.LegacyOpponentChallengePromptOptions) => {
      options.onCancel();
      return document.createElement('div');
    }),
  };
});

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'campaign-entry-controller', 'small');
  state.currentPlayer = 'player';
  return state;
}

function makeHotSeatFixture(): GameState {
  const state = makeFixture();
  const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  state.civilizations['player'].isHuman = true;
  state.civilizations[aiCivId].isHuman = true;
  const players: HotSeatPlayer[] = [
    { name: 'Alice', slotId: 'player', civType: state.civilizations['player'].civType, isHuman: true },
    { name: 'Bob', slotId: aiCivId, civType: state.civilizations[aiCivId].civType, isHuman: true },
  ];
  state.hotSeat = { playerCount: 2, mapSize: 'small', players };
  return state;
}

function baseDeps(state: GameState, overrides: Partial<CampaignEntryControllerDeps> = {}): CampaignEntryControllerDeps {
  const handle = createGameSession(state);
  const session = overrides.session ?? handle;
  const host = createPanelHost(document.createElement('div'));
  return {
    session,
    unpublished: handle.unpublished,
    uiLayer: document.createElement('div'),
    audio: { setMasterVolume: vi.fn() },
    bus: new EventBus(),
    roundPresentationGate: new RoundPresentationGate(),
    host,
    turnFlow: { handleVictoryIfNeeded: vi.fn(), closeNetworkPanelsForHandoff: vi.fn() },
    userSettingsStore: {
      getPersisted: () => undefined,
      refresh: vi.fn().mockResolvedValue({ customCivilizations: [] }),
      getMasterVolume: () => 0.8,
      setCustomCivilizations: vi.fn(),
      getOverrides: () => ({}),
    },
    getElementById: id => document.getElementById(id),
    showNotification: vi.fn(),
    startGame: vi.fn().mockResolvedValue(undefined),
    reloadPage: vi.fn(),
    ...overrides,
  };
}

async function flushMicrotasks(times = 5): Promise<void> {
  for (let i = 0; i < times; i++) await Promise.resolve();
}

describe('CampaignEntryController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    document.body.innerHTML = '';
  });

  describe('enterCampaign — solo', () => {
    it('starts the game and shows the entry message', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);

      campaignEntry.enterCampaign(state, 'Welcome back! Turn 1');

      expect(deps.startGame).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith('Welcome back! Turn 1', 'info');
    });

    it('starts the game and checks victory instead of toasting when the entered state is already over', () => {
      const state = makeFixture();
      state.gameOver = true;
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);

      campaignEntry.enterCampaign(state, 'unused');

      expect(deps.startGame).toHaveBeenCalledTimes(1);
      expect(deps.turnFlow.handleVictoryIfNeeded).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).not.toHaveBeenCalled();
    });

    it('checks gameOver before the hot-seat branch, even for a hot-seat state', () => {
      // A hot-seat state that is already over must take the solo-style
      // gameOver exit, not the handoff path -- otherwise a finished hot-seat
      // game would mute audio and show a "next player" handoff screen for a
      // game that has already ended.
      const state = makeHotSeatFixture();
      state.gameOver = true;
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);

      campaignEntry.enterCampaign(state, 'unused');

      expect(deps.turnFlow.handleVictoryIfNeeded).toHaveBeenCalledTimes(1);
      expect(deps.audio.setMasterVolume).not.toHaveBeenCalled();
      expect(deps.roundPresentationGate.isSuppressed()).toBe(false);
      expect(document.querySelector('#turn-handoff-title')).toBeNull();
    });
  });

  describe('enterCampaign — hot-seat', () => {
    it('suppresses presentation, mutes audio, autosaves, restores volume, and starts the game once the handoff resolves', async () => {
      const state = makeHotSeatFixture();
      const deps = baseDeps(state, {
        userSettingsStore: {
          getPersisted: () => undefined,
          refresh: vi.fn().mockResolvedValue({ customCivilizations: [] }),
          getMasterVolume: () => 0.6,
          setCustomCivilizations: vi.fn(),
          getOverrides: () => ({}),
        },
      });
      const campaignEntry = createCampaignEntryController(deps);

      campaignEntry.enterCampaign(state, 'Hot seat game started!');
      expect(deps.roundPresentationGate.isSuppressed()).toBe(true);
      expect(deps.audio.setMasterVolume).toHaveBeenCalledWith(0);

      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();

      expect(saveManager.autoSave).toHaveBeenCalled();
      expect(deps.startGame).toHaveBeenCalledTimes(1);
      expect(deps.audio.setMasterVolume).toHaveBeenCalledWith(0.6);
      expect(deps.roundPresentationGate.isSuppressed()).toBe(false);
      expect(deps.showNotification).toHaveBeenCalledWith('Hot seat game started!', 'info');
    });
  });

  describe('enterCampaignForE2E', () => {
    it('refuses a hot-seat state instead of silently entering it', () => {
      const state = makeHotSeatFixture();
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);

      expect(() => campaignEntry.enterCampaignForE2E(state)).toThrow(
        'E2E direct entry does not bypass hot-seat handoff.',
      );
    });
  });

  describe('showStartSavePanel', () => {
    it('routes onContinue through the legacy challenge prompt for a save with no opponentChallenge', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);
      let capturedOptions: Parameters<typeof savePanelModule.createSavePanel>[1] | undefined;
      vi.mocked(savePanelModule.createSavePanel).mockImplementation(async (_layer, options) => {
        capturedOptions = options;
      });
      const loadedState = structuredClone(state);
      delete (loadedState as Partial<GameState>).opponentChallenge;
      vi.mocked(saveManager.loadMostRecentAutoSaveEntry).mockResolvedValue({
        state: loadedState as never,
        source: { id: 'auto', kind: 'autosave' },
      });

      await campaignEntry.showStartSavePanel();
      expect(capturedOptions).toBeDefined();

      const invoker = document.createElement('button');
      const savePanel = document.createElement('div');
      savePanel.id = 'save-panel';
      savePanel.appendChild(invoker);
      document.body.appendChild(savePanel);

      await capturedOptions!.onContinue(invoker);

      expect(legacyPrompt.showLegacyOpponentChallengePrompt).toHaveBeenCalledTimes(1);
      const call = vi.mocked(legacyPrompt.showLegacyOpponentChallengePrompt).mock.calls[0];
      expect(call[1].hotSeat).toBe(false);
    });

    it('routes onLoadEntry and onImportSave through the same legacy challenge prompt', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);
      let capturedOptions: Parameters<typeof savePanelModule.createSavePanel>[1] | undefined;
      vi.mocked(savePanelModule.createSavePanel).mockImplementation(async (_layer, options) => {
        capturedOptions = options;
      });
      const loadedState = structuredClone(state);
      delete (loadedState as Partial<GameState>).opponentChallenge;
      vi.mocked(saveManager.loadSaveEntry).mockResolvedValue({
        state: loadedState as never,
        source: { id: 'slot-1', kind: 'manual' },
      });

      await campaignEntry.showStartSavePanel();
      const invoker = document.createElement('button');
      document.body.appendChild(invoker);

      await capturedOptions!.onLoadEntry({ id: 'slot-1', kind: 'manual' }, invoker);
      expect(legacyPrompt.showLegacyOpponentChallengePrompt).toHaveBeenCalledTimes(1);

      vi.mocked(legacyPrompt.showLegacyOpponentChallengePrompt).mockClear();
      await capturedOptions!.onImportSave!(loadedState as GameState, invoker);
      expect(legacyPrompt.showLegacyOpponentChallengePrompt).toHaveBeenCalledTimes(1);
    });
  });

  describe('showGameModeSelection', () => {
    function captureModeSelectCallbacks(): gameModeSelectModule.GameModeSelectCallbacks {
      let captured!: gameModeSelectModule.GameModeSelectCallbacks;
      vi.mocked(gameModeSelectModule.showGameModeSelect).mockImplementation((_layer, callbacks) => {
        captured = callbacks;
        return document.createElement('div');
      });
      return new Proxy({} as gameModeSelectModule.GameModeSelectCallbacks, {
        get: (_t, prop) => (captured as never)[prop],
      });
    }

    it('the solo path constructs a new game via createNewGame and starts it', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);
      const callbacks = captureModeSelectCallbacks();
      let capturedSoloCallbacks: campaignSetupModule.CampaignSetupCallbacks | undefined;
      vi.mocked(campaignSetupModule.showCampaignSetup).mockImplementation((_layer, cb) => {
        capturedSoloCallbacks = cb;
        return document.createElement('div');
      });

      campaignEntry.showGameModeSelection();
      await callbacks.onChooseSolo('My Solo Campaign');
      expect(capturedSoloCallbacks).toBeDefined();

      const beforeState = deps.session.getState();
      const soloConfig: SoloSetupConfig = {
        civType: beforeState.civilizations['player'].civType,
        mapSize: 'small',
        opponentCount: 1,
        gameTitle: 'My Solo Campaign',
      };
      capturedSoloCallbacks!.onStartSolo(soloConfig);

      expect(deps.session.getState()).not.toBe(beforeState);
      expect(deps.session.getState().gameTitle).toBe('My Solo Campaign');
      expect(deps.startGame).toHaveBeenCalledTimes(1);
    });

    it('the solo path applies a persisted councilTalkLevel to the freshly constructed game', async () => {
      const state = makeFixture();
      const deps = baseDeps(state, {
        userSettingsStore: {
          getPersisted: () => undefined,
          refresh: vi.fn().mockResolvedValue({ customCivilizations: [], councilTalkLevel: 'chatty' }),
          getMasterVolume: () => 0.8,
          setCustomCivilizations: vi.fn(),
          getOverrides: () => ({}),
        },
      });
      const campaignEntry = createCampaignEntryController(deps);
      const callbacks = captureModeSelectCallbacks();
      let capturedSoloCallbacks: campaignSetupModule.CampaignSetupCallbacks | undefined;
      vi.mocked(campaignSetupModule.showCampaignSetup).mockImplementation((_layer, cb) => {
        capturedSoloCallbacks = cb;
        return document.createElement('div');
      });

      campaignEntry.showGameModeSelection();
      await callbacks.onChooseSolo('Talkative Council Game');
      expect(capturedSoloCallbacks).toBeDefined();

      const beforeState = deps.session.getState();
      const soloConfig: SoloSetupConfig = {
        civType: beforeState.civilizations['player'].civType,
        mapSize: 'small',
        opponentCount: 1,
        gameTitle: 'Talkative Council Game',
      };
      capturedSoloCallbacks!.onStartSolo(soloConfig);

      expect(deps.session.getState().settings.councilTalkLevel).toBe('chatty');
    });

    it('the hot-seat path constructs a new game via createHotSeatGame and persists before entering', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const campaignEntry = createCampaignEntryController(deps);
      const callbacks = captureModeSelectCallbacks();
      let capturedHotSeatCallbacks: hotseatSetupModule.HotSeatSetupCallbacks | undefined;
      vi.mocked(hotseatSetupModule.showHotSeatSetup).mockImplementation((_layer, cb) => {
        capturedHotSeatCallbacks = cb;
      });

      campaignEntry.showGameModeSelection();
      await callbacks.onChooseHotSeat('My Hot Seat Campaign');
      expect(capturedHotSeatCallbacks).toBeDefined();

      const beforeState = deps.session.getState();
      const players: HotSeatPlayer[] = [
        { name: 'Alice', slotId: 'player', civType: beforeState.civilizations['player'].civType, isHuman: true },
      ];
      const hotSeatConfig: HotSeatConfig = { playerCount: 2, mapSize: 'small', players };

      capturedHotSeatCallbacks!.onComplete(hotSeatConfig, 'standard');

      // enterCampaign's hot-seat branch with persistBeforeReady=true autosaves
      // before the handoff screen becomes interactive -- a bug here would
      // silently drop a brand-new hot-seat game's first save.
      expect(saveManager.autoSave).toHaveBeenCalled();
      expect(deps.session.getState()).not.toBe(beforeState);
      expect(deps.session.getState().hotSeat).toBeDefined();
    });

    it('the hot-seat path applies a persisted councilTalkLevel to the freshly constructed game', async () => {
      const state = makeFixture();
      const deps = baseDeps(state, {
        userSettingsStore: {
          getPersisted: () => undefined,
          refresh: vi.fn().mockResolvedValue({ customCivilizations: [], councilTalkLevel: 'chatty' }),
          getMasterVolume: () => 0.8,
          setCustomCivilizations: vi.fn(),
          getOverrides: () => ({}),
        },
      });
      const campaignEntry = createCampaignEntryController(deps);
      const callbacks = captureModeSelectCallbacks();
      let capturedHotSeatCallbacks: hotseatSetupModule.HotSeatSetupCallbacks | undefined;
      vi.mocked(hotseatSetupModule.showHotSeatSetup).mockImplementation((_layer, cb) => {
        capturedHotSeatCallbacks = cb;
      });

      campaignEntry.showGameModeSelection();
      await callbacks.onChooseHotSeat('Talkative Hot Seat Campaign');
      expect(capturedHotSeatCallbacks).toBeDefined();

      const beforeState = deps.session.getState();
      const players: HotSeatPlayer[] = [
        { name: 'Alice', slotId: 'player', civType: beforeState.civilizations['player'].civType, isHuman: true },
      ];
      const hotSeatConfig: HotSeatConfig = { playerCount: 2, mapSize: 'small', players };

      capturedHotSeatCallbacks!.onComplete(hotSeatConfig, 'standard');

      expect(deps.session.getState().settings.councilTalkLevel).toBe('chatty');
    });
  });

  // #1456: a geographic map's tile/river data loads on demand; the synchronous constructors run only after it.
  describe('starting on a geographic map', () => {
    // The module is mocked above: grab the genuine loader, not the spy that wraps it.
    let realLoad: typeof geoMapData.loadGeoMapData;
    let realIsLoaded: typeof geoMapData.isGeoMapDataLoaded;
    beforeAll(async () => {
      useDiskGeoMapDataFetcher();
      const actualGeo = await vi.importActual<typeof geoMapData>('@/systems/geo-map-data');
      realLoad = actualGeo.loadGeoMapData;
      realIsLoaded = actualGeo.isGeoMapDataLoaded;
    });

    function openSolo(deps: CampaignEntryControllerDeps) {
      const campaignEntry = createCampaignEntryController(deps);
      let modeCallbacks!: gameModeSelectModule.GameModeSelectCallbacks;
      vi.mocked(gameModeSelectModule.showGameModeSelect).mockImplementation((_layer, callbacks) => {
        modeCallbacks = callbacks;
        return document.createElement('div');
      });
      let solo!: campaignSetupModule.CampaignSetupCallbacks;
      vi.mocked(campaignSetupModule.showCampaignSetup).mockImplementation((_layer, cb) => {
        solo = cb;
        return document.createElement('div');
      });
      campaignEntry.showGameModeSelection();
      return { choose: async () => { await modeCallbacks.onChooseSolo('Geo'); return solo; } };
    }

    const openSoloWithHint = (deps: CampaignEntryControllerDeps) => openSolo(deps).choose();

    const soloConfig = (mapScript: SoloSetupConfig['mapScript']): SoloSetupConfig => ({
      civType: 'rome', mapSize: 'small', opponentCount: 1, gameTitle: 'Geo', mapScript, seed: 'geo-entry-1456',
    });

    beforeEach(() => {
      vi.mocked(geoMapData.loadGeoMapData).mockImplementation(realLoad);
      vi.mocked(geoMapData.isGeoMapDataLoaded).mockReturnValue(false);
    });

    it('waits for the data, then creates exactly one game on that map', async () => {
      let release!: () => void;
      const gate = new Promise<void>(resolve => { release = resolve; });
      vi.mocked(geoMapData.loadGeoMapData).mockImplementation(async script => { await gate; return realLoad(script); });
      const deps = baseDeps(makeFixture());
      const solo = await openSolo(deps).choose();
      const before = deps.session.getState();

      const pending = solo.onStartSolo(soloConfig('earth'));
      expect(pending).toBeInstanceOf(Promise);
      await flushMicrotasks();
      expect(deps.session.getState()).toBe(before);
      expect(deps.startGame).not.toHaveBeenCalled();

      release();
      await pending;
      expect(deps.session.getState().mapScript).toBe('earth');
      expect(deps.startGame).toHaveBeenCalledTimes(1);
    });

    it('shares one in-flight load between overlapping starts and never creates two games', async () => {
      const deps = baseDeps(makeFixture());
      const solo = await openSolo(deps).choose();

      const first = solo.onStartSolo(soloConfig('earth'));
      const second = solo.onStartSolo(soloConfig('earth'));
      expect(second).toBe(first);
      await first;
      expect(geoMapData.loadGeoMapData).toHaveBeenCalledTimes(1);
      expect(deps.startGame).toHaveBeenCalledTimes(1);
    });

    it('a failed load starts nothing, surfaces the failure, and a later start retries', async () => {
      vi.mocked(geoMapData.loadGeoMapData).mockRejectedValueOnce(new Error('offline'));
      const deps = baseDeps(makeFixture());
      const solo = await openSolo(deps).choose();
      const before = deps.session.getState();

      await expect(solo.onStartSolo(soloConfig('old-world'))).rejects.toThrow('offline');
      expect(deps.session.getState()).toBe(before);
      expect(deps.startGame).not.toHaveBeenCalled();

      await solo.onStartSolo(soloConfig('old-world'));
      expect(deps.session.getState().mapScript).toBe('old-world');
      expect(deps.startGame).toHaveBeenCalledTimes(1);
    });

    it('prefetches the selected geographic map while the player is still choosing, and Start reuses that load', async () => {
      // Count real fetches on a script nothing earlier in this file has loaded, and let the genuine registry decide.
      const fetcher = vi.fn(async () => readGeoMapDataFromDisk('new-world'));
      geoMapData.setGeoMapDataFetcher(fetcher);
      vi.mocked(geoMapData.isGeoMapDataLoaded).mockImplementation(realIsLoaded);
      try {
        const deps = baseDeps(makeFixture());
        const solo = await openSoloWithHint(deps);

        solo.onMapScriptChosen?.('new-world');
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(deps.startGame).not.toHaveBeenCalled();

        await solo.onStartSolo(soloConfig('new-world'));
        expect(fetcher).toHaveBeenCalledTimes(1);
        expect(deps.session.getState().mapScript).toBe('new-world');
        expect(deps.startGame).toHaveBeenCalledTimes(1);
      } finally {
        useDiskGeoMapDataFetcher();
      }
    });

    it('a map that needs no geographic data is never prefetched', async () => {
      const deps = baseDeps(makeFixture());
      const solo = await openSoloWithHint(deps);
      solo.onMapScriptChosen?.('balanced');
      solo.onMapScriptChosen?.('single-continent');
      expect(geoMapData.loadGeoMapData).not.toHaveBeenCalled();
    });

    it('a failed prefetch is silent, and pressing Start asks again and can succeed', async () => {
      vi.mocked(geoMapData.loadGeoMapData).mockRejectedValueOnce(new Error('offline'));
      const deps = baseDeps(makeFixture());
      const solo = await openSoloWithHint(deps);

      solo.onMapScriptChosen?.('new-world');
      await flushMicrotasks();
      expect(deps.showNotification).not.toHaveBeenCalled();
      expect(deps.startGame).not.toHaveBeenCalled();

      await solo.onStartSolo(soloConfig('new-world'));
      expect(deps.session.getState().mapScript).toBe('new-world');
      expect(geoMapData.loadGeoMapData).toHaveBeenCalledTimes(2);
    });

    it('does not prefetch data that is already loaded', async () => {
      vi.mocked(geoMapData.isGeoMapDataLoaded).mockReturnValue(true);
      const deps = baseDeps(makeFixture());
      const solo = await openSoloWithHint(deps);
      solo.onMapScriptChosen?.('earth');
      expect(geoMapData.loadGeoMapData).not.toHaveBeenCalled();
    });

    it('a map that needs no geographic data never touches the loader and stays synchronous', async () => {
      const deps = baseDeps(makeFixture());
      const solo = await openSolo(deps).choose();

      const result = solo.onStartSolo(soloConfig('procedural'));
      expect(result).toBeUndefined();
      expect(geoMapData.loadGeoMapData).not.toHaveBeenCalled();
      expect(deps.startGame).toHaveBeenCalledTimes(1);
    });

    it('data that is already loaded starts at once without another load', async () => {
      await realLoad('earth');
      vi.mocked(geoMapData.isGeoMapDataLoaded).mockReturnValue(true);
      const deps = baseDeps(makeFixture());
      const solo = await openSolo(deps).choose();

      expect(solo.onStartSolo(soloConfig('earth'))).toBeUndefined();
      expect(geoMapData.loadGeoMapData).not.toHaveBeenCalled();
      expect(deps.startGame).toHaveBeenCalledTimes(1);
    });
  });
});
