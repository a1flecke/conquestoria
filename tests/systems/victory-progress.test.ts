import { describe, expect, it } from 'vitest';
import { getVictoryProgressSummary } from '@/systems/victory-progress';
import { makeCouncilFixture } from '../ui/helpers/council-fixture';

describe('victory progress', () => {
  it('computes domination framing from current visible empire state', () => {
    const { state } = makeCouncilFixture();
    const progress = getVictoryProgressSummary(state, 'player');

    expect(progress.toWin.summary).toContain('cities');
    expect(progress.domination.visibleRivals).toBeGreaterThanOrEqual(0);
  });
});
