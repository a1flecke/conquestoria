import type { GameState, TradeRoute, City } from '@/core/types';
import { getEffectiveGoldPerTurn, getRouteCapacity, getRouteTechGoldBonus } from '@/systems/trade-system';

// Trade Routes Overhaul (#553 MR4/4) — shared route-list rendering, extracted from
// marketplace-panel.ts's original inline buildRouteListSection so the Marketplace panel
// and the City panel's new Trade Routes section render identically instead of drifting.

function renderRouteRow(
  state: GameState,
  fromCity: City,
  route: TradeRoute,
  onSelectUnit?: (unitId: string) => void,
): HTMLElement {
  const toCity = state.cities[route.toCityId];
  const committedUnit = Object.values(state.units).find(u => u.committedToRouteId === route.id);
  const tripsLeft = committedUnit?.tripsRemaining ?? '?';
  const gold = getEffectiveGoldPerTurn(route, getRouteTechGoldBonus(state, route));

  const row = document.createElement('div');
  row.style.cssText = 'font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;min-height:44px;align-items:center;';
  if (committedUnit && onSelectUnit) {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => onSelectUnit(committedUnit.id));
  }

  const routeLabel = document.createElement('span');
  routeLabel.appendChild(document.createTextNode(`${fromCity.name} → ${toCity?.name ?? route.toCityId}`));
  row.appendChild(routeLabel);

  const routeDetail = document.createElement('span');
  routeDetail.style.cssText = 'font-size:11px;color:#6b9b4b;';
  routeDetail.appendChild(document.createTextNode(`+${gold.toFixed(1)} gold/turn · ${tripsLeft} trips`));
  row.appendChild(routeDetail);

  return row;
}

/**
 * Builds the "Active Trade Routes" section for the Marketplace panel: every route the
 * player owns (as fromCityId), grouped by origin city, across the whole civilization.
 */
export function buildPlayerRouteListSection(
  state: GameState,
  currentPlayer: string,
  onSelectUnit?: (unitId: string) => void,
): HTMLElement {
  const wrapper = document.createElement('div');

  const heading = document.createElement('div');
  heading.textContent = 'Active Trade Routes';
  heading.style.cssText = 'font-size:14px;color:#e8c170;margin-bottom:8px;';
  wrapper.appendChild(heading);

  const playerRoutes = (state.marketplace?.tradeRoutes ?? []).filter(r => {
    const city = state.cities[r.fromCityId];
    return city?.owner === currentPlayer;
  });

  if (playerRoutes.length === 0) {
    const empty = document.createElement('div');
    empty.textContent = 'No active routes. Train a Caravan to establish one.';
    empty.style.cssText = 'font-size:12px;opacity:0.5;text-align:center;padding:16px 0;';
    wrapper.appendChild(empty);
    return wrapper;
  }

  // Group by fromCityId
  const groups = new Map<string, typeof playerRoutes>();
  for (const route of playerRoutes) {
    const arr = groups.get(route.fromCityId) ?? [];
    arr.push(route);
    groups.set(route.fromCityId, arr);
  }

  for (const [cityId, routes] of groups) {
    const city = state.cities[cityId];
    if (!city) continue;
    const total = getRouteCapacity(state, cityId);
    const used  = routes.length;

    const cityHeader = document.createElement('div');
    cityHeader.style.cssText = 'font-size:13px;color:#e8c170;margin:10px 0 4px;';
    cityHeader.appendChild(document.createTextNode(`${city.name}  (${used}/${total} slots)`));
    wrapper.appendChild(cityHeader);

    for (const route of routes) {
      wrapper.appendChild(renderRouteRow(state, city, route, onSelectUnit));
    }
  }

  return wrapper;
}

/**
 * Returns the routes originating from a single city (fromCityId === cityId only — a
 * route where this city is the destination is not this city's outgoing route). Used by
 * the City panel's Trade Routes section, scoped to whichever city is currently open.
 */
export function getOutgoingRoutesForCity(state: GameState, cityId: string): TradeRoute[] {
  return (state.marketplace?.tradeRoutes ?? []).filter(r => r.fromCityId === cityId);
}

/**
 * Builds the route rows for a single city (no grouping header — the caller already
 * knows which city is open). Returns null when there are no outgoing routes so callers
 * can render their own empty-state copy.
 */
export function buildCityRouteRows(
  state: GameState,
  cityId: string,
  onSelectUnit?: (unitId: string) => void,
): HTMLElement | null {
  const city = state.cities[cityId];
  if (!city) return null;

  const routes = getOutgoingRoutesForCity(state, cityId);
  if (routes.length === 0) return null;

  const wrapper = document.createElement('div');
  for (const route of routes) {
    wrapper.appendChild(renderRouteRow(state, city, route, onSelectUnit));
  }
  return wrapper;
}
