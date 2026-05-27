import type { GameState, HexCoord } from '@/core/types';
import { resolveTilePresentationForViewer } from '@/renderer/tile-presentation';
import { getWonderDefinition } from '@/systems/wonder-definitions';
import { wrapHexCoord } from '@/systems/hex-utils';

export interface NaturalWonderAudioFocus {
  wonderId: string;
}

export function resolveNaturalWonderAudioFocus(
  state: GameState,
  viewerId: string,
  rawCoord: HexCoord,
): NaturalWonderAudioFocus | null {
  const coord = state.map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, state.map.width)
    : rawCoord;
  const visibility = state.civilizations[viewerId]?.visibility;
  const presentation = resolveTilePresentationForViewer(state.map, visibility, coord);
  if (presentation.kind !== 'live') return null;

  const wonderId = presentation.tile.wonder;
  if (!wonderId) return null;
  if (!getWonderDefinition(wonderId)) return null;
  if (!(state.wonderDiscoverers?.[wonderId] ?? []).includes(viewerId)) return null;
  return { wonderId };
}
