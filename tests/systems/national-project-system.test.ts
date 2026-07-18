import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import {
  getNationalProjectMultiplier,
  getNationalProjectCivYieldBonus,
  getReservedNationalProjectKeys,
  expireNationalProjects,
} from '@/systems/national-project-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1,
    era: 5,
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
    p1: false,
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

describe('getNationalProjectMultiplier', () => {
  it('returns 1 when delta === 0', () => expect(getNationalProjectMultiplier(5, 5)).toBe(1));
  it('returns 1 when delta === 1', () => expect(getNationalProjectMultiplier(6, 5)).toBe(1));
  it('returns 0.5 when delta === 2', () => expect(getNationalProjectMultiplier(7, 5)).toBe(0.5));
  it('returns 0 when delta === 3', () => expect(getNationalProjectMultiplier(8, 5)).toBe(0));
  it('returns 0 when delta > 3', () => expect(getNationalProjectMultiplier(10, 5)).toBe(0));
});

describe('getReservedNationalProjectKeys', () => {
  it('reserves both completed and currently queued empire-unique projects', () => {
    const state = makeState({
      civilizations: {
        p1: { id: 'p1', cities: ['c1', 'c2'] } as any,
        p2: { id: 'p2', cities: ['c3'] } as any,
      },
      cities: {
        c1: { id: 'c1', owner: 'p1', productionQueue: ['communal_stores'] } as any,
        c2: { id: 'c2', owner: 'p1', productionQueue: ['warrior'] } as any,
        c3: { id: 'c3', owner: 'p2', productionQueue: ['communal_stores'] } as any,
      },
      builtNationalProjects: {
        'p1:sacred_grove': { civId: 'p1', cityId: 'c2', eraBuilt: 1 },
        'p2:tribal_muster_ground': { civId: 'p2', cityId: 'c3', eraBuilt: 1 },
      },
    });

    expect([...getReservedNationalProjectKeys(state, 'p1')].sort()).toEqual([
      'p1:communal_stores',
      'p1:sacred_grove',
    ]);
  });
});

