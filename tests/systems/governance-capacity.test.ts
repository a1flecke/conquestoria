import { describe, it, expect } from 'vitest';
import { getGovernanceCapacity, getGovernanceLoad, getGovernancePosture, GOVERNOR_LOAD_COST } from '@/systems/governance-capacity';
import { makeGovernanceTestState } from './helpers/governance-fixture';

describe('#987 governance capacity/load', () => {
  it('reports centralized posture by default (absent federalismEnabled)', () => {
    const state = makeGovernanceTestState();
    expect(getGovernancePosture(state, 'player')).toBe('centralized');
  });

  it('reports autonomous posture when Federal Autonomy is enabled', () => {
    const state = makeGovernanceTestState({ civOverrides: { federalismEnabled: true } });
    expect(getGovernancePosture(state, 'player')).toBe('autonomous');
  });

  it('unknown civ has zero capacity and load', () => {
    const state = makeGovernanceTestState();
    expect(getGovernanceCapacity(state, 'ghost').total).toBe(0);
    expect(getGovernanceLoad(state, 'ghost').total).toBe(0);
  });

  describe.each([1, 3, 6, 10, 15])('at %i cities', cityCount => {
    it('centralized posture grants a per-city capacity bonus, capped at +4', () => {
      const state = makeGovernanceTestState({ cityCount });
      const capacity = getGovernanceCapacity(state, 'player');
      const expectedPostureBonus = Math.min(4, Math.floor(cityCount / 3));
      expect(capacity.byCategory.posture).toBe(expectedPostureBonus);
      expect(capacity.total).toBe(3 + 0 + expectedPostureBonus);
    });

    it('autonomous posture grants no per-city capacity bonus', () => {
      const state = makeGovernanceTestState({ cityCount, civOverrides: { federalismEnabled: true } });
      const capacity = getGovernanceCapacity(state, 'player');
      expect(capacity.byCategory.posture).toBe(0);
      expect(capacity.total).toBe(3);
    });

    it('load is zero with every city at (or near) the capital and no active policies', () => {
      const state = makeGovernanceTestState({ cityCount, spacingQ: 0 });
      const load = getGovernanceLoad(state, 'player');
      expect(load.total).toBe(0);
      expect(Object.keys(load.byCity)).toHaveLength(cityCount);
    });
  });

  it('infrastructure adds capacity from Courthouse, Regional Capital, and the two ladder techs, capped at +4', () => {
    const withCourthouse = makeGovernanceTestState();
    withCourthouse.cities['city-1']!.buildings = ['courthouse'];
    expect(getGovernanceCapacity(withCourthouse, 'player').byCategory.infrastructure).toBe(1);

    const withAll = makeGovernanceTestState({ completedTechs: ['separation-of-powers', 'railway-expansion'] });
    withAll.cities['city-1']!.buildings = ['courthouse', 'regional_capital'];
    expect(getGovernanceCapacity(withAll, 'player').byCategory.infrastructure).toBe(4);
  });

  it('distance load is halved (floored) under autonomous posture vs centralized', () => {
    // spacingQ=30 puts the second city 30 hexes from the capital: distanceLoad = floor(30/5) = 6.
    const centralized = makeGovernanceTestState({ cityCount: 2, spacingQ: 30 });
    const autonomous = makeGovernanceTestState({ cityCount: 2, spacingQ: 30, civOverrides: { federalismEnabled: true } });
    const centralizedLoad = getGovernanceLoad(centralized, 'player');
    const autonomousLoad = getGovernanceLoad(autonomous, 'player');
    expect(centralizedLoad.byCity['city-2']).toBe(6);
    expect(autonomousLoad.byCity['city-2']).toBe(3);
    expect(autonomousLoad.total).toBeLessThan(centralizedLoad.total);
  });

  it('active policies add their load cost to the total, attributed by policy id', () => {
    const state = makeGovernanceTestState({ civOverrides: { governancePolicies: { 'conscription-levy': true } } });
    const load = getGovernanceLoad(state, 'player');
    expect(load.byPolicy['conscription-levy']).toBe(1);
    expect(load.total).toBe(1 /* policy only — the lone city is at the capital, 0 distance load */);
  });

  it('a policy present but explicitly false does not add load', () => {
    const state = makeGovernanceTestState({ civOverrides: { governancePolicies: { 'conscription-levy': false } } });
    expect(getGovernanceLoad(state, 'player').byPolicy['conscription-levy']).toBeUndefined();
  });

  it('#928: an active governor assignment adds GOVERNOR_LOAD_COST, attributed by city id', () => {
    const state = makeGovernanceTestState({ civOverrides: { governorAssignments: { 'city-1': true } } });
    const load = getGovernanceLoad(state, 'player');
    expect(load.byGovernor['city-1']).toBe(GOVERNOR_LOAD_COST);
    expect(load.total).toBe(GOVERNOR_LOAD_COST);
  });

  it('#928: governors and policies share the same capacity pool — a real scarcity tradeoff', () => {
    // 1 city -> capacity 3. A governor (2) plus a policy (1) exactly fills it;
    // a second policy would not fit.
    const state = makeGovernanceTestState({
      civOverrides: {
        governorAssignments: { 'city-1': true },
        governancePolicies: { 'conscription-levy': true },
      },
    });
    const load = getGovernanceLoad(state, 'player');
    expect(load.total).toBe(GOVERNOR_LOAD_COST + 1);
    expect(load.total).toBe(getGovernanceCapacity(state, 'player').total);
  });

  it('#928: a governor assignment for a city no longer owned by this civ contributes no load', () => {
    const state = makeGovernanceTestState({ civOverrides: { governorAssignments: { 'city-1': true } } });
    const captured = { ...state, cities: { ...state.cities, 'city-1': { ...state.cities['city-1']!, owner: 'someone-else' } } };
    const load = getGovernanceLoad(captured, 'player');
    expect(load.byGovernor['city-1']).toBeUndefined();
    expect(load.total).toBe(0);
  });
});
