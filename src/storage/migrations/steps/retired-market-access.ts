import type { GameState } from '@/core/types';
import type { LuxuryServiceState } from '@/core/types/commerce';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * Schema 37 (#1516 MR19) — the instant access market is retired.
 *
 * A pre-containment save may still carry purchased access entries. Schema 36 already converted any
 * active production entitlement into material stock, so this step preserves only what the old entry
 * still means in the current model:
 *
 * - A luxury entry becomes delivered luxury-service coverage at its recorded expiry. That is access,
 *   which is exactly what the old entry granted, and it keeps the benefit running down visibly.
 * - A strategic entry is dropped. It never represented goods, and fabricating stock would invent a
 *   purchase the player did not make; any active work it entitled was already funded by schema 36.
 *
 * The list is cleared so no runtime branch reads it again.
 */
export function migrateRetiredMarketAccess(state: GameState): GameState {
  const entries = state.marketplace?.purchasedResources ?? [];
  if (entries.length === 0) return state;

  const coverageByCiv: Record<string, LuxuryServiceState> = { ...(state.luxuryServiceByCiv ?? {}) };
  for (const entry of entries) {
    if (entry.expiresOnTurn <= state.turn) continue;
    const definition = RESOURCE_DEFINITIONS.find(candidate => candidate.id === entry.resource);
    if (!definition || definition.type !== 'luxury') continue;
    const goodId = resourceGoodId(entry.resource);
    const existing = coverageByCiv[entry.civId] ?? { coverageByGood: {} };
    const current = existing.coverageByGood[goodId];
    coverageByCiv[entry.civId] = {
      ...existing,
      coverageByGood: {
        ...existing.coverageByGood,
        [goodId]: {
          goodId,
          expiresOnTurn: Math.max(current?.expiresOnTurn ?? 0, entry.expiresOnTurn),
          supplierCivIds: current?.supplierCivIds ?? [],
        },
      },
    };
  }

  return {
    ...state,
    marketplace: { ...state.marketplace!, purchasedResources: [] },
    ...(Object.keys(coverageByCiv).length > 0 ? { luxuryServiceByCiv: coverageByCiv } : {}),
  };
}
