import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { buildUnitOccupancy, getStackRelationship } from '@/systems/unit-occupancy';
import { getMovementRange } from '@/systems/unit-system';

export type SelectedUnitTapIntent =
  | { kind: 'move' }
  | { kind: 'assault-city'; cityId: string }
  | { kind: 'assault-minor-civ'; cityId: string; minorCivId: string };

export function resolveSelectedUnitTapIntent(
  state: GameState,
  unitId: string,
  targetCoord: HexCoord,
  movementRangeOverride?: HexCoord[],
): SelectedUnitTapIntent {
  const unit = state.units[unitId];
  if (!unit) return { kind: 'move' };

  const movementRange = movementRangeOverride ?? (() => {
    const occupancy = buildUnitOccupancy(state.units);
    return getMovementRange(unit, state.map, occupancy.unitIdsByHex, occupancy.ownersByUnitId);
  })();

  const targetKey = hexKey(targetCoord);
  if (!movementRange.some(coord => hexKey(coord) === targetKey)) {
    return { kind: 'move' };
  }

  const occupancy = buildUnitOccupancy(state.units);
  const relationship = getStackRelationship(occupancy, unit, targetCoord);
  if (relationship.hasHostileBlocker) {
    return { kind: 'move' };
  }

  const cityAtTarget = Object.values(state.cities).find(city =>
    hexKey(city.position) === targetKey
    && city.owner !== state.currentPlayer,
  );
  if (!cityAtTarget) {
    return { kind: 'move' };
  }

  if (cityAtTarget.owner.startsWith('mc-')) {
    return { kind: 'assault-minor-civ', cityId: cityAtTarget.id, minorCivId: cityAtTarget.owner };
  }

  return { kind: 'assault-city', cityId: cityAtTarget.id };
}
