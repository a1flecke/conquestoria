import { describe, it, expect } from 'vitest';
import type { Civilization, GameState } from '@/core/types';
import { getGovernanceOpportunity, GOVERNANCE_OPPORTUNITY_PRIORITY } from '@/systems/governance-opportunity-presentation';
import { getGovernancePolicyEligibility, setGovernancePolicy } from '@/systems/governance-policy-system';
import { getGovernorAssignmentEligibility, assignGovernor } from '@/systems/governor-system';
import { getGovernancePresentation } from '@/systems/governance-presentation';
import { GOVERNANCE_POLICY_DEFINITIONS } from '@/systems/governance-policy-definitions';
import { makeGovernanceTestState } from './helpers/governance-fixture';

const ALL_LOCKED_POLICIES: Partial<Civilization> = {
  governancePolicyChangedTurn: { 'conscription-levy': 8, 'free-trade-charter': 8, 'local-autonomy-writ': 8 },
};

describe('governance opportunity (#1373)', () => {
  it('offers policy and governor together when both fit', () => {
    const opp = getGovernanceOpportunity(makeGovernanceTestState(), 'player')!;
    expect(opp.freeCapacity).toBe(3);
    expect(opp.adoptablePolicyCount).toBe(3);
    expect(opp.assignableGovernorCount).toBe(1);
    expect(opp.title).toBe('Governance capacity is available');
    expect(opp.why).toBe('You have 3 capacity free. Another policy or governor can fit without giving up a current commitment.');
    expect(opp.priority).toBe(GOVERNANCE_OPPORTUNITY_PRIORITY);
    expect(opp.destination).toEqual({ kind: 'open-governance' });
  });

  it('is policy-only when capacity is one short of a governor', () => {
    const state = makeGovernanceTestState({ civOverrides: { governancePolicies: { 'conscription-levy': true, 'free-trade-charter': true } } });
    const opp = getGovernanceOpportunity(state, 'player')!;
    expect(opp.freeCapacity).toBe(1);
    expect(opp.adoptablePolicyCount).toBe(1);
    expect(opp.assignableGovernorCount).toBe(0);
    expect(opp.why).toBe('You have 1 capacity free. You have room to adopt another governance policy.');
  });

  it('is governor-only when capacity is exactly sufficient and every policy is locked', () => {
    const state = makeGovernanceTestState({ civOverrides: { ...ALL_LOCKED_POLICIES, governancePolicies: { 'conscription-levy': true } } });
    const opp = getGovernanceOpportunity(state, 'player')!;
    expect(opp.freeCapacity).toBe(2);
    expect(opp.adoptablePolicyCount).toBe(0);
    expect(opp.assignableGovernorCount).toBe(1);
    expect(opp.why).toBe('You have 2 capacity free. You have room to assign another governor.');
  });

  it('is absent with no free capacity', () => {
    const state = makeGovernanceTestState({
      civOverrides: { governancePolicies: { 'conscription-levy': true, 'free-trade-charter': true, 'local-autonomy-writ': true } },
    });
    expect(getGovernanceOpportunity(state, 'player')).toBeNull();
  });

  it('is absent when free capacity exists but every remaining action is locked', () => {
    const state = makeGovernanceTestState({
      civOverrides: { ...ALL_LOCKED_POLICIES, governorAssignmentChangedTurn: { 'city-1': 8 } },
    });
    expect(getGovernanceOpportunity(state, 'player')).toBeNull();
  });

  it('does not count an already-governed city or an already-active policy', () => {
    const state = makeGovernanceTestState({
      cityCount: 2, spacingQ: 1,
      civOverrides: { governorAssignments: { 'city-1': true }, governancePolicies: { 'conscription-levy': true } },
    });
    // capacity 3, load 2 (governor) + 1 (policy) => nothing free
    expect(getGovernanceOpportunity(state, 'player')).toBeNull();
    const roomy = makeGovernanceTestState({ cityCount: 2, spacingQ: 1, civOverrides: { governorAssignments: { 'city-1': true }, ...ALL_LOCKED_POLICIES } });
    expect(getGovernanceOpportunity(roomy, 'player')).toBeNull(); // free 1: governor needs 2, policies locked
    const open = makeGovernanceTestState({ cityCount: 2, spacingQ: 1, civOverrides: { governorAssignments: { 'city-1': true }, governancePolicies: { 'conscription-levy': true } } });
    expect(getGovernanceOpportunity(open, 'player')).toBeNull();
  });

  it('is deterministic and does not mutate state', () => {
    const state = makeGovernanceTestState({ cityCount: 3, spacingQ: 2 });
    const before = JSON.stringify(state);
    const first = getGovernanceOpportunity(state, 'player');
    expect(getGovernanceOpportunity(state, 'player')).toEqual(first);
    expect(JSON.stringify(state)).toBe(before);
  });

  it('returns null for an unknown civilization', () => {
    expect(getGovernanceOpportunity(makeGovernanceTestState(), 'nobody')).toBeNull();
  });
});

