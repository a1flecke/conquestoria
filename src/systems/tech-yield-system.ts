import type { City, GameMap, HexCoord, ResourceYield, TerrainType, TradeRoute } from '@/core/types';
import { BUILDINGS, isCityCoastal } from './city-system';
import { hexKey, wrapHexCoord } from './hex-utils';
import { TECH_YIELD_MODIFIERS, type TechYieldModifier, type YieldKind } from './tech-yield-definitions';

function canonicalizeCoord(coord: HexCoord, map: GameMap): HexCoord {
  return map.wrapsHorizontally ? wrapHexCoord(coord, map.width) : coord;
}

function emptyYield(): ResourceYield {
  return { food: 0, production: 0, gold: 0, science: 0 };
}

function addYield(total: ResourceYield, bonus: Partial<ResourceYield>, multiplier = 1): void {
  total.food += (bonus.food ?? 0) * multiplier;
  total.production += (bonus.production ?? 0) * multiplier;
  total.gold += (bonus.gold ?? 0) * multiplier;
  total.science += (bonus.science ?? 0) * multiplier;
}

function assertNever(x: never): never {
  throw new Error(`Unhandled tech yield kind: ${JSON.stringify(x)}`);
}

function getWorkedTilesForTechYields(city: City, map: GameMap): HexCoord[] {
  const centerKey = hexKey(canonicalizeCoord(city.position, map));
  return city.workedTiles
    .map(coord => canonicalizeCoord(coord, map))
    .filter(coord => hexKey(coord) !== centerKey)
    .slice(0, city.population);
}

function cityFlatConditionalMatches(
  city: City,
  map: GameMap,
  effect: Extract<YieldKind, { kind: 'cityFlatConditional' }>,
): boolean {
  if (effect.requiresAnyBuilding && !effect.requiresAnyBuilding.some(id => city.buildings.includes(id))) {
    return false;
  }
  if (effect.requiresAllBuildings && !effect.requiresAllBuildings.every(id => city.buildings.includes(id))) {
    return false;
  }
  if (effect.requiresMissingBuilding && effect.requiresMissingBuilding.some(id => city.buildings.includes(id))) {
    return false;
  }
  if (effect.requiresBuildingCategory && !city.buildings.some(id => BUILDINGS[id]?.category === effect.requiresBuildingCategory)) {
    return false;
  }
  if (effect.requiresRiver) {
    const tile = map.tiles[hexKey(canonicalizeCoord(city.position, map))];
    if (!tile?.hasRiver) return false;
  }
  if (effect.requiresCoastal && !isCityCoastal(city, map)) return false;
  if (effect.minBuildings != null && city.buildings.length < effect.minBuildings) return false;
  return true;
}

export interface TechYieldPart {
  techId: string;
  label: string;
  yields: ResourceYield;
}

/**
 * Per-city tech modifiers only. `empirePercent`, `perTradeRoute`,
 * `perLuxuryResource`, and `foundingBonus` are resolved by their own
 * dedicated helpers below — each is listed explicitly (as a no-op) here so
 * the switch stays exhaustive and a future unhandled kind fails the build.
 */
export interface CityTechYieldContext {
  /** Active trade routes (sent or received) touching this city — powers `perCityRoute`. */
  activeRouteCount?: number;
}

