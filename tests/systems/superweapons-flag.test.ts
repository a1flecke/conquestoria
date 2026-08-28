import { describe, it, expect } from 'vitest';
import { resolveSuperweaponsFlag, isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import type { GameSettings, GameState } from '@/core/types';

describe('resolveSuperweaponsFlag (#545 MR7)', () => {
  it('defaults to "off" for legacy saves (undefined field)', () => {
    expect(resolveSuperweaponsFlag({} as GameSettings)).toBe('off');
    expect(resolveSuperweaponsFlag(undefined)).toBe('off');
  });

  it('passes an explicit "on" through', () => {
    expect(resolveSuperweaponsFlag({ superweapons: 'on' } as GameSettings)).toBe('on');
  });

  it('passes an explicit "off" through', () => {
    expect(resolveSuperweaponsFlag({ superweapons: 'off' } as GameSettings)).toBe('off');
  });
});

describe('isSuperweaponsEnabled (#545 MR7)', () => {
  it('is true when settings.superweapons is "on"', () => {
    const state = { settings: { superweapons: 'on' } } as unknown as GameState;
    expect(isSuperweaponsEnabled(state)).toBe(true);
  });

  it('is false when settings.superweapons is undefined (legacy save)', () => {
    const state = { settings: {} } as unknown as GameState;
    expect(isSuperweaponsEnabled(state)).toBe(false);
  });

  it('is false when settings.superweapons is explicitly "off"', () => {
    const state = { settings: { superweapons: 'off' } } as unknown as GameState;
    expect(isSuperweaponsEnabled(state)).toBe(false);
  });
});
