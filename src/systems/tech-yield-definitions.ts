import type { BuildingCategory, ImprovementType, ResourceYield, UnitType } from '@/core/types';

export type YieldKind =
  | { kind: 'cityFlat'; yields: Partial<ResourceYield> }
  | {
      kind: 'cityFlatConditional';
      yields: Partial<ResourceYield>;
      requiresAnyBuilding?: string[];
      requiresBuildingCategory?: BuildingCategory;
      requiresRiver?: boolean;
      requiresCoastal?: boolean;
      minBuildings?: number;
      requiresMissingBuilding?: string[];
    }
  | { kind: 'perBuildingCategory'; category: BuildingCategory; yields: Partial<ResourceYield> }
  | { kind: 'perBuildingId'; buildingIds: string[]; yields: Partial<ResourceYield> }
  | { kind: 'perImprovement'; improvement: ImprovementType; yields: Partial<ResourceYield> }
  | { kind: 'perPopulation'; per: number; yields: Partial<ResourceYield> }
  | { kind: 'empirePercent'; resource: keyof ResourceYield; percent: number }
  | { kind: 'perTradeRoute'; gold: number; foreignOnly?: boolean; coastalOnly?: boolean }
  | { kind: 'perLuxuryResource'; gold: number }
  | { kind: 'perOwnedNaturalWonder'; science: number }
  | { kind: 'foundingBonus'; food: number };

export interface TechYieldModifier {
  techId: string;
  label: string;
  effect: YieldKind;
}

