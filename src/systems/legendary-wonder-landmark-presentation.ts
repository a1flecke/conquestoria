import type { City, GameState } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';
import { getLegendaryWonderLandmarkMetadata } from '@/systems/legendary-wonder-landmark-catalog';
import { getLegendaryWonderHostLocationIntelForViewer } from '@/systems/legendary-wonder-intel-presentation';
import type { LegendaryWonderLandmarkView } from '@/systems/legendary-wonder-landmark-types';

export const LEGENDARY_CONSTRUCTION_GHOST_MAP_THRESHOLD = 0.6;

export function getCompletedLegendaryLandmarksForCity(
  state: GameState,
  viewerId: string,
  cityId: string,
): LegendaryWonderLandmarkView[] {
  const city = state.cities[cityId];
  if (!city || city.owner !== viewerId) return [];
  return Object.entries(state.completedLegendaryWonders ?? {})
    .filter(([, completion]) => completion.ownerId === viewerId && completion.cityId === cityId)
    .map(([wonderId, completion]) => ({
      wonderId,
      label: getLegendaryWonderDefinition(wonderId)?.name ?? 'Legendary wonder',
      cityId,
      turnCompleted: completion.turnCompleted,
      relationship: 'owned' as const,
      state: 'completed' as const,
      metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    }))
    .sort((a, b) => (a.turnCompleted ?? 0) - (b.turnCompleted ?? 0) || a.wonderId.localeCompare(b.wonderId));
}

export function getActiveLegendaryConstructionGhostForCity(
  state: GameState,
  viewerId: string,
  city: City,
  options: { mapOnly: boolean },
): LegendaryWonderLandmarkView | null {
  if (city.owner !== viewerId) return null;
  const activeItem = city.productionQueue[0];
  if (!activeItem?.startsWith('legendary:')) return null;
  const wonderId = activeItem.replace(/^legendary:/, '');
  const project = Object.values(state.legendaryWonderProjects ?? {})
    .find(candidate => candidate.ownerId === viewerId && candidate.cityId === city.id && candidate.wonderId === wonderId && candidate.phase === 'building');
  const definition = getLegendaryWonderDefinition(wonderId);
  if (!project || !definition) return null;
  const currentInvestment = city.productionQueue[0] === `legendary:${project.wonderId}`
    ? city.productionProgress
    : project.investedProduction;
  const progressRatio = Math.max(0, Math.min(1, currentInvestment / definition.productionCost));
  if (options.mapOnly && progressRatio < LEGENDARY_CONSTRUCTION_GHOST_MAP_THRESHOLD) return null;
  return {
    wonderId,
    label: definition.name,
    cityId: city.id,
    relationship: 'owned',
    state: 'under-construction',
    metadata: getLegendaryWonderLandmarkMetadata(wonderId),
    progressRatio,
  };
}

export function getLegendaryLandmarkPreviewForCity(
  state: GameState,
  viewerId: string,
  cityId: string,
): LegendaryWonderLandmarkView[] {
  const city = state.cities[cityId];
  if (!city || city.owner !== viewerId) return [];
  const completed = getCompletedLegendaryLandmarksForCity(state, viewerId, cityId);
  const ghost = getActiveLegendaryConstructionGhostForCity(state, viewerId, city, { mapOnly: false });
  return ghost ? [...completed, ghost] : completed;
}

export interface LegendaryWonderLandmarkPreviewView {
  cityId: string;
  cityName: string;
  items: Array<{
    wonderId: string;
    label: string;
    state: 'completed' | 'under-construction';
  }>;
}

export function getLegendaryLandmarkPreviewViewForCity(
  state: GameState,
  viewerId: string,
  cityId: string,
): LegendaryWonderLandmarkPreviewView | null {
  const city = state.cities[cityId];
  if (!city || city.owner !== viewerId) return null;
  const items = getLegendaryLandmarkPreviewForCity(state, viewerId, cityId)
    .map(item => ({ wonderId: item.wonderId, label: item.label, state: item.state }));
  if (items.length === 0) return null;
  return { cityId, cityName: city.name, items };
}

export interface KnownRivalLegendaryLandmarkPreviewView {
  cityName: string;
  civName: string;
  learnedTurn: number;
  items: Array<{
    wonderId: string;
    label: string;
    state: 'completed';
  }>;
}

export function getKnownRivalLegendaryLandmarkPreviewForWonder(
  state: GameState,
  viewerId: string,
  wonderId: string,
): KnownRivalLegendaryLandmarkPreviewView | null {
  const completion = getLegendaryWonderIntelForViewer(state, viewerId)
    .find(entry => entry.kind === 'completed' && entry.wonderId === wonderId);
  if (!completion) return null;
  const [location] = getLegendaryWonderHostLocationIntelForViewer(state, viewerId, wonderId)
    .filter(candidate => candidate.civId === completion.civId);
  if (!location) return null;
  return {
    cityName: location.cityName,
    civName: location.civName,
    learnedTurn: location.learnedTurn,
    items: [{
      wonderId,
      label: getLegendaryWonderDefinition(wonderId)?.name ?? 'Legendary wonder',
      state: 'completed',
    }],
  };
}
