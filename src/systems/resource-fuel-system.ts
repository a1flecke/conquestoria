// src/systems/resource-fuel-system.ts
// #1512 MR15: selected industrial fuel demand, one allocation before city yields.
//
// Fuel is a stored material spent once per completed round. Allocation is stable and
// civilization-wide: three cities cannot spend the same last unit. A building without fuel falls
// back to its declared output and is never destroyed. The conservation posture changes the priority
// order without changing the amount of fuel a building needs.
import type { Building, City, GameState } from '@/core/types';
import type { TradeGoodId } from '@/core/types/commerce';
import { BUILDINGS } from './city-building-catalog';
import { getCivilizationLiveness } from './civilization-liveness';
import { getCivMaterialLedger } from './resource-material-state';
import { consumeStock, creditImportedStock, getFreeQuantity, getIncomingQuantity } from './resource-reserve-system';
import { findTradeGood } from './trade-good-definitions';

export type FuelConservationPolicy = 'balanced' | 'conserve';

export const FUEL_STARTUP_ALLOWANCE = 10;

export interface CityFuelDemand {
  cityId: string;
  buildingId: string;
  goodId: TradeGoodId;
  units: number;
  /** Production lost when this building is unfueled, used by conservation ordering. */
  lostProduction: number;
}

function buildingFuelDemand(building: Building | undefined) {
  return building?.fuelDemand;
}

export function getCityFuelDemands(city: City): CityFuelDemand[] {
  return (city.buildings ?? []).flatMap(buildingId => {
    const demand = buildingFuelDemand(BUILDINGS[buildingId]);
    if (!demand) return [];
    const powered = demand.poweredYields?.production ?? BUILDINGS[buildingId]!.yields.production;
    const fallback = demand.fallbackYields.production ?? 0;
    return [{
      cityId: city.id,
      buildingId,
      goodId: demand.goodId,
      units: Math.max(0, Math.floor(demand.unitsPerRound)),
      lostProduction: Math.max(0, powered - fallback),
    }];
  });
}

/** Scheduled per-round demand by good for one civilization, regardless of current stock. */
export function getCivFuelDemandByGood(
  state: GameState,
  civId: string,
): Record<TradeGoodId, number> {
  const civ = state.civilizations[civId];
  if (!civ) return {};
  const demand: Record<TradeGoodId, number> = {};
  for (const cityId of civ.cities ?? []) {
    const city = state.cities[cityId];
    if (!city) continue;
    for (const entry of getCityFuelDemands(city)) {
      demand[entry.goodId] = (demand[entry.goodId] ?? 0) + entry.units;
    }
  }
  return demand;
}

export function getFuelConservationPolicy(
  state: GameState,
  civId: string,
): FuelConservationPolicy {
  return state.fuelConservationByCiv?.[civId] ?? 'balanced';
}

export function setFuelConservationPolicy(
  state: GameState,
  civId: string,
  policy: FuelConservationPolicy,
): GameState {
  return {
    ...state,
    fuelConservationByCiv: { ...(state.fuelConservationByCiv ?? {}), [civId]: policy },
  };
}

function withCityFallback(state: GameState, cityId: string, fallback: readonly string[]): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const current = city.fuelFallbackBuildingIds ?? [];
  if (current.length === fallback.length && current.every((id, index) => id === fallback[index])) {
    return state;
  }
  return {
    ...state,
    cities: {
      ...state.cities,
      [cityId]: {
        ...city,
        ...(fallback.length > 0
          ? { fuelFallbackBuildingIds: [...fallback] }
          : { fuelFallbackBuildingIds: undefined }),
      },
    },
  };
}

/**
 * Allocate every living civilization's fuel once, before city production. The order is stable:
 * balanced uses city id then building id; conserve puts the largest lost production first. Only
 * free stored stock is spent, and each unit is consumed exactly once.
 */
