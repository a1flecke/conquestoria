import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import {
  getActiveLegendaryConstructionGhostForCity,
  getCompletedLegendaryLandmarksForCity,
} from '@/systems/legendary-wonder-landmark-presentation';
import type { LegendaryWonderLandmarkMetadata, LegendaryWonderLandmarkState } from '@/systems/legendary-wonder-landmark-types';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';

export interface LegendaryWonderMapEntry {
  wonderId: string;
  cityId: string;
  coord: HexCoord;
  ownerId: string;
  relationship: 'owned' | 'known-rival';
  state: LegendaryWonderLandmarkState;
  turnCompleted: number;
  label: string;
  visual: WonderVisualDefinition;
  metadata: LegendaryWonderLandmarkMetadata;
  progressRatio?: number;
}

export function getLegendaryWonderMapEntries(state: GameState, viewerId: string): LegendaryWonderMapEntry[] {
  const visibility = state.civilizations[viewerId]?.visibility;
  if (!visibility) return [];

  const entries: LegendaryWonderMapEntry[] = [];
  for (const city of Object.values(state.cities)) {
    if (city.owner !== viewerId) continue;
    if (getVisibility(visibility, city.position) !== 'visible') continue;
    for (const landmark of getCompletedLegendaryLandmarksForCity(state, viewerId, city.id)) {
      entries.push({
        wonderId: landmark.wonderId,
        cityId: city.id,
        coord: { ...city.position },
        ownerId: viewerId,
        relationship: 'owned',
        state: 'completed',
        turnCompleted: landmark.turnCompleted ?? 0,
        label: landmark.label,
        visual: getWonderVisualDefinition(landmark.wonderId),
        metadata: landmark.metadata,
      });
    }
    const ghost = getActiveLegendaryConstructionGhostForCity(state, viewerId, city, { mapOnly: true });
    if (ghost) {
      entries.push({
        wonderId: ghost.wonderId,
        cityId: city.id,
        coord: { ...city.position },
        ownerId: viewerId,
        relationship: 'owned',
        state: 'under-construction',
        turnCompleted: Number.MAX_SAFE_INTEGER,
        label: ghost.label,
        visual: getWonderVisualDefinition(ghost.wonderId),
        metadata: ghost.metadata,
        progressRatio: ghost.progressRatio,
      });
    }
  }
  return entries;
}
