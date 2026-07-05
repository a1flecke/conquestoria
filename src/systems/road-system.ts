import type { HexTile } from '@/core/types';
import { getMovementCostForUnit } from './unit-system';

export const ROAD_BUILD_TURNS = 2;
export const ROAD_BUILD_TURNS_FAST = 1; // road_corps national project: "Roads built faster"

export type RoadBlockerReason =
  | 'outside-territory'
  | 'requires-tech'
  | 'already-has-road'
  | 'invalid-terrain'
  | 'city-center'
  | 'none';

export function getRoadBlockerReason(
  tile: HexTile | undefined,
  completedTechs: string[],
  ownerId: string,
  isCityTile = false,
): RoadBlockerReason {
  if (!tile) return 'invalid-terrain';
  if (isCityTile) return 'city-center';
  if (tile.owner !== null && tile.owner !== ownerId) return 'outside-territory';
  if (!completedTechs.includes('road-building')) return 'requires-tech';
  if (tile.hasRoad) return 'already-has-road';
  if (getMovementCostForUnit(tile.terrain, 'land') === Infinity) return 'invalid-terrain';
  return 'none';
}

export function canBuildRoad(
  tile: HexTile | undefined,
  completedTechs: string[],
  ownerId: string,
  isCityTile = false,
): boolean {
  return getRoadBlockerReason(tile, completedTechs, ownerId, isCityTile) === 'none';
}

export function formatRoadBlockerReason(reason: RoadBlockerReason): string {
  switch (reason) {
    case 'outside-territory': return 'Outside your territory';
    case 'requires-tech': return 'Requires Road Building tech';
    case 'already-has-road': return 'Already has a road';
    case 'invalid-terrain': return 'Cannot build a road here';
    case 'city-center': return 'City centers already connect';
    case 'none': return '';
  }
}

export function getRoadBuildTurns(hasRoadCorpsActive: boolean): number {
  return hasRoadCorpsActive ? ROAD_BUILD_TURNS_FAST : ROAD_BUILD_TURNS;
}

export function getRoadMovementDiscount(completedTechs: string[]): boolean {
  return completedTechs.includes('military-logistics') || completedTechs.includes('railway-expansion');
}
