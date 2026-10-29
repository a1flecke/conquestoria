import { describe, expect, it } from 'vitest';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import type { TradeGoodDefinition } from '@/systems/trade-good-definitions';
import { completeRouteLeg } from '@/systems/trade-route-runner';
import { getReserveBalance, getIncomingQuantity } from '@/systems/resource-reserve-system';
import { deliverRouteManifest } from '@/systems/resource-shipment-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { settleTradeRouteForCiv } from '@/systems/trade-route-economy';
import { getMarketOffersForBuyer, quoteMarketLoad, refreshMarketOffers } from '@/systems/resource-market-offers';
import { validateTradeGoodDefinitions } from '@/systems/trade-good-definitions';

/**
 * #1515 MR18 — the extension contract, end to end.
 *
 * The same offer → quote → permitted load → travel → delivery / cancellation / loss / save pipeline
 * must run for a new resource-backed good, a non-deposit producer good and any trade hull without a
 * new ID branch in commerce code. These fixtures are test data only; no shipped catalog changes.
 */

const COPPER_BARS: TradeGoodDefinition = {
  id: 'fixture:copper-bars',
  name: 'Copper Bars',
  nativeSource: { kind: 'resource', resource: 'copper' },
  settlement: 'stored-quantity',
  uses: ['material'],
  basePrice: 9,
  cargoSpacePerUnit: 2,
  quantity: { standardRecipeQuantity: 10, storageCapacity: 40, nativePerSourcePerRound: 2 },
};

const TOOLS: TradeGoodDefinition = {
  id: 'fixture:tools',
  name: 'Tools',
  nativeSource: { kind: 'producer', producerId: 'test:toolworks' },
  settlement: 'stored-quantity',
  uses: ['material'],
  basePrice: 12,
  cargoSpacePerUnit: 1,
  quantity: { standardRecipeQuantity: 10, storageCapacity: 40, nativePerSourcePerRound: 2 },
};

const DEFINITIONS = [COPPER_BARS, TOOLS];
const SELLER = 'seller';
const BUYER = 'buyer';
const SELLER_CITY = 'seller-city';
const BUYER_CITY = 'buyer-city';

function city(id: string, owner: string, q: number): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 1,
    food: 0, production: 0, gold: 0, science: 0, buildings: [],
    productionQueue: [], productionProgress: 0, workedTiles: [], ownedTiles: [{ q, r: 0 }],
    focus: 'balanced', happiness: 0, health: 0,
  } as unknown as City;
}

function civ(id: string, partner: string): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [], units: [],
    techState: { completed: ['stone-weapons'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    gold: 500, visibility: {}, knownCivilizations: [partner], score: 0,
    diplomacy: {
      relationships: {},
      treaties: [{ type: 'trade_agreement', civA: id, civB: partner, turnsRemaining: -1 }],
      events: [], atWarWith: [], treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
    },
  } as unknown as Civilization;
}

function world(goodId: TradeGoodDefinition['id'], options: {
  native?: number;
  unitType?: 'merchant_wagon' | 'freight_convoy';
  cancelPending?: boolean;
} = {}): GameState {
  const routes: TradeRoute[] = [{
    id: 'route-1', fromCityId: BUYER_CITY, toCityId: SELLER_CITY,
    goldPerTrip: 10, turnsPerTrip: 2, foreignCivId: SELLER,
    ...(options.cancelPending ? { cancelPending: true } : {}),
    procurement: { orders: [{ goodId, targetQuantity: 10, maxUnitPrice: 100 }] },
  }];
  const buyer = civ(BUYER, SELLER);
  buyer.cities = [BUYER_CITY];
  buyer.units = ['caravan-1'];
  const seller = civ(SELLER, BUYER);
  seller.cities = [SELLER_CITY];
  return {
    turn: 10,
    currentPlayer: BUYER,
    cities: { [BUYER_CITY]: city(BUYER_CITY, BUYER, 0), [SELLER_CITY]: city(SELLER_CITY, SELLER, 4) },
    civilizations: { [BUYER]: buyer, [SELLER]: seller },
    units: {
      'caravan-1': {
        id: 'caravan-1', type: options.unitType ?? 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
        experience: 0, isResting: false, committedToRouteId: 'route-1', routeDirection: 'outbound',
      },
    },
    map: { width: 8, height: 3, tiles: {}, wrapsHorizontally: false, rivers: [] },
    marketplace: {
      prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
      tradeRoutes: routes, purchasedResources: [],
    },
    commercePermissions: {
      resourceExportGrants: [], routeAllowances: [],
      resourcePolicies: [{ civId: SELLER, goodId, protectedReserve: 0, partnerCivIds: [BUYER] }],
    },
    materialReservesByCiv: {
      [SELLER]: {
        balances: { [goodId]: { native: options.native ?? 30, imported: 0 } },
        reservations: [], incoming: [],
      },
      [BUYER]: { balances: {}, reservations: [], incoming: [] },
    },
    gameOver: false, winner: null,
  } as unknown as GameState;
}

function imported(state: GameState, goodId: TradeGoodDefinition['id']): number {
  return getReserveBalance(state.materialReservesByCiv![BUYER]!, goodId).imported;
}

/** The canonical leg transition with the fixture catalog threaded through, never an ID branch. */
function leg(state: GameState): GameState {
  return completeRouteLeg(state, 'route-1', 'caravan-1', undefined, DEFINITIONS);
}

