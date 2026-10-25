import { describe, expect, it } from 'vitest';
import type { City, Civilization, GameState } from '@/core/types';
import type {
  CommerceMarketState,
  CommerceResourcePolicy,
  ReserveLedger,
} from '@/core/types/commerce';
import {
  MARKET_PRICE_BANDS,
  commitMarketLoad,
  getEligibleMarketBuyers,
  getExportableSurplus,
  getMarketOffersForBuyer,
  quoteMarketLoad,
  refreshMarketOffers,
  setCommerceResourcePolicy,
} from '@/systems/resource-market-offers';
import { resourceGoodId, type TradeGoodDefinition } from '@/systems/trade-good-definitions';
import { getReserveBalance, getStoredQuantity } from '@/systems/resource-reserve-system';
import { getInstantResourcePurchaseNotice, getResourceAccessCost } from '@/systems/resource-acquisition-system';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * #1508 MR11 — the posted-price resource market.
 *
 * The golden fixture is deliberate: native 30, committed 10, protected reserve 12 leaves 8
 * exportable. Imported stock can never raise that number, and a stale/over-cap quote never moves a
 * balance.
 */

const COAL = resourceGoodId('coal');
const SELLER = 'seller';
const ALPHA = 'alpha';
const ZETA = 'zeta';
const TREASURY = 'treasury';

function city(id: string, owner: string): City {
  return {
    id,
    name: id,
    owner,
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    production: 0,
    gold: 0,
    science: 0,
    buildings: [],
    productionQueue: [],
    productionProgress: 0,
    workedTiles: [],
    ownedTiles: [{ q: 0, r: 0 }],
    focus: 'balanced',
    happiness: 0,
    health: 0,
  } as unknown as City;
}

function civ(id: string, gold: number, completed: string[], partners: string[] = []): Civilization {
  return {
    id,
    name: id,
    color: '#fff',
    isHuman: false,
    civType: 'generic',
    cities: [`${id}-city`],
    units: [],
    techState: {
      completed,
      currentResearch: null,
      researchQueue: [],
      researchProgress: 0,
      trackPriorities: {},
    },
    gold,
    visibility: {},
    knownCivilizations: partners,
    score: 0,
    diplomacy: {
      relationships: {},
      treaties: partners.map(partner => ({
        type: 'trade_agreement' as const,
        civA: id,
        civB: partner,
        turnsRemaining: -1,
      })),
      events: [],
      atWarWith: [],
      treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
    },
  } as unknown as Civilization;
}

function ledger(native: number, committed: number, imported = 0): ReserveLedger {
  return {
    balances: { [COAL]: { native, imported } },
    reservations: committed > 0
      ? [{
        id: 'active-commitment',
        goodId: COAL,
        ownerCivId: SELLER,
        amount: committed,
        reason: 'active-production',
        allocation: { native: committed, imported: 0 },
        consumer: { ownerCivId: SELLER, cityId: `${SELLER}-city`, occurrence: 1, itemId: 'factory' },
      }]
      : [],
    incoming: [],
  };
}

interface WorldOptions {
  native?: number;
  imported?: number;
  committed?: number;
  reserve?: number;
  partners?: string[];
  buyerTech?: boolean;
  buyerGold?: number;
  tariffPerUnit?: number;
  tariffRecipientCivId?: string;
  worldPrice?: number;
  extraSupplier?: boolean;
}

function world(options: WorldOptions = {}): GameState {
  const {
    native = 30,
    imported = 0,
    committed = 10,
    reserve = 12,
    partners = [ALPHA],
    buyerTech = true,
    buyerGold = 1000,
    tariffPerUnit = 0,
    tariffRecipientCivId,
    worldPrice = 999,
    extraSupplier = false,
  } = options;
  const policy: CommerceResourcePolicy = {
    civId: SELLER,
    goodId: COAL,
    protectedReserve: reserve,
    partnerCivIds: partners,
    ...(tariffPerUnit > 0 ? { tariffPerUnit, tariffRecipientCivId } : {}),
  };
  const cities: Record<string, City> = {
    [`${SELLER}-city`]: city(`${SELLER}-city`, SELLER),
    [`${ALPHA}-city`]: city(`${ALPHA}-city`, ALPHA),
    [`${ZETA}-city`]: city(`${ZETA}-city`, ZETA),
    [`${TREASURY}-city`]: city(`${TREASURY}-city`, TREASURY),
  };
  const civs: Record<string, Civilization> = {
    [SELLER]: civ(SELLER, 100, ['steam-power'], [ALPHA, ZETA]),
    [ALPHA]: civ(ALPHA, buyerGold, buyerTech ? ['steam-power'] : [], [SELLER]),
    [ZETA]: civ(ZETA, buyerGold, buyerTech ? ['steam-power'] : [], [SELLER]),
    [TREASURY]: civ(TREASURY, 0, [], []),
  };
  const policies: CommerceResourcePolicy[] = [policy];
  if (extraSupplier) {
    policies.push({
      civId: ZETA,
      goodId: COAL,
      protectedReserve: 0,
      partnerCivIds: [ALPHA],
    });
  }
  return {
    turn: 10,
    currentPlayer: SELLER,
    cities,
    civilizations: civs,
    units: {},
    map: { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] },
    marketplace: {
      prices: { [COAL]: worldPrice, coal: worldPrice },
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: [],
      purchasedResources: [],
    },
    commercePermissions: {
      resourceExportGrants: [],
      routeAllowances: [],
      resourcePolicies: policies,
    },
    materialReservesByCiv: {
      [SELLER]: ledger(native, committed, imported),
      [ALPHA]: { balances: {}, reservations: [], incoming: [] },
      [ZETA]: { balances: {}, reservations: [], incoming: [] },
      [TREASURY]: { balances: {}, reservations: [], incoming: [] },
    },
    gameOver: false,
    winner: null,
  } as unknown as GameState;
}

