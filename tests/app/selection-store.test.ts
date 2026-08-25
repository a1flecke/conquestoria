import { describe, it, expect } from 'vitest';
import { createSelectionStore } from '@/app/selection-store';
import type { PendingCityCaptureChoice } from '@/input/city-assault-flow';
import { NO_LAND_UNIT_WATER_RECOVERY } from '@/systems/unit-water-recovery';

const captureChoice = { cityId: 'c1', attackerId: 'u1', occupiedPopulation: 3, razeGold: 40 } as unknown as PendingCityCaptureChoice;

describe('createSelectionStore', () => {
  it('starts with no selection, empty ranges, and no pending intent', () => {
    const store = createSelectionStore();

    expect(store.getSelectedUnitId()).toBeNull();
    expect(store.getMovementRange()).toEqual([]);
    expect(store.getAttackRange()).toEqual([]);
    expect(store.getPendingIntent()).toEqual({ kind: 'none' });
    expect(store.getWaterRecovery()).toEqual(NO_LAND_UNIT_WATER_RECOVERY);
    expect(store.getPirateSelection()).toEqual({ factionId: null, historyId: null });
  });

  it('replaces the pending intent instead of accumulating independent flags', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'air-mission', unitId: 'u1', mission: 'strike' });
    store.setPendingIntent({ kind: 'journey', unitId: 'u2' });

    expect(store.getPendingIntent()).toEqual({ kind: 'journey', unitId: 'u2' });
  });

  it('starting a journey structurally cancels a pending unload', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [{ q: 0, r: 0 }] });

    store.setPendingIntent({ kind: 'journey', unitId: 'u1' });

    expect(store.getPendingIntent()).toEqual({ kind: 'journey', unitId: 'u1' });
  });

  it('warns on the first mis-tap only, per pending-intent lifetime', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [] });

    expect(store.shouldWarnOnMistap()).toBe(true);
    expect(store.shouldWarnOnMistap()).toBe(false);
    expect(store.shouldWarnOnMistap()).toBe(false);
  });

  it('re-arming a pending intent re-arms the mis-tap warning', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [] });
    store.shouldWarnOnMistap();

    store.setPendingIntent({ kind: 'unload', transportId: 't2', cargoUnitId: 'c2', range: [] });

    expect(store.shouldWarnOnMistap()).toBe(true);
  });

  it('changing to a different intent kind re-arms the mis-tap warning', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [] });
    store.shouldWarnOnMistap();

    store.setPendingIntent({ kind: 'journey', unitId: 'u1' });
    store.setPendingIntent({ kind: 'unload', transportId: 't1', cargoUnitId: 'c1', range: [] });

    expect(store.shouldWarnOnMistap()).toBe(true);
  });

  it('clear() resets selection, water recovery, ranges, and pending intent together', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('u1');
    store.setWaterRecovery({ ...NO_LAND_UNIT_WATER_RECOVERY, isStranded: true } as never);
    store.setRanges([{ q: 0, r: 0 }], [{ q: 1, r: 0 }]);
    store.setPendingIntent({ kind: 'journey', unitId: 'u1' });

    store.clear();

    expect(store.getSelectedUnitId()).toBeNull();
    expect(store.getWaterRecovery()).toEqual(NO_LAND_UNIT_WATER_RECOVERY);
    expect(store.getMovementRange()).toEqual([]);
    expect(store.getAttackRange()).toEqual([]);
    expect(store.getPendingIntent()).toEqual({ kind: 'none' });
  });

  it('clear() preserves a pending city-capture choice, which outlives deselection', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('u1');
    store.setPendingIntent({ kind: 'city-capture', choice: captureChoice });

    store.clear();

    expect(store.getSelectedUnitId()).toBeNull();
    expect(store.getPendingIntent()).toEqual({ kind: 'city-capture', choice: captureChoice });
  });

  it('clear() resets a pending last-stand-target intent, unlike the city-capture exception (#544 MR6 item 87)', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('general-1');
    store.setPendingIntent({ kind: 'last-stand-target', unitId: 'general-1', range: [{ q: 0, r: 0 }] });

    store.clear();

    expect(store.getPendingIntent()).toEqual({ kind: 'none' });
  });

  it('setRanges copies its inputs so later caller mutation cannot corrupt the store', () => {
    const store = createSelectionStore();
    const movement = [{ q: 0, r: 0 }];
    const attack = [{ q: 1, r: 0 }];
    store.setRanges(movement, attack);

    movement.push({ q: 9, r: 9 });
    attack.push({ q: 8, r: 8 });

    expect(store.getMovementRange()).toEqual([{ q: 0, r: 0 }]);
    expect(store.getAttackRange()).toEqual([{ q: 1, r: 0 }]);
  });

  it('tracks the pirate faction/history selection as one mutually-exclusive pair', () => {
    const store = createSelectionStore();

    store.setPirateSelection('f1', null);
    expect(store.getPirateSelection()).toEqual({ factionId: 'f1', historyId: null });

    store.setPirateSelection(null, 'h1');
    expect(store.getPirateSelection()).toEqual({ factionId: null, historyId: 'h1' });
  });

  it('snapshot() reflects the current selection, ranges, water recovery, and pending intent', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('u1');
    store.setRanges([{ q: 0, r: 0 }], [{ q: 1, r: 0 }]);
    store.setPendingIntent({ kind: 'journey', unitId: 'u1' });

    expect(store.snapshot()).toEqual({
      selectedUnitId: 'u1',
      movementRange: [{ q: 0, r: 0 }],
      attackRange: [{ q: 1, r: 0 }],
      pendingIntent: { kind: 'journey', unitId: 'u1' },
      waterRecovery: NO_LAND_UNIT_WATER_RECOVERY,
    });
  });

  it('snapshot() is a frozen-in-time value: later mutation does not change a snapshot already taken', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('u1');
    const before = store.snapshot();

    store.setSelectedUnitId('u2');
    store.setPendingIntent({ kind: 'journey', unitId: 'u2' });

    expect(before.selectedUnitId).toBe('u1');
    expect(before.pendingIntent).toEqual({ kind: 'none' });
    expect(store.snapshot().selectedUnitId).toBe('u2');
  });
});
