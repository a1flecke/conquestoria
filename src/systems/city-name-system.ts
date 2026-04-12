import type { GameState } from '@/core/types';
import { getCivDefinition } from '@/systems/civ-definitions';

export interface CityNamingOptions {
  namingPool?: string[];
  civName?: string;
}

export const DEFAULT_CITY_NAMES = [
  'Alexandria', 'Thebes', 'Memphis', 'Carthage', 'Athens',
  'Sparta', 'Rome', 'Babylon', 'Persepolis', 'Chang\'an',
  'Kyoto', 'Delhi', 'Cusco', 'Tenochtitlan', 'London',
  'Paris', 'Constantinople', 'Samarkand', 'Timbuktu', 'Angkor',
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
