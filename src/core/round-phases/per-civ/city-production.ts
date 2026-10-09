import type { GameState, City } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { processCity, BUILDINGS } from '@/systems/city-system';
import { canCompleteAirUnitProduction } from '@/systems/air-operations-system';
import { applyCityMaturity } from '@/systems/city-maturity-system';
import { assignCityFocus, normalizeWorkedTilesForCity } from '@/systems/city-work-system';
import { calculateCityYields } from '@/systems/resource-system';
import { getNetworkCityYieldBonus } from '@/systems/network-infrastructure-plans';
import { getCivResourceYieldBonus } from '@/systems/resource-acquisition-system';
import {
  getEmpireTechPercents,
  getEmpireFlatTechYields,
  getLowestCityScienceBonus,
} from '@/systems/tech-yield-system';
import {
  chooseCircularManufacturingMaterial,
  getNationalProjectCivYieldBonus,
} from '@/systems/national-project-system';
import { buildProductionCostContext } from '@/systems/production-cost-context';
import { resolveCivilizationEra } from '@/systems/tech-definitions';
import { getUnrestYieldMultiplier, isCityProductionLocked } from '@/systems/faction-unrest-model';
import { getOccupiedCityYieldMultiplier } from '@/systems/city-occupation-system';
import { getCrisisYieldMultiplier } from '@/systems/crisis-system';
import { foundReligion } from '@/systems/religion-system';
import { addWarheadToArsenal } from '@/systems/strategic-arsenal-system';
import { getLegendaryWonderCityYieldBonus } from '@/systems/legendary-wonder-system';
import { announceUnitProduction, completeUnitProduction } from '@/systems/unit-production-completion';
import type { CivTurn, CivIncome } from './types';

interface CityYieldContext {
  readonly resourceYieldBonus: ReturnType<typeof getCivResourceYieldBonus>;
  readonly npCivBonuses: ReturnType<typeof getNationalProjectCivYieldBonus>;
  readonly empireTechPercents: ReturnType<typeof getEmpireTechPercents>;
  readonly empireFlatTechYields: ReturnType<typeof getEmpireFlatTechYields>;
  readonly empireFlatTargetCityId: string | undefined;
  readonly networkGovernanceBonus: number;
  readonly lowestScienceCityId: string | undefined;
}

/**
 * The civ-wide inputs every city's yields share this turn, derived once before the city loop.
 */
function createCityYieldContext(state: GameState, turn: CivTurn): CityYieldContext {
  const { civId, civ, civDef } = turn;

  const resourceYieldBonus = getCivResourceYieldBonus(state, civId);
  const npCivBonuses = getNationalProjectCivYieldBonus(state, civId);
  const empireTechPercents = getEmpireTechPercents(civ.techState.completed);

  // MR6 "empire-wide" texts without a per-city/all-cities qualifier resolve to a single flat
  // civ-total bonus. Gold/science have real civ-wide pools (totalGold/totalScience below);
  // food/production don't, so they're credited once to a single deterministic city — the
  // civ's cities sorted by id, first entry — rather than fabricating a new civ-wide stockpile.
  const empireFlatTechYields = getEmpireFlatTechYields(civ.techState.completed);
  const empireFlatTargetCityId = civ.cities.length > 0 ? [...civ.cities].sort()[0] : undefined;

  // network-governance: lowest-science city determined from this turn's un-reassigned base
  // yields, before empire percents — deterministic tiebreak by sorted city id.
  const networkGovernanceBonus = getLowestCityScienceBonus(civ.techState.completed);
  let lowestScienceCityId: string | undefined;
  if (networkGovernanceBonus > 0) {
    let lowestScience = Infinity;
    for (const cid of [...civ.cities].sort()) {
      const candidateCity = state.cities[cid];
      if (!candidateCity) continue;
      const candidateScience = calculateCityYields(candidateCity, state.map, civDef?.bonusEffect, civ.techState.completed, {}, state.turn).science;
      if (candidateScience < lowestScience) {
        lowestScience = candidateScience;
        lowestScienceCityId = cid;
      }
    }
  }
  return {
    resourceYieldBonus,
    npCivBonuses,
    empireTechPercents,
    empireFlatTechYields,
    empireFlatTargetCityId,
    networkGovernanceBonus,
    lowestScienceCityId,
  };
}

/**
 * One city's final yields for the turn: base yields, wonder, network and resource bonuses, unrest and crisis
 * multipliers, and the empire-wide technology percents.
 */
