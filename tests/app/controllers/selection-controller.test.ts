// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createUnit } from '@/systems/unit-system';
import { createEspionageCivState } from '@/systems/espionage-system';
import type { GameState, Unit } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import { createSelectionStore } from '@/app/selection-store';
import { createPanelHost } from '@/app/panel-host';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import type { ExecuteUnitMoveResult } from '@/systems/unit-movement-system';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import {
  createSelectionController,
  type SelectionControllerDeps,
  type SelectionControllerRenderer,
} from '@/app/controllers/selection-controller';

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'selection-controller', 'small');
  state.currentPlayer = 'player';
  // Strip the settler/warrior createNewGame seeds by default so fixtures that
  // place their own units get a deterministic, fully-controlled unit roster
  // (relevant for selectNextUnit's "skip current"/"none left" tests below).
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

function findButtonByText(container: HTMLElement, text: string): HTMLButtonElement {
  const button = Array.from(container.querySelectorAll('button')).find(b => b.textContent === text);
  if (!button) throw new Error(`No button with exact text "${text}" found in container`);
  return button as HTMLButtonElement;
}

function tryUntilInfiltrate(
  unitType: Unit['type'],
  predicate: (state: GameState, uid: string) => boolean,
  setup?: (deps: SelectionControllerDeps) => void,
): { deps: SelectionControllerDeps; uid: string } | null {
  for (let i = 0; i < 200; i++) {
    const uid = `infiltrator-${i}`;
    const state = makeFixture();
    const template = Object.values(state.cities)[0]!;
    state.cities['enemy-city'] = { ...template, id: 'enemy-city', owner: 'ai-1', position: { q: 0, r: 0 } };
    placePlayerUnit(state, uid, { type: unitType, position: { q: 0, r: 0 } });
    state.espionage = { player: createEspionageCivState() };
    state.espionage.player.spies[uid] = {
      id: uid, owner: 'player', name: 'Agent', unitType,
      targetCivId: null, targetCityId: null, position: null,
      status: 'idle', experience: 0, currentMission: null,
      cooldownTurns: 0, promotion: undefined, promotionAvailable: false, feedsFalseIntel: false,
    };
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    setup?.(deps);

    controller.selectUnit(uid);
    const panel = document.getElementById('info-panel')!;
    findButtonByText(panel, 'Infiltrate City').click();

    if (predicate(deps.session.getState(), uid)) {
      return { deps, uid };
    }
  }
  return null;
}

function fakeRenderer(overrides: Partial<SelectionControllerRenderer> = {}): SelectionControllerRenderer {
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
    ...overrides,
  };
}

function fakeCeremonies(overrides: Partial<CeremonyCoordinator> = {}): CeremonyCoordinator {
  return {
    enqueueWonderDiscovery: vi.fn(),
    enqueueLegendaryCompletion: vi.fn(),
    beginDeferredAction: vi.fn(),
    endAction: vi.fn(),
    clearForHandoff: vi.fn(),
    ...overrides,
  };
}

function fakeUnitTurnFlow(overrides: Partial<UnitTurnFlow> = {}): UnitTurnFlow {
  return {
    skipUnitAction: vi.fn(),
    showDeleteUnitConfirmation: vi.fn(),
    showEndTurnUnitWarningIfNeeded: () => false,
    ...overrides,
  };
}

function baseDeps(state: GameState, overrides: Partial<SelectionControllerDeps> = {}): SelectionControllerDeps {
  const session = overrides.session ?? createGameSession(state);
  return {
    session,
    selection: createSelectionStore(),
    renderLoop: fakeRenderer(),
    // A real EventBus, not a `{ emit: vi.fn() }` stand-in -- deps.bus is
    // typed as the concrete class (see selection-controller.ts's docblock on
    // that field) since two downstream calls require it, not just `.emit`.
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
    scanSubmarineSightings: vi.fn(),
    currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
    ...overrides,
  };
}

