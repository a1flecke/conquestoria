import { describe, expect, it } from 'vitest';
import {
  getGeneralThreshold,
  addGeneralProgress,
  hasCrossedGeneralThreshold,
} from '@/systems/great-general-system';

describe('getGeneralThreshold', () => {
  it('the first General costs less than the second', () => {
    expect(getGeneralThreshold(0)).toBeLessThan(getGeneralThreshold(1));
  });

  it('every successive General still costs strictly more in total (always rising)', () => {
    for (let earned = 0; earned < 12; earned++) {
      expect(getGeneralThreshold(earned + 1)).toBeGreaterThan(getGeneralThreshold(earned));
    }
  });

  it('the marginal per-General increase shrinks over time (softened escalation), never flattening to zero', () => {
    const delta1 = getGeneralThreshold(1) - getGeneralThreshold(0);
    const delta5 = getGeneralThreshold(5) - getGeneralThreshold(4);
    const delta10 = getGeneralThreshold(10) - getGeneralThreshold(9);
    expect(delta5).toBeLessThan(delta1);
    expect(delta10).toBeLessThanOrEqual(delta5);
    expect(delta10).toBeGreaterThan(0);
  });

  it('has no difficulty parameter at all (difficulty-invariant by construction)', () => {
    expect(getGeneralThreshold.length).toBe(1);
  });
});

describe('addGeneralProgress', () => {
  it('starts from zero when no prior progress exists', () => {
    expect(addGeneralProgress(undefined, 10)).toEqual({ points: 10, generalsEarned: 0 });
  });

  it('accumulates onto existing progress without resetting generalsEarned', () => {
    expect(addGeneralProgress({ points: 5, generalsEarned: 1 }, 10)).toEqual({ points: 15, generalsEarned: 1 });
  });
});

describe('hasCrossedGeneralThreshold', () => {
  it('is false below the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold - 1, generalsEarned: 0 })).toBe(false);
  });

  it('is true at or above the next threshold', () => {
    const threshold = getGeneralThreshold(0);
    expect(hasCrossedGeneralThreshold({ points: threshold, generalsEarned: 0 })).toBe(true);
  });

  it('uses the threshold for the NEXT General, not the first, once one has already been earned', () => {
    const firstThreshold = getGeneralThreshold(0);
    const secondThreshold = getGeneralThreshold(1);
    // enough points to have crossed the first threshold, but not the second
    const progress = { points: firstThreshold + 1, generalsEarned: 1 };
    expect(progress.points).toBeLessThan(secondThreshold);
    expect(hasCrossedGeneralThreshold(progress)).toBe(false);
  });
});
