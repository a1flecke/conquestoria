import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import {
  hasCompletedWorldRaceComponent,
  getWorldRaceLaunchStatus,
  isWorldRaceUnlocked,
  buildWorldRaceIntelSnapshot,
  processWorldRacesTurn,
} from '@/systems/world-race-system';

const UNLOCK_TECH = 'space-exploration';
const COMPONENT_BUILDING = 'space_program_initiative';
const LAUNCH_BUILDING = 'first_satellite_launch';

function makeCiv(id: string, overrides: Partial<GameState['civilizations'][string]> = {}): GameState['civilizations'][string] {
  return {
    id,
    isHuman: false,
    isEliminated: false,
    cities: [],
    gold: 0,
    civType: 'egypt',
    techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} },
    ...overrides,
  } as unknown as GameState['civilizations'][string];
}

function makeCity(id: string, owner: string, overrides: Partial<GameState['cities'][string]> = {}): GameState['cities'][string] {
  return {
    id,
    owner,
    name: id,
    position: { q: 0, r: 0 },
    population: 3,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    ...overrides,
  } as unknown as GameState['cities'][string];
}

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 11,
    currentPlayer: 'p1',
    settings: {} as GameState['settings'],
    civilizations: {},
    cities: {},
    units: {},
    map: { width: 1, height: 1, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {},
    espionage: {},
    embargoes: [],
    defensiveLeagues: [],
    gameOver: false,
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as unknown as GameState;
}

describe('hasCompletedWorldRaceComponent', () => {
  it('is false with no builtNationalProjects record', () => {
    const state = makeState({ civilizations: { p1: makeCiv('p1') } });
    expect(hasCompletedWorldRaceComponent(state, 'p1', 'first-satellite')).toBe(false);
  });

  it('is true once the civ has built the component national project', () => {
    const state = makeState({
      civilizations: { p1: makeCiv('p1') },
      builtNationalProjects: { [`p1:${COMPONENT_BUILDING}`]: { civId: 'p1', cityId: 'c1', eraBuilt: 11 } },
    });
    expect(hasCompletedWorldRaceComponent(state, 'p1', 'first-satellite')).toBe(true);
  });
});

describe('getWorldRaceLaunchStatus', () => {
  it('reports not-queued with zero progress when nothing is queued', () => {
    const state = makeState({
      civilizations: { p1: makeCiv('p1', { cities: ['c1'] }) },
      cities: { c1: makeCity('c1', 'p1') },
    });
    const status = getWorldRaceLaunchStatus(state, 'p1', 'first-satellite');
    expect(status.queued).toBe(false);
    expect(status.progress).toBe(0);
    expect(status.cost).toBeGreaterThan(0);
  });

  it('reads live progress off the queue head', () => {
    const state = makeState({
      civilizations: { p1: makeCiv('p1', { cities: ['c1'] }) },
      cities: { c1: makeCity('c1', 'p1', { productionQueue: [LAUNCH_BUILDING], productionProgress: 40, name: 'Cairo' }) },
    });
    const status = getWorldRaceLaunchStatus(state, 'p1', 'first-satellite');
    expect(status.queued).toBe(true);
    expect(status.hostCityId).toBe('c1');
    expect(status.hostCityName).toBe('Cairo');
    expect(status.progress).toBe(40);
  });

  it('reports zero progress when the launch building is queued but not yet the active head', () => {
    const state = makeState({
      civilizations: { p1: makeCiv('p1', { cities: ['c1'] }) },
      cities: { c1: makeCity('c1', 'p1', { productionQueue: ['warrior', LAUNCH_BUILDING], productionProgress: 15 }) },
    });
    const status = getWorldRaceLaunchStatus(state, 'p1', 'first-satellite');
    expect(status.queued).toBe(true);
    expect(status.progress).toBe(0);
  });
});

describe('isWorldRaceUnlocked', () => {
  it('is false when no living civ has the unlock tech', () => {
    const state = makeState({ civilizations: { p1: makeCiv('p1') } });
    expect(isWorldRaceUnlocked(state, 'first-satellite')).toBe(false);
  });

  it('is true once any living civ has completed the unlock tech', () => {
    const state = makeState({
      civilizations: { p1: makeCiv('p1', { techState: { completed: [UNLOCK_TECH], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} } as never }) },
    });
    expect(isWorldRaceUnlocked(state, 'first-satellite')).toBe(true);
  });

  it('ignores an eliminated civ that has the tech', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv('p1', { isEliminated: true, techState: { completed: [UNLOCK_TECH], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} } as never }),
      },
    });
    expect(isWorldRaceUnlocked(state, 'first-satellite')).toBe(false);
  });
});

