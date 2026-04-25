import type { City, CityMaturity } from '@/core/types';
import { TECH_TREE } from './tech-system';

export interface CityMaturityDefinition {
  id: CityMaturity;
  era: number;
  populationRequired: number;
  maturityTechsRequired: number;
  requiresQualifyingTechAtEra: boolean;
  gridSize: 3 | 5 | 7;
  districtPages: string[];
}

export const CITY_MATURITY_DEFINITIONS: CityMaturityDefinition[] = [
  { id: 'outpost', era: 1, populationRequired: 1, maturityTechsRequired: 0, requiresQualifyingTechAtEra: false, gridSize: 3, districtPages: ['overview', 'buildings'] },
  { id: 'village', era: 2, populationRequired: 3, maturityTechsRequired: 1, requiresQualifyingTechAtEra: true, gridSize: 3, districtPages: ['overview', 'buildings', 'worked-land-water'] },
  { id: 'town', era: 3, populationRequired: 5, maturityTechsRequired: 2, requiresQualifyingTechAtEra: true, gridSize: 5, districtPages: ['overview', 'buildings', 'worked-land-water'] },
  { id: 'city', era: 4, populationRequired: 8, maturityTechsRequired: 3, requiresQualifyingTechAtEra: true, gridSize: 5, districtPages: ['overview', 'buildings', 'worked-land-water', 'advanced-districts'] },
  { id: 'metropolis', era: 5, populationRequired: 12, maturityTechsRequired: 4, requiresQualifyingTechAtEra: true, gridSize: 7, districtPages: ['overview', 'buildings', 'worked-land-water', 'advanced-districts'] },
];

export const INITIAL_CITY_MATURITY: CityMaturity = 'outpost';
export const INITIAL_CITY_FOCUS = 'balanced' as const;

export const INITIAL_CITY_MATURITY_TECH_IDS = new Set([
  'early-empire',
  'state-workforce',
  'civil-service',
  'foundations',
  'masonry',
  'aqueducts',
  'arches',
  'city-planning',
  'granary-design',
  'crop-rotation',
  'fertilization',
  'sanitation',
  'medicine',
  'surgery',
  'engineering',
  'currency',
  'global-logistics',
  'mass-media',
]);

export function isCityMaturityTech(techId: string): boolean {
  const tech = TECH_TREE.find(candidate => candidate.id === techId);
  return Boolean(tech?.countsForCityMaturity || INITIAL_CITY_MATURITY_TECH_IDS.has(techId));
}

export function countCityMaturityTechs(completedTechs: string[]): number {
  return completedTechs.filter(isCityMaturityTech).length;
}

function hasMaturityTechAtEra(completedTechs: string[], era: number): boolean {
  return completedTechs.some(techId => {
    const tech = TECH_TREE.find(candidate => candidate.id === techId);
    return tech?.era === era && isCityMaturityTech(techId);
  });
}

export function getCityMaturityDefinition(id: CityMaturity): CityMaturityDefinition {
  return CITY_MATURITY_DEFINITIONS.find(def => def.id === id) ?? CITY_MATURITY_DEFINITIONS[0];
}

export function resolveCityMaturity(population: number, completedTechs: string[]): CityMaturity {
  const qualifyingCount = countCityMaturityTechs(completedTechs);
  let result: CityMaturity = 'outpost';
  for (const definition of CITY_MATURITY_DEFINITIONS) {
    const hasPopulation = population >= definition.populationRequired;
    const hasTechCount = qualifyingCount >= definition.maturityTechsRequired;
    const hasEraTech = !definition.requiresQualifyingTechAtEra || hasMaturityTechAtEra(completedTechs, definition.era);
    if (hasPopulation && hasTechCount && hasEraTech) {
      result = definition.id;
    }
  }
  return result;
}

export interface CityMaturityApplicationResult {
  city: City;
  previous: CityMaturity;
  current: CityMaturity;
  changed: boolean;
}

export function applyCityMaturity(city: City, completedTechs: string[]): CityMaturityApplicationResult {
  const current = resolveCityMaturity(city.population, completedTechs);
  const previous = city.maturity ?? INITIAL_CITY_MATURITY;
  const definition = getCityMaturityDefinition(current);
  return {
    city: { ...city, maturity: current, gridSize: definition.gridSize },
    previous,
    current,
    changed: previous !== current || city.gridSize !== definition.gridSize,
  };
}
