import type { BuildableImprovementType, MarketplaceState, ResourceType, TradeRoute } from '@/core/types';

export interface ResourceDefinition {
  id: ResourceType;
  name: string;
  type: 'luxury' | 'strategic';
  terrain: string | string[];   // spawn terrain(s) — multi-terrain for furs, cattle, sheep
  basePrice: number;
  tech: string;
  icon: string;
  requiredImprovement: BuildableImprovementType;
}

export const RESOURCE_DEFINITIONS: ResourceDefinition[] = [
  // Luxury
  { id: 'silk',    name: 'Silk',    type: 'luxury',    terrain: 'grassland',            basePrice: 8,  tech: 'irrigation',       icon: '🧵', requiredImprovement: 'plantation' },
  { id: 'wine',    name: 'Wine',    type: 'luxury',    terrain: 'plains',               basePrice: 7,  tech: 'pottery',           icon: '🍇', requiredImprovement: 'plantation' },
  { id: 'spices',  name: 'Spices',  type: 'luxury',    terrain: 'jungle',               basePrice: 10, tech: 'cartography',       icon: '🌶️', requiredImprovement: 'plantation' },
  { id: 'gems',    name: 'Gems',    type: 'luxury',    terrain: 'hills',                basePrice: 12, tech: 'mining-tech',       icon: '💎', requiredImprovement: 'mine' },
  { id: 'ivory',   name: 'Ivory',   type: 'luxury',    terrain: 'forest',               basePrice: 9,  tech: 'foraging',          icon: '🐘', requiredImprovement: 'camp' },
  { id: 'incense', name: 'Incense', type: 'luxury',    terrain: 'desert',               basePrice: 6,  tech: 'currency',          icon: '🕯️', requiredImprovement: 'plantation' },
  { id: 'gold',    name: 'Gold',    type: 'luxury',    terrain: 'hills',                basePrice: 15, tech: 'currency',          icon: '⭐', requiredImprovement: 'mine' },
  { id: 'silver',  name: 'Silver',  type: 'luxury',    terrain: 'hills',                basePrice: 11, tech: 'mining-tech',       icon: '🥈', requiredImprovement: 'mine' },
  { id: 'furs',    name: 'Furs',    type: 'luxury',    terrain: ['forest', 'tundra'],   basePrice: 9,  tech: 'foraging',          icon: '🦊', requiredImprovement: 'camp' },
  { id: 'sheep',   name: 'Sheep',   type: 'luxury',    terrain: ['hills', 'plains'],    basePrice: 7,  tech: 'animal-husbandry',  icon: '🐑', requiredImprovement: 'pasture' },
  // Strategic
  { id: 'copper',  name: 'Copper',  type: 'strategic', terrain: 'hills',                basePrice: 5,  tech: 'stone-weapons',     icon: '🪙', requiredImprovement: 'mine' },
  { id: 'iron',    name: 'Iron',    type: 'strategic', terrain: 'hills',                basePrice: 8,  tech: 'bronze-working',    icon: '⚙️', requiredImprovement: 'mine' },
  { id: 'horses',  name: 'Horses',  type: 'strategic', terrain: 'plains',               basePrice: 7,  tech: 'animal-husbandry',  icon: '🐎', requiredImprovement: 'pasture' },
  { id: 'stone',   name: 'Stone',   type: 'strategic', terrain: 'mountain',             basePrice: 4,  tech: 'gathering',         icon: '🪨', requiredImprovement: 'quarry' },
  { id: 'cattle',  name: 'Cattle',  type: 'strategic', terrain: ['grassland', 'plains'],basePrice: 5,  tech: 'domestication',     icon: '🐄', requiredImprovement: 'pasture' },
  { id: 'salt',    name: 'Salt',    type: 'strategic', terrain: 'hills',                basePrice: 5,  tech: 'pottery',           icon: '🧂', requiredImprovement: 'mine' },
];

export const BASE_PRICES: Record<string, number> = {};
for (const r of RESOURCE_DEFINITIONS) {
  BASE_PRICES[r.id] = r.basePrice;
}

export const RESOURCE_ICONS: Record<string, string> = {};
export const RESOURCE_TECH: Record<string, string> = {};
for (const r of RESOURCE_DEFINITIONS) {
  RESOURCE_ICONS[r.id] = r.icon;
  RESOURCE_TECH[r.id] = r.tech;
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
