import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { hasManhattanProject, hasKnownStrategicCapability, getStrategicArsenalCapacity, getStrategicArsenal, addWarheadToArsenal, spendStrategicArsenal, computeArmsControlCap, getActiveArmsControlCap, getArsenalStatus } from '@/systems/strategic-arsenal-system';

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

describe('hasKnownStrategicCapability (#545 MR5)', () => {
  it('is false when the viewer has not met the owner, even with Manhattan Project built', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: [] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: [] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(false);
  });

  it('is false when met but Manhattan Project is not built', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: ['owner'] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: [] }),
      },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(false);
  });

  it('is true when met and Manhattan Project is built', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: ['owner'] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: [] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(true);
  });

  it('meeting can be evidenced from either side (target knows viewer)', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: [] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: ['viewer'] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(true);
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

describe('spendStrategicArsenal', () => {
  it('decrements strategicArsenal by 1', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 3 }) } });
    const next = spendStrategicArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(2);
  });

  it('floors at 0 rather than going negative', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 0 }) } });
    const next = spendStrategicArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(0);
  });

  it('floors at 0 when strategicArsenal is absent (legacy save)', () => {
    const state = makeState({ civilizations: { p1: makeCiv() } });
    const next = spendStrategicArsenal(state, 'p1');
    expect(next.civilizations.p1.strategicArsenal).toBe(0);
  });

  it('is a no-op (returns the same state) for an unknown civ', () => {
    const state = makeState();
    expect(spendStrategicArsenal(state, 'nobody')).toBe(state);
  });

  it('does not mutate the input state', () => {
    const state = makeState({ civilizations: { p1: makeCiv({ strategicArsenal: 2 }) } });
    spendStrategicArsenal(state, 'p1');
    expect(state.civilizations.p1.strategicArsenal).toBe(2);
  });
});

describe('computeArmsControlCap (#545 MR6)', () => {
  it('is the higher of the two arsenals', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ strategicArsenal: 5 }), p2: makeCiv({ id: 'p2', strategicArsenal: 2 }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'p2')).toBe(5);
    expect(computeArmsControlCap(state, 'p2', 'p1')).toBe(5); // symmetric regardless of argument order
  });

  it('floors at 1 even when both arsenals are 0', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ strategicArsenal: 0 }), p2: makeCiv({ id: 'p2', strategicArsenal: 0 }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'p2')).toBe(1);
  });

  it('floors at 1 when arsenal is absent (never built a warhead)', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({}), p2: makeCiv({ id: 'p2' }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'p2')).toBe(1);
  });

  it('treats an unknown civ as arsenal 0', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ strategicArsenal: 3 }) },
    });
    expect(computeArmsControlCap(state, 'p1', 'nobody')).toBe(3);
  });
});

describe('getActiveArmsControlCap (#545 MR6)', () => {
  it('is null with no active pact', () => {
    const state = makeState({ civilizations: { p1: makeCiv({}) } });
    expect(getActiveArmsControlCap(state, 'p1')).toBeNull();
  });

  it('returns the single active pact cap', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          diplomacy: { relationships: {}, treaties: [{ type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 4 }], events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 } },
        }),
      },
    });
    expect(getActiveArmsControlCap(state, 'p1')).toBe(4);
  });

  it('returns the MINIMUM (most restrictive) across multiple active pacts', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          diplomacy: {
            relationships: {}, events: [], atWarWith: [], treacheryScore: 0,
            vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 },
            treaties: [
              { type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 6 },
              { type: 'arms_control_pact', civA: 'p3', civB: 'p1', turnsRemaining: -1, arsenalCap: 2 },
            ],
          },
        }),
      },
    });
    expect(getActiveArmsControlCap(state, 'p1')).toBe(2);
  });

  it('ignores non-arms-control treaties', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          diplomacy: { relationships: {}, events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 }, treaties: [{ type: 'alliance', civA: 'p1', civB: 'p2', turnsRemaining: -1 }] },
        }),
      },
    });
    expect(getActiveArmsControlCap(state, 'p1')).toBeNull();
  });
});

describe('getArsenalStatus (#545 MR6)', () => {
  it('atCapacity reflects physical capacity when no treaty cap is active', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: [], strategicArsenal: 1 }) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
    });
    // base capacity 1, arsenal 1 -> at capacity
    expect(getArsenalStatus(state, 'p1').atCapacity).toBe(true);
    expect(getArsenalStatus(state, 'p1').hasManhattanProject).toBe(true);
  });

  it('atCapacity becomes true from a treaty cap even with physical capacity remaining', () => {
    const state = makeState({
      civilizations: {
        p1: makeCiv({
          cities: ['c1'], strategicArsenal: 1,
          diplomacy: { relationships: {}, events: [], atWarWith: [], treacheryScore: 0, vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [], peakCities: 0, peakMilitary: 0 }, treaties: [{ type: 'arms_control_pact', civA: 'p1', civB: 'p2', turnsRemaining: -1, arsenalCap: 1 }] },
        }),
      },
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 },
      },
      // civ.cities must include 'c1' for getStrategicArsenalCapacity to count
      // its buildings -- base 1 + missile_silo 1 = physical capacity 2, so
      // this genuinely proves the treaty cap (1) is the binding constraint,
      // not just physical capacity coincidentally also being 1.
      cities: { c1: makeCity('c1', ['missile_silo']) }, // physical capacity 2, but treaty cap is 1
    });
    expect(getArsenalStatus(state, 'p1').atCapacity).toBe(true);
  });

  it('atCapacity is false when physical capacity exceeds arsenal and no treaty cap applies', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'], strategicArsenal: 1 }) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
      cities: { c1: makeCity('c1', ['missile_silo']) }, // physical capacity 2, arsenal 1 -> not at capacity
    });
    expect(getArsenalStatus(state, 'p1').atCapacity).toBe(false);
  });
});
