import type { GameState } from '@/core/types';
import { createRng } from '@/systems/map-generator';
import { placeLateResources } from '@/systems/late-resource-placement';
import { createMarketplaceState } from '@/systems/trade-system';
import { BUILDINGS, TRAINABLE_UNITS } from '@/systems/city-system';
import { stableLegacyGameId } from './tech-identity';

/**
 * Schema 2 — place the late-era resource deposits that did not exist when the
 * save was written, seeded from the save's own `gameId` so the placement is
 * reproducible for that campaign.
 */

export function migrateLateResources(state: GameState): GameState {
  const gameId = state.gameId ?? stableLegacyGameId(state);
  const tiles = Object.fromEntries(Object.entries(state.map?.tiles ?? {}).map(([key, tile]) => [key, { ...tile }]));
  placeLateResources(
    tiles,
    createRng(`${gameId}-late-resources`),
    Object.values(state.cities ?? {}).map(city => city.position),
  );

  const defaults = createMarketplaceState();
  const marketplace = state.marketplace
    ? {
      ...state.marketplace,
      prices: { ...defaults.prices, ...state.marketplace.prices },
      priceHistory: { ...defaults.priceHistory, ...state.marketplace.priceHistory },
      purchasedResources: state.marketplace.purchasedResources ?? [],
    }
    : defaults;

  const cities = Object.fromEntries(Object.entries(state.cities ?? {}).map(([cityId, city]) => {
    const grandfathered = city.productionQueue.filter(item => {
      const building = BUILDINGS[item];
      const unit = TRAINABLE_UNITS.find(candidate => candidate.type === item);
      return (building?.resourceRequired?.length ?? unit?.resourceRequired?.length ?? 0) > 0;
    });
    return [cityId, grandfathered.length > 0
      ? { ...city, legacyResourceGrace: [...new Set([...(city.legacyResourceGrace ?? []), ...grandfathered])] }
      : city];
  }));

  return { ...state, gameId, map: { ...state.map, tiles }, marketplace, cities };
}
