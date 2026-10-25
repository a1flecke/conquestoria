import type { GameState, TradeRoute, City } from '@/core/types';
import { getRouteCapacity, getRouteOperatingStatus, type TradeRouteNonOperatingReason } from '@/systems/trade-route-economy';
import { getRouteControlOptions, type RouteControlAction } from '@/systems/trade-route-lifecycle';
import { getEntitledRouteDanger, getTradeDangerFacts, type TradeDangerFacts } from '@/systems/trade-danger-adapters';
import { getRouteManifestQuantity } from '@/systems/resource-shipment-system';
import { getProcurementRemaining, getRouteManifestPaid } from '@/systems/resource-procurement';
import { getRouteLegRounds } from '@/systems/trade-route-travel';
import { findTradeGood } from '@/systems/trade-good-definitions';
import { createGameButton } from '@/ui/ui-kit';

// Trade Routes Overhaul (#553 MR4/4) — shared route-list rendering, extracted from
// marketplace-panel.ts's original inline buildRouteListSection so the Marketplace panel
// and the City panel's new Trade Routes section render identically instead of drifting.

/** Player-facing explanation for a route that is not currently earning (#1501 MR04, #1502 MR05, #1503). */
const NOT_OPERATING_LABEL: Record<TradeRouteNonOperatingReason, string> = {
  positioning: 'positioning',
  'no-trader': 'no trader',
  blocked: 'blocked',
  blockaded: 'blockaded',
  'service-complete': 'service complete',
  paused: 'paused',
  cancelled: 'cancelled',
  'endpoint-lost': 'endpoint lost',
};

export { NOT_OPERATING_LABEL };

/** The owner controls a route row exposes (#1502 MR05). */
export type RouteControlHandler = (routeId: string, action: RouteControlAction) => void;

