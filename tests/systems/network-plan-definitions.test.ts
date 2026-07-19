import { describe, expect, it } from 'vitest';
import {
  getNetworkPlanLoad,
  getNetworkPlanDefinition,
  NETWORK_PLAN_DEFINITIONS,
} from '@/systems/network-plan-definitions';

describe('network plan definitions', () => {
  it('defines Harden as a friendly adjacent mitigation plan', () => {
    expect(getNetworkPlanDefinition('harden')).toEqual({
      id: 'harden',
      targetKind: 'friendly-city',
      range: 1,
      load: 1,
      category: 'security',
      effect: {
        kind: 'mitigation-charge',
        mitigationPercent: 50,
        regularChargeCap: 1,
        regularRefreshOwnerRounds: 2,
        aiSafetyRefreshOwnerRounds: 1,
      },
    });
  });

  it('defines Exploit as an adjacent at-war city plan with future Surge metadata only', () => {
    expect(getNetworkPlanDefinition('exploit')).toEqual({
      id: 'exploit',
      targetKind: 'at-war-enemy-city',
      range: 1,
      load: 2,
      category: 'offense',
      effect: {
        kind: 'city-gold-transfer',
        normalPercent: 10,
        surgedPercent: 15,
      },
    });
    expect(Object.keys(NETWORK_PLAN_DEFINITIONS).sort()).toEqual([
      'exploit', 'fabrication-sprint', 'guardian-screen', 'harden',
      'logistics-routing', 'research-mesh', 'survey-grid', 'swarm-strike',
    ]);
  });

  it('defines constructive plans and dormant formation contracts with bounded effects', () => {
    expect(getNetworkPlanDefinition('fabrication-sprint')).toMatchObject({
      targetKind: 'owned-city', sourceKind: 'city', load: 2,
      effect: { kind: 'city-production-percent', normalPercent: 10, normalCap: 4, surgedPercent: 15, surgedCap: 6 },
    });
    expect(getNetworkPlanDefinition('research-mesh')).toMatchObject({
      targetKind: 'owned-city', sourceKind: 'city', load: 3,
      effect: { kind: 'city-science-percent', normalPercent: 5, normalCap: 3, surgedPercent: 8, surgedCap: 5 },
    });
    expect(getNetworkPlanDefinition('guardian-screen').effect).toEqual({
      kind: 'formation-strength', normalAmount: 4, surgedAmount: 6, mode: 'defense',
    });
  });

  it('Autonomous Mobility reduces Survey Grid Load by one but never below its base Load', () => {
    expect(getNetworkPlanLoad('survey-grid', ['u1', 'u2'])).toBe(3);
    expect(getNetworkPlanLoad('survey-grid', ['u1', 'u2'], ['autonomous-mobility'])).toBe(2);
    expect(getNetworkPlanLoad('survey-grid', [], ['autonomous-mobility'])).toBe(1);
  });

  it('Ambient Interfaces reduces Drone Controller formation Load by one', () => {
    expect(getNetworkPlanLoad('guardian-screen')).toBe(2);
    expect(getNetworkPlanLoad('guardian-screen', [], ['ambient-interfaces'])).toBe(1);
    expect(getNetworkPlanLoad('swarm-strike', [], ['ambient-interfaces'])).toBe(1);
  });
});
