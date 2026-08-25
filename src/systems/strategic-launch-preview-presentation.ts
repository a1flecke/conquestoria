import type { GameState, HexCoord } from '@/core/types';
import { getStrategicStrikeBlastRadiusPreview } from '@/systems/strategic-strike-system';
import { parseHexKey } from '@/systems/hex-utils';

export interface StrategicLaunchPreviewPresentation {
  tiles: Array<{ coord: HexCoord }>;
}

/**
 * #545 MR4 §14 stage 2: viewer-facing presentation for the blast-radius map
 * overlay, mirroring supply-overlay-presentation.ts's own
 * presentation/pure-renderer split. Thin wrapper over
 * getStrategicStrikeBlastRadiusPreview (MR3/MR4) -- all real geometry lives
 * there so the overlay can never drift from the real fallout.
 */
export function getStrategicLaunchPreviewPresentation(
  state: GameState,
  targetCityId: string,
): StrategicLaunchPreviewPresentation {
  const keys = getStrategicStrikeBlastRadiusPreview(state, targetCityId);
  return { tiles: keys.map(key => ({ coord: parseHexKey(key) })) };
}
