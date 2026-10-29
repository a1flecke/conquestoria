import { describe, expect, it } from 'vitest';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import { completeRouteLeg } from '@/systems/trade-route-runner';
import { deliverRouteManifest } from '@/systems/resource-shipment-system';
import { getReserveBalance, getIncomingQuantity } from '@/systems/resource-reserve-system';
import {
  getEffectiveGoldPerTurn,
  getTradeRouteQuote,
  settleTradeRouteForCiv,
} from '@/systems/trade-route-economy';
import { getRouteCargoCapacity } from '@/systems/resource-procurement';
import { setMarketProcurementPolicy } from '@/systems/resource-market-offers';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import {
  DEFAULT_NATIVE_PER_SOURCE_PER_ROUND,
  DEFAULT_STORAGE_PER_GOOD,
  STANDARD_HARD_RECIPE_QUANTITY,
} from '@/systems/trade-good-definitions';
import { getFuelRunway } from '@/systems/resource-fuel-system';
import { getLuxuryServiceCoverageTurns } from '@/systems/luxury-service-system';

/**
 * #1515 MR18 — the section 8 acceptance matrix, end to end.
 *
 * These scenarios run the real load, travel, delivery, settlement and blockade paths. Each assertion
 * is a retained envelope from the calibrated profile, so a later data change that breaks pacing
 * fails here instead of only in a playtest.
 */

const IRON = resourceGoodId('iron');
const COAL = resourceGoodId('coal');
const SELLER = 'seller';
const SECOND_SELLER = 'seller-2';
const BUYER = 'buyer';
const SELLER_CITY = 'seller-city';
const SECOND_SELLER_CITY = 'seller-2-city';
const BUYER_CITY = 'buyer-city';

function city(id: string, owner: string, q: number, buildings: string[] = []): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 1,
    food: 0, production: 0, gold: 0, science: 0, buildings,
    productionQueue: [], productionProgress: 0, workedTiles: [], ownedTiles: [{ q, r: 0 }],
    focus: 'balanced', happiness: 0, health: 0,
  } as unknown as City;
}

function civ(id: string, gold: number, completed: string[], partners: string[]): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [], units: [],
    techState: { completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    gold, visibility: {}, knownCivilizations: partners, score: 0,
    diplomacy: {
      relationships: {}, treaties: partners.map(partner => ({
        type: 'trade_agreement' as const, civA: id, civB: partner, turnsRemaining: -1,
      })),
      events: [], atWarWith: [], treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
    },
  } as unknown as Civilization;
}

function route(id: string, fromCityId: string, toCityId: string, target = 10): TradeRoute {
  return {
    id, fromCityId, toCityId, goldPerTrip: 10, turnsPerTrip: 2,
    foreignCivId: toCityId === SELLER_CITY ? SELLER : SECOND_SELLER,
    procurement: { orders: [{ goodId: IRON, targetQuantity: target, maxUnitPrice: 100 }] },
  };
}

