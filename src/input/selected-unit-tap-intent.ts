import type { GameState, HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { getMovementRange } from '@/systems/unit-system';

export type SelectedUnitTapIntent =
  | { kind: 'move' }
  | { kind: 'assault-city'; cityId: string };

function buildUnitMaps(state: GameState): {
  unitPositions: Record<string, string>;
  unitOwners: Record<string, string>;
} {
  const unitPositions: Record<string, string> = {};
  const unitOwners: Record<string, string> = {};

  for (const unit of Object.values(state.units)) {
    unitPositions[hexKey(unit.position)] = unit.id;
    unitOwners[unit.id] = unit.owner;
  }

  return { unitPositions, unitOwners };
}

export function resolveSelectedUnitTapIntent(
  state: GameState,
  unitId: string,
  targetCoord: HexCoord,
  movementRangeOverride?: HexCoord[],
): SelectedUnitTapIntent {
  const unit = state.units[unitId];
  if (!unit) return { kind: 'move' };

  const movementRange = movementRangeOverride ?? (() => {
    const { unitPositions, unitOwners } = buildUnitMaps(state);
    return getMovementRange(unit, state.map, unitPositions, unitOwners);
  })();

  const targetKey = hexKey(targetCoord);
  if (!movementRange.some(coord => hexKey(coord) === targetKey)) {
    return { kind: 'move' };
  }

  const cityAtTarget = Object.values(state.cities).find(city =>
    hexKey(city.position) === targetKey
    && city.owner !== state.currentPlayer
    && !city.owner.startsWith('mc-'),
  );
  if (!cityAtTarget) {
    return { kind: 'move' };
  }

  const occupiedByOtherUnit = Object.values(state.units).some(other =>
    other.id !== unitId && hexKey(other.position) === targetKey,
  );
  if (occupiedByOtherUnit) {
    return { kind: 'move' };
  }

  return { kind: 'assault-city', cityId: cityAtTarget.id };
}
