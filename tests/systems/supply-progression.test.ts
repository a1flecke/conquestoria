import { describe, expect, it } from 'vitest';
import {
  FIELD_RECOVERY_OWNER_TURNS,
  advanceOverextensionStage,
  resolveSupplyRecoveryForUnit,
} from '@/systems/supply-progression';
import type { UnitLandSupplyStatus } from '@/core/types';

describe('advanceOverextensionStage', () => {
  const start: UnitLandSupplyStatus = { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 };

  it('full supply resets the hostile counter to 0', () => {
    const result = advanceOverextensionStage({ ...start, hostileUnsupportedTurns: 3, state: 'degraded' }, 'friendly', true);
    expect(result).toEqual({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });

  it('friendly/allied/unclaimed territory without a source is stable-unsupported, no degradation', () => {
    for (const territoryClass of ['friendly', 'allied', 'unclaimed'] as const) {
      const result = advanceOverextensionStage(start, territoryClass, false);
      expect(result.state).toBe('stable-unsupported');
      expect(result.hostileUnsupportedTurns).toBe(0);
    }
  });

  it('hostile+unsupported turns 1-2 are grace (no penalty)', () => {
    let status = advanceOverextensionStage(start, 'hostile', false);
    expect(status).toEqual({ state: 'grace', hostileUnsupportedTurns: 1, suppliedTurnsSinceRecovery: 0 });
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status).toEqual({ state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 });
  });

  it('hostile+unsupported turns 3-4 are degraded (-10% combat)', () => {
    let status: UnitLandSupplyStatus = { state: 'grace', hostileUnsupportedTurns: 2, suppliedTurnsSinceRecovery: 0 };
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('degraded');
    expect(status.hostileUnsupportedTurns).toBe(3);
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('degraded');
    expect(status.hostileUnsupportedTurns).toBe(4);
  });

  it('hostile+unsupported turn 5+ is severe (-10% combat and -1 move)', () => {
    let status: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 4, suppliedTurnsSinceRecovery: 0 };
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('severe');
    expect(status.hostileUnsupportedTurns).toBe(5);
    status = advanceOverextensionStage(status, 'hostile', false);
    expect(status.state).toBe('severe');
    expect(status.hostileUnsupportedTurns).toBe(6);
  });

  it('leaving hostile territory (even without gaining a source) resets the hostile counter to 0', () => {
    const degraded: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };
    const result = advanceOverextensionStage(degraded, 'unclaimed', false);
    expect(result).toEqual({ state: 'stable-unsupported', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });
});

describe('resolveSupplyRecoveryForUnit', () => {
  const degraded: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 };

  it('physically entering a base tile clears penalties immediately, same turn', () => {
    const result = resolveSupplyRecoveryForUnit(degraded, true, true, false);
    expect(result).toEqual({ state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 0 });
  });

  it('freezes the current stage (does not clear it) until FIELD_RECOVERY_OWNER_TURNS consecutive supplied turns have elapsed', () => {
    // With the real FIELD_RECOVERY_OWNER_TURNS = 1, a single supplied turn
    // already meets the threshold (see the next test), so there is no
    // realistic "not yet met" game state to construct with today's value.
    // This probes the gating *mechanism* directly (a real >= comparison
    // against the exported constant) using a starting counter one step
    // below the threshold, so a future balance change to
    // FIELD_RECOVERY_OWNER_TURNS is honored instead of silently ignored —
    // an earlier draft always cleared to 'full' unconditionally, which
    // only looked correct by coincidence at the current constant value.
    const oneStepBelowThreshold: UnitLandSupplyStatus = { ...degraded, suppliedTurnsSinceRecovery: FIELD_RECOVERY_OWNER_TURNS - 2 };
    const result = resolveSupplyRecoveryForUnit(oneStepBelowThreshold, true, false, false);
    expect(result.suppliedTurnsSinceRecovery).toBe(FIELD_RECOVERY_OWNER_TURNS - 1);
    expect(result.state).toBe('degraded'); // frozen, not yet cleared
    expect(result.hostileUnsupportedTurns).toBe(0); // deterioration stops immediately, even though the stage hasn't cleared
  });

  it('gaining Full Supply in the field for FIELD_RECOVERY_OWNER_TURNS consecutive turns clears the stage, and resets the counter since recovery is complete', () => {
    const oneStepFromThreshold: UnitLandSupplyStatus = { ...degraded, suppliedTurnsSinceRecovery: FIELD_RECOVERY_OWNER_TURNS - 1 };
    const result = resolveSupplyRecoveryForUnit(oneStepFromThreshold, true, false, false);
    expect(result.state).toBe('full');
    expect(result.suppliedTurnsSinceRecovery).toBe(0);
  });

  it('attacking resets the field-recovery counter even while supplied', () => {
    const oneturn: UnitLandSupplyStatus = { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: FIELD_RECOVERY_OWNER_TURNS - 1 };
    const result = resolveSupplyRecoveryForUnit(oneturn, true, false, true);
    expect(result.suppliedTurnsSinceRecovery).toBe(0);
    expect(result.state).toBe('degraded'); // attacking reset progress, so the stage has not cleared
  });

  it('losing supply while not on a base tile does not clear penalties', () => {
    const result = resolveSupplyRecoveryForUnit(degraded, false, false, false);
    expect(result).toBe(degraded);
  });
});
