// src/systems/trade-caravan-system.ts
// #1249: turning a caravan into a route — which city it leaves from, whether the route is legal, and the
// establishment itself. Reads route value from trade-route-economy and route validity from the lifecycle
// module; creates the marketplace state an old save lacks.
import type { TradeRoute, GameState, Unit, City } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { findPathToCity } from '@/systems/unit-pathfinding';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { createMarketplaceState } from './marketplace-system';
import { calculateTradeRouteGold, getRouteCapacity, getTradeUnitTripBonus } from './trade-route-economy';
import { getRouteDiplomacy } from './trade-route-lifecycle';

function routesFromCity(state: GameState, cityId: string): number {
  return (state.marketplace?.tradeRoutes ?? []).filter(r => r.fromCityId === cityId).length;
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
