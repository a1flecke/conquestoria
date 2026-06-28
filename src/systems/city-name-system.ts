import type { GameState } from '@/core/types';
import { getCivDefinition } from '@/systems/civ-definitions';

export interface CityNamingOptions {
  namingPool?: string[];
  civName?: string;
}

// These names are intentionally disjoint from every major-civ pool so that minor
// civs using this fallback list never block a named civ from using its own cities.
export const DEFAULT_CITY_NAMES = [
  'Carthage', 'Constantinople', 'Samarkand', 'Timbuktu', 'Angkor',
  'Antioch', 'Palmyra', 'Seleucia', 'Taxila', 'Kandy',
  'Malacca', 'Zanzibar', 'Machu Picchu', 'Pataliputra', 'Meroe',
  'Chichen Itza', 'Adrianople', 'Sarai', 'Chang\'an', 'Cusco',
];

export function getNamingPoolForCiv(civType: string, options: CityNamingOptions = {}): string[] {
  if (options.namingPool && options.namingPool.length > 0) {
    return options.namingPool;
  }

  const civDefinition = getCivDefinition(civType);
  if (civDefinition?.cityNames && civDefinition.cityNames.length > 0) {
    return civDefinition.cityNames;
  }

  return DEFAULT_CITY_NAMES;
}

export function drawNextCityName(
  civType: string,
  usedNames: Set<string>,
  options: CityNamingOptions = {},
): string {
  const pool = getNamingPoolForCiv(civType, options);
  for (const name of pool) {
    if (!usedNames.has(name)) {
      return name;
    }
  }

  // Use the first name from the pool as the base for thematic fallbacks
  const firstPoolName = pool[0] ?? (options.civName ?? getCivDefinition(civType)?.name ?? 'City');
  const prefixes = ['New', 'Old', 'Greater', 'North', 'South', 'East', 'West', 'Upper', 'Lower', 'Inner'];
  for (const prefix of prefixes) {
    const candidate = `${prefix} ${firstPoolName}`;
    if (!usedNames.has(candidate)) return candidate;
  }
  // Last resort: numbered suffix
  const civName = options.civName ?? getCivDefinition(civType)?.name ?? 'City';
  let suffix = 2;
  let fallback = `${civName} ${suffix}`;
  while (usedNames.has(fallback)) {
    suffix++;
    fallback = `${civName} ${suffix}`;
  }
  return fallback;
}

export function collectUsedCityNames(state: Pick<GameState, 'cities'>): Set<string> {
  return new Set(Object.values(state.cities).map(city => city.name));
}
