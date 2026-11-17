import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { City, Civilization, GameState, TradeRoute } from '@/core/types';
import { buildSelectedUnitHighlights } from '@/input/selected-unit-highlights';
import { parseSaveFile, serializeSaveFile } from '@/storage/save-file-transfer';
import { normalizeLoadedState } from '@/storage/save-manager';
import { foundCity, processCity } from '@/systems/city-system';
import { applyEconomyTurn, getRushBuyQuote } from '@/systems/economy-system';
import { hexKey } from '@/systems/hex-utils';
import { getEntitledTradeDestinations } from '@/systems/commerce-projection';
import { enqueueCityProduction } from '@/systems/planning-system';
import { buildProductionCostContext, getProductionCostForCivItem } from '@/systems/production-cost-context';
import { completeRouteLeg } from '@/systems/trade-route-runner';
import { establishTradeRoute } from '@/systems/trade-route-contract';
import { getTradeRouteQuote, settleTradeRouteForCiv } from '@/systems/trade-route-economy';
import { setMarketProcurementPolicy } from '@/systems/resource-market-offers';
import { allocateFuelForRound } from '@/systems/resource-fuel-system';
import { calculateCityYields } from '@/systems/resource-system';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { resetUnitTurn } from '@/systems/unit-lifecycle';
import { getMovementBlockerReason } from '@/systems/unit-movement-explainer';
import { getMovementRangeDetails } from '@/systems/unit-movement-queries';
import { advanceRouteRunners, executeUnitMove } from '@/systems/unit-movement-system';
import { deliverRouteManifest } from '@/systems/resource-shipment-system';
import { removeUnits } from '@/systems/unit-removal-system';
import { removeRouteById } from '@/systems/trade-route-lifecycle';
import { getReserveBalance, getIncomingQuantity } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { evaluateAuthoredPassage } from '../helpers/engineering-passage-evaluation';

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

  function startReceiptVoyage(
    procurement = world().marketplace!.tradeRoutes[0]!.procurement,
    fixture = passageWorld(true),
  ): GameState {
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
    return advanceRouteRunners({
      ...state,
      turn: state.turn + 1,
      units: Object.fromEntries(Object.entries(state.units).map(([id, unit]) => {
        const trader = resetUnitTurn(unit);
        return [id, id === traderId && movementPointsLeft !== undefined ? { ...trader, movementPointsLeft } : trader];
      })),
    });
  }

  function reload(state: GameState): GameState {
    const result = parseSaveFile(serializeSaveFile(state));
    if (result.status !== 'success') throw new Error(result.message);
    return normalizeLoadedState(result.state);
  }

  const northernHomeId = 'north-port';
  const northernTraderId = 'north-trader';
  const supplyPort = { cityId: SELLER_CITY, ownerCivId: SELLER, regionKey: 'east-coast' };
  const westCorridor = {
    home: { cityId: BUYER_CITY, ownerCivId: BUYER, regionKey: 'west-coast' },
    supplier: supplyPort,
    goodId: IRON,
  };
  const northCorridor = {
    home: { cityId: northernHomeId, ownerCivId: BUYER, regionKey: 'north-coast' },
    supplier: supplyPort,
    goodId: COAL,
  };
  const authoredPassage = { id: 'isthmus', site: { q: 4, r: 5 } };

  function evaluationWorld(
    open: boolean,
    { northernRegion = 'north-coast', fuelPort = 'north' }: { northernRegion?: string; fuelPort?: 'north' | 'west' } = {},
  ): GameState {
    const state = passageWorld(open);
    const shift = ({ q, r }: { q: number; r: number }) => ({ q, r: r + 4 });
    const tiles = Object.fromEntries(Object.values(state.map.tiles).map(tile => {
      const coord = shift(tile.coord);
      const channel = tile.freightPassage;
      if (!channel) return [hexKey(coord), { ...tile, coord }];
      return [hexKey(coord), {
        ...tile,
        coord,
        freightPassage: { ...channel, approaches: [shift(channel.approaches[0]), shift(channel.approaches[1])] },
      }];
    })) as GameState['map']['tiles'];
    for (let r = 0; r < 4; r++) {
      for (let q = 0; q < state.map.width; q++) {
        const coord = { q, r };
        const isPort = r === 2 && q === 0;
        tiles[hexKey(coord)] = {
          ...state.map.tiles['0,0']!,
          coord,
          terrain: q === 1 ? 'coast' : 'grassland',
          owner: isPort ? BUYER : null,
          ...(isPort ? { regionKey: northernRegion } : {}),
        };
      }
    }
    tiles['1,4']!.terrain = 'coast';
    state.map = { ...state.map, tiles, height: state.map.height + 4 };
    for (const port of Object.values(state.cities)) {
      port.position = shift(port.position);
      port.ownedTiles = [port.position];
    }
    const northernPort = city(northernHomeId, BUYER, 0);
    northernPort.position = { q: 0, r: 2 };
    northernPort.ownedTiles = [northernPort.position];
    state.cities[northernHomeId] = northernPort;
    state.civilizations[BUYER]!.cities.push(northernHomeId);
    for (const civ of Object.values(state.civilizations)) {
      civ.visibility = { tiles: Object.fromEntries(Object.keys(tiles).map(key => [key, 'visible'])) };
    }
    state.units[traderId]!.position = state.cities[BUYER_CITY]!.position;
    state.units[northernTraderId] = { ...state.units[traderId]!, id: northernTraderId, position: northernPort.position };
    state.civilizations[BUYER]!.units.push(northernTraderId);
    const westernGood = fuelPort === 'west' ? COAL : IRON;
    const northernGood = fuelPort === 'north' ? COAL : IRON;
    const live = startReceiptVoyage({ orders: [{ goodId: westernGood, targetQuantity: 20, maxUnitPrice: 100 }] }, state);
    const result = establishTradeRoute(live, {
      ...request,
      caravanUnitId: northernTraderId,
      originCityId: northernHomeId,
      procurement: { orders: [{ goodId: northernGood, targetQuantity: 20, maxUnitPrice: 100 }] },
    });
    if (!result.ok) throw new Error(result.reason);
    return result.state;
  }

  function runEvaluationVoyages(state: GameState, until: number): GameState {
    while (state.turn < until) state = sail(state);
    return state;
  }

  it('compares an earlier coal-powered Factory with an immediate Harbor investment', () => {
    const liquidGold = 80;
    const protectedGold = 30;
    const passageCost = 45;
    const scenario = evaluationWorld(false, { fuelPort: 'west' });
    const buyer = scenario.civilizations[BUYER]!;
    const freightFunds = buyer.gold;
    buyer.gold += liquidGold;
    buyer.techState.completed.push('harbor-tech', 'banking');
    scenario.cities[BUYER_CITY]!.buildings = ['factory'];
    scenario.cities[northernHomeId]!.buildings = ['bank'];
    const channel = scenario.map.tiles[hexKey(authoredPassage.site)]!.freightPassage!;
    channel.ownerId = BUYER;

    const fundedScenario = setMarketProcurementPolicy(scenario, BUYER, { maxUnitPrice: 100, treasuryFloor: protectedGold });
    const queued = enqueueCityProduction(fundedScenario, northernHomeId, 'harbor');
    if (!queued.ok) throw new Error(queued.reason);
    const start = queued.state;
    const northPort = start.cities[northernHomeId]!;
    const harborCost = getProductionCostForCivItem(start, BUYER, northernHomeId, 'harbor');
    northPort.productionProgress = harborCost - 18;
    const harborQuote = getRushBuyQuote(start, BUYER, northernHomeId);
    expect(harborQuote).toMatchObject({ itemId: 'harbor', available: true, cost: 45 });
    expect(liquidGold - protectedGold).toBeGreaterThanOrEqual(passageCost);

    const bus = new EventBus();
    const bought = rushBuyActiveProduction(start, BUYER, northernHomeId, bus);
    if (!bought.success) throw new Error(bought.message);
    // The panel for commissioning is a later slice. Apply its authored quote to the same
    // treasury here, then let both choices use the existing route and resource systems.
    const passageKey = hexKey(authoredPassage.site);
    const passageState: GameState = {
      ...start,
      civilizations: { ...start.civilizations, [BUYER]: { ...buyer, gold: buyer.gold - passageCost } },
      map: {
        ...start.map,
        tiles: {
          ...start.map.tiles,
          [passageKey]: { ...start.map.tiles[passageKey]!, freightPassage: { ...channel, open: true } },
        },
      },
    };
    const uncommitted = (state: GameState, earmarked: number) =>
      state.civilizations[BUYER]!.gold - earmarked - protectedGold;
    expect(uncommitted(start, freightFunds)).toBe(50);
    expect(uncommitted(passageState, freightFunds)).toBe(5);
    expect(uncommitted(bought.state, freightFunds)).toBe(5);
    expect(bought.state.cities[northernHomeId]!.buildings).toContain('harbor');

    const yieldsAt = (state: GameState, cityId: string) =>
      calculateCityYields(state.cities[cityId]!, state.map, undefined, buyer.techState.completed);
    const run = (state: GameState) => {
      let earmarked = freightFunds;
      const rounds = [];
      while (state.turn < 26) {
        const beforeFuel = getReserveBalance(state.materialReservesByCiv![BUYER]!, COAL);
        // The live round allocates fuel and calculates city yields before trade delivery.
        const funded = allocateFuelForRound(state);
        const afterFuel = getReserveBalance(funded.materialReservesByCiv![BUYER]!, COAL);
        const west = yieldsAt(funded, BUYER_CITY);
        const north = yieldsAt(funded, northernHomeId);
        const northAfterProduction = processCity(
          funded.cities[northernHomeId]!, funded.map, north.food, north.production,
          buildProductionCostContext(funded, BUYER, northernHomeId), buyer.civType,
        ).city;
        const arrivals = sail({ ...funded, cities: { ...funded.cities, [northernHomeId]: northAfterProduction } });
        const purchaseCost = funded.civilizations[BUYER]!.gold - arrivals.civilizations[BUYER]!.gold;
        const trade = settleTradeRouteForCiv(arrivals, BUYER, bus);
        // The standing freight assignment earns its own route income and pays for its own loads.
        expect(purchaseCost).toBeLessThanOrEqual(earmarked);
        earmarked += trade.paid - purchaseCost;
        state = applyEconomyTurn(trade.state, BUYER, west.gold + north.gold + trade.paid);
        rounds.push({
          turn: state.turn,
          north,
          west,
          beforeFuel,
          afterFuel,
          afterDelivery: getReserveBalance(state.materialReservesByCiv![BUYER]!, COAL),
          uncommitted: uncommitted(state, earmarked),
          harborBuilt: northAfterProduction.buildings.includes('harbor'),
          quote: getRushBuyQuote(state, BUYER, northernHomeId),
        });
      }
      return { state, rounds };
    };

    const passage = run(passageState);
    const harbor = run(bought.state);
    const deferred = run(start);
    const firstCoal = (rounds: typeof passage.rounds) => rounds.find(round => round.afterDelivery.imported > 0);
    const firstPowered = (rounds: typeof passage.rounds) =>
      rounds.find(round => round.beforeFuel.imported > round.afterFuel.imported);
    const unfueled = { native: 0, imported: 0 };
    expect(firstCoal(passage.rounds)).toMatchObject({ turn: 14, beforeFuel: unfueled, afterFuel: unfueled });
    expect(Object.values(passage.state.freightVoyageReceipts ?? {})).toContainEqual(expect.objectContaining({
      home: expect.objectContaining({ cityId: BUYER_CITY }),
      completedRound: 14,
      stock: [{ goodId: COAL, quantity: 5 }],
    }));
    for (const withoutPassage of [harbor, deferred]) {
      expect(firstCoal(withoutPassage.rounds)).toMatchObject({ turn: 18, beforeFuel: unfueled, afterFuel: unfueled });
      expect(firstPowered(withoutPassage.rounds)?.turn).toBe(19);
    }
    expect(firstPowered(passage.rounds)).toMatchObject({
      turn: 15, beforeFuel: { native: 0, imported: 5 }, afterFuel: { native: 0, imported: 4 },
    });
    const factoryLead = passage.rounds.filter(round => round.turn >= 15 && round.turn < 19);
    expect(factoryLead).toHaveLength(4);
    for (const round of factoryLead) {
      const detour = deferred.rounds.find(candidate => candidate.turn === round.turn)!;
      expect(round.west.production - detour.west.production).toBe(2);
      expect(round.west.science - detour.west.science).toBe(1);
    }

    expect(harbor.rounds[0]!.north.gold - deferred.rounds[0]!.north.gold).toBe(3);
    expect(harbor.rounds[0]!.north.food - deferred.rounds[0]!.north.food).toBe(1);
    expect(harbor.rounds[0]!.turn).toBe(11);
    const harborAvailable = passage.rounds.find(({ harborBuilt, quote, uncommitted: gold }) =>
      harborBuilt || (quote.available && gold >= quote.cost));
    const passageAvailable = harbor.rounds.find(round => round.uncommitted >= passageCost);
    expect(harborAvailable?.turn).toBe(17);
    expect(passageAvailable?.turn).toBe(18);
    for (const replay of [passage, harbor, deferred]) {
      expect(replay.rounds.every(round => round.uncommitted >= 0)).toBe(true);
      expect(replay.state.marketplace!.tradeRoutes.map(route => route.id))
        .toEqual(start.marketplace!.tradeRoutes.map(route => route.id));
    }
  });

  it('finds two repeatable corridors across three regions after actual loaded returns', () => {
    const waitingForNorth = runEvaluationVoyages(evaluationWorld(true), 21);
    const services = [westCorridor, northCorridor];
    expect(evaluateAuthoredPassage(waitingForNorth, authoredPassage, services, 21).usefulReach).toBe(false);
    const completed = sail(waitingForNorth);
    const arrivals = Object.values(completed.freightVoyageReceipts ?? {})
      .map(receipt => [receipt.home.cityId, receipt.completedRound]);
    expect(arrivals).toEqual([[BUYER_CITY, 14], [northernHomeId, 16], [BUYER_CITY, 18], [BUYER_CITY, 22], [northernHomeId, 22]]);
    expect(getReserveBalance(completed.materialReservesByCiv![BUYER]!, IRON).imported).toBe(15);
    expect(getReserveBalance(completed.materialReservesByCiv![BUYER]!, COAL).imported).toBe(10);
    expect(evaluateAuthoredPassage(completed, authoredPassage, services, 22)).toEqual({
      usefulReach: true,
      currentFunction: true,
      qualifiedRegionPairs: [['east-coast', 'north-coast'], ['east-coast', 'west-coast']],
      trips: [{ homeCityId: BUYER_CITY, current: 4, disabled: 8 }, { homeCityId: northernHomeId, current: 6, disabled: 10 }],
    });
  });

  it('delivers by the matched disabled detour without earning passage reach', () => {
    const completed = runEvaluationVoyages(evaluationWorld(false), 26);
    expect(getReserveBalance(completed.materialReservesByCiv![BUYER]!, IRON).imported).toBeGreaterThan(0);
    expect(getReserveBalance(completed.materialReservesByCiv![BUYER]!, COAL).imported).toBeGreaterThan(0);
    expect(completed.freightVoyageReceipts).toBeUndefined();
    expect(evaluateAuthoredPassage(completed, authoredPassage, [westCorridor, northCorridor], 26))
      .toMatchObject({ usefulReach: false, currentFunction: false });
  });

  it('combines service on the same unordered pair without counting a third region', () => {
    const completed = runEvaluationVoyages(evaluationWorld(true, { northernRegion: 'west-coast' }), 22);
    expect(Object.values(completed.freightVoyageReceipts ?? {})).toHaveLength(5);
    const samePair = { ...northCorridor, home: { ...northCorridor.home, regionKey: 'west-coast' } };
    expect(evaluateAuthoredPassage(completed, authoredPassage, [westCorridor, samePair], 22))
      .toMatchObject({ usefulReach: false, currentFunction: true, qualifiedRegionPairs: [['east-coast', 'west-coast']] });
  });

  it('expires returns at the inclusive twelve-round boundary', () => {
    const completed = runEvaluationVoyages(evaluationWorld(true), 22);
    expect(evaluateAuthoredPassage({ ...completed, turn: 27 }, authoredPassage, [westCorridor, northCorridor], 27))
      .toMatchObject({ usefulReach: true });
    expect(evaluateAuthoredPassage({ ...completed, turn: 28 }, authoredPassage, [westCorridor, northCorridor], 28))
      .toMatchObject({ usefulReach: false });
  });

  it('distinguishes a temporary movement delay from a pause or exhausted spending authorization', () => {
    const completed = runEvaluationVoyages(evaluationWorld(true), 22);
    const evaluate = (state: GameState) => evaluateAuthoredPassage(state, authoredPassage, [westCorridor, northCorridor], 22);
    const route = completed.marketplace!.tradeRoutes[0]!;
    route.lastProgressTurn = 21;
    expect(evaluate(completed)).toMatchObject({ usefulReach: true, currentFunction: true });
    route.paused = true;
    expect(evaluate(completed)).toMatchObject({ usefulReach: true, currentFunction: false });
    route.paused = false;
    const underfunded = setMarketProcurementPolicy(completed, BUYER, { maxUnitPrice: 100, treasuryFloor: 0, roundBudget: 0 });
    expect(evaluate(underfunded)).toMatchObject({ usefulReach: true, currentFunction: false });
  });

  it('retains reach through a lost carrier and restores service with a like-for-like route', () => {
    const completed = runEvaluationVoyages(evaluationWorld(true), 22);
    const evaluate = (state: GameState) => evaluateAuthoredPassage(state, authoredPassage, [westCorridor, northCorridor], state.turn);
    const route = completed.marketplace!.tradeRoutes[0]!;
    const lost = removeUnits(completed, [traderId], { reason: 'destroyed' }).state;
    expect(evaluate(lost)).toMatchObject({ usefulReach: true, currentFunction: false });
    const replacementId = 'replacement-trader';
    lost.units[replacementId] = resetUnitTurn({
      ...completed.units[traderId]!, id: replacementId, committedToRouteId: undefined, routeDirection: undefined,
    });
    lost.civilizations[BUYER]!.units.push(replacementId);
    const replacement = establishTradeRoute(lost, { ...request, caravanUnitId: replacementId, procurement: route.procurement });
    if (!replacement.ok) throw new Error(replacement.reason);
    expect(replacement.route.id).not.toBe(route.id);
    expect(replacement.state.units[replacementId]!.routeDirection).toBe('positioning');
    const ready = sail(replacement.state);
    expect(ready.units[replacementId]!.routeDirection).toBe('outbound');
    expect(evaluate(ready)).toMatchObject({ usefulReach: true, currentFunction: true });

    const passageTile = ready.map.tiles[hexKey(authoredPassage.site)]!;
    passageTile.freightPassage!.allowedOperatorIds = [];
    expect(evaluate(ready)).toMatchObject({ usefulReach: true, currentFunction: false });
  });

  it('requires authorized demand and an available supplier for another purchase', () => {
    const completed = runEvaluationVoyages(evaluationWorld(true), 22);
    const evaluate = (state: GameState) => evaluateAuthoredPassage(state, authoredPassage, [westCorridor, northCorridor], 22);
    const seller = completed.materialReservesByCiv![SELLER]!;
    completed.materialReservesByCiv![SELLER] = { ...seller, balances: { ...seller.balances, [IRON]: { native: 0, imported: 0 } } };
    expect(evaluate(completed)).toMatchObject({ usefulReach: true, currentFunction: false });
    completed.materialReservesByCiv![SELLER] = seller;
    const buyer = completed.materialReservesByCiv![BUYER]!;
    completed.materialReservesByCiv![BUYER] = { ...buyer, balances: { ...buyer.balances, [IRON]: { native: 5, imported: 15 } } };
    expect(evaluate(completed)).toMatchObject({ usefulReach: true, currentFunction: false });
  });

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
