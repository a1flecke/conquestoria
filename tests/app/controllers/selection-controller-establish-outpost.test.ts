// @vitest-environment jsdom
//
// Isolated from selection-controller.test.ts because this file mocks
// `@/ui/selected-unit-info` module-wide (vi.mock hoists to the top of the
// file) to capture the ~30 callbacks `selectUnit` wires into it -- doing
// that in the same file as tests asserting real DOM rendering would break
// those tests.
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createUnit } from '@/systems/unit-system';
import type { GameState, Unit } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createSelectionStore } from '@/app/selection-store';
import { createPanelHost } from '@/app/panel-host';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import {
  createSelectionController,
  type SelectionControllerDeps,
  type SelectionControllerRenderer,
} from '@/app/controllers/selection-controller';
import * as resourceAcquisition from '@/systems/resource-acquisition-system';
import * as saveManager from '@/storage/save-manager';
import * as selectedUnitInfo from '@/ui/selected-unit-info';

vi.mock('@/ui/selected-unit-info', () => ({
  renderSelectedUnitInfo: vi.fn(),
}));
vi.mock('@/storage/save-manager', async () => {
  const actual = await vi.importActual<typeof saveManager>('@/storage/save-manager');
  return { ...actual, autoSave: vi.fn().mockResolvedValue(undefined) };
});

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'selection-controller-outpost', 'small');
  state.currentPlayer = 'player';
  state.units = {};
  for (const civId of Object.keys(state.civilizations)) {
    state.civilizations[civId].units = [];
  }
  return state;
}

const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };

function placePlayerUnit(state: GameState, id: string, overrides: Partial<Unit> = {}): Unit {
  const template = createUnit('warrior', 'player', { q: 0, r: 0 }, idCounters);
  state.units[id] = { ...template, id, owner: 'player', position: { q: 0, r: 0 }, ...overrides };
  if (!state.civilizations.player.units.includes(id)) state.civilizations.player.units.push(id);
  return state.units[id];
}

function fakeRenderer(): SelectionControllerRenderer {
  return {
    hasMovingUnit: () => false,
    setSelectedUnitId: vi.fn(),
    setHighlights: vi.fn(),
    clearHighlights: vi.fn(),
    setJourneyPath: vi.fn(),
    setGameState: vi.fn(),
    animateUnitMove: vi.fn(),
    animateUnitSlide: vi.fn(),
    animateUnitAppear: vi.fn(),
    camera: { centerOn: vi.fn() },
  };
}

function fakeCeremonies(): CeremonyCoordinator {
  return {
    enqueueWonderDiscovery: vi.fn(),
    enqueueLegendaryCompletion: vi.fn(),
    beginDeferredAction: vi.fn(),
    endAction: vi.fn(),
    clearForHandoff: vi.fn(),
  };
}

function fakeUnitTurnFlow(): UnitTurnFlow {
  return {
    skipUnitAction: vi.fn(),
    showDeleteUnitConfirmation: vi.fn(),
    showEndTurnUnitWarningIfNeeded: () => false,
  };
}

function baseDeps(state: GameState, overrides: Partial<SelectionControllerDeps> = {}): SelectionControllerDeps {
  const session = overrides.session ?? createGameSession(state);
  return {
    session,
    selection: createSelectionStore(),
    renderLoop: fakeRenderer(),
    bus: new EventBus(),
    uiLayer: document.createElement('div'),
    host: createPanelHost(document.createElement('div')),
    ceremonies: fakeCeremonies(),
    getInfoPanel: () => document.getElementById('info-panel'),
    showNotification: vi.fn(),
    updateHUD: vi.fn(),
    clearUnloadState: vi.fn(),
    getUnitTurnFlow: () => fakeUnitTurnFlow(),
    foundCityAction: vi.fn(),
    performWorkerAction: vi.fn(),
    performPreach: vi.fn(),
    restAction: vi.fn(),
    openNetworkIntentPanel: vi.fn(),
    openUnitStackPicker: vi.fn(),
    openPirateHeadquartersAssault: vi.fn(),
    handleEstablishRoute: vi.fn(),
    executeUpgrade: vi.fn(() => false),
    ensurePlayerWarState: vi.fn(),
    scanBeastSightings: vi.fn(),
    currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
    ...overrides,
  };
}

describe('SelectionController onEstablishOutpost (regression)', () => {
  beforeEach(() => {
    vi.mocked(selectedUnitInfo.renderSelectedUnitInfo).mockClear();
    vi.mocked(saveManager.autoSave).mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('persists the game via autoSave after a successful outpost establishment', () => {
    // Regression: the 8c extraction (#787) accidentally dropped this
    // autoSave call while moving selectUnit out of main.ts -- caught by a
    // line-by-line diff against the pre-extraction source, not by a test,
    // which is exactly why this test exists now.
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    vi.spyOn(resourceAcquisition, 'canEstablishOutpost').mockReturnValue(true);
    vi.spyOn(resourceAcquisition, 'performEstablishOutpost').mockReturnValue(state);

    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');

    const options = vi.mocked(selectedUnitInfo.renderSelectedUnitInfo).mock.calls[0]![3] as {
      onEstablishOutpost: (unitId: string) => void;
    };
    options.onEstablishOutpost('u1');

    expect(saveManager.autoSave).toHaveBeenCalledWith(state);
  });

  it('does not establish or save when the unit cannot establish an outpost', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    vi.spyOn(resourceAcquisition, 'canEstablishOutpost').mockReturnValue(false);
    const performSpy = vi.spyOn(resourceAcquisition, 'performEstablishOutpost');

    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');

    const options = vi.mocked(selectedUnitInfo.renderSelectedUnitInfo).mock.calls[0]![3] as {
      onEstablishOutpost: (unitId: string) => void;
    };
    options.onEstablishOutpost('u1');

    expect(performSpy).not.toHaveBeenCalled();
    expect(saveManager.autoSave).not.toHaveBeenCalled();
  });
});
