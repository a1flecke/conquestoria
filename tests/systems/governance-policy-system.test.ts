import { describe, it, expect } from 'vitest';
import { GOVERNANCE_POLICY_DEFINITIONS } from '@/systems/governance-policy-definitions';
import {
  setGovernancePolicy, isGovernancePolicyActive, canToggleGovernancePolicy,
  getGovernancePolicyLockedUntilTurn, GOVERNANCE_POLICY_LOCK_TURNS,
} from '@/systems/governance-policy-system';
import { getUnrestPressureBreakdown } from '@/systems/faction-pressure';
import { makeGovernanceTestState } from './helpers/governance-fixture';

describe('#987 governance policy system', () => {
  it('every policy pleases at least one faction and angers a different one', () => {
    for (const policy of GOVERNANCE_POLICY_DEFINITIONS) {
      expect(policy.pleases.length).toBeGreaterThan(0);
      expect(policy.angers.length).toBeGreaterThan(0);
      expect(policy.pleases.some(f => policy.angers.includes(f))).toBe(false);
      expect(policy.pressureAmount).not.toBe(0);
    }
  });

  it('enabling a policy adds its named row to getUnrestPressureBreakdown, disabling removes it', () => {
    const state = makeGovernanceTestState();
    const enabled = setGovernancePolicy(state, 'player', 'conscription-levy', true);
    expect(enabled.success).toBe(true);
    const rowsOn = getUnrestPressureBreakdown('city-1', enabled.state);
    expect(rowsOn).toContainEqual({ label: 'Conscription Levy', amount: 3 });

    const disabled = setGovernancePolicy(enabled.state, 'player', 'conscription-levy', false);
    // still within the lock window, so disabling must be rejected
    expect(disabled.success).toBe(false);
  });

  it('a relief policy (negative pressureAmount) reduces total pressure via its own row', () => {
    const state = makeGovernanceTestState();
    const before = getUnrestPressureBreakdown('city-1', state).reduce((s, r) => s + r.amount, 0);
    const toggled = setGovernancePolicy(state, 'player', 'local-autonomy-writ', true);
    expect(toggled.success).toBe(true);
    const after = getUnrestPressureBreakdown('city-1', toggled.state).reduce((s, r) => s + r.amount, 0);
    expect(after).toBe(before - 3);
  });

  it('does not touch the #927 relief ladder rows — enabling a policy leaves Distance from capital and Empire overextension untouched', () => {
    // 7 cities (> OVEREXTENSION_FREE_CITIES, triggers Empire overextension) with
    // one city exactly 6 hexes from the capital (triggers Distance from
    // capital), the rest at the capital itself so governance load stays low
    // enough (distanceLoad=1) to actually afford the policy being toggled.
    const state = makeGovernanceTestState({ cityCount: 7, spacingQ: 0 });
    state.cities['city-7']!.position = { q: 6, r: 0 };
    const before = getUnrestPressureBreakdown('city-7', state);
    const overextensionBefore = before.find(r => r.label === 'Empire overextension')?.amount;
    const distanceBefore = before.find(r => r.label === 'Distance from capital')?.amount;
    expect(overextensionBefore).toBeGreaterThan(0);
    expect(distanceBefore).toBeGreaterThan(0);

    const toggled = setGovernancePolicy(state, 'player', 'conscription-levy', true);
    expect(toggled.success).toBe(true);
    const after = getUnrestPressureBreakdown('city-7', toggled.state);
    expect(after.find(r => r.label === 'Empire overextension')?.amount).toBe(overextensionBefore);
    expect(after.find(r => r.label === 'Distance from capital')?.amount).toBe(distanceBefore);
  });

  it('rejects enabling the same state twice and rejects disabling an inactive policy', () => {
    const state = makeGovernanceTestState();
    const noop = setGovernancePolicy(state, 'player', 'conscription-levy', false);
    expect(noop.success).toBe(false);
  });

  it('rejects an unknown civilization', () => {
    const state = makeGovernanceTestState();
    const result = setGovernancePolicy(state, 'ghost', 'conscription-levy', true);
    expect(result.success).toBe(false);
  });

  it('allows enabling every policy once capacity headroom covers all of their load costs', () => {
    // 1 city at the capital (0 distance load) -> capacity 3 (base only),
    // exactly enough for all three policies' combined load (3).
    const state = makeGovernanceTestState({ cityCount: 1 });
    let current = state;
    for (const policyId of ['conscription-levy', 'free-trade-charter', 'local-autonomy-writ'] as const) {
      const result = setGovernancePolicy(current, 'player', policyId, true);
      expect(result.success).toBe(true);
      current = result.state;
    }
    expect(isGovernancePolicyActive(current, 'player', 'local-autonomy-writ')).toBe(true);
  });

  it('reports capacity exhaustion once load would exceed the empire\'s governance capacity', () => {
    // 2 cities, the second 10 hexes from the capital -> distance load
    // floor(10/5)=2, capacity 3 (base only). One active policy already
    // consumes the remaining headroom (2 + 1 = 3, exactly at capacity) - a
    // further toggle of a not-yet-active policy must be rejected.
    const state = makeGovernanceTestState({
      cityCount: 2,
      spacingQ: 10,
      civOverrides: { governancePolicies: { 'conscription-levy': true } },
    });
    const result = setGovernancePolicy(state, 'player', 'free-trade-charter', true);
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/capacity/i);
  });

  it('locks a policy for GOVERNANCE_POLICY_LOCK_TURNS turns after toggling, per-policy independently', () => {
    const state = makeGovernanceTestState();
    const toggled = setGovernancePolicy(state, 'player', 'conscription-levy', true);
    expect(toggled.success).toBe(true);
    expect(canToggleGovernancePolicy(toggled.state, 'player', 'conscription-levy')).toBe(false);
    // A different policy is not locked by the first one's toggle.
    expect(canToggleGovernancePolicy(toggled.state, 'player', 'free-trade-charter')).toBe(true);

    const lockedUntil = getGovernancePolicyLockedUntilTurn(toggled.state, 'player', 'conscription-levy');
    expect(lockedUntil).toBe(toggled.state.turn + GOVERNANCE_POLICY_LOCK_TURNS);

    const stillLocked = { ...toggled.state, turn: lockedUntil - 1 };
    expect(canToggleGovernancePolicy(stillLocked, 'player', 'conscription-levy')).toBe(false);
    const unlocked = { ...toggled.state, turn: lockedUntil };
    expect(canToggleGovernancePolicy(unlocked, 'player', 'conscription-levy')).toBe(true);
  });

  it('cannot dodge the lock by rapidly re-toggling — a second toggle attempt inside the lock window fails', () => {
    const state = makeGovernanceTestState();
    const first = setGovernancePolicy(state, 'player', 'conscription-levy', true);
    const second = setGovernancePolicy(first.state, 'player', 'conscription-levy', false);
    expect(second.success).toBe(false);
    expect(isGovernancePolicyActive(first.state, 'player', 'conscription-levy')).toBe(true);
  });
});