function calculateCityTurnYields(state: GameState, turn: CivTurn, cityId: string, city: City, ctx: CityYieldContext): { food: number; production: number; gold: number; science: number } {
  const { civId, civ, civDef } = turn;
  const {
    resourceYieldBonus,
    npCivBonuses,
    empireTechPercents,
    empireFlatTechYields,
    empireFlatTargetCityId,
    networkGovernanceBonus,
    lowestScienceCityId,
  } = ctx;

    const activeRouteCount = (state.marketplace?.tradeRoutes ?? [])
      .filter(route => route.fromCityId === cityId || route.toCityId === cityId).length;
    const hostsCompletedLegendaryWonder = Object.values(state.completedLegendaryWonders ?? {})
      .some(w => w.cityId === cityId);
    const baseYields = calculateCityYields(city, state.map, civDef?.bonusEffect, civ.techState.completed, { activeRouteCount, hostsCompletedLegendaryWonder }, state.turn);
    const networkCityBonus = getNetworkCityYieldBonus(state, cityId, baseYields);
    const wonderCityBonuses = getLegendaryWonderCityYieldBonus(state, civId, cityId);
    const baseYieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
    const crisisMultiplier = getCrisisYieldMultiplier(state, cityId);
    const unrestMultiplier = {
      food: baseYieldMultiplier * crisisMultiplier.food,
      production: baseYieldMultiplier * crisisMultiplier.production,
      gold: baseYieldMultiplier * crisisMultiplier.gold,
      science: baseYieldMultiplier * crisisMultiplier.science,
    };
    const empireFlatFoodForCity = cityId === empireFlatTargetCityId ? empireFlatTechYields.food : 0;
    const empireFlatProductionForCity = cityId === empireFlatTargetCityId ? empireFlatTechYields.production : 0;
    const networkGovernanceScienceForCity = cityId === lowestScienceCityId ? networkGovernanceBonus : 0;
    // Catastrophe-crisis recovery reward: +1 food +1 production while active, transient by design.
    const resilienceBonus = (city.resilienceBonusUntilTurn ?? 0) > state.turn ? 1 : 0;
    const yields = {
      food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food       + (npCivBonuses.food       ?? 0) + empireFlatFoodForCity + resilienceBonus) * unrestMultiplier.food),
      production: Math.floor((baseYields.production + networkCityBonus.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production + (npCivBonuses.production ?? 0) + empireFlatProductionForCity + resilienceBonus) * unrestMultiplier.production * (1 + (empireTechPercents.production ?? 0) / 100)),
      gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier.gold * (1 + (empireTechPercents.gold ?? 0) / 100)),
      science:    Math.floor((baseYields.science    + networkCityBonus.science + (wonderCityBonuses.science    ?? 0) + resourceYieldBonus.science + networkGovernanceScienceForCity) * unrestMultiplier.science * (1 + (empireTechPercents.science ?? 0) / 100)),
    };
  return yields;
}

/**
 * Applies one city's `processCity` result: maturity, market disruption, growth, completed buildings and national
 * projects, dropped queue items, and a completed unit.
 */
