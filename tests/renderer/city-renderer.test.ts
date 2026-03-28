import { describe, it, expect } from 'vitest';
import { getCityRenderData } from '@/renderer/city-renderer';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';

describe('city renderer', () => {
  it('returns only minor civ cities on fresh game', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const data = getCityRenderData(state);
    // Fresh game has minor civ cities only (no player/AI cities yet)
    for (const d of data) {
      expect(d.owner).toMatch(/^mc-/);
    }
  });

  it('returns render data for player cities', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const mcCityCount = Object.keys(state.cities).length;
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    const data = getCityRenderData(state);
    expect(data.length).toBe(mcCityCount + 1);
    const playerCity = data.find(d => d.owner === 'player');
    expect(playerCity).toBeDefined();
    expect(playerCity!.name).toBe(city.name);
    expect(playerCity!.position).toEqual(city.position);
    expect(playerCity!.population).toBe(city.population);
  });

  it('includes cities from multiple owners', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const mcCityCount = Object.keys(state.cities).length;
    const playerSettler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const playerCity = foundCity('player', playerSettler.position, state.map);
    state.cities[playerCity.id] = playerCity;

    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
    state.cities[aiCity.id] = aiCity;

    const data = getCityRenderData(state);
    expect(data.length).toBe(mcCityCount + 2);
    const owners = data.map(d => d.owner);
    expect(owners).toContain('player');
    expect(owners).toContain('ai-1');
  });
});
