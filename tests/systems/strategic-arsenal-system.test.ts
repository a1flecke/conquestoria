import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { hasManhattanProject, getStrategicArsenalCapacity, getStrategicArsenal, addWarheadToArsenal } from '@/systems/strategic-arsenal-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 10,
    currentPlayer: 'p1',
    civilizations: {},
    cities: {},
    units: {},
    map: { width: 1, height: 1, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {},
    techDiscoveries: {},
    completedLegendaryWonders: {},
    legendaryWonderProjects: {},
    legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} },
    pirateState: null,
    tradeRoutes: {},
    espionage: {},
    embargoes: [],
    defensiveLeagues: [],
    gameOver: false,
    winner: null,
    settings: {} as any,
    tribalVillages: {},
    discoveredWonders: {},
    wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

describe('hasManhattanProject', () => {
  it('is false when nothing has been built', () => {
    expect(hasManhattanProject(makeState(), 'p1')).toBe(false);
  });

  it('is true once p1:manhattan_project is in builtNationalProjects', () => {
    const state = makeState({
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(true);
  });

  it('is civ-scoped -- p2 having it does not make it true for p1', () => {
    const state = makeState({
      builtNationalProjects: {
        'p2:manhattan_project': { civId: 'p2', cityId: 'c2', eraBuilt: 10 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(false);
  });

  it('is false for an unrelated built national project', () => {
    const state = makeState({
      builtNationalProjects: {
        'p1:sacred_council': { civId: 'p1', cityId: 'c1', eraBuilt: 3 },
      },
    });
    expect(hasManhattanProject(state, 'p1')).toBe(false);
  });
});

function makeCiv(overrides: Partial<import('@/core/types').Civilization> = {}) {
  return {
    id: 'p1', name: 'P1', color: '#fff', isHuman: true, civType: 'generic',
    cities: [], units: [], gold: 0, visibility: {}, score: 0,
    techState: { completed: [], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} as any },
    diplomacy: { relationships: {}, treaties: [], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
    ...overrides,
  } as import('@/core/types').Civilization;
}

function makeCity(id: string, buildings: string[]) {
  return {
    id, name: id, owner: 'p1', position: { q: 0, r: 0 }, population: 1,
    food: 0, foodNeeded: 10, buildings, productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'city',
  } as any;
}

describe('getStrategicArsenalCapacity', () => {
  it('is 0 without Manhattan Project, even with capacity-shaped buildings present', () => {
    // Proves capacity-granting buildings are genuinely inert without the
    // unlock -- not just "usually" gated -- per spec §2's conjunction.
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'] }) },
      cities: { c1: makeCity('c1', ['nuclear_arsenal', 'missile_silo']) },
    });
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(0);
  });

  it('is 1 (base) with Manhattan Project and no other capacity buildings', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: [] }) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c0', eraBuilt: 10 } },
    });
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(1);
  });

  it('adds +2 per nuclear_arsenal, summed across multiple cities', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1', 'c2'] }) },
      cities: {
        c1: makeCity('c1', ['nuclear_arsenal']),
        c2: makeCity('c2', ['nuclear_arsenal']),
      },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base 1 + 2 + 2 = 5
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(5);
  });

  it('adds +1 per missile_silo, summed across multiple cities', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1', 'c2'] }) },
      cities: {
        c1: makeCity('c1', ['missile_silo']),
        c2: makeCity('c2', ['missile_silo']),
      },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base 1 + 1 + 1 = 3
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(3);
  });

  it('combines base + nuclear_arsenal + missile_silo in one city', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'] }) },
      cities: { c1: makeCity('c1', ['nuclear_arsenal', 'missile_silo']) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base 1 + 2 + 1 = 4
    expect(getStrategicArsenalCapacity(state, 'p1')).toBe(4);
  });

  it('is 0 for an unknown civ', () => {
    expect(getStrategicArsenalCapacity(makeState(), 'nobody')).toBe(0);
  });
});

describe('getStrategicArsenal', () => {
  it('is 0 when strategicArsenal is undefined (legacy save)', () => {
    expect(getStrategicArsenal(makeCiv())).toBe(0);
  });

  it('returns the stored value when present', () => {
    expect(getStrategicArsenal(makeCiv({ strategicArsenal: 3 }))).toBe(3);
  });

  it('returns 0 when explicitly 0', () => {
    expect(getStrategicArsenal(makeCiv({ strategicArsenal: 0 }))).toBe(0);
  });
});

describe('addWarheadToArsenal', () => {
  it('increments strategicArsenal from absent to 1', () => {
    const state = makeState({ civilizations: { p1: makeCiv() } });
    const next = addWarheadToArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(1);
  });

  it('increments an existing count', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 3 }) } });
    const next = addWarheadToArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(4);
  });

  it('is a no-op (returns the same state) for an unknown civ', () => {
    const state = makeState();
    expect(addWarheadToArsenal(state, 'nobody')).toBe(state);
  });

  it('does not mutate the input state', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 1 }) } });
    addWarheadToArsenal(state, 'p1');
    expect(state.civilizations.p1.strategicArsenal).toBe(1);
  });
});
