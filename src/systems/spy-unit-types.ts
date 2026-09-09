import type { UnitType } from '@/core/types';

const SPY_UNIT_TYPES = new Set<UnitType>([
  'spy_scout', 'spy_informant', 'spy_agent', 'spy_operative', 'spy_intelligence_officer', 'spy_station_chief', 'spy_hacker',
]);

/** A catalog-only classifier shared by production and espionage without importing either system. */
export function isSpyUnitType(type: UnitType): boolean {
  return SPY_UNIT_TYPES.has(type);
}
