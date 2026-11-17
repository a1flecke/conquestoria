import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { getEntitledTradeDestinations } from '@/systems/commerce-projection';
import { completeRouteLeg } from '@/systems/trade-route-runner';
import { establishTradeRoute } from '@/systems/trade-route-contract';
import { getTradeRouteQuote } from '@/systems/trade-route-economy';
import { resetUnitTurn } from '@/systems/unit-lifecycle';
import { getMovementBlockerReason } from '@/systems/unit-movement-explainer';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { advanceRouteRunners, executeUnitMove } from '@/systems/unit-movement-system';
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
  unitType?: 'merchant_wagon' | 'naval_trader';
  blockade?: boolean;
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
      ...(options.blockade
        ? {
          raider: {
            ...civ('raider', 100, [], SELLER),
            diplomacy: {
              ...civ('raider', 100, [], SELLER).diplomacy,
              atWarWith: [SELLER],
            },
          },
        }
        : {}),
    },
    units: {
      'caravan-1': {
        id: 'caravan-1', type: options.unitType ?? 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
        health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
        experience: 0, isResting: false, committedToRouteId: 'route-1', routeDirection: 'outbound',
      },
      ...(options.blockade
        ? {
          'raider-1': {
            id: 'raider-1', type: 'destroyer', owner: 'raider', position: { q: 3, r: 0 },
            health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false,
            experience: 0, isResting: false,
          },
          'raider-2': {
            id: 'raider-2', type: 'destroyer', owner: 'raider', position: { q: 3, r: 1 },
            health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false,
            experience: 0, isResting: false,
          },
        }
        : {}),
      ...(options.secondRoute
        ? {
          'caravan-2': {
            id: 'caravan-2', type: options.unitType ?? 'merchant_wagon', owner: BUYER, position: { q: 4, r: 0 },
            health: 100, movementPointsLeft: 0, hasActed: true, hasMoved: true,
            experience: 0, isResting: false, committedToRouteId: 'route-2', routeDirection: 'outbound',
          },
        }
        : {}),
    },
    map: {
      width: 8,
      height: 4,
      tiles: options.blockade
        ? {
          '3,0': {
            coord: { q: 3, r: 0 }, terrain: 'ocean', elevation: 'lowland', resource: null,
            improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
          },
          '3,1': {
            coord: { q: 3, r: 1 }, terrain: 'ocean', elevation: 'lowland', resource: null,
            improvement: 'none', improvementTurnsLeft: 0, hasRiver: false, wonder: null, owner: null,
          },
        }
        : {},
      wrapsHorizontally: false,
      rivers: [],
    },
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