export function allocateFuelForRound(state: GameState): GameState {
  let next = state;
  const civIds = Object.keys(state.civilizations).sort();

  for (const civId of civIds) {
    if (!getCivilizationLiveness(state, civId).living) continue;
    const civ = next.civilizations[civId];
    if (!civ) continue;
    const originalLedger = getCivMaterialLedger(next, civId);
    let ledger = originalLedger;
    const demands = [...(civ.cities ?? [])]
      .sort()
      .flatMap(cityId => {
        const city = next.cities[cityId];
        return city ? getCityFuelDemands(city) : [];
      });
    const policy = getFuelConservationPolicy(next, civId);
    demands.sort((left, right) => {
      if (policy === 'conserve' && left.lostProduction !== right.lostProduction) {
        return right.lostProduction - left.lostProduction;
      }
      return left.cityId.localeCompare(right.cityId) || left.buildingId.localeCompare(right.buildingId);
    });

    const fallbackByCity = new Map<string, string[]>();
    for (const cityId of civ.cities ?? []) fallbackByCity.set(cityId, []);
    for (const demand of demands) {
      if (demand.units > 0 && getFreeQuantity(ledger, demand.goodId) >= demand.units) {
        const spent = consumeStock(ledger, demand.goodId, demand.units);
        if (spent.ok) {
          ledger = spent.ledger;
          continue;
        }
      }
      fallbackByCity.get(demand.cityId)?.push(demand.buildingId);
    }

    if (ledger !== originalLedger) {
      next = {
        ...next,
        materialReservesByCiv: { ...(next.materialReservesByCiv ?? {}), [civId]: ledger },
      };
    }
    for (const [cityId, fallback] of fallbackByCity) {
      next = withCityFallback(next, cityId, fallback);
    }
  }
  return next;
}

export interface FuelRunway {
  goodId: TradeGoodId;
  demandPerRound: number;
  free: number;
  incoming: number;
  runwayRounds: number | null;
  status: 'no-demand' | 'funded' | 'shortage' | 'delivery-uncertain';
}

/** Runway based on the real scheduled demand, not a historical average. */
export function getFuelRunway(
  state: GameState,
  civId: string,
  goodId: TradeGoodId,
): FuelRunway {
  const demandPerRound = getCivFuelDemandByGood(state, civId)[goodId] ?? 0;
  const ledger = getCivMaterialLedger(state, civId);
  const free = getFreeQuantity(ledger, goodId);
  const incoming = getIncomingQuantity(ledger, goodId);
  if (demandPerRound <= 0) {
    return { goodId, demandPerRound, free, incoming, runwayRounds: null, status: 'no-demand' };
  }
  const runwayRounds = Math.floor(free / demandPerRound);
  if (free <= 0) {
    return {
      goodId, demandPerRound, free, incoming, runwayRounds: 0,
      status: incoming > 0 ? 'delivery-uncertain' : 'shortage',
    };
  }
  return {
    goodId, demandPerRound, free, incoming, runwayRounds,
    status: runwayRounds > 0 ? 'funded' : 'shortage',
  };
}

/** One-time migration operating allowance for existing fuel-dependent structures. */
export function ensureFuelStartupAllowance(state: GameState): GameState {
  let next = state;
  for (const civId of Object.keys(state.civilizations).sort()) {
    if (next.fuelStartupGrantedByCiv?.[civId]) continue;
    // Never create a ledger or marker for an eliminated civ: elimination must remain complete.
    if (!getCivilizationLiveness(next, civId).living) continue;
    const demand = getCivFuelDemandByGood(next, civId);
    let ledger = getCivMaterialLedger(next, civId);
    for (const goodId of Object.keys(demand)) {
      if (!findTradeGood(goodId)) continue;
      if (getFreeQuantity(ledger, goodId) > 0) continue;
      const credited = creditImportedStock(ledger, goodId, FUEL_STARTUP_ALLOWANCE);
      if (credited.ok) ledger = credited.ledger;
    }
    next = {
      ...next,
      materialReservesByCiv: { ...(next.materialReservesByCiv ?? {}), [civId]: ledger },
      fuelStartupGrantedByCiv: { ...(next.fuelStartupGrantedByCiv ?? {}), [civId]: true },
    };
  }
  return next;
}

export function getCityFuelStatus(
  _state: GameState,
  city: City,
): { buildingId: string; goodId: TradeGoodId; powered: boolean }[] {
  const fallback = new Set(city.fuelFallbackBuildingIds ?? []);
  return getCityFuelDemands(city).map(demand => ({
    buildingId: demand.buildingId,
    goodId: demand.goodId,
    powered: !fallback.has(demand.buildingId),
  }));
}
