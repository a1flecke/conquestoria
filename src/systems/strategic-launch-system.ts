import type { GameState, HexCoord, UnitType } from '@/core/types';
import { BUILDINGS } from '@/systems/city-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

export type StrategicLaunchPlatform =
  | { kind: 'building'; cityId: string; buildingId: string; position: HexCoord; range: number | 'unlimited' }
  | { kind: 'unit'; unitId: string; unitType: UnitType; position: HexCoord; range: number | 'unlimited' };

/**
 * Every strategic-launch platform civId currently owns, driven entirely by the
 * typed strategicLaunchPlatform capability (#545 spec Goal 3) -- never a
 * unit-type/building-id switch. A hypothetical future platform (a different
 * building or unit gaining the same capability field) needs zero changes here.
 */
export function getEligibleStrategicLaunchPlatforms(state: GameState, civId: string): StrategicLaunchPlatform[] {
  const platforms: StrategicLaunchPlatform[] = [];

  for (const city of Object.values(state.cities)) {
    if (city.owner !== civId) continue;
    for (const buildingId of city.buildings) {
      const capability = BUILDINGS[buildingId]?.strategicLaunchPlatform;
      if (capability) {
        platforms.push({ kind: 'building', cityId: city.id, buildingId, position: city.position, range: capability.range });
      }
    }
  }

  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId) continue;
    const capability = UNIT_DEFINITIONS[unit.type]?.strategicLaunchPlatform;
    if (capability) {
      platforms.push({ kind: 'unit', unitId: unit.id, unitType: unit.type, position: unit.position, range: capability.range });
    }
  }

  return platforms;
}
