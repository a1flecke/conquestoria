import { describe, expect, it } from 'vitest';
import { migrateRetiredMarketAccess } from '@/storage/migrations/steps/retired-market-access';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import { completeRouteLeg } from '@/systems/trade-route-runner';
import {
  LUXURY_SERVICE_CAP_MULTIPLIER,
  getLuxuryCoverage,
  getLuxuryServiceCapacity,
  getLuxuryServiceCoverageTurns,
  getSupplierServiceContracts,
  grantLuxuryCoverage,
  isLuxuryCovered,
} from '@/systems/luxury-service-system';
import { getCivAvailableResources, getCivHappinessFromResources } from '@/systems/resource-acquisition-system';
import { quoteMarketLoad, refreshMarketOffers } from '@/systems/resource-market-offers';
import { getCityWorkedResourceEffects } from '@/systems/resource-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1511 MR14 — delivered luxury coverage, distinct-luxury happiness, and bounded supplier service.
 *
 * Native access is a separate concept from delivered coverage. A service bundle is bought and paid at
 * the supplier, becomes coverage only at home, and never doubles the same luxury's happiness.
 */

const SPICES = resourceGoodId('spices');
const SELLER = 'seller';
const BUYER = 'buyer';
const SELLER_CITY = 'seller-city';
const BUYER_CITY = 'buyer-city';

