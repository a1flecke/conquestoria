import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { getCivilizationStatusForViewer } from '@/systems/civilization-status-presentation';

describe('civilization status presentation', () => {
  it('shows rebuilding guidance only to a cityless owner with a settler', () => {
    const state = createNewGame(undefined, 'status-rebuild', 'small');

    expect(getCivilizationStatusForViewer(state, 'ai-1')).toEqual({
      kind: 'rebuild',
      message: 'Your civilization is still in play. Found a city with a settler to rebuild.',
    });
    expect(getCivilizationStatusForViewer(state, 'player')).toEqual({
      kind: 'rebuild',
      message: 'Your civilization is still in play. Found a city with a settler to rebuild.',
    });
  });
});
