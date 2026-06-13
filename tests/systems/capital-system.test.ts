import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getCapitalCity, getCapitalCityId } from '@/systems/capital-system';
import { foundCity } from '@/systems/city-system';

describe('capital system', () => {
  it('returns the valid first owned city and does not promote a later city', () => {
    const state = createNewGame(undefined, 'capital-valid', 'small');
    const civ = state.civilizations.player;
    const settler = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'settler');
    expect(settler).toBeDefined();
    const firstCity = foundCity('player', settler!.position, state.map, state.idCounters);
    state.cities[firstCity.id] = firstCity;

    const secondCity = { ...firstCity, id: 'player-city-second', name: 'Second City' };
    state.cities[secondCity.id] = secondCity;
    civ.cities = [firstCity.id, secondCity.id];

    expect(getCapitalCityId(state, 'player')).toBe(firstCity.id);
    expect(getCapitalCity(state, 'player')).toBe(firstCity);

    civ.cities = ['missing-city', secondCity.id];

    expect(getCapitalCityId(state, 'player')).toBeNull();
    expect(getCapitalCity(state, 'player')).toBeNull();
  });

  it('rejects a first city owned by another civilization', () => {
    const state = createNewGame(undefined, 'capital-owner', 'small');
    const foreignCiv = Object.values(state.civilizations).find(civ => civ.id !== 'player');
    const foreignSettler = Object.values(state.units).find(
      unit => unit.owner === foreignCiv?.id && unit.type === 'settler',
    );
    expect(foreignCiv).toBeDefined();
    expect(foreignSettler).toBeDefined();
    const foreignCity = foundCity(foreignCiv!.id, foreignSettler!.position, state.map, state.idCounters);
    state.cities[foreignCity.id] = foreignCity;
    state.civilizations.player.cities = [foreignCity.id];

    expect(getCapitalCityId(state, 'player')).toBeNull();
    expect(getCapitalCity(state, 'player')).toBeNull();
  });

  it('returns no capital for a missing civilization or empty city list', () => {
    const state = createNewGame(undefined, 'capital-empty', 'small');
    state.civilizations.player.cities = [];

    expect(getCapitalCity(state, 'player')).toBeNull();
    expect(getCapitalCity(state, 'missing')).toBeNull();
  });
});