export const TECH_YIELD_MODIFIERS: TechYieldModifier[] = [
  // --- Era 5 ---
  { techId: 'guilds', label: '+1 gold per active trade route', effect: { kind: 'perTradeRoute', gold: 1 } },
  { techId: 'colonial-trade', label: 'Trade routes to foreign civs yield +2 gold', effect: { kind: 'perTradeRoute', gold: 2, foreignOnly: true } },
  { techId: 'scientific-method', label: '+1 science per library empire-wide', effect: { kind: 'perBuildingId', buildingIds: ['library'], yields: { science: 1 } } },
  { techId: 'printing-press', label: '+1 science per library empire-wide', effect: { kind: 'perBuildingId', buildingIds: ['library'], yields: { science: 1 } } },
  { techId: 'civic-humanism', label: '+5% gold empire-wide', effect: { kind: 'empirePercent', resource: 'gold', percent: 5 } },
  { techId: 'empiricism', label: '+1 science all cities', effect: { kind: 'cityFlat', yields: { science: 1 } } },
  { techId: 'rationalism', label: '+5% science empire-wide', effect: { kind: 'empirePercent', resource: 'science', percent: 5 } },
  { techId: 'renaissance-painting', label: '+1 gold per culture building empire-wide', effect: { kind: 'perBuildingCategory', category: 'culture', yields: { gold: 1 } } },
  { techId: 'classical-music-form', label: '+1 science per culture building empire-wide', effect: { kind: 'perBuildingCategory', category: 'culture', yields: { science: 1 } } },
  { techId: 'deep-sea-routes', label: '+1 gold per coastal city', effect: { kind: 'cityFlatConditional', requiresCoastal: true, yields: { gold: 1 } } },
  { techId: 'blast-furnace-tech', label: '+1 production all cities', effect: { kind: 'cityFlat', yields: { production: 1 } } },
  { techId: 'distillation', label: '+2 gold per owned luxury resource', effect: { kind: 'perLuxuryResource', gold: 2 } },
  { techId: 'plantation-farming', label: 'Farms yield +1 food', effect: { kind: 'perImprovement', improvement: 'farm', yields: { food: 1 } } },
  { techId: 'monastic-orders', label: '+1 science and +1 gold per city with temple', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['temple'], yields: { science: 1, gold: 1 } } },
  { techId: 'reformation', label: '+2 science in cities with a temple', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['temple'], yields: { science: 2 } } },
  // postal-service: '+1 gold per road tile in empire' — road-dependent, deferred to MR7

  // --- Era 6 ---
  { techId: 'mercantilism', label: '+5% gold empire-wide', effect: { kind: 'empirePercent', resource: 'gold', percent: 5 } },
  { techId: 'natural-history', label: '+2 science per natural wonder in empire territory', effect: { kind: 'perOwnedNaturalWonder', science: 2 } },
  { techId: 'hydraulics', label: '+2 production in river cities', effect: { kind: 'cityFlatConditional', requiresRiver: true, yields: { production: 2 } } },
  { techId: 'separation-of-powers', label: '+1 gold per culture building empire-wide', effect: { kind: 'perBuildingCategory', category: 'culture', yields: { gold: 1 } } },
  { techId: 'parliamentary-reform', label: '+5% production empire-wide', effect: { kind: 'empirePercent', resource: 'production', percent: 5 } },
  { techId: 'land-survey', label: '+1 food in all cities empire-wide', effect: { kind: 'cityFlat', yields: { food: 1 } } },
  { techId: 'improved-agriculture', label: 'Farms yield +1 food', effect: { kind: 'perImprovement', improvement: 'farm', yields: { food: 1 } } },
  { techId: 'improved-agriculture', label: 'Granaries add +1 food', effect: { kind: 'perBuildingId', buildingIds: ['granary'], yields: { food: 1 } } },
  { techId: 'tobacco-trade', label: '+2 gold per plantation improvement', effect: { kind: 'perImprovement', improvement: 'plantation', yields: { gold: 2 } } },
  { techId: 'enlightenment', label: '+1 science per two population in cities', effect: { kind: 'perPopulation', per: 2, yields: { science: 1 } } },
  { techId: 'social-contract', label: '+2 gold per city with a market', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['marketplace'], yields: { gold: 2 } } },
  { techId: 'baroque-music', label: '+1 gold per culture building', effect: { kind: 'perBuildingCategory', category: 'culture', yields: { gold: 1 } } },
  { techId: 'portrait-art', label: '+1 gold per art gallery in empire', effect: { kind: 'perBuildingId', buildingIds: ['art_gallery'], yields: { gold: 1 } } },
  { techId: 'aqueduct-expansion', label: '+2 food in all cities with aqueduct', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['aqueduct'], yields: { food: 2 } } },
  { techId: 'newspaper-press', label: '+2 science empire-wide', effect: { kind: 'cityFlat', yields: { science: 2 } } },
  { techId: 'ecumenical-council', label: '+2 gold per city with a temple empire-wide', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['temple'], yields: { gold: 2 } } },
  // courier-network: road-dependent, deferred to MR7

  // --- Era 7 ---
  { techId: 'mass-production', label: '+10% production empire-wide', effect: { kind: 'empirePercent', resource: 'production', percent: 10 } },
  { techId: 'industrialization', label: '+2 science empire-wide', effect: { kind: 'cityFlat', yields: { science: 2 } } },
  { techId: 'applied-chemistry', label: '+1 science per production building empire-wide', effect: { kind: 'perBuildingCategory', category: 'production', yields: { science: 1 } } },
  { techId: 'social-reform', label: '+1 gold in cities with a market or guildhall', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['marketplace', 'guildhall'], yields: { gold: 1 } } },
  { techId: 'manifest-destiny', label: 'New cities founded with +5 food bonus', effect: { kind: 'foundingBonus', food: 5 } },
  { techId: 'mechanized-farming', label: 'Farms yield +1 production in addition to food', effect: { kind: 'perImprovement', improvement: 'farm', yields: { production: 1 } } },
  { techId: 'mechanized-farming', label: 'Granaries add +1 additional food', effect: { kind: 'perBuildingId', buildingIds: ['granary'], yields: { food: 1 } } },
  { techId: 'agricultural-machinery', label: '+2 food per farm improvement', effect: { kind: 'perImprovement', improvement: 'farm', yields: { food: 2 } } },
  { techId: 'utilitarianism', label: '+1 gold per 3 population empire-wide', effect: { kind: 'perPopulation', per: 3, yields: { gold: 1 } } },
  { techId: 'positivism', label: '+2 science empire-wide', effect: { kind: 'cityFlat', yields: { science: 2 } } },
  { techId: 'positivism', label: 'Universities generate +1 additional science', effect: { kind: 'perBuildingId', buildingIds: ['university'], yields: { science: 1 } } },
  { techId: 'romanticism', label: 'Culture buildings generate +1 gold and +1 science', effect: { kind: 'perBuildingCategory', category: 'culture', yields: { gold: 1, science: 1 } } },
  { techId: 'industrial-realism', label: 'Culture buildings generate +1 production', effect: { kind: 'perBuildingCategory', category: 'culture', yields: { production: 1 } } },
  { techId: 'steam-navigation', label: 'Naval trade routes yield +2 gold', effect: { kind: 'perTradeRoute', gold: 2, coastalOnly: true } },
  { techId: 'steam-navigation', label: 'Coastal cities gain +1 production from harbours', effect: { kind: 'cityFlatConditional', requiresCoastal: true, requiresAnyBuilding: ['harbor'], yields: { production: 1 } } },
  { techId: 'urban-planning', label: '+2 production in cities with 3 or more buildings', effect: { kind: 'cityFlatConditional', minBuildings: 3, yields: { production: 2 } } },
  { techId: 'iron-bridges', label: '+1 gold per river city', effect: { kind: 'cityFlatConditional', requiresRiver: true, yields: { gold: 1 } } },
  { techId: 'secularism', label: '+2 science in cities without a temple', effect: { kind: 'cityFlatConditional', requiresMissingBuilding: ['temple'], yields: { science: 2 } } },
  { techId: 'social-gospel', label: '+1 food and +1 gold in cities with a temple', effect: { kind: 'cityFlatConditional', requiresAnyBuilding: ['temple'], yields: { food: 1, gold: 1 } } },
  // germ-theory: healing — owned by MR4
];

export interface TechCostDiscount {
  techId: string;
  appliesTo: 'buildings' | 'units' | UnitType[];
  multiplier: number;
}

export const TECH_COST_DISCOUNTS: TechCostDiscount[] = [
  { techId: 'vaulted-ceilings', appliesTo: 'buildings', multiplier: 0.90 },
  { techId: 'cannon-casting', appliesTo: ['cannon'], multiplier: 0.85 },
  { techId: 'mass-production', appliesTo: 'units', multiplier: 0.95 },
  { techId: 'manifest-destiny', appliesTo: ['settler'], multiplier: 0.80 },
];

/** Food bonus applied once at city-founding time (not a per-turn yield). */
export function getFoundingBonusFood(completedTechs: string[]): number {
  const techSet = new Set(completedTechs);
  let bonus = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'foundingBonus') continue;
    if (!techSet.has(modifier.techId)) continue;
    bonus += modifier.effect.food;
  }

  return bonus;
}
