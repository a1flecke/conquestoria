import { describe, expect, it } from 'vitest';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import {
  applyAIExportPolicies,
  getAIReserveTargets,
  getAITradeDestination,
  getAITradeRouteDemand,
  getAITradeSuppliers,
} from '@/ai/ai-trade-strategy';
import { refreshMarketOffers, setCommerceResourcePolicy } from '@/systems/resource-market-offers';
import { resourceGoodId } from '@/systems/trade-good-definitions';

const IRON = resourceGoodId('iron');
const COAL = resourceGoodId('coal');
const AI = 'ai';
const S1 = 'seller-1';
const S2 = 'seller-2';
const THREAT = 'threat';

function city(id: string, owner: string, q: number, buildings: string[] = []): City {
  return {
    id, name: id, owner, position: { q, r: 0 }, population: 1,
    food: 0, production: 0, gold: 0, science: 0, buildings,
    productionQueue: [], productionProgress: 0, workedTiles: [], ownedTiles: [{ q, r: 0 }],
    focus: 'balanced', happiness: 0, health: 0, maturity: 'town',
    unrestLevel: 0, unrestTurns: 0, spyUnrestBonus: 0,
  } as unknown as City;
}

function civ(id: string, gold: number, completed: string[], partners: string[]): Civilization {
  return {
    id, name: id, color: '#fff', isHuman: false, civType: 'generic',
    cities: [`${id}-city`], units: [], techState: {
      completed, currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {},
    }, gold, visibility: {}, knownCivilizations: partners, score: 0,
    diplomacy: {
      relationships: {}, treaties: partners.map(partner => ({
        type: 'trade_agreement' as const, civA: id, civB: partner, turnsRemaining: -1,
      })), events: [], atWarWith: [], treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
    },
  } as unknown as Civilization;
}

function world(options: { war?: boolean; offers?: boolean } = {}): GameState {
  const cities: Record<string, City> = {
    [`${AI}-city`]: city(`${AI}-city`, AI, 0, ['factory']),
    [`${S1}-city`]: city(`${S1}-city`, S1, 2),
    [`${S2}-city`]: city(`${S2}-city`, S2, 4),
    [`${THREAT}-city`]: city(`${THREAT}-city`, THREAT, 6),
  };
  cities[`${AI}-city`]!.productionQueue = ['steel_mill'];
  const civs: Record<string, Civilization> = {
    [AI]: { ...civ(AI, 500, ['bronze-working', 'steel-production', 'steam-power'], [S1, S2, THREAT]), units: ['trader'] },
    [S1]: civ(S1, 100, ['bronze-working'], [AI]),
    [S2]: civ(S2, 100, ['bronze-working'], [AI]),
    [THREAT]: civ(THREAT, 100, ['bronze-working'], [AI]),
  };
  if (options.war) civs[S1]!.diplomacy.atWarWith = [AI];
  const tiles: Record<string, unknown> = {};
  for (let q = 0; q < 8; q++) {
    tiles[`${q},0`] = {
      coord: { q, r: 0 }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
    };
  }
  for (const c of Object.values(cities)) {
    tiles[`${c.position.q},${c.position.r}`] = {
      ...(tiles[`${c.position.q},0`] as Record<string, unknown>),
      coord: c.position,
      owner: c.owner,
    };
  }
  for (const c of Object.values(cities)) {
    civs[c.owner]!.visibility = {
      tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, 'fog'])),
    };
  }
  const policies = options.offers === false ? [] : [S1, S2].map(seller => ({
    civId: seller,
    goodId: IRON,
    protectedReserve: 0,
    partnerCivIds: [AI],
  }));
  return {
    turn: 10, currentPlayer: AI, cities, civilizations: civs,
    units: {
      trader: {
        id: 'trader', type: 'merchant_wagon', owner: AI, position: { q: 0, r: 0 },
        health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false,
        experience: 0, isResting: false,
      },
    },
    map: { width: 8, height: 3, tiles, wrapsHorizontally: false, rivers: [] },
    marketplace: { prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0, tradeRoutes: [], purchasedResources: [] },
    commercePermissions: { resourceExportGrants: [], routeAllowances: [], resourcePolicies: policies },
    materialReservesByCiv: {
      [AI]: { balances: {}, reservations: [], incoming: [] },
      [S1]: { balances: { [IRON]: { native: 30, imported: 0 } }, reservations: [], incoming: [] },
      [S2]: { balances: { [IRON]: { native: 30, imported: 0 } }, reservations: [], incoming: [] },
      [THREAT]: { balances: {}, reservations: [], incoming: [] },
    },
    gameOver: false, winner: null,
  } as unknown as GameState;
}

