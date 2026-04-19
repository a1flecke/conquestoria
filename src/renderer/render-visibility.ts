import type { HexCoord, VisibilityMap } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';

export function shouldRenderOwnedTileBorder(
  visibility: VisibilityMap | undefined,
  viewerCivId: string | undefined,
  ownerId: string | undefined,
  coord: HexCoord,
): boolean {
  if (!visibility || !viewerCivId || !ownerId) return false;

  const visibilityState = getVisibility(visibility, coord);
  if (ownerId === viewerCivId) {
    return visibilityState === 'visible' || visibilityState === 'fog';
  }

  return visibilityState === 'visible';
}
