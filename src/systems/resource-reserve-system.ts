// src/systems/resource-reserve-system.ts
// #1505 MR08: the reserve kernel — integer native/imported stock, commitments, incoming claims and
// the arithmetic every later consumer must share.
//
// #1506 MR09: reservations now lock their provenance. Before this, a reservation recorded only an
// amount and consumption chose provenance at spend time, so a different consumer could take the
// imported portion another item had already claimed. Each reservation therefore records the exact
// native/imported split it holds, and free/exportable quantities subtract commitments *by provenance*.
//
// Definitions the whole project reads from here:
//   stored     = native + imported
//   committedNative/Imported = sum of each reservation's locked split
//   free       = (native - committedNative) + (imported - committedImported)
//   exportable = max(0, freeNative - protectedReserve)   (imported stock never raises it)
//
// Invariants: every quantity is a nonnegative safe integer; a reservation can never exceed free
// stock; a release never happens twice; domestic consumption debits imported stock first, then
// native, and records that provenance; export may debit only native stock. Corrupt ledgers are
// rejected by `validateReserveLedger`, never silently clamped by `Math.max`.
import type {
  IncomingClaim,
  ReserveAllocation,
  ReserveBalance,
  ReserveLedger,
  ReserveReservation,
} from '@/core/types/commerce';
import type { TradeGoodId } from './trade-good-definitions';
import {
  DEFAULT_NATIVE_PER_SOURCE_PER_ROUND as STARTING_NATIVE_STOCK_PER_SOURCE,
  DEFAULT_STORAGE_PER_GOOD as BASE_STORAGE_PER_GOOD,
} from './trade-good-definitions';

/**
 * The quantity calibration lives in the trade-good catalog (#1506 MR09) so UI, AI, migration and the
 * kernel share one number. These names are the kernel's historical spellings, re-exported — never a
 * second copy.
 */
export {
  DEFAULT_NATIVE_PER_SOURCE_PER_ROUND as STARTING_NATIVE_STOCK_PER_SOURCE,
  DEFAULT_STORAGE_PER_GOOD as BASE_STORAGE_PER_GOOD,
} from './trade-good-definitions';

/**
 * #1506 MR09: the persisted reserve contracts now live in the `core/types/commerce` leaf so a save
 * shape can name them without importing this runtime module. Re-exported type-only for compatibility
 * with every existing kernel consumer.
 */
export type {
  IncomingClaim,
  ProductionMaterialRef,
  ReservationReason,
  ReserveAllocation,
  ReserveBalance,
  ReserveLedger,
  ReserveReservation,
} from '@/core/types/commerce';

/** What a caller asks for; the kernel computes `allocation` itself. */
export type ReserveReservationRequest = Omit<ReserveReservation, 'allocation'>;

export type ReserveRefusalReason =
  | 'not-an-integer'
  | 'negative-amount'
  | 'insufficient-free-stock'
  | 'insufficient-native-stock'
  | 'duplicate-reservation'
  | 'unknown-reservation'
  | 'missing-consumer'
  | 'invalid-grant'
  | 'invalid-allocation'
  | 'duplicate-claim';

export type ReserveResult =
  | { ok: true; ledger: ReserveLedger; consumed?: { imported: number; native: number } }
  | { ok: false; ledger: ReserveLedger; reason: ReserveRefusalReason };

export function createEmptyReserveLedger(): ReserveLedger {
  return { balances: {}, reservations: [], incoming: [] };
}

export function getReserveBalance(ledger: ReserveLedger, goodId: TradeGoodId): ReserveBalance {
  return ledger.balances[goodId] ?? { native: 0, imported: 0 };
}

export function getStoredQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  const balance = getReserveBalance(ledger, goodId);
  return balance.native + balance.imported;
}

export function getCommittedNativeQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return ledger.reservations
    .filter(reservation => reservation.goodId === goodId)
    .reduce((total, reservation) => total + reservation.allocation.native, 0);
}

export function getCommittedImportedQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return ledger.reservations
    .filter(reservation => reservation.goodId === goodId)
    .reduce((total, reservation) => total + reservation.allocation.imported, 0);
}

