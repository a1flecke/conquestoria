import { describe, expect, it } from 'vitest';
import { isSubmarineConcealedFrom } from '@/systems/concealment';
import type { GameState, Unit } from '@/core/types';

function tile(terrain: string) {
  return { terrain };
}

/**
 * Two humans sharing a device (hot-seat): civ-a and civ-b are both hostile
 * to civ-c, which owns a submarine sitting at the same contested ocean
 * tile. Only civ-a flew a Patrol mission covering that tile this turn;
 * civ-b did not. Same shape as airborne-hotseat.test.ts's fixtures (#543).
 */
function makeHotSeatFixture(): GameState {
  const submarine: Unit = {
    id: 'sub-c', type: 'submarine', owner: 'civ-c', position: { q: 5, r: 0 },
    movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
  };

  return {
    turn: 5,
    units: { 'sub-c': submarine },
    cities: {},
    patrolReveals: [
      { ownerCivId: 'civ-a', center: { q: 5, r: 0 }, range: 6, expiresAtTurn: 5 },
    ],
    civilizations: {
      'civ-a': { diplomacy: { atWarWith: ['civ-c'], events: [] }, visibility: { tiles: {} } },
      'civ-b': { diplomacy: { atWarWith: ['civ-c'], events: [] }, visibility: { tiles: {} } },
      'civ-c': { diplomacy: { atWarWith: ['civ-a', 'civ-b'], events: [] }, visibility: { tiles: {} } },
    },
    map: {
      width: 20, height: 20, wrapsHorizontally: false,
      tiles: {
        '0,0': tile('ocean'), '5,0': tile('ocean'),
      },
    },
  } as unknown as GameState;
}

describe('hot-seat isolation — patrol reveal (#582)', () => {
  it('civ A (who flew a Patrol mission covering a submarine) sees it; civ B (who did not patrol there) does not, for the same tile under the same fog', () => {
    const state = makeHotSeatFixture();
    const submarine = state.units['sub-c']!;

    expect(isSubmarineConcealedFrom(state, submarine, 'civ-a')).toBe(false);
    expect(isSubmarineConcealedFrom(state, submarine, 'civ-b')).toBe(true);
  });
});
