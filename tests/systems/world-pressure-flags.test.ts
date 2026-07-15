import { describe, it, expect } from 'vitest';
import { resolveWorldPressureFlags } from '@/systems/world-pressure-flags';
import type { GameSettings } from '@/core/types';

describe('resolveWorldPressureFlags', () => {
  it('defaults aiPressure to "full" (#529 MR3), aiPressureVisibility to true (#531 MR5), and aiCrisisInteractions to "benign" (#532 MR6), for legacy saves (undefined settings fields)', () => {
    expect(resolveWorldPressureFlags({} as GameSettings)).toEqual({
      aiPressure: 'full', aiPressureVisibility: true, aiCrisisInteractions: 'benign',
    });
    expect(resolveWorldPressureFlags(undefined)).toEqual({
      aiPressure: 'full', aiPressureVisibility: true, aiCrisisInteractions: 'benign',
    });
  });
  it('defaults aiPressureVisibility to false only when explicitly set that way', () => {
    expect(resolveWorldPressureFlags({ aiPressureVisibility: false } as GameSettings).aiPressureVisibility).toBe(false);
  });
  it('defaults aiCrisisInteractions to "off" only when explicitly set that way', () => {
    expect(resolveWorldPressureFlags({ aiCrisisInteractions: 'off' } as GameSettings).aiCrisisInteractions).toBe('off');
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
