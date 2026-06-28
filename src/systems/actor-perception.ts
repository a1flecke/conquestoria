import type { GameState, HexCoord, Unit } from '@/core/types';
import { hexDistance, wrappedHexDistance } from './hex-utils';

function distance(state: GameState, left: HexCoord, right: HexCoord): number {
  return state.map.wrapsHorizontally
    ? wrappedHexDistance(left, right, state.map.width)
    : hexDistance(left, right);
}

export function getLocallySensedUnits(
  state: GameState,
  centers: readonly HexCoord[],
  radius: number,
  ownerFilter: (owner: string) => boolean,
): Unit[] {
  if (centers.length === 0 || !Number.isFinite(radius) || radius < 0) return [];

  return Object.values(state.units)
    .filter(unit => !unit.transportId && ownerFilter(unit.owner))
    .map(unit => ({
      unit,
      distance: Math.min(...centers.map(center => distance(state, center, unit.position))),
    }))
    .filter(candidate => candidate.distance <= radius)
    .sort((left, right) =>
      left.distance - right.distance || left.unit.id.localeCompare(right.unit.id))
    .map(candidate => candidate.unit);
}

export function decayRememberedConfidence(age: number): number {
  if (!Number.isFinite(age)) return 0;
  return Math.max(0, 1 - Math.max(0, age) / 6);
}