function world(options: {
  native?: number;
  buyerGold?: number;
  target?: number;
  secondRoute?: boolean;
  blockade?: boolean;
  unitType?: 'merchant_wagon' | 'freight_convoy' | 'naval_trader' | 'container_ship';
} = {}): GameState {
  const native = options.native ?? 30;
  const buyerGold = options.buyerGold ?? 1000;
  const target = options.target ?? 10;
  const routes = [route('route-1', BUYER_CITY, SELLER_CITY, target)];
  if (options.secondRoute) routes.push(route('route-2', BUYER_CITY, SECOND_SELLER_CITY, target));

  const cities: Record<string, City> = {
    [BUYER_CITY]: city(BUYER_CITY, BUYER, 0),
    [SELLER_CITY]: city(SELLER_CITY, SELLER, 4),
  };
  if (options.secondRoute) cities[SECOND_SELLER_CITY] = city(SECOND_SELLER_CITY, SECOND_SELLER, 5);

  const civs: Record<string, Civilization> = {
    [BUYER]: civ(BUYER, buyerGold, ['bronze-working', 'steam-power'], [SELLER, SECOND_SELLER]),
    [SELLER]: civ(SELLER, 100, ['bronze-working', 'steam-power'], [BUYER]),
    [SECOND_SELLER]: civ(SECOND_SELLER, 100, ['bronze-working', 'steam-power'], [BUYER]),
  };
  civs[BUYER]!.cities = [BUYER_CITY];
  civs[SELLER]!.cities = [SELLER_CITY];
  civs[SECOND_SELLER]!.cities = [SECOND_SELLER_CITY];

  const units: GameState['units'] = {
    'caravan-1': {
      id: 'caravan-1', type: options.unitType ?? 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
      health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
      experience: 0, isResting: false, committedToRouteId: 'route-1', routeDirection: 'outbound',
    },
  };
  civs[BUYER]!.units = ['caravan-1'];
  if (options.secondRoute) {
    units['caravan-2'] = {
      ...units['caravan-1']!, id: 'caravan-2', committedToRouteId: 'route-2',
    };
    civs[BUYER]!.units.push('caravan-2');
  }
  if (options.blockade) {
    units['raider-1'] = {
      id: 'raider-1', type: 'destroyer', owner: 'raider', position: { q: 3, r: 0 },
      health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false, experience: 0, isResting: false,
    };
    units['raider-2'] = {
      ...units['raider-1']!, id: 'raider-2', position: { q: 3, r: 1 },
    };
    civs.raider = { ...civ('raider', 100, [], []), diplomacy: {
      ...civ('raider', 100, [], []).diplomacy, atWarWith: [SELLER],
    } };
  }

  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 8; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: options.blockade && q === 3 ? 'ocean' : 'grassland',
      elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: null,
    };
  }
  if (options.blockade) {
    tiles['3,1'] = { ...(tiles['3,0'] as Record<string, unknown>), coord: { q: 3, r: 1 }, terrain: 'ocean' };
    tiles['3,0'] = { ...(tiles['3,0'] as Record<string, unknown>), terrain: 'ocean' };
  }

  const policies = [SELLER, SECOND_SELLER].map(seller => ({
    civId: seller, goodId: IRON, protectedReserve: 0, partnerCivIds: [BUYER],
  }));
  const balances = () => ({
    balances: { [IRON]: { native, imported: 0 } }, reservations: [], incoming: [],
  });
  return {
    turn: 10,
    currentPlayer: BUYER,
    cities,
    civilizations: civs,
    units,
    map: { width: 8, height: 4, tiles, wrapsHorizontally: false, rivers: [] },
    marketplace: {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
      tradeRoutes: routes, purchasedResources: [],
    },
    commercePermissions: { resourceExportGrants: [], routeAllowances: [], resourcePolicies: policies },
    materialReservesByCiv: {
      [SELLER]: balances(),
      [SECOND_SELLER]: balances(),
      [BUYER]: { balances: {}, reservations: [], incoming: [] },
      ...(options.blockade ? { raider: { balances: {}, reservations: [], incoming: [] } } : {}),
    },
    gameOver: false, winner: null,
  } as unknown as GameState;
}

function routeOf(state: GameState, id = 'route-1'): TradeRoute {
  return state.marketplace!.tradeRoutes.find(candidate => candidate.id === id)!;
}

function imported(state: GameState, civId = BUYER): number {
  return getReserveBalance(state.materialReservesByCiv![civId]!, IRON).imported;
}