describe('#1515 MR18 — commerce extension contract', () => {
  it('validates both fixture definitions without touching the shipped catalog', () => {
    const errors = validateTradeGoodDefinitions(DEFINITIONS, {
      knownResources: new Set(['copper']),
      knownProducers: new Set(['test:toolworks']),
    });
    expect(errors).toEqual([]);
  });

  it('runs a new resource-backed good through offer, quote, load and delivery', () => {
    let state = refreshMarketOffers(world(COPPER_BARS.id), DEFINITIONS);
    const offers = getMarketOffersForBuyer(state, BUYER, DEFINITIONS);
    expect(offers.map(offer => offer.goodId)).toContain(COPPER_BARS.id);
    const offer = offers.find(candidate => candidate.goodId === COPPER_BARS.id)!;
    expect(offer.available).toBe(30);

    const quote = quoteMarketLoad(state, BUYER, SELLER, COPPER_BARS.id, 3, DEFINITIONS);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.quote.unitPrice).toBe(Math.round(COPPER_BARS.basePrice * 0.8));

    state = leg(state);
    const manifest = state.marketplace!.tradeRoutes[0]!.manifest!;
    // 6 cargo space / 2 per unit = 3 units, proving cargoSpacePerUnit is honored generically.
    expect(manifest.items[0]).toMatchObject({ goodId: COPPER_BARS.id, quantity: 3 });
    expect(imported(state, COPPER_BARS.id)).toBe(0);

    state = leg(state);
    expect(imported(state, COPPER_BARS.id)).toBe(3);
    expect(getIncomingQuantity(state.materialReservesByCiv![BUYER]!, COPPER_BARS.id)).toBe(0);
  });

  it('runs a non-deposit producer good through the same pipeline', () => {
    let state = refreshMarketOffers(world(TOOLS.id), DEFINITIONS);
    const offer = getMarketOffersForBuyer(state, BUYER, DEFINITIONS).find(candidate => candidate.goodId === TOOLS.id);
    expect(offer).toBeDefined();
    expect(quoteMarketLoad(state, BUYER, SELLER, TOOLS.id, 2, DEFINITIONS).ok).toBe(true);

    state = leg(state);
    expect(state.marketplace!.tradeRoutes[0]!.manifest!.items[0]).toMatchObject({ goodId: TOOLS.id, quantity: 6 });
    state = leg(state);
    expect(imported(state, TOOLS.id)).toBe(6);
  });

  it('uses the same cargo rule for a larger hull without naming its ID', () => {
    const state = leg(world(TOOLS.id, { unitType: 'freight_convoy' }));
    expect(state.marketplace!.tradeRoutes[0]!.manifest!.items[0]?.quantity).toBe(10);
  });

  it('delivers owned cargo once when a cancellation returns home', () => {
    let state = world(TOOLS.id, { cancelPending: true });
    state = leg(state);
    expect(state.marketplace!.tradeRoutes[0]!.manifest!.items[0]?.quantity).toBe(6);
    state = leg(state);
    expect(imported(state, TOOLS.id)).toBe(6);
    expect(state.marketplace!.tradeRoutes).toHaveLength(0);
    // The trader survives the cancellation and is free to be reassigned.
    expect(state.units['caravan-1']!.committedToRouteId).toBeUndefined();
  });

  it('destroys the fixture manifest with the carrier and releases the claim', () => {
    let state = leg(world(TOOLS.id));
    expect(getIncomingQuantity(state.materialReservesByCiv![BUYER]!, TOOLS.id)).toBe(6);
    state = removeUnits(state, ['caravan-1'], { reason: 'destroyed' }).state;
    expect(imported(state, TOOLS.id)).toBe(0);
    expect(getIncomingQuantity(state.materialReservesByCiv![BUYER]!, TOOLS.id)).toBe(0);
    expect(state.marketplace!.tradeRoutes).toHaveLength(0);
  });

  it('continues a fixture shipment deterministically across a save/load', () => {
    const loaded = leg(world(COPPER_BARS.id));
    const reloaded = JSON.parse(JSON.stringify(loaded)) as GameState;
    const delivered = leg(reloaded);
    expect(imported(delivered, COPPER_BARS.id)).toBe(3);
    // A second delivery attempt after reload cannot credit the goods again.
    expect(imported(deliverRouteManifest(delivered, 'route-1').state, COPPER_BARS.id)).toBe(3);
  });

  it('applies the existing danger adapter to a fixture route without a new branch', () => {
    const state = world(TOOLS.id);
    state.cities[SELLER_CITY]!.position = { q: 4, r: 0 };
    const map = state.map!;
    const tiles: Record<string, unknown> = {};
    for (let q = 0; q < 8; q++) {
      tiles[`${q},0`] = {
        coord: { q, r: 0 }, terrain: q === 3 ? 'ocean' : 'grassland', elevation: 'lowland',
        resource: null, improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
      };
    }
    tiles['3,1'] = { ...(tiles['3,0'] as Record<string, unknown>), coord: { q: 3, r: 1 } };
    state.map = { ...map, tiles: tiles as never };
    state.units['raider-1'] = {
      id: 'raider-1', type: 'destroyer', owner: 'raider', position: { q: 3, r: 0 },
      health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false, experience: 0, isResting: false,
    };
    state.units['raider-2'] = { ...state.units['raider-1']!, id: 'raider-2', position: { q: 3, r: 1 } };
    state.civilizations.raider = {
      ...civ('raider', SELLER),
      diplomacy: { ...civ('raider', SELLER).diplomacy, atWarWith: [SELLER] },
    };
    const blocked = settleTradeRouteForCiv({
      ...state,
      marketplace: {
        ...state.marketplace!,
        tradeRoutes: [{ ...state.marketplace!.tradeRoutes[0]!, lastProgressTurn: state.turn }],
      },
    }, BUYER);
    expect(blocked.paid).toBe(0);
    expect(blocked.reasons).toContain('blockaded');
    expect(leg(blocked.state).marketplace!.tradeRoutes[0]!.manifest).toBeUndefined();
  });
});
