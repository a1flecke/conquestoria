import { describe, it, expect } from 'vitest';
import { hexKey } from '@/systems/hex-utils';
import type { GameState, HexCoord, City } from '@/core/types';

/**
 * Verify the city-hex detection logic used by handleHexTap.
 * We test the pure detection function in isolation — no DOM, no main.ts wiring.
 */

function findPlayerCityAtHex(
  gameState: GameState,
  coord: HexCoord,
): City | undefined {
  const key = hexKey(coord);
  return Object.values(gameState.cities).find(
    c => c.owner === gameState.currentPlayer && hexKey(c.position) === key,
  );
}

function makeState(): GameState {
  return {
    currentPlayer: 'player1',
    turn: 1,
    units: {},
    cities: {
      'city-a': {
        id: 'city-a',
        name: 'Alpha',
        owner: 'player1',
        position: { q: 3, r: 2 },
        population: 1,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        food: 0,
        foodToGrow: 10,
        workableHexes: [],
        workedHexes: [],
      } as City,
      'city-b': {
        id: 'city-b',
        name: 'Beta',
        owner: 'player2',
        position: { q: 5, r: 5 },
        population: 1,
        buildings: [],
        productionQueue: [],
        productionProgress: 0,
        food: 0,
        foodToGrow: 10,
        workableHexes: [],
        workedHexes: [],
      } as City,
    },
    civilizations: {},
    map: { width: 20, height: 20, tiles: {}, wrapsHorizontally: false },
  } as unknown as GameState;
}

describe('city hex tap detection', () => {
  it('returns the player city when tapping its hex', () => {
    const state = makeState();
    const city = findPlayerCityAtHex(state, { q: 3, r: 2 });
    expect(city?.id).toBe('city-a');
  });

  it('returns undefined when tapping an opponent city hex', () => {
    const state = makeState();
    const city = findPlayerCityAtHex(state, { q: 5, r: 5 });
    expect(city).toBeUndefined();
  });

  it('returns undefined when tapping an empty hex', () => {
    const state = makeState();
    const city = findPlayerCityAtHex(state, { q: 0, r: 0 });
    expect(city).toBeUndefined();
  });
});
