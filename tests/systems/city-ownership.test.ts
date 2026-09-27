import { describe, it, expect } from 'vitest';
import type { City, Civilization, GameState, MinorCivState } from '@/core/types';
import { getOwnedCities, getOwnedCityCount } from '@/systems/city-ownership';

function cityFixture(id: string, owner: string): City {
  return {
    id,
    name: id,
    owner,
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    foodNeeded: 10,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    ownedTiles: [],
    workedTiles: [],
    focus: 'balanced',
    maturity: 'village',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  } as City;
}

function stateFixture(partial: Partial<GameState> = {}): GameState {
  return {
    cities: {},
    civilizations: {},
    minorCivs: {},
    units: {},
    ...partial,
  } as GameState;
}

describe('city-ownership', () => {
  it('returns cities owned by a major civ', () => {
    const cityA = cityFixture('city-a', 'civ-1');
    const cityB = cityFixture('city-b', 'civ-2');
    const state = stateFixture({
      cities: { 'city-a': cityA, 'city-b': cityB },
    });

    expect(getOwnedCities(state, 'civ-1').map(c => c.id)).toEqual(['city-a']);
    expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
  });

  it('returns empty for a major civ that owns no cities', () => {
    const city = cityFixture('city-1', 'civ-2');
    const state = stateFixture({
      cities: { 'city-1': city },
      civilizations: { 'civ-1': { id: 'civ-1', cities: [] } as unknown as Civilization },
    });

    expect(getOwnedCities(state, 'civ-1')).toEqual([]);
    expect(getOwnedCityCount(state, 'civ-1')).toBe(0);
  });

  describe('corruption semantics', () => {
    it('ignores a ghost roster entry', () => {
      const city = cityFixture('city-1', 'civ-1');
      const state = stateFixture({
        cities: { 'city-1': city },
        civilizations: {
          'civ-1': { id: 'civ-1', cities: ['city-1', 'city-ghost'] } as unknown as unknown as Civilization,
        },
      });

      expect(getOwnedCities(state, 'civ-1').map(c => c.id)).toEqual(['city-1']);
      expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
    });

    it('ignores a rostered city owned by another civ', () => {
      const city = cityFixture('city-1', 'civ-2');
      const state = stateFixture({
        cities: { 'city-1': city },
        civilizations: {
          'civ-1': { id: 'civ-1', cities: ['city-1'] } as unknown as Civilization,
          'civ-2': { id: 'civ-2', cities: [] } as unknown as Civilization,
        },
      });

      expect(getOwnedCities(state, 'civ-1')).toEqual([]);
      expect(getOwnedCities(state, 'civ-2').map(c => c.id)).toEqual(['city-1']);
    });

    it('returns a city whose owner roster omits it', () => {
      const city = cityFixture('city-1', 'civ-1');
      const state = stateFixture({
        cities: { 'city-1': city },
        civilizations: {
          'civ-1': { id: 'civ-1', cities: [] } as unknown as Civilization,
        },
      });

      expect(getOwnedCities(state, 'civ-1').map(c => c.id)).toEqual(['city-1']);
      expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
    });

    it('does not double-count duplicate roster ids', () => {
      const city = cityFixture('city-1', 'civ-1');
      const state = stateFixture({
        cities: { 'city-1': city },
        civilizations: {
          'civ-1': { id: 'civ-1', cities: ['city-1', 'city-1'] } as unknown as Civilization,
        },
      });

      expect(getOwnedCityCount(state, 'civ-1')).toBe(1);
    });

    it('works for minor civs', () => {
      const city = cityFixture('city-mc', 'mc-1');
      const state = stateFixture({
        cities: { 'city-mc': city },
        minorCivs: {
          'mc-1': { id: 'mc-1', cityId: 'city-mc' } as unknown as MinorCivState,
        },
      });

      expect(getOwnedCities(state, 'mc-1').map(c => c.id)).toEqual(['city-mc']);
      expect(getOwnedCityCount(state, 'mc-1')).toBe(1);
    });

    it('returns empty when a minor civ cityId points to a city owned by someone else', () => {
      const city = cityFixture('city-mc', 'civ-1');
      const state = stateFixture({
        cities: { 'city-mc': city },
        civilizations: {
          'civ-1': { id: 'civ-1', cities: ['city-mc'] } as unknown as Civilization,
        },
        minorCivs: {
          'mc-1': { id: 'mc-1', cityId: 'city-mc' } as unknown as MinorCivState,
        },
      });

      expect(getOwnedCities(state, 'mc-1')).toEqual([]);
      expect(getOwnedCityCount(state, 'mc-1')).toBe(0);
    });

    it('returns empty for unsupported owners', () => {
      const city = cityFixture('city-1', 'civ-1');
      const state = stateFixture({ cities: { 'city-1': city } });

      for (const ownerId of ['barbarian', 'pirate-1', 'beasts', 'rebels', 'crisis-force']) {
        expect(getOwnedCities(state, ownerId)).toEqual([]);
        expect(getOwnedCityCount(state, ownerId)).toBe(0);
      }
    });
  });
});
