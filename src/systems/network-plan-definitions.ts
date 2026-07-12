import type { NetworkPlanDefinitionId } from '@/core/autonomy-state';

export type NetworkPlanEffect =
  | {
      kind: 'mitigation-charge';
      mitigationPercent: number;
      regularChargeCap: number;
      regularRefreshOwnerRounds: number;
      aiSafetyRefreshOwnerRounds: number;
    }
  | {
      kind: 'city-gold-transfer';
      normalPercent: number;
      surgedPercent: number;
    };

export interface NetworkPlanDefinition {
  id: NetworkPlanDefinitionId;
  targetKind: 'friendly-city' | 'at-war-enemy-city';
  range: number;
  load: number;
  effect: NetworkPlanEffect;
}

export const NETWORK_PLAN_DEFINITIONS: Readonly<Record<NetworkPlanDefinitionId, NetworkPlanDefinition>> = {
  harden: {
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
  },
  exploit: {
    id: 'exploit',
    targetKind: 'at-war-enemy-city',
    range: 1,
    load: 2,
    effect: {
      kind: 'city-gold-transfer',
      normalPercent: 10,
      surgedPercent: 15,
    },
  },
};

export function getNetworkPlanDefinition(id: NetworkPlanDefinitionId): NetworkPlanDefinition {
  return NETWORK_PLAN_DEFINITIONS[id];
}
