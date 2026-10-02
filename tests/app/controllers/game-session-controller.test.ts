// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createSelectionStore } from '@/app/selection-store';
import { createPanelHost } from '@/app/panel-host';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import * as saveManager from '@/storage/save-manager';
import type { HudController } from '@/app/controllers/hud-controller';
import {
  createGameSessionController,
  type GameSessionControllerDeps,
  type GameSessionRenderer,
  type GameSessionAudio,
} from '@/app/controllers/game-session-controller';

vi.mock('@/storage/save-manager', async () => {
  const actual = await vi.importActual<typeof saveManager>('@/storage/save-manager');
  return { ...actual, autoSave: vi.fn().mockResolvedValue(undefined) };
});

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'game-session-controller', 'small');
  state.currentPlayer = 'player';
  return state;
}

function fakeRenderer(overrides: Partial<GameSessionRenderer> = {}): GameSessionRenderer {
  return {
    setGameState: vi.fn(),
    setTouchHandler: vi.fn(),
    start: vi.fn(),
    resizeCanvas: vi.fn(),
    toggleSupplyOverlay: vi.fn(() => false),
    isSupplyOverlayEnabled: vi.fn(() => false),
    camera: {
      centerOn: vi.fn(), setMinZoomForMap: vi.fn(), hexSize: 32,
      screenToHex: vi.fn(() => ({ q: 0, r: 0 })),
    } as unknown as GameSessionRenderer['camera'],
    ...overrides,
  };
}

