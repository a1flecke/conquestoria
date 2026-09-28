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
  });
});
