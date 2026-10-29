// src/systems/marketplace-system.ts
// #1249 / #1516 MR19: the retired global world-price and fashion cycle is gone. The marketplace
// state is now only the trade-route roster; posted prices live in the seller offer snapshot
// (`resource-market-offers.ts`) and never derive from a hidden world-supply mirror.
import type { MarketplaceState } from '@/core/types';

export function createMarketplaceState(): MarketplaceState {
  return { tradeRoutes: [] };
}
