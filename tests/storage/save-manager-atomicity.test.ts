import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDb, type FakeIdbHandle } from '../helpers/fake-indexeddb';

// #1450: payload + meta are one transaction. These run save-manager over the
// real db.ts and a transaction-lifecycle IndexedDB double.
describe('save-manager atomic payload+meta over IndexedDB transactions (#1450)', () => {
  let idb: FakeIdbHandle;
  let sm: typeof import('@/storage/save-manager');
  let makeState: (turn: number, playthroughId?: string) => import('@/core/types').GameState;

  beforeEach(async () => {
    vi.resetModules();
    idb = createFakeIndexedDb();
    vi.stubGlobal('indexedDB', idb.factory);
    const store: Record<string, string> = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
      removeItem: (k: string) => { delete store[k]; },
    });
    sm = await import('@/storage/save-manager');
    const { createNewGame } = await import('@/core/game-state');
    const base = createNewGame(undefined, 'atomicity-seed', 'small');
    makeState = (turn, playthroughId = 'pt-1') => ({ ...structuredClone(base), turn, playthroughId });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });

  const keys = () => [...idb.committed.keys()].sort();
  const failNthTx = (n: number) => {
    idb.faults.abortAfterRequest = (txIndex, requestIndex) =>
      txIndex === n && requestIndex === 0 ? new DOMException('quota', 'QuotaExceededError') : undefined;
  };

  it('fresh manual save: abort after the payload request commits neither key, retry succeeds', async () => {
    failNthTx(0);
    await expect(sm.saveGame('slot-a', 'A', makeState(5))).rejects.toThrow(/QuotaExceededError/);
    expect(keys()).toEqual([]);
    expect(await sm.listSaves()).toEqual([]);

    idb.faults.abortAfterRequest = undefined;
    await sm.saveGame('slot-a', 'A', makeState(5));
    expect(keys()).toEqual(['meta:slot-a', 'save:slot-a']);
  });

  it('overwriting a slot: a failed overwrite preserves the previous payload AND meta', async () => {
    await sm.saveGame('slot-a', 'Old', makeState(5));
    const before = structuredClone([...idb.committed.entries()]);
    idb.faults.abortAtCommit = () => new DOMException('quota', 'QuotaExceededError');
    await expect(sm.saveGame('slot-a', 'New', makeState(9))).rejects.toThrow();
    expect([...idb.committed.entries()]).toEqual(before);
    expect((await sm.loadGame('slot-a'))?.turn).toBe(5);
    expect((await sm.listSaves())[0].name).toBe('Old');
  });

  it('user deletion is atomic: a failed delete keeps both keys, retry removes both', async () => {
    await sm.saveGame('slot-a', 'A', makeState(5));
    failNthTx(idb.transactionCount());
    await expect(sm.deleteSaveEntry('slot-a', 'manual')).rejects.toThrow();
    expect(keys()).toEqual(['meta:slot-a', 'save:slot-a']);
    idb.faults.abortAfterRequest = undefined;
    await sm.deleteSaveEntry('slot-a', 'manual');
    expect(keys()).toEqual([]);
  });

  it('a failed NEW autosave leaves earlier autosaves and the legacy fallback untouched', async () => {
    await sm.autoSave(makeState(1));
    await sm.autoSave(makeState(2));
    idb.committed.set('autosave', makeState(0)); // legacy IndexedDB autosave
    const before = structuredClone([...idb.committed.entries()]);
    idb.faults.abortAtCommit = () => new DOMException('quota', 'QuotaExceededError');
    await expect(sm.autoSave(makeState(3))).rejects.toThrow();
    expect([...idb.committed.entries()]).toEqual(before);
    idb.faults.abortAtCommit = undefined;
    expect((await sm.loadMostRecentAutoSave())?.turn).toBe(2);
  });

  it('prune is atomic and a failed prune does not fail (or lose) the committed autosave', async () => {
    for (let turn = 1; turn <= 5; turn++) await sm.autoSave(makeState(turn));
    // 6th autosave: tx n = write ok, prune tx aborts.
    const writeTx = idb.transactionCount();
    idb.faults.abortAtCommit = (txIndex) => txIndex > writeTx ? new DOMException('x', 'AbortError') : undefined;
    await expect(sm.autoSave(makeState(6))).resolves.toBeUndefined();
    expect(keys().filter(k => k.startsWith('meta:'))).toHaveLength(6);
    expect(keys().filter(k => k.startsWith('autosave:'))).toHaveLength(6);

    idb.faults.abortAtCommit = undefined;
    await sm.autoSave(makeState(7));
    const metas = keys().filter(k => k.startsWith('meta:'));
    expect(metas).toHaveLength(5);
    expect(keys().filter(k => k.startsWith('autosave:'))).toHaveLength(5); // no orphan payloads
    expect(metas.some(k => k.endsWith(':7'))).toBe(true);
  });

  it('concurrent autosaves for distinct and identical turns never lose newer data', async () => {
    await Promise.all([1, 2, 3, 4, 5, 6, 7, 8, 8, 9].map(turn => sm.autoSave(makeState(turn))));
    const turns = (await sm.listSaves({ includeAutoSave: true })).map(m => m.turn).sort((a, b) => a - b);
    expect(turns).toEqual([5, 6, 7, 8, 9]);
    expect(keys().filter(k => k.startsWith('autosave:'))).toHaveLength(5);
  });

  it('autosaves are grouped per playthrough when pruning', async () => {
    for (let turn = 1; turn <= 6; turn++) await sm.autoSave(makeState(turn, 'pt-1'));
    await sm.autoSave(makeState(1, 'pt-2'));
    const metas = keys().filter(k => k.startsWith('meta:'));
    expect(metas.filter(k => k.includes('pt-1'))).toHaveLength(5);
    expect(metas.filter(k => k.includes('pt-2'))).toHaveLength(1);
  });

  it('a failed durable write never refreshes the localStorage backup', async () => {
    await sm.autoSave(makeState(1));
    const backup = localStorage.getItem('conquestoria-autosave') ?? JSON.stringify(null);
    idb.faults.abortAtCommit = () => new DOMException('quota', 'QuotaExceededError');
    await expect(sm.autoSave(makeState(2))).rejects.toThrow();
    expect(localStorage.getItem('conquestoria-autosave') ?? JSON.stringify(null)).toBe(backup);
  });

  it('keeps working after a failed write (the chain is not poisoned)', async () => {
    failNthTx(0);
    await expect(sm.saveGame('s', 'S', makeState(1))).rejects.toThrow();
    idb.faults.abortAfterRequest = undefined;
    await expect(sm.saveGame('s', 'S', makeState(1))).resolves.toBeUndefined();
  });
});