describe('#1125 engineering passage feasibility', () => {
  const traderId = 'caravan-1';
  const home = { q: 0, r: 1 };
  const passage = { q: 4, r: 1 };
  const request = {
    caravanUnitId: traderId,
    actingCivId: BUYER,
    originCityId: BUYER_CITY,
    toCityId: SELLER_CITY,
  };

  function passageWorld(open: boolean, authorized = true, longer = false): GameState {
    const state = world({ unitType: 'naval_trader', target: 4 });
    const rows = ['........', 'HoooXooS', '..o..o..', '..o..o..', '..o..o..', '..oooo..'];
    if (longer) rows[1] = 'HoooXoooS';
    const width = rows[1]!.length;
    const supplier = { q: width - 1, r: 1 };
    const tiles: GameState['map']['tiles'] = {};
    rows.forEach((row, r) => [...row.padEnd(width, '.')].forEach((tile, q) => {
      const coord = { q, r };
      tiles[hexKey(coord)] = {
        coord,
        terrain: tile === 'o' ? 'coast' : 'grassland',
        elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0,
        hasRiver: false, wonder: null,
        owner: tile === 'H' ? BUYER : tile === 'S' ? SELLER : null,
      };
    }));
    tiles[hexKey(passage)] = {
      ...tiles[hexKey(passage)]!,
      freightPassage: {
        id: 'isthmus',
        ownerId: SELLER,
        open,
        allowedOperatorIds: authorized ? [BUYER] : [],
        approaches: [{ q: 3, r: 1 }, { q: 5, r: 1 }],
      },
    };
    const visibility = {
      tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, 'visible' as const])),
    };
    state.map = { ...state.map, width, height: rows.length, tiles };
    state.minorCivs = {};
    state.tribalVillages = {};
    state.cities[BUYER_CITY] = { ...state.cities[BUYER_CITY]!, position: home, ownedTiles: [home] };
    state.cities[SELLER_CITY] = { ...state.cities[SELLER_CITY]!, position: supplier, ownedTiles: [supplier] };
    state.civilizations[BUYER]!.units = [traderId];
    state.civilizations[BUYER]!.visibility = visibility;
    state.civilizations[SELLER]!.visibility = { tiles: { ...visibility.tiles } };
    state.units[traderId] = resetUnitTurn({
      ...state.units[traderId]!, position: home, committedToRouteId: undefined, routeDirection: undefined,
    });
    return state;
  }

  function startReceiptVoyage(procurement = world().marketplace!.tradeRoutes[0]!.procurement): GameState {
    const fixture = passageWorld(true);
    const state = { ...createNewGame('rome', 'freight-receipts', 'small'), ...fixture };
    for (const [cityId, regionKey] of [[BUYER_CITY, 'west-coast'], [SELLER_CITY, 'east-coast']] as const) {
      const site = state.cities[cityId]!;
      state.map.tiles[hexKey(site.position)]!.regionKey = regionKey;
      state.cities[cityId] = {
        ...foundCity(site.owner, site.position, state.map, state.idCounters),
        ...site,
      };
    }
    state.marketplace!.tradeRoutes = [];
    const result = establishTradeRoute(state, { ...request, procurement });
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }

  function sail(state: GameState, movementPointsLeft?: number): GameState {
    const trader = resetUnitTurn(state.units[traderId]!);
    return advanceRouteRunners({
      ...state,
      turn: state.turn + 1,
      units: { ...state.units, [traderId]: { ...trader, movementPointsLeft: movementPointsLeft ?? trader.movementPointsLeft } },
    });
  }

  function reload(state: GameState): GameState {
    const result = parseSaveFile(serializeSaveFile(state));
    if (result.status !== 'success') throw new Error(result.message);
    return normalizeLoadedState(result.state);
  }

  it('records one voyage for two delivered claims, including across a save inside the passage', () => {
    const underway = startReceiptVoyage({ orders: [
      { goodId: IRON, targetQuantity: 2, maxUnitPrice: 100 },
      { goodId: COAL, targetQuantity: 2, maxUnitPrice: 100 },
    ] });
    const routeId = underway.marketplace!.tradeRoutes[0]!.id;
    const loaded = sail(sail(underway));
    expect(routeOf(loaded, routeId).manifest?.items.map(item => item.goodId)).toEqual([IRON, COAL]);
    expect(loaded.freightVoyageReceipts).toBeUndefined();
    const inPassage = sail(loaded, 2);
    expect(inPassage.units[traderId]!.position).toEqual(passage);
    expect(inPassage.freightVoyageReceipts).toBeUndefined();
    const manifest = routeOf(loaded, routeId).manifest!;
    const delivered = sail(reload(inPassage));
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, IRON).imported).toBe(2);
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, COAL).imported).toBe(2);
    expect(routeOf(delivered, routeId).manifest).toBeUndefined();
    expect(delivered.freightVoyageReceipts).toEqual({ [manifest.items[0]!.claimId]: {
      routeId,
      carrierUnitId: traderId,
      buyerCivId: BUYER,
      operatorCivId: BUYER,
      supplier: { cityId: SELLER_CITY, ownerCivId: SELLER, regionKey: 'east-coast' },
      home: { cityId: BUYER_CITY, ownerCivId: BUYER, regionKey: 'west-coast' },
      passageId: 'isthmus',
      passageOwnerCivId: SELLER,
      purchaseTurn: manifest.purchaseTurn,
      completedRound: delivered.turn,
      stock: [{ goodId: IRON, quantity: 2 }, { goodId: COAL, quantity: 2 }],
    } });
    expect(delivered.freightVoyageReceipts).toEqual(sail(inPassage).freightVoyageReceipts);
    const savedArrival = reload(delivered);
    expect(savedArrival.freightVoyageReceipts).toEqual(delivered.freightVoyageReceipts);
    expect(deliverRouteManifest(savedArrival, routeId).state).toBe(savedArrival);
    const cancelled = removeRouteById(savedArrival, routeId, undefined, 'cancelled');
    expect(cancelled.marketplace!.tradeRoutes).toHaveLength(0);
    expect(cancelled.freightVoyageReceipts).toEqual(delivered.freightVoyageReceipts);
  });

  it('settles older manifests after reload without reconstructing voyage history', () => {
    const loaded = sail(sail(startReceiptVoyage()));
    const routeId = loaded.marketplace!.tradeRoutes[0]!.id;
    const manifest = routeOf(loaded, routeId).manifest!;
    expect(manifest.items).toHaveLength(1);
    delete manifest.freightVoyage;
    const delivered = sail(sail(reload(loaded)));
    expect(routeOf(delivered, routeId).manifest).toBeUndefined();
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, IRON).imported).toBe(5);
    expect(delivered.freightVoyageReceipts).toBeUndefined();
  });

  it('discards a crossed manifest when the trader dies and pays no stock or voyage credit', () => {
    const crossed = sail(sail(sail(startReceiptVoyage())));
    expect(crossed.units[traderId]!.position).toEqual({ q: 3, r: 1 });
    expect(crossed.marketplace!.tradeRoutes[0]!.manifest?.freightVoyage?.crossing).toMatchObject({
      passageId: 'isthmus', crossed: true,
    });
    expect(crossed.freightVoyageReceipts).toBeUndefined();
    const lost = removeUnits(crossed, [traderId], { reason: 'destroyed' }).state;
    expect(lost.marketplace!.tradeRoutes).toHaveLength(0);
    expect(getIncomingQuantity(lost.materialReservesByCiv![BUYER]!, IRON)).toBe(0);
    expect(getReserveBalance(lost.materialReservesByCiv![BUYER]!, IRON).imported).toBe(0);
    expect(lost.freightVoyageReceipts).toBeUndefined();
  });

  it('gives no voyage credit when home service cannot settle an incoming claim', () => {
    const crossed = sail(sail(sail(startReceiptVoyage())));
    const route = crossed.marketplace!.tradeRoutes[0]!;
    expect(route.manifest?.freightVoyage?.crossing?.crossed).toBe(true);
    expect(getIncomingQuantity(crossed.materialReservesByCiv![BUYER]!, IRON)).toBe(5);
    crossed.materialReservesByCiv![BUYER] = { ...crossed.materialReservesByCiv![BUYER]!, incoming: [] };
    const arrived = sail(crossed);
    expect(routeOf(arrived, route.id).manifest).toBeUndefined();
    expect(getReserveBalance(arrived.materialReservesByCiv![BUYER]!, IRON).imported).toBe(0);
    expect(arrived.freightVoyageReceipts).toBeUndefined();
  });

  it('receives rehomed cargo at an alternate port without earning the voyage', () => {
    const crossed = sail(sail(sail(startReceiptVoyage())));
    const alternative = city('alternate-home', BUYER, 2);
    crossed.cities[alternative.id] = alternative;
    crossed.civilizations[BUYER]!.cities.push(alternative.id);
    const route = crossed.marketplace!.tradeRoutes[0]!;
    expect(route.manifest?.freightVoyage?.crossing?.crossed).toBe(true);
    route.cancelPending = true;
    route.returnHomeCityId = alternative.id;
    const delivered = sail(crossed);
    expect(delivered.marketplace!.tradeRoutes).toHaveLength(0);
    expect(getReserveBalance(delivered.materialReservesByCiv![BUYER]!, IRON).imported).toBe(5);
    expect(delivered.freightVoyageReceipts).toBeUndefined();
  });

  it('clears a partial crossing when a loaded trader leaves by its entry approach', () => {
    const loaded = sail(sail(startReceiptVoyage()));
    const inside = sail(loaded, 2);
    expect(inside.units[traderId]!.position).toEqual(passage);
    expect(inside.marketplace!.tradeRoutes[0]!.manifest?.freightVoyage?.crossing).toMatchObject({
      passageId: 'isthmus', crossed: false,
    });
    inside.units[traderId] = resetUnitTurn(inside.units[traderId]!);
    const backedOut = executeUnitMove(inside, traderId, { q: 5, r: 1 }, { actor: 'automation', civId: BUYER });
    if (!backedOut.ok) throw new Error(backedOut.message);
    expect(backedOut.state.marketplace!.tradeRoutes[0]!.manifest?.freightVoyage?.crossing).toBeUndefined();
    expect(backedOut.state.freightVoyageReceipts).toBeUndefined();
  });

  it.each([
    { name: 'authorized', open: true, authorized: true, longer: false, outbound: 2, inbound: 2 },
    { name: 'closed', open: false, authorized: true, longer: false, outbound: 4, inbound: 4 },
    { name: 'uninvited', open: true, authorized: false, longer: false, outbound: 4, inbound: 4 },
    { name: 'different leg times', open: true, authorized: true, longer: true, outbound: 3, inbound: 2 },
  ])('matches movement and delivery with an $name passage', ({ open, authorized, longer, outbound, inbound }) => {
    const fixture = passageWorld(open, authorized, longer);
    const shortcut = open && authorized;
    expect(fixture.map.tiles[hexKey(passage)]!.terrain).toBe('grassland');
    const procurement = routeOf(fixture).procurement;
    fixture.marketplace!.tradeRoutes = [];
    const trader = fixture.units[traderId]!;
    const besidePassage: GameState = {
      ...fixture,
      units: { [traderId]: { ...trader, position: { q: 3, r: 1 } } },
    };
    expect(buildSelectedUnitHighlights(besidePassage, traderId).movementRange.some(
      coord => hexKey(coord) === hexKey(passage),
    )).toBe(shortcut);
    const move = executeUnitMove(besidePassage, traderId, passage, { actor: 'player', civId: BUYER });
    expect(move.ok).toBe(shortcut);
    if (move.ok) expect(move.to).toEqual(passage);
    const blocker = getMovementBlockerReason(besidePassage, traderId, passage);
    expect(blocker?.message).toBe(!open
      ? 'This freight passage is closed.'
      : authorized ? undefined : 'Only authorized freight ships can use this passage.');

    const quote = getTradeRouteQuote(fixture, request);
    expect(quote).toMatchObject({ legRounds: outbound, roundTripRounds: outbound + inbound });
    expect(getEntitledTradeDestinations(fixture, BUYER, traderId, { originCityId: BUYER_CITY })).toContainEqual(
      expect.objectContaining({ cityId: SELLER_CITY, eligible: true, roundTripRounds: outbound + inbound }),
    );
    const assignment = establishTradeRoute(fixture, { ...request, procurement });
    expect(assignment).toMatchObject({ ok: true });
    if (!assignment.ok) throw new Error(assignment.reason);

    const bus = new EventBus();
    const observedCrossings: string[] = [];
    let state = assignment.state;
    bus.on('unit:move', ({ unitId, to }) => {
      if (unitId !== traderId || hexKey(to) !== hexKey(passage)) return;
      observedCrossings.push(routeOf(state).manifest ? 'loaded' : 'outbound');
    });
    const advance = () => {
      state = advanceRouteRunners({
        ...state,
        turn: state.turn + 1,
        units: { [traderId]: resetUnitTurn(state.units[traderId]!) },
      }, bus);
    };
    const imported = () => getReserveBalance(state.materialReservesByCiv![BUYER]!, IRON).imported;
    const incoming = () => getIncomingQuantity(state.materialReservesByCiv![BUYER]!, IRON);
    const position = () => state.units[traderId]!.position;

    for (let round = 1; round <= outbound; round++) {
      expect(routeOf(state).manifest).toBeUndefined();
      advance();
      expect(imported()).toBe(0);
    }
    expect(position()).toEqual({ q: fixture.map.width - 2, r: 1 });
    expect(routeOf(state).manifest?.items).toMatchObject([{ goodId: IRON, quantity: 4, sellerCivId: SELLER }]);
    expect(state.freightVoyageReceipts).toBeUndefined();
    expect(incoming()).toBe(4);
    expect(getReserveBalance(state.materialReservesByCiv![SELLER]!, IRON).native).toBe(26);

    for (let round = 1; round <= inbound; round++) {
      expect(imported()).toBe(0);
      expect(incoming()).toBe(4);
      advance();
    }
    expect(position()).toEqual({ q: 1, r: 1 });
    expect(routeOf(state).manifest).toBeUndefined();
    expect(incoming()).toBe(0);
    expect(imported()).toBe(4);
    expect(Object.values(state.freightVoyageReceipts ?? {})).toHaveLength(shortcut ? 1 : 0);
    expect(observedCrossings).toEqual(shortcut ? ['outbound', 'loaded'] : []);
    if (longer) {
      expect(getTradeRouteQuote(state, request)).toMatchObject({ legRounds: 2, roundTripRounds: 4 });
    }
  });

  it('admits the builder’s trader and retains land movement while excluding warships and unknown passages', () => {
    const state = passageWorld(true, false);
    const trader = state.units[traderId]!;
    const approach = { q: 3, r: 1 };
    const options = { actor: 'player', civId: SELLER } as const;
    state.units[traderId] = { ...trader, owner: SELLER, position: approach };
    expect(executeUnitMove(state, traderId, passage, options)).toMatchObject({ ok: true, to: passage });

    state.units[traderId] = { ...state.units[traderId]!, type: 'destroyer' };
    expect(getMovementRangeDetails(state, traderId).reachable).not.toContainEqual(passage);
    expect(executeUnitMove(state, traderId, passage, options)).toMatchObject({ ok: false });

    state.units[traderId] = { ...state.units[traderId]!, type: 'worker', position: { q: 4, r: 0 } };
    expect(getMovementRangeDetails(state, traderId).reachable).toContainEqual(passage);
    expect(executeUnitMove(state, traderId, passage, options)).toMatchObject({ ok: true, to: passage });

    state.units[traderId] = { ...trader, owner: SELLER, position: approach };
    state.civilizations[SELLER]!.visibility.tiles[hexKey(passage)] = 'unexplored';
    expect(getMovementRangeDetails(state, traderId).reachable).not.toContainEqual(passage);
    expect(executeUnitMove(state, traderId, passage, options)).toMatchObject({ ok: false });
  });

  it('lets a trader already in a closed passage sail out without allowing re-entry', () => {
    const state = passageWorld(false);
    const approach = { q: 3, r: 1 };
    state.units[traderId] = { ...state.units[traderId]!, position: passage };
    const options = { actor: 'player', civId: BUYER } as const;
    const exit = executeUnitMove(state, traderId, approach, options);
    expect(exit).toMatchObject({ ok: true, to: approach });
    if (!exit.ok) throw new Error(exit.reason);
    expect(executeUnitMove(exit.state, traderId, passage, options)).toMatchObject({ ok: false });
  });

  it('requires enough movement to sail around to a designated approach', () => {
    const state = passageWorld(true);
    const wrongSide = { q: 4, r: 2 };
    state.map.tiles[hexKey(wrongSide)]!.terrain = 'coast';
    state.units[traderId] = { ...state.units[traderId]!, position: wrongSide, movementPointsLeft: 1 };
    expect(buildSelectedUnitHighlights(state, traderId).movementRange).not.toContainEqual(passage);
    const options = { actor: 'player', civId: BUYER } as const;
    expect(executeUnitMove(state, traderId, passage, options)).toMatchObject({
      ok: false,
      reason: 'insufficient-movement',
    });
    state.units[traderId]!.movementPointsLeft = 2;
    expect(executeUnitMove(state, traderId, passage, options)).toMatchObject({
      ok: true,
      path: [wrongSide, { q: 5, r: 1 }, passage],
    });
  });
});

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

  it('applies the same manifest and loss rules to a naval trader', () => {
    const loaded = completeRouteLeg(world({ unitType: 'naval_trader' }), 'route-1', 'caravan-1');
    expect(routeOf(loaded).manifest?.items[0]?.quantity).toBe(5);
    const destroyed = removeUnits(loaded, ['caravan-1'], { reason: 'destroyed' });
    expect(getIncomingQuantity(destroyed.state.materialReservesByCiv![BUYER]!, IRON)).toBe(0);
    expect(destroyed.state.civilizations[SELLER]!.gold).toBeGreaterThan(100);
  });

  it('does not load at a blockaded supplier', () => {
    const loaded = completeRouteLeg(world({ blockade: true }), 'route-1', 'caravan-1');
    expect(routeOf(loaded).manifest).toBeUndefined();
    expect(getIncomingQuantity(loaded.materialReservesByCiv![BUYER]!, IRON)).toBe(0);
    expect(getReserveBalance(loaded.materialReservesByCiv![SELLER]!, IRON).native).toBe(30);
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