describe('preview eligibility equals executor eligibility (#1373)', () => {
  const scenarios: Array<[string, GameState]> = [
    ['fresh', makeGovernanceTestState()],
    ['one active policy', makeGovernanceTestState({ civOverrides: { governancePolicies: { 'conscription-levy': true } } })],
    ['capacity exhausted', makeGovernanceTestState({ civOverrides: { governancePolicies: { 'conscription-levy': true, 'free-trade-charter': true, 'local-autonomy-writ': true } } })],
    ['policies locked', makeGovernanceTestState({ civOverrides: ALL_LOCKED_POLICIES })],
    ['governed + locked city', makeGovernanceTestState({ cityCount: 2, spacingQ: 1, civOverrides: { governorAssignments: { 'city-1': true }, governorAssignmentChangedTurn: { 'city-2': 8 } } })],
  ];

  for (const [label, state] of scenarios) {
    it(`policies agree with setGovernancePolicy: ${label}`, () => {
      for (const def of GOVERNANCE_POLICY_DEFINITIONS) {
        for (const enabled of [true, false]) {
          const preview = getGovernancePolicyEligibility(state, 'player', def.id, enabled);
          const executed = setGovernancePolicy(state, 'player', def.id, enabled);
          expect(preview.ok).toBe(executed.success);
          if (!preview.ok) expect(preview.message).toBe(executed.message);
        }
      }
    });

    it(`governors agree with assignGovernor and the panel: ${label}`, () => {
      const panel = getGovernancePresentation(state, 'player');
      for (const cityId of Object.keys(state.cities)) {
        const preview = getGovernorAssignmentEligibility(state, 'player', cityId);
        const executed = assignGovernor(state, 'player', cityId);
        expect(preview.ok).toBe(executed.success);
        if (!preview.ok) expect(preview.message).toBe(executed.message);
        const row = panel.governorCities.find(c => c.cityId === cityId)!;
        if (!row.governed) expect(row.canToggle).toBe(preview.ok);
      }
      for (const def of GOVERNANCE_POLICY_DEFINITIONS) {
        const row = panel.policies.find(p => p.id === def.id)!;
        expect(row.canToggle).toBe(getGovernancePolicyEligibility(state, 'player', def.id, !row.active).ok);
      }
    });
  }

  it('every advertised opportunity is executable', () => {
    for (const [, state] of scenarios) {
      const opp = getGovernanceOpportunity(state, 'player');
      if (!opp) continue;
      const policyOk = GOVERNANCE_POLICY_DEFINITIONS.filter(d => setGovernancePolicy(state, 'player', d.id, true).success).length;
      const governorOk = Object.keys(state.cities).filter(id => assignGovernor(state, 'player', id).success).length;
      expect(policyOk).toBe(opp.adoptablePolicyCount);
      expect(governorOk).toBe(opp.assignableGovernorCount);
    }
  });
});
