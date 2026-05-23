import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export interface LegendaryWonderMapEntry {
  wonderId: string;
  cityId: string;
  coord: HexCoord;
  ownerId: string;
  relationship: 'owned';
  turnCompleted: number;
  label: string;
  visual: WonderVisualDefinition;
}

export function getLegendaryWonderMapEntries(state: GameState, viewerId: string): LegendaryWonderMapEntry[] {
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return [];

  return Object.entries(state.completedLegendaryWonders ?? {})
    .flatMap(([wonderId, completion]) => {
      if (completion.ownerId !== viewerId) return [];
      const city = state.cities[completion.cityId];
      if (!city) return [];
      if (getVisibility(visibility, city.position) !== 'visible') return [];
      const definition = getLegendaryWonderDefinition(wonderId);
      return [{
        wonderId,
        cityId: city.id,
        coord: { ...city.position },
        ownerId: completion.ownerId,
        relationship: 'owned' as const,
        turnCompleted: completion.turnCompleted,
        label: definition?.name ?? 'Legendary wonder',
        visual: getWonderVisualDefinition(wonderId),
      }];
    });
}
