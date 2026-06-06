import { describe, it, expect } from 'vitest';
import { buildBuildingEntities } from '@/renderer/render-loop';
import type { GameState, City, VisibilityMap } from '@/core/types';

function makeState(cityOverrides: Partial<City> = {}): GameState {
  const city: City = {
    id: 'c1',
    position: { q: 3, r: 4 },
    owner: 'player1',
    buildings: ['granary'],
    name: 'TestCity',
    population: 1,
    food: 0,
    production: 0,
    gold: 0,
    science: 0,
    productionQueue: [],
    ...cityOverrides,
  } as City;

  return {
    currentPlayer: 'player1',
    cities: { c1: city },
    civilizations: {
      'player1': { id: 'player1', civType: 'imperials' } as any,
      'player2': { id: 'player2', civType: 'vikings' } as any,
    },
    map: { width: 20, wrapsHorizontally: false } as any,
  } as unknown as GameState;
}

function makeVisMap(q: number, r: number, status: 'visible' | 'fog' | 'unexplored'): VisibilityMap {
  return { tiles: { [`${q},${r}`]: status } };
}

describe('buildBuildingEntities', () => {
  it('returns building entities for a visible city', () => {
    const state = makeState();
    const vis = makeVisMap(3, 4, 'visible');
    const entities = buildBuildingEntities(state, vis);
    expect(entities.length).toBe(1);
    expect(entities[0].kind).toBe('building');
    expect(entities[0].subtype).toBe('granary');
    expect(entities[0].coord).toEqual({ q: 3, r: 4 });
    expect(entities[0].id).toBe('c1:granary');
  });

  it('excludes buildings in fog cities', () => {
    const state = makeState();
    const vis = makeVisMap(3, 4, 'fog');
    const entities = buildBuildingEntities(state, vis);
    expect(entities.length).toBe(0);
  });

  it('excludes buildings in unexplored cities', () => {
    const state = makeState();
    const vis = makeVisMap(3, 4, 'unexplored');
    const entities = buildBuildingEntities(state, vis);
    expect(entities.length).toBe(0);
  });

  it('uses city OWNER civType for faction — not hardcoded viewer', () => {
    // City owned by player2 (vikings) visible to player1 (imperials)
    const state = makeState({ owner: 'player2' });
    const vis = makeVisMap(3, 4, 'visible');
    const entities = buildBuildingEntities(state, vis);
    expect(entities[0].faction).toBe('vikings');
  });

  it('produces one entity per building in the city', () => {
    const state = makeState({ buildings: ['granary', 'library', 'barracks'] });
    const vis = makeVisMap(3, 4, 'visible');
    const entities = buildBuildingEntities(state, vis);
    expect(entities.length).toBe(3);
    expect(entities.map(e => e.subtype)).toEqual(
      expect.arrayContaining(['granary', 'library', 'barracks'])
    );
  });
});
