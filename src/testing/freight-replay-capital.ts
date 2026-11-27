import type { EventBus } from '@/core/event-bus';
import { getCommercialPassagePermission } from '@/systems/commerce-permissions';
import { hasDiscoveredCity, hasExploredCoord } from '@/systems/discovery-system';
import { calculateCityBuildingMaintenance, getRushBuyQuote } from '@/systems/economy-system';
import { hexKey } from '@/systems/hex-utils';
import { getMarketProcurementPolicy } from '@/systems/resource-market-offers';
import { getCityFuelStatus, getFuelRunway } from '@/systems/resource-fuel-system';
import { getReserveBalance } from '@/systems/resource-reserve-system';
import { rushBuyActiveProduction } from '@/systems/rush-buy-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';
import { getNavalRouteTripRounds } from '@/systems/trade-route-travel';
import { FREIGHT_REPLAY as replay } from './scenario-steps/freight-replay';
import type { ScenarioState } from './scenario-types';

export type CapitalChoice = 'passage' | 'Harbor';

export interface CapitalOffer {
  choice: CapitalChoice;
  round: number;
  cost: number;
  currentRounds?: number;
  openRounds?: number;
  occurrence?: number;
}

function openPassage(state: ScenarioState): ScenarioState {
  const key = hexKey(replay.passage);
  const tile = state.map.tiles[key]!;
  return {
    ...state,
    map: { ...state.map, tiles: { ...state.map.tiles, [key]: { ...tile, freightPassage: { ...tile.freightPassage!, open: true } } } },
  };
}

function knownTrip(state: ScenarioState, trader: ScenarioState['units'][string]): number | undefined {
  const home = state.cities[replay.west];
  const atHome = { ...trader, position: home.position };
  // An unexplored shortcut cannot influence even the availability of a forecast.
  const tiles = Object.fromEntries(Object.entries(state.map.tiles)
    .filter(([, tile]) => hasExploredCoord(state, trader.owner, tile.coord)));
  const knownState = { ...state, map: { ...state.map, tiles } };
  const rounds = getNavalRouteTripRounds(knownState, atHome, replay.west, replay.supplier);
  return rounds ? rounds.outbound + rounds.inbound : undefined;
}

export function getCapitalComparison(state: ScenarioState, viewer: string) {
  const viewerCiv = state.civilizations[viewer];
  const west = state.cities[replay.west];
  const north = state.cities[replay.north];
  const channel = state.map.tiles[hexKey(replay.passage)]?.freightPassage;
  if (state.gameOver || viewer !== state.currentPlayer || !viewerCiv?.isHuman
    || west?.owner !== viewer || north?.owner !== viewer || channel?.id !== replay.passageId) return undefined;

  const protectedGold = getMarketProcurementPolicy(state, viewer).treasuryFloor;
  const freeGold = Math.max(0, viewerCiv.gold - protectedGold);
  const trader = state.units[replay.trader];
  const supplier = state.cities[replay.supplier];
  const route = state.marketplace?.tradeRoutes.find(candidate => candidate.id === trader?.committedToRouteId);
  const siteKnown = channel.ownerId === viewer && hasExploredCoord(state, viewer, replay.passage)
    && channel.approaches.every(coord => hasExploredCoord(state, viewer, coord));
  const serviceKnown = siteKnown && trader?.owner === viewer && trader.type === 'naval_trader'
    && route?.fromCityId === west.id && route.toCityId === supplier?.id
    && hasDiscoveredCity(state, viewer, supplier.id)
    && getCommercialPassagePermission(state, viewer, supplier.owner).allowed;
  const currentRounds = serviceKnown ? knownTrip(state, trader) : undefined;
  const openRounds = serviceKnown && !channel.open ? knownTrip(openPassage(state), trader) : undefined;
  const harborQuote = getRushBuyQuote(state, viewer, north.id);
  const passage: CapitalOffer | undefined = currentRounds !== undefined && openRounds !== undefined
    && openRounds < currentRounds && freeGold >= replay.passageCost
    ? { choice: 'passage', round: state.turn, cost: replay.passageCost, currentRounds, openRounds }
    : undefined;
  const harbor: CapitalOffer | undefined = harborQuote.available && harborQuote.itemId === 'harbor' && harborQuote.cost <= freeGold
    ? { choice: 'Harbor', round: state.turn, cost: harborQuote.cost, occurrence: north.productionMaterials?.activeOccurrence ?? 0 }
    : undefined;
  const reserves = state.materialReservesByCiv?.[viewer];
  const coalId = resourceGoodId('coal');
  const coal = reserves ? getReserveBalance(reserves, coalId).imported : 0;
  const harborBuilt = north.buildings.includes('harbor');
  const harborUpkeep = harborBuilt ? 0 : calculateCityBuildingMaintenance(state, {
    ...north, buildings: [...north.buildings, 'harbor'],
  }).upkeep - calculateCityBuildingMaintenance(state, north).upkeep;
  return {
    protectedGold, freeGold, westName: west.name, northName: north.name,
    coalSupplierName: serviceKnown ? supplier.name : undefined,
    currentRounds, openRounds, passage, harbor, coal,
    passageKnown: siteKnown,
    passageOpened: siteKnown && channel.open,
    harborBuilt,
    harborUpkeep,
    harborCost: harborQuote.itemId === 'harbor' && harborQuote.cost > 0 ? harborQuote.cost : undefined,
    factoryFueled: getCityFuelStatus(state, west).find(building => building.buildingId === 'factory')?.powered,
    factoryCoalReady: getFuelRunway(state, viewer, coalId).status === 'funded',
  };
}

type CapitalResult = { ok: true; state: ScenarioState }
  | { ok: false; reason: 'terms-changed' | 'purchase-refused'; message: string };

export function applyCapitalOffer(state: ScenarioState, viewer: string, expected: CapitalOffer, bus: EventBus): CapitalResult {
  const comparison = getCapitalComparison(state, viewer);
  const current = expected.choice === 'Harbor' ? comparison?.harbor : comparison?.passage;
  if (!current || current.round !== expected.round || current.cost !== expected.cost
    || current.currentRounds !== expected.currentRounds || current.openRounds !== expected.openRounds
    || current.occurrence !== expected.occurrence) {
    return { ok: false, reason: 'terms-changed', message: 'Terms changed. Review the current offer.' };
  }
  if (expected.choice === 'Harbor') {
    const purchase = rushBuyActiveProduction(state, viewer, replay.north, bus, { expectedOccurrence: current.occurrence });
    return purchase.success ? { ok: true, state: purchase.state }
      : { ok: false, reason: 'purchase-refused', message: purchase.message };
  }
  const opened = openPassage(state);
  const civ = opened.civilizations[viewer];
  return {
    ok: true,
    state: { ...opened, civilizations: { ...opened.civilizations, [viewer]: { ...civ, gold: civ.gold - current.cost } } },
  };
}
