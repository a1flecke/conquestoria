import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { isHostileOwnerTo } from '@/systems/owner-hostility';

describe('isHostileOwnerTo', () => {
  it('uses world-actor and diplomacy hostility without treating neutral civs as hostile', () => {
    const state = createNewGame(undefined, 'owner-hostility', 'small');

    expect(isHostileOwnerTo(state, 'player', 'barbarian')).toBe(true);
    expect(isHostileOwnerTo(state, 'player', 'beasts')).toBe(true);
    expect(isHostileOwnerTo(state, 'player', 'ai-1')).toBe(false);

    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    expect(isHostileOwnerTo(state, 'player', 'ai-1')).toBe(true);
  });

  it('honors minor-civilization hostility regardless of which side is evaluating it', () => {
    const state = createNewGame(undefined, 'owner-hostility-minor', 'small');
    const minorCivId = Object.keys(state.minorCivs)[0]!;
    state.minorCivs[minorCivId].diplomacy.atWarWith = ['player'];

    expect(isHostileOwnerTo(state, 'player', minorCivId)).toBe(true);
    expect(isHostileOwnerTo(state, minorCivId, 'player')).toBe(true);
  });
});
