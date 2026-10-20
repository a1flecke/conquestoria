import { describe, expect, it } from 'vitest';
import {
  BASE_STORAGE_PER_GOOD,
  STARTING_NATIVE_STOCK_PER_SOURCE,
  accrueNativeStock,
  claimIncomingStock,
  computeStartingNativeStock,
  consumeStock,
  createEmptyReserveLedger,
  createStartingReserveLedger,
  deliverIncomingStock,
  destroyIncomingStock,
  getCommittedImportedQuantity,
  getCommittedNativeQuantity,
  getCommittedQuantity,
  getExportableQuantity,
  getFreeImportedQuantity,
  getFreeNativeQuantity,
  getFreeQuantity,
  getIncomingQuantity,
  getReserveBalance,
  getStorageHeadroom,
  getStoredQuantity,
  releaseStock,
  reserveStock,
  spendNativeForExport,
  validateReserveLedger,
  type ReserveLedger,
} from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/** #1505 MR08: the reserve kernel. Pure, integer, conservative — and deliberately not persisted yet. */
const iron = resourceGoodId('iron');

function seeded(native: number, imported = 0): ReserveLedger {
  let ledger = createEmptyReserveLedger();
  const accrued = accrueNativeStock(ledger, iron, native);
  expect(accrued.ok).toBe(true);
  if (!accrued.ok) throw new Error('seed failed');
  ledger = accrued.ledger;
  if (imported > 0) {
    const claimed = claimIncomingStock(ledger, { id: 'seed-claim', goodId: iron, ownerCivId: 'alpha', amount: imported });
    if (!claimed.ok) throw new Error('seed claim failed');
    const delivered = deliverIncomingStock(claimed.ledger, 'seed-claim');
    if (!delivered.ok) throw new Error('seed delivery failed');
    ledger = delivered.ledger;
  }
  return ledger;
}

