import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState, HexCoord, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { resolveLandSupplyForCiv } from '@/systems/supply-system';

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
    map, cities, units: {}, turn: 1,
    civilizations: { [owner]: { techState: { completed: opts.citadelTech ? ['fortification-engineering'] : [] } } as any },
  } as unknown as GameState;
}

describe('resolveLandSupplyForCiv (integration)', () => {
  it('a participating land unit sitting in hostile territory with no source starts accumulating overextension', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    state.map.tiles[hexKey({ q: 19, r: 19 })] = { ...state.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.u1!.landSupply).toEqual({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    expect(next).not.toBe(state);
    expect(state.units.u1!.landSupply).toBeUndefined();
  });

  it('a non-participating unit (settler) is left completely untouched', () => {
    const state = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    state.units = { s1: { id: 's1', type: 'settler', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit };
    const next = resolveLandSupplyForCiv(state, 'rome');
    expect(next.units.s1!.landSupply).toBeUndefined();
  });
});

describe('difficulty invariance (#544 contract §3.3/§25)', () => {
  it('resolveLandSupplyForCiv produces identical output for two states differing only in opponentChallenge', () => {
    const explorerState = makeStateWithSource({ sourceCoord: { q: 0, r: 0 }, sourceKind: 'city', ownerId: 'rome' });
    explorerState.units = {
      u1: { id: 'u1', type: 'warrior', owner: 'rome', position: { q: 19, r: 19 }, health: 100, movementPointsLeft: 1, hasMoved: false, hasActed: false } as Unit,
    };
    explorerState.map.tiles[hexKey({ q: 19, r: 19 })] = { ...explorerState.map.tiles[hexKey({ q: 19, r: 19 })]!, owner: 'carthage' };
    explorerState.opponentChallenge = 'explorer';

    const veteranState = structuredClone(explorerState);
    veteranState.opponentChallenge = 'veteran';

    const explorerResult = resolveLandSupplyForCiv(explorerState, 'rome');
    const veteranResult = resolveLandSupplyForCiv(veteranState, 'rome');
    expect(explorerResult.units.u1!.landSupply).toEqual(veteranResult.units.u1!.landSupply);
  });
});
