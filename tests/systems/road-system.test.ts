import { describe, expect, it } from 'vitest';
import type { City, GameState, HexTile, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { applyWorkerAction, clearCompletedWorkerTasksForRoad } from '@/systems/worker-action-system';
import { canBuildRoad, getRoadBlockerReason, getRoadBuildTurns } from '@/systems/road-system';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { EventBus } from '@/core/event-bus';
import { getMovementStepCost, UNIT_DEFINITIONS } from '@/systems/unit-system';

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
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [{ q: 0, r: 0 }],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'outpost',
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
        techState: { completed: ['road-building'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
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
    idCounters: { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 },
    pendingDiplomacyRequests: [],
    ...overrides,
  } as GameState;
}

describe('road build gating', () => {
  it('blocks without road-building tech', () => {
    expect(getRoadBlockerReason(tile({}), [], 'player')).toBe('requires-tech');
    expect(canBuildRoad(tile({}), [], 'player')).toBe(false);
  });

  it('blocks on foreign territory', () => {
    expect(getRoadBlockerReason(tile({ owner: 'rival' }), ['road-building'], 'player')).toBe('outside-territory');
  });

  it('allows neutral (unowned) territory', () => {
    expect(getRoadBlockerReason(tile({ owner: null }), ['road-building'], 'player')).toBe('none');
  });

  it('blocks water terrain', () => {
    expect(getRoadBlockerReason(tile({ terrain: 'ocean' }), ['road-building'], 'player')).toBe('invalid-terrain');
    expect(getRoadBlockerReason(tile({ terrain: 'coast' }), ['road-building'], 'player')).toBe('invalid-terrain');
  });

  it('allows hills (passable land terrain)', () => {
    expect(getRoadBlockerReason(tile({ terrain: 'hills' }), ['road-building'], 'player')).toBe('none');
  });

  it('blocks a duplicate build on a tile that already has a road', () => {
    expect(getRoadBlockerReason(tile({ hasRoad: true }), ['road-building'], 'player')).toBe('already-has-road');
  });

  it('blocks city-center tiles', () => {
    expect(getRoadBlockerReason(tile({}), ['road-building'], 'player', true)).toBe('city-center');
  });
});

describe('road_corps national project build-speed', () => {
  it('is 2 turns without the project, 1 turn with it active', () => {
    expect(getRoadBuildTurns(false)).toBe(2);
    expect(getRoadBuildTurns(true)).toBe(1);
  });
});

describe('applyWorkerAction: build_road', () => {
  it('starts a 2-turn road build and consumes a worker charge', () => {
    const result = applyWorkerAction(state(), 'worker-1', 'build_road');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.map.tiles['0,0'].roadTurnsLeft).toBe(2);
    expect(result.state.map.tiles['0,0'].hasRoad).toBeFalsy();
    expect(result.chargesRemaining).toBe(1);
    expect(result.workerConsumed).toBe(false);
    expect(result.events).toEqual([{ type: 'road:started', payload: { unitId: 'worker-1', coord: { q: 0, r: 0 } } }]);
  });

  it('consumes the worker on its last charge', () => {
    const s = state({ units: { 'worker-1': worker({ chargesRemaining: 1 }) } });
    const result = applyWorkerAction(s, 'worker-1', 'build_road');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workerConsumed).toBe(true);
    expect(result.state.units['worker-1']).toBeUndefined();
  });

  it('completes after 2 turns via processImprovementTurns, emitting road:completed exactly once', () => {
    let s = applyWorkerAction(state(), 'worker-1', 'build_road');
    expect(s.ok).toBe(true);
    if (!s.ok) return;

    const bus = new EventBus();
    let completedCount = 0;
    bus.on('road:completed', () => { completedCount += 1; });

    let next = processImprovementTurns(s.state, bus);
    expect(next.map.tiles['0,0'].hasRoad).toBeFalsy();
    expect(next.map.tiles['0,0'].roadTurnsLeft).toBe(1);
    expect(completedCount).toBe(0);

    next = processImprovementTurns(next, bus);
    expect(next.map.tiles['0,0'].hasRoad).toBe(true);
    expect(completedCount).toBe(1);

    // Steady-state scans must not re-fire the completion event.
    next = processImprovementTurns(next, bus);
    expect(completedCount).toBe(1);
  });

  it('road_corps national project completes the road in 1 turn', () => {
    const s = state({
      builtNationalProjects: { 'player:road_corps': { civId: 'player', cityId: 'city-1', eraBuilt: 1 } },
    } as Partial<GameState>);
    const started = applyWorkerAction(s, 'worker-1', 'build_road');
    expect(started.ok).toBe(true);
    if (!started.ok) return;
    expect(started.state.map.tiles['0,0'].roadTurnsLeft).toBe(1);

    const bus = new EventBus();
    const next = processImprovementTurns(started.state, bus);
    expect(next.map.tiles['0,0'].hasRoad).toBe(true);
  });

  it('clearCompletedWorkerTasksForRoad clears the worker task once the road finishes', () => {
    const s = applyWorkerAction(state(), 'worker-1', 'build_road');
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    const finishedTile = { ...s.state.map.tiles['0,0'], roadTurnsLeft: 0, hasRoad: true };
    const withFinishedTile = { ...s.state, map: { ...s.state.map, tiles: { ...s.state.map.tiles, '0,0': finishedTile } } };
    const cleared = clearCompletedWorkerTasksForRoad(withFinishedTile, { q: 0, r: 0 });
    expect(cleared.units['worker-1'].workerTask).toBeUndefined();
  });
});

