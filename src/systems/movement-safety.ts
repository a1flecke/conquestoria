import type { GameState, HexCoord, Unit } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

function getHexDistance(state: GameState, from: HexCoord, to: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(from, to, state.map.width)
    : hexDistance(from, to);
}

export function getVisibleHostileUnits(state: GameState, viewerId: string): Unit[] {
  const viewer = state.civilizations[viewerId];
  if (!viewer) {
    return [];
  }

  return Object.values(state.units).filter(unit =>
    isUnitHostileToCiv(state, viewerId, unit.owner) && getVisibility(viewer.visibility, unit.position) === 'visible',
  );
}

export function isUnitHostileToCiv(state: GameState, viewerId: string, unitOwnerId: string): boolean {
  if (unitOwnerId === viewerId) {
    return false;
  }

  if (unitOwnerId === 'barbarian') {
    return true;
  }

  const viewer = state.civilizations[viewerId];
  if (!viewer) {
    return false;
  }

  if (unitOwnerId.startsWith('mc-')) {
    return state.minorCivs[unitOwnerId]?.diplomacy.atWarWith.includes(viewerId) ?? false;
  }

  const owner = state.civilizations[unitOwnerId];
  if (!owner) {
    return false;
  }

  if (owner.breakaway?.originOwnerId === viewerId) {
    return true;
  }

  return viewer.diplomacy.atWarWith.includes(unitOwnerId);
}

export function isThreatenedByVisibleHostiles(state: GameState, viewerId: string, coord: HexCoord): boolean {
  return getVisibleHostileUnits(state, viewerId).some(hostile => {
    const baseMovement = UNIT_DEFINITIONS[hostile.type]?.movementPoints ?? hostile.movementPointsLeft;
    return getHexDistance(state, hostile.position, coord) <= baseMovement;
  });
}
