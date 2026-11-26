import { vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { getAvailableTechs } from '@/systems/tech-system';
import type { GameState } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createSelectionStore } from '@/app/selection-store';
import { showVictoryPanel, type VictoryPanelOptions } from '@/ui/victory-panel';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import type { TurnFlowControllerDeps, TurnFlowRenderer, TurnFlowAudio } from '@/app/controllers/turn-flow-controller';

/**
 * Shared fixtures for the turn-flow controller tests: a small solo game with its required choices cleared (so
 * `endTurn` is not stopped by the research/production prompts), and a full set of controller deps with fakes.
 */
/**
 * `endTurn` blocks (returns early with a toast) whenever the current
 * player has a pending research or production choice -- `createNewGame`
 * starts with both unset, so every endTurn-driving test needs a fixture
 * that has already cleared them, or every test would hit that early exit
 * instead of the behavior under test.
 */
export function clearRequiredChoices(state: GameState, civId: string): void {
  const civ = state.civilizations[civId];
  civ.techState.currentResearch = getAvailableTechs(civ.techState)[0]?.id ?? null;
  for (const city of Object.values(state.cities)) {
    if (city.owner === civId && city.productionQueue.length === 0) {
      city.productionQueue = ['warrior'];
    }
  }
}

export function makeFixture(): GameState {
  const state = createNewGame(undefined, 'turn-flow-controller', 'small');
  state.currentPlayer = 'player';
  state.units = {};
  Object.keys(state.civilizations).forEach((civId, index) => {
    const civilization = state.civilizations[civId];
    civilization.units = [];
    const city = foundCity(civId, { q: index, r: 1 }, state.map, idCounters);
    city.id = `${civId}-survival-city`;
    state.cities[city.id] = city;
    civilization.cities = [city.id];
  });
  clearRequiredChoices(state, 'player');
  return state;
}

export const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };

export function fakeRenderer(overrides: Partial<TurnFlowRenderer> = {}): TurnFlowRenderer {
  return {
    setGameState: vi.fn(),
    animateUnitMove: vi.fn((_unit, _path, done) => done()),
    setSelectedPirateFactionId: vi.fn(),
    setStrategicLaunchPreview: vi.fn(),
    camera: { centerOn: vi.fn() },
    ...overrides,
  };
}

export function fakeAudio(overrides: Partial<TurnFlowAudio> = {}): TurnFlowAudio {
  return {
    setMasterVolume: vi.fn(),
    stopPirateAmbience: vi.fn(),
    ...overrides,
  };
}

export function baseDeps(state: GameState, overrides: Partial<TurnFlowControllerDeps> = {}): TurnFlowControllerDeps {
  const handle = createGameSession(state);
  const session = overrides.session ?? handle;
  const elements = new Map<string, HTMLElement>();
  const uiLayer = overrides.uiLayer ?? document.createElement('div');
  const setBlockingOverlay = overrides.setBlockingOverlay ?? vi.fn();
  return {
    session,
    unpublished: handle.unpublished,
    selection: createSelectionStore(),
    renderLoop: fakeRenderer(),
    bus: new EventBus(),
    uiLayer,
    audio: fakeAudio(),
    router: { close: vi.fn(), open: vi.fn(), closeGroup: vi.fn() },
    roundPresentationGate: new RoundPresentationGate(),
    ceremonies: {
      clearForHandoff: vi.fn(),
      // #993: mirrors the real coordinator's default victory presentation
      // (block + render) closely enough for tests that only care about the
      // panel appearing, without requiring a real PanelHost/coordinator in
      // every one of them. Tests exercising the coordinator's own
      // overlay-depth/backlog behavior construct a real one explicitly (see
      // the hot-seat handoff describe block below).
      enqueueVictory: vi.fn((options: VictoryPanelOptions) => {
        setBlockingOverlay('victory');
        showVictoryPanel(uiLayer, options);
      }),
    },
    notifier: { withHappenedTurn: (_turn, fn) => fn() },
    userSettingsStore: { getMasterVolume: () => 0.8 },
    getElementById: id => elements.get(id) ?? null,
    getNetworkIntentPanel: () => null,
    closeVictoryProgressPanel: vi.fn(),
    refreshVictoryProgressPanel: vi.fn(),
    showNotification: vi.fn(),
    updateHUD: vi.fn(),
    setBlockingOverlay,
    currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
    getUnitTurnFlow: () => ({ showEndTurnUnitWarningIfNeeded: () => false }),
    deselectUnit: vi.fn(),
    selectNextUnit: vi.fn(),
    scanBeastSightings: vi.fn(),
    scanSubmarineSightings: vi.fn(),
    maybeShowPendingHoardChoice: vi.fn(),
    maybeShowPendingGeneralChoice: vi.fn(),
    maybeShowHomelandChoice: vi.fn(),
    checkAdvisors: vi.fn(),
    showGameModeSelection: vi.fn(),
    reloadPage: vi.fn(),
    openCityPanelForCity: vi.fn(),
    ...overrides,
  };
}
