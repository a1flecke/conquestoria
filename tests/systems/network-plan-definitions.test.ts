import { describe, expect, it } from 'vitest';
import {
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
      effect: {
        kind: 'city-gold-transfer',
        normalPercent: 10,
        surgedPercent: 15,
      },
    });
    expect(Object.keys(NETWORK_PLAN_DEFINITIONS).sort()).toEqual(['exploit', 'harden']);
  });
});
