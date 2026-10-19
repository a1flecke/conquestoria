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
  getCommittedQuantity,
  getExportableQuantity,
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
    const tooMuch = reserveStock(ledger, { id: 'r1', goodId: iron, ownerCivId: 'alpha', amount: 6, reason: 'active-production' });
    expect(tooMuch).toMatchObject({ ok: false, reason: 'insufficient-free-stock' });

    const reserved = reserveStock(ledger, { id: 'r1', goodId: iron, ownerCivId: 'alpha', amount: 5, reason: 'active-production' });
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
      reservations: [{ id: 'r', goodId: iron, ownerCivId: 'alpha', amount: 5, reason: 'active-production' }],
      incoming: [],
    };
    const errors = validateReserveLedger(corrupt);
    expect(errors.some(error => error.includes('native stock'))).toBe(true);
    expect(errors.some(error => error.includes('imported stock'))).toBe(true);
    expect(errors.some(error => error.includes('reserved more'))).toBe(true);
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
