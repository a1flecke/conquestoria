import type { ResourceYield } from '@/core/types';
import { getWonderDefinition } from '@/systems/wonder-definitions';

export function formatWonderYieldSummary(yields: ResourceYield): string {
  const parts = [
    ['Food', yields.food],
    ['Production', yields.production],
    ['Gold', yields.gold],
    ['Science', yields.science],
  ]
    .filter(([, value]) => typeof value === 'number' && value > 0)
    .map(([label, value]) => `+${value} ${label}`);

  return parts.length > 0 ? `Yields ${parts.join(', ')}` : 'No direct tile yields';
}

export function formatNaturalWonderEffectSummary(wonderId: string): string {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return 'Unknown wonder effect';

  const yieldSummary = formatWonderYieldSummary(definition.yields);
  switch (definition.effect.type) {
    case 'adjacent_yield_bonus':
      return `${yieldSummary}. Improves adjacent tile yields.`;
    case 'combat_bonus':
      return `${yieldSummary}. Grants a defensive combat bonus.`;
    case 'eruption':
      return `${yieldSummary}. May erupt and damage nearby improvements.`;
    case 'healing':
      return `${yieldSummary}. Heals units on the wonder tile.`;
    case 'vision':
      return `${yieldSummary}. Extends vision nearby.`;
    case 'none':
    default:
      return yieldSummary;
  }
}

export function formatWonderDiscoveryRewardSummary(wonderId: string): string {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return 'No discovery reward';

  const rewardType = definition.discoveryBonus.type;
  const rewardLabel = rewardType.charAt(0).toUpperCase() + rewardType.slice(1);
  return `+${definition.discoveryBonus.amount} ${rewardLabel} discovery reward`;
}