describe('getNationalProjectCivYieldBonus', () => {
  it('returns empty object when no builtNationalProjects', () => {
    expect(getNationalProjectCivYieldBonus(makeState(), 'p1')).toEqual({});
  });

  it('uses the owning civilization era instead of a higher World Age', () => {
    const state = makeState({
      era: 5,
      civilizations: {
        p1: { id: 'p1', isEliminated: false, techState: { completed: [] } },
      } as any,
      builtNationalProjects: {
        'p1:communal_stores': { civId: 'p1', cityId: 'city1', eraBuilt: 1 },
      },
    });

    expect(getNationalProjectCivYieldBonus(state, 'p1')).toEqual({ food: 2 });
  });

  // royal_academy is defined in Task 9 (NP definitions) — re-enable when BUILDINGS has it
  it.skip('sums civYieldBonus for active projects of this civ (royal_academy: science 4, era delta 0)', () => {
    const state = makeState({
      era: 5,
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').science).toBe(4);
  });

  it.skip('applies 0.5 multiplier for fading projects (era delta 2)', () => {
    const state = makeState({
      era: 7,
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').science).toBe(2); // 4 * 0.5
  });

  it('ignores expired projects (era delta >= 3)', () => {
    const state = makeState({
      era: 8,
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1')).toEqual({});
  });

  it('does not count other civs projects', () => {
    const state = makeState({
      era: 5,
      builtNationalProjects: {
        'p2:royal_academy': { civId: 'p2', cityId: 'city2', eraBuilt: 5 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1')).toEqual({});
  });

  it('grand_bazaar: +1 gold per city (1 city = 1 gold)', () => {
    const state = makeState({
      era: 2,
      cities: {
        c1: {
          id: 'c1', owner: 'p1', name: 'A', position: { q: 0, r: 0 },
          population: 1, food: 0, foodNeeded: 10, buildings: [],
          productionQueue: [], productionProgress: 0,
          ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village',
        } as any,
      },
      builtNationalProjects: {
        'p1:grand_bazaar': { civId: 'p1', cityId: 'c1', eraBuilt: 2 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(1);
  });

  it('grand_bazaar: scales to 3 cities', () => {
    const state = makeState({
      era: 2,
      cities: {
        c1: { id: 'c1', owner: 'p1', name: 'A', position: { q: 0, r: 0 }, population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village' } as any,
        c2: { id: 'c2', owner: 'p1', name: 'B', position: { q: 1, r: 0 }, population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village' } as any,
        c3: { id: 'c3', owner: 'p1', name: 'C', position: { q: 2, r: 0 }, population: 1, food: 0, foodNeeded: 10, buildings: [], productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village' } as any,
      },
      builtNationalProjects: {
        'p1:grand_bazaar': { civId: 'p1', cityId: 'c1', eraBuilt: 2 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(3);
  });

  const cityStub = (id: string) => ({
    id, owner: 'p1', name: id, position: { q: 0, r: 0 },
    population: 1, food: 0, foodNeeded: 10, buildings: [],
    productionQueue: [], productionProgress: 0,
    ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'village',
  } as any);

  it('colonial_administration: 0 gold with exactly 4 cities (at threshold)', () => {
    const state = makeState({
      era: 6,
      cities: { c1: cityStub('c1'), c2: cityStub('c2'), c3: cityStub('c3'), c4: cityStub('c4') },
      builtNationalProjects: {
        'p1:colonial_administration': { civId: 'p1', cityId: 'c1', eraBuilt: 6 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold ?? 0).toBe(0);
  });

  it('colonial_administration: +2 gold with 5 cities (1 beyond threshold)', () => {
    const state = makeState({
      era: 6,
      cities: {
        c1: cityStub('c1'), c2: cityStub('c2'), c3: cityStub('c3'),
        c4: cityStub('c4'), c5: cityStub('c5'),
      },
      builtNationalProjects: {
        'p1:colonial_administration': { civId: 'p1', cityId: 'c1', eraBuilt: 6 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(2);
  });

  it('colonial_administration: +6 gold with 7 cities (3 beyond threshold)', () => {
    const state = makeState({
      era: 6,
      cities: {
        c1: cityStub('c1'), c2: cityStub('c2'), c3: cityStub('c3'),
        c4: cityStub('c4'), c5: cityStub('c5'), c6: cityStub('c6'), c7: cityStub('c7'),
      },
      builtNationalProjects: {
        'p1:colonial_administration': { civId: 'p1', cityId: 'c1', eraBuilt: 6 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(6);
  });

  it('colonial_administration: fades at era delta 2 (halves the per-city gold)', () => {
    const state = makeState({
      era: 8,
      cities: {
        c1: cityStub('c1'), c2: cityStub('c2'), c3: cityStub('c3'),
        c4: cityStub('c4'), c5: cityStub('c5'),
      },
      builtNationalProjects: {
        'p1:colonial_administration': { civId: 'p1', cityId: 'c1', eraBuilt: 6 },
      },
    });
    expect(getNationalProjectCivYieldBonus(state, 'p1').gold).toBe(1); // 2 * 0.5
  });
});

describe('expireNationalProjects', () => {
  it('returns unchanged state when nothing expires', () => {
    const state = makeState({
      era: 6,
      builtNationalProjects: { 'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 } },
    });
    const { expired } = expireNationalProjects(state, 6);
    expect(expired).toHaveLength(0);
  });

  it('removes expired project from builtNationalProjects and city.buildings', () => {
    const state = makeState({
      era: 8,
      cities: {
        city1: {
          id: 'city1', name: 'Rome', owner: 'p1', position: { q: 0, r: 0 },
          population: 3, food: 0, foodNeeded: 10,
          buildings: ['library', 'royal_academy'],
          productionQueue: [], productionProgress: 0,
          ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town',
        } as any,
      },
      builtNationalProjects: {
        'p1:royal_academy': { civId: 'p1', cityId: 'city1', eraBuilt: 5 },
      },
    });
    const { state: next, expired } = expireNationalProjects(state, 8);
    expect(expired).toHaveLength(1);
    expect(expired[0]).toEqual({ civId: 'p1', cityId: 'city1', buildingId: 'royal_academy' });
    expect(next.builtNationalProjects?.['p1:royal_academy']).toBeUndefined();
    expect(next.cities['city1'].buildings).not.toContain('royal_academy');
    expect(next.cities['city1'].buildings).toContain('library');
  });

  it('#591 MR4: never expires a milestone NP (sacred_council), even far past the normal delta>=3 threshold', () => {
    const state = makeState({
      era: 20,
      cities: {
        city1: {
          id: 'city1', name: 'Rome', owner: 'p1', position: { q: 0, r: 0 },
          population: 3, food: 0, foodNeeded: 10,
          buildings: ['temple', 'sacred_council'],
          productionQueue: [], productionProgress: 0,
          ownedTiles: [], workedTiles: [], focus: 'balanced', maturity: 'town',
        } as any,
      },
      builtNationalProjects: {
        'p1:sacred_council': { civId: 'p1', cityId: 'city1', eraBuilt: 3 },
      },
    });
    const { state: next, expired } = expireNationalProjects(state, 20);
    expect(expired).toHaveLength(0);
    expect(next.builtNationalProjects?.['p1:sacred_council']).toBeDefined();
    expect(next.cities['city1'].buildings).toContain('sacred_council');
  });
});
