import { describe, expect, it } from 'vitest';
import type { City, GameState, HexTile, Unit } from '@/core/types';
import { recalculateTerritory } from '@/systems/city-territory-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { applyWorkerAction, clearCompletedWorkerTasksForImprovement, getWorkerChargesRemaining } from '@/systems/worker-action-system';

function tile(overrides: Partial<HexTile>): HexTile {
  return {
    coord: { q: 0, r: 0 },
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: 'player',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    ...overrides,
  };
}

function city(overrides: Partial<City>): City {
  return {
    id: 'city-1',
    name: 'Capital',
    owner: 'player',
    position: { q: 0, r: 1 },
    population: 1,
    food: 0,
    foodNeeded: 20,
    buildings: [],
    productionQueue: ['worker'],
    productionProgress: 0,
    ownedTiles: [{ q: 0, r: 0 }],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
    grid: Array.from({ length: 7 }, () => Array.from({ length: 7 }, () => null)),
    gridSize: 3,
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
    ...overrides,
  };
}

function worker(overrides: Partial<Unit>): Unit {
  return {
    id: 'worker-1',
    type: 'worker',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    health: 100,
    experience: 0,
    hasMoved: false,
    hasActed: false,
    isResting: false,
    chargesRemaining: 2,
    ...overrides,
  };
}

function state(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 3,
    era: 1,
    gameId: 'test-game',
    currentPlayer: 'player',
    gameOver: false,
    winner: null,
    map: {
      width: 5,
      height: 5,
      wrapsHorizontally: false,
      rivers: [],
      tiles: {
        '0,0': tile({ coord: { q: 0, r: 0 } }),
      },
    },
    units: { 'worker-1': worker({}) },
    cities: { 'city-1': city({}) },
    civilizations: {
      player: {
        id: 'player',
        name: 'Player',
        color: '#4a90d9',
        isHuman: true,
        civType: 'generic',
        cities: ['city-1'],
        units: ['worker-1'],
        techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
        gold: 0,
        visibility: { tiles: {} },
        knownCivilizations: [],
        score: 0,
        diplomacy: createDiplomacyState(['player'], 'player'),
      },
    },
    barbarianCamps: {},
    minorCivs: {},
    tutorial: { active: false, currentStep: 'welcome', completedSteps: [] },
    settings: {
      mapSize: 'small',
      soundEnabled: true,
      musicEnabled: true,
      musicVolume: 0.5,
      sfxVolume: 0.7,
      tutorialEnabled: false,
      advisorsEnabled: {} as any,
      councilTalkLevel: 'normal',
    },
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    legendaryWonderHistory: { destroyedStrongholds: [], discoveredSites: [] },
    legendaryWonderIntel: {},
    embargoes: [],
    defensiveLeagues: [],
    pendingDiplomacyRequests: [],
    ...overrides,
  };
}