export function getCommittedQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return getCommittedNativeQuantity(ledger, goodId) + getCommittedImportedQuantity(ledger, goodId);
}

export function getIncomingQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return ledger.incoming
    .filter(claim => claim.goodId === goodId)
    .reduce((total, claim) => total + claim.amount, 0);
}

/** Native stock not held by a commitment. Corrupt ledgers may read negative; validation rejects them. */
export function getFreeNativeQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return getReserveBalance(ledger, goodId).native - getCommittedNativeQuantity(ledger, goodId);
}

/** Imported stock not held by a commitment. */
export function getFreeImportedQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return getReserveBalance(ledger, goodId).imported - getCommittedImportedQuantity(ledger, goodId);
}

/** Stored minus active commitments: what any consumer may actually spend. */
export function getFreeQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return getFreeNativeQuantity(ledger, goodId) + getFreeImportedQuantity(ledger, goodId);
}

/**
 * Free *native* stock after the protected reserve — the only quantity that may be exported.
 *
 * The reserve is subtracted from native free stock, never from the combined free stock: otherwise
 * imported units would silently satisfy part of the seller's protected reserve and increase exports
 * (#1508 golden fixture: native 30, committed 10, reserve 12 => 8 even with imported stock).
 */
export function getExportableQuantity(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  protectedReserve = 0,
): number {
  const freeNative = getFreeNativeQuantity(ledger, goodId);
  return Math.max(0, freeNative - Math.max(0, protectedReserve));
}

/** Room for new stock, counting incoming claims that will need the same space on arrival. */
export function getStorageHeadroom(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  capacity = BASE_STORAGE_PER_GOOD,
): number {
  return Math.max(0, capacity - getStoredQuantity(ledger, goodId) - getIncomingQuantity(ledger, goodId));
}

function withBalance(ledger: ReserveLedger, goodId: TradeGoodId, balance: ReserveBalance): ReserveLedger {
  return { ...ledger, balances: { ...ledger.balances, [goodId]: balance } };
}

function refuse(ledger: ReserveLedger, reason: ReserveRefusalReason): ReserveResult {
  return { ok: false, ledger, reason };
}

function isCount(value: number): boolean {
  return Number.isSafeInteger(value) && value >= 0;
}

function validAmount(ledger: ReserveLedger, amount: number): ReserveResult | null {
  if (!Number.isSafeInteger(amount)) return refuse(ledger, 'not-an-integer');
  if (amount < 0) return refuse(ledger, 'negative-amount');
  return null;
}

/** Native accrual from a civ's own sources. Raw arithmetic: the live accrual owner applies the cap. */
export function accrueNativeStock(ledger: ReserveLedger, goodId: TradeGoodId, amount: number): ReserveResult {
  const invalid = validAmount(ledger, amount);
  if (invalid) return invalid;
  if (amount === 0) return { ok: true, ledger };
  const balance = getReserveBalance(ledger, goodId);
  return { ok: true, ledger: withBalance(ledger, goodId, { ...balance, native: balance.native + amount }) };
}

/**
 * Claim receiving space for a manifest that is still in transit. The claim is *not* usable stock: it
 * exists so domestic extraction cannot fill the space a buyer already paid for.
 */
export function claimIncomingStock(
  ledger: ReserveLedger,
  claim: Omit<IncomingClaim, 'amount'> & { amount: number },
  capacity = BASE_STORAGE_PER_GOOD,
): ReserveResult {
  const invalid = validAmount(ledger, claim.amount);
  if (invalid) return invalid;
  if (claim.amount === 0) return { ok: true, ledger };
  if (ledger.incoming.some(candidate => candidate.id === claim.id)) {
    return refuse(ledger, 'duplicate-claim');
  }
  if (getStorageHeadroom(ledger, claim.goodId, capacity) < claim.amount) {
    return refuse(ledger, 'insufficient-free-stock');
  }
  return { ok: true, ledger: { ...ledger, incoming: [...ledger.incoming, { ...claim }] } };
}

