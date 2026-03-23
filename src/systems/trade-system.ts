import type { MarketplaceState, ResourceType, TradeRoute } from '@/core/types';

export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string;       // terrain it spawns on
  basePrice: number;
}

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  // Luxury
  { id: 'silk', name: 'Silk', type: 'luxury', terrain: 'grassland', basePrice: 8 },
  { id: 'wine', name: 'Wine', type: 'luxury', terrain: 'plains', basePrice: 7 },
  { id: 'spices', name: 'Spices', type: 'luxury', terrain: 'jungle', basePrice: 10 },
  { id: 'gems', name: 'Gems', type: 'luxury', terrain: 'hills', basePrice: 12 },
  { id: 'ivory', name: 'Ivory', type: 'luxury', terrain: 'forest', basePrice: 9 },
  { id: 'incense', name: 'Incense', type: 'luxury', terrain: 'desert', basePrice: 6 },
  // Strategic
  { id: 'copper', name: 'Copper', type: 'strategic', terrain: 'hills', basePrice: 5 },
  { id: 'iron', name: 'Iron', type: 'strategic', terrain: 'hills', basePrice: 8 },
  { id: 'horses', name: 'Horses', type: 'strategic', terrain: 'plains', basePrice: 7 },
  { id: 'stone', name: 'Stone', type: 'strategic', terrain: 'mountain', basePrice: 4 },
];

export const BASE_PRICES: Record<string, number> = {};
for (const r of RESOURCE_DEFINITIONS) {
  BASE_PRICES[r.id] = r.basePrice;
}

export function createMarketplaceState(): MarketplaceState {
  const prices: Record<string, number> = {};
  const priceHistory: Record<string, number[]> = {};
  for (const r of RESOURCE_DEFINITIONS) {
    prices[r.id] = r.basePrice;
    priceHistory[r.id] = [r.basePrice];
  }
  return {
    prices,
    priceHistory,
    fashionable: null,
    fashionTurnsLeft: 0,
    tradeRoutes: [],
  };
}

export function calculatePrice(
  basePrice: number,
  supply: number,
  demand: number,
  isMonopoly: boolean,
  isFashionable: boolean,
): number {
  let effectiveDemand = demand;
  if (isFashionable) effectiveDemand *= 2;

  const ratio = effectiveDemand > 0 && supply > 0
    ? effectiveDemand / supply
    : 1;

  // Dampened price movement
  const rawPrice = basePrice * (0.5 + 0.5 * ratio);
  let price = Math.round(rawPrice);

  if (isMonopoly) price *= 2;

  return Math.max(1, price);
}

export function detectMonopoly(
  playerSupply: number,
  totalSupply: number,
): boolean {
  if (totalSupply === 0) return false;
  return playerSupply / totalSupply >= 0.6;
}

export function calculateTradeRouteGold(
  distance: number,
  resourceDiversity: number,
): number {
  const base = 2;
  const distBonus = Math.min(distance, 10);
  const diversityBonus = Math.min(resourceDiversity, 5);
  return base + Math.floor(distBonus / 3) + diversityBonus;
}

export function updatePrices(
  marketplace: MarketplaceState,
  supplies: Record<string, number>,
  demands: Record<string, number>,
): MarketplaceState {
  const newPrices = { ...marketplace.prices };
  const newHistory = { ...marketplace.priceHistory };

  for (const r of RESOURCE_DEFINITIONS) {
    const supply = supplies[r.id] ?? 1;
    const demand = demands[r.id] ?? 1;
    const isMonopoly = false; // would need player-specific context
    const isFashionable = marketplace.fashionable === r.id;

    newPrices[r.id] = calculatePrice(r.basePrice, supply, demand, isMonopoly, isFashionable);

    const history = [...(newHistory[r.id] ?? []), newPrices[r.id]];
    newHistory[r.id] = history.slice(-20);
  }

  return {
    ...marketplace,
    prices: newPrices,
    priceHistory: newHistory,
  };
}

export function processFashionCycle(
  marketplace: MarketplaceState,
  rng: () => number,
): MarketplaceState {
  if (marketplace.fashionTurnsLeft > 0) {
    return {
      ...marketplace,
      fashionTurnsLeft: marketplace.fashionTurnsLeft - 1,
      fashionable: marketplace.fashionTurnsLeft === 1 ? null : marketplace.fashionable,
    };
  }

  // Random chance to start a new fashion cycle
  if (rng() < 0.05) { // ~5% per turn, avg every 20 turns
    const luxuries = RESOURCE_DEFINITIONS.filter(r => r.type === 'luxury');
    const chosen = luxuries[Math.floor(rng() * luxuries.length)];
    return {
      ...marketplace,
      fashionable: chosen.id,
      fashionTurnsLeft: 10,
    };
  }

  return marketplace;
}

export function processTradeRouteIncome(routes: TradeRoute[]): number {
  return routes.reduce((total, r) => total + r.goldPerTurn, 0);
}
