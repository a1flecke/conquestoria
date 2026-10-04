// src/systems/marketplace-system.ts
// #1249: marketplace pricing, supply/demand updates and the fashion cycle. Reads only the resource
// catalog; it knows nothing about trade routes.
import type { MarketplaceState } from '@/core/types';
import { RESOURCE_DEFINITIONS } from './resource-definitions';

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
    purchasedResources: [],
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
