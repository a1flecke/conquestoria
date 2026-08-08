import type { CombatModifierFact, GameState, Unit } from '@/core/types';
import { hexDistance, wrappedHexDistance } from './hex-utils';
import { UNIT_DEFINITIONS } from './unit-system';

export interface CombinedArmsResult {
  multiplier: number;
  provider?: Unit;
  fact?: CombatModifierFact;
}

export function resolveCombinedArms(state: GameState, unit: Unit): CombinedArmsResult {
  const requirement = UNIT_DEFINITIONS[unit.type].combinedArms?.requiresAdjacent;
  if (!requirement) return { multiplier: 1 };

  const provider = Object.values(state.units)
    .filter(candidate => candidate.owner === unit.owner && !candidate.transportId)
    .filter(candidate => UNIT_DEFINITIONS[candidate.type].combinedArms?.provides?.includes(requirement.providerTag))
    .filter(candidate => {
      const distance = state.map.wrapsHorizontally
        ? wrappedHexDistance(candidate.position, unit.position, state.map.width)
        : hexDistance(candidate.position, unit.position);
      return distance === 1;
    })
    .sort((left, right) => left.id.localeCompare(right.id))[0];

  if (!provider) return { multiplier: 1 };
  return {
    multiplier: requirement.multiplier,
    provider,
    fact: {
      key: 'combined-arms',
      label: `${requirement.label} — adjacent ${UNIT_DEFINITIONS[provider.type].name}`,
      sourceVisibility: 'owner',
      operation: 'multiplier',
      value: requirement.multiplier,
      outcome: 'applied',
    },
  };
}
