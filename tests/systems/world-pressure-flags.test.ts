import { describe, it, expect } from 'vitest';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import type { GameSettings } from '@/core/types';

describe('resolveWorldPressureFlags', () => {
  it('defaults aiPressure to "pirates" (#528 MR2 rollout) and the rest off for legacy saves (undefined settings fields)', () => {
    expect(resolveWorldPressureFlags({} as GameSettings)).toEqual({
      aiPressure: 'pirates', aiPressureVisibility: false, aiCrisisInteractions: 'off',
    });
    expect(resolveWorldPressureFlags(undefined)).toEqual({
      aiPressure: 'pirates', aiPressureVisibility: false, aiCrisisInteractions: 'off',
    });
  });
  it('defaults aiPressure to "off" only when explicitly set that way', () => {
    expect(resolveWorldPressureFlags({ aiPressure: 'off' } as GameSettings).aiPressure).toBe('off');
  });
  it('passes explicit values through', () => {
    const settings = { aiPressure: 'pirates', aiPressureVisibility: true, aiCrisisInteractions: 'benign' } as GameSettings;
    expect(resolveWorldPressureFlags(settings)).toEqual({
      aiPressure: 'pirates', aiPressureVisibility: true, aiCrisisInteractions: 'benign',
    });
  });
});