/** Arrival: the claim becomes imported stock exactly once. Unknown or already-settled claims are no-ops. */
export function deliverIncomingStock(ledger: ReserveLedger, claimId: string): ReserveResult {
  const claim = ledger.incoming.find(candidate => candidate.id === claimId);
  if (!claim) return refuse(ledger, 'unknown-reservation');
  const remaining = ledger.incoming.filter(candidate => candidate.id !== claimId);
  const balance = getReserveBalance(ledger, claim.goodId);
  const next = withBalance({ ...ledger, incoming: remaining }, claim.goodId, {
    ...balance,
    imported: balance.imported + claim.amount,
  });
  return { ok: true, ledger: next };
}

/**
 * Credit delivered imported stock exactly once. Capacity is the caller's rule because the caller
 * owns the good's capacity profile and the receiving manifest; the kernel only keeps provenance.
 */
export function creditImportedStock(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  amount: number,
): ReserveResult {
  const invalid = validAmount(ledger, amount);
  if (invalid) return invalid;
  if (amount === 0) return { ok: true, ledger };
  const balance = getReserveBalance(ledger, goodId);
  return { ok: true, ledger: withBalance(ledger, goodId, { ...balance, imported: balance.imported + amount }) };
}

/** Destruction in transit: the claim disappears and no stock is credited. */
export function destroyIncomingStock(ledger: ReserveLedger, claimId: string): ReserveResult {
  if (!ledger.incoming.some(candidate => candidate.id === claimId)) {
    return refuse(ledger, 'unknown-reservation');
  }
  return { ok: true, ledger: { ...ledger, incoming: ledger.incoming.filter(candidate => candidate.id !== claimId) } };
}

/**
 * Reserve stock for a consumer. The kernel computes and locks the provenance split — free imported
 * first, then free native — so a later consumer cannot take the imported portion this item holds.
 */
export function reserveStock(ledger: ReserveLedger, request: ReserveReservationRequest): ReserveResult {
  const invalid = validAmount(ledger, request.amount);
  if (invalid) return invalid;
  if (request.amount === 0) {
    return { ok: true, ledger };
  }
  if (ledger.reservations.some(candidate => candidate.id === request.id)) {
    return refuse(ledger, 'duplicate-reservation');
  }
  // A production commitment names its consumer; only the generic protected-reserve use may omit one.
  if (request.reason !== 'protected-reserve' && !request.consumer) {
    return refuse(ledger, 'missing-consumer');
  }
  // Restricted transition assistance is imported-only and can only tag a migration grant.
  if (request.migrationGrantImported !== undefined) {
    if (
      request.reason !== 'migration-grant'
      || !isCount(request.migrationGrantImported)
      || request.migrationGrantImported <= 0
    ) {
      return refuse(ledger, 'invalid-grant');
    }
  }

  const freeImported = getFreeImportedQuantity(ledger, request.goodId);
  const freeNative = getFreeNativeQuantity(ledger, request.goodId);
  if (freeImported + freeNative < request.amount) {
    return refuse(ledger, 'insufficient-free-stock');
  }
  const imported = Math.min(freeImported, request.amount);
  const allocation: ReserveAllocation = { imported, native: request.amount - imported };

  if (request.migrationGrantImported !== undefined && request.migrationGrantImported > allocation.imported) {
    return refuse(ledger, 'invalid-grant');
  }

  const reservation: ReserveReservation = { ...request, allocation };
  return { ok: true, ledger: { ...ledger, reservations: [...ledger.reservations, reservation] } };
}

/**
 * Release a commitment. Releasing the same reservation twice is an explicit no-op, not a refund.
 * A migration grant's tag is extinguished with the reservation; stock balances never change.
 */
export function releaseStock(ledger: ReserveLedger, reservationId: string): ReserveResult {
  if (!ledger.reservations.some(candidate => candidate.id === reservationId)) {
    return refuse(ledger, 'unknown-reservation');
  }
  return { ok: true, ledger: { ...ledger, reservations: ledger.reservations.filter(candidate => candidate.id !== reservationId) } };
}