export function getCityTechYields(
  city: City,
  map: GameMap,
  completedTechs: string[],
  context: CityTechYieldContext = {},
): { total: ResourceYield; parts: TechYieldPart[] } {
  const total = emptyYield();
  const parts: TechYieldPart[] = [];
  const techSet = new Set(completedTechs);
  const workedTiles = getWorkedTilesForTechYields(city, map);
  const naturalWonderCount = city.ownedTiles.filter(coord => {
    const tile = map.tiles[hexKey(canonicalizeCoord(coord, map))];
    return Boolean(tile?.wonder);
  }).length;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (!techSet.has(modifier.techId)) continue;
    const effect = modifier.effect;
    const contribution = emptyYield();

    switch (effect.kind) {
      case 'cityFlat':
        addYield(contribution, effect.yields);
        break;
      case 'cityFlatConditional':
        if (cityFlatConditionalMatches(city, map, effect)) {
          addYield(contribution, effect.yields);
        }
        break;
      case 'perBuildingCategory': {
        const count = city.buildings.filter(id => BUILDINGS[id]?.category === effect.category).length;
        addYield(contribution, effect.yields, count);
        break;
      }
      case 'perBuildingId': {
        const count = city.buildings.filter(id => effect.buildingIds.includes(id)).length;
        addYield(contribution, effect.yields, count);
        break;
      }
      case 'perImprovement': {
        const count = workedTiles.filter(coord => {
          const tile = map.tiles[hexKey(coord)];
          return tile?.improvement === effect.improvement && tile.improvementTurnsLeft === 0;
        }).length;
        addYield(contribution, effect.yields, count);
        break;
      }
      case 'perPopulation': {
        const count = Math.floor(city.population / effect.per);
        addYield(contribution, effect.yields, count);
        break;
      }
      case 'perOwnedNaturalWonder':
        contribution.science += effect.science * naturalWonderCount;
        break;
      case 'perCityRoute': {
        if (city.buildings.includes(effect.requiresBuilding)) {
          contribution.gold += effect.gold * (context.activeRouteCount ?? 0);
        }
        break;
      }
      case 'empirePercent':
      case 'perTradeRoute':
      case 'perLuxuryResource':
      case 'foundingBonus':
      case 'empireFlat':
      case 'terrainYield':
      case 'perCompletedLegendaryWonder':
      case 'perRoutePartnerCiv':
      case 'lowestCityScience':
      case 'foodFromScience':
      case 'maintenanceDiscount':
      case 'tradeRoutePercent':
        // Resolved by their own dedicated helpers/hooks (see each kind's comment in
        // tech-yield-definitions.ts) — not per-city cityFlat-style contributions.
        break;
      default:
        assertNever(effect);
    }

    if (contribution.food || contribution.production || contribution.gold || contribution.science) {
      addYield(total, contribution);
      parts.push({ techId: modifier.techId, label: modifier.label, yields: contribution });
    }
  }

  return { total, parts };
}

const ALL_RESOURCE_KEYS: (keyof ResourceYield)[] = ['food', 'production', 'gold', 'science'];

/** Multiplicative empire-wide percents; two +5% entries for the same resource sum to +10%. */
export function getEmpireTechPercents(completedTechs: string[]): Partial<Record<keyof ResourceYield, number>> {
  const techSet = new Set(completedTechs);
  const percents: Partial<Record<keyof ResourceYield, number>> = {};

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'empirePercent') continue;
    if (!techSet.has(modifier.techId)) continue;
    const keys = modifier.effect.resource === 'all' ? ALL_RESOURCE_KEYS : [modifier.effect.resource];
    for (const key of keys) {
      percents[key] = (percents[key] ?? 0) + modifier.effect.percent;
    }
  }

  return percents;
}

export function applyEmpireTechPercents(
  yields: ResourceYield,
  percents: Partial<Record<keyof ResourceYield, number>>,
): ResourceYield {
  return {
    food: yields.food * (1 + (percents.food ?? 0) / 100),
    production: yields.production * (1 + (percents.production ?? 0) / 100),
    gold: yields.gold * (1 + (percents.gold ?? 0) / 100),
    science: yields.science * (1 + (percents.science ?? 0) / 100),
  };
}

/** Per-trade-route tech gold; `opts.bothEndpointsCoastal` gates `coastalOnly` entries. */
export function getTradeRouteTechGold(
  route: TradeRoute,
  completedTechs: string[],
  opts: { bothEndpointsCoastal?: boolean } = {},
): number {
  const techSet = new Set(completedTechs);
  let gold = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'perTradeRoute') continue;
    if (!techSet.has(modifier.techId)) continue;
    if (modifier.effect.foreignOnly && !route.foreignCivId) continue;
    if (modifier.effect.coastalOnly && !opts.bothEndpointsCoastal) continue;
    gold += modifier.effect.gold;
  }

  return gold;
}

