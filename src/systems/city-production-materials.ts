// src/systems/city-production-materials.ts
// #1506 MR09 task 4: the state adapter that owns a city's active material commitment.
//
// One active occurrence at a time. This module:
//  - projects the active item's recipe against the owner's ledger (funded / exact missing rows);
//  - begins a fresh occurrence on a real head transition (release the old commitment, advance the
//    occurrence token, atomically reserve the new head or leave it waiting);
//  - bumps the queue revision for an edit that does not change the head.
//
// It never mutates its input. Queue commands in `planning-system` call it; the production round
// phase calls `beginCityMaterialOccurrence` when a head actually completes or is removed.
import type { City, GameState } from '@/core/types';
import {
  createNeutralCityProductionMaterials,
  type ActiveMaterialCommitment,
  type MaterialCostRow,
  type ProductionMaterialRef,
  type ReserveLedger,
} from '@/core/types/commerce';
import {
  consumeMaterialRecipe,
  evaluateMaterialFunding,
  getMaterialRecipe,
  releaseMaterialReservation,
  reserveMaterialRecipe,
  type MaterialFundingRow,
} from './resource-material-costs';
import { getCivMaterialLedger } from './resource-material-state';

export interface CityMaterialProjection {
  itemId: string | null;
  recipe: readonly MaterialCostRow[];
  commitment: ActiveMaterialCommitment | null;
  /** True when the active item's full recipe is held (a resource-free item is trivially funded). */
  funded: boolean;
  missing: readonly MaterialFundingRow[];
}

function materialsOf(city: City) {
  return city.productionMaterials ?? createNeutralCityProductionMaterials();
}

function commitmentOf(city: City): ActiveMaterialCommitment | null {
  const materials = materialsOf(city);
  const commitment = materials.commitment;
  if (!commitment) return null;
  if (commitment.ref.cityId !== city.id || commitment.ref.ownerCivId !== city.owner) return null;
  if (commitment.ref.occurrence !== materials.activeOccurrence) return null;
  return commitment;
}

/** The item's quantity currently held by *this* commitment, so already-reserved work reads funded. */
function ownCommitmentByGood(
  ledger: ReserveLedger,
  commitment: ActiveMaterialCommitment | null,
): Record<string, number> {
  const own: Record<string, number> = {};
  if (!commitment) return own;
  for (const reservationId of commitment.reservationIds) {
    const reservation = ledger.reservations.find(candidate => candidate.id === reservationId);
    if (!reservation) continue;
    own[reservation.goodId] = (own[reservation.goodId] ?? 0) + reservation.amount;
  }
  return own;
}

/**
 * The player/AI-facing projection for this city's active item. No mutation, no rendering.
 * `missing` is empty for a legally plannable resource-free item.
 */
export function getCityMaterialProjection(state: GameState, cityId: string): CityMaterialProjection {
  const city = state.cities[cityId];
  if (!city) return { itemId: null, recipe: [], commitment: null, funded: false, missing: [] };
  const itemId = city.productionQueue[0] ?? null;
  if (!itemId) return { itemId: null, recipe: [], commitment: null, funded: true, missing: [] };

  const lookup = getMaterialRecipe(itemId);
  const recipe = lookup.known ? lookup.recipe.rows : [];
  const commitment = commitmentOf(city);
  if (recipe.length === 0) {
    return { itemId, recipe, commitment, funded: true, missing: [] };
  }
  const ledger = getCivMaterialLedger(state, city.owner);
  const funding = evaluateMaterialFunding(ledger, lookup.known ? lookup.recipe : { itemId, kind: 'unit', rows: [] }, ownCommitmentByGood(ledger, commitment));
  return {
    itemId,
    recipe,
    commitment,
    funded: funding.funded,
    missing: funding.rows.filter(row => row.missing > 0),
  };
}

function releaseCommitment(ledger: ReserveLedger, commitment: ActiveMaterialCommitment | null): ReserveLedger {
  if (!commitment) return ledger;
  let next = ledger;
  for (const reservationId of commitment.reservationIds) {
    if (!next.reservations.some(reservation => reservation.id === reservationId)) continue;
    const released = releaseMaterialReservation(next, reservationId);
    if (released.ok) next = released.ledger;
  }
  return next;
}

function withLedger(state: GameState, ownerCivId: string, ledger: ReserveLedger): GameState {
  return {
    ...state,
    materialReservesByCiv: { ...(state.materialReservesByCiv ?? {}), [ownerCivId]: ledger },
  };
}

function withCity(state: GameState, city: City): GameState {
  return { ...state, cities: { ...state.cities, [city.id]: city } };
}

/**
 * Release a city's active commitment without completing anything. Used when the city leaves the
 * current owner's control (capture/raze/transfer) or its head is replaced by a non-material item:
 * the old owner's stock returns to free, and any still-tagged migration grant expires rather than
 * becoming loot. Idempotent: a city with no commitment is unchanged.
 */
export function releaseCityMaterialCommitment(state: GameState, cityId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const materials = materialsOf(city);
  if (!materials.commitment) return state;
  const ledger = getCivMaterialLedger(state, city.owner);
  return withCity(withLedger(state, city.owner, releaseCommitment(ledger, materials.commitment)), {
    ...city,
    productionMaterials: { ...materials, commitment: null },
  });
}

/**
 * Spend the active occurrence's held recipe exactly once. This is the natural-completion transition:
 * the caller runs it on the candidate state **before** the completed unit/building and its events are
 * finalized. A missing or already-spent commitment is a no-op, never a second debit.
 */
