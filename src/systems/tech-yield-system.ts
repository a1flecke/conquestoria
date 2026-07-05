import type { City, GameMap, HexCoord, ResourceYield, TradeRoute } from '@/core/types';
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
export function getCityTechYields(
  city: City,
  map: GameMap,
  completedTechs: string[],
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
      case 'empirePercent':
      case 'perTradeRoute':
      case 'perLuxuryResource':
      case 'foundingBonus':
        // Resolved by getEmpireTechPercents / getTradeRouteTechGold / getCivLuxuryTechGold / getFoundingBonusFood.
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

/** Multiplicative empire-wide percents; two +5% entries for the same resource sum to +10%. */
export function getEmpireTechPercents(completedTechs: string[]): Partial<Record<keyof ResourceYield, number>> {
  const techSet = new Set(completedTechs);
  const percents: Partial<Record<keyof ResourceYield, number>> = {};

  for (const modifier of TECH_YIELD_MODIFIERS) {
    if (modifier.effect.kind !== 'empirePercent') continue;
    if (!techSet.has(modifier.techId)) continue;
    percents[modifier.effect.resource] = (percents[modifier.effect.resource] ?? 0) + modifier.effect.percent;
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
