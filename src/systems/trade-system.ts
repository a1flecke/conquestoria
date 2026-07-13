import type { MarketplaceState, TradeRoute, GameState, Unit, City, UnitType } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { findPathToCity, UNIT_DEFINITIONS } from '@/systems/unit-system';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { isAtWar, getRelationship } from '@/systems/diplomacy-system';
import { isMinorCivAtWar } from './minor-civ-diplomacy';
import { RESOURCE_DEFINITIONS } from './resource-definitions';
import { isCityCoastal } from './city-system';
import { getTradeRouteTechGold } from './tech-yield-system';
export { RESOURCE_DEFINITIONS } from './resource-definitions';
export type { ResourceDefinition, ResourceEffect } from './resource-definitions';

export const BASE_PRICES: Record<string, number> = {};
for (const r of RESOURCE_DEFINITIONS) {
  BASE_PRICES[r.id] = r.basePrice;
}

export const RESOURCE_ICONS: Record<string, string> = {};
export const RESOURCE_TECH: Record<string, string> = {};
for (const r of RESOURCE_DEFINITIONS) {
  RESOURCE_ICONS[r.id] = r.icon;
  RESOURCE_TECH[r.id] = r.tech;
}

export function createMarketplaceState(): MarketplaceState {
  const prices: Record<string, number> = {};
  const priceHistory: Record<string, number[]> = {};
  for (const r of RESOURCE_DEFINITIONS) {
    prices[r.id] = r.basePrice;
    priceHistory[r.id] = [r.basePrice];
  }
  return {
    prices,
    priceHistory,
    fashionable: null,
    fashionTurnsLeft: 0,
    tradeRoutes: [],
    purchasedResources: [],
  };
}

export function calculatePrice(
  basePrice: number,
  supply: number,
  demand: number,
  isMonopoly: boolean,
  isFashionable: boolean,
): number {
  let effectiveDemand = demand;
  if (isFashionable) effectiveDemand *= 2;

  const ratio = effectiveDemand > 0 && supply > 0
    ? effectiveDemand / supply
    : 1;

  // Dampened price movement
  const rawPrice = basePrice * (0.5 + 0.5 * ratio);
  let price = Math.round(rawPrice);

  if (isMonopoly) price *= 2;

  return Math.max(1, price);
}

export function detectMonopoly(
  playerSupply: number,
  totalSupply: number,
): boolean {
  if (totalSupply === 0) return false;
  return playerSupply / totalSupply >= 0.6;
}

export function calculateTradeRouteGold(
  distance: number,
  resourceDiversity: number,
): number {
  const base = 2;
  const distBonus = Math.min(distance, 10);
  const diversityBonus = Math.min(resourceDiversity, 5);
  return base + Math.floor(distBonus / 3) + diversityBonus;
}

export function updatePrices(
  marketplace: MarketplaceState,
  supplies: Record<string, number>,
  demands: Record<string, number>,
): MarketplaceState {
  const newPrices = { ...marketplace.prices };
  const newHistory = { ...marketplace.priceHistory };

  for (const r of RESOURCE_DEFINITIONS) {
    const supply = supplies[r.id] ?? 1;
    const demand = demands[r.id] ?? 1;
    const isMonopoly = false; // would need player-specific context
    const isFashionable = marketplace.fashionable === r.id;

    newPrices[r.id] = calculatePrice(r.basePrice, supply, demand, isMonopoly, isFashionable);

    const history = [...(newHistory[r.id] ?? []), newPrices[r.id]];
    newHistory[r.id] = history.slice(-20);
  }

  return {
    ...marketplace,
    prices: newPrices,
    priceHistory: newHistory,
  };
}

