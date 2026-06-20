import type { GameState, HexCoord } from '@/core/types';
import { getPirateWatersPresentation } from '@/systems/pirate-presentation';
import { hexKey } from '@/systems/hex-utils';

export type PirateHeadquartersSelectionIntent =
  | { kind: 'faction'; factionId: string }
  | { kind: 'region'; factionId: string; center: HexCoord; radius: number };

export function resolvePirateHeadquartersSelection(
  state: GameState,
  viewerId: string,
  coord: HexCoord,
): PirateHeadquartersSelectionIntent | null {
  const presentation = getPirateWatersPresentation(state, viewerId);
  const exact = presentation.factions.find(faction =>
    faction.headquarters && hexKey(faction.headquarters.position) === hexKey(coord),
  );
  if (exact) return { kind: 'faction', factionId: exact.factionId };

  const region = presentation.factions.find(faction => {
    if (faction.level !== 'rumor' || !faction.approximateRegion) return false;
    return hexKey(coord) === hexKey(faction.approximateRegion.center);
  });
  return region?.approximateRegion
    ? {
        kind: 'region', factionId: region.factionId,
        center: { ...region.approximateRegion.center }, radius: region.approximateRegion.radius,
      }
    : null;
}
