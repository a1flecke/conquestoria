import type { GameEvents, GameState } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import {
  getWonderVideoPreviewForSurface,
  type WonderVideoPreviewView,
} from '@/systems/wonder-codex/video-presentation';

export interface LegendaryWonderCompletionCeremonyItem {
  title: 'Legendary Wonder Completed';
  civId: string;
  cityId: string;
  wonderId: string;
  turnCompleted: number;
  name: string;
  cityName: string;
  achievementLine: string;
  rewardSummary: string;
  rewardActiveLabel: 'Reward active';
  visual: WonderVisualDefinition;
  videoPreview?: WonderVideoPreviewView;
}

export function buildLegendaryWonderCompletionCeremonyItem(
  state: GameState,
  event: GameEvents['wonder:legendary-completed'],
): LegendaryWonderCompletionCeremonyItem | null {
  if (state.currentPlayer !== event.civId) return null;
  const definition = getLegendaryWonderDefinition(event.wonderId);
  const city = state.cities[event.cityId];
  if (!definition || !city || city.owner !== event.civId) return null;
  const videoPreview = getWonderVideoPreviewForSurface(event.wonderId, 'legendary-completion', definition.name);

  return {
    title: 'Legendary Wonder Completed',
    civId: event.civId,
    cityId: event.cityId,
    wonderId: event.wonderId,
    turnCompleted: event.turnCompleted,
    name: definition.name,
    cityName: city.name,
    achievementLine: `${city.name} has completed a work that will shape its legacy.`,
    rewardSummary: definition.reward.summary,
    rewardActiveLabel: 'Reward active',
    visual: getWonderVisualDefinition(event.wonderId),
    ...(videoPreview ? { videoPreview } : {}),
  };
}
