import { describe, it, expect } from 'vitest';
import {
  isCrisisPressureEligible,
  isPiratePressureEligible,
  getCrisisEligibleCivIds,
} from '@/systems/world-pressure-eligibility';

describe('world-pressure eligibility', () => {
  const base = (aiPressure?: string) => ({
    settings: aiPressure ? { aiPressure } : {},
    civilizations: {
      h1: { id: 'h1', isHuman: true, isEliminated: false, cities: ['c1'] },
      'ai-1': { id: 'ai-1', isHuman: false, isEliminated: false, cities: ['c2'] },
    },
  } as any);
  it('flags explicitly off: humans only', () => {
    expect(getCrisisEligibleCivIds(base('off'))).toEqual(['h1']);
    expect(isPiratePressureEligible(base('off'), 'ai-1')).toBe(false);
  });
  it('pirates flag (default since #528 MR2): pirate pressure includes AI, crisis does not', () => {
    expect(isPiratePressureEligible(base('pirates'), 'ai-1')).toBe(true);
    expect(isCrisisPressureEligible(base('pirates'), 'ai-1')).toBe(false);
    // Unset settings now resolve to 'pirates', not 'off' -- same result as explicit.
    expect(isPiratePressureEligible(base(), 'ai-1')).toBe(true);
  });
  it('full flag: both include AI', () => {
    expect(getCrisisEligibleCivIds(base('full'))).toEqual(['ai-1', 'h1']);
  });

  it('excludes eliminated civs directly, not just via getCrisisEligibleCivIds', () => {
    const state = {
      settings: { aiPressure: 'full' },
      civilizations: {
        h1: { id: 'h1', isHuman: true, isEliminated: true, cities: [] },
        'ai-1': { id: 'ai-1', isHuman: false, isEliminated: true, cities: [] },
      },
    } as any;
    expect(isCrisisPressureEligible(state, 'h1')).toBe(false);
    expect(isCrisisPressureEligible(state, 'ai-1')).toBe(false);
    expect(isPiratePressureEligible(state, 'h1')).toBe(false);
    expect(isPiratePressureEligible(state, 'ai-1')).toBe(false);
  });
});