export interface ConsumeOptions {
  /** Spend against this commitment's locked split instead of free stock. */
  reservationId?: string;
}

/**
 * Spend stock deterministically. An unreserved spend takes free imported first, then free native —
 * it can never touch another commitment. A reserved spend uses the reservation's locked split, with
 * its restricted grant portion consumed first. Records provenance and never produces a negative
 * balance.
 */
export function consumeStock(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  amount: number,
  options: ConsumeOptions = {},
): ReserveResult {
  const invalid = validAmount(ledger, amount);
  if (invalid) return invalid;
  if (amount === 0) return { ok: true, ledger, consumed: { imported: 0, native: 0 } };

  if (options.reservationId) {
    const reservation = ledger.reservations.find(candidate => candidate.id === options.reservationId);
    if (!reservation || reservation.goodId !== goodId) return refuse(ledger, 'unknown-reservation');
    if (amount > reservation.amount) return refuse(ledger, 'insufficient-free-stock');

    const balance = getReserveBalance(ledger, goodId);
    const grant = reservation.migrationGrantImported ?? 0;
    // Restricted assistance first, then the reservation's ordinary imported split, then native.
    const grantSpend = Math.min(grant, amount);
    const importedSpend = Math.min(reservation.allocation.imported, amount - grantSpend);
    const nativeSpend = amount - grantSpend - importedSpend;
    if (nativeSpend > reservation.allocation.native) return refuse(ledger, 'insufficient-free-stock');

    const remaining = reservation.amount - amount;
    const nextReservation: ReserveReservation = {
      ...reservation,
      amount: remaining,
      allocation: {
        imported: reservation.allocation.imported - grantSpend - importedSpend,
        native: reservation.allocation.native - nativeSpend,
      },
      ...(grant - grantSpend > 0 ? { migrationGrantImported: grant - grantSpend } : { migrationGrantImported: undefined }),
    };
    const next = withBalance(ledger, goodId, {
      native: balance.native - nativeSpend,
      imported: balance.imported - grantSpend - importedSpend,
    });
    return {
      ok: true,
      ledger: {
        ...next,
        reservations: remaining > 0
          ? next.reservations.map(candidate => candidate.id === reservation.id ? nextReservation : candidate)
          : next.reservations.filter(candidate => candidate.id !== reservation.id),
      },
      consumed: { imported: grantSpend + importedSpend, native: nativeSpend },
    };
  }

  const freeImported = getFreeImportedQuantity(ledger, goodId);
  const freeNative = getFreeNativeQuantity(ledger, goodId);
  if (freeImported + freeNative < amount) return refuse(ledger, 'insufficient-free-stock');
  const fromImported = Math.min(freeImported, amount);
  const fromNative = amount - fromImported;
  if (fromNative > freeNative) return refuse(ledger, 'insufficient-free-stock');

  const balance = getReserveBalance(ledger, goodId);
  return {
    ok: true,
    ledger: withBalance(ledger, goodId, {
      native: balance.native - fromNative,
      imported: balance.imported - fromImported,
    }),
    consumed: { imported: fromImported, native: fromNative },
  };
}

/** Export may debit native stock only — imported stock is never re-exportable. */
export function spendNativeForExport(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  amount: number,
  protectedReserve = 0,
): ReserveResult {
  const invalid = validAmount(ledger, amount);
  if (invalid) return invalid;
  if (amount === 0) return { ok: true, ledger };
  if (getExportableQuantity(ledger, goodId, protectedReserve) < amount) {
    return refuse(ledger, 'insufficient-native-stock');
  }
  const balance = getReserveBalance(ledger, goodId);
  return { ok: true, ledger: withBalance(ledger, goodId, { ...balance, native: balance.native - amount }) };
}

