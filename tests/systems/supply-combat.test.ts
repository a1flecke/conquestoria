import { describe, expect, it } from 'vitest';
import type { Unit } from '@/core/types';
import { getRestAvailability, resolveLandSupplyCombatPenalty } from '@/systems/supply-combat';

describe('resolveLandSupplyCombatPenalty', () => {
  it('full supply and stable-unsupported and grace all apply no penalty', () => {
    for (const state of ['full', 'stable-unsupported', 'grace'] as const) {
      const unit = { landSupply: { state, hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 } } as Unit;
      expect(resolveLandSupplyCombatPenalty(unit).multiplier).toBe(1);
    }
  });

  it('degraded and severe both apply exactly -10%', () => {
    for (const state of ['degraded', 'severe'] as const) {
      const unit = { landSupply: { state, hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 } } as Unit;
      const result = resolveLandSupplyCombatPenalty(unit);
      expect(result.multiplier).toBeCloseTo(0.9);
      expect(result.label).toContain('Overextended');
    }
  });

  it('a unit with no landSupply status (never resolved) applies no penalty', () => {
    expect(resolveLandSupplyCombatPenalty({} as Unit).multiplier).toBe(1);
  });
});

describe('getRestAvailability', () => {
  it('stable-unsupported, grace, degraded, and severe all cannot heal via Rest', () => {
    for (const state of ['stable-unsupported', 'grace', 'degraded', 'severe'] as const) {
      const result = getRestAvailability({ state, hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
      expect(result.canRest).toBe(false);
      expect(result.reason).toBe('Cannot recover while unsupported — restore supply first.');
    }
  });

  it('full supply can Rest normally', () => {
    const result = getRestAvailability({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
    expect(result.canRest).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it('a unit with no landSupply status (never resolved) can Rest normally', () => {
    expect(getRestAvailability(undefined).canRest).toBe(true);
  });
});
