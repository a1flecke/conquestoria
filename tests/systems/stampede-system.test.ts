import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getStampedeProfile, normalizeStampedes } from '@/systems/stampede-system';

describe('Stampede state', () => {
  it('defines recurring pressure profiles for every player challenge', () => {
    expect(getStampedeProfile('explorer')).toEqual({
      cooldownTurns: 12, initialChancePercent: 3, growthPercent: 1, capPercent: 12, herdCount: 2,
    });
    expect(getStampedeProfile('standard')).toEqual({
      cooldownTurns: 8, initialChancePercent: 4, growthPercent: 2, capPercent: 18, herdCount: 3,
    });
    expect(getStampedeProfile('veteran')).toEqual({
      cooldownTurns: 5, initialChancePercent: 5, growthPercent: 3, capPercent: 25, herdCount: 4,
    });
  });

  it('drops malformed Stampede records without mutating valid game state', () => {
    const state = createNewGame('rome', 'stampede-normalization', 'small');
    const malformed = { ...state, stampedes: { player: { targetCivId: 'missing' } } };

    expect(normalizeStampedes(malformed).stampedes).toEqual({});
    expect(state.stampedes).toEqual({});
  });
});
