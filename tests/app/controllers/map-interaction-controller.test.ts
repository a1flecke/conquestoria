// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createUnit } from '@/systems/unit-lifecycle';
import { foundCity } from '@/systems/city-system';
import type { GameState, Unit, City } from '@/core/types';
import { createGameSession } from '@/app/game-session';
import type { GameSession } from '@/app/ports';
import { createSelectionStore } from '@/app/selection-store';
import { createPanelHost } from '@/app/panel-host';
import type { CeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import type { UnitTurnFlow } from '@/ui/unit-turn-flow';
import {
  createSelectionController,
  type SelectionControllerDeps,
  type SelectionControllerRenderer,
} from '@/app/controllers/selection-controller';
import {
  createMapInteractionController,
  type MapInteractionControllerDeps,
  type MapInteractionRenderer,
  type MapInteractionAudio,
} from '@/app/controllers/map-interaction-controller';
import * as airOperations from '@/systems/air-operations-system';
import { AIR_MISSION_FAILURE_MESSAGES } from '@/systems/air-operations-system';

const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };

function makeFixture(): GameState {
  const state = createNewGame(undefined, 'map-interaction-controller', 'small');
  state.currentPlayer = 'player';
  state.units = {};
  for (const civId of Object.keys(state.civilizations)) {
    state.civilizations[civId].units = [];
  }
  return state;
}

function placePlayerUnit(state: GameState, id: string, overrides: Partial<Unit> = {}): Unit {
  const template = createUnit('warrior', 'player', { q: 0, r: 0 }, idCounters);
  state.units[id] = { ...template, id, owner: 'player', position: { q: 0, r: 0 }, ...overrides };
  if (!state.civilizations.player.units.includes(id)) state.civilizations.player.units.push(id);
  return state.units[id];
}

function placeEnemyUnit(state: GameState, id: string, owner: string, overrides: Partial<Unit> = {}): Unit {
  const template = createUnit('warrior', owner, { q: 1, r: 0 }, idCounters);
  state.units[id] = { ...template, id, owner, position: { q: 1, r: 0 }, ...overrides };
  if (state.civilizations[owner] && !state.civilizations[owner].units.includes(id)) {
    state.civilizations[owner].units.push(id);
  }
  return state.units[id];
}

function makeVisible(state: GameState, coord: { q: number; r: number }, kind: 'visible' | 'fog' = 'visible') {
  state.civilizations.player.visibility.tiles[`${coord.q},${coord.r}`] = kind;
}

function placeCity(state: GameState, id: string, owner: string, coord: { q: number; r: number }): City {
  const city = foundCity(owner, coord, state.map, idCounters);
  state.cities[id] = { ...city, id };
  if (!state.civilizations[owner].cities.includes(id)) state.civilizations[owner].cities.push(id);
  makeVisible(state, coord);
  return state.cities[id];
}

function fakeSelectionRenderer(): SelectionControllerRenderer {
  return {
    hasMovingUnit: () => false,
    setSelectedUnitId: vi.fn(),
    setHighlights: vi.fn(),
    clearHighlights: vi.fn(),
    setJourneyPath: vi.fn(),
    setGameState: vi.fn(),
    animateUnitMove: vi.fn((_unit, _path, onComplete) => onComplete?.()),
    animateUnitSlide: vi.fn(),
    animateUnitAppear: vi.fn(),
    setStrategicLaunchPreview: vi.fn(),
    camera: { centerOn: vi.fn() },
  };
}

function fakeCeremonies(): CeremonyCoordinator {
  return {
    enqueueWonderDiscovery: vi.fn(),
    enqueueLegendaryCompletion: vi.fn(),
    enqueueEventChainConclusion: vi.fn(),
    enqueueWorldRaceConclusion: vi.fn(),
    enqueueVictory: vi.fn(),
    beginDeferredAction: vi.fn(),
    endAction: vi.fn(),
    clearForHandoff: vi.fn(),
    clearForNewGame: vi.fn(),
  };
}

function fakeUnitTurnFlow(): UnitTurnFlow {
  return {
    skipUnitAction: vi.fn(),
    showDeleteUnitConfirmation: vi.fn(),
    showEndTurnUnitWarningIfNeeded: () => false,
  };
}

