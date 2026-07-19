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
    }
  | { kind: 'city-production-percent'; normalPercent: number; normalCap: number; surgedPercent: number; surgedCap: number }
  | { kind: 'city-science-percent'; normalPercent: number; normalCap: number; surgedPercent: number; surgedCap: number }
  | { kind: 'route-gold'; normalAmount: number; surgedAmount: number }
  | { kind: 'unit-vision'; normalAmount: number; surgedAmount: number }
  | { kind: 'formation-strength'; normalAmount: number; surgedAmount: number; mode: 'attack' | 'defense' };

export interface NetworkPlanDefinition {
  id: NetworkPlanDefinitionId;
  targetKind: 'friendly-city' | 'at-war-enemy-city' | 'owned-city' | 'owned-units' | 'formation';
  range: number;
  load: number;
  sourceKind?: 'unit' | 'city';
  /** City plans are live only while their source still owns one of these anchors. */
  sourceBuildings?: readonly string[];
  category: 'security' | 'offense' | 'infrastructure' | 'coordination';
  effect: NetworkPlanEffect;
}

export const NETWORK_PLAN_DEFINITIONS: Readonly<Record<NetworkPlanDefinitionId, NetworkPlanDefinition>> = {
  harden: {
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
  },
  exploit: {
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
  },
  'fabrication-sprint': { id: 'fabrication-sprint', targetKind: 'owned-city', range: 0, load: 2, sourceKind: 'city', sourceBuildings: ['network_operations_center', 'smart_grid'], category: 'infrastructure', effect: { kind: 'city-production-percent', normalPercent: 10, normalCap: 4, surgedPercent: 15, surgedCap: 6 } },
  'research-mesh': { id: 'research-mesh', targetKind: 'owned-city', range: 0, load: 3, sourceKind: 'city', sourceBuildings: ['network_operations_center', 'data_center'], category: 'infrastructure', effect: { kind: 'city-science-percent', normalPercent: 5, normalCap: 3, surgedPercent: 8, surgedCap: 5 } },
  'logistics-routing': { id: 'logistics-routing', targetKind: 'owned-city', range: 0, load: 2, sourceKind: 'city', sourceBuildings: ['network_operations_center', 'automated_port'], category: 'infrastructure', effect: { kind: 'route-gold', normalAmount: 1, surgedAmount: 2 } },
  'survey-grid': { id: 'survey-grid', targetKind: 'owned-units', range: 0, load: 1, sourceKind: 'city', sourceBuildings: ['network_operations_center', 'space_center'], category: 'infrastructure', effect: { kind: 'unit-vision', normalAmount: 1, surgedAmount: 2 } },
  'guardian-screen': { id: 'guardian-screen', targetKind: 'formation', range: 2, load: 2, sourceKind: 'unit', category: 'coordination', effect: { kind: 'formation-strength', normalAmount: 4, surgedAmount: 6, mode: 'defense' } },
  'swarm-strike': { id: 'swarm-strike', targetKind: 'formation', range: 2, load: 2, sourceKind: 'unit', category: 'coordination', effect: { kind: 'formation-strength', normalAmount: 4, surgedAmount: 6, mode: 'attack' } },
};

export function getNetworkPlanDefinition(id: NetworkPlanDefinitionId): NetworkPlanDefinition {
  return NETWORK_PLAN_DEFINITIONS[id];
}

/** Survey Grid spends one base Load plus one per selected recipient; all other plans use fixed Load. */
export function getNetworkPlanLoad(id: NetworkPlanDefinitionId, linkedUnitIds: readonly string[] = []): number {
  const definition = getNetworkPlanDefinition(id);
  return id === 'survey-grid' ? definition.load + linkedUnitIds.length : definition.load;
}
