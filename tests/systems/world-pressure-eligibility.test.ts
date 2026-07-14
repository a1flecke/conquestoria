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
  it('flags off: humans only (parity with today)', () => {
    expect(getCrisisEligibleCivIds(base())).toEqual(['h1']);
    expect(isPiratePressureEligible(base(), 'ai-1')).toBe(false);
  });
  it('pirates flag: pirate pressure includes AI, crisis does not', () => {
    expect(isPiratePressureEligible(base('pirates'), 'ai-1')).toBe(true);
    expect(isCrisisPressureEligible(base('pirates'), 'ai-1')).toBe(false);
  });
  it('full flag: both include AI', () => {
    expect(getCrisisEligibleCivIds(base('full'))).toEqual(['ai-1', 'h1']);
  });
});