/** A real SelectionController, backed by fakes only at the renderer/platform boundary. */
function makeRealSelectionController(session: GameSession, selection: ReturnType<typeof createSelectionStore>) {
  const deps: SelectionControllerDeps = {
    session,
    selection,
    renderLoop: fakeSelectionRenderer(),
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
    advisorSystem: { resetMessage: vi.fn(), check: vi.fn() },
  };
  return createSelectionController(deps);
}

function fakeRenderer(): MapInteractionRenderer {
  return {
    setGameState: vi.fn(),
    animateUnitAppear: vi.fn(),
    camera: { centerOn: vi.fn() },
  };
}

function fakeAudio(): MapInteractionAudio {
  return {
    startNaturalWonderMapFocusAmbient: vi.fn().mockResolvedValue(undefined),
    stopNaturalWonderAmbient: vi.fn(),
  };
}

function baseDeps(state: GameState, overrides: Partial<MapInteractionControllerDeps> = {}): {
  deps: MapInteractionControllerDeps;
  session: GameSession;
  selection: ReturnType<typeof createSelectionStore>;
} {
  const session = overrides.session ?? createGameSession(state);
  const selection = overrides.selection ?? createSelectionStore();
  const selectionController = overrides.selectionController ?? makeRealSelectionController(session, selection);
  const deps: MapInteractionControllerDeps = {
    session,
    selection,
    selectionController,
    renderLoop: fakeRenderer(),
    audio: fakeAudio(),
    bus: new EventBus(),
    uiLayer: document.createElement('div'),
    getElementById: id => document.getElementById(id),
    showNotification: vi.fn(),
    updateHUD: vi.fn(),
    clearUnloadState: vi.fn(),
    currentCiv: () => session.getState().civilizations[session.getState().currentPlayer],
    openPirateWaters: vi.fn(),
    openUnitStackPicker: vi.fn(),
    openCityPanelForCity: vi.fn(),
    openWonderAtlas: vi.fn(),
    executeAttack: vi.fn(),
    executeMinorCivConquest: vi.fn(),
    beginPlayerCityAssault: vi.fn(() => 'resolved' as const),
    bombardCity: vi.fn(),
    holdSiege: vi.fn(),
    beginPlayerCampAssault: vi.fn(),
    finalizePendingCityCaptureChoice: vi.fn(),
    ...overrides,
  };
  // Mirrors bootstrap.ts: renderer and HUD are session subscribers (#1015).
  deps.session.subscribe(next => deps.renderLoop.setGameState(next));
  deps.session.subscribe(() => deps.updateHUD());
  return { deps, session, selection };
}

