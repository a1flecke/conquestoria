import type { GameState, HexCoord } from '@/core/types';
import type { FreightVoyagePort, FreightVoyageReceipt, TradeGoodId } from '@/core/types/commerce';
import { hexKey } from '@/systems/hex-utils';
import { quoteMarketLoad, refreshMarketOffers } from '@/systems/resource-market-offers';
import { getGoodCargoSpace, getProcurementRemaining, getRouteCargoCapacity } from '@/systems/resource-procurement';
import { isRouteServiceSuspended } from '@/systems/trade-danger-adapters';
import { getRouteRunner } from '@/systems/trade-route-runner';
import { getNavalRouteTripRounds, getRouteLegPath } from '@/systems/trade-route-travel';
import { isTradeUnitTypeInDomain } from '@/systems/trade-role-targeting';

interface AuthoredService {
  home: FreightVoyagePort & { regionKey: string };
  supplier: FreightVoyagePort & { regionKey: string };
  goodId: TradeGoodId;
  revalidation?: {
    round: number;
    previousIssuances: readonly string[];
  };
}

interface AuthoredPassage {
  id: string;
  site: HexCoord;
}

const RECENT_ROUNDS = 12;
const RETURNS_PER_REGION_PAIR = 2;

function samePort(actual: FreightVoyagePort, expected: FreightVoyagePort): boolean {
  return actual.cityId === expected.cityId && actual.ownerCivId === expected.ownerCivId
    && actual.regionKey === expected.regionKey;
}

function matchesService(receipt: FreightVoyageReceipt, service: AuthoredService): boolean {
  return samePort(receipt.home, service.home) && samePort(receipt.supplier, service.supplier)
    && receipt.buyerCivId === service.home.ownerCivId && receipt.operatorCivId === service.home.ownerCivId
    && receipt.stock.some(item => item.goodId === service.goodId && item.quantity > 0);
}

/** The scenario calls this when accepting a material change to this service or its passage. */
export function markAuthoredServiceChange(state: GameState, service: AuthoredService): AuthoredService {
  const previousIssuances = new Set(Object.keys(state.freightVoyageReceipts ?? {}));
  for (const route of state.marketplace?.tradeRoutes ?? []) {
    const manifest = route.manifest;
    const issuance = manifest?.items[0]?.claimId;
    if (issuance && manifest?.freightVoyage?.crossing?.crossed) previousIssuances.add(issuance);
  }
  return { ...service, revalidation: { round: state.turn, previousIssuances: [...previousIssuances].sort() } };
}

function serviceRoutes(state: GameState, service: AuthoredService) {
  return (state.marketplace?.tradeRoutes ?? []).filter(route =>
    route.fromCityId === service.home.cityId && route.toCityId === service.supplier.cityId
      && route.foreignCivId === service.supplier.ownerCivId && (route.mode ?? 'commerce') === 'commerce');
}

function compareTrips(state: GameState, disabled: GameState, service: AuthoredService) {
  const trader = serviceRoutes(state, service).map(route => getRouteRunner(state, route.id))
    .find(unit => unit?.owner === service.home.ownerCivId && isTradeUnitTypeInDomain(unit.type, 'naval'));
  const home = state.cities[service.home.cityId];
  if (!home || !trader) return null;

  // Start both comparisons at the named home. Ignore temporary unit occupancy.
  const unit = { ...trader, position: home.position };
  const trip = (world: GameState) => {
    const legs = getNavalRouteTripRounds({ ...world, units: {} }, unit, home.id, service.supplier.cityId);
    return legs ? legs.outbound + legs.inbound : null;
  };
  return { homeCityId: home.id, current: trip(state), disabled: trip(disabled) };
}