describe('worker action system', () => {
  it('treats legacy workers without chargesRemaining as two-charge workers', () => {
    expect(getWorkerChargesRemaining(worker({ chargesRemaining: undefined }))).toBe(2);
  });

  it('builds lumber camp, keeps forest, and consumes one charge', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'forest' });

    const result = applyWorkerAction(start, 'worker-1', 'lumber_camp');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0']).toMatchObject({
      terrain: 'forest',
      improvement: 'lumber_camp',
      improvementTurnsLeft: 5,
    });
    expect(result.state.units['worker-1']?.chargesRemaining).toBe(1);
    expect(result.events).toContainEqual({
      type: 'improvement:started',
      payload: { unitId: 'worker-1', coord: { q: 0, r: 0 }, type: 'lumber_camp' },
    });
  });

  it('builds watermill only on river land and consumes one charge', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'plains', hasRiver: true });

    const result = applyWorkerAction(start, 'worker-1', 'watermill');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0']).toMatchObject({
      terrain: 'plains',
      improvement: 'watermill',
      improvementTurnsLeft: 5,
    });
    expect(result.state.units['worker-1']?.chargesRemaining).toBe(1);
  });

  it('records an active worker task when an improvement starts', () => {
    const start = state();

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units['worker-1']?.workerTask).toEqual({
      action: 'farm',
      coord: { q: 0, r: 0 },
    });
  });

  it('clears the active worker task when its improvement completes', () => {
    const start = state();
    start.units['worker-1'] = worker({
      position: { q: 0, r: 0 },
      workerTask: { action: 'farm', coord: { q: 0, r: 0 } },
    });
    start.map.tiles['0,0'].improvement = 'farm';
    start.map.tiles['0,0'].improvementTurnsLeft = 0;

    const result = clearCompletedWorkerTasksForImprovement(start, { q: 0, r: 0 });

    expect(result.units['worker-1'].workerTask).toBeUndefined();
  });

  it('keeps a worker busy while the assigned improvement still has turns left', () => {
    const start = state();
    start.units['worker-1'] = worker({
      position: { q: 0, r: 0 },
      workerTask: { action: 'farm', coord: { q: 0, r: 0 } },
    });
    start.map.tiles['0,0'].improvement = 'farm';
    start.map.tiles['0,0'].improvementTurnsLeft = 2;

    const result = clearCompletedWorkerTasksForImprovement(start, { q: 0, r: 0 });

    expect(result.units['worker-1'].workerTask).toEqual({ action: 'farm', coord: { q: 0, r: 0 } });
  });

  it('cancels in-progress improvement and clears worker task when territory flips', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'plains', owner: 'player', improvement: 'farm', improvementTurnsLeft: 3 });
    start.units['worker-1'] = worker({ workerTask: { action: 'farm', coord: { q: 0, r: 0 } } });
    start.civilizations['ai-1'] = {
      ...start.civilizations.player,
      id: 'ai-1',
      name: 'AI',
      isHuman: false,
      cities: [],
      units: [],
      diplomacy: createDiplomacyState(['player', 'ai-1'], 'ai-1'),
    };
    start.cities['enemy-city'] = city({ id: 'enemy-city', owner: 'ai-1', position: { q: 1, r: 0 }, population: 8, maturity: 'town', ownedTiles: [] });
    start.civilizations['ai-1'].cities.push('enemy-city');

    const result = recalculateTerritory(start, { reason: 'turn', preserveCurrentHolderOnTie: true });

    expect(result.state.map.tiles['0,0']).toMatchObject({ owner: 'ai-1', improvement: 'none', improvementTurnsLeft: 0 });
    expect(result.state.units['worker-1'].workerTask).toBeUndefined();
  });

  it('converts forest farm to plains and grants production to nearest owned city', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'forest' });
    start.cities['city-2'] = city({
      id: 'city-2',
      name: 'Far City',
      position: { q: 4, r: 4 },
      ownedTiles: [{ q: 0, r: 0 }],
      productionProgress: 0,
    });
    start.civilizations.player.cities = ['city-1', 'city-2'];

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0']).toMatchObject({
      terrain: 'plains',
      improvement: 'farm',
      improvementTurnsLeft: 4,
    });
    expect(result.state.cities['city-1'].productionProgress).toBe(20);
    expect(result.state.cities['city-2'].productionProgress).toBe(0);
  });

  it('does not grant forest production burst when farming grassland', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'grassland' });

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0'].terrain).toBe('grassland');
    expect(result.state.cities['city-1'].productionProgress).toBe(0);
  });

  it('rejects worker actions on unowned tiles', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'forest', owner: null });

    const result = applyWorkerAction(start, 'worker-1', 'lumber_camp');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('outside-territory');
    expect(result.state.map.tiles['0,0']).toMatchObject({ terrain: 'forest', improvement: 'none' });
  });

  it('rejects worker actions on enemy-owned tiles', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'forest', owner: 'enemy' });

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('outside-territory');
    expect(result.state.cities['city-1'].productionProgress).toBe(0);
  });

  it('returns outside-territory for valid terrain outside worker territory', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'forest', owner: 'enemy' });

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('outside-territory');
  });

  it('rejects worker improvements on a city-center tile even when the terrain is otherwise valid', () => {
    const start = state();
    start.cities['city-1'] = city({ position: { q: 0, r: 0 }, ownedTiles: [{ q: 0, r: 0 }] });
    start.map.tiles['0,0'] = tile({ terrain: 'plains', owner: 'player' });
    start.units['worker-1'] = worker({ position: { q: 0, r: 0 } });

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('invalid-action');
    expect(result.state.map.tiles['0,0']).toMatchObject({ improvement: 'none', improvementTurnsLeft: 0 });
    expect(result.state.units['worker-1']).toBeDefined();
  });

  it('still allows worker improvements on owned non-city tiles', () => {
    const start = state();
    start.cities['city-1'] = city({ position: { q: 0, r: 1 }, ownedTiles: [{ q: 0, r: 0 }, { q: 0, r: 1 }] });
    start.map.tiles['0,0'] = tile({ terrain: 'plains', owner: 'player' });
    start.units['worker-1'] = worker({ position: { q: 0, r: 0 } });

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0']).toMatchObject({ improvement: 'farm', improvementTurnsLeft: 4 });
  });

  it('drains swamp to grassland without placing an improvement when the worker survives', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'swamp' });

    const result = applyWorkerAction(start, 'worker-1', 'drain_swamp', { rng: () => 0.95 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0']).toMatchObject({
      terrain: 'grassland',
      improvement: 'none',
      improvementTurnsLeft: 0,
    });
    expect(result.state.units['worker-1']?.chargesRemaining).toBe(1);
  });

  it('drains swamp and removes the worker on a dangerous roll', () => {
    const start = state();
    start.map.tiles['0,0'] = tile({ terrain: 'swamp' });

    const result = applyWorkerAction(start, 'worker-1', 'drain_swamp', { rng: () => 0.05 });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0'].terrain).toBe('grassland');
    expect(result.state.units['worker-1']).toBeUndefined();
    expect(result.state.civilizations.player.units).not.toContain('worker-1');
    expect(result.workerLost).toBe(true);
  });

  it('removes a worker after spending its final charge', () => {
    const start = state();
    start.units['worker-1'] = worker({ chargesRemaining: 1 });
    start.map.tiles['0,0'] = tile({ terrain: 'forest' });

    const result = applyWorkerAction(start, 'worker-1', 'lumber_camp');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.units['worker-1']).toBeUndefined();
    expect(result.state.civilizations.player.units).not.toContain('worker-1');
    expect(result.workerConsumed).toBe(true);
  });

  it('rejects actions from workers with no charges left', () => {
    const start = state();
    start.units['worker-1'] = worker({ chargesRemaining: 0 });
    start.map.tiles['0,0'] = tile({ terrain: 'forest' });

    const result = applyWorkerAction(start, 'worker-1', 'lumber_camp');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('no-charges');
    expect(result.state.map.tiles['0,0']).toMatchObject({ terrain: 'forest', improvement: 'none' });
    expect(result.state.units['worker-1']).toBeDefined();
  });

  it('rejects repeat-click mutation after the worker has already been removed', () => {
    const start = state({
      units: {},
      civilizations: {
        ...state().civilizations,
        player: { ...state().civilizations.player, units: [] },
      },
    });

    const result = applyWorkerAction(start, 'worker-1', 'farm');

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe('missing-unit');
  });
});
