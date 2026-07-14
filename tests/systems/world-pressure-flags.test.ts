import { describe, it, expect } from 'vitest';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import type { GameSettings } from '@/core/types';

describe('resolveWorldPressureFlags', () => {
  it('defaults everything off for legacy saves (undefined settings fields)', () => {
    expect(resolveWorldPressureFlags({} as GameSettings)).toEqual({
      aiPressure: 'off', aiPressureVisibility: false, aiCrisisInteractions: 'off',
    });
    expect(resolveWorldPressureFlags(undefined)).toEqual({
      aiPressure: 'off', aiPressureVisibility: false, aiCrisisInteractions: 'off',
    });
  });
  it('passes explicit values through', () => {
    const settings = { aiPressure: 'pirates', aiPressureVisibility: true, aiCrisisInteractions: 'benign' } as GameSettings;
    expect(resolveWorldPressureFlags(settings)).toEqual({
      aiPressure: 'pirates', aiPressureVisibility: true, aiCrisisInteractions: 'benign',
    });
  });
});
