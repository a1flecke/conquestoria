// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createUnit } from '@/systems/unit-system';
import { createEspionageCivState } from '@/systems/espionage-system';
import { foundReligion } from '@/systems/religion-system';
import { hexKey } from '@/systems/hex-utils';
import { makeReligionFixture } from '../../systems/helpers/religion-fixture';
import type { GameState, HexCoord, Spy } from '@/core/types';
import {
  createPlayerActionController,
  type PlayerActionControllerDeps,
} from '@/app/controllers/player-action-controller';

vi.mock('@/ui/unit-turn-flow', () => ({ createUnitTurnFlow: vi.fn(() => ({ mocked: 'unit-turn-flow' })) }));

import { createUnitTurnFlow } from '@/ui/unit-turn-flow';

function mockedCallArg<T = unknown>(mockFn: unknown, callIndex: number, argIndex: number): T {
  return (mockFn as ReturnType<typeof vi.fn>).mock.calls[callIndex][argIndex] as T;
}

function makeFixture(seed = 'player-action-controller'): { state: GameState; aiCivId: string } {
  const state = createNewGame(undefined, seed, 'small');
  state.currentPlayer = 'player';
  const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
  return { state, aiCivId };
}

function placeUnit(state: GameState, type: Parameters<typeof createUnit>[0], unitId: string, position: HexCoord, overrides: Partial<GameState['units'][string]> = {}): void {
  const idCounters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  state.units[unitId] = { ...createUnit(type, 'player', position, idCounters), id: unitId, ...overrides };
  state.civilizations.player.units.push(unitId);
}

function makeCity(id: string, overrides: Partial<NonNullable<GameState['cities'][string]>> = {}): NonNullable<GameState['cities'][string]> {
  return {
    id, name: `City ${id}`, owner: 'player', position: { q: 0, r: 0 },
    population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'outpost',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
    ...overrides,
  };
}

function placeSpy(state: GameState, civId: string, spyId: string, overrides: Partial<Spy> = {}): void {
  const spy: Spy = {
    id: spyId, owner: civId, name: `Agent ${spyId}`, unitType: 'spy_scout',
    targetCivId: null, targetCityId: null, position: null,
    status: 'idle', experience: 0, currentMission: null,
    cooldownTurns: 0, promotion: undefined, promotionAvailable: false,
    feedsFalseIntel: false,
    ...overrides,
  };
  const existing = state.espionage?.[civId] ?? createEspionageCivState();
  state.espionage = { ...state.espionage, [civId]: { ...existing, spies: { ...existing.spies, [spyId]: spy } } };
}

function makeDeps(state: GameState, overrides: Partial<PlayerActionControllerDeps> = {}) {
  return {
    session: createGameSession(state),
    bus: new EventBus(),
    uiLayer: document.createElement('div'),
    selection: { getSelectedUnitId: vi.fn(() => null) },
    selectionController: {
      selectUnit: vi.fn(), deselectUnit: vi.fn(), selectNextUnit: vi.fn(), refreshCurrentPlayerVisibility: vi.fn(),
    },
    turnFlow: { endTurn: vi.fn(() => Promise.resolve()) },
    hud: { update: vi.fn() },
    renderLoop: { camera: { centerOn: vi.fn() }, setGameState: vi.fn() },
    showNotification: vi.fn(),
    setBlockingOverlay: vi.fn(),
    currentCiv: vi.fn(() => state.civilizations[state.currentPlayer]),
    notifier: { choice: vi.fn() },
    ...overrides,
  };
}

function build(state: GameState, overrides: Partial<PlayerActionControllerDeps> = {}) {
  const deps = makeDeps(state, overrides);
  const controller = createPlayerActionController(deps);
  return { deps, controller };
}