function applyCityTurnResult(state: GameState, turn: CivTurn, cityId: string, civEra: ReturnType<typeof resolveCivilizationEra>, result: ReturnType<typeof processCity>, income: CivIncome, bus: EventBus): GameState {
  let newState = state;
  const { civId, civ } = turn;

    const maturityResult = applyCityMaturity(result.city, civ.techState.completed);
    newState.cities[cityId] = maturityResult.city;

    // cyberMarketDisruption tick: 1 gold penalty per turn remaining, then expire
    {
      const disruptedCity = newState.cities[cityId];
      if (disruptedCity?.cyberMarketDisruption && disruptedCity.cyberMarketDisruption.turnsRemaining > 0) {
        income.totalGold = Math.max(0, income.totalGold - 1);
        const remaining = disruptedCity.cyberMarketDisruption.turnsRemaining - 1;
        newState.cities[cityId] = {
          ...disruptedCity,
          cyberMarketDisruption: remaining > 0 ? { turnsRemaining: remaining } : undefined,
        };
      }
    }
    if (maturityResult.changed && maturityResult.previous !== maturityResult.current) {
      bus.emit('city:maturity-upgraded', {
        cityId,
        previous: maturityResult.previous,
        current: maturityResult.current,
      });
    }

    if (result.grew) {
      const grownCity = newState.cities[cityId];
      const focusResult = grownCity.focus === 'custom'
        ? normalizeWorkedTilesForCity(newState, cityId)
        : assignCityFocus(newState, cityId, grownCity.focus);
      newState = focusResult.state;
      bus.emit('city:grew', { cityId, newPopulation: newState.cities[cityId].population });
    }
    if (result.completedBuilding) {
      bus.emit('city:building-complete', { cityId, buildingId: result.completedBuilding });
      const completedBldg = BUILDINGS[result.completedBuilding];
      if (completedBldg?.nationalProject && completedBldg.uniquePerEmpire) {
        const npKey = `${civId}:${result.completedBuilding}`;
        newState = {
          ...newState,
          builtNationalProjects: {
            ...(newState.builtNationalProjects ?? {}),
            [npKey]: { civId, cityId, eraBuilt: civEra },
          },
        };
        bus.emit('city:national-project-built', {
          civId,
          cityId,
          buildingId: result.completedBuilding,
          eraBuilt: civEra,
        });
        // A human chooses from the city panel and can carry that decision across
        // a hot-seat handoff. AI uses the same canonical choice mutation, with
        // rare-earth elements as the broadest Era-13 soft-material coverage.
        if (!civ.isHuman && result.completedBuilding === 'circular_manufacturing_network') {
          newState = chooseCircularManufacturingMaterial(newState, civId, 'rare-earth-elements');
        }
        if (result.completedBuilding === 'sacred_council') {
          newState = foundReligion(newState, civId, cityId, bus);
        }
      }
      if (result.completedBuilding === 'warhead') {
        newState = addWarheadToArsenal(newState, civId);
      }
    }
    for (const item of result.droppedProductionItems) {
      bus.emit('city:production-item-dropped', {
        cityId,
        itemId: item.itemId,
        itemKind: item.itemKind,
        reason: item.reason,
      });
    }
    if (result.completedUnit) {
      // #1202: one completion for the turn path and the rush-buy (`unit-production-completion.ts`).
      const completion = completeUnitProduction(newState, { civId, cityId, unitType: result.completedUnit });
      if (!completion.ok) {
        throw new Error(`Production of ${result.completedUnit} completed without a legal place for it: ${completion.reason}`);
      }
      newState = completion.state;
      announceUnitProduction(bus, cityId, civId, completion);
    }
  return newState;
}

/**
 * Every city of the civ produces: yields are calculated and `processCity` advances food, growth and production, then
 * the result is applied. Returns the state and the gold and science the later steps build on.
 */
export function runCityProduction(
  state: GameState,
  turn: CivTurn,
  bus: EventBus,
): { state: GameState; income: CivIncome } {
  let newState = state;
  const { civId, civ } = turn;
  const ctx = createCityYieldContext(newState, turn);
  const income: CivIncome = {
    totalGold: 0,
    authoritativeCityScience: {},
    baseGoldByCityId: {},
    empireFlatTechYields: ctx.empireFlatTechYields,
  };

  for (const cityId of civ.cities) {
    let city = newState.cities[cityId];
    if (!city) continue;
    const civEra = resolveCivilizationEra(civ.techState.completed);

    const preYieldWorkResult = city.focus === 'custom'
      ? normalizeWorkedTilesForCity(newState, cityId)
      : assignCityFocus(newState, cityId, city.focus);
    newState = preYieldWorkResult.state;
    city = newState.cities[cityId];
    if (!city) continue;

    const yields = calculateCityTurnYields(newState, turn, cityId, city, ctx);
    income.totalGold += yields.gold;
    income.baseGoldByCityId[cityId] = yields.gold;
    const effectiveProduction = isCityProductionLocked(city) ? 0 : yields.production;
    const npKeysForCiv = new Set(
      Object.keys(newState.builtNationalProjects ?? {}).filter(k => k.startsWith(`${civId}:`))
    );
    const result = processCity(
      city,
      newState.map,
      yields.food,
      effectiveProduction,
      buildProductionCostContext(newState, civId, cityId),
      civ.civType,
      npKeysForCiv,
      type => {
        if (!UNIT_DEFINITIONS[type].airOperation) return null;
        return canCompleteAirUnitProduction(newState, cityId, type).ok ? null : 'air-base-unavailable';
      },
    );
    bus.emit('city:production-disposition', {
      civId,
      cityId,
      ...result.production,
      suppressedByLock: yields.production - effectiveProduction,
    });
    income.totalGold += result.idleGoldBonus;
    income.authoritativeCityScience[cityId] = yields.science + result.idleScienceBonus;

    newState = applyCityTurnResult(newState, turn, cityId, civEra, result, income, bus);
  }
  return { state: newState, income };
}
