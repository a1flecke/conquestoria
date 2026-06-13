import { describe, expect, it } from 'vitest';
import { buildUnitEntities } from '@/renderer/render-loop';
import type { GameState, City, VisibilityMap } from '@/core/types';

describe('strategic-map overlay ownership', () => {
  it('does not create an independent overlay entity when a visible city completes buildings', () => {
    const visibility: VisibilityMap = { tiles: { '3,4': 'visible' } };
    const city = {
      id: 'c1',
      position: { q: 3, r: 4 },
      owner: 'player1',
      buildings: ['granary', 'library', 'barracks'],
      name: 'Test City',
      population: 6,
      productionQueue: [],
    } as unknown as City;
    const state = {
      currentPlayer: 'player1',
      units: {},
      cities: { c1: city },
      civilizations: {
        player1: { id: 'player1', civType: 'rome', visibility } as any,
      },
      minorCivs: {},
      map: { width: 20, height: 20, wrapsHorizontally: false, tiles: {}, rivers: [] },
    } as unknown as GameState;

    const entities = buildUnitEntities(state, 'player1', visibility, new Set());

    expect(entities).toEqual([]);
  });
});