describe('#1505 MR08 — reserve balances and provenance', () => {
  it('tracks native and imported stock separately and never lets incoming count as usable', () => {
    let ledger = seeded(6);
    const claimed = claimIncomingStock(ledger, { id: 'manifest-1', goodId: iron, ownerCivId: 'alpha', amount: 4, routeId: 'route-1' });
    expect(claimed.ok).toBe(true);
    if (!claimed.ok) return;
    ledger = claimed.ledger;

    expect(getStoredQuantity(ledger, iron)).toBe(6);
    expect(getIncomingQuantity(ledger, iron)).toBe(4);
    expect(getFreeQuantity(ledger, iron)).toBe(6);

    const delivered = deliverIncomingStock(ledger, 'manifest-1');
    expect(delivered.ok).toBe(true);
    if (!delivered.ok) return;
    expect(getReserveBalance(delivered.ledger, iron)).toEqual({ native: 6, imported: 4 });
    expect(getStoredQuantity(delivered.ledger, iron)).toBe(10);
  });

  it('consumes imported stock before native stock and records that provenance', () => {
    const ledger = seeded(6, 4);

    const first = consumeStock(ledger, iron, 3);
    expect(first.ok && first.consumed).toEqual({ imported: 3, native: 0 });
    if (!first.ok) return;
    expect(getReserveBalance(first.ledger, iron)).toEqual({ native: 6, imported: 1 });

    const second = consumeStock(first.ledger, iron, 2);
    expect(second.ok && second.consumed).toEqual({ imported: 1, native: 1 });
  });

  it('never produces a negative balance', () => {
    const ledger = seeded(2);
    const result = consumeStock(ledger, iron, 3);
    expect(result).toMatchObject({ ok: false, reason: 'insufficient-free-stock' });
    expect(result.ledger).toBe(ledger);
    expect(getReserveBalance(result.ledger, iron)).toEqual({ native: 2, imported: 0 });
  });

  it('refuses a commitment larger than free stock, and release is not repeatable', () => {
    const ledger = seeded(5);
    const consumer = { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' };
    const tooMuch = reserveStock(ledger, { id: 'r1', goodId: iron, ownerCivId: 'alpha', amount: 6, reason: 'active-production', consumer });
    expect(tooMuch).toMatchObject({ ok: false, reason: 'insufficient-free-stock' });

    const reserved = reserveStock(ledger, { id: 'r1', goodId: iron, ownerCivId: 'alpha', amount: 5, reason: 'active-production', consumer });
    expect(reserved.ok).toBe(true);
    if (!reserved.ok) return;
    expect(getFreeQuantity(reserved.ledger, iron)).toBe(0);
    expect(getCommittedQuantity(reserved.ledger, iron)).toBe(5);

    const released = releaseStock(reserved.ledger, 'r1');
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(getFreeQuantity(released.ledger, iron)).toBe(5);
    expect(releaseStock(released.ledger, 'r1')).toMatchObject({ ok: false, reason: 'unknown-reservation' });
  });

  it('imported stock can never be exported', () => {
    const ledger = seeded(0, 8);
    expect(getExportableQuantity(ledger, iron)).toBe(0);
    expect(spendNativeForExport(ledger, iron, 1)).toMatchObject({ ok: false, reason: 'insufficient-native-stock' });

    const mixed = seeded(3, 8);
    expect(getExportableQuantity(mixed, iron)).toBe(3);
    expect(spendNativeForExport(mixed, iron, 3).ok).toBe(true);
    expect(spendNativeForExport(mixed, iron, 4)).toMatchObject({ ok: false });
  });

  it('respects a protected reserve when exporting', () => {
    const ledger = seeded(10);
    expect(getExportableQuantity(ledger, iron, 4)).toBe(6);
    expect(spendNativeForExport(ledger, iron, 7, 4)).toMatchObject({ ok: false, reason: 'insufficient-native-stock' });
  });

  it('caps storage, stops accumulation at the cap, and keeps existing overflow', () => {
    const full = seeded(BASE_STORAGE_PER_GOOD);
    expect(getStorageHeadroom(full, iron)).toBe(0);
    expect(claimIncomingStock(full, { id: 'm', goodId: iron, ownerCivId: 'alpha', amount: 1 }))
      .toMatchObject({ ok: false, reason: 'insufficient-free-stock' });

    // A capacity reduction retains what is already owned but offers no room for more.
    const over = seeded(BASE_STORAGE_PER_GOOD + 5);
    expect(getStoredQuantity(over, iron)).toBe(BASE_STORAGE_PER_GOOD + 5);
    expect(getStorageHeadroom(over, iron)).toBe(0);
  });

  it('counts incoming claims against storage headroom before they arrive', () => {
    const ledger = seeded(30);
    const claim = claimIncomingStock(ledger, { id: 'm1', goodId: iron, ownerCivId: 'alpha', amount: 10 });
    expect(claim.ok).toBe(true);
    if (!claim.ok) return;
    expect(getStorageHeadroom(claim.ledger, iron)).toBe(0);
    expect(claimIncomingStock(claim.ledger, { id: 'm2', goodId: iron, ownerCivId: 'alpha', amount: 1 }))
      .toMatchObject({ ok: false });
  });

  it('a destroyed shipment credits no stock, and a delivered claim cannot be delivered twice', () => {
    const ledger = seeded(0);
    const claimed = claimIncomingStock(ledger, { id: 'm1', goodId: iron, ownerCivId: 'alpha', amount: 4 });
    if (!claimed.ok) return;

    const destroyed = destroyIncomingStock(claimed.ledger, 'm1');
    expect(destroyed.ok).toBe(true);
    if (!destroyed.ok) return;
    expect(getStoredQuantity(destroyed.ledger, iron)).toBe(0);
    expect(deliverIncomingStock(destroyed.ledger, 'm1')).toMatchObject({ ok: false, reason: 'unknown-reservation' });

    const delivered = deliverIncomingStock(claimed.ledger, 'm1');
    if (!delivered.ok) return;
    expect(deliverIncomingStock(delivered.ledger, 'm1')).toMatchObject({ ok: false });
    expect(getStoredQuantity(delivered.ledger, iron)).toBe(4);
  });

  it('conserves the issue’s worked example: produce 10, load 4, deliver 4, consume 3, destroy 2', () => {
    // Sources: +10 native (own production), +4 imported (a delivered shipment).
    // Sinks: 3 consumed. The second 2-unit shipment is destroyed in transit and never enters stock.
    let ledger = seeded(10);
    const firstShipment = claimIncomingStock(ledger, { id: 'ship-1', goodId: iron, ownerCivId: 'alpha', amount: 4 });
    if (!firstShipment.ok) throw new Error('claim');
    const firstDelivered = deliverIncomingStock(firstShipment.ledger, 'ship-1');
    if (!firstDelivered.ok) throw new Error('deliver');
    const consumed = consumeStock(firstDelivered.ledger, iron, 3);
    if (!consumed.ok) throw new Error('consume');

    const secondShipment = claimIncomingStock(consumed.ledger, { id: 'ship-2', goodId: iron, ownerCivId: 'alpha', amount: 2 });
    if (!secondShipment.ok) throw new Error('claim 2');
    const destroyed = destroyIncomingStock(secondShipment.ledger, 'ship-2');
    if (!destroyed.ok) throw new Error('destroy');
    ledger = destroyed.ledger;

    const sources = 10 + 4;
    const sinks = 3;
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 10, imported: 1 });
    expect(getStoredQuantity(ledger, iron)).toBe(sources - sinks);
    expect(getIncomingQuantity(ledger, iron)).toBe(0);
    expect(validateReserveLedger(ledger)).toEqual([]);
  });

  it('validates a corrupt ledger rather than trusting it', () => {
    const corrupt: ReserveLedger = {
      balances: { [iron]: { native: -1, imported: 1.5 } },
      reservations: [{
        id: 'r', goodId: iron, ownerCivId: 'alpha', amount: 5, reason: 'active-production',
        allocation: { native: 2, imported: 3 },
        consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
      }],
      incoming: [],
    };
    const errors = validateReserveLedger(corrupt);
    expect(errors.some(error => error.includes('native stock'))).toBe(true);
    expect(errors.some(error => error.includes('imported stock'))).toBe(true);
    expect(errors.some(error => error.includes('reserved more'))).toBe(true);
  });
});

