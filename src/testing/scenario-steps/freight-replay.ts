import type { Civilization, GameMap, GameState, HexCoord } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { hexKey } from '@/systems/hex-utils';
import { enqueueCityProduction } from '@/systems/planning-system';
import { getProductionCostForCivItem } from '@/systems/production-cost-context';
import { setMarketProcurementPolicy } from '@/systems/resource-market-offers';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { establishTradeRoute } from '@/systems/trade-route-contract';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { ScenarioError } from '@/testing/scenario-types';
import { applyCityStep } from './city-step';
import { applyUnitStep } from './unit-step';

const BUYER = 'player';
const SELLER = 'ai-1';
export const FREIGHT_REPLAY = {
  west: 'strait-west',
  north: 'strait-north',
  supplier: 'strait-supplier',
  trader: 'strait-west-trader',
  passage: { q: 4, r: 5 },
  passageId: 'strait-passage',
  protectedGold: 30,
  passageCost: 45,
} as const;

const { west: WEST, north: NORTH, supplier: SUPPLIER, trader: WEST_TRADER, passage: PASSAGE } = FREIGHT_REPLAY;
const NORTH_TRADER = 'strait-north-trader';
const WEST_POSITION = { q: 0, r: 5 };
const NORTH_POSITION = { q: 0, r: 2 };
const SUPPLIER_POSITION = { q: 7, r: 5 };
const OUTPOST = { q: 0, r: 9 };
const COAL = resourceGoodId('coal');
const IRON = resourceGoodId('iron');

function createMap(shortDetour: boolean): GameMap {
  const rows = [
    '.o......', '.o......', '.o......', '.o......', '.o......',
    '.oooxoo.', shortDetour ? '..oooo..' : '..o..o..', '..o..o..', '..o..o..', '..oooo..',
  ];
  const tiles: GameMap['tiles'] = {};
  rows.forEach((row, r) => [...row].forEach((symbol, q) => {
    const coord = { q, r };
    tiles[hexKey(coord)] = {
      coord,
      terrain: symbol === 'o' ? 'coast' : 'grassland',
      elevation: 'lowland', resource: null, improvement: 'none', improvementTurnsLeft: 0,
      hasRiver: false, wonder: null, owner: null,
      regionKey: q <= 3 ? (r <= 3 ? 'north-coast' : 'west-coast') : 'east-coast',
    };
  }));
  Object.assign(tiles[hexKey(PASSAGE)], {
    freightPassage: {
      id: FREIGHT_REPLAY.passageId, ownerId: BUYER, open: false, allowedOperatorIds: [],
      approaches: [{ q: 3, r: 5 }, { q: 5, r: 5 }],
    },
  });
  Object.assign(tiles[hexKey(OUTPOST)], { terrain: 'forest', resource: 'ivory' });
  return { width: rows[0].length, height: rows.length, tiles, wrapsHorizontally: false, rivers: [] };
}

function addTrader(state: GameState, id: string, position: HexCoord, home: string, good: typeof COAL): GameState {
  const ready = applyUnitStep(state, { kind: 'unit', civId: BUYER, position, type: 'naval_trader', overrides: { id } });
  const route = establishTradeRoute(ready, {
    actingCivId: BUYER, caravanUnitId: id, originCityId: home, toCityId: SUPPLIER,
    procurement: { orders: [{ goodId: good, targetQuantity: 20, maxUnitPrice: 100 }] },
  });
  if (!route.ok) throw new ScenarioError(route.reason);
  return route.state;
}