/** One completed round: validated travel progress, settlement, then the leg boundary. */
function round(state: GameState, caravanId = 'caravan-1', routeId = 'route-1'): {
  state: GameState;
  paid: number;
  promised: number;
} {
  const nextTurn = state.turn + 1;
  const route = routeOf(state, routeId);
  const caravan = state.units[caravanId]!;
  // Model the movement that makes progress real: outbound arrives at the supplier, inbound at home.
  const arrival = (caravan.routeDirection ?? 'outbound') === 'outbound'
    ? state.cities[route.toCityId]!.position
    : state.cities[route.fromCityId]!.position;
  const progressed: GameState = {
    ...state,
    turn: nextTurn,
    units: { ...state.units, [caravanId]: { ...caravan, position: arrival } },
    marketplace: {
      ...state.marketplace!,
      tradeRoutes: state.marketplace!.tradeRoutes.map(candidate =>
        candidate.id === routeId ? { ...candidate, lastProgressTurn: nextTurn } : candidate),
    },
  };
  const promised = getEffectiveGoldPerTurn(routeOf(progressed, routeId));
  const settled = settleTradeRouteForCiv(progressed, BUYER);
  return {
    state: completeRouteLeg(settled.state, routeId, caravanId),
    paid: settled.paid,
    promised,
  };
}

