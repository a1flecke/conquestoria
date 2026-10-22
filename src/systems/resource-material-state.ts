// src/systems/resource-material-state.ts
// #1506 MR09: the one starting-state owner for the material reserve economy.
//
// Three separate jobs share this module so they cannot drift:
//
//  - a fresh game's bounded native seed (current-schema initialization, no grants);
//  - the neutral per-city occurrence bookkeeping every city starts with;
//  - a read boundary that treats an absent ledger as *empty*, never as an excuse to seed or grant.
//
// The historical transition is deliberately NOT here: `storage/migrations/steps/material-reserves.ts`
// owns the one-time 35→36 seed + active-work grants. Game creation must not import the migration graph,
// and migration must not re-run creation's seed on an already-current save.
import type { GameState } from '@/core/types';
import {
  createNeutralCityProductionMaterials,
  type CityProductionMaterials,
  type ReserveLedger,
  type TradeGoodId,
} from '@/core/types/commerce';
import {
  DEFAULT_NATIVE_PER_SOURCE_PER_ROUND,
  DEFAULT_STORAGE_PER_GOOD,
  findTradeGood,
  isStoredQuantityGood,
  resourceGoodId,
} from './trade-good-definitions';
import { listResourceSources } from './resource-source-eligibility';
import { accrueNativeStock, createEmptyReserveLedger, getStorageHeadroom } from './resource-reserve-system';

/** A ledger that has never accrued. The new phase advances this exactly once per completed round. */
export const NO_MATERIAL_ACCRUAL_TURN = -1;

/** Neutral occurrence identity + no commitment. Re-exported so city creation and migration share it. */
export function createNeutralCityMaterials(): CityProductionMaterials {
  return createNeutralCityProductionMaterials();
}

/**
 * Native source counts per *quantitative* good, from the shared source predicate. `allowCityCenter`
 * is correct here: the city-center exception is a legitimate native source for access and for the
 * reserve seed. Purchased access is never a source, and the helper already deduplicates by coordinate.
 */
export function countNativeSourcesByGood(
  state: GameState,
  civId: string,
): Record<TradeGoodId, number> {
  const counts: Record<TradeGoodId, number> = {};
  for (const source of listResourceSources(state, civId, { allowCityCenter: true })) {
    const goodId = resourceGoodId(source.resource);
    const good = findTradeGood(goodId);
    if (!good || !isStoredQuantityGood(good)) continue;
    counts[goodId] = (counts[goodId] ?? 0) + 1;
  }
  return counts;
}

/**
 * The bounded starter reserve: `min(capacity, sources × perSource)` native units per owned,
 * revealed quantitative good. No imported stock and no migration grant ever seeds a fresh game.
 */
export function buildStartingMaterialLedger(state: GameState, civId: string): ReserveLedger {
  let ledger = createEmptyReserveLedger();
  for (const [goodId, sources] of Object.entries(countNativeSourcesByGood(state, civId))) {
    const profile = findTradeGood(goodId)?.quantity;
    const capacity = profile?.storageCapacity ?? DEFAULT_STORAGE_PER_GOOD;
    const perSource = profile?.nativePerSourcePerRound ?? DEFAULT_NATIVE_PER_SOURCE_PER_ROUND;
    const amount = Math.min(capacity, sources * perSource);
    if (amount <= 0) continue;
    const accrued = accrueNativeStock(ledger, goodId, amount);
    if (accrued.ok) ledger = accrued.ledger;
  }
  return { ...ledger, lastAccruedTurn: NO_MATERIAL_ACCRUAL_TURN };
}

/**
 * Current-schema initialization for a game that has just been created. Mutates the fresh state in
 * place (both creation functions call it once, at the end), seeds only living civs, and never creates
 * a grant or an incoming claim.
 */
export function initializeMaterialState(state: GameState): void {
  const ledgers: Record<string, ReserveLedger> = {};
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    if (civ.isEliminated) continue;
    ledgers[civId] = buildStartingMaterialLedger(state, civId);
  }
  state.materialReservesByCiv = ledgers;

  for (const city of Object.values(state.cities)) {
    if (!city.productionMaterials) {
      city.productionMaterials = createNeutralCityMaterials();
    }
  }
}

/**
 * Read boundary for every production/UI/AI consumer. An absent ledger is empty — current-schema
 * initialization or the one-time migration is the only writer that may seed it. A read never grants.
 */
export function getCivMaterialLedger(state: GameState, civId: string): ReserveLedger {
  return state.materialReservesByCiv?.[civId] ?? createEmptyReserveLedger();
}

/**
 * #1506 MR09 task 5 — one completed round of native extraction for one living civ.
 *
 * Revealed, usable, deduplicated sources only (the shared predicate), `min(headroom, sources × rate)` per
 * quantitative good. Headroom subtracts stored **and incoming claims**, so a bought manifest's reserved
 * space cannot be filled by domestic extraction. Already-owned overflow is retained and accrues nothing
 * until there is room. `lastAccruedTurn` is written in the same transition, making a repeat entry in the
 * same round a no-op; a later completed round accrues exactly once.
 */
export function accrueNativeStockForCompletedRound(
  state: GameState,
  civId: string,
  turn: number,
): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.isEliminated) return state;
  const ledger = getCivMaterialLedger(state, civId);
  if (ledger.lastAccruedTurn === turn) return state;

  let next = ledger;
  for (const [goodId, sources] of Object.entries(countNativeSourcesByGood(state, civId))) {
    const profile = findTradeGood(goodId)?.quantity;
    const capacity = profile?.storageCapacity ?? DEFAULT_STORAGE_PER_GOOD;
    const perSource = profile?.nativePerSourcePerRound ?? DEFAULT_NATIVE_PER_SOURCE_PER_ROUND;
    const amount = Math.min(getStorageHeadroom(next, goodId, capacity), sources * perSource);
    if (amount <= 0) continue;
    const accrued = accrueNativeStock(next, goodId, amount);
    if (accrued.ok) next = accrued.ledger;
  }

  return {
    ...state,
    materialReservesByCiv: {
      ...(state.materialReservesByCiv ?? {}),
      [civId]: { ...next, lastAccruedTurn: turn },
    },
  };
}
