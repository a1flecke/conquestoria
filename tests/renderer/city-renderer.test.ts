import { describe, it, expect } from 'vitest';
import { getCityRenderData } from '@/renderer/city-renderer';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';

describe('city renderer', () => {
  it('returns empty array when no cities exist', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const data = getCityRenderData(state);
    expect(data).toEqual([]);
  });

  it('returns render data for player cities', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    const data = getCityRenderData(state);
    expect(data.length).toBe(1);
    expect(data[0].name).toBe(city.name);
    expect(data[0].position).toEqual(city.position);
    expect(data[0].population).toBe(city.population);
    expect(data[0].owner).toBe('player');
  });

  it('includes cities from multiple owners', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const playerSettler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const playerCity = foundCity('player', playerSettler.position, state.map);
    state.cities[playerCity.id] = playerCity;

    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const aiCity = foundCity('ai-1', aiSettler.position, state.map);
    state.cities[aiCity.id] = aiCity;

    const data = getCityRenderData(state);
    expect(data.length).toBe(2);
    const owners = data.map(d => d.owner);
    expect(owners).toContain('player');
    expect(owners).toContain('ai-1');
  });
});