describe('#1515 MR18 — commerce acceptance matrix', () => {
  it('a healthy route needs no input for five round trips, pauses at target, and keeps earning', () => {
    let state = world();
    let paid = 0;
    let promised = 0;
    let loaded = 0;
    for (let trip = 0; trip < 5; trip++) {
      const first = round(state);
      state = first.state;
      paid += first.paid;
      promised += first.promised;
      loaded += routeOf(state).manifest?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0;
      // The manifest is delivered on the next round, before the next load.
      const second = round(state);
      state = second.state;
      paid += second.paid;
      promised += second.promised;
      expect(routeOf(state).manifest).toBeUndefined();
    }

    // One 10-unit recipe arrived exactly once; later trips bought nothing but still earned.
    expect(imported(state)).toBe(10);
    expect(getIncomingQuantity(state.materialReservesByCiv![BUYER]!, IRON)).toBe(0);
    expect(state.civilizations[SELLER]!.gold).toBe(160);
    // Every round paid exactly the terms shown before settlement, including the refreshed quote.
    expect(paid).toBe(promised);
    // Replaying the arrival cannot credit the goods twice.
    const replayed = deliverRouteManifest(state, 'route-1').state;
    expect(imported(replayed)).toBe(10);
    expect(loaded).toBe(10);
  });

  it('an operating quote predicts the exact ordinary payment for the round', () => {
    const state = world();
    const promised = getEffectiveGoldPerTurn(routeOf(state));
    const settled = settleTradeRouteForCiv({
      ...state,
      marketplace: {
        ...state.marketplace!,
        tradeRoutes: [{ ...routeOf(state), lastProgressTurn: state.turn }],
      },
    }, BUYER);
    expect(settled.paid).toBe(promised);
    expect(settled.reasons).toEqual([]);
  });

  it('an interruption stops income and loading, and announces once', () => {
    const events: string[] = [];
    const bus = { emit: (name: string) => { events.push(name); } } as never;
    const state = world({ blockade: true });

    const first = settleTradeRouteForCiv({
      ...state,
      marketplace: {
        ...state.marketplace!,
        tradeRoutes: [{ ...routeOf(state), lastProgressTurn: state.turn }],
      },
    }, BUYER, bus);
    expect(first.paid).toBe(0);
    expect(first.reasons).toContain('blockaded');
    expect(events.filter(name => name === 'trade:route-interrupted')).toHaveLength(1);

    const blockedLoad = completeRouteLeg(first.state, 'route-1', 'caravan-1');
    expect(routeOf(blockedLoad).manifest).toBeUndefined();
    expect(imported(blockedLoad)).toBe(0);

    const repeat = settleTradeRouteForCiv({
      ...blockedLoad,
      turn: blockedLoad.turn + 1,
      marketplace: {
        ...blockedLoad.marketplace!,
        tradeRoutes: blockedLoad.marketplace!.tradeRoutes.map(candidate =>
          ({ ...candidate, lastProgressTurn: blockedLoad.turn + 1 })),
      },
    }, BUYER, bus);
    expect(repeat.paid).toBe(0);
    expect(events.filter(name => name === 'trade:route-interrupted')).toHaveLength(1);
  });

  it('reserves give a visible response window before a fuel shortage', () => {
    const state = world();
    state.cities[BUYER_CITY]!.buildings = ['factory'];
    (state.materialReservesByCiv![BUYER]!.balances as Record<string, unknown>)[COAL] = { native: 10, imported: 0 };
    const runway = getFuelRunway(state, BUYER, COAL);
    expect(runway.demandPerRound).toBe(1);
    expect(runway.runwayRounds).toBeGreaterThanOrEqual(5);
    expect(runway.status).toBe('funded');
    // The calibrated profile is the shared data, not a local constant in this test.
    expect(DEFAULT_STORAGE_PER_GOOD).toBe(40);
    expect(DEFAULT_NATIVE_PER_SOURCE_PER_ROUND).toBe(2);
    expect(STANDARD_HARD_RECIPE_QUANTITY).toBe(10);
  });

  it('a standard recipe costs a bounded number of route-turns at the abundant band', () => {
    const state = world();
    const quote = getTradeRouteQuote(state, {
      caravanUnitId: 'caravan-1', originCityId: BUYER_CITY, toCityId: SELLER_CITY,
    })!;
    expect(quote.goldPerTurn).toBe(4);
    // 10 iron at the abundant band (6/unit) is 60 gold; the route earns 4 a turn.
    const recipeGold = 10 * 6;
    const routeTurns = recipeGold / quote.goldPerTurn;
    expect(routeTurns).toBeGreaterThanOrEqual(10);
    expect(routeTurns).toBeLessThanOrEqual(25);
  });

  it('two routes share one round budget instead of each spending it', () => {
    let state = world({ secondRoute: true, native: 30 });
    state = setMarketProcurementPolicy(state, BUYER, {
      maxUnitPrice: 100, treasuryFloor: 0, roundBudget: 40,
    });
    const goldBefore = state.civilizations[BUYER]!.gold;
    const firstLoad = completeRouteLeg(state, 'route-1', 'caravan-1');
    const secondLoad = completeRouteLeg(firstLoad, 'route-2', 'caravan-2');
    const spent = goldBefore - secondLoad.civilizations[BUYER]!.gold;
    expect(spent).toBeLessThanOrEqual(40);
    expect(routeOf(secondLoad, 'route-1').manifest?.items[0]?.quantity).toBe(6);
    expect(routeOf(secondLoad, 'route-2').manifest).toBeUndefined();
  });

  it('a longer route trades more gold per turn for less cargo throughput', () => {
    const near = world();
    const nearQuote = getTradeRouteQuote(near, {
      caravanUnitId: 'caravan-1', originCityId: BUYER_CITY, toCityId: SELLER_CITY,
    })!;
    const far = world();
    far.cities[SELLER_CITY]!.position = { q: 7, r: 0 };
    const farQuote = getTradeRouteQuote(far, {
      caravanUnitId: 'caravan-1', originCityId: BUYER_CITY, toCityId: SELLER_CITY,
    })!;
    expect(farQuote.goldPerTurn).toBeGreaterThan(nearQuote.goldPerTurn);
    expect(farQuote.roundTripRounds).toBeGreaterThan(nearQuote.roundTripRounds);
    const nearCargoPerTurn = getRouteCargoCapacity('merchant_wagon') / nearQuote.roundTripRounds;
    const farCargoPerTurn = getRouteCargoCapacity('merchant_wagon') / farQuote.roundTripRounds;
    expect(farCargoPerTurn).toBeLessThan(nearCargoPerTurn);
  });

  it('cargo throughput follows the hull catalog instead of a fixed constant', () => {
    expect(getRouteCargoCapacity('merchant_wagon')).toBe(6);
    expect(getRouteCargoCapacity('naval_trader')).toBe(5);
    expect(getRouteCargoCapacity('freight_convoy')).toBe(10);
    expect(getRouteCargoCapacity('container_ship')).toBe(16);

    const state = world({ unitType: 'freight_convoy', native: 30 });
    const loaded = completeRouteLeg(state, 'route-1', 'caravan-1');
    expect(routeOf(loaded).manifest?.items[0]?.quantity).toBe(10);
    expect(getLuxuryServiceCoverageTurns({ turnsPerTrip: 2 })).toBe(6);
  });
});
