import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { LAND_SUPPLY_RADII, getLandSupplySourceCoverage } from '@/systems/supply-sources';

function makeStateWithSource(opts: {
  sourceCoord: HexCoord;
  sourceKind: 'city' | 'fort';
  citadelTech?: boolean;
  ownerId?: string;
}): GameState {
  const owner = opts.ownerId ?? 'rome';
  const map: GameMap = { width: 20, height: 20, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 20; q++) {
    for (let r = 0; r < 20; r++) {
      const coord = { q, r };
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const cities: GameState['cities'] = {};
  if (opts.sourceKind === 'city') {
    cities.c1 = { id: 'c1', owner, position: opts.sourceCoord } as City;
  } else {
    map.tiles[hexKey(opts.sourceCoord)] = {
      ...map.tiles[hexKey(opts.sourceCoord)]!,
      improvement: 'fort', improvementTurnsLeft: 0,
    };
  }
  return {
    map, cities,
    civilizations: { [owner]: { techState: { completed: opts.citadelTech ? ['fortification-engineering'] : [] } } as any },
  } as unknown as GameState;
}

describe('getLandSupplySourceCoverage', () => {
  it('City radius covers a farther tile than Fort radius', () => {
    const cityState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'city' });
    const fortState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort' });
    const farCoord = { q: 10 + LAND_SUPPLY_RADII.fort + 1, r: 10 };
    expect(getLandSupplySourceCoverage(cityState, 'rome', farCoord)).toBe(true);
    expect(getLandSupplySourceCoverage(fortState, 'rome', farCoord)).toBe(false);
  });

  it('Citadel tier (fortification-engineering researched) covers farther than base Fort tier, same tile', () => {
    const fortState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort', citadelTech: false });
    const citadelState = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort', citadelTech: true });
    const midCoord = { q: 10 + LAND_SUPPLY_RADII.fort + 1, r: 10 };
    expect(getLandSupplySourceCoverage(fortState, 'rome', midCoord)).toBe(false);
    expect(getLandSupplySourceCoverage(citadelState, 'rome', midCoord)).toBe(true);
  });

  it("a tile outside every source's radius is not covered", () => {
    const cityState = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city' });
    expect(getLandSupplySourceCoverage(cityState, 'rome', { q: 19, r: 19 })).toBe(false);
  });

  it('an enemy-owned Fort does not cover the viewer, even if in range', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'fort', ownerId: 'carthage' });
    expect(getLandSupplySourceCoverage(state, 'rome', { q: 10, r: 10 })).toBe(false);
  });
});
