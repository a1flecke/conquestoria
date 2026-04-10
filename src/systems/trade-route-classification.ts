import type { GameState, TradeRoute } from '@/core/types';
import { hexDistance } from '@/systems/hex-utils';

function isCityCoastal(state: GameState, cityId: string): boolean {
  const city = state.cities[cityId];
  if (!city) {
    return false;
  }

  return city.ownedTiles.some(coord => {
    const tile = state.map.tiles[`${coord.q},${coord.r}`];
    return tile?.terrain === 'coast' || tile?.terrain === 'ocean';
  });
}

function getRouteDistance(state: GameState, route: TradeRoute): number {
  const fromCity = state.cities[route.fromCityId];
  const toCity = state.cities[route.toCityId];
  if (!fromCity || !toCity) {
    return 0;
  }

  return hexDistance(fromCity.position, toCity.position);
}

export function routeMatchesLegendaryWonderRequirement(
  state: GameState,
  route: TradeRoute,
  requirement: 'any' | 'coastal' | 'overseas' | 'long-range' = 'any',
  minimumRouteDistance = 0,
): boolean {
  if (requirement === 'any') {
    return true;
  }

  const fromCoastal = isCityCoastal(state, route.fromCityId);
  const toCoastal = isCityCoastal(state, route.toCityId);
  const coastalRoute = fromCoastal || toCoastal;

  if (requirement === 'coastal') {
    return coastalRoute;
  }

  if (requirement === 'overseas') {
    return coastalRoute && Boolean(route.foreignCivId);
  }

  return coastalRoute && getRouteDistance(state, route) >= minimumRouteDistance;
}