function fakeAudio(overrides: Partial<GameSessionAudio> = {}): GameSessionAudio {
  return {
    start: vi.fn(),
    setMasterVolume: vi.fn(),
    getSfxRoutingNode: vi.fn(() => ({ context: {} }) as unknown as AudioNode),
    setMusicVolume: vi.fn(),
    setSfxVolume: vi.fn(),
    setStingerVolume: vi.fn(),
    setMusicEnabled: vi.fn(),
    setSfxEnabled: vi.fn(),
    setStingerEnabled: vi.fn(),
    playReligionStinger: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function fakeHud(): HudController {
  return {
    update: vi.fn(),
    setMapViewportBottomInset: vi.fn(),
    placeAirDefenseButton: vi.fn(),
    ensureDrawerMounted: vi.fn(),
    closeDrawer: vi.fn(),
    isDrawerOpen: vi.fn(() => false),
  };
}

function baseDeps(state: GameState, overrides: Partial<GameSessionControllerDeps> = {}): GameSessionControllerDeps {
  document.body.innerHTML = '<div id="ui-layer"></div>';
  const uiLayer = document.getElementById('ui-layer') as unknown as HTMLDivElement;
  const elements = new Map<string, HTMLElement>();
  return {
    session: createGameSession(state),
    selection: createSelectionStore(),
    renderLoop: fakeRenderer(),
    audio: fakeAudio(),
    bus: new EventBus(),
    canvas: document.createElement('canvas'),
    uiLayer,
    documentRef: document,
    host: createPanelHost(uiLayer),
    router: { toggle: vi.fn(), open: vi.fn(), close: vi.fn(), closeGroup: vi.fn(), isOpen: vi.fn(() => false) },
    roundPresentationGate: new RoundPresentationGate(),
    advisorSystem: { check: vi.fn() },
    userSettingsStore: { getMasterVolume: () => 0.8, setMasterVolume: vi.fn(), refresh: vi.fn().mockResolvedValue({}) },
    turnFlow: {
      centerOnCurrentPlayer: vi.fn(),
      maybeShowCouncilInterrupt: vi.fn(),
      endTurn: vi.fn().mockResolvedValue(undefined),
      emitCurrentPlayerAudioSnapshot: vi.fn(),
      showRequiredChoicesIfNeeded: vi.fn(() => false),
    },
    mapInteraction: { handleHexTap: vi.fn(), handleHexLongPress: vi.fn() },
    selectionController: { selectNextUnit: vi.fn(), selectUnit: vi.fn() },
    hud: fakeHud(),
    campaignEntry: {
      showStartSavePanel: vi.fn().mockResolvedValue(undefined),
      showGameModeSelection: vi.fn(),
      enterCampaignForE2E: vi.fn().mockResolvedValue(undefined),
      enterCampaign: vi.fn().mockResolvedValue(undefined),
    },
    ceremonies: { clearForNewGame: vi.fn() },
    getElementById: id => elements.get(id) ?? document.getElementById(id),
    showNotification: vi.fn(),
    foundCityAction: vi.fn(),
    maybeShowPendingHoardChoice: vi.fn(),
    maybeShowPendingGeneralChoice: vi.fn(),
    setNotifier: vi.fn(),
    focusNotificationTarget: vi.fn(),
    ...overrides,
  };
}

describe('GameSessionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createUI', () => {
    it('builds the game shell and places the anti-aircraft button', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);

      gameSession.createUI();

      expect(document.getElementById('hud')).not.toBeNull();
      expect(deps.hud.placeAirDefenseButton).toHaveBeenCalledTimes(1);
    });

    it('toggles the icon legend overlay open and closed', () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);
      gameSession.createUI();

      const toggleButton = document.getElementById('btn-icon-legend') as HTMLButtonElement | null;
      expect(toggleButton).not.toBeNull();
      toggleButton!.click();
      expect(document.getElementById('icon-legend')).not.toBeNull();
    });
  });

  describe('pause-menu preference toggles publish to session subscribers (#1015)', () => {
    function openPauseMenu(state: GameState) {
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);
      gameSession.createUI();
      const published: GameState[] = [];
      deps.session.subscribe(next => published.push(next));
      (document.getElementById('btn-pause-menu') as HTMLButtonElement).click();
      return { deps, published };
    }

    it('flipping Superweapons refreshes subscribers, because the HUD strategic-arsenal button is gated on it', () => {
      const state = makeFixture();
      state.settings.superweapons = 'off';
      const { deps, published } = openPauseMenu(state);

      (document.querySelector('[data-superweapons-option="on"]') as HTMLButtonElement).click();

      expect(deps.session.getState().settings.superweapons).toBe('on');
      // RED before #1015: this write was silent, so the HUD kept hiding the button until an unrelated refresh.
      expect(published).toHaveLength(1);
      expect(published[0]).toBe(deps.session.getState());
    });

    it('changing the supply-warning preference also publishes', () => {
      const state = makeFixture();
      const { deps, published } = openPauseMenu(state);

      (document.querySelector('[data-supply-warning-option="off"]') as HTMLButtonElement).click();

      expect(deps.session.getState().settings.supplyWarningPreference).toBe('off');
      expect(published).toHaveLength(1);
    });

    it('#1199: a non-master audio setting write publishes (no silent in-place settings mutation)', () => {
      const state = makeFixture();
      const { deps, published } = openPauseMenu(state);
      const slider = document.querySelector('input[aria-label="Music volume"]') as HTMLInputElement;
      expect(slider).not.toBeNull();

      slider.value = '0.4';
      slider.dispatchEvent(new Event('input', { bubbles: true }));

      expect(deps.session.getState().settings.musicVolume).toBe(0.4);
      expect(published).toHaveLength(1);
      expect(published[0]).toBe(deps.session.getState());
    });
  });

  describe('startGame', () => {
    it('mounts the drawer, refreshes the map/HUD, autosaves, and starts the render loop', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);

      // `startGame`'s returned promise is the (non-blocking, fire-and-forget)
      // sprite preload -- it never resolves under jsdom's fake image loading,
      // so every assertion below targets the synchronous work that completes
      // before that promise is returned, matching how the real caller
      // (CampaignEntryController) treats it as a background load, not
      // something to await before continuing.
      void gameSession.startGame();

      expect(deps.hud.ensureDrawerMounted).toHaveBeenCalledTimes(1);
      expect(deps.turnFlow.centerOnCurrentPlayer).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.setGameState).toHaveBeenCalledWith(state);
      expect(deps.hud.update).toHaveBeenCalledTimes(1);
      expect(deps.turnFlow.maybeShowCouncilInterrupt).toHaveBeenCalledTimes(1);
      expect(deps.maybeShowPendingHoardChoice).toHaveBeenCalledTimes(1);
      expect(deps.maybeShowPendingGeneralChoice).toHaveBeenCalledTimes(1);
      expect(saveManager.autoSave).toHaveBeenCalled();
      expect(deps.audio.start).toHaveBeenCalledTimes(1);
      expect(deps.advisorSystem.check).toHaveBeenCalledTimes(1);
      expect(deps.turnFlow.showRequiredChoicesIfNeeded).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.start).toHaveBeenCalledTimes(1);
    });

    it('clears any previous game\'s ceremony/victory backlog before presenting this GameState (#993)', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);

      void gameSession.startGame();

      expect(deps.ceremonies.clearForNewGame).toHaveBeenCalledTimes(1);
    });

    it('wires input handlers only once across repeated calls', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);

      void gameSession.startGame();
      void gameSession.startGame();

      expect(deps.renderLoop.setTouchHandler).toHaveBeenCalledTimes(1);
    });

    it('routes a canvas tap through MapInteractionController.handleHexTap and a right-click through handleHexLongPress', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);
      void gameSession.startGame();

      deps.canvas.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10 }));
      deps.canvas.dispatchEvent(new MouseEvent('mouseup', { button: 0, clientX: 10, clientY: 10 }));
      expect(deps.mapInteraction.handleHexTap).toHaveBeenCalledTimes(1);

      deps.canvas.dispatchEvent(new MouseEvent('contextmenu', { clientX: 10, clientY: 10 }));
      expect(deps.mapInteraction.handleHexLongPress).toHaveBeenCalledTimes(1);
    });

    it('ends the turn through the keyboard shortcut wiring', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);
      void gameSession.startGame();

      deps.documentRef.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));

      expect(deps.turnFlow.endTurn).toHaveBeenCalledTimes(1);
    });
  });

  describe('init', () => {
    it('builds the notifier, publishes it, and shows the start/save panel outside e2e mode', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);

      await gameSession.init();

      expect(deps.setNotifier).toHaveBeenCalledTimes(1);
      const publishedNotifier = vi.mocked(deps.setNotifier).mock.calls[0][0];
      expect(typeof publishedNotifier.toast).toBe('function');
      expect(deps.campaignEntry.showStartSavePanel).toHaveBeenCalledTimes(1);
    });

    it('wires a window resize listener that resizes the canvas', async () => {
      const state = makeFixture();
      const deps = baseDeps(state);
      const gameSession = createGameSessionController(deps);

      await gameSession.init();
      window.dispatchEvent(new Event('resize'));

      expect(deps.renderLoop.resizeCanvas).toHaveBeenCalledTimes(1);
    });
  });
});
