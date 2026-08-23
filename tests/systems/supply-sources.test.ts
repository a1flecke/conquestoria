import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import {
  CAPTURED_SOURCE_STABILIZATION_TURNS,
  LAND_SUPPLY_RADII,
  getLandSupplySourceCoverage,
  getPrimarySupplySource,
  isCityStabilized,
  isFortStabilized,
} from '@/systems/supply-sources';

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

describe('isCityStabilized', () => {
  it('a freshly captured city (conquestTurn === current turn) is not yet stabilized', () => {
    const state = { turn: 10 } as GameState;
    const city = { conquestTurn: 10 } as City;
    expect(isCityStabilized(state, city)).toBe(false);
  });

  it('a city becomes stabilized after CAPTURED_SOURCE_STABILIZATION_TURNS.city owner-turns', () => {
    const state = { turn: 10 + CAPTURED_SOURCE_STABILIZATION_TURNS.city } as GameState;
    const city = { conquestTurn: 10 } as City;
    expect(isCityStabilized(state, city)).toBe(true);
  });

  it('a city that was never captured (no conquestTurn) is always stabilized', () => {
    const state = { turn: 1 } as GameState;
    const city = {} as City;
    expect(isCityStabilized(state, city)).toBe(true);
  });
});

describe('isFortStabilized', () => {
  it('a freshly captured fort is not yet stabilized, and matures faster than a city', () => {
    const state = {
      turn: 5 + CAPTURED_SOURCE_STABILIZATION_TURNS.fort,
      map: { tiles: { [hexKey({ q: 1, r: 1 })]: { coord: { q: 1, r: 1 }, fortStabilizationSinceTurn: 5 } } },
    } as unknown as GameState;
    expect(isFortStabilized(state, { q: 1, r: 1 })).toBe(true);
    expect(CAPTURED_SOURCE_STABILIZATION_TURNS.fort).toBeLessThan(CAPTURED_SOURCE_STABILIZATION_TURNS.city);
  });

  it('a fort with no stabilization timestamp (never captured) is always stabilized', () => {
    const state = { turn: 1, map: { tiles: { k: { coord: { q: 0, r: 0 } } } } } as unknown as GameState;
    expect(isFortStabilized(state, { q: 0, r: 0 })).toBe(true);
  });
});

describe('getPrimarySupplySource', () => {
  it('picks the nearer of two in-range sources', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 10, r: 10 }, sourceKind: 'city' });
    state.cities.c2 = { id: 'c2', owner: 'rome', position: { q: 11, r: 10 } } as City;
    const result = getPrimarySupplySource(state, 'rome', { q: 11, r: 11 });
    expect(result?.id).toBe('c2');
  });

  it('breaks ties deterministically by sorted hex key when two sources are genuinely equidistant', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 5, r: 6 }, sourceKind: 'city' }); // c1, hexKey "5,6"
    state.cities.c2 = { id: 'c2', owner: 'rome', position: { q: 6, r: 5 } } as City; // hexKey "6,5"
    const target = { q: 5, r: 5 }; // distance 1 from both c1 and c2 — a genuine tie
    const result = getPrimarySupplySource(state, 'rome', target);
    expect(result?.id).toBe('c1'); // "5,6" sorts before "6,5"
  });

  it('returns null when nothing covers the tile', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city' });
    expect(getPrimarySupplySource(state, 'rome', { q: 19, r: 19 })).toBeNull();
  });
});
