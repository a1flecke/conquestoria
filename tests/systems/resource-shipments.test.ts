import { describe, expect, it } from 'vitest';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import { completeRouteLeg } from '@/systems/trade-route-runner';
import { deliverRouteManifest } from '@/systems/resource-shipment-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { removeRouteById } from '@/systems/trade-route-lifecycle';
import { getReserveBalance, getIncomingQuantity } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1509 MR12 — one load at the supplier, one delivery at home.
 *
 * The buyer never receives usable stock on order or at loading. Loading reserves an incoming claim
 * and pays the seller; only the home arrival converts it to imported stock. A destroyed carrier
 * destroys the claim.
 */

const IRON = resourceGoodId('iron');
const COAL = resourceGoodId('coal');
const SELLER = 'seller';
const BUYER = 'buyer';
const SELLER_CITY = 'seller-city';
const BUYER_CITY = 'buyer-city';

function city(id: string, owner: string, q: number): City {
  return {
    id,
    name: id,
    owner,
    position: { q, r: 0 },
    population: 1,
    food: 0,
    production: 0,
    gold: 0,
    science: 0,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    workedTiles: [],
    ownedTiles: [{ q, r: 0 }],
    focus: 'balanced',
    happiness: 0,
    health: 0,
  } as unknown as City;
}

function civ(id: string, gold: number, completed: string[], partner: string): Civilization {
  return {
    id,
    name: id,
    color: '#fff',
    isHuman: false,
    civType: 'generic',
    cities: [id === SELLER ? SELLER_CITY : BUYER_CITY],
    units: [],
    techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    gold,
    visibility: {},
    knownCivilizations: [partner],
    score: 0,
    diplomacy: {
      relationships: {},
      treaties: [{ type: 'trade_agreement', civA: id, civB: partner, turnsRemaining: -1 }],
      events: [],
      atWarWith: [],
      treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
    },
  } as unknown as Civilization;
}

function route(procurementOrders: TradeRoute['procurement']): TradeRoute {
  return {
    id: 'route-1',
    fromCityId: BUYER_CITY,
    toCityId: SELLER_CITY,
    goldPerTrip: 10,
    turnsPerTrip: 1,
    foreignCivId: SELLER,
    ...(procurementOrders ? { procurement: procurementOrders } : {}),
  };
}

function world(options: {
  native?: number;
  imported?: number;
  buyerGold?: number;
  target?: number;
  maxUnitPrice?: number;
  orders?: TradeRoute['procurement'];
  secondRoute?: boolean;
} = {}): GameState {
  const native = options.native ?? 30;
  const buyerGold = options.buyerGold ?? 1000;
  const orders = options.orders ?? {
    orders: [{ goodId: IRON, targetQuantity: options.target ?? 6, maxUnitPrice: options.maxUnitPrice ?? 100 }],
  };
  const firstRoute = route(orders);
  const routes = options.secondRoute
    ? [firstRoute, { ...firstRoute, id: 'route-2' }]
    : [firstRoute];
  return {
    turn: 10,
    currentPlayer: BUYER,
    cities: { [SELLER_CITY]: city(SELLER_CITY, SELLER, 4), [BUYER_CITY]: city(BUYER_CITY, BUYER, 0) },
    civilizations: {
      [SELLER]: civ(SELLER, 100, ['bronze-working', 'steam-power'], BUYER),
      [BUYER]: civ(BUYER, buyerGold, ['bronze-working', 'steam-power'], SELLER),
    },
    units: {
      'caravan-1': {
        id: 'caravan-1', type: 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
        experience: 0, isResting: false, committedToRouteId: 'route-1', routeDirection: 'outbound',
      },
      ...(options.secondRoute
        ? {
          'caravan-2': {
            id: 'caravan-2', type: 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
            health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
            experience: 0, isResting: false, committedToRouteId: 'route-2', routeDirection: 'outbound',
          },
        }
        : {}),
    },
    map: { width: 8, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] },
    marketplace: {
      prices: {},
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: routes,
      purchasedResources: [],
    },
    commercePermissions: {
      resourceExportGrants: [],
      routeAllowances: [],
      resourcePolicies: [
        { civId: SELLER, goodId: IRON, protectedReserve: 0, partnerCivIds: [BUYER] },
        { civId: SELLER, goodId: COAL, protectedReserve: 0, partnerCivIds: [BUYER] },
      ],
    },
    materialReservesByCiv: {
      [SELLER]: {
        balances: { [IRON]: { native, imported: 0 }, [COAL]: { native, imported: 0 } },
        reservations: [],
        incoming: [],
      },
      [BUYER]: { balances: {}, reservations: [], incoming: [] },
    },
    gameOver: false,
    winner: null,
  } as unknown as GameState;
}

function routeOf(state: GameState, id = 'route-1'): TradeRoute {
  return state.marketplace!.tradeRoutes.find(candidate => candidate.id === id)!;
}