function renderRouteRow(
  state: GameState,
  fromCity: City,
  route: TradeRoute,
  danger: TradeDangerFacts,
  onSelectUnit?: (unitId: string) => void,
  onRouteControl?: RouteControlHandler,
): HTMLElement {
  const toCity = state.cities[route.toCityId];
  const committedUnit = Object.values(state.units).find(u => u.committedToRouteId === route.id);
  // #1501 MR04: show the promised operating rate and what the route is *actually* earning now.
  const status = getRouteOperatingStatus(state, route.id, danger);
  const gold = status.promisedGoldPerTurn;
  // #1503 MR06: the cause of a blockade is only named when the viewer is entitled to know it (its own
  // city is blockaded); otherwise the row reports the interruption without leaking a hidden fleet.
  const entitledDanger = getEntitledRouteDanger(state, state.currentPlayer, route, danger);

  const row = document.createElement('div');
  row.style.cssText = 'font-size:12px;padding:6px 0;border-bottom:1px solid rgba(255,255,255,0.08);display:flex;justify-content:space-between;gap:8px;min-height:44px;align-items:center;';
  if (committedUnit && onSelectUnit) {
    row.style.cursor = 'pointer';
    row.addEventListener('click', () => onSelectUnit(committedUnit.id));
  }

  const routeText = `${fromCity.name} → ${toCity?.name ?? route.toCityId}`;
  const summary = document.createElement('div');
  summary.style.cssText = 'display:flex;flex-direction:column;gap:2px;';
  if (committedUnit && onSelectUnit) {
    // #1459: the row stays clickable for pointer users; selecting the route's trade unit is also a real button.
    row.dataset.pointerShortcut = 'true';
    const select = document.createElement('button');
    select.type = 'button';
    select.setAttribute('aria-label', `Select the trade unit on ${routeText}`);
    select.style.cssText = 'min-height:44px;background:none;border:none;color:inherit;font:inherit;text-align:left;padding:0;cursor:pointer;';
    select.appendChild(document.createTextNode(routeText));
    select.addEventListener('click', event => {
      event.stopPropagation();
      onSelectUnit(committedUnit.id);
    });
    summary.appendChild(select);
  } else {
    const routeLabel = document.createElement('span');
    routeLabel.appendChild(document.createTextNode(routeText));
    summary.appendChild(routeLabel);
  }

  const routeDetail = document.createElement('span');
  routeDetail.style.cssText = 'font-size:11px;color:#6b9b4b;';
  const promised = `+${gold.toFixed(1)} gold/turn`;
  const reasonLabel = status.reason === 'blockaded' && !entitledDanger
    ? 'service interrupted'
    : NOT_OPERATING_LABEL[status.reason ?? 'blocked'];
  const actual = status.paying
    ? 'earning now'
    : `earning 0 · ${reasonLabel}`;
  routeDetail.appendChild(document.createTextNode(`${promised} · ${actual} · round trip ${route.turnsPerTrip * 2} rounds`));
  summary.appendChild(routeDetail);

  // #1509 MR12: the manifest is owned cargo, not route income. Show what is aboard, what it cost,
  // and the target still short; a destroyed trader loses it (the row says so before departure).
  const manifestQuantity = getRouteManifestQuantity(route);
  if (manifestQuantity > 0) {
    const cargo = document.createElement('span');
    cargo.dataset.routeManifest = 'true';
    cargo.style.cssText = 'font-size:11px;color:#e8c170;';
    const goods = (route.manifest?.items ?? [])
      .map(item => `${item.quantity} ${findTradeGood(item.goodId)?.name ?? item.goodId}`)
      .join(', ');
    const direction = committedUnit?.routeDirection === 'inbound'
      ? `returning home in ${getRouteLegRounds(state, committedUnit, route.fromCityId) ?? '?'} round(s)`
      : 'awaiting return';
    cargo.textContent = `Cargo: ${goods} · paid ${getRouteManifestPaid(route)} · ${direction} · lost if the trader is destroyed`;
    summary.appendChild(cargo);
  }
  const order = route.procurement?.orders?.[0];
  if (order) {
    const remaining = getProcurementRemaining(state, fromCity.owner, order);
    const target = document.createElement('span');
    target.dataset.routeProcurement = 'true';
    target.style.cssText = 'font-size:11px;opacity:0.7;';
    target.textContent = `${findTradeGood(order.goodId)?.name ?? order.goodId} target ${order.targetQuantity} · ${remaining} still to buy · max ${order.maxUnitPrice}/unit`;
    summary.appendChild(target);
  }

  if (!status.paying && entitledDanger) {
    const dangerLine = document.createElement('span');
    dangerLine.dataset.entitledDanger = entitledDanger.source;
    dangerLine.style.cssText = 'font-size:11px;color:#d98d4a;';
    dangerLine.appendChild(document.createTextNode(entitledDanger.label));
    summary.appendChild(dangerLine);
  }
  row.appendChild(summary);

  // #1502 MR05: the owner's controls, rendered from the same query the executor re-checks, so a
  // stale row can never offer an action the executor would refuse.
  if (onRouteControl) {
    const controls = document.createElement('div');
    controls.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;justify-content:flex-end;';
    for (const option of getRouteControlOptions(state, route.id, state.currentPlayer)) {
      if (!option.enabled) continue;
      const button = createGameButton(option.label, option.action === 'cancel-and-return' ? 'ghost' : 'secondary');
      button.dataset.action = `route-${option.action}`;
      button.dataset.routeId = route.id;
      button.setAttribute('aria-label', `${option.label} the trade route ${routeText}`);
      button.addEventListener('click', event => {
        event.stopPropagation();
        onRouteControl(route.id, option.action);
      });
      controls.appendChild(button);
    }
    if (controls.childElementCount > 0) row.appendChild(controls);
  }

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
  onRouteControl?: RouteControlHandler,
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

  // #1503 MR06: one danger read for the whole section, not one map scan per row.
  const danger = getTradeDangerFacts(state);

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
      wrapper.appendChild(renderRouteRow(state, city, route, danger, onSelectUnit, onRouteControl));
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
  onRouteControl?: RouteControlHandler,
): HTMLElement | null {
  const city = state.cities[cityId];
  if (!city) return null;

  const routes = getOutgoingRoutesForCity(state, cityId);
  if (routes.length === 0) return null;

  const danger = getTradeDangerFacts(state);
  const wrapper = document.createElement('div');
  for (const route of routes) {
    wrapper.appendChild(renderRouteRow(state, city, route, danger, onSelectUnit, onRouteControl));
  }
  return wrapper;
}