function city(id: string, owner: string, q: number, ownedTiles: { q: number; r: number }[] = [{ q, r: 0 }]): City {
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
    ownedTiles,
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

function tile(coord: { q: number; r: number }, resource: string | null, owner: string | null) {
  return {
    coord,
    terrain: resource ? 'jungle' : 'grassland',
    elevation: 'lowland',
    resource,
    improvement: resource ? 'plantation' : 'none',
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
    owner,
  };
}

function world(options: { buyerLuxuries?: string[]; serviceAllotments?: number; sources?: number } = {}): GameState {
  const sources = options.sources ?? 2;
  const sellerOwned = Array.from({ length: sources }, (_, index) => ({ q: 3, r: index }));
  const tiles: Record<string, unknown> = {
    '0,0': tile({ q: 0, r: 0 }, null, BUYER),
    '4,0': tile({ q: 4, r: 0 }, null, SELLER),
  };
  for (const coord of sellerOwned) tiles[`${coord.q},${coord.r}`] = tile(coord, 'spices', SELLER);
  const buyerOwned = [{ q: 0, r: 0 }];
  for (const resource of options.buyerLuxuries ?? []) {
    const coord = { q: 0, r: buyerOwned.length };
    tiles[`${coord.q},${coord.r}`] = tile(coord, resource, BUYER);
    buyerOwned.push(coord);
  }
  return {
    turn: 10,
    currentPlayer: BUYER,
    cities: {
      [SELLER_CITY]: city(SELLER_CITY, SELLER, 4, sellerOwned),
      [BUYER_CITY]: city(BUYER_CITY, BUYER, 0, buyerOwned),
    },
    civilizations: {
      [SELLER]: civ(SELLER, 100, ['cartography', 'trade-routes'], BUYER),
      [BUYER]: civ(BUYER, 1000, ['cartography', 'trade-routes'], SELLER),
    },
    units: {
      'caravan-1': {
        id: 'caravan-1', type: 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
        experience: 0, isResting: false, committedToRouteId: 'route-1', routeDirection: 'outbound',
      },
    },
    map: { width: 8, height: 4, tiles, wrapsHorizontally: false, rivers: [] },
    marketplace: {
      prices: {},
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [{
        id: 'route-1',
        fromCityId: BUYER_CITY,
        toCityId: SELLER_CITY,
        foreignCivId: SELLER,
        goldPerTrip: 10,
        turnsPerTrip: 1,
        procurement: { orders: [{ goodId: SPICES, targetQuantity: 1, maxUnitPrice: 100 }] },
      } as TradeRoute],
      purchasedResources: [],
    },
    commercePermissions: {
      resourceExportGrants: [],
      routeAllowances: [],
      resourcePolicies: [{
        civId: SELLER,
        goodId: SPICES,
        protectedReserve: 0,
        partnerCivIds: [BUYER],
        serviceAllotments: options.serviceAllotments ?? 1,
      }],
    },
    materialReservesByCiv: {
      [SELLER]: { balances: {}, reservations: [], incoming: [] },
      [BUYER]: { balances: {}, reservations: [], incoming: [] },
    },
    gameOver: false,
    winner: null,
  } as unknown as GameState;
}

function routeOf(state: GameState): TradeRoute {
  return state.marketplace!.tradeRoutes[0]!;
}

describe('#1511 MR14 — luxury service delivery', () => {
  it('activates coverage only at home and grants distinct-luxury happiness then', () => {
    const loaded = completeRouteLeg(world(), 'route-1', 'caravan-1');
    expect(routeOf(loaded).manifest?.items[0]).toMatchObject({ goodId: SPICES, serviceTurns: 4 });
    expect(getCivHappinessFromResources(loaded, BUYER)).toBe(0);
    expect(isLuxuryCovered(loaded, BUYER, SPICES)).toBe(false);

    const delivered = completeRouteLeg(loaded, 'route-1', 'caravan-1');
    expect(getLuxuryCoverage(delivered, BUYER, SPICES)?.expiresOnTurn).toBe(14);
    expect(getCivHappinessFromResources(delivered, BUYER)).toBe(1);
    expect(getCivAvailableResources(delivered, BUYER).has('spices')).toBe(true);
    // Delivered access is not a worked tile: the buyer gets no foreign-mine/plantation yield.
    expect(getCityWorkedResourceEffects(delivered.cities[BUYER_CITY]!, delivered.map, ['cartography']))
      .toEqual([]);
  });

  it('does not double happiness for two copies of the same luxury, but a distinct luxury adds one', () => {
    const delivered = completeRouteLeg(
      completeRouteLeg(world(), 'route-1', 'caravan-1'),
      'route-1',
      'caravan-1',
    );
    const twoSpiceSources = {
      ...delivered,
      cities: {
        ...delivered.cities,
        [BUYER_CITY]: {
          ...delivered.cities[BUYER_CITY]!,
          ownedTiles: [...delivered.cities[BUYER_CITY]!.ownedTiles, { q: 0, r: 2 }, { q: 0, r: 3 }],
        },
      },
      map: {
        ...delivered.map,
        tiles: {
          ...delivered.map.tiles,
          '0,2': tile({ q: 0, r: 2 }, 'spices', BUYER),
          '0,3': tile({ q: 0, r: 3 }, 'spices', BUYER),
        },
      },
    } as GameState;
    expect(getCivHappinessFromResources(twoSpiceSources, BUYER)).toBe(1);

    const withSilk = {
      ...twoSpiceSources,
      cities: {
        ...twoSpiceSources.cities,
        [BUYER_CITY]: {
          ...twoSpiceSources.cities[BUYER_CITY]!,
          ownedTiles: [...twoSpiceSources.cities[BUYER_CITY]!.ownedTiles, { q: 0, r: 4 }],
        },
      },
      map: {
        ...twoSpiceSources.map,
        tiles: { ...twoSpiceSources.map.tiles, '0,4': tile({ q: 0, r: 4 }, 'silk', BUYER) },
      },
      civilizations: {
        ...twoSpiceSources.civilizations,
        [BUYER]: {
          ...twoSpiceSources.civilizations[BUYER]!,
          techState: { ...twoSpiceSources.civilizations[BUYER]!.techState, completed: ['cartography', 'trade-routes', 'irrigation'] },
        },
      },
    } as GameState;
    expect(getCivHappinessFromResources(withSilk, BUYER)).toBe(2);
  });

  it('caps duplicate-supplier renewals and keeps delivered coverage through interruption', () => {
    const route = routeOf(world());
    const coverageTurns = getLuxuryServiceCoverageTurns(route);
    const capTurns = coverageTurns * LUXURY_SERVICE_CAP_MULTIPLIER;
    const first = grantLuxuryCoverage(world(), BUYER, SELLER, SPICES, coverageTurns, capTurns);
    expect(getLuxuryCoverage(first, BUYER, SPICES)?.expiresOnTurn).toBe(10 + coverageTurns);
    const renewed = grantLuxuryCoverage(
      { ...first, turn: 16 } as GameState,
      BUYER,
      'other-supplier',
      SPICES,
      coverageTurns,
      capTurns,
    );
    expect(getLuxuryCoverage(renewed, BUYER, SPICES)?.expiresOnTurn).toBe(16 + coverageTurns);
    expect(getLuxuryCoverage(renewed, BUYER, SPICES)!.expiresOnTurn).toBeLessThanOrEqual(16 + capTurns);
    expect(getCivHappinessFromResources(renewed, BUYER)).toBe(1);

    const interrupted = { ...first, turn: 11 } as GameState;
    expect(getCivHappinessFromResources(interrupted, BUYER)).toBe(1);
    const expired = { ...first, turn: 10 + coverageTurns + 1 } as GameState;
    expect(getCivHappinessFromResources(expired, BUYER)).toBe(0);
  });

  it('bounds supplier service by native sources and cannot double-book the last slot', () => {
    const twoSources = world({ sources: 2, serviceAllotments: 1 });
    expect(getLuxuryServiceCapacity(twoSources, SELLER, SPICES, twoSources.commercePermissions!.resourcePolicies![0]))
      .toBe(1);
    const loaded = completeRouteLeg(twoSources, 'route-1', 'caravan-1');
    const delivered = completeRouteLeg(loaded, 'route-1', 'caravan-1');
    expect(getSupplierServiceContracts(delivered, SELLER, SPICES)).toEqual([BUYER]);

    const oneSource = world({ sources: 1, serviceAllotments: 1 });
    expect(getLuxuryServiceCapacity(oneSource, SELLER, SPICES, oneSource.commercePermissions!.resourcePolicies![0]))
      .toBe(0);
  });

  it('stops renewals when the seller revokes the partner grant', () => {
    const state = world();
    state.commercePermissions!.resourcePolicies = [{
      ...state.commercePermissions!.resourcePolicies![0]!,
      partnerCivIds: [],
    }];
    const loaded = completeRouteLeg(state, 'route-1', 'caravan-1');
    expect(routeOf(loaded).manifest).toBeUndefined();
  });

  it('refuses a second buyer when the supplier has only one service slot, but renews the served buyer', () => {
    let state = grantLuxuryCoverage(world({ sources: 2, serviceAllotments: 1 }), BUYER, SELLER, SPICES, 4, 8);
    state = {
      ...state,
      civilizations: {
        ...state.civilizations,
        buyer2: civ('buyer2', 1000, ['cartography', 'trade-routes'], SELLER),
      },
      cities: {
        ...state.cities,
        'buyer2-city': city('buyer2-city', 'buyer2', 1),
      },
      commercePermissions: {
        ...state.commercePermissions!,
        resourcePolicies: [{
          civId: SELLER,
          goodId: SPICES,
          protectedReserve: 0,
          partnerCivIds: [BUYER, 'buyer2'],
          serviceAllotments: 1,
        }],
      },
    } as GameState;
    state = refreshMarketOffers(state);
    state = {
      ...state,
      commerceMarket: {
        ...state.commerceMarket!,
        serviceCursorByOffer: { 'seller:resource:spices': 1 },
      },
    } as GameState;
    expect(quoteMarketLoad(state, 'buyer2', SELLER, SPICES, 1)).toMatchObject({
      ok: false,
      reason: 'service-capacity',
    });
    const renewal = {
      ...state,
      commerceMarket: {
        ...state.commerceMarket!,
        serviceCursorByOffer: { 'seller:resource:spices': 0 },
      },
    } as GameState;
    expect(quoteMarketLoad(renewal, BUYER, SELLER, SPICES, 1)).toMatchObject({ ok: true });
  });

  it('consumes legacy purchased access once into coverage that still expires', () => {
    const state = world();
    state.marketplace!.purchasedResources = [{
      civId: BUYER,
      resource: 'spices',
      expiresOnTurn: 11,
    }];
    const migrated = migrateRetiredMarketAccess(state);
    expect(getLuxuryCoverage(migrated, BUYER, SPICES)).toEqual({
      goodId: SPICES,
      expiresOnTurn: 11,
      supplierCivIds: [],
    });
    expect(getCivHappinessFromResources(migrated, BUYER)).toBe(1);
    const after = { ...migrated, turn: 12 } as GameState;
    expect(getCivHappinessFromResources(after, BUYER)).toBe(0);
    expect(getLuxuryCoverage(after, BUYER, SPICES)?.expiresOnTurn).toBe(11);
  });

  it('keeps cattle and salt as commodity access with no happiness benefit', () => {
    const state = world({ buyerLuxuries: ['cattle', 'salt'] });
    expect(getCivHappinessFromResources(state, BUYER)).toBe(0);
  });
});