describe('MapInteractionController', () => {
  // A completed move schedules a real setTimeout (executeAnimatedUnitMove's
  // settleFocusAfterMove, #1039) that otherwise outlives this file's jsdom
  // environment once Vitest tears it down between files -- the callback then
  // fires against a torn-down `document` and fails an unrelated CI shard with
  // "Vitest caught 1 unhandled error" despite every individual test passing.
  // Fake timers make that schedule deterministic and flush it inside each
  // test's own synchronous lifetime instead. Safe file-wide: nothing else
  // here uses real async/setTimeout/Promise timing.
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  describe('handleHexTap', () => {
    it('dispatches deselect on an empty visible hex with nothing selected', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div>';
      makeVisible(state, { q: 5, r: 5 });
      const { deps } = baseDeps(state);
      const controller = createMapInteractionController(deps);

      expect(() => controller.handleHexTap({ q: 5, r: 5 })).not.toThrow();
    });

    it('moves the selected unit onto a reachable tapped hex', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div>';
      placePlayerUnit(state, 'u1', { position: { q: 0, r: 0 } });
      makeVisible(state, { q: 0, r: 0 });
      makeVisible(state, { q: 1, r: 0 });
      const { deps, session, selection } = baseDeps(state);
      const controller = createMapInteractionController(deps);
      deps.selectionController.selectUnit('u1');
      expect(selection.getMovementRange().length).toBeGreaterThan(0);
      const target = selection.getMovementRange()[0]!;

      controller.handleHexTap(target);

      const moved = session.getState().units.u1;
      expect(moved.position).toEqual(target);
    });

    it('open-city closes other panels, deselects, and opens the tapped city', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div><div id="tech-panel"></div>';
      placeCity(state, 'c1', 'player', { q: 3, r: 3 });
      const { deps } = baseDeps(state);
      const controller = createMapInteractionController(deps);

      controller.handleHexTap({ q: 3, r: 3 });

      expect(deps.openCityPanelForCity).toHaveBeenCalledWith(expect.objectContaining({ id: 'c1' }));
      expect(document.getElementById('tech-panel')).toBeNull();
    });

    it('blocked-movement shows a notification and does not move the unit', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div>';
      // A unit with zero moves left: any adjacent visible tile is a
      // blocked-movement tap, not a legal move target.
      placePlayerUnit(state, 'u1', { position: { q: 0, r: 0 }, movementPointsLeft: 0 });
      makeVisible(state, { q: 0, r: 0 });
      makeVisible(state, { q: 1, r: 0 });
      const { deps, session } = baseDeps(state);
      const controller = createMapInteractionController(deps);
      deps.selectionController.selectUnit('u1');

      controller.handleHexTap({ q: 1, r: 0 });

      expect(session.getState().units.u1.position).toEqual({ q: 0, r: 0 });
      expect(deps.showNotification).toHaveBeenCalled();
    });

    it('enemy-unit-info renders the real DOM panel for an enemy at the tapped hex, with no unit selected', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div>';
      placeEnemyUnit(state, 'e1', 'ai-1', { position: { q: 2, r: 2 } });
      makeVisible(state, { q: 2, r: 2 });
      const { deps } = baseDeps(state);
      const controller = createMapInteractionController(deps);

      controller.handleHexTap({ q: 2, r: 2 });

      const panel = document.getElementById('info-panel')!;
      expect(panel.style.display).toBe('block');
      expect(panel.querySelector('#btn-deselect')).not.toBeNull();
    });

    it('combat-preview renders Attack/Cancel buttons, and Cancel deselects', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div>';
      placePlayerUnit(state, 'u1', { position: { q: 0, r: 0 } });
      placeEnemyUnit(state, 'e1', 'ai-1', { position: { q: 1, r: 0 } });
      state.civilizations.player.diplomacy.atWarWith.push('ai-1');
      makeVisible(state, { q: 0, r: 0 });
      makeVisible(state, { q: 1, r: 0 });
      const { deps, selection } = baseDeps(state);
      const controller = createMapInteractionController(deps);
      deps.selectionController.selectUnit('u1');
      expect(selection.getAttackRange().length).toBeGreaterThan(0);

      controller.handleHexTap({ q: 1, r: 0 });

      const panel = document.getElementById('info-panel')!;
      const attackBtn = panel.querySelector('#btn-attack-confirm');
      const cancelBtn = panel.querySelector<HTMLButtonElement>('#btn-cancel-attack');
      expect(attackBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      // #1135: the card leads with a plain outcome headline and expected damage, before any button.
      expect(panel.querySelector('[data-testid="battle-forecast-headline"]')!.textContent)
        .toMatch(/Strong advantage|Advantage|Even fight|Risky|Severe risk/);
      expect(panel.textContent).toMatch(/HP lost|expected to be destroyed/);
      expect(panel.querySelector('details')).not.toBeNull();

      cancelBtn!.click();
      expect(selection.getSelectedUnitId()).toBeNull();
    });

    describe('air strike forecast + confirm (#1213)', () => {
      function airStrikeFixture(extra: { second?: boolean } = {}) {
        const state = makeFixture();
        document.body.innerHTML = '<div id="info-panel"></div>';
        placeCity(state, 'home', 'player', { q: 0, r: 0 });
        const bomber = createUnit('bomber', 'player', { q: 0, r: 0 }, idCounters);
        state.units.b1 = { ...bomber, id: 'b1', owner: 'player', position: { q: 0, r: 0 }, airBase: { kind: 'city', cityId: 'home' } };
        state.civilizations.player.units.push('b1');
        placeEnemyUnit(state, 'e1', 'ai-1', { position: { q: 2, r: 0 } });
        if (extra.second) placeEnemyUnit(state, 'e2', 'ai-1', { position: { q: 3, r: 0 } });
        state.civilizations.player.diplomacy.atWarWith.push('ai-1');
        state.civilizations['ai-1']!.diplomacy.atWarWith.push('player');
        makeVisible(state, { q: 2, r: 0 });
        if (extra.second) makeVisible(state, { q: 3, r: 0 });
        const harness = baseDeps(state);
        const controller = createMapInteractionController(harness.deps);
        harness.selection.setPendingIntent({ kind: 'air-mission', unitId: 'b1', mission: 'strike' });
        return { state, controller, ...harness };
      }

      it('tapping a legal target shows the forecast and does not fly the strike', () => {
        const { controller, session, selection } = airStrikeFixture();
        const before = JSON.stringify(session.getState());

        controller.handleHexTap({ q: 2, r: 0 });

        const panel = document.getElementById('info-panel')!;
        expect(panel.querySelector('[data-testid="battle-forecast-headline"]')).not.toBeNull();
        expect(panel.querySelector('#btn-attack-confirm')!.textContent).toBe('Strike');
        expect(JSON.stringify(session.getState())).toBe(before);
        expect(session.getState().units.b1!.hasActed).toBe(false);
        expect(selection.snapshot().pendingIntent.kind).toBe('air-mission'); // still armed so the player can retarget
      });

      it('Confirm flies the strike exactly once, even on a rapid second tap', () => {
        const { controller, session, selection, deps } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const confirm = document.querySelector<HTMLButtonElement>('#btn-attack-confirm')!;
        const strike = vi.spyOn(airOperations, 'resolveAirStrike');

        confirm.click();
        confirm.click();

        // The air-strike transition runs once. (#1199: the following
        // refreshCurrentPlayerVisibility publishes its own commit, so total
        // session commits is no longer a valid "flew once" proxy.)
        expect(strike).toHaveBeenCalledTimes(1);
        expect(session.getState().units.b1!.hasActed).toBe(true);
        expect(selection.snapshot().pendingIntent.kind).toBe('none');
        void deps;
      });

      it('Cancel mutates nothing and disarms the strike', () => {
        const { controller, session, selection } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const before = JSON.stringify(session.getState());

        document.querySelector<HTMLButtonElement>('#btn-cancel-attack')!.click();

        expect(JSON.stringify(session.getState())).toBe(before);
        expect(selection.snapshot().pendingIntent.kind).toBe('none');
      });

      it('tapping a different legal target replaces the forecast', () => {
        const { controller } = airStrikeFixture({ second: true });
        controller.handleHexTap({ q: 2, r: 0 });
        const first = document.getElementById('info-panel')!.textContent;
        controller.handleHexTap({ q: 3, r: 0 });
        expect(document.querySelectorAll('[data-testid="battle-forecast"]').length).toBe(1);
        expect(document.getElementById('info-panel')!.textContent).toContain('Strike');
        expect(first).toContain('Air Strike Preview');
      });

      it('an illegal target is denied with copy and shows no forecast', () => {
        const { controller, deps, session } = airStrikeFixture();
        controller.handleHexTap({ q: 5, r: 5 });
        expect(document.querySelector('[data-testid="battle-forecast"]')).toBeNull();
        expect(deps.showNotification).toHaveBeenCalledWith(AIR_MISSION_FAILURE_MESSAGES['out-of-range'], 'warning');
        expect(session.getState().units.b1!.hasActed).toBe(false);
      });

      it('Confirm revalidates: a target destroyed after the preview is denied and nothing is struck', () => {
        const { controller, session, selection, deps } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const live = session.getState();
        const { e1: _gone, ...rest } = live.units;
        session.commit({ ...live, units: rest });
        const commit = vi.spyOn(session, 'commit');

        document.querySelector<HTMLButtonElement>('#btn-attack-confirm')!.click();

        expect(commit).not.toHaveBeenCalled();
        expect(session.getState().units.b1!.hasActed).toBe(false);
        expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), 'warning');
        expect(selection.snapshot().pendingIntent.kind).toBe('none');
      });

      it('Confirm after the aircraft became spent gives the typed denial, not a strike', () => {
        const { controller, session, deps } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const live = session.getState();
        session.commit({ ...live, units: { ...live.units, b1: { ...live.units.b1!, airStrain: 8 } } });
        const commit = vi.spyOn(session, 'commit');

        document.querySelector<HTMLButtonElement>('#btn-attack-confirm')!.click();

        expect(commit).not.toHaveBeenCalled();
        expect(deps.showNotification).toHaveBeenCalledWith(expect.stringMatching(/rest|spent|ready/i), 'warning');
      });

      // #1223: one failure vocabulary. Confirm never invents its own copy.
      it('Confirm after the target vanished explains it with the executor\'s typed copy (#1223)', () => {
        const { controller, session, deps } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const live = session.getState();
        const { e1: _gone, ...rest } = live.units;
        session.commit({ ...live, units: rest });

        document.querySelector<HTMLButtonElement>('#btn-attack-confirm')!.click();

        expect(deps.showNotification).toHaveBeenCalledWith(AIR_MISSION_FAILURE_MESSAGES['invalid-strike-target'], 'warning');
      });

      it('Confirm names the typed reason when the canonical strike refuses a forecast that looked fine (#1223)', () => {
        const { controller, session, deps } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const live = session.getState();
        vi.spyOn(airOperations, 'resolveAirStrike').mockReturnValueOnce({ ok: false, state: live, reason: 'out-of-range' });
        const commit = vi.spyOn(session, 'commit');

        document.querySelector<HTMLButtonElement>('#btn-attack-confirm')!.click();

        expect(commit).not.toHaveBeenCalled();
        expect(deps.showNotification).toHaveBeenCalledWith(AIR_MISSION_FAILURE_MESSAGES['out-of-range'], 'warning');
      });

      it('a recon or patrol tap refused by the executor shows that reason\'s copy and keeps the mission armed (#1223)', () => {
        const { controller, session, selection, deps } = airStrikeFixture();
        selection.setPendingIntent({ kind: 'air-mission', unitId: 'b1', mission: 'recon' });
        vi.spyOn(airOperations, 'resolveReconMission').mockReturnValueOnce({ ok: false, state: session.getState(), reason: 'already-acted' });

        controller.handleHexTap({ q: 2, r: 0 });

        expect(deps.showNotification).toHaveBeenCalledWith(AIR_MISSION_FAILURE_MESSAGES['already-acted'], 'warning');
        expect(selection.snapshot().pendingIntent.kind).toBe('air-mission');
      });

      it('Confirm after the forecast changed shows the new forecast instead of striking on stale numbers', () => {
        const { controller, session } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        const live = session.getState();
        session.commit({ ...live, units: { ...live.units, e1: { ...live.units.e1!, health: 20 } } });
        const commit = vi.spyOn(session, 'commit');

        document.querySelector<HTMLButtonElement>('#btn-attack-confirm')!.click();

        expect(commit).not.toHaveBeenCalled();
        expect(session.getState().units.b1!.hasActed).toBe(false);
        expect(document.getElementById('info-panel')!.textContent).toContain('Things changed');
      });

      it('has touch-sized, keyboard-reachable confirm/cancel buttons and a labelled group', () => {
        const { controller } = airStrikeFixture();
        controller.handleHexTap({ q: 2, r: 0 });
        for (const id of ['btn-attack-confirm', 'btn-cancel-attack']) {
          const btn = document.querySelector<HTMLButtonElement>(`#${id}`)!;
          expect(btn.tagName).toBe('BUTTON');
          expect(btn.type).toBe('button');
          expect(btn.style.minHeight).toBe('44px');
        }
        expect(document.querySelector('[data-testid="battle-forecast"]')!.getAttribute('aria-label')).toContain('Air strike preview');
      });
    });

    it('confirming a minor-civ war declaration refreshes the renderer even if the follow-up conquest attempt never does (#787 phase 14)', () => {
      // Regression guard: this case used to call session.setStateWithoutRefresh(war.state)
      // and rely entirely on deps.executeMinorCivConquest to flush the renderer/HUD
      // afterward. player-action-controller.test.ts's "does not resolve
      // minor-civilization conquest after failed movement" proves that path calls
      // neither renderLoop.setGameState nor hud.update when the follow-up move fails
      // -- so a declared war could sit unrefreshed until an unrelated commit happened.
      // Concretely: unit-map-presentation.ts's chooseLead reads atWarWith every
      // render() frame from the renderer's own cached state to pick a foreign unit
      // stack's "lead" sprite (defender-strength order once hostile, plain id sort
      // otherwise) -- the city just tapped to declare this war is on-screen right now
      // and typically has a garrison stack that needs this refresh immediately.
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div>';
      const mcId = Object.keys(state.minorCivs)[0]!;
      const cityId = state.minorCivs[mcId].cityId;
      state.cities[cityId] = { ...state.cities[cityId], position: { q: 1, r: 0 } };
      placePlayerUnit(state, 'u1', { position: { q: 0, r: 0 } });
      state.civilizations.player.diplomacy.atWarWith = state.civilizations.player.diplomacy.atWarWith.filter(id => id !== mcId);
      makeVisible(state, { q: 0, r: 0 });
      makeVisible(state, { q: 1, r: 0 });
      // Simulate the follow-up move failing silently, same as the real
      // executeMinorCivConquest does on a blocked/failed move: it just returns.
      const { deps, session } = baseDeps(state, { executeMinorCivConquest: vi.fn() });
      const controller = createMapInteractionController(deps);
      deps.selectionController.selectUnit('u1');

      controller.handleHexTap({ q: 1, r: 0 });

      const confirmBtn = Array.from(deps.uiLayer.querySelectorAll('button')).find(b => b.textContent === 'Continue');
      expect(confirmBtn).toBeDefined();
      vi.mocked(deps.renderLoop.setGameState).mockClear();

      confirmBtn!.click();

      expect(session.getState().civilizations.player.diplomacy.atWarWith).toContain(mcId);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      const pushedState = vi.mocked(deps.renderLoop.setGameState).mock.calls.at(-1)![0];
      expect(pushedState.civilizations.player.diplomacy.atWarWith).toContain(mcId);
    });
  });

  describe('handleHexLongPress', () => {
    it('shows a notification and never opens a panel for unexplored territory', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="ui-layer"></div>';
      const { deps } = baseDeps(state, { uiLayer: document.getElementById('ui-layer')! });
      const controller = createMapInteractionController(deps);

      controller.handleHexLongPress({ q: 9, r: 9 });

      expect(deps.showNotification).toHaveBeenCalledWith('Unexplored territory');
      expect(document.getElementById('territory-inspection-panel')).toBeNull();
    });

    it('opens the territory inspection panel for fogged territory', () => {
      const state = makeFixture();
      const uiLayer = document.createElement('div');
      document.body.appendChild(uiLayer);
      makeVisible(state, { q: 4, r: 4 }, 'fog');
      const { deps } = baseDeps(state, { uiLayer });
      const controller = createMapInteractionController(deps);

      controller.handleHexLongPress({ q: 4, r: 4 });

      expect(uiLayer.querySelector('#territory-inspection-panel')).not.toBeNull();
    });

    it('opens the territory inspection panel for visible empty territory', () => {
      const state = makeFixture();
      const uiLayer = document.createElement('div');
      document.body.appendChild(uiLayer);
      makeVisible(state, { q: 4, r: 4 });
      const { deps } = baseDeps(state, { uiLayer });
      const controller = createMapInteractionController(deps);

      controller.handleHexLongPress({ q: 4, r: 4 });

      expect(uiLayer.querySelector('#territory-inspection-panel')).not.toBeNull();
    });

    it('selects the unit and opens its context menu on a friendly unit hex, without opening territory inspection', () => {
      const state = makeFixture();
      document.body.innerHTML = '<div id="info-panel"></div><div id="ui-layer"></div>';
      placePlayerUnit(state, 'u1', { position: { q: 2, r: 2 } });
      makeVisible(state, { q: 2, r: 2 });
      const { deps, selection } = baseDeps(state, { uiLayer: document.getElementById('ui-layer')! });
      const controller = createMapInteractionController(deps);

      controller.handleHexLongPress({ q: 2, r: 2 });

      expect(selection.getSelectedUnitId()).toBe('u1');
      expect(document.getElementById('territory-inspection-panel')).toBeNull();
    });

    it('closes an already-open territory inspection panel before selecting a friendly unit', () => {
      const state = makeFixture();
      const uiLayer = document.createElement('div');
      document.body.appendChild(uiLayer);
      const infoPanel = document.createElement('div');
      infoPanel.id = 'info-panel';
      document.body.appendChild(infoPanel);
      placePlayerUnit(state, 'u1', { position: { q: 2, r: 2 } });
      makeVisible(state, { q: 2, r: 2 });
      makeVisible(state, { q: 8, r: 8 }, 'fog');
      const { deps } = baseDeps(state, { uiLayer });
      const controller = createMapInteractionController(deps);
      controller.handleHexLongPress({ q: 8, r: 8 });
      expect(uiLayer.querySelector('#territory-inspection-panel')).not.toBeNull();

      controller.handleHexLongPress({ q: 2, r: 2 });

      expect(uiLayer.querySelector('#territory-inspection-panel')).toBeNull();
    });
  });
});