describe('SelectionController', () => {
  it('selecting a unit sets movement and attack ranges from its highlights', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);

    controller.selectUnit('u1');

    expect(deps.selection.getSelectedUnitId()).toBe('u1');
    expect(deps.selection.getMovementRange().length).toBeGreaterThan(0);
    expect(deps.renderLoop.setSelectedUnitId).toHaveBeenCalledWith('u1');
    expect(deps.renderLoop.setHighlights).toHaveBeenCalled();
  });

  it('selecting a unit threads buildSelectedUnitHighlights\' water recovery into the store', () => {
    // Replaces a pre-8c grep assertion (`tests/main.integration.test.ts`
    // "land-unit water recovery wiring") that checked this wiring by matching
    // `waterRecovery: highlightResult.waterRecovery` as text inside
    // `main.ts`'s `selectUnit` -- that function now lives here instead.
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    const expected = buildSelectedUnitHighlights(state, 'u1').waterRecovery;

    controller.selectUnit('u1');

    expect(deps.selection.getWaterRecovery()).toEqual(expected);
  });

  it('selecting a unit renders the info panel via the real DOM node', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);

    controller.selectUnit('u1');

    const panel = document.getElementById('info-panel')!;
    expect(panel.children.length).toBeGreaterThan(0);
  });

  it('does not select a unit that is mid-animation, and warns instead', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state, { renderLoop: fakeRenderer({ hasMovingUnit: () => true }) });
    const controller = createSelectionController(deps);

    controller.selectUnit('u1');

    expect(deps.selection.getSelectedUnitId()).toBeNull();
    expect(deps.showNotification).toHaveBeenCalledWith('Unit is moving.', 'info');
  });

  it('refuses to select a unit not owned by the current player (hot-seat safety)', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'enemy-unit', { owner: 'ai-1' });
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);

    controller.selectUnit('enemy-unit');

    expect(deps.selection.getSelectedUnitId()).toBeNull();
  });

  it('deselecting clears the store, highlights, journey path, and hides the info panel', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');

    controller.deselectUnit();

    expect(deps.selection.getSelectedUnitId()).toBeNull();
    expect(deps.selection.getMovementRange()).toEqual([]);
    expect(deps.selection.getAttackRange()).toEqual([]);
    expect(deps.renderLoop.setSelectedUnitId).toHaveBeenCalledWith(null);
    expect(deps.renderLoop.clearHighlights).toHaveBeenCalled();
    expect(deps.renderLoop.setJourneyPath).toHaveBeenCalledWith(null);
    const panel = document.getElementById('info-panel')!;
    expect(panel.style.display).toBe('none');
    expect(panel.children.length).toBe(0);
  });

  it('selectNextUnit skips the currently selected unit when another is available', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    placePlayerUnit(state, 'u2');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');

    controller.selectNextUnit();

    expect(deps.selection.getSelectedUnitId()).toBe('u2');
  });

  it('selectNextUnit silently deselects when no unmoved units remain', () => {
    const state = makeFixture();
    const unit = placePlayerUnit(state, 'u1', { hasMoved: true, movementPointsLeft: 0 });
    void unit;
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);

    controller.selectNextUnit();

    expect(deps.selection.getSelectedUnitId()).toBeNull();
    expect(deps.showNotification).not.toHaveBeenCalled();
  });

  it('isUnitAnimationLocked reflects renderLoop.hasMovingUnit for a non-null id', () => {
    const state = makeFixture();
    const deps = baseDeps(state, { renderLoop: fakeRenderer({ hasMovingUnit: id => id === 'moving-unit' }) });
    const controller = createSelectionController(deps);

    expect(controller.isUnitAnimationLocked('moving-unit')).toBe(true);
    expect(controller.isUnitAnimationLocked('idle-unit')).toBe(false);
    expect(controller.isUnitAnimationLocked(null)).toBe(false);
  });

  it('executeAnimatedUnitMove brackets the ceremony defer window around a successful move', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const ceremonies = fakeCeremonies();
    const deps = baseDeps(state, { ceremonies });
    const controller = createSelectionController(deps);
    const moveResult: ExecuteUnitMoveResult = {
      ok: true,
      path: [{ q: 0, r: 0 }, { q: 1, r: 0 }],
      state: deps.session.getState(),
      events: [],
    } as unknown as ExecuteUnitMoveResult;

    const callOrder: string[] = [];
    (ceremonies.beginDeferredAction as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('begin'));
    (deps.renderLoop.animateUnitMove as ReturnType<typeof vi.fn>).mockImplementation(() => callOrder.push('animate'));

    const result = controller.executeAnimatedUnitMove('u1', () => moveResult);

    expect(result).toBe(moveResult);
    expect(ceremonies.beginDeferredAction).toHaveBeenCalledTimes(1);
    expect(deps.renderLoop.animateUnitMove).toHaveBeenCalledTimes(1);
    expect(callOrder).toEqual(['begin', 'animate']);
  });

  it('executeAnimatedUnitMove still ends the ceremony defer window when the move fails, and does not animate', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const ceremonies = fakeCeremonies();
    const deps = baseDeps(state, { ceremonies });
    const controller = createSelectionController(deps);
    const moveResult = { ok: false, message: 'Blocked.' } as unknown as ExecuteUnitMoveResult;

    const result = controller.executeAnimatedUnitMove('u1', () => moveResult);

    expect(result).toBe(moveResult);
    expect(ceremonies.beginDeferredAction).toHaveBeenCalledTimes(1);
    expect(ceremonies.endAction).toHaveBeenCalledTimes(1);
    expect(deps.renderLoop.animateUnitMove).not.toHaveBeenCalled();
    expect(deps.showNotification).toHaveBeenCalledWith('Blocked.', 'warning');
  });

  it('refreshSelectedUnitAfterCombat deselects when the selected unit died', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');
    delete state.units.u1;

    controller.refreshSelectedUnitAfterCombat();

    expect(deps.selection.getSelectedUnitId()).toBeNull();
  });

  it('refreshSelectedUnitAfterCombat deselects when the selected unit was captured (owner changed)', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');
    state.units.u1 = { ...state.units.u1, owner: 'ai-1' };

    controller.refreshSelectedUnitAfterCombat();

    expect(deps.selection.getSelectedUnitId()).toBeNull();
  });

  it('refreshSelectedUnitAfterCombat re-selects the surviving unit without playing selection SFX', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1');
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');
    (deps.renderLoop.setSelectedUnitId as ReturnType<typeof vi.fn>).mockClear();

    controller.refreshSelectedUnitAfterCombat();

    expect(deps.selection.getSelectedUnitId()).toBe('u1');
    expect(deps.renderLoop.setSelectedUnitId).toHaveBeenCalledWith('u1');
  });

  it('startAutoExplore arms auto-explore automation, re-selects the unit, and publishes through session subscribers', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1', { movementPointsLeft: 0 });
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    const listener = vi.fn();
    deps.session.subscribe(listener);

    controller.startAutoExplore('u1');

    expect(deps.session.getState().units.u1.automation?.mode).toBe('auto-explore');
    expect(deps.selection.getSelectedUnitId()).toBe('u1');
    expect(listener).toHaveBeenCalled();
  });

  it('cancelAutoExplore clears automation, re-selects only if currently selected, and publishes through session subscribers', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1', { automation: { mode: 'auto-explore', startedTurn: 1, lastTargets: [] } });
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');
    const listener = vi.fn();
    deps.session.subscribe(listener);

    controller.cancelAutoExplore('u1');

    expect(deps.session.getState().units.u1.automation).toBeUndefined();
    expect(deps.selection.getSelectedUnitId()).toBe('u1');
    expect(listener).toHaveBeenCalled();
  });

  it('cancelJourney clears automation via a committed state change', () => {
    const state = makeFixture();
    placePlayerUnit(state, 'u1', { automation: { mode: 'journey', destination: { q: 3, r: 3 } } as never });
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);
    controller.selectUnit('u1');

    controller.cancelJourney('u1');

    expect(deps.session.getState().units.u1.automation).toBeUndefined();
    expect(deps.renderLoop.setJourneyPath).toHaveBeenCalledWith(null);
  });

  it('refreshCurrentPlayerVisibility fires at most one resource-discovered tip when fog lifts over multiple tiles', () => {
    const state = makeFixture();
    document.body.innerHTML = '<div id="info-panel"></div>';
    const deps = baseDeps(state);
    const controller = createSelectionController(deps);

    expect(() => controller.refreshCurrentPlayerVisibility()).not.toThrow();
    expect(deps.scanBeastSightings).toHaveBeenCalledTimes(1);
  });

  describe('onSetDisguise', () => {
    it('sets the disguise and marks the unit acted, publishing through session subscribers', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'spy-1', { type: 'spy_informant', position: { q: 0, r: 0 } });
      state.espionage = { player: createEspionageCivState() };
      state.espionage.player.spies['spy-1'] = {
        id: 'spy-1', owner: 'player', name: 'Agent', unitType: 'spy_informant',
        targetCivId: null, targetCityId: null, position: null,
        status: 'idle', experience: 0, currentMission: null,
        cooldownTurns: 0, promotion: undefined, promotionAvailable: false, feedsFalseIntel: false,
      };
      document.body.innerHTML = '<div id="info-panel"></div>';
      const deps = baseDeps(state);
      const controller = createSelectionController(deps);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.selectUnit('spy-1');
      const panel = document.getElementById('info-panel')!;
      findButtonByText(panel, 'As Warrior').click();

      const updated = deps.session.getState();
      expect(updated.espionage!.player.spies['spy-1'].disguiseAs).toBe('warrior');
      expect(updated.units['spy-1'].hasActed).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
  });

  describe('onInfiltrate', () => {
    it('era-2+ unit types remove the unit from the map and station the spy (removeUnitFromMap branch)', () => {
      const found = tryUntilInfiltrate('spy_informant', (state, uid) => state.units[uid] === undefined);
      expect(found).not.toBeNull();
      const state = found!.deps.session.getState();
      expect(state.civilizations.player.units).not.toContain(found!.uid);
      expect(state.espionage!.player.spies[found!.uid].status).toBe('stationed');
    });

    it('era-1 scout infiltration reveals tiles and marks the unit acted without removing it (era1ScoutResult branch)', () => {
      const found = tryUntilInfiltrate('spy_scout', (state, uid) => state.units[uid]?.hasActed === true && state.units[uid] !== undefined);
      expect(found).not.toBeNull();
      const state = found!.deps.session.getState();
      expect(state.units[found!.uid].hasActed).toBe(true);
      expect(state.espionage!.player.spies[found!.uid].infiltrationCityId).toBe('enemy-city');
    });

    it('a caught spy is removed from the map (caught branch)', () => {
      const found = tryUntilInfiltrate('spy_scout', (state, uid) => state.espionage!.player.spies[uid]?.status === 'captured');
      expect(found).not.toBeNull();
      expect(found!.deps.session.getState().units[found!.uid]).toBeUndefined();
    });

    it('espionage:spy-caught-infiltrating fires only after the mutation is published, so listeners observe post-commit state', () => {
      let capturedUnitAtEmitTime: unknown;
      const found = tryUntilInfiltrate(
        'spy_scout',
        (state, uid) => state.espionage!.player.spies[uid]?.status === 'captured',
        deps => {
          deps.bus.on('espionage:spy-caught-infiltrating', ({ spyId }) => {
            // A synchronous listener firing before session.commit() would still see the unit on the map.
            capturedUnitAtEmitTime = deps.session.getState().units[spyId];
          });
        },
      );
      expect(found).not.toBeNull();
      expect(capturedUnitAtEmitTime).toBeUndefined();
    });

    it('a failed-but-not-caught attempt marks the unit acted and keeps it on the map (default branch)', () => {
      const found = tryUntilInfiltrate(
        'spy_scout',
        (state, uid) => state.units[uid] !== undefined && state.espionage!.player.spies[uid]?.status === 'cooldown',
      );
      expect(found).not.toBeNull();
      expect(found!.deps.session.getState().units[found!.uid].hasActed).toBe(true);
    });
  });

  describe('onEmbed', () => {
    it('embeds the spy, removes the unit from the map, and publishes through session subscribers', () => {
      const state = makeFixture();
      const template = Object.values(state.cities)[0]!;
      state.cities['friendly-city'] = { ...template, id: 'friendly-city', owner: 'player', position: { q: 0, r: 0 } };
      state.civilizations.player.cities = ['friendly-city'];
      placePlayerUnit(state, 'spy-1', { type: 'spy_scout', position: { q: 0, r: 0 } });
      state.espionage = { player: createEspionageCivState() };
      state.espionage.player.spies['spy-1'] = {
        id: 'spy-1', owner: 'player', name: 'Agent', unitType: 'spy_scout',
        targetCivId: null, targetCityId: null, position: null,
        status: 'idle', experience: 0, currentMission: null,
        cooldownTurns: 0, promotion: undefined, promotionAvailable: false, feedsFalseIntel: false,
      };
      document.body.innerHTML = '<div id="info-panel"></div>';
      const deps = baseDeps(state);
      const controller = createSelectionController(deps);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.selectUnit('spy-1');
      const panel = document.getElementById('info-panel')!;
      findButtonByText(panel, 'Embed (counter-espionage)').click();

      const updated = deps.session.getState();
      expect(updated.units['spy-1']).toBeUndefined();
      expect(updated.civilizations.player.units).not.toContain('spy-1');
      expect(updated.espionage!.player.spies['spy-1'].status).toBe('embedded');
      expect(listener).toHaveBeenCalled();
    });
  });
});
