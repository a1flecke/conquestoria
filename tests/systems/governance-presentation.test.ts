import { describe, it, expect } from 'vitest';
import { getGovernancePresentation } from '@/systems/governance-presentation';
import { setGovernancePolicy } from '@/systems/governance-policy-system';
import { assignGovernor } from '@/systems/governor-system';
import { makeGovernanceTestState } from './helpers/governance-fixture';

describe('#987 governance presentation', () => {
  it('projects all three policies with pleases/angers metadata and inactive/toggleable state', () => {
    const state = makeGovernanceTestState();
    const presentation = getGovernancePresentation(state, 'player');
    expect(presentation.posture).toBe('centralized');
    expect(presentation.policies).toHaveLength(3);
    for (const policy of presentation.policies) {
      expect(policy.active).toBe(false);
      expect(policy.pleases.length).toBeGreaterThan(0);
      expect(policy.angers.length).toBeGreaterThan(0);
    }
  });

  it('reflects an active, locked policy as not currently toggleable', () => {
    const state = makeGovernanceTestState();
    const toggled = setGovernancePolicy(state, 'player', 'conscription-levy', true);
    const presentation = getGovernancePresentation(toggled.state, 'player');
    const levy = presentation.policies.find(p => p.id === 'conscription-levy')!;
    expect(levy.active).toBe(true);
    expect(levy.canToggle).toBe(false);
    expect(levy.lockedUntilTurn).toBe(toggled.state.turn + 5);
  });

  it('reflects capacity exhaustion as not-toggleable for an inactive policy, even when unlocked', () => {
    const state = makeGovernanceTestState({
      cityCount: 2, spacingQ: 10,
      civOverrides: { governancePolicies: { 'conscription-levy': true } },
    });
    const presentation = getGovernancePresentation(state, 'player');
    const freeTrade = presentation.policies.find(p => p.id === 'free-trade-charter')!;
    expect(freeTrade.active).toBe(false);
    expect(freeTrade.canToggle).toBe(false);
    expect(freeTrade.lockedUntilTurn).toBeNull();
  });

  it('reports a null lockedUntilTurn once a past lock has actually expired, even though the policy was toggled before (regression)', () => {
    // Toggled at turn 5, lock window is 5 turns (unlocks at turn 10). The
    // fixture's default state.turn is 10, so the lock has already expired --
    // the only real blocker left is capacity, which this state also exhausts
    // via a second, capacity-consuming active policy.
    const state = makeGovernanceTestState({
      cityCount: 2, spacingQ: 10,
      civOverrides: {
        governancePolicies: { 'conscription-levy': true },
        governancePolicyChangedTurn: { 'free-trade-charter': 5 },
      },
    });
    const freeTrade = getGovernancePresentation(state, 'player').policies.find(p => p.id === 'free-trade-charter')!;
    expect(freeTrade.canToggle).toBe(false);
    expect(freeTrade.lockedUntilTurn).toBeNull();
  });

  it('reports a non-null lockedUntilTurn while the lock is still actually active', () => {
    // Toggled at turn 8, lock window is 5 turns (unlocks at turn 13). The
    // fixture's default state.turn is 10, so the lock is still active.
    const state = makeGovernanceTestState({
      civOverrides: { governancePolicyChangedTurn: { 'free-trade-charter': 8 } },
    });
    const freeTrade = getGovernancePresentation(state, 'player').policies.find(p => p.id === 'free-trade-charter')!;
    expect(freeTrade.canToggle).toBe(false);
    expect(freeTrade.lockedUntilTurn).toBe(13);
  });

  it('reports autonomous posture', () => {
    const state = makeGovernanceTestState({ civOverrides: { federalismEnabled: true } });
    expect(getGovernancePresentation(state, 'player').posture).toBe('autonomous');
  });

  describe('#928 governor cities', () => {
    it('lists every owned city, ordered by pressure descending', () => {
      const state = makeGovernanceTestState({ cityCount: 3, spacingQ: 30 });
      const presentation = getGovernancePresentation(state, 'player');
      expect(presentation.governorCities).toHaveLength(3);
      const pressures = presentation.governorCities.map(c => c.pressure);
      expect(pressures).toEqual([...pressures].sort((a, b) => b - a));
    });

    it('reflects an active, locked governor as not currently toggleable', () => {
      const state = makeGovernanceTestState();
      const assigned = assignGovernor(state, 'player', 'city-1');
      const presentation = getGovernancePresentation(assigned.state, 'player');
      const city = presentation.governorCities.find(c => c.cityId === 'city-1')!;
      expect(city.governed).toBe(true);
      expect(city.canToggle).toBe(false);
      expect(city.lockedUntilTurn).toBe(assigned.state.turn + 5);
    });

    it('reflects capacity exhaustion as not-toggleable for an ungoverned city, even when unlocked', () => {
      const state = makeGovernanceTestState({
        cityCount: 2, spacingQ: 10,
        civOverrides: { governorAssignments: { 'city-1': true } },
      });
      const presentation = getGovernancePresentation(state, 'player');
      const city2 = presentation.governorCities.find(c => c.cityId === 'city-2')!;
      expect(city2.governed).toBe(false);
      expect(city2.canToggle).toBe(false);
      expect(city2.lockedUntilTurn).toBeNull();
    });

    it('reports a null lockedUntilTurn once a past reassignment lock has actually expired, even though the city was toggled before (regression)', () => {
      // Toggled at turn 5, lock window is 5 turns (unlocks at turn 10). The
      // fixture's default state.turn is 10, so the lock has already expired --
      // the only real blocker left is capacity, exhausted here by a second
      // city already holding a governor.
      const state = makeGovernanceTestState({
        cityCount: 2, spacingQ: 10,
        civOverrides: {
          governorAssignments: { 'city-1': true },
          governorAssignmentChangedTurn: { 'city-2': 5 },
        },
      });
      const city2 = getGovernancePresentation(state, 'player').governorCities.find(c => c.cityId === 'city-2')!;
      expect(city2.canToggle).toBe(false);
      expect(city2.lockedUntilTurn).toBeNull();
    });

    it('reports a non-null lockedUntilTurn while a reassignment lock is still actually active', () => {
      // Toggled at turn 8, lock window is 5 turns (unlocks at turn 13). The
      // fixture's default state.turn is 10, so the lock is still active.
      const state = makeGovernanceTestState({
        civOverrides: { governorAssignmentChangedTurn: { 'city-1': 8 } },
      });
      const city1 = getGovernancePresentation(state, 'player').governorCities.find(c => c.cityId === 'city-1')!;
      expect(city1.canToggle).toBe(false);
      expect(city1.lockedUntilTurn).toBe(13);
    });
  });
});
