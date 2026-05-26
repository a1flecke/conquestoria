import type { GameState, HexCoord } from '@/core/types';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderPresentationForCity } from '@/systems/legendary-wonder-presentation';
import { formatNaturalWonderEffectSummary } from '@/systems/wonder-presentation-formatting';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import {
  getLegendaryWonderRivalIntelSummariesForViewer,
  type LegendaryWonderRivalIntelSummary,
} from '@/systems/legendary-wonder-intel-presentation';

export type WonderAtlasEntry =
  | NaturalWonderAtlasEntry
  | LegendaryWonderAtlasEntry;

export interface NaturalWonderAtlasEntry {
  kind: 'natural';
  wonderId: string;
  visibility: 'discovered';
  name: string;
  effectSummary: string;
  locationLabel: string;
  coord: HexCoord | null;
  canViewOnMap: boolean;
  visual: WonderVisualDefinition;
}

export interface LegendaryWonderAtlasEntry {
  kind: 'legendary';
  wonderId: string;
  visibility: 'masked';
  name: string;
  maskedLabel: string;
  stateLabel: 'Available' | 'Under construction' | 'Completed' | 'Recovered' | 'Known rival completed' | 'Spotted rival project' | 'Legendary wonder';
  canViewOnMap: false;
  visual: WonderVisualDefinition;
  rivalIntelCount: number;
  rivalIntelBadgeLabel?: string;
}

function findWonderCoord(state: GameState, wonderId: string): HexCoord | null {
  const tile = Object.values(state.map.tiles).find(candidate => candidate.wonder === wonderId);
  return tile ? { ...tile.coord } : null;
}

function formatLocation(coord: HexCoord | null): string {
  return coord ? `Q${coord.q}, R${coord.r}` : 'Location unknown';
}

function naturalWonderEntry(state: GameState, wonderId: string): NaturalWonderAtlasEntry | null {
  const definition = getWonderDefinition(wonderId);
  if (!definition) return null;

  const coord = findWonderCoord(state, wonderId);
  return {
    kind: 'natural',
    wonderId,
    visibility: 'discovered',
    name: definition.name,
    effectSummary: formatNaturalWonderEffectSummary(wonderId),
    locationLabel: formatLocation(coord),
    coord,
    canViewOnMap: coord !== null,
    visual: getWonderVisualDefinition(wonderId),
  };
}

function getLegendaryStateLabel(
  state: GameState,
  viewerId: string,
  wonderId: string,
  rivalIntel: LegendaryWonderRivalIntelSummary | undefined,
): LegendaryWonderAtlasEntry['stateLabel'] {
  const completion = state.completedLegendaryWonders?.[wonderId];
  if (completion?.ownerId === viewerId) {
    return 'Completed';
  }

  const ownedProject = Object.values(state.legendaryWonderProjects ?? {}).find(project =>
    project.ownerId === viewerId && project.wonderId === wonderId,
  );
  if (!ownedProject) {
    return rivalIntel?.stateLabel ?? 'Legendary wonder';
  }

  if (ownedProject.phase === 'ready_to_build') {
    const cityEntry = getLegendaryWonderPresentationForCity(state, viewerId, ownedProject.cityId)
      .find(entry => entry.wonderId === wonderId);
    return cityEntry?.canStartBuild ? 'Available' : rivalIntel?.stateLabel ?? 'Legendary wonder';
  }
  if (ownedProject.phase === 'building') return 'Under construction';
  if (ownedProject.phase === 'completed') return 'Completed';
  if (ownedProject.phase === 'lost_race') return 'Recovered';
  return rivalIntel?.stateLabel ?? 'Legendary wonder';
}

function legendaryWonderEntry(
  state: GameState,
  viewerId: string,
  wonderId: string,
  name: string,
  rivalIntel: LegendaryWonderRivalIntelSummary | undefined,
): LegendaryWonderAtlasEntry {
  const visual = getWonderVisualDefinition(wonderId);
  return {
    kind: 'legendary',
    wonderId,
    visibility: 'masked',
    name,
    maskedLabel: visual.maskedLabel ?? 'Legendary wonder',
    stateLabel: getLegendaryStateLabel(state, viewerId, wonderId, rivalIntel),
    canViewOnMap: false,
    visual,
    rivalIntelCount: rivalIntel?.activityCount ?? 0,
    rivalIntelBadgeLabel: rivalIntel?.badgeLabel,
  };
}

export function getWonderAtlasEntries(state: GameState, viewerId: string): WonderAtlasEntry[] {
  const naturalEntries = Object.entries(state.wonderDiscoverers ?? {})
    .filter(([, discoverers]) => discoverers.includes(viewerId))
    .map(([wonderId]) => naturalWonderEntry(state, wonderId))
    .filter((entry): entry is NaturalWonderAtlasEntry => entry !== null);

  const rivalIntelSummaries = getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId);
  const legendaryEntries = getLegendaryWonderDefinitions().map(definition =>
    legendaryWonderEntry(state, viewerId, definition.id, definition.name, rivalIntelSummaries.get(definition.id)),
  );

  return [...naturalEntries, ...legendaryEntries];
}
