import type { GameState, HexCoord } from '@/core/types';
import { resolveTilePresentationForViewer } from '@/renderer/tile-presentation';
import { wrapHexCoord } from '@/systems/hex-utils';

export type WonderAtlasIntent =
  | { type: 'open-atlas'; wonderId: string; coord: HexCoord }
  | { type: 'none' };

export function resolveWonderAtlasIntent(
  state: GameState,
  viewerId: string,
  rawCoord: HexCoord,
): WonderAtlasIntent {
  const coord = state.map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, state.map.width)
    : rawCoord;
  const visibility = state.civilizations[viewerId]?.visibility;
  const presentation = resolveTilePresentationForViewer(state.map, visibility, coord);

  if (presentation.kind !== 'live' && presentation.kind !== 'last-seen') {
    return { type: 'none' };
  }

  const wonderId = presentation.tile.wonder;
  if (!wonderId) {
    return { type: 'none' };
  }

  const discoverers = state.wonderDiscoverers?.[wonderId] ?? [];
  if (!discoverers.includes(viewerId)) {
    return { type: 'none' };
  }

  return {
    type: 'open-atlas',
    wonderId,
    coord: { ...coord },
  };
}
