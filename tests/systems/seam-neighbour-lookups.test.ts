import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexTile } from '@/core/types';
import { getForeignFaithPressure } from '@/systems/religion-loyalty-system';
import { getCrisisFlavor } from '@/systems/crisis-flavor-definitions';
import { processWonderEffects } from '@/systems/wonder-system';

/**
 * Three rules that look at a tile's neighbours, each checked on a 10-wide map with the relevant tile at q 0 and
 * the other at q 9: adjacent across the seam on a wrapping map, a whole map apart on a flat one.
 */
function makeMap(wrapsHorizontally: boolean, terrainAt: (q: number, r: number) => string = () => 'grassland'): GameMap {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 6; r++) {
    for (let q = 0; q < 10; q++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: terrainAt(q, r) as HexTile['terrain'], elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  return { width: 10, height: 6, tiles, wrapsHorizontally, rivers: [] };
}

describe('neighbour lookups follow the horizontal seam', () => {
  function faithState(wrapsHorizontally: boolean): GameState {
    const map = makeMap(wrapsHorizontally);
    map.tiles['9,3'].owner = 'p1';
    const city = { id: 'c2', owner: 'p2', position: { q: 0, r: 3 }, ownedTiles: [{ q: 0, r: 3 }] } as unknown as City;
    return {
      map,
      cities: { c2: city },
      cityFaith: { c2: { religionId: 'religion-p1' } },
      religions: { 'religion-p1': { id: 'religion-p1', name: 'Test', ownerCivId: 'p1', foundedTurn: 1 } },
    } as unknown as GameState;
  }

  it('foreign faith pressure comes from a faith owner bordering the city across the seam', () => {
    expect(getForeignFaithPressure(faithState(true), 'c2')?.pressuringCivId).toBe('p1');
    expect(getForeignFaithPressure(faithState(false), 'c2')).toBeNull();
  });

  it('a crisis "near terrain" check sees terrain across the seam', () => {
    const earthquake = getCrisisFlavor('earthquake')!;
    const city = { id: 'c1', owner: 'p1', position: { q: 0, r: 3 }, population: 1 } as unknown as City;
    const mountainsAcrossSeam = (wraps: boolean) => ({
      map: makeMap(wraps, q => (q === 9 ? 'mountain' : 'grassland')),
    } as unknown as GameState);

    expect(earthquake.geographyPredicate(mountainsAcrossSeam(true), city)).toBe(true);
    expect(earthquake.geographyPredicate(mountainsAcrossSeam(false), city)).toBe(false);
  });

  it('an eruption wrecks an improvement across the seam', () => {
    const eruptedAcrossSeam = (wraps: boolean) => {
      const map = makeMap(wraps);
      map.tiles['0,3'].wonder = 'great_volcano';
      map.tiles['9,3'].improvement = 'farm';
      const state = { map, units: {} } as unknown as GameState;
      processWonderEffects(state, () => 0);
      return state.map.tiles['9,3'].improvement;
    };

    expect(eruptedAcrossSeam(true)).toBe('none');
    expect(eruptedAcrossSeam(false)).toBe('farm');
  });
});
