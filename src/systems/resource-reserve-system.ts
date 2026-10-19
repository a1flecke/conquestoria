// src/systems/resource-reserve-system.ts
// #1505 MR08: the reserve kernel — integer native/imported stock, commitments, incoming claims and
// the arithmetic every later consumer must share.
//
// Deliberately *not* wired to `GameState` yet. The quantitative economy stays inactive until MR09
// ships its ordered migration, and the parent forbids seeding live persisted fields ahead of that
// migration. Everything here is a pure function over an explicit ledger, so MR09 can persist one
// ledger per civilization without re-deriving the rules.
//
// Definitions the whole project reads from here:
//   stored     = nativeStored + importedStored
//   committed  = materials reserved for active domestic production
//   free       = stored - committed
//   incoming   = owned manifests with a live path/home assignment
//   exportable = min(nativeFree, max(0, free - protectedReserve))
//
// Invariants: every quantity is a nonnegative integer, a reservation can never exceed free stock, and
// a release never happens twice. Domestic consumption debits imported stock first, then native stock,
// and records that provenance; export may debit only native stock.
import type { TradeGoodId } from './trade-good-definitions';

/** Base storage per quantitative good (parent §3.3 calibration candidate, one place to tune). */
export const BASE_STORAGE_PER_GOOD = 40;
/** Native stock a fresh reserve starts with per eligible source (MR09 seed profile). */
export const STARTING_NATIVE_STOCK_PER_SOURCE = 2;

export interface ReserveBalance {
  native: number;
  imported: number;
}

export type ReservationReason = 'active-production' | 'migration-grant' | 'protected-reserve';

export interface ReserveReservation {
  id: string;
  goodId: TradeGoodId;
  ownerCivId: string;
  amount: number;
  reason: ReservationReason;
}

/** A purchased manifest that will occupy storage on arrival. It is not usable stock yet. */
export interface IncomingClaim {
  id: string;
  goodId: TradeGoodId;
  ownerCivId: string;
  amount: number;
  routeId?: string;
}

export interface ReserveLedger {
  balances: Readonly<Record<TradeGoodId, ReserveBalance>>;
  reservations: readonly ReserveReservation[];
  incoming: readonly IncomingClaim[];
}

export type ReserveRefusalReason =
  | 'not-an-integer'
  | 'negative-amount'
  | 'insufficient-free-stock'
  | 'insufficient-native-stock'
  | 'duplicate-reservation'
  | 'unknown-reservation';

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

export function getCommittedQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return ledger.reservations
    .filter(reservation => reservation.goodId === goodId)
    .reduce((total, reservation) => total + reservation.amount, 0);
}

export function getIncomingQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return ledger.incoming
    .filter(claim => claim.goodId === goodId)
    .reduce((total, claim) => total + claim.amount, 0);
}

/** Stored minus active commitments: what is actually available to spend. */
export function getFreeQuantity(ledger: ReserveLedger, goodId: TradeGoodId): number {
  return Math.max(0, getStoredQuantity(ledger, goodId) - getCommittedQuantity(ledger, goodId));
}

/** Free *native* stock after the protected reserve — the only quantity that may be exported. */
export function getExportableQuantity(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  protectedReserve = 0,
): number {
  const balance = getReserveBalance(ledger, goodId);
  const committed = getCommittedQuantity(ledger, goodId);
  const nativeFree = Math.max(0, balance.native - committed);
  const free = Math.max(0, balance.native + balance.imported - committed);
  return Math.min(nativeFree, Math.max(0, free - Math.max(0, protectedReserve)));
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
  return Number.isInteger(value) && value >= 0;
}

