// src/systems/resource-material-costs.ts
// #1506 MR09: the one hard-material recipe authority and its pure evaluator.
//
// Every item that needs counted stock names it in `materialCosts` on its catalog entry. This module
// turns those rows into an aggregated, validated recipe and offers the arithmetic every consumer
// (production, rush-buy, upgrades, AI, UI) must share:
//
//   getMaterialRecipe(itemId)        -> discriminated known/unknown lookup, aggregated rows
//   evaluateMaterialFunding(...)     -> required / committed / available / missing per row
//   reserveMaterialRecipe(...)       -> all-or-nothing reservation of every row
//   consumeMaterialRecipe(...)       -> all-or-nothing spend of every row
//
// Nothing here mutates state, reads a save, or renders. `resourceRequired` on the catalogs is a
// derived compatibility projection of the same data, never a second editable list.
import type { MaterialCostRow, TradeGoodId } from '@/core/types/commerce';
import { BUILDINGS } from './city-building-catalog';
import { TRAINABLE_UNITS } from './city-unit-catalog';
import {
  consumeStock,
  getFreeQuantity,
  releaseStock,
  reserveStock,
  type ProductionMaterialRef,
  type ReserveLedger,
  type ReserveRefusalReason,
  type ReserveResult,
} from './resource-reserve-system';
import { findTradeGood } from './trade-good-definitions';

export type MaterialRecipeKind = 'unit' | 'building';

export interface MaterialRecipe {
  itemId: string;
  kind: MaterialRecipeKind;
  /** Aggregated: a good appears at most once. Empty is a valid resource-free recipe. */
  rows: readonly MaterialCostRow[];
}

export type MaterialRecipeLookup =
  | { known: true; recipe: MaterialRecipe }
  | { known: false; itemId: string };

/**
 * Sum repeated good rows in first-seen order. Recipes are persisted/read through this so a caller
 * can never reserve 5 iron twice and pay 5 instead of 10.
 */
export function aggregateMaterialRows(rows: readonly MaterialCostRow[]): MaterialCostRow[] {
  const order: TradeGoodId[] = [];
  const totals = new Map<TradeGoodId, number>();
  for (const row of rows) {
    if (!totals.has(row.goodId)) order.push(row.goodId);
    totals.set(row.goodId, (totals.get(row.goodId) ?? 0) + row.quantity);
  }
  return order.map(goodId => ({ goodId, quantity: totals.get(goodId) ?? 0 }));
}

function lookup(itemId: string): MaterialRecipe | null {
  const building = BUILDINGS[itemId];
  if (building) {
    return { itemId, kind: 'building', rows: aggregateMaterialRows(building.materialCosts ?? []) };
  }
  const unit = TRAINABLE_UNITS.find(candidate => candidate.type === itemId);
  if (unit) {
    return { itemId, kind: 'unit', rows: aggregateMaterialRows(unit.materialCosts ?? []) };
  }
  return null;
}

/** The single validated catalog lookup. An unknown item is a typed refusal, never a free recipe. */
export function getMaterialRecipe(itemId: string): MaterialRecipeLookup {
  const recipe = lookup(itemId);
  return recipe ? { known: true, recipe } : { known: false, itemId };
}

/**
 * Validate one aggregated recipe. Empty is valid (a known resource-free item). Rows must name a
 * known stored-quantity good with a material use and carry a positive safe-integer quantity.
 */
export function validateMaterialRecipe(recipe: MaterialRecipe): string[] {
  const errors: string[] = [];
  const seen = new Set<TradeGoodId>();
  for (const row of recipe.rows) {
    const label = `${recipe.itemId}: ${row.goodId || '<missing good>'}`;
    if (!row.goodId) {
      errors.push(`${recipe.itemId}: a material row must name a good`);
      continue;
    }
    if (seen.has(row.goodId)) {
      errors.push(`${label}: duplicate row must be aggregated before evaluation`);
    }
    seen.add(row.goodId);
    if (!Number.isSafeInteger(row.quantity) || row.quantity <= 0) {
      errors.push(`${label}: quantity must be a positive safe integer`);
    }
    const good = findTradeGood(row.goodId);
    if (!good) {
      errors.push(`${label}: unknown trade good`);
      continue;
    }
    if (good.settlement !== 'stored-quantity') {
      errors.push(`${label}: only a stored-quantity good can be a hard material`);
    }
    if (!good.uses.includes('material')) {
      errors.push(`${label}: the good has no material use`);
    }
  }
  return errors;
}

/** Validate every cataloged item's recipe. Empty means the hard catalog is coherent. */
export function validateMaterialCatalog(): string[] {
  const errors: string[] = [];
  const itemIds = [...Object.keys(BUILDINGS), ...TRAINABLE_UNITS.map(unit => unit.type)];
  for (const itemId of itemIds) {
    const found = getMaterialRecipe(itemId);
    if (found.known) errors.push(...validateMaterialRecipe(found.recipe));
  }
  return errors;
}

