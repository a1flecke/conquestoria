import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { getEligibleStrategicLaunchPlatforms } from '@/systems/strategic-launch-system';

function makeState(overrides: Partial<GameState> = {}): GameState {
  return {
    turn: 1, era: 11, currentPlayer: 'p1',
    civilizations: {}, cities: {}, units: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false, rivers: [] },
    minorCivs: {}, techDiscoveries: {}, completedLegendaryWonders: {},
    legendaryWonderProjects: {}, legendaryWonderHistory: { races: {}, completions: {} },
    diplomacyState: { relationships: {} }, pirateState: null, tradeRoutes: {},
    espionage: {}, embargoes: [], defensiveLeagues: [], gameOver: false, winner: null,
    settings: {} as any, tribalVillages: {}, discoveredWonders: {}, wonderDiscoverers: {},
    idCounters: { nextUnitId: 0, nextCityId: 0, nextRouteId: 0 },
    ...overrides,
  } as GameState;
}

describe('getEligibleStrategicLaunchPlatforms', () => {
  it('is empty with no cities or units', () => {
    expect(getEligibleStrategicLaunchPlatforms(makeState(), 'p1')).toEqual([]);
  });

  it('includes an owned city with a missile_silo, keyed off the typed field not the id', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 2, r: 3 }, buildings: ['missile_silo'] } as any },
    });
    const platforms = getEligibleStrategicLaunchPlatforms(state, 'p1');
    expect(platforms).toEqual([
      { kind: 'building', cityId: 'c1', buildingId: 'missile_silo', position: { q: 2, r: 3 }, range: 'unlimited' },
    ]);
  });

  it('excludes a missile_silo city owned by another civ', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p2', position: { q: 2, r: 3 }, buildings: ['missile_silo'] } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('excludes a city with no capability-granting building', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 2, r: 3 }, buildings: ['nuclear_arsenal'] } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('includes an owned missile_submarine unit at its current position', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([
      { kind: 'unit', unitId: 'u1', unitType: 'missile_submarine', position: { q: 5, r: 5 }, range: 4 },
    ]);
  });

  it('excludes a missile_submarine owned by another civ', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p2', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('excludes a unit type with no strategicLaunchPlatform capability', () => {
    const state = makeState({
      units: { u1: { id: 'u1', type: 'submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });

  it('combines building and unit platforms across multiple cities/units', () => {
    const state = makeState({
      cities: { c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any },
      units: { u1: { id: 'u1', type: 'missile_submarine', owner: 'p1', position: { q: 5, r: 5 } } as any },
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toHaveLength(2);
  });
});

describe('strategic launch platform wiring (#545)', () => {
  it('missile_silo has unlimited-range strategicLaunchPlatform', () => {
    expect(BUILDINGS.missile_silo.strategicLaunchPlatform).toEqual({ range: 'unlimited' });
  });

  it('missile_submarine has range-4 strategicLaunchPlatform, existing attackProfile untouched', () => {
    const def = UNIT_DEFINITIONS.missile_submarine;
    expect(def.strategicLaunchPlatform).toEqual({ range: 4 });
    expect(def.attackProfile).toEqual({ kind: 'ranged', range: 3, targets: ['unit', 'city'] });
  });
});