describe('buildWorldRaceIntelSnapshot', () => {
  it('returns undefined for a civ that has not entered any race', () => {
    const state = makeState({ civilizations: { p2: makeCiv('p2', { cities: ['c2'] }) }, cities: { c2: makeCity('c2', 'p2') } });
    expect(buildWorldRaceIntelSnapshot(state, 'p2')).toBeUndefined();
  });

  it('captures component + launch progress once the target has entered', () => {
    const state = makeState({
      civilizations: { p2: makeCiv('p2', { cities: ['c2'] }) },
      cities: { c2: makeCity('c2', 'p2', { productionQueue: [LAUNCH_BUILDING], productionProgress: 25 }) },
      builtNationalProjects: { [`p2:${COMPONENT_BUILDING}`]: { civId: 'p2', cityId: 'c2', eraBuilt: 11 } },
    });
    const snapshot = buildWorldRaceIntelSnapshot(state, 'p2');
    expect(snapshot?.['first-satellite']).toEqual({
      componentBuilt: true,
      launchQueued: true,
      launchProgress: 25,
      launchCost: expect.any(Number),
    });
  });
});

describe('processWorldRacesTurn', () => {
  function withBus() {
    const bus = new EventBus();
    const events: Array<{ type: string; payload: unknown }> = [];
    for (const type of ['worldrace:unlocked', 'worldrace:launch-begun', 'worldrace:completed', 'worldrace:entry-mooted'] as const) {
      bus.on(type, payload => events.push({ type, payload }));
    }
    return { bus, events };
  }

  it('announces "unlocked" exactly once, not again on a later turn', () => {
    const { bus, events } = withBus();
    const state = makeState({
      civilizations: {
        p1: makeCiv('p1', { techState: { completed: [UNLOCK_TECH], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} } as never }),
      },
    });
    const afterTurn1 = processWorldRacesTurn(state, bus);
    expect(events.filter(e => e.type === 'worldrace:unlocked')).toHaveLength(1);
    expect(afterTurn1.worldRaces?.['first-satellite']?.announcedUnlocked).toBe(true);

    events.length = 0;
    processWorldRacesTurn({ ...afterTurn1, turn: 2 }, bus);
    expect(events.filter(e => e.type === 'worldrace:unlocked')).toHaveLength(0);
  });

  it('announces "launch-begun" exactly once when any living civ queues the launch building', () => {
    const { bus, events } = withBus();
    const state = makeState({
      civilizations: { p1: makeCiv('p1', { cities: ['c1'] }) },
      cities: { c1: makeCity('c1', 'p1', { productionQueue: [LAUNCH_BUILDING], productionProgress: 5 }) },
    });
    const afterTurn1 = processWorldRacesTurn(state, bus);
    expect(events.filter(e => e.type === 'worldrace:launch-begun')).toHaveLength(1);

    events.length = 0;
    processWorldRacesTurn({ ...afterTurn1, turn: 2 }, bus);
    expect(events.filter(e => e.type === 'worldrace:launch-begun')).toHaveLength(0);
  });

  it('deterministic tie-break: the alphabetically-first civ with the completed launch building wins', () => {
    const { bus, events } = withBus();
    const state = makeState({
      civilizations: {
        'z-civ': makeCiv('z-civ', { cities: ['c-z'], gold: 0 }),
        'a-civ': makeCiv('a-civ', { cities: ['c-a'], gold: 0 }),
      },
      cities: {
        'c-z': makeCity('c-z', 'z-civ', { buildings: [LAUNCH_BUILDING] }),
        'c-a': makeCity('c-a', 'a-civ', { buildings: [LAUNCH_BUILDING] }),
      },
      builtNationalProjects: {
        [`z-civ:${LAUNCH_BUILDING}`]: { civId: 'z-civ', cityId: 'c-z', eraBuilt: 11 },
        [`a-civ:${LAUNCH_BUILDING}`]: { civId: 'a-civ', cityId: 'c-a', eraBuilt: 11 },
      },
    });

    const result = processWorldRacesTurn(state, bus);

    expect(result.worldRaces?.['first-satellite']?.winnerCivId).toBe('a-civ');
    const completed = events.find(e => e.type === 'worldrace:completed');
    expect((completed?.payload as { winnerCivId: string }).winnerCivId).toBe('a-civ');
    // Winner gets the reward gold, applied exactly once.
    expect(result.civilizations['a-civ'].gold).toBe(200);
  });

  it('strips an already-completed rival building and refunds half its production cost (same-round double completion)', () => {
    const { bus, events } = withBus();
    const cost = 380;
    const state = makeState({
      civilizations: {
        'a-civ': makeCiv('a-civ', { cities: ['c-a'], gold: 0 }),
        'z-civ': makeCiv('z-civ', { cities: ['c-z'], gold: 0 }),
      },
      cities: {
        'c-a': makeCity('c-a', 'a-civ', { buildings: [LAUNCH_BUILDING] }),
        'c-z': makeCity('c-z', 'z-civ', { buildings: [LAUNCH_BUILDING] }),
      },
      builtNationalProjects: {
        [`a-civ:${LAUNCH_BUILDING}`]: { civId: 'a-civ', cityId: 'c-a', eraBuilt: 11 },
        [`z-civ:${LAUNCH_BUILDING}`]: { civId: 'z-civ', cityId: 'c-z', eraBuilt: 11 },
      },
    });

    const result = processWorldRacesTurn(state, bus);

    // The loser (z-civ) never keeps the physical building or its national-project record.
    expect(result.cities['c-z'].buildings).not.toContain(LAUNCH_BUILDING);
    expect(result.builtNationalProjects?.[`z-civ:${LAUNCH_BUILDING}`]).toBeUndefined();
    expect(result.civilizations['z-civ'].gold).toBe(Math.floor(cost / 2));
    const mooted = events.find(e => e.type === 'worldrace:entry-mooted');
    expect(mooted).toBeDefined();
    expect((mooted!.payload as { civId: string }).civId).toBe('z-civ');
    // The winner's own building is untouched.
    expect(result.cities['c-a'].buildings).toContain(LAUNCH_BUILDING);
    expect(result.builtNationalProjects?.[`a-civ:${LAUNCH_BUILDING}`]).toBeDefined();
  });

  it('dequeues and refunds a still-in-progress rival once a winner exists', () => {
    const { bus, events } = withBus();
    const state = makeState({
      civilizations: {
        'a-civ': makeCiv('a-civ', { cities: ['c-a'], gold: 0 }),
        'b-civ': makeCiv('b-civ', { cities: ['c-b'], gold: 0 }),
      },
      cities: {
        'c-a': makeCity('c-a', 'a-civ', { buildings: [LAUNCH_BUILDING] }),
        'c-b': makeCity('c-b', 'b-civ', { productionQueue: [LAUNCH_BUILDING, 'warrior'], productionProgress: 60 }),
      },
      builtNationalProjects: {
        [`a-civ:${LAUNCH_BUILDING}`]: { civId: 'a-civ', cityId: 'c-a', eraBuilt: 11 },
      },
    });

    const result = processWorldRacesTurn(state, bus);

    expect(result.cities['c-b'].productionQueue).not.toContain(LAUNCH_BUILDING);
    expect(result.cities['c-b'].productionQueue).toEqual(['warrior']);
    expect(result.civilizations['b-civ'].gold).toBe(30); // floor(60 / 2)
    const mooted = events.find(e => e.type === 'worldrace:entry-mooted');
    expect((mooted!.payload as { civId: string; goldRefund: number }).goldRefund).toBe(30);
  });

  it('does not re-emit worldrace:completed on a later turn once a winner is recorded', () => {
    const { bus, events } = withBus();
    const state = makeState({
      civilizations: { 'a-civ': makeCiv('a-civ', { cities: ['c-a'], gold: 0 }) },
      cities: { 'c-a': makeCity('c-a', 'a-civ', { buildings: [LAUNCH_BUILDING] }) },
      builtNationalProjects: { [`a-civ:${LAUNCH_BUILDING}`]: { civId: 'a-civ', cityId: 'c-a', eraBuilt: 11 } },
    });
    const afterTurn1 = processWorldRacesTurn(state, bus);
    events.length = 0;
    processWorldRacesTurn({ ...afterTurn1, turn: 2 }, bus);
    expect(events.filter(e => e.type === 'worldrace:completed')).toHaveLength(0);
  });

  it('excludes an eliminated civ from winning the race', () => {
    const { bus } = withBus();
    const state = makeState({
      civilizations: {
        'a-civ': makeCiv('a-civ', { cities: ['c-a'], gold: 0, isEliminated: true }),
        'b-civ': makeCiv('b-civ', { cities: ['c-b'], gold: 0 }),
      },
      cities: {
        'c-a': makeCity('c-a', 'a-civ', { buildings: [LAUNCH_BUILDING] }),
        'c-b': makeCity('c-b', 'b-civ', { buildings: [LAUNCH_BUILDING] }),
      },
      builtNationalProjects: {
        [`a-civ:${LAUNCH_BUILDING}`]: { civId: 'a-civ', cityId: 'c-a', eraBuilt: 11 },
        [`b-civ:${LAUNCH_BUILDING}`]: { civId: 'b-civ', cityId: 'c-b', eraBuilt: 11 },
      },
    });
    const result = processWorldRacesTurn(state, bus);
    expect(result.worldRaces?.['first-satellite']?.winnerCivId).toBe('b-civ');
  });

  it('same seed + same commands produce byte-identical results (determinism)', () => {
    function fixture(): GameState {
      return makeState({
        civilizations: {
          'z-civ': makeCiv('z-civ', { cities: ['c-z'], gold: 0 }),
          'a-civ': makeCiv('a-civ', { cities: ['c-a'], gold: 0 }),
        },
        cities: {
          'c-z': makeCity('c-z', 'z-civ', { buildings: [LAUNCH_BUILDING] }),
          'c-a': makeCity('c-a', 'a-civ', { buildings: [LAUNCH_BUILDING] }),
        },
        builtNationalProjects: {
          [`z-civ:${LAUNCH_BUILDING}`]: { civId: 'z-civ', cityId: 'c-z', eraBuilt: 11 },
          [`a-civ:${LAUNCH_BUILDING}`]: { civId: 'a-civ', cityId: 'c-a', eraBuilt: 11 },
        },
      });
    }
    const resultA = processWorldRacesTurn(fixture(), new EventBus());
    const resultB = processWorldRacesTurn(fixture(), new EventBus());
    expect(resultA.worldRaces).toEqual(resultB.worldRaces);
    expect(resultA.civilizations).toEqual(resultB.civilizations);
  });
});