function market(state: GameState): CommerceMarketState {
  if (!state.commerceMarket) throw new Error('expected a market snapshot');
  return state.commerceMarket;
}

describe('#1508 MR11 — policies and native surplus', () => {
  it('native 30, committed 10, reserve 12 yields 8 exportable and imported stock never raises it', () => {
    expect(getExportableSurplus(world(), SELLER, COAL)).toBe(8);
    expect(getExportableSurplus(world({ imported: 100 }), SELLER, COAL)).toBe(8);
  });

  it('stores good-keyed policies and validates the protected reserve', () => {
    const state = world();
    const changed = setCommerceResourcePolicy(state, {
      civId: SELLER,
      goodId: COAL,
      protectedReserve: 20,
      partnerCivIds: [ALPHA, ZETA],
    });
    expect(getExportableSurplus(changed, SELLER, COAL)).toBe(0);
    expect(() => setCommerceResourcePolicy(state, {
      civId: SELLER,
      goodId: COAL,
      protectedReserve: -1,
      partnerCivIds: [ALPHA],
    })).toThrow(/protected reserve/i);
  });

  it('removes the legacy world-price mirror from the remaining access-cost caller', () => {
    expect(getResourceAccessCost(world({ worldPrice: 999 }), 'coal')).toBe(21);
  });

  it('only exposes buyers with commercial passage, a partner policy and knowledge', () => {
    expect(getEligibleMarketBuyers(world(), SELLER, COAL)).toEqual([ALPHA]);
    expect(getEligibleMarketBuyers(world({ buyerTech: false }), SELLER, COAL)).toEqual([]);
    expect(getEligibleMarketBuyers(world({ partners: [] }), SELLER, COAL)).toEqual([]);
  });
});

