// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { createGameSession } from '@/app/game-session';
import { createUnit } from '@/systems/unit-system';
import { createEspionageCivState } from '@/systems/espionage-system';
import { foundReligion } from '@/systems/religion-system';
import { hexKey } from '@/systems/hex-utils';
import { foundCity } from '@/systems/city-system';
import { makeReligionFixture } from '../../systems/helpers/religion-fixture';
import type { GameState, HexCoord, Spy } from '@/core/types';
import type { ExecuteUnitMoveResult } from '@/systems/unit-movement-system';
import {
  createPlayerActionController,
  type PlayerActionControllerDeps,
} from '@/app/controllers/player-action-controller';

function fakeSuccessfulMove(): ExecuteUnitMoveResult {
  return { ok: true, from: { q: 0, r: 0 }, to: { q: 0, r: 0 }, path: [], revealedTiles: [], discoveredWonders: [] };
}

function fakeFailedMove(message: string): ExecuteUnitMoveResult {
  return {
    ok: false, from: { q: 0, r: 0 }, to: { q: 0, r: 0 }, path: [],
    reason: 'missing-unit', message, revealedTiles: [], discoveredWonders: [],
  };
}

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
    selection: { getSelectedUnitId: vi.fn(() => null), setPendingIntent: vi.fn() },
    selectionController: {
      selectUnit: vi.fn(), deselectUnit: vi.fn(), selectNextUnit: vi.fn(), refreshCurrentPlayerVisibility: vi.fn(),
      executeAnimatedUnitMove: vi.fn(() => fakeSuccessfulMove()), refreshSelectedUnitAfterCombat: vi.fn(),
    },
    turnFlow: { endTurn: vi.fn(() => Promise.resolve()), finalizePendingCityCaptureChoice: vi.fn() },
    hud: { update: vi.fn() },
    renderLoop: { camera: { centerOn: vi.fn() }, setGameState: vi.fn(), animations: { add: vi.fn() } },
    showNotification: vi.fn(),
    setBlockingOverlay: vi.fn(),
    currentCiv: vi.fn(() => state.civilizations[state.currentPlayer]),
    notifier: { choice: vi.fn() },
    advisorSystem: { resetMessage: vi.fn(), check: vi.fn() },
    maybeShowPendingHoardChoice: vi.fn(),
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
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'worker-1'), setPendingIntent: vi.fn() } });

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
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'warrior-1'), setPendingIntent: vi.fn() } });

      controller.restAction();

      expect(deps.showNotification).not.toHaveBeenCalled();
      expect(deps.session.getState().units['warrior-1'].isResting).toBeFalsy();
    });

    it('rests a real damaged unit, heals via restUnit, and deselects', () => {
      const { state } = makeFixture('rest-damaged');
      placeUnit(state, 'warrior', 'warrior-1', { q: 0, r: 0 }, { health: 50 });
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'warrior-1'), setPendingIntent: vi.fn() } });

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

  // #787 phase 13: the five functions below were "the mutation that runs
  // after the player confirms a preview or dialog" -- executeAttack
  // (combat-preview's Attack button), beginPlayerCityAssault
  // (assault-preview's Attack button / city-capture-panel's Occupy/Raze),
  // executeMinorCivConquest (confirm-war dialog), foundCityAction and
  // executeUpgrade (selected-unit info panel buttons). They stayed
  // main.ts-local through 10b-a..10b-g because they were never in Phase 8's
  // own Files section for SelectionController/MapInteractionController --
  // see the module docblock above. These tests replace
  // tests/main.integration.test.ts's four grep-based describe blocks
  // (`player combat wiring`, `shared city founding wiring`, `shared unit
  // upgrade wiring`, `shared city assault wiring`) with real behavioral
  // coverage.

  describe('executeAttack', () => {
    // `state.gameId` embeds `Date.now()` (see `createGameId`), so two
    // separate `createNewGame()` calls never share a seed even with the
    // same seed string -- build one base state and clone it per variant so
    // gameId/map/unit ids stay identical and only `turn` varies.
    function buildCombatBaseState(seedName: string): GameState {
      const state = createNewGame(undefined, seedName, 'small');
      state.currentPlayer = 'player';
      const aiCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
      const counters = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
      const attacker = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, counters), id: 'attacker-1' };
      const defender = { ...createUnit('warrior', aiCivId, { q: 1, r: 0 }, counters), id: 'defender-1' };
      state.units = { [attacker.id]: attacker, [defender.id]: defender };
      state.civilizations.player.units = [attacker.id];
      state.civilizations[aiCivId].units = [defender.id];
      state.civilizations.player.diplomacy.atWarWith = [aiCivId];
      state.civilizations.player.visibility.tiles[hexKey(defender.position)] = 'visible';
      return state;
    }

    function runCombat(baseState: GameState, turn: number) {
      const state = structuredClone(baseState);
      state.turn = turn;
      const { deps, controller } = build(state);
      controller.executeAttack('attacker-1', hexKey(state.units['defender-1']!.position));
      return { deps, controller, state };
    }

    function combatOutcome(run: ReturnType<typeof runCombat>): string {
      const finalState = run.deps.session.getState();
      return JSON.stringify({
        attacker: finalState.units['attacker-1']?.health ?? 'dead',
        defender: finalState.units['defender-1']?.health ?? 'dead',
      });
    }

    it('derives the combat seed from game id, turn, and unit pair', () => {
      const base = buildCombatBaseState('combat-seed-determinism');
      const runA = runCombat(base, 5);
      const runB = runCombat(base, 5);

      // Identical gameId/map (cloned from the same base state), turn, and
      // unit pair -> identical seed -> identical outcome.
      expect(combatOutcome(runB)).toEqual(combatOutcome(runA));

      // Sweeping the turn number -- the seed's other real input besides
      // gameId/unit ids -- must produce at least one different outcome,
      // proving the seed genuinely depends on turn rather than being
      // effectively constant for this unit pair.
      const outcomes = new Set([combatOutcome(runA)]);
      for (let turn = 1; turn <= 12; turn++) {
        outcomes.add(combatOutcome(runCombat(base, turn)));
      }
      expect(outcomes.size).toBeGreaterThan(1);
    });

    it('refreshes the open selected-unit panel from post-combat state before delayed selection', () => {
      const base = buildCombatBaseState('attack-refresh-ordering');
      base.units['defender-1']!.health = 1;
      base.cities = {}; // no city at the target -- exercises the non-capture tail, not the branch below
      const { deps } = runCombat(base, 1);

      expect(deps.selectionController.refreshSelectedUnitAfterCombat).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.animations.add).toHaveBeenCalledTimes(1);
      // selectNextUnit is wired as the animation's completion callback, not
      // called synchronously -- it must not have run yet.
      expect(deps.selectionController.selectNextUnit).not.toHaveBeenCalled();
      const onComplete = mockedCallArg<() => void>(deps.renderLoop.animations.add, 0, 3);
      onComplete();
      expect(deps.selectionController.selectNextUnit).toHaveBeenCalledTimes(1);
    });

    it('refreshes the open selected-unit panel before returning through the city-capture branch', () => {
      const base = buildCombatBaseState('attack-refresh-city-capture');
      const aiCivId = base.units['defender-1']!.owner;
      base.units['defender-1']!.health = 1;
      base.cities['target-city'] = makeCity('target-city', { owner: aiCivId, position: base.units['defender-1']!.position, population: 3 });
      base.civilizations[aiCivId].cities = ['target-city'];
      const { deps } = runCombat(base, 1);

      expect(deps.selectionController.refreshSelectedUnitAfterCombat).toHaveBeenCalledTimes(1);
      // The city-capture branch returns early -- the bottom combat-flash
      // animation (and its own selectNextUnit wiring) must not also fire.
      expect(deps.renderLoop.animations.add).not.toHaveBeenCalled();
    });
  });

  describe('foundCityAction', () => {
    function setupFoundCity(seedName: string) {
      const state = createNewGame(undefined, seedName, 'small');
      state.currentPlayer = 'player';
      const civ = state.civilizations.player;
      const settler = civ.units.map(id => state.units[id]).find(Boolean)!;
      settler.id = 'settler-1';
      settler.type = 'settler';
      state.units = { [settler.id]: settler };
      civ.units = [settler.id];
      return { state, settler };
    }

    it('founds a city via foundCityInState with no ad hoc mutations', () => {
      const { state } = setupFoundCity('found-city-happy');
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'settler-1'), setPendingIntent: vi.fn() } });

      controller.foundCityAction();

      const updated = deps.session.getState();
      const newCity = Object.values(updated.cities).find(c => c.owner === 'player');
      expect(newCity).toBeDefined();
      expect(updated.units['settler-1']).toBeUndefined();
      expect(deps.selectionController.deselectUnit).toHaveBeenCalledTimes(1);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('founded'), 'success');
      expect(deps.hud.update).toHaveBeenCalled();
    });

    it('warns and does not found a city when blockers exist', () => {
      const { state, settler } = setupFoundCity('found-city-blocked');
      const cityCountBefore = Object.keys(state.cities).length;
      // A city already sits at the settler's exact position -- guarantees a
      // 'too-close' blocker regardless of generated terrain specifics.
      state.cities['blocking-city'] = makeCity('blocking-city', { owner: 'player', position: settler.position });
      state.civilizations.player.cities = ['blocking-city'];
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'settler-1'), setPendingIntent: vi.fn() } });

      controller.foundCityAction();

      expect(deps.session.getState().units['settler-1']).toBeDefined();
      // Only the one city added above -- no new city was founded.
      expect(Object.keys(deps.session.getState().cities)).toHaveLength(cityCountBefore + 1);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('close'), 'warning');
      expect(deps.selectionController.deselectUnit).not.toHaveBeenCalled();
    });
  });

  describe('executeUpgrade', () => {
    function setupUpgrade(seedName: string) {
      const state = createNewGame(undefined, seedName, 'small');
      state.currentPlayer = 'player';
      const civ = state.civilizations.player;
      const source = civ.units.map(id => state.units[id]).find(Boolean)!;
      const city = foundCity(civ.id, source.position, state.map, state.idCounters);
      state.cities[city.id] = city;
      civ.cities = [city.id];
      source.id = 'upgrade-unit';
      source.type = 'spy_scout';
      source.health = 41;
      state.units = { [source.id]: source };
      civ.units = [source.id];
      civ.techState.completed = ['espionage-scouting', 'espionage-informants'];
      civ.gold = 100;
      return { state };
    }

    it('delegates a legal upgrade to the canonical whole-state mutation and commits it', () => {
      const { state } = setupUpgrade('upgrade-happy');
      const { deps, controller } = build(state);
      const goldBefore = deps.session.getState().civilizations.player.gold;

      const result = controller.executeUpgrade('upgrade-unit', 'spy_informant');

      expect(result).toBe(true);
      const updated = deps.session.getState();
      expect(updated.units['upgrade-unit'].type).toBe('spy_informant');
      // Proves the real cost was deducted by applyUnitUpgradeToState itself --
      // not an ad hoc gold mutation living in the controller.
      expect(updated.civilizations.player.gold).toBeLessThan(goldBefore);
    });

    it('returns false and does not commit when the upgrade is not legal', () => {
      const { state } = setupUpgrade('upgrade-illegal');
      state.civilizations.player.techState.completed = []; // revoke the required tech
      const { deps, controller } = build(state);

      const result = controller.executeUpgrade('upgrade-unit', 'spy_informant');

      expect(result).toBe(false);
      expect(deps.session.getState().units['upgrade-unit'].type).toBe('spy_scout');
    });
  });

  describe('executeMinorCivConquest', () => {
    it('does not resolve minor-civilization conquest after failed movement', () => {
      const { state } = makeFixture('minor-civ-conquest-failed-move');
      const mcId = Object.keys(state.minorCivs)[0]!;
      const { deps, controller } = build(state, {
        selectionController: {
          selectUnit: vi.fn(), deselectUnit: vi.fn(), selectNextUnit: vi.fn(), refreshCurrentPlayerVisibility: vi.fn(),
          refreshSelectedUnitAfterCombat: vi.fn(),
          executeAnimatedUnitMove: vi.fn(() => fakeFailedMove('blocked')),
        },
      });

      controller.executeMinorCivConquest('attacker-1', { q: 0, r: 0 }, mcId, state.minorCivs[mcId].cityId);

      expect(deps.session.getState().minorCivs[mcId].isDestroyed).toBe(false);
      expect(deps.showNotification).not.toHaveBeenCalled();
      expect(deps.hud.update).not.toHaveBeenCalled();
    });

    it('conquers the minor civ and transfers its city after a successful movement', () => {
      const { state } = makeFixture('minor-civ-conquest-success');
      const mcId = Object.keys(state.minorCivs)[0]!;
      const cityId = state.minorCivs[mcId].cityId;
      const { deps, controller } = build(state);

      controller.executeMinorCivConquest('attacker-1', { q: 0, r: 0 }, mcId, cityId);

      const updated = deps.session.getState();
      expect(updated.minorCivs[mcId].isDestroyed).toBe(true);
      expect(updated.cities[cityId]?.owner).toBe('player');
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('conquered'), 'success');
      expect(deps.hud.update).toHaveBeenCalled();
    });
  });

  describe('beginPlayerCityAssault', () => {
    it('returns resolved immediately when the surviving attacker cannot occupy a city', () => {
      const { state, aiCivId } = makeFixture('assault-cannot-occupy');
      placeUnit(state, 'catapult', 'attacker-1', { q: 0, r: 0 });
      state.cities['target-city'] = makeCity('target-city', { owner: aiCivId, position: { q: 1, r: 0 }, population: 3 });
      state.civilizations[aiCivId].cities = ['target-city'];
      const { deps, controller } = build(state);

      const result = controller.beginPlayerCityAssault('attacker-1', 'target-city');

      expect(result).toBe('resolved');
      expect(deps.turnFlow.finalizePendingCityCaptureChoice).not.toHaveBeenCalled();
      // The short-circuit happens before ensurePlayerWarState -- no war declared.
      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).not.toContain(aiCivId);
      expect(deps.session.getState().cities['target-city'].owner).toBe(aiCivId);
    });

    it('routes the fast-path raze through the shared TurnFlow emitter when the city has no population to prompt for', () => {
      const { state, aiCivId } = makeFixture('assault-fast-raze');
      placeUnit(state, 'warrior', 'attacker-1', { q: 0, r: 0 });
      state.cities['target-city'] = makeCity('target-city', { owner: aiCivId, position: { q: 1, r: 0 }, population: 0 });
      state.civilizations[aiCivId].cities = ['target-city'];
      const { deps, controller } = build(state);

      const result = controller.beginPlayerCityAssault('attacker-1', 'target-city');

      expect(result).toBe('resolved');
      // ensurePlayerWarState now runs as a same-file sibling call rather than
      // an injected dep -- proves that wiring survived the move.
      expect(deps.session.getState().civilizations.player.diplomacy.atWarWith).toContain(aiCivId);
      expect(deps.turnFlow.finalizePendingCityCaptureChoice).toHaveBeenCalledWith('raze', undefined);
    });
  });
});