describe('PlayerActionController', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getUnitTurnFlow', () => {
    it('routes every callback through the real injected deps instead of stale local references', () => {
      const { state } = makeFixture('unit-turn-flow');
      const { deps, controller } = build(state);

      controller.getUnitTurnFlow();

      expect(createUnitTurnFlow).toHaveBeenCalledTimes(1);
      const flowDeps = mockedCallArg<{
        selectUnit: (unitId: string) => void;
        deselectUnit: () => void;
        selectNextUnit: () => void;
        centerOn: (coord: HexCoord) => void;
        refreshVisibility: () => void;
        endTurn: (options: { allowUnmovedUnits?: boolean }) => void;
        onUnitDisbanded: (state: GameState, unitId: string, routeId: string) => GameState;
      }>(createUnitTurnFlow, 0, 0);

      flowDeps.selectUnit('unit-1');
      expect(deps.selectionController.selectUnit).toHaveBeenCalledWith('unit-1');
      flowDeps.deselectUnit();
      expect(deps.selectionController.deselectUnit).toHaveBeenCalledTimes(1);
      flowDeps.selectNextUnit();
      expect(deps.selectionController.selectNextUnit).toHaveBeenCalledTimes(1);
      flowDeps.refreshVisibility();
      expect(deps.selectionController.refreshCurrentPlayerVisibility).toHaveBeenCalledTimes(1);
      flowDeps.centerOn({ q: 2, r: 2 });
      expect(deps.renderLoop.camera.centerOn).toHaveBeenCalledWith({ q: 2, r: 2 });
      flowDeps.endTurn({ allowUnmovedUnits: true });
      expect(deps.turnFlow.endTurn).toHaveBeenCalledWith({ allowUnmovedUnits: true });

      // onUnitDisbanded delegates to the real removeRouteForUnit -- a unit with no
      // committed route is a real no-op (state returned unchanged), not a stub.
      const result = flowDeps.onUnitDisbanded(deps.session.getState(), 'no-such-unit', 'route-1');
      expect(result).toStrictEqual(deps.session.getState());
    });
  });

  describe('performWorkerAction', () => {
    it('does nothing when no unit is selected', () => {
      const { state } = makeFixture('worker-action-none-selected');
      const { deps, controller } = build(state);

      controller.performWorkerAction('farm');

      expect(deps.showNotification).not.toHaveBeenCalled();
      expect(deps.renderLoop.setGameState).not.toHaveBeenCalled();
    });

    it('applies a real worker action, refreshes the renderer, and reselects the unit', () => {
      const { state } = makeFixture('worker-action-farm');
      state.map.tiles['0,0'] = {
        coord: { q: 0, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
      placeUnit(state, 'worker', 'worker-1', { q: 0, r: 0 });
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'worker-1') } });

      controller.performWorkerAction('farm');

      expect(deps.session.getState().map.tiles['0,0'].improvement === 'farm'
        || deps.session.getState().map.tiles['0,0'].improvementTurnsLeft > 0).toBe(true);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.hud.update).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.any(String), expect.any(String));
    });
  });

  describe('performPreach', () => {
    it('does nothing when the real preach guard rejects the attempt (not a missionary)', () => {
      const { state } = makeFixture('preach-invalid');
      state.cities['test-city'] = makeCity('test-city');
      placeUnit(state, 'warrior', 'warrior-1', { q: 0, r: 0 });
      const { deps, controller } = build(state);

      controller.performPreach('warrior-1', 'test-city');

      expect(deps.selectionController.selectUnit).not.toHaveBeenCalled();
      expect(deps.showNotification).not.toHaveBeenCalled();
    });

    it('commits a real successful conversion, reselects the missionary, and notifies (not consumed)', () => {
      const { state: baseState, civId, templeCity, otherCity } = makeReligionFixture();
      const bus = new EventBus();
      let state = foundReligion(baseState, civId, templeCity, bus);
      // Discover the target city so the real `hasDiscoveredCity` guard passes.
      state = {
        ...state,
        civilizations: {
          ...state.civilizations,
          [civId]: {
            ...state.civilizations[civId],
            visibility: { tiles: { [hexKey(state.cities[otherCity].position)]: 'visible' } },
          },
        },
      };
      const missionary = createUnit('missionary', civId, state.cities[otherCity].position, state.idCounters);
      missionary.chargesRemaining = 2;
      state.units[missionary.id] = missionary;
      state.civilizations[civId].units.push(missionary.id);
      state.currentPlayer = civId;

      const { deps, controller } = build(state, { bus });

      controller.performPreach(missionary.id, otherCity);

      const updated = deps.session.getState();
      expect(updated.cityFaith?.[otherCity]?.religionId).toBe(`religion-${civId}`);
      expect(deps.selectionController.selectUnit).toHaveBeenCalledWith(missionary.id);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('preached'), 'info');
      expect(deps.setBlockingOverlay).not.toHaveBeenCalled();
    });
  });

  describe('ensurePlayerWarState', () => {
    it('declares war bilaterally against a major civ not already at war', () => {
      const { state, aiCivId } = makeFixture('war-state-declare');
      const { deps, controller } = build(state);

      controller.ensurePlayerWarState(aiCivId);

      const updated = deps.session.getState();
      expect(updated.civilizations.player.diplomacy.atWarWith).toContain(aiCivId);
      expect(updated.civilizations[aiCivId].diplomacy.atWarWith).toContain('player');
    });

    it('does nothing when the two civs are already at war (no duplicate atWarWith entries)', () => {
      const { state, aiCivId } = makeFixture('war-state-already-at-war');
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations[aiCivId].diplomacy.atWarWith = ['player'];
      const { deps, controller } = build(state);

      controller.ensurePlayerWarState(aiCivId);

      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toEqual([aiCivId]);
    });

    it('does nothing for a non-major-civ target (e.g. a minor civ or barbarian id)', () => {
      const { state } = makeFixture('war-state-non-major');
      const { deps, controller } = build(state);

      controller.ensurePlayerWarState('barbarians');

      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toEqual([]);
    });
  });

  describe('restAction', () => {
    it('does nothing when no unit is selected', () => {
      const { deps, controller } = build(makeFixture('rest-none-selected').state);

      controller.restAction();

      expect(deps.showNotification).not.toHaveBeenCalled();
    });

    it('does nothing when the selected unit is already at full health', () => {
      const { state } = makeFixture('rest-full-health');
      placeUnit(state, 'warrior', 'warrior-1', { q: 0, r: 0 }, { health: 100 });
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'warrior-1') } });

      controller.restAction();

      expect(deps.showNotification).not.toHaveBeenCalled();
      expect(deps.session.getState().units['warrior-1'].isResting).toBeFalsy();
    });

    it('rests a real damaged unit, heals via restUnit, and deselects', () => {
      const { state } = makeFixture('rest-damaged');
      placeUnit(state, 'warrior', 'warrior-1', { q: 0, r: 0 }, { health: 50 });
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'warrior-1') } });

      controller.restAction();

      expect(deps.session.getState().units['warrior-1'].isResting).toBe(true);
      expect(deps.selectionController.deselectUnit).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('heal'), 'info');
    });
  });

  describe('showEspionageCaptureChoice', () => {
    it('does nothing when the target spy does not exist', () => {
      const { state, aiCivId } = makeFixture('espionage-choice-missing-spy');
      const { deps, controller } = build(state);

      controller.showEspionageCaptureChoice('no-such-spy', aiCivId);

      expect(deps.notifier.choice).not.toHaveBeenCalled();
    });

    it('presents Expel/Execute/Interrogate and expels a real spy to a real capital on Expel', () => {
      const { state, aiCivId } = makeFixture('espionage-choice-expel');
      state.cities['capital-city'] = makeCity('capital-city', { owner: aiCivId });
      state.civilizations[aiCivId].cities = ['capital-city'];
      placeSpy(state, 'player', 'captor-esp-seed'); // ensures espionage.player exists as captor
      placeSpy(state, aiCivId, 'spy-1', { status: 'stationed', unitType: 'spy_scout' });
      const { deps, controller } = build(state);

      controller.showEspionageCaptureChoice('spy-1', aiCivId);

      expect(deps.notifier.choice).toHaveBeenCalledTimes(1);
      const actions = mockedCallArg<Array<{ label: string; onClick: () => void }>>(deps.notifier.choice, 0, 1);
      expect(actions.map(a => a.label)).toEqual([
        expect.stringContaining('Expel'), 'Execute', 'Interrogate (4 turns)',
      ]);

      actions[0].onClick();

      const updated = deps.session.getState();
      expect(updated.espionage![aiCivId].spies['spy-1']).toBeUndefined();
      const expelledSpy = Object.values(updated.espionage![aiCivId].spies).find(spy => spy.name === 'Agent spy-1');
      expect(expelledSpy).toBeDefined();
      expect(updated.units[expelledSpy!.id].position).toEqual(state.cities['capital-city'].position);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('expelled'), 'info');
    });
  });
});