describe('road movement cost stacking (see .claude/rules/game-balance.md)', () => {
  const map = {
    width: 5,
    height: 5,
    wrapsHorizontally: false,
    rivers: [] as any[],
    tiles: {
      '1,0': tile({ coord: { q: 1, r: 0 }, terrain: 'hills', hasRoad: true, owner: 'player' }),
    },
  };
  const from = { q: 0, r: 0 };
  const to = { q: 1, r: 0 };

  function landUnit(overrides: Partial<Unit> = {}): Unit {
    return worker({ type: 'warrior' as Unit['type'], ...overrides });
  }

  it('costs 1 movement over hills with a road, regardless of terrain', () => {
    expect(UNIT_DEFINITIONS.warrior.domain ?? 'land').toBe('land');
    const cost = getMovementStepCost(landUnit(), map as any, from, to, { completedTechs: [] });
    expect(cost).toBe(1);
  });

  it('costs 0.5 with military-logistics', () => {
    const cost = getMovementStepCost(landUnit(), map as any, from, to, { completedTechs: ['military-logistics'] });
    expect(cost).toBe(0.5);
  });

  it('costs 0.5 with railway-expansion', () => {
    const cost = getMovementStepCost(landUnit(), map as any, from, to, { completedTechs: ['railway-expansion'] });
    expect(cost).toBe(0.5);
  });

  it('does not stack: both techs together still cost 0.5, never 0.25', () => {
    const cost = getMovementStepCost(landUnit(), map as any, from, to, { completedTechs: ['military-logistics', 'railway-expansion'] });
    expect(cost).toBe(0.5);
  });

  it('river crossing without bridge-building still adds +1 even on a road', () => {
    const riverMap = { ...map, rivers: [{ from, to }] };
    const cost = getMovementStepCost(landUnit(), riverMap as any, from, to, { completedTechs: [] });
    expect(cost).toBe(2);
  });

  it('does not affect naval or air units (negative)', () => {
    const navalCost = getMovementStepCost(worker({ type: 'galley' as Unit['type'] }), map as any, from, to, { completedTechs: [] });
    expect(navalCost).toBe(Infinity); // hills is not ocean/coast — road never applies to naval domain
  });
});

describe('gps-navigation terrain-cost override', () => {
  const hillsMap = {
    width: 5,
    height: 5,
    wrapsHorizontally: false,
    rivers: [] as any[],
    tiles: {
      '1,0': tile({ coord: { q: 1, r: 0 }, terrain: 'hills', hasRoad: false, owner: 'player' }),
    },
  };
  const from = { q: 0, r: 0 };
  const to = { q: 1, r: 0 };

  it('ignores hills extra cost in own territory with the tech', () => {
    const cost = getMovementStepCost(worker({ type: 'warrior' as Unit['type'] }), hillsMap as any, from, to, { completedTechs: ['gps-navigation'] });
    expect(cost).toBe(1);
  });

  it('does not apply in foreign territory (negative)', () => {
    const foreignMap = {
      ...hillsMap,
      tiles: { '1,0': { ...hillsMap.tiles['1,0'], owner: 'rival' } },
    };
    const cost = getMovementStepCost(worker({ type: 'warrior' as Unit['type'] }), foreignMap as any, from, to, { completedTechs: ['gps-navigation'] });
    expect(cost).toBe(2); // normal hills cost
  });
});

describe('save-compat: legacy tiles without hasRoad', () => {
  it('normalizes cleanly and behaves as no-road', () => {
    const legacyTile = tile({ hasRoad: undefined, roadTurnsLeft: undefined });
    expect(legacyTile.hasRoad).toBeUndefined();
    expect(getRoadBlockerReason(legacyTile, ['road-building'], 'player')).toBe('none');
    const cost = getMovementStepCost(
      { ...worker({}), type: 'warrior' as Unit['type'] },
      { width: 1, height: 1, wrapsHorizontally: false, rivers: [], tiles: { '0,0': legacyTile } } as any,
      { q: -1, r: 0 },
      { q: 0, r: 0 },
      { completedTechs: [] },
    );
    expect(cost).toBe(1); // grassland base cost, no road discount applied
  });
});