export function consumeCityMaterialCommitment(state: GameState, cityId: string): GameState {
  return spendActiveMaterialRecipe(state, cityId).state;
}

/**
 * #1506 MR09 task 6: the explicit, all-or-nothing spend used by natural completion, rush-buy and
 * upgrades. It prefers the occurrence's locked reservation; a funded head without one (a free
 * recipe, or a migrated/queued item with free stock) spends free provenance. `ok` is false only
 * when a required spend failed, so a caller can abort the whole transaction instead of completing
 * an unpaid item.
 */
export function spendActiveMaterialRecipe(state: GameState, cityId: string): { ok: boolean; state: GameState } {
  const city = state.cities[cityId];
  if (!city) return { ok: true, state };
  const itemId = city.productionQueue[0];
  if (!itemId) return { ok: true, state };

  const commitment = commitmentOf(city);
  const ledger = getCivMaterialLedger(state, city.owner);
  if (commitment) {
    const reservationIds: Record<string, string> = {};
    for (const reservationId of commitment.reservationIds) {
      const reservation = ledger.reservations.find(candidate => candidate.id === reservationId);
      if (reservation) reservationIds[reservation.goodId] = reservationId;
    }
    const spent = consumeMaterialRecipe(ledger, { itemId, kind: 'unit', rows: commitment.recipe }, { reservationIds });
    return spent.ok ? { ok: true, state: withLedger(state, city.owner, spent.ledger) } : { ok: false, state };
  }

  const lookup = getMaterialRecipe(itemId);
  if (!lookup.known || lookup.recipe.rows.length === 0) return { ok: true, state };
  const spent = consumeMaterialRecipe(ledger, lookup.recipe);
  return spent.ok ? { ok: true, state: withLedger(state, city.owner, spent.ledger) } : { ok: false, state };
}

/** A successful queue edit advances the revision, even when it only moves a tail item. */
export function advanceCityMaterialRevision(state: GameState, cityId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const materials = materialsOf(city);
  return withCity(state, { ...city, productionMaterials: { ...materials, queueRevision: materials.queueRevision + 1 } });
}

/**
 * A real head transition: release the old occurrence (expiring any migration assistance), advance the
 * occurrence token and atomically reserve the new head. An unfunded head is a legal waiting state,
 * never a partial reservation.
 */
export function beginCityMaterialOccurrence(state: GameState, cityId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const materials = materialsOf(city);
  const ownerLedger = getCivMaterialLedger(state, city.owner);
  let ledger = releaseCommitment(ownerLedger, materials.commitment);

  const occurrence = materials.activeOccurrence + 1;
  const itemId = city.productionQueue[0] ?? null;
  let commitment: ActiveMaterialCommitment | null = null;

  if (itemId) {
    const lookup = getMaterialRecipe(itemId);
    if (lookup.known && lookup.recipe.rows.length > 0) {
      const ref: ProductionMaterialRef = { ownerCivId: city.owner, cityId, occurrence, itemId };
      const reserved = reserveMaterialRecipe(ledger, lookup.recipe, ref);
      if (reserved.ok) {
        ledger = reserved.ledger;
        commitment = {
          ref,
          recipe: lookup.recipe.rows,
          reservationIds: reserved.reservations.map(reservation => reservation.reservationId),
        };
      }
      // A refusal leaves `ledger` as it was after the release: the item is waiting, not half-funded.
    }
  }

  return withCity(withLedger(state, city.owner, ledger), {
    ...city,
    productionMaterials: { ...materials, activeOccurrence: occurrence, commitment },
  });
}

/**
 * Idempotent repair for a city whose head changed outside a queue command (round normalization).
 * Preserves a matching commitment, releases a stale one, and funds the current head under the
 * existing occurrence — it does **not** advance the occurrence, so a tail-only drop cannot churn it.
 */
export function syncCityMaterialCommitment(state: GameState, cityId: string): GameState {
  const city = state.cities[cityId];
  if (!city) return state;
  const materials = materialsOf(city);
  const ledger = getCivMaterialLedger(state, city.owner);
  const itemId = city.productionQueue[0] ?? null;

  if (!itemId) {
    if (!materials.commitment) return state;
    return withCity(withLedger(state, city.owner, releaseCommitment(ledger, materials.commitment)), {
      ...city,
      productionMaterials: { ...materials, commitment: null },
    });
  }

  if (materials.commitment && materials.commitment.ref.itemId === itemId) {
    const allPresent = materials.commitment.reservationIds
      .every(reservationId => ledger.reservations.some(reservation => reservation.id === reservationId));
    if (allPresent) return state;
  }

  const released = releaseCommitment(ledger, materials.commitment);
  const lookup = getMaterialRecipe(itemId);
  if (!lookup.known || lookup.recipe.rows.length === 0) {
    return withCity(withLedger(state, city.owner, released), {
      ...city,
      productionMaterials: { ...materials, commitment: null },
    });
  }
  const ref: ProductionMaterialRef = {
    ownerCivId: city.owner,
    cityId,
    occurrence: materials.activeOccurrence,
    itemId,
  };
  const reserved = reserveMaterialRecipe(released, lookup.recipe, ref);
  const commitment = reserved.ok
    ? { ref, recipe: lookup.recipe.rows, reservationIds: reserved.reservations.map(reservation => reservation.reservationId) }
    : null;
  return withCity(withLedger(state, city.owner, reserved.ledger), {
    ...city,
    productionMaterials: { ...materials, commitment },
  });
}
