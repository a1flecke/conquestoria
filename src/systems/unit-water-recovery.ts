import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type LandUnitWaterRecovery =
  | { kind: 'none'; destinations: [] }
  | { kind: 'recoverable'; destinations: HexCoord[] }
  | { kind: 'blocked'; destinations: [] };

export const NO_LAND_UNIT_WATER_RECOVERY: LandUnitWaterRecovery = {
  kind: 'none',
  destinations: [],
};

export function getLandUnitWaterRecovery(
  state: GameState,
  unitId: string,
  movementDestinations: readonly HexCoord[],
): LandUnitWaterRecovery {
  const unit = state.units[unitId];
  if (!unit || unit.transportId) return { kind: 'none', destinations: [] };
  if ((UNIT_DEFINITIONS[unit.type]?.domain ?? 'land') !== 'land') {
    return { kind: 'none', destinations: [] };
  }
  const currentTerrain = state.map.tiles[hexKey(unit.position)]?.terrain;
  if (currentTerrain !== 'coast' && currentTerrain !== 'ocean') {
    return { kind: 'none', destinations: [] };
  }

  const destinations = movementDestinations.filter(coord => {
    const terrain = state.map.tiles[hexKey(coord)]?.terrain;
    return terrain !== undefined && terrain !== 'coast' && terrain !== 'ocean';
  });
  return destinations.length > 0
    ? { kind: 'recoverable', destinations }
    : { kind: 'blocked', destinations: [] };
}

export function getLandUnitWaterRecoveryPanelMessage(
  recovery: LandUnitWaterRecovery,
): string | null {
  if (recovery.kind === 'recoverable') {
    return 'This land unit is on water. Move to an amber land tile to return ashore.';
  }
  if (recovery.kind === 'blocked') {
    return 'This land unit is stranded on water. No land escape is currently reachable this turn.';
  }
  return null;
}

export function getLandUnitWaterRecoveryTapMessage(
  recovery: LandUnitWaterRecovery,
): string | null {
  if (recovery.kind === 'recoverable') {
    return 'Move this land unit to an amber land tile to return ashore; it cannot move to another water tile.';
  }
  if (recovery.kind === 'blocked') {
    return 'This land unit is stranded on water with no reachable land escape this turn.';
  }
  return null;
}
