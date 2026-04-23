import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { City, GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { getOccupiedCityYieldMultiplier, tickOccupiedCities } from '@/systems/city-occupation-system';

function makeOccupiedCityState(turnsRemaining: number): GameState {
  const state = createNewGame(undefined, 'occupied-city', 'small');
  const city: City = {
    ...foundCity('player', { q: 1, r: 0 }, state.map),
    id: 'athens',
    name: 'Athens',
    owner: 'player',
    position: { q: 1, r: 0 },
    population: 4,
    occupation: { originalOwnerId: 'ai-1', turnsRemaining },
  };
  state.cities[city.id] = city;
  state.civilizations.player.cities = [city.id];
  return state;
}

describe('city-occupation-system', () => {
  it('uses the stronger penalty while a city has 6 or more occupation turns remaining', () => {
    const state = makeOccupiedCityState(8);

    expect(getOccupiedCityYieldMultiplier(state.cities.athens)).toBe(0.5);
  });

  it('drops to the lighter penalty for the last five occupation turns', () => {
    const state = makeOccupiedCityState(5);

    expect(getOccupiedCityYieldMultiplier(state.cities.athens)).toBe(0.75);
  });

  it('decrements occupation each turn and clears it when integration completes', () => {
    let state = makeOccupiedCityState(2);

    state = tickOccupiedCities(state);
    expect(state.cities.athens.occupation?.turnsRemaining).toBe(1);

    state = tickOccupiedCities(state);
    expect(state.cities.athens.occupation).toBeUndefined();
  });
});