/** The authored strait starts with ordinary live production, cargo and Expedition state. */
export function configureFreightReplay(initial: GameState, shortDetour: boolean): GameState {
  const map = createMap(shortDetour);
  const civilizations = Object.fromEntries(Object.entries(initial.civilizations).map(([id, civ]): [string, Civilization] => {
    const buyer = id === BUYER;
    const partner = buyer ? SELLER : BUYER;
    return [id, {
      ...civ,
      name: buyer ? 'West Coast' : 'East Coast',
      units: [], cities: [], gold: buyer ? 125 : 100,
      visibility: { tiles: Object.fromEntries(Object.keys(map.tiles).map(key => [key, 'visible'])) },
      knownCivilizations: [partner],
      techState: {
        ...civ.techState,
        completed: ['bronze-working', 'steam-power', 'foraging', 'harbor-tech', 'banking'],
        currentResearch: 'natural-philosophy',
      },
      diplomacy: {
        ...civ.diplomacy,
        treaties: [{ type: 'trade_agreement', civA: id, civB: partner, turnsRemaining: -1 }],
      },
    }];
  }));
  let state: GameState = {
    ...initial, turn: 10, map, civilizations, units: {}, tribalVillages: {}, minorCivs: {}, barbarianCamps: {},
    beasts: { mode: 'off', lairs: {}, sightingsByCiv: {} },
    tutorial: { ...initial.tutorial, active: false },
  };
  state = applyCityStep(state, {
    kind: 'city', civId: BUYER, position: WEST_POSITION,
    overrides: {
      id: WEST, name: 'Westport', buildings: ['factory'],
      fuelFallbackBuildingIds: ['factory'], idleProduction: 'science',
    },
  });
  state = applyCityStep(state, {
    kind: 'city', civId: BUYER, position: NORTH_POSITION,
    overrides: { id: NORTH, name: 'Northport', buildings: ['bank'], idleProduction: 'science' },
  });
  state = applyCityStep(state, {
    kind: 'city', civId: SELLER, position: SUPPLIER_POSITION,
    overrides: { id: SUPPLIER, name: 'Eastport' },
  });
  state = {
    ...state,
    commercePermissions: {
      ...state.commercePermissions!,
      resourcePolicies: [COAL, IRON].map(goodId => ({
        civId: SELLER, goodId, protectedReserve: 0, partnerCivIds: [BUYER],
      })),
    },
    materialReservesByCiv: {
      [BUYER]: { balances: {}, reservations: [], incoming: [] },
      [SELLER]: {
        balances: { [COAL]: { native: 30, imported: 0 }, [IRON]: { native: 30, imported: 0 } },
        reservations: [], incoming: [],
      },
    },
  };
  state = addTrader(state, WEST_TRADER, WEST_POSITION, WEST, COAL);
  state = addTrader(state, NORTH_TRADER, NORTH_POSITION, NORTH, IRON);

  const expeditionOrder = enqueueCityProduction(state, WEST, 'expedition');
  if (!expeditionOrder.ok) throw new ScenarioError(expeditionOrder.reason);
  const launch = rushBuyActiveProduction(expeditionOrder.state, BUYER, WEST, new EventBus());
  if (!launch.success) throw new ScenarioError(launch.message);
  const expedition = Object.values(launch.state.units).find(unit => unit.type === 'expedition' && unit.owner === BUYER);
  if (!expedition) throw new ScenarioError('The freight replay needs a funded Expedition.');
  const dispatched = executeUnitMove(launch.state, expedition.id, { q: 0, r: 7 }, { actor: 'player', civId: BUYER });
  if (!dispatched.ok) throw new ScenarioError(dispatched.reason);

  const funded = setMarketProcurementPolicy(dispatched.state, BUYER, {
    maxUnitPrice: 100, treasuryFloor: FREIGHT_REPLAY.protectedGold,
  });
  const harbor = enqueueCityProduction(funded, NORTH, 'harbor');
  if (!harbor.ok) throw new ScenarioError(harbor.reason);
  const productionProgress = getProductionCostForCivItem(harbor.state, BUYER, NORTH, 'harbor') - 18;
  return {
    ...harbor.state,
    cities: { ...harbor.state.cities, [NORTH]: { ...harbor.state.cities[NORTH], productionProgress } },
  };
}