function hasRepeatableFreight(state: GameState, market: GameState, passage: AuthoredPassage, service: AuthoredService): boolean {
  const channel = state.map.tiles[hexKey(passage.site)]?.freightPassage;
  const operator = service.home.ownerCivId;
  const supplier = service.supplier.ownerCivId;
  if (!channel?.open || channel.id !== passage.id
    || (channel.ownerId !== operator && !channel.allowedOperatorIds.includes(operator))) return false;
  if (state.cities[service.home.cityId]?.owner !== operator
    || state.cities[service.supplier.cityId]?.owner !== supplier) return false;

  return serviceRoutes(state, service).some(route => {
    if (route.paused || route.cancelPending || route.endpointLost || route.returnHomeCityId
      || isRouteServiceSuspended(state, route)) return false;
    const trader = getRouteRunner(state, route.id);
    if (!trader || trader.owner !== operator || trader.routeDirection === 'positioning'
      || !isTradeUnitTypeInDomain(trader.type, 'naval')
      || getRouteCargoCapacity(trader.type) < getGoodCargoSpace(service.goodId, 1)) return false;
    const target = trader.routeDirection === 'inbound' ? service.home.cityId : service.supplier.cityId;
    if (!getRouteLegPath(state, trader, target)) return false;
    const order = route.procurement?.orders.find(candidate => candidate.goodId === service.goodId);
    if (!order || getProcurementRemaining(state, operator, order) < 1) return false;
    const load = quoteMarketLoad(market, operator, supplier, order.goodId, 1);
    return load.ok && load.quote.totalPrice <= order.maxUnitPrice;
  });
}

/** The fixed #1125 fixture reads completed shipments and current terms without changing game state. */
export function evaluateAuthoredPassage(
  state: GameState,
  passage: AuthoredPassage,
  services: readonly AuthoredService[],
  completedRound: number,
) {
  const key = hexKey(passage.site);
  const tile = state.map.tiles[key];
  const disabled = tile?.freightPassage
    ? { ...state, map: { ...state.map, tiles: {
      ...state.map.tiles, [key]: { ...tile, freightPassage: { ...tile.freightPassage, open: false } },
    } } }
    : state;
  const receipts = Object.entries(state.freightVoyageReceipts ?? {}).filter(([, receipt]) =>
    receipt.passageId === passage.id && receipt.completedRound <= completedRound
      && receipt.completedRound > completedRound - RECENT_ROUNDS);
  const byRegionPair = new Map<string, { regions: string[]; issuances: Set<string> }>();

  for (const service of services) {
    // A settlement after the checkpoint must also prove a crossing after it. A completed
    // crossing already on an inbound manifest cannot revalidate newly accepted terms.
    const change = service.revalidation;
    if (change && !receipts.some(([issuance, receipt]) =>
      matchesService(receipt, service) && receipt.completedRound >= change.round
        && !change.previousIssuances.includes(issuance))) continue;
    const regions = [service.home.regionKey, service.supplier.regionKey].sort();
    if (regions[0] === regions[1]) continue;
    const pairKey = JSON.stringify(regions);
    const pair = byRegionPair.get(pairKey) ?? { regions, issuances: new Set<string>() };
    for (const [issuance, receipt] of receipts) {
      if (matchesService(receipt, service)) pair.issuances.add(issuance);
    }
    byRegionPair.set(pairKey, pair);
  }

  const qualifiedRegionPairs = [...byRegionPair].sort(([left], [right]) => left.localeCompare(right))
    .filter(([, pair]) => pair.issuances.size >= RETURNS_PER_REGION_PAIR)
    .map(([, pair]) => pair.regions);
  const servedRegions = new Set(qualifiedRegionPairs.flat());
  const trips = services.map(service => compareTrips(state, disabled, service));
  // A service needs funding for another load; money already spent from the completed round's
  // per-round allowance cannot reduce the next allowance. Use the canonical offer and quote path.
  const market = refreshMarketOffers({ ...state, turn: completedRound + 1 });
  return {
    usefulReach: qualifiedRegionPairs.length >= 2 && servedRegions.size >= 3,
    currentFunction: services.length > 0 && services.every(service => hasRepeatableFreight(state, market, passage, service)),
    qualifiedRegionPairs,
    trips,
  };
}