describe('#1509 MR12 — route manifests', () => {
  it('loads once at the supplier and delivers exactly the manifest at home', () => {
    const state = world();
    const loaded = completeRouteLeg(state, 'route-1', 'caravan-1');
    const manifest = routeOf(loaded).manifest!;
    expect(manifest.items).toHaveLength(1);
    expect(manifest.items[0]).toMatchObject({ goodId: IRON, quantity: 6, sellerCivId: SELLER });
    expect(getReserveBalance(loaded.materialReservesByCiv![SELLER]!, IRON).native).toBe(24);
    expect(getReserveBalance(loaded.materialReservesByCiv![BUYER]!, IRON).imported).toBe(0);
    expect(getIncomingQuantity(loaded.materialReservesByCiv![BUYER]!, IRON)).toBe(6);
    expect(loaded.civilizations[BUYER]!.gold).toBeLessThan(1000);

    const delivered = completeRouteLeg(loaded, 'route-1', 'caravan-1');
    expect(routeOf(delivered).manifest).toBeUndefined();
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, IRON).imported).toBe(6);
    expect(getIncomingQuantity(delivered.materialReservesByCiv![BUYER]!, IRON)).toBe(0);

    const replayed = deliverRouteManifest(delivered, 'route-1').state;
    expect(getReserveBalance(replayed.materialReservesByCiv![BUYER]!, IRON).imported).toBe(6);
  });

  it('does not load when the standing max price is below the offer', () => {
    const loaded = completeRouteLeg(world({ maxUnitPrice: 1 }), 'route-1', 'caravan-1');
    expect(routeOf(loaded).manifest).toBeUndefined();
    expect(getReserveBalance(loaded.materialReservesByCiv![BUYER]!, IRON).imported).toBe(0);
  });

  it('counts incoming cargo toward the target so two routes cannot buy it twice', () => {
    const state = world({ target: 6, secondRoute: true });
    const first = completeRouteLeg(state, 'route-1', 'caravan-1');
    expect(getIncomingQuantity(first.materialReservesByCiv![BUYER]!, IRON)).toBe(6);
    const second = completeRouteLeg(first, 'route-2', 'caravan-2');
    expect(routeOf(second, 'route-2').manifest).toBeUndefined();
    expect(getIncomingQuantity(second.materialReservesByCiv![BUYER]!, IRON)).toBe(6);
  });

  it('delivers owned cargo when a route is cancelled after loading', () => {
    const loaded = completeRouteLeg(world(), 'route-1', 'caravan-1');
    const cancelled: GameState = {
      ...loaded,
      marketplace: {
        ...loaded.marketplace!,
        tradeRoutes: loaded.marketplace!.tradeRoutes.map(candidate =>
          candidate.id === 'route-1' ? { ...candidate, cancelPending: true } : candidate),
      },
    };
    const delivered = completeRouteLeg(cancelled, 'route-1', 'caravan-1');
    expect(delivered.marketplace!.tradeRoutes.some(candidate => candidate.id === 'route-1')).toBe(false);
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, IRON).imported).toBe(6);
  });

  it('keeps paid cargo returning when permission is revoked after loading', () => {
    const loaded = completeRouteLeg(world(), 'route-1', 'caravan-1');
    const revoked = removeRouteById(loaded, 'route-1', undefined, 'war-declared');
    expect(routeOf(revoked).manifest?.items[0]?.quantity).toBe(6);
    expect(routeOf(revoked).cancelPending).toBe(true);
    const delivered = completeRouteLeg(revoked, 'route-1', 'caravan-1');
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, IRON).imported).toBe(6);
  });

  it('destroys the claim when the carrier dies; the seller keeps the payment', () => {
    const loaded = completeRouteLeg(world(), 'route-1', 'caravan-1');
    const sellerGold = loaded.civilizations[SELLER]!.gold;
    const result = removeUnits(loaded, ['caravan-1'], { reason: 'destroyed' });
    expect(result.state.marketplace!.tradeRoutes).toHaveLength(0);
    expect(getReserveBalance(result.state.materialReservesByCiv![BUYER]!, IRON).imported).toBe(0);
    expect(getIncomingQuantity(result.state.materialReservesByCiv![BUYER]!, IRON)).toBe(0);
    expect(result.state.civilizations[SELLER]!.gold).toBe(sellerGold);
  });

  it('shares cargo capacity across mixed goods', () => {
    const mixed: TradeRoute['procurement'] = {
      orders: [
        { goodId: IRON, targetQuantity: 4, maxUnitPrice: 100 },
        { goodId: COAL, targetQuantity: 4, maxUnitPrice: 100 },
      ],
    };
    const loaded = completeRouteLeg(world({ orders: mixed }), 'route-1', 'caravan-1');
    const manifest = routeOf(loaded).manifest!;
    expect(manifest.items.map(item => [item.goodId, item.quantity])).toEqual([
      [IRON, 4],
      [COAL, 2],
    ]);
  });
});
