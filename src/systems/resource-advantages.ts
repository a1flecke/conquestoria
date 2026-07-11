import type { ResourceType } from '@/core/types';

export interface ResourceAdvantageDefinition {
  resource: ResourceType;
  discount: number;
  itemIds: readonly string[];
}

export const RESOURCE_ADVANTAGES: readonly ResourceAdvantageDefinition[] = [
  { resource: 'coal', discount: 0.20, itemIds: ['factory', 'steamship', 'ironclad'] },
  { resource: 'oil', discount: 0.15, itemIds: ['tank', 'biplane', 'bomber', 'carrier', 'attack_helicopter'] },
  { resource: 'aluminum', discount: 0.15, itemIds: ['jet_fighter', 'stealth_bomber', 'combat_drone'] },
  { resource: 'rare-earth-elements', discount: 0.15, itemIds: ['combat_drone', 'drone_controller', 'autonomous_frigate', 'electronic_warfare_array', 'network_operations_center'] },
  { resource: 'battery-minerals', discount: 0.15, itemIds: ['combat_drone', 'exosuit_infantry', 'smart_grid', 'drone_fabricator', 'circular_fabricator'] },
];

export function getResourceAdvantagesForItem(itemId: string): readonly ResourceAdvantageDefinition[] {
  return RESOURCE_ADVANTAGES.filter(advantage => advantage.itemIds.includes(itemId));
}

/** Shared soft-material cost multiplier. Hard requirements remain catalog eligibility. */
export function getResourceAdvantageMultiplier(itemId: string, availableResources: ReadonlySet<ResourceType>): number {
  let multiplier = 1;
  for (const advantage of RESOURCE_ADVANTAGES) {
    if (availableResources.has(advantage.resource) && advantage.itemIds.includes(itemId)) {
      multiplier *= 1 - advantage.discount;
    }
  }
  return Math.max(0.75, multiplier);
}
