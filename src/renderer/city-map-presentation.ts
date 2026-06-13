import type { BuildingCategory, City, CityMaturity, GameState } from '@/core/types';
import { getCapitalCityId } from '@/systems/capital-system';
import { CITY_MATURITY_DEFINITIONS } from '@/systems/city-maturity-system';
import { BUILDINGS } from '@/systems/city-system';
import type { LegendaryWonderMapEntry } from '@/systems/legendary-wonder-map-presentation';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { civTypeToFaction } from '@/renderer/civilization-visual-family';

const SPECIALIZATION_ORDER: BuildingCategory[] = [
  'military',
  'food',
  'production',
  'economy',
  'science',
  'culture',
  'espionage',
];

export interface CityMapPresentation {
  architectureEra: number;
  populationTier: CityMaturity;
  visualFamily: string;
  specializations: BuildingCategory[];
  isCapital: boolean;
  isBreakawayCapital: boolean;
  primaryWonder?: LegendaryWonderMapEntry;
  completedWonderOverflowCount: number;
  visibilityMode: 'live' | 'last-seen';
}

export interface CityWonderSelection {
  primary?: LegendaryWonderMapEntry;
  completedOverflowCount: number;
}

export function resolvePopulationTier(population: number): CityMaturity {
  let result: CityMaturity = CITY_MATURITY_DEFINITIONS[0].id;
  for (const definition of CITY_MATURITY_DEFINITIONS) {
    if (population >= definition.populationRequired) result = definition.id;
  }
  return result;
}

export function rankCitySpecializations(city: Pick<City, 'buildings'>): BuildingCategory[] {
  const categoryCounts = new Map<BuildingCategory, number>();
  for (const buildingId of new Set(city.buildings)) {
    const category = BUILDINGS[buildingId]?.category;
    if (!category) continue;
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  return [...categoryCounts.entries()]
    .sort((a, b) => {
      const countDifference = b[1] - a[1];
      return countDifference || SPECIALIZATION_ORDER.indexOf(a[0]) - SPECIALIZATION_ORDER.indexOf(b[0]);
    })
    .slice(0, 2)
    .map(([category]) => category);
}

export function selectPrimaryCityWonder(entries: readonly LegendaryWonderMapEntry[]): CityWonderSelection {
  const completed = entries
    .filter(entry => entry.state === 'completed')
    .sort((a, b) => b.turnCompleted - a.turnCompleted || a.wonderId.localeCompare(b.wonderId));
  const ownedGhost = entries
    .filter(entry => (
      entry.relationship === 'owned'
      && entry.state === 'under-construction'
      && (entry.progressRatio ?? 0) >= 0.6
    ))
    .sort((a, b) => b.turnCompleted - a.turnCompleted || a.wonderId.localeCompare(b.wonderId))[0];
  const primary = ownedGhost ?? completed[0];

  return {
    primary,
    completedOverflowCount: Math.max(0, completed.length - (primary?.state === 'completed' ? 1 : 0)),
  };
}

export function buildLiveCityMapPresentation(
  state: GameState,
  city: City,
  landmarkEntries: readonly LegendaryWonderMapEntry[],
): CityMapPresentation {
  const owner = state.civilizations[city.owner];
  const wonder = selectPrimaryCityWonder(landmarkEntries);
  const isMinorCiv = city.owner.startsWith('mc-');
  return {
    architectureEra: resolveCivilizationEra(owner?.techState.completed ?? []),
    populationTier: resolvePopulationTier(city.population),
    visualFamily: isMinorCiv || !owner ? 'generic' : civTypeToFaction(owner.civType),
    specializations: isMinorCiv ? [] : rankCitySpecializations(city),
    isCapital: getCapitalCityId(state, city.owner) === city.id,
    isBreakawayCapital: owner?.breakaway?.originCityId === city.id,
    primaryWonder: wonder.primary,
    completedWonderOverflowCount: wonder.completedOverflowCount,
    visibilityMode: 'live',
  };
}

export function buildStaleCityMapPresentation(population: number): CityMapPresentation {
  return {
    architectureEra: 1,
    populationTier: resolvePopulationTier(population),
    visualFamily: 'generic',
    specializations: [],
    isCapital: false,
    isBreakawayCapital: false,
    primaryWonder: undefined,
    completedWonderOverflowCount: 0,
    visibilityMode: 'last-seen',
  };
}
