import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { isAIHostileOwner } from '@/ai/ai-hostility';

describe('ai-hostility', () => {
  it('treats crisis forces as hostile when beast contests are disabled', () => {
    const state = createNewGame('rome', 'crisis-ai-hostility', 'small');
    state.settings.aiContestsBeasts = false;

    expect(isAIHostileOwner(state, 'player', 'crisis-force')).toBe(true);
  });
});
