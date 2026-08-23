import { describe, expect, it } from 'vitest';
import type { City, GameMap, GameState } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getSupplyOverlayPresentationForViewer } from '@/systems/supply-overlay-presentation';
import { deriveSupplyWarningTransitions } from '@/systems/supply-warning-system';

function makeTwoCivState(): GameState {
  const map: GameMap = { width: 10, height: 10, wrapsHorizontally: false, rivers: [], tiles: {} };
  for (let q = 0; q < 10; q++) {
    for (let r = 0; r < 10; r++) {
      const coord = { q, r };
      const owner = q < 5 ? 'rome' : 'carthage';
      map.tiles[hexKey(coord)] = {
        coord, terrain: 'grassland', elevation: 'lowland', resource: null,
        improvement: 'none', owner, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      };
    }
  }
  const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(key => [key, 'visible' as const])), lastSeen: {} };
  return {
    map, units: {}, turn: 1,
    currentPlayer: 'rome',
    cities: {
      cRome: { id: 'cRome', owner: 'rome', name: 'Rome', position: { q: 2, r: 5 } } as City,
      cCarthage: { id: 'cCarthage', owner: 'carthage', name: 'Carthage', position: { q: 8, r: 5 } } as City,
    },
    civilizations: {
      rome: { id: 'rome', isHuman: true, techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
      carthage: { id: 'carthage', isHuman: false, techState: { completed: [] }, visibility } as unknown as GameState['civilizations'][string],
    },
  } as unknown as GameState;
}

describe('#544 MR2 privacy safeguard (design spec §8)', () => {
  it('the overlay for the human viewer never includes the enemy city as a source', () => {
    const state = makeTwoCivState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources.some(s => s.coord.q === 8 && s.coord.r === 5)).toBe(false);
  });

  it('the overlay for the human viewer never marks enemy territory as covered', () => {
    const state = makeTwoCivState();
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.tiles.every(t => t.coord.q < 5)).toBe(true);
  });

  it('never lists an enemy ship as a supply source, even a shore-supply-capable one', () => {
    const state = makeTwoCivState();
    state.units.enemyShip = {
      id: 'enemyShip', owner: 'carthage', type: 'transport', position: { q: 8, r: 5 },
      health: 100, movementPointsLeft: 3,
    } as GameState['units'][string];
    const result = getSupplyOverlayPresentationForViewer(state, 'rome');
    expect(result.sources.some(s => s.kind === 'ship')).toBe(false);
  });

  it('deriving warnings "as" the human viewer never surfaces the AI civ\'s own unit transitions', () => {
    const state = makeTwoCivState();
    const aiUnit = { id: 'aiUnit1', owner: 'carthage', type: 'warrior', position: { q: 8, r: 5 }, health: 100, movementPointsLeft: 1 } as GameState['units'][string];
    const before: GameState = { ...state, units: { aiUnit1: { ...aiUnit, landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } } } };
    const after: GameState = { ...before, units: { aiUnit1: { ...aiUnit, landSupply: { state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 } } } };
    expect(deriveSupplyWarningTransitions(before, after, 'rome')).toEqual([]);
  });
});