describe('#1514 MR17 — strategic AI trade', () => {
  it('derives reserve targets from the active recipe and fuel demand', () => {
    const targets = getAIReserveTargets(world(), AI);
    expect(targets[IRON]).toBe(10);
    expect(targets[COAL]).toBe(3);
  });

  it('ranks only known offers and finds an actual alternative supplier', () => {
    const state = refreshMarketOffers(world());
    const candidates = getAITradeSuppliers(state, AI, IRON, 'trader');
    expect(candidates.map(candidate => candidate.supplierCivId)).toEqual([S1, S2]);
    expect(getAITradeDestination(state, AI, 'trader')).toBe(`${S1}-city`);
  });

  it('buys nothing when there is no visible offer', () => {
    const state = refreshMarketOffers(world({ offers: false }));
    expect(getAITradeSuppliers(state, AI, IRON, 'trader')).toEqual([]);
    expect(getAITradeDestination(state, AI, 'trader')).toBeNull();
  });

  it('withholds a threatened supplier through the actual permission rule', () => {
    const state = refreshMarketOffers(world({ war: true }));
    expect(getAITradeSuppliers(state, AI, IRON, 'trader').map(candidate => candidate.supplierCivId))
      .not.toContain(S1);
  });

  it('bounds new route demand and export policies to permitted partners', () => {
    const state = world();
    expect(getAITradeRouteDemand(state, AI)).toBe(1);
    const withRoute: GameState = {
      ...state,
      marketplace: {
        ...state.marketplace!,
        tradeRoutes: [{
          id: 'r1', fromCityId: `${AI}-city`, toCityId: `${S1}-city`,
          goldPerTrip: 1, turnsPerTrip: 1,
          procurement: { orders: [{ goodId: IRON, targetQuantity: 10, maxUnitPrice: 20 }] },
        } as TradeRoute],
      },
    };
    expect(getAITradeRouteDemand(withRoute, AI)).toBe(0);

    const exported = applyAIExportPolicies(state, S1);
    const policy = exported.commercePermissions!.resourcePolicies!.find(candidate =>
      candidate.civId === S1 && candidate.goodId === IRON)!;
    expect(policy.partnerCivIds).toContain(AI);
    expect(policy.protectedReserve).toBeGreaterThanOrEqual(0);
  });

  it('preserves an existing tariff and service allotment when rewriting the export policy', () => {
    const state = world();
    const withTariff = setCommerceResourcePolicy(state, {
      civId: S1,
      goodId: IRON,
      protectedReserve: 0,
      partnerCivIds: [AI],
      tariffPerUnit: 2,
      tariffRecipientCivId: S1,
      serviceAllotments: 1,
    });
    const exported = applyAIExportPolicies(withTariff, S1);
    const policy = exported.commercePermissions!.resourcePolicies!.find(candidate =>
      candidate.civId === S1 && candidate.goodId === IRON)!;
    expect(policy.tariffPerUnit).toBe(2);
    expect(policy.tariffRecipientCivId).toBe(S1);
    expect(policy.serviceAllotments).toBe(1);
  });

  it('clears stale partner grants when every partner is no longer permitted', () => {
    const state = world({ war: true });
    const exported = applyAIExportPolicies(state, S1);
    const policy = exported.commercePermissions!.resourcePolicies!.find(candidate =>
      candidate.civId === S1 && candidate.goodId === IRON)!;
    expect(policy.partnerCivIds).toEqual([]);
  });
});