describe('#1509 MR09 — locked reservation provenance (live commitments)', () => {
  const request = {
    id: 'city-a:1:iron', goodId: iron, ownerCivId: 'alpha', amount: 10,
    reason: 'active-production' as const,
    consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
  };

  it('reserves imported first, keeps free native spendable, and spends a held recipe exactly once', () => {
    const seed: ReserveLedger = {
      balances: { [iron]: { native: 6, imported: 8 } },
      reservations: [],
      incoming: [],
    };
    const first = reserveStock(seed, request);
    expect(first.ok).toBe(true);
    if (!first.ok) throw new Error('first reservation must succeed');

    // The allocation is locked at reservation time: imported 8 first, then native 2.
    expect(first.ledger.reservations[0]).toMatchObject({ allocation: { imported: 8, native: 2 } });
    expect(getCommittedImportedQuantity(first.ledger, iron)).toBe(8);
    expect(getCommittedNativeQuantity(first.ledger, iron)).toBe(2);
    expect(getFreeNativeQuantity(first.ledger, iron)).toBe(4);
    expect(getFreeImportedQuantity(first.ledger, iron)).toBe(0);
    expect(getExportableQuantity(first.ledger, iron)).toBe(4);

    // An unreserved consumer may spend the free native stock, and only that.
    const freeSpend = consumeStock(first.ledger, iron, 4);
    expect(freeSpend.ok).toBe(true);
    if (!freeSpend.ok) throw new Error('free native stock must be spendable');
    expect(freeSpend.consumed).toEqual({ imported: 0, native: 4 });
    expect(getReserveBalance(freeSpend.ledger, iron)).toEqual({ native: 2, imported: 8 });
    expect(getCommittedQuantity(freeSpend.ledger, iron)).toBe(10);

    // The held recipe is still payable from its own locked allocation.
    const completion = consumeStock(freeSpend.ledger, iron, 10, { reservationId: request.id });
    expect(completion.ok).toBe(true);
    if (!completion.ok) throw new Error('held recipe must remain payable');
    expect(completion.consumed).toEqual({ imported: 8, native: 2 });
    expect(getStoredQuantity(completion.ledger, iron)).toBe(0);
    expect(getCommittedQuantity(completion.ledger, iron)).toBe(0);

    // The input ledger is never mutated.
    expect(seed.balances[iron]).toEqual({ native: 6, imported: 8 });
    expect(seed.reservations).toEqual([]);
  });

  it('refuses a second commitment that the remaining stock cannot cover, leaving the first intact', () => {
    const seed: ReserveLedger = {
      balances: { [iron]: { native: 6, imported: 8 } },
      reservations: [],
      incoming: [],
    };
    const first = reserveStock(seed, request);
    if (!first.ok) throw new Error('first reservation must succeed');

    const second = reserveStock(first.ledger, { ...request, id: 'city-b:1:iron', consumer: { ...request.consumer, cityId: 'city-b' } });
    expect(second).toMatchObject({ ok: false, reason: 'insufficient-free-stock' });
    expect(second.ledger).toBe(first.ledger);
    expect(getCommittedQuantity(second.ledger, iron)).toBe(10);
  });

  it('validates committed provenance against the matching balance', () => {
    const corrupt: ReserveLedger = {
      balances: { [iron]: { native: 1, imported: 1 } },
      reservations: [{
        id: 'r1', goodId: iron, ownerCivId: 'alpha', amount: 10, reason: 'active-production',
        allocation: { native: 5, imported: 5 },
        consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
      }],
      incoming: [],
    };
    const errors = validateReserveLedger(corrupt);
    expect(errors.some(error => error.includes('native'))).toBe(true);
    expect(errors.some(error => error.includes('imported'))).toBe(true);
  });

  it('requires the allocation to sum to the committed amount', () => {
    const corrupt: ReserveLedger = {
      balances: { [iron]: { native: 10, imported: 0 } },
      reservations: [{
        id: 'r1', goodId: iron, ownerCivId: 'alpha', amount: 10, reason: 'active-production',
        allocation: { native: 4, imported: 0 },
        consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
      }],
      incoming: [],
    };
    expect(validateReserveLedger(corrupt).some(error => error.includes('allocation'))).toBe(true);
  });

  it('rejects duplicate incoming claim IDs, fractional and non-finite amounts', () => {
    const base = createEmptyReserveLedger();
    const claimed = claimIncomingStock(base, { id: 'm1', goodId: iron, ownerCivId: 'alpha', amount: 2 });
    if (!claimed.ok) throw new Error('claim must succeed');

    expect(claimIncomingStock(claimed.ledger, { id: 'm1', goodId: iron, ownerCivId: 'alpha', amount: 1 }))
      .toMatchObject({ ok: false, reason: 'duplicate-claim' });
    expect(accrueNativeStock(base, iron, 1.5)).toMatchObject({ ok: false, reason: 'not-an-integer' });
    expect(accrueNativeStock(base, iron, Number.POSITIVE_INFINITY)).toMatchObject({ ok: false, reason: 'not-an-integer' });
    expect(accrueNativeStock(base, iron, Number.MAX_SAFE_INTEGER + 2)).toMatchObject({ ok: false, reason: 'not-an-integer' });
  });

  it('requires a production consumer for active-production reservations', () => {
    const base = createEmptyReserveLedger();
    const accrued = accrueNativeStock(base, iron, 10);
    if (!accrued.ok) throw new Error('accrue');
    const withoutConsumer = reserveStock(accrued.ledger, {
      id: 'r', goodId: iron, ownerCivId: 'alpha', amount: 10, reason: 'active-production',
    });
    expect(withoutConsumer).toMatchObject({ ok: false, reason: 'missing-consumer' });
  });

  it('accepts a restricted migration grant only on a tagged reservation, bounded by its imported allocation', () => {
    const base: ReserveLedger = {
      balances: { [iron]: { native: 0, imported: 8 } },
      reservations: [],
      incoming: [],
    };
    // Ordinary active-production cannot invent a grant.
    expect(reserveStock(base, { ...request, amount: 8, migrationGrantImported: 8 }))
      .toMatchObject({ ok: false, reason: 'invalid-grant' });

    const granted = reserveStock(base, {
      id: 'migration:city-a:iron', goodId: iron, ownerCivId: 'alpha', amount: 8,
      reason: 'migration-grant', migrationGrantImported: 8,
      consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
    });
    expect(granted.ok).toBe(true);
    if (!granted.ok) return;
    expect(granted.ledger.reservations[0]).toMatchObject({ allocation: { imported: 8, native: 0 }, migrationGrantImported: 8 });
    expect(validateReserveLedger(granted.ledger)).toEqual([]);

    // Release extinguishes the tag, never credits stock.
    const released = releaseStock(granted.ledger, 'migration:city-a:iron');
    expect(released.ok).toBe(true);
    if (!released.ok) return;
    expect(getReserveBalance(released.ledger, iron)).toEqual({ native: 0, imported: 8 });
    expect(getCommittedQuantity(released.ledger, iron)).toBe(0);
  });

  it('spends the restricted grant portion of a reservation before its ordinary allocation', () => {
    const base: ReserveLedger = {
      balances: { [iron]: { native: 2, imported: 8 } },
      reservations: [],
      incoming: [],
    };
    const granted = reserveStock(base, {
      id: 'migration:city-a:iron', goodId: iron, ownerCivId: 'alpha', amount: 10,
      reason: 'migration-grant', migrationGrantImported: 6,
      consumer: { ownerCivId: 'alpha', cityId: 'city-a', occurrence: 1, itemId: 'swordsman' },
    });
    if (!granted.ok) throw new Error('grant reservation must succeed');

    // Partial completion: 6 tagged imported first, leaving the ordinary split.
    const partial = consumeStock(granted.ledger, iron, 6, { reservationId: 'migration:city-a:iron' });
    expect(partial.ok).toBe(true);
    if (!partial.ok) return;
    expect(partial.consumed).toEqual({ imported: 6, native: 0 });
    expect(partial.ledger.reservations[0]).toMatchObject({ amount: 4, allocation: { imported: 2, native: 2 } });
    expect(partial.ledger.reservations[0]?.migrationGrantImported).toBeUndefined();

    const rest = consumeStock(partial.ledger, iron, 4, { reservationId: 'migration:city-a:iron' });
    expect(rest.ok).toBe(true);
    if (!rest.ok) return;
    expect(rest.consumed).toEqual({ imported: 2, native: 2 });
    expect(getStoredQuantity(rest.ledger, iron)).toBe(0);
  });
});

describe('#1505 MR08 — the MR09 starting-stock seed', () => {
  it('seeds native stock from real source counts, never imported', () => {
    const starting = computeStartingNativeStock({ [iron]: 3, [resourceGoodId('coal')]: 0 });
    expect(starting).toEqual({ [iron]: 3 * STARTING_NATIVE_STOCK_PER_SOURCE });

    const ledger = createStartingReserveLedger(starting);
    expect(getReserveBalance(ledger, iron)).toEqual({ native: 6, imported: 0 });
    expect(getReserveBalance(ledger, resourceGoodId('coal'))).toEqual({ native: 0, imported: 0 });
    expect(validateReserveLedger(ledger)).toEqual([]);
  });

  it('is a pure function of the source count, so a reload can never re-grant stock', () => {
    const counts = { [iron]: 2 };
    expect(computeStartingNativeStock(counts)).toEqual(computeStartingNativeStock(counts));
  });
});
