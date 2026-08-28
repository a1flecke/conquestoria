import { describe, it, expect } from 'vitest';
import { resolveSuperweaponContentDescription } from '@/systems/superweapon-content-honesty';
import type { GameState } from '@/core/types';

function makeState(superweapons: 'off' | 'on'): GameState {
  return { settings: { superweapons } } as unknown as GameState;
}

describe('resolveSuperweaponContentDescription (#545 MR7)', () => {
  it('returns the real description unchanged when superweapons is on', () => {
    const real = 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn, +1 arsenal capacity.';
    expect(resolveSuperweaponContentDescription('missile_silo', real, makeState('on'))).toBe(real);
  });

  it('returns an honest plain-yield fallback for a known entity when superweapons is off', () => {
    const real = 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn, +1 arsenal capacity.';
    const result = resolveSuperweaponContentDescription('missile_silo', real, makeState('off'));
    expect(result).not.toMatch(/launch|capacity|ICBM|intercontinental/i);
    expect(result).toContain('production');
  });

  it('returns the real description unchanged for an entity with no off-mode entry, regardless of setting', () => {
    const real = 'A generic building with no strategic-weapons claim.';
    expect(resolveSuperweaponContentDescription('temple', real, makeState('off'))).toBe(real);
  });
});
