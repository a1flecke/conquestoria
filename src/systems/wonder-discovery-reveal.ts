import type { GameEvents, GameState, HexCoord } from '@/core/types';
import { formatNaturalWonderEffectSummary, formatWonderDiscoveryRewardSummary } from '@/systems/wonder-presentation-formatting';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { getWonderVisualDefinition, type WonderVisualDefinition } from '@/systems/wonder-visual-catalog';
import {
  getWonderVideoPreviewForSurface,
  type WonderVideoPreviewView,
} from '@/systems/wonder-codex/video-presentation';

export interface WonderDiscoveryRevealItem {
  wonderId: string;
  civId: string;
  coord: HexCoord;
  name: string;
  title: 'Natural Wonder Discovered';
  revealLine: string;
  effectSummary: string;
  rewardSummary: string;
  visual: WonderVisualDefinition;
  motionAssetId: string | null;
  videoPreview?: WonderVideoPreviewView;
}

function validCoord(coord: HexCoord): boolean {
  return Number.isFinite(coord.q) && Number.isFinite(coord.r);
}

export function buildWonderDiscoveryRevealItem(
  state: GameState,
  activeViewerId: string,
  event: GameEvents['wonder:discovered'],
): WonderDiscoveryRevealItem | null {
  if (event.civId !== activeViewerId) return null;
  const civ = state.civilizations[event.civId];
  if (!civ?.isHuman) return null;
  if (!validCoord(event.position)) return null;
  if (!state.wonderDiscoverers[event.wonderId]?.includes(event.civId)) return null;

  const definition = getWonderDefinition(event.wonderId);
  if (!definition) return null;
  const videoPreview = getWonderVideoPreviewForSurface(event.wonderId, 'natural-reveal', definition.name);

  return {
    wonderId: event.wonderId,
    civId: event.civId,
    coord: { ...event.position },
    name: definition.name,
    title: 'Natural Wonder Discovered',
    revealLine: definition.revealLine ?? definition.description,
    effectSummary: formatNaturalWonderEffectSummary(event.wonderId),
    rewardSummary: formatWonderDiscoveryRewardSummary(event.wonderId),
    visual: getWonderVisualDefinition(event.wonderId),
    motionAssetId: null,
    ...(videoPreview ? { videoPreview } : {}),
  };
}