/** Flat gold per distinct owned luxury resource (e.g. distillation). */
export function getCivLuxuryTechGold(completedTechs: string[], ownedLuxuryResourceCount: number): number {
  const techSet = new Set(completedTechs);
  let perResource = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'perLuxuryResource') continue;
    if (!techSet.has(modifier.techId)) continue;
    perResource += modifier.effect.gold;
  }

  return perResource * ownedLuxuryResourceCount;
}

/** Flat civ-total bonus applied once (not per city) — MR6's "empire-wide" texts. */
export function getEmpireFlatTechYields(completedTechs: string[]): ResourceYield {
  const techSet = new Set(completedTechs);
  const total = emptyYield();

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'empireFlat') continue;
    if (!techSet.has(modifier.techId)) continue;
    addYield(total, modifier.effect.yields);
  }

  return total;
}

/** Percent bonus applied to trade-route gold only (distinct from empirePercent's gold key). */
export function getTradeRouteTechGoldPercent(completedTechs: string[]): number {
  const techSet = new Set(completedTechs);
  let percent = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'tradeRoutePercent') continue;
    if (!techSet.has(modifier.techId)) continue;
    percent += modifier.effect.percent;
  }

  return percent;
}

/** Flat gold per completed legendary wonder the civ owns (e.g. digital-art). */
export function getCivWonderTechGold(completedTechs: string[], completedWonderCount: number): number {
  const techSet = new Set(completedTechs);
  let perWonder = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'perCompletedLegendaryWonder') continue;
    if (!techSet.has(modifier.techId)) continue;
    perWonder += modifier.effect.gold;
  }

  return perWonder * completedWonderCount;
}

/** Flat gold per distinct peacetime foreign trade-route partner civ (e.g. globalization). */
export function getCivRoutePartnerTechGold(completedTechs: string[], distinctPartnerCivCount: number): number {
  const techSet = new Set(completedTechs);
  let perPartner = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'perRoutePartnerCiv') continue;
    if (!techSet.has(modifier.techId)) continue;
    perPartner += modifier.effect.gold;
  }

  return perPartner * distinctPartnerCivCount;
}

/** Tile-terrain tech bonus (e.g. polar-operations tundra/snow) — consumed by tile-yield.ts. */
export function getTerrainTechYieldBonus(terrain: string, completedTechs: string[]): Partial<ResourceYield> {
  const techSet = new Set(completedTechs);
  const total = emptyYield();

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'terrainYield') continue;
    if (!techSet.has(modifier.techId)) continue;
    if (!modifier.effect.terrains.includes(terrain as TerrainType)) continue;
    addYield(total, modifier.effect.yields);
  }

  return total;
}

/** Building-upkeep multiplier for a city with `buildingCount` buildings (e.g. green-architecture). */
export function getMaintenanceDiscountMultiplier(completedTechs: string[], buildingCount: number): number {
  const techSet = new Set(completedTechs);
  let multiplier = 1;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'maintenanceDiscount') continue;
    if (!techSet.has(modifier.techId)) continue;
    if (buildingCount < modifier.effect.minBuildings) continue;
    multiplier *= modifier.effect.multiplier;
  }

  return multiplier;
}

/** Science bonus granted to the civ's single lowest-science city (e.g. network-governance). Which city gets it is resolved by the caller (turn-manager) since that needs cross-city context. */
export function getLowestCityScienceBonus(completedTechs: string[]): number {
  const techSet = new Set(completedTechs);
  let bonus = 0;

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'lowestCityScience') continue;
    if (!techSet.has(modifier.techId)) continue;
    bonus += modifier.effect.science;
  }

  return bonus;
}