/** Structural validation for a persisted ledger. Empty means valid. */
export function validateReserveLedger(ledger: ReserveLedger): string[] {
  const errors: string[] = [];
  const reservationIds = new Set<string>();
  const claimIds = new Set<string>();

  for (const [goodId, balance] of Object.entries(ledger.balances)) {
    if (!isCount(balance.native)) errors.push(`${goodId}: native stock must be a nonnegative integer`);
    if (!isCount(balance.imported)) errors.push(`${goodId}: imported stock must be a nonnegative integer`);
  }
  if (ledger.lastAccruedTurn !== undefined && !Number.isSafeInteger(ledger.lastAccruedTurn)) {
    errors.push('lastAccruedTurn must be a safe integer when present');
  }
  for (const reservation of ledger.reservations) {
    if (reservationIds.has(reservation.id)) errors.push(`duplicate reservation id ${reservation.id}`);
    reservationIds.add(reservation.id);
    if (!isCount(reservation.amount)) errors.push(`${reservation.id}: amount must be a nonnegative integer`);
    const allocation = reservation.allocation;
    if (!isCount(allocation.native) || !isCount(allocation.imported)) {
      errors.push(`${reservation.id}: allocation must be nonnegative integers`);
    } else if (allocation.native + allocation.imported !== reservation.amount) {
      errors.push(`${reservation.id}: allocation must sum to the committed amount`);
    }
    if (reservation.reason !== 'protected-reserve' && !reservation.consumer) {
      errors.push(`${reservation.id}: ${reservation.reason} requires a production consumer`);
    }
    if (reservation.migrationGrantImported !== undefined) {
      if (
        reservation.reason !== 'migration-grant'
        || !isCount(reservation.migrationGrantImported)
        || reservation.migrationGrantImported > allocation.imported
      ) {
        errors.push(`${reservation.id}: invalid restricted migration grant`);
      }
    }
  }
  for (const claim of ledger.incoming) {
    if (claimIds.has(claim.id)) errors.push(`duplicate incoming claim id ${claim.id}`);
    claimIds.add(claim.id);
    if (!isCount(claim.amount)) errors.push(`${claim.id}: amount must be a nonnegative integer`);
  }
  for (const goodId of new Set(ledger.reservations.map(reservation => reservation.goodId))) {
    const balance = getReserveBalance(ledger, goodId);
    if (getCommittedNativeQuantity(ledger, goodId) > balance.native) {
      errors.push(`${goodId}: reserved more native stock than is stored`);
    }
    if (getCommittedImportedQuantity(ledger, goodId) > balance.imported) {
      errors.push(`${goodId}: reserved more imported stock than is stored`);
    }
    const granted = ledger.reservations
      .filter(reservation => reservation.goodId === goodId)
      .reduce((total, reservation) => total + (reservation.migrationGrantImported ?? 0), 0);
    if (granted > balance.imported) {
      errors.push(`${goodId}: migration grant exceeds imported stock`);
    }
  }
  return errors;
}

export type StartingNativeStock = Record<TradeGoodId, number>;

/**
 * The MR09 starter reserve: a bounded native seed for every good whose sources the civ actually owns.
 * A reserve never starts with imported stock, and the seed is a function of *source count*, not of a
 * stored number, so it can be computed once at migration and never re-granted on reload. The live
 * caller applies the storage cap; this pure helper does not clamp.
 */
export function computeStartingNativeStock(
  sourceCounts: Readonly<Record<TradeGoodId, number>>,
  perSource = STARTING_NATIVE_STOCK_PER_SOURCE,
): StartingNativeStock {
  const stock: StartingNativeStock = {};
  for (const [goodId, count] of Object.entries(sourceCounts)) {
    const sources = Math.max(0, Math.floor(count));
    const amount = sources * perSource;
    if (amount > 0) stock[goodId] = amount;
  }
  return stock;
}

/** Build the empty-then-seeded ledger MR09 will persist for a civilization. */
export function createStartingReserveLedger(startingStock: StartingNativeStock): ReserveLedger {
  let ledger = createEmptyReserveLedger();
  for (const [goodId, amount] of Object.entries(startingStock)) {
    const result = accrueNativeStock(ledger, goodId, amount);
    if (result.ok) ledger = result.ledger;
  }
  return ledger;
}
