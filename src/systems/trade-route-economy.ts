// src/systems/trade-route-economy.ts
// #1249: what a trade route is worth and how many a city may hold — per-trip gold, tech/network
// bonuses, capacity and the trip bonus. Pure queries over state; no route is created or removed here.
import type { TradeRoute, GameState, UnitType } from '@/core/types';
import { isCityCoastal } from './city-system';
import { getTradeRouteTechGold } from './tech-yield-system';
import { getNetworkRouteGoldBonus } from './network-infrastructure-plans';

export function calculateTradeRouteGold(
  distance: number,
  resourceDiversity: number,
): number {
  const base = 2;
  const distBonus = Math.min(distance, 10);
  const diversityBonus = Math.min(resourceDiversity, 5);
  return base + Math.floor(distBonus / 3) + diversityBonus;
}

// --- S5: per-route effective gold/turn ---

export function getEffectiveGoldPerTurn(route: TradeRoute, techGoldBonus: number = 0): number {
  return Math.max(1, Math.round(route.goldPerTrip / route.turnsPerTrip) + techGoldBonus);
}

/** Tech-driven per-route gold (guilds, colonial-trade, steam-navigation). */
export function getRouteTechGoldBonus(state: GameState, route: TradeRoute): number {
  const fromCity = state.cities[route.fromCityId];
  const toCity = state.cities[route.toCityId];
  if (!fromCity) return 0;
  const completedTechs = state.civilizations[fromCity.owner]?.techState.completed ?? [];
  const bothEndpointsCoastal = Boolean(toCity) && isCityCoastal(fromCity, state.map) && isCityCoastal(toCity!, state.map);
  return getTradeRouteTechGold(route, completedTechs, { bothEndpointsCoastal });
}

export function processTradeRouteIncome(routes: TradeRoute[], state?: GameState): number {
  return routes.reduce((total, r) => total + getEffectiveGoldPerTurn(r, state ? getRouteTechGoldBonus(state, r) : 0)
    + (state ? getNetworkRouteGoldBonus(state, r) : 0), 0);
}

// --- S5: route capacity ---

export function getRouteCapacity(state: GameState, cityId: string): number {
  const city = state.cities[cityId];
  if (!city) return 1;
  const b = city.buildings;
  const completedTechs = state.civilizations[city.owner]?.techState.completed ?? [];
  const total = 1
    + (b.includes('caravanserai')  ? 1 : 0)
    + (b.includes('marketplace')   ? 1 : 0)
    + (b.includes('bank')          ? 1 : 0)
    + (b.includes('stock_exchange') ? 1 : 0)
    + (completedTechs.includes('mercantilism') ? 1 : 0)
    + (completedTechs.includes('deep-ocean-research') && isCityCoastal(city, state.map) ? 1 : 0);
  return Math.min(total, 6);
}

// --- S5: trip bonus ---

// Trade Routes Overhaul (#553 MR1/4): per-unit-tier trip bonus, shared by all trade
// lines (land/naval/air). Capped at +3 total regardless of line length — see
// game-balance.md's "Trip bonus source inventory" table for the full stacking analysis.
const TRADE_UNIT_TIER_BONUS: Partial<Record<UnitType, number>> = {
  naval_trader: 0, steamship_trader: 1, cargo_freighter: 2, container_ship: 3,
  merchant_wagon: 1, freight_convoy: 2,
  jet_freighter: 1, global_air_cargo: 2,
};

export function getTradeUnitTripBonus(
  state: GameState,
  fromCityId: string,
  toCityId: string,
  caravanOwner: string,
  caravanType?: UnitType,
): number {
  const fromCity = state.cities[fromCityId];
  const toCity   = state.cities[toCityId];
  // Silk Road wonder doesn't exist yet — always 0 until added
  const hasSilkRoad =
    state.completedLegendaryWonders?.['silk-road']?.ownerId === caravanOwner;
  const tierBonus = caravanType ? (TRADE_UNIT_TIER_BONUS[caravanType] ?? 0) : 0;
  return (
    (fromCity?.buildings.includes('caravanserai') ? 2 : 0) +
    (toCity?.buildings.includes('caravanserai')   ? 2 : 0) +
    (hasSilkRoad ? 3 : 0) +
    Math.min(3, tierBonus)
  );
}
