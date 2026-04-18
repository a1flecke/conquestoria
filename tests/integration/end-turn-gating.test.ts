import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { needsResearchChoice } from '@/systems/planning-system';

describe('end-turn gating', () => {
  it('detects when the player has no active research but valid options exist', () => {
    const state = createNewGame(undefined, 'end-turn-gating-seed', 'small');
    expect(needsResearchChoice(state, state.currentPlayer)).toBe(true);
  });
});