describe('#1508 MR11 — offer snapshot, bands and tariffs', () => {
  it('writes one snapshot per round and keeps the same object on a repeat refresh', () => {
    const first = refreshMarketOffers(world());
    const repeat = refreshMarketOffers(first);
    expect(repeat).toBe(first);
    expect(market(first).turn).toBe(10);
    expect(getMarketOffersForBuyer(first, ALPHA)).toHaveLength(1);
    expect(getMarketOffersForBuyer(first, ZETA)).toHaveLength(0);
  });

  it('prices from the good definition, not the legacy world price', () => {
    const first = refreshMarketOffers(world({ worldPrice: 999 }));
    const offer = getMarketOffersForBuyer(first, ALPHA)[0]!;
    expect(offer.unitPrice).toBe(Math.round(7 * MARKET_PRICE_BANDS.tight));
    expect(offer.unitPrice).not.toBe(999);
  });

  it('moves the band at most one step per round (hysteresis)', () => {
    const scarce = refreshMarketOffers(world());
    expect(getMarketOffersForBuyer(scarce, ALPHA)[0]!.band).toBe('tight');

    const abundantState = {
      ...scarce,
      turn: 11,
      materialReservesByCiv: {
        ...scarce.materialReservesByCiv!,
        [SELLER]: ledger(60, 10),
      },
    } as GameState;
    const oneStep = refreshMarketOffers(abundantState);
    expect(getMarketOffersForBuyer(oneStep, ALPHA)[0]!.band).toBe('normal');

    const nextTurn = { ...oneStep, turn: 12 } as GameState;
    const twoSteps = refreshMarketOffers(nextTurn);
    expect(getMarketOffersForBuyer(twoSteps, ALPHA)[0]!.band).toBe('abundant');
  });

  it('itemizes a tariff in the offer and the quote', () => {
    const state = refreshMarketOffers(world({ tariffPerUnit: 2, tariffRecipientCivId: TREASURY }));
    const offer = getMarketOffersForBuyer(state, ALPHA)[0]!;
    expect(offer.tariffPerUnit).toBe(2);
    expect(offer.tariffRecipientCivId).toBe(TREASURY);
    const quote = quoteMarketLoad(state, ALPHA, SELLER, COAL, 2);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    expect(quote.quote.unitPrice).toBe(offer.unitPrice);
    expect(quote.quote.tariffPerUnit).toBe(2);
    expect(quote.quote.totalPrice).toBe((offer.unitPrice + 2) * 2);
  });

  it('refuses an itemized tariff with no named recipient', () => {
    const state = refreshMarketOffers(world({ tariffPerUnit: 2 }));
    expect(quoteMarketLoad(state, ALPHA, SELLER, COAL, 1)).toMatchObject({
      ok: false,
      reason: 'no-tariff-recipient',
    });
  });

  it('keeps hidden unrelated supply out of the buyer row order', () => {
    const state = refreshMarketOffers(world({ extraSupplier: true }));
    const offers = getMarketOffersForBuyer(state, ALPHA);
    expect(offers.map(offer => offer.supplierCivId)).toEqual([SELLER]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : entry.name.endsWith('.ts') ? [path] : [];
  });
}

describe('#1508 MR11 — atomic loading', () => {
  it('has no UI/AI caller and leaves instant resource purchases closed', () => {
    // The shipment engine is the one permitted system caller; no UI or AI module may debit stock or
    // transfer payment directly.
    const callers = [...sourceFiles(join('src', 'ui')), ...sourceFiles(join('src', 'ai'))]
      .filter(file => readFileSync(file, 'utf8').includes('commitMarketLoad'));
    expect(callers).toEqual([]);
    expect(getInstantResourcePurchaseNotice()).not.toBeNull();
  });

  it('settles one 6-unit load and refuses the second 6-unit load', () => {
    const state = refreshMarketOffers(world());
    const first = quoteMarketLoad(state, ALPHA, SELLER, COAL, 6);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    const committed = commitMarketLoad(state, first.quote);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;

    expect(getReserveBalance(committed.state.materialReservesByCiv![SELLER]!, COAL))
      .toEqual({ native: 24, imported: 0 });
    expect(getReserveBalance(committed.state.materialReservesByCiv![ALPHA]!, COAL))
      .toEqual({ native: 0, imported: 6 });

    const second = quoteMarketLoad(committed.state, ALPHA, SELLER, COAL, 6);
    expect(second).toMatchObject({ ok: false, reason: 'insufficient-quantity' });
  });

  it('conserves the purchase payment across buyer, seller and tariff recipient', () => {
    const state = refreshMarketOffers(world({ tariffPerUnit: 2, tariffRecipientCivId: TREASURY }));
    const quote = quoteMarketLoad(state, ALPHA, SELLER, COAL, 2);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;
    const buyerBefore = state.civilizations[ALPHA]!.gold;
    const sellerBefore = state.civilizations[SELLER]!.gold;
    const treasuryBefore = state.civilizations[TREASURY]!.gold;

    const committed = commitMarketLoad(state, quote.quote);
    expect(committed.ok).toBe(true);
    if (!committed.ok) return;
    const buyerAfter = committed.state.civilizations[ALPHA]!.gold;
    const sellerAfter = committed.state.civilizations[SELLER]!.gold;
    const treasuryAfter = committed.state.civilizations[TREASURY]!.gold;

    expect(buyerBefore - buyerAfter).toBe(quote.quote.totalPrice);
    expect(sellerAfter - sellerBefore).toBe(quote.quote.sellerProceeds);
    expect(treasuryAfter - treasuryBefore).toBe(quote.quote.tariffProceeds);
    expect(buyerBefore - buyerAfter)
      .toBe((sellerAfter - sellerBefore) + (treasuryAfter - treasuryBefore));
  });

  it('rejects a stale quote above the procurement cap without moving any balance', () => {
    const state = refreshMarketOffers(world());
    const quote = quoteMarketLoad(state, ALPHA, SELLER, COAL, 2);
    expect(quote.ok).toBe(true);
    if (!quote.ok) return;

    const capped: GameState = {
      ...state,
      commerceMarket: {
        ...market(state),
        procurementByCiv: { [ALPHA]: { maxUnitPrice: 1, treasuryFloor: 0 } },
      },
    };
    const stale = commitMarketLoad(capped, quote.quote);
    expect(stale).toMatchObject({ ok: false, reason: 'price-above-cap' });
    expect(stale.state).toBe(capped);
    expect(getReserveBalance(capped.materialReservesByCiv![SELLER]!, COAL).native).toBe(30);
    expect(getReserveBalance(capped.materialReservesByCiv![ALPHA]!, COAL).imported).toBe(0);
  });

  it('honours insufficient gold, the treasury floor and storage headroom', () => {
    const poor = refreshMarketOffers(world({ buyerGold: 5 }));
    expect(quoteMarketLoad(poor, ALPHA, SELLER, COAL, 1)).toMatchObject({
      ok: false,
      reason: 'insufficient-gold',
    });

    const floorState: GameState = {
      ...poor,
      civilizations: {
        ...poor.civilizations,
        [ALPHA]: { ...poor.civilizations[ALPHA]!, gold: 20 },
      },
      commerceMarket: {
        ...market(poor),
        procurementByCiv: { [ALPHA]: { maxUnitPrice: 100, treasuryFloor: 15 } },
      },
    };
    expect(quoteMarketLoad(floorState, ALPHA, SELLER, COAL, 1)).toMatchObject({
      ok: false,
      reason: 'treasury-floor',
    });

    const full: GameState = {
      ...poor,
      materialReservesByCiv: {
        ...poor.materialReservesByCiv!,
        [ALPHA]: { balances: { [COAL]: { native: 0, imported: 40 } }, reservations: [], incoming: [] },
      },
    };
    expect(quoteMarketLoad(full, ALPHA, SELLER, COAL, 1)).toMatchObject({
      ok: false,
      reason: 'insufficient-capacity',
    });
  });

  it('alternates two waiting buyers for one scarce unit each round', () => {
    let state = refreshMarketOffers(world({ native: 11, committed: 10, reserve: 0, partners: [ALPHA, ZETA] }));
    expect(getMarketOffersForBuyer(state, ALPHA)[0]!.available).toBe(1);
    expect(quoteMarketLoad(state, ZETA, SELLER, COAL, 1)).toMatchObject({
      ok: false,
      reason: 'awaiting-turn',
    });

    const alphaQuote = quoteMarketLoad(state, ALPHA, SELLER, COAL, 1);
    expect(alphaQuote.ok).toBe(true);
    if (!alphaQuote.ok) return;
    const alphaCommit = commitMarketLoad(state, alphaQuote.quote);
    expect(alphaCommit.ok).toBe(true);
    if (!alphaCommit.ok) return;

    state = {
      ...alphaCommit.state,
      turn: 11,
      materialReservesByCiv: {
        ...alphaCommit.state.materialReservesByCiv!,
        [SELLER]: ledger(11, 10),
      },
    } as GameState;
    state = refreshMarketOffers(state);
    expect(quoteMarketLoad(state, ALPHA, SELLER, COAL, 1)).toMatchObject({
      ok: false,
      reason: 'awaiting-turn',
    });
    const zetaQuote = quoteMarketLoad(state, ZETA, SELLER, COAL, 1);
    expect(zetaQuote.ok).toBe(true);
  });

  it('is generic for a non-deposit producer good and does not assume a hex deposit', () => {
    const fixture: TradeGoodDefinition = {
      id: 'fixture:toolworks',
      name: 'Tools',
      nativeSource: { kind: 'producer', producerId: 'test:toolworks' },
      settlement: 'stored-quantity',
      uses: ['material'],
      cargoSpacePerUnit: 1,
      basePrice: 11,
      quantity: { standardRecipeQuantity: 4, storageCapacity: 12, nativePerSourcePerRound: 1 },
    };
    const base = world();
    const state = {
      ...base,
      commercePermissions: {
        ...base.commercePermissions!,
        resourcePolicies: [{
          civId: SELLER,
          goodId: fixture.id,
          protectedReserve: 0,
          partnerCivIds: [ALPHA],
        }],
      },
      materialReservesByCiv: {
        ...base.materialReservesByCiv!,
        [SELLER]: {
          balances: { [fixture.id]: { native: 3, imported: 0 } },
          reservations: [],
          incoming: [],
        },
      },
    } as GameState;

    const refreshed = refreshMarketOffers(state, [fixture]);
    const offer = getMarketOffersForBuyer(refreshed, ALPHA, [fixture])[0]!;
    expect(offer.goodId).toBe(fixture.id);
    expect(offer.unitPrice).toBeGreaterThan(0);
    expect(getStoredQuantity(refreshed.materialReservesByCiv![SELLER]!, fixture.id)).toBe(3);
  });
});