export interface MaterialFundingRow {
  goodId: TradeGoodId;
  /** Recipe quantity for this good (aggregated). */
  required: number;
  /** How much of `required` this item already holds in a reservation. */
  committed: number;
  /** Free stock plus this item's own commitment — what the item could pay with. */
  available: number;
  missing: number;
}

export interface MaterialFunding {
  itemId: string;
  rows: readonly MaterialFundingRow[];
  missingQuantity: number;
  funded: boolean;
}

/**
 * Pure funding projection. `ownCommitment` is the caller's existing reservation quantities: they are
 * not free stock, but they are already this item's to spend, so they count as available here.
 */
export function evaluateMaterialFunding(
  ledger: ReserveLedger,
  recipe: MaterialRecipe,
  ownCommitment: Readonly<Record<TradeGoodId, number>> = {},
): MaterialFunding {
  const rows = aggregateMaterialRows(recipe.rows).map(row => {
    const committed = ownCommitment[row.goodId] ?? 0;
    const available = getFreeQuantity(ledger, row.goodId) + committed;
    return {
      goodId: row.goodId,
      required: row.quantity,
      committed,
      available,
      missing: Math.max(0, row.quantity - available),
    };
  });
  const missingQuantity = rows.reduce((total, row) => total + row.missing, 0);
  return { itemId: recipe.itemId, rows, missingQuantity, funded: missingQuantity === 0 };
}

export interface MaterialReservation {
  goodId: TradeGoodId;
  reservationId: string;
}

export type ReserveMaterialRecipeResult =
  | { ok: true; ledger: ReserveLedger; reservations: readonly MaterialReservation[] }
  | { ok: false; ledger: ReserveLedger; missing: readonly MaterialFundingRow[] };

/** One occurrence of one item owns one reservation per good. */
export function defaultMaterialReservationId(
  consumer: ProductionMaterialRef,
  goodId: TradeGoodId,
): string {
  return `${consumer.cityId}:${consumer.occurrence}:${consumer.itemId}:${goodId}`;
}

/**
 * Reserve every row or none. The returned ledger is the input ledger on any failure, so no caller
 * can observe a half-funded recipe.
 */
export function reserveMaterialRecipe(
  ledger: ReserveLedger,
  recipe: MaterialRecipe,
  consumer: ProductionMaterialRef,
  reservationIdFor: (consumer: ProductionMaterialRef, goodId: TradeGoodId) => string = defaultMaterialReservationId,
): ReserveMaterialRecipeResult {
  const funding = evaluateMaterialFunding(ledger, recipe);
  if (!funding.funded) {
    return { ok: false, ledger, missing: funding.rows.filter(row => row.missing > 0) };
  }

  let next = ledger;
  const reservations: MaterialReservation[] = [];
  for (const row of funding.rows) {
    const reservationId = reservationIdFor(consumer, row.goodId);
    const result = reserveStock(next, {
      id: reservationId,
      goodId: row.goodId,
      ownerCivId: consumer.ownerCivId,
      amount: row.required,
      reason: 'active-production',
      consumer,
    });
    if (!result.ok) {
      return { ok: false, ledger, missing: [{ ...row, missing: row.required }] };
    }
    next = result.ledger;
    reservations.push({ goodId: row.goodId, reservationId });
  }
  return { ok: true, ledger: next, reservations };
}

export interface MaterialConsumption {
  goodId: TradeGoodId;
  imported: number;
  native: number;
}

export type ConsumeMaterialRecipeResult =
  | { ok: true; ledger: ReserveLedger; consumed: readonly MaterialConsumption[] }
  | { ok: false; ledger: ReserveLedger; reason: ReserveRefusalReason; goodId: TradeGoodId };

/**
 * Spend every row or none. `reservationIds` must name the reservation that holds each row for an
 * active item; a row without one is an unreserved free spend (free imported first, then native).
 */
export function consumeMaterialRecipe(
  ledger: ReserveLedger,
  recipe: MaterialRecipe,
  options: { reservationIds?: Readonly<Record<TradeGoodId, string>> } = {},
): ConsumeMaterialRecipeResult {
  let next = ledger;
  const consumed: MaterialConsumption[] = [];
  for (const row of aggregateMaterialRows(recipe.rows)) {
    const reservationId = options.reservationIds?.[row.goodId];
    const result = consumeStock(next, row.goodId, row.quantity, reservationId ? { reservationId } : {});
    if (!result.ok) {
      return { ok: false, ledger, reason: result.reason, goodId: row.goodId };
    }
    next = result.ledger;
    const spent = result.consumed ?? { imported: 0, native: 0 };
    consumed.push({ goodId: row.goodId, imported: spent.imported, native: spent.native });
  }
  return { ok: true, ledger: next, consumed };
}

/** Release every named reservation or none (the input ledger is returned on an unknown id). */
export function releaseMaterialRecipeReservations(
  ledger: ReserveLedger,
  reservationIds: readonly string[],
): ReserveResult {
  let next = ledger;
  for (const reservationId of reservationIds) {
    const result = releaseStock(next, reservationId);
    if (!result.ok) return { ok: false, ledger, reason: result.reason };
    next = result.ledger;
  }
  return { ok: true, ledger: next };
}
