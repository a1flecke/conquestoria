import type { GameState, LegendaryWonderDefinition, LegendaryWonderTacticalEffect } from '@/core/types';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';

export function getCompletedLegendaryWonderTacticalEffects(
  state: GameState,
  civId: string,
  definitions: readonly LegendaryWonderDefinition[] = getLegendaryWonderDefinitions(),
): LegendaryWonderTacticalEffect[] {
  const definitionsById = new Map(definitions.map(definition => [definition.id, definition]));
  return Object.entries(state.completedLegendaryWonders ?? {})
    .filter(([, completion]) => completion.ownerId === civId)
    .sort(([left], [right]) => left.localeCompare(right))
    .flatMap(([wonderId]) => definitionsById.get(wonderId)?.reward.tacticalEffects ?? [])
    .map(effect => ({ ...effect, ...(effect.kind === 'per-era-role-training-xp' ? { roles: [...effect.roles] } : {}), ...(effect.kind === 'adjacent-citadel-defense' ? { excludedRoles: [...effect.excludedRoles] } : {}) }));
}

export function getTacticalWonderAiValue(
  state: GameState,
  civId: string,
  definitions?: readonly LegendaryWonderDefinition[],
): number {
  return getCompletedLegendaryWonderTacticalEffects(state, civId, definitions)
    .reduce((total, effect) => total + effect.aiValue, 0);
}