/** Native accrual from a civ's own sources. */
export function accrueNativeStock(ledger: ReserveLedger, goodId: TradeGoodId, amount: number): ReserveResult {
  if (!Number.isInteger(amount)) return refuse(ledger, 'not-an-integer');
  if (amount < 0) return refuse(ledger, 'negative-amount');
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
  if (!Number.isInteger(claim.amount)) return refuse(ledger, 'not-an-integer');
  if (claim.amount < 0) return refuse(ledger, 'negative-amount');
  if (claim.amount === 0) return { ok: true, ledger };
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

/** Destruction in transit: the claim disappears and no stock is credited. */
export function destroyIncomingStock(ledger: ReserveLedger, claimId: string): ReserveResult {
  if (!ledger.incoming.some(candidate => candidate.id === claimId)) {
    return refuse(ledger, 'unknown-reservation');
  }
  return { ok: true, ledger: { ...ledger, incoming: ledger.incoming.filter(candidate => candidate.id !== claimId) } };
}

/** Reserve stock for a consumer. Fails rather than over-committing. */
export function reserveStock(
  ledger: ReserveLedger,
  reservation: ReserveReservation,
): ReserveResult {
  if (!Number.isInteger(reservation.amount)) return refuse(ledger, 'not-an-integer');
  if (reservation.amount < 0) return refuse(ledger, 'negative-amount');
  if (reservation.amount === 0) return { ok: true, ledger };
  if (ledger.reservations.some(candidate => candidate.id === reservation.id)) {
    return refuse(ledger, 'duplicate-reservation');
  }
  if (getFreeQuantity(ledger, reservation.goodId) < reservation.amount) {
    return refuse(ledger, 'insufficient-free-stock');
  }
  return { ok: true, ledger: { ...ledger, reservations: [...ledger.reservations, { ...reservation }] } };
}

/** Release a commitment. Releasing the same reservation twice is an explicit no-op, not a refund. */
export function releaseStock(ledger: ReserveLedger, reservationId: string): ReserveResult {
  if (!ledger.reservations.some(candidate => candidate.id === reservationId)) {
    return refuse(ledger, 'unknown-reservation');
  }
  return { ok: true, ledger: { ...ledger, reservations: ledger.reservations.filter(candidate => candidate.id !== reservationId) } };
}

export interface ConsumeOptions {
  /** Also release this commitment once the quantity is spent. */
  reservationId?: string;
}

/**
 * Spend stored stock deterministically: imported first, then native. Records the provenance so a
 * caller can report it. Refuses rather than producing a negative balance.
 */
export function consumeStock(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  amount: number,
  options: ConsumeOptions = {},
): ReserveResult {
  if (!Number.isInteger(amount)) return refuse(ledger, 'not-an-integer');
  if (amount < 0) return refuse(ledger, 'negative-amount');

  if (options.reservationId) {
    const reservation = ledger.reservations.find(candidate => candidate.id === options.reservationId);
    if (!reservation) return refuse(ledger, 'unknown-reservation');
    if (reservation.goodId !== goodId) return refuse(ledger, 'unknown-reservation');
    if (reservation.amount < amount) return refuse(ledger, 'insufficient-free-stock');
  }

  const balance = getReserveBalance(ledger, goodId);
  const committed = getCommittedQuantity(ledger, goodId);
  // Spending against a reservation is allowed to use its committed quantity.
  const spendableFromStock = options.reservationId ? balance.native + balance.imported : getFreeQuantity(ledger, goodId);
  if (spendableFromStock < amount) return refuse(ledger, 'insufficient-free-stock');

  const fromImported = Math.min(balance.imported, amount);
  const fromNative = amount - fromImported;
  if (fromNative > balance.native || (options.reservationId ? 0 : committed + amount > balance.native + balance.imported)) {
    return refuse(ledger, 'insufficient-free-stock');
  }

  let next = withBalance(ledger, goodId, {
    native: balance.native - fromNative,
    imported: balance.imported - fromImported,
  });
  if (options.reservationId) {
    const reservation = next.reservations.find(candidate => candidate.id === options.reservationId)!;
    const remaining = reservation.amount - amount;
    next = {
      ...next,
      reservations: remaining > 0
        ? next.reservations.map(candidate => candidate.id === reservation.id ? { ...candidate, amount: remaining } : candidate)
        : next.reservations.filter(candidate => candidate.id !== reservation.id),
    };
  }
  return { ok: true, ledger: next, consumed: { imported: fromImported, native: fromNative } };
}

/** Export may debit native stock only — imported stock is never re-exportable. */
export function spendNativeForExport(
  ledger: ReserveLedger,
  goodId: TradeGoodId,
  amount: number,
  protectedReserve = 0,
): ReserveResult {
  if (!Number.isInteger(amount)) return refuse(ledger, 'not-an-integer');
  if (amount < 0) return refuse(ledger, 'negative-amount');
  if (amount === 0) return { ok: true, ledger };
  if (getExportableQuantity(ledger, goodId, protectedReserve) < amount) {
    return refuse(ledger, 'insufficient-native-stock');
  }
  const balance = getReserveBalance(ledger, goodId);
  return { ok: true, ledger: withBalance(ledger, goodId, { ...balance, native: balance.native - amount }) };
}

/**
 * Structural validation for a persisted ledger (MR09 will call this on load). Empty means valid.
 */
export function validateReserveLedger(ledger: ReserveLedger): string[] {
  const errors: string[] = [];
  const reservationIds = new Set<string>();
  const claimIds = new Set<string>();

  for (const [goodId, balance] of Object.entries(ledger.balances)) {
    if (!isCount(balance.native)) errors.push(`${goodId}: native stock must be a nonnegative integer`);
    if (!isCount(balance.imported)) errors.push(`${goodId}: imported stock must be a nonnegative integer`);
  }
  for (const reservation of ledger.reservations) {
    if (reservationIds.has(reservation.id)) errors.push(`duplicate reservation id ${reservation.id}`);
    reservationIds.add(reservation.id);
    if (!isCount(reservation.amount)) errors.push(`${reservation.id}: amount must be a nonnegative integer`);
    if (reservation.amount > getStoredQuantity(ledger, reservation.goodId)) {
      errors.push(`${reservation.id}: reserved more ${reservation.goodId} than is stored`);
    }
  }
  for (const claim of ledger.incoming) {
    if (claimIds.has(claim.id)) errors.push(`duplicate incoming claim id ${claim.id}`);
    claimIds.add(claim.id);
    if (!isCount(claim.amount)) errors.push(`${claim.id}: amount must be a nonnegative integer`);
  }
  for (const goodId of new Set(ledger.reservations.map(reservation => reservation.goodId))) {
    if (getCommittedQuantity(ledger, goodId) > getStoredQuantity(ledger, goodId)) {
      errors.push(`${goodId}: commitments exceed stored stock`);
    }
  }
  return errors;
}

export type StartingNativeStock = Record<TradeGoodId, number>;

/**
 * The MR09 starter reserve: a bounded native seed for every good whose sources the civ actually owns.
 * A reserve never starts with imported stock, and the seed is a function of *source count*, not of a
 * stored number, so it can be computed once at migration and never re-granted on reload.
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