export function processFashionCycle(
  marketplace: MarketplaceState,
  rng: () => number,
): MarketplaceState {
  if (marketplace.fashionTurnsLeft > 0) {
    return {
      ...marketplace,
      fashionTurnsLeft: marketplace.fashionTurnsLeft - 1,
      fashionable: marketplace.fashionTurnsLeft === 1 ? null : marketplace.fashionable,
    };
  }

  // Random chance to start a new fashion cycle
  if (rng() < 0.05) { // ~5% per turn, avg every 20 turns
    const luxuries = RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury');
    const chosen = luxuries[Math.floor(rng() * luxuries.length)];
    return {
      ...marketplace,
      fashionable: chosen.id,
      fashionTurnsLeft: 10,
    };
  }

  return marketplace;
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
  return routes.reduce((total, r) => total + getEffectiveGoldPerTurn(r, state ? getRouteTechGoldBonus(state, r) : 0), 0);
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

function routesFromCity(state: GameState, cityId: string): number {
  return (state.marketplace?.tradeRoutes ?? []).filter(r => r.fromCityId === cityId).length;
}

function getRouteDiplomacy(state: GameState, ownerCivId: string, foreignCivId: string) {
  const minorCiv = state.minorCivs[foreignCivId];
  if (minorCiv) {
    return {
      atWar: isMinorCivAtWar(state, ownerCivId, foreignCivId),
      relationship: minorCiv.diplomacy.relationships[ownerCivId] ?? 0,
    };
  }
  const diplomacy = state.civilizations[ownerCivId]?.diplomacy;
  return {
    atWar: diplomacy ? isAtWar(diplomacy, foreignCivId) : false,
    relationship: diplomacy ? getRelationship(diplomacy, foreignCivId) : 0,
  };
}

// --- S5: FROM city resolution ---

export function resolveFromCity(state: GameState, caravanUnit: Unit): City | null {
  const ownedCities = Object.values(state.cities)
    .filter(c => c.owner === caravanUnit.owner);
  const domain = UNIT_DEFINITIONS[caravanUnit.type]?.domain ?? 'land';

  const candidates: Array<{ city: City; pathLen: number; remaining: number }> = [];
  for (const city of ownedCities) {
    const remaining = getRouteCapacity(state, city.id) - routesFromCity(state, city.id);
    if (remaining <= 0) continue;
    const path = findPathToCity(caravanUnit.position, city.position, state.map, domain);
    if (!path) continue;
    candidates.push({ city, pathLen: path.length, remaining });
  }

  if (candidates.length === 0) return null;

  // Sort: nearest first; tiebreak by most remaining capacity
  candidates.sort((a, b) => {
    if (a.pathLen !== b.pathLen) return a.pathLen - b.pathLen;
    return b.remaining - a.remaining;
  });

  return candidates[0].city;
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

// --- S5: route validation ---

export function canEstablishRoute(
  state: GameState,
  caravanUnit: Unit,
  toCityId: string,
): { ok: boolean; reason?: string } {
  // 1. Already committed
  if (caravanUnit.committedToRouteId) {
    return { ok: false, reason: 'Caravan is already committed to a route' };
  }
  // 2. TO city must exist
  const toCity = state.cities[toCityId];
  if (!toCity) return { ok: false, reason: 'Destination city not found' };
  // 3. FROM city must exist with capacity
  const fromCity = resolveFromCity(state, caravanUnit);
  if (!fromCity) return { ok: false, reason: 'No city with available route capacity' };
  // 4. Self-route blocked
  if (toCity.id === fromCity.id) return { ok: false, reason: 'Cannot route a city to itself' };
  // 5. A path must exist FROM→TO in the trade unit's own movement domain
  const domain = UNIT_DEFINITIONS[caravanUnit.type]?.domain ?? 'land';
  const path = findPathToCity(fromCity.position, toCity.position, state.map, domain);
  if (!path) {
    return {
      ok: false,
      reason: domain === 'land'
        ? 'Requires a Naval Trader to cross water'
        : 'No route exists between these cities',
    };
  }
  // 6. Foreign city checks
  if (toCity.owner !== caravanUnit.owner) {
    const ownerCiv = state.civilizations[caravanUnit.owner];
    if (!ownerCiv) return { ok: false, reason: 'Owner civilization not found' };
    const routeDiplomacy = getRouteDiplomacy(state, caravanUnit.owner, toCity.owner);
    if (routeDiplomacy.atWar) {
      const enemyName = state.civilizations[toCity.owner]?.name ?? toCity.owner;
      return { ok: false, reason: `At war with ${enemyName}` };
    }
    if (routeDiplomacy.relationship < 0) {
      return { ok: false, reason: `Relations too hostile (score: ${routeDiplomacy.relationship})` };
    }
  }
  return { ok: true };
}

// --- S5: route establishment ---

export function establishRoute(
  state: GameState,
  caravanUnitId: string,
  toCityId: string,
  bus?: EventBus,
  resourceDiversity: number = 0,
): GameState {
  const caravanUnit = state.units[caravanUnitId];
  if (!caravanUnit) throw new Error(`Unit ${caravanUnitId} not found`);

  const fromCity = resolveFromCity(state, caravanUnit);
  if (!fromCity) throw new Error('No eligible FROM city — call canEstablishRoute first');

  const toCity = state.cities[toCityId];
  if (!toCity) throw new Error(`TO city ${toCityId} not found`);

  // Deep-copy state (spread-copy pattern consistent with codebase)
  let newState: GameState = {
    ...state,
    units: { ...state.units },
    cities: { ...state.cities },
    idCounters: { ...state.idCounters },
    marketplace: state.marketplace ? { ...state.marketplace, tradeRoutes: [...state.marketplace.tradeRoutes] } : createMarketplaceState(),
  };

  // Guard: initialise nextRouteId if missing (old saves)
  if (!newState.idCounters.nextRouteId) {
    newState.idCounters.nextRouteId = 1;
  }

  // Compute distance (map-wrap aware)
  const hexDist = newState.map.wrapsHorizontally
    ? wrappedHexDistance(fromCity.position, toCity.position, newState.map.width)
    : hexDistance(fromCity.position, toCity.position);

  const turnsPerTrip = Math.max(1, Math.ceil(hexDist / 3));

  // resourceDiversity passed by caller (avoids circular import with resource-acquisition-system)
  const goldPerTrip = calculateTradeRouteGold(hexDist, resourceDiversity) * turnsPerTrip;

  const tripBonus = getTradeUnitTripBonus(newState, fromCity.id, toCityId, caravanUnit.owner, caravanUnit.type);
  const tripsRemaining = 8 + tripBonus;

  const foreignCivId = toCity.owner !== caravanUnit.owner ? toCity.owner : undefined;

  const routeId = `route-${newState.idCounters.nextRouteId}`;
  newState.idCounters.nextRouteId++;

  const route: TradeRoute = {
    id: routeId,
    fromCityId: fromCity.id,
    toCityId,
    goldPerTrip,
    turnsPerTrip,
    ...(foreignCivId ? { foreignCivId } : {}),
  };

  newState.marketplace!.tradeRoutes.push(route);

  newState.units[caravanUnitId] = {
    ...caravanUnit,
    committedToRouteId: routeId,
    tripsRemaining,
    movementPointsLeft: 0,
    hasActed: true,
  };

  bus?.emit('trade:route-created', { route });
  return newState;
}

// --- S5: route removal helper ---

// --- S6a: route lifecycle helpers ---

export function removeRouteById(
  state: GameState,
  routeId: string,
  bus: EventBus | undefined,
  reason: 'war-declared' | 'hostile-relations' | 'embargo',
): GameState {
  const route = state.marketplace?.tradeRoutes.find(r => r.id === routeId);
  if (!route) return state;

  const newRoutes = state.marketplace!.tradeRoutes.filter(r => r.id !== routeId);
  const newMarketplace = { ...state.marketplace!, tradeRoutes: newRoutes };

  // Clear caravan commitment before emitting so listeners see freed unit state
  const updatedUnits = { ...state.units };
  for (const [unitId, unit] of Object.entries(state.units)) {
    if (unit.committedToRouteId === routeId) {
      updatedUnits[unitId] = { ...unit, committedToRouteId: undefined, tripsRemaining: undefined };
    }
  }

  bus?.emit('trade:route-ended', {
    routeId,
    fromCityId: route.fromCityId,
    toCityId: route.toCityId,
    reason,
  });

  return { ...state, marketplace: newMarketplace, units: updatedUnits };
}

export function scrubStaleForeignRoutes(state: GameState, bus: EventBus | undefined): GameState {
  if (!state.marketplace) return state;

  let newState = state;
  const routes = state.marketplace.tradeRoutes; // snapshot — original array never mutated

  for (const route of routes) {
    if (!route.foreignCivId) continue;

    // Read from newState so any same-turn city/civ changes are visible
    const fromCity = newState.cities[route.fromCityId];
    if (!fromCity) continue;
    const ownerCiv = newState.civilizations[fromCity.owner];
    if (!ownerCiv) continue;

    const routeDiplomacy = getRouteDiplomacy(newState, fromCity.owner, route.foreignCivId);
    if (routeDiplomacy.atWar) {
      newState = removeRouteById(newState, route.id, bus, 'war-declared');
      continue;
    }

    if (routeDiplomacy.relationship < -25) {
      newState = removeRouteById(newState, route.id, bus, 'hostile-relations');
    }
  }

  return newState;
}

export function scrubEmbargoedRoutes(state: GameState, bus: EventBus | undefined): GameState {
  if (!state.embargoes || state.embargoes.length === 0 || !state.marketplace) return state;

  let newState = state;
  const routes = state.marketplace.tradeRoutes;

  for (const route of routes) {
    if (!route.foreignCivId) continue;

    const fromCity = state.cities[route.fromCityId];
    if (!fromCity) continue;

    const fromOwner = fromCity.owner;
    const toOwner = route.foreignCivId; // stored at route creation — avoids missing-city lookup

    const embargoed = state.embargoes.some(embargo =>
      (embargo.targetCivId === toOwner && embargo.participants.includes(fromOwner)) ||
      (embargo.targetCivId === fromOwner && embargo.participants.includes(toOwner)),
    );

    if (embargoed) {
      newState = removeRouteById(newState, route.id, bus, 'embargo');
    }
  }

  return newState;
}

export function removeRouteForUnit(
  state: GameState,
  unitId: string,
  bus?: EventBus,
  reason: 'unit-died' | 'unit-disbanded' | 'trips-exhausted' = 'unit-died',
  /** Pass explicit routeId when the unit may already be removed from state.units */
  explicitRouteId?: string,
): GameState {
  const unit = state.units[unitId];
  const routeId = explicitRouteId ?? unit?.committedToRouteId;
  if (!routeId) return state;
  const route = state.marketplace?.tradeRoutes.find(r => r.id === routeId);

  const newRoutes = (state.marketplace?.tradeRoutes ?? []).filter(r => r.id !== routeId);
  const newMarketplace = state.marketplace
    ? { ...state.marketplace, tradeRoutes: newRoutes }
    : undefined;

  if (route) {
    bus?.emit('trade:route-ended', {
      routeId,
      fromCityId: route.fromCityId,
      toCityId: route.toCityId,
      reason,
    });
  }

  // Only update the unit entry if it still exists in state (may already be removed on death)
  const updatedUnits = unit
    ? {
        ...state.units,
        [unitId]: { ...unit, committedToRouteId: undefined, tripsRemaining: undefined },
      }
    : state.units;

  return {
    ...state,
    marketplace: newMarketplace,
    units: updatedUnits,
  };
}
