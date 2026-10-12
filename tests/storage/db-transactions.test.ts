import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeIndexedDb, type FakeIdbHandle } from '../helpers/fake-indexeddb';

// #1450: a request's onsuccess is not durability. Only the transaction's
// oncomplete is; an abort after a request succeeded must reject the write.
describe('db transaction lifecycle (#1450)', () => {
  let idb: FakeIdbHandle;
  let db: typeof import('@/storage/db');

  beforeEach(async () => {
    vi.resetModules();
    idb = createFakeIndexedDb();
    vi.stubGlobal('indexedDB', idb.factory);
    db = await import('@/storage/db');
  });
  afterEach(() => vi.unstubAllGlobals());

  it('dbPut resolves only after the transaction commits', async () => {
    let settled = false;
    const pending = db.dbPut('k', { a: 1 }).then(() => { settled = true; });
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    await pending;
    expect(settled).toBe(true);
    expect(idb.committed.get('k')).toEqual({ a: 1 });
  });

  it('dbPut rejects (and commits nothing) when the tx aborts after the put request succeeded', async () => {
    idb.faults.abortAfterRequest = () => new DOMException('quota', 'QuotaExceededError');
    await expect(db.dbPut('save:slot', { big: true })).rejects.toThrow(/IndexedDB write failed \[put:save:slot\].*quota/);
    expect(idb.committed.has('save:slot')).toBe(false);
  });

  it('dbDelete rejects and keeps the entry when the tx aborts after the delete request succeeded', async () => {
    await db.dbPut('k', 1);
    idb.faults.abortAfterRequest = () => new DOMException('evicted', 'AbortError');
    await expect(db.dbDelete('k')).rejects.toThrow(/delete:k/);
    expect(idb.committed.get('k')).toBe(1);
  });

  it('dbBatch rolls back every op when the tx aborts after the first request succeeded', async () => {
    await db.dbPut('old', 'v');
    idb.faults.abortAfterRequest = (_t, requestIndex) => requestIndex === 0 ? new DOMException('x', 'AbortError') : undefined;
    await expect(db.dbBatch([
      { type: 'put', key: 'payload', value: 1 },
      { type: 'put', key: 'meta', value: 2 },
      { type: 'delete', key: 'old' },
    ])).rejects.toThrow();
    expect([...idb.committed.keys()]).toEqual(['old']);
  });

  it('dbBatch rolls back when the commit itself fails (quota at commit time)', async () => {
    idb.faults.abortAtCommit = () => new DOMException('quota', 'QuotaExceededError');
    await expect(db.dbBatch([
      { type: 'put', key: 'a', value: 1 },
      { type: 'put', key: 'b', value: 2 },
    ])).rejects.toThrow(/QuotaExceededError/);
    expect(idb.committed.size).toBe(0);
  });

  it('commits a multi-key batch atomically in one transaction', async () => {
    const before = idb.transactionCount();
    await db.dbBatch([
      { type: 'put', key: 'a', value: 1 },
      { type: 'put', key: 'b', value: 2 },
      { type: 'delete', key: 'a' },
    ]);
    expect(idb.transactionCount() - before).toBe(1);
    expect([...idb.committed.entries()]).toEqual([['b', 2]]);
  });

  it('rejects once, and does not commit, when request construction throws synchronously', async () => {
    idb.faults.throwOnRequest = (_t, requestIndex) => requestIndex === 1 ? new DOMException('clone', 'DataCloneError') : undefined;
    await expect(db.dbBatch([
      { type: 'put', key: 'a', value: 1 },
      { type: 'put', key: 'b', value: () => 1 },
    ])).rejects.toThrow(/DataCloneError/);
    await new Promise(r => setTimeout(r, 5));
    expect(idb.committed.size).toBe(0);
  });

  it('error messages carry keys but never the payload', async () => {
    idb.faults.abortAfterRequest = () => new DOMException('boom', 'AbortError');
    const error = await db.dbPut('save:x', { secret: 'SENSITIVE-STATE' }).then(() => new Error('resolved'), (e: Error) => e);
    expect(String(error.message)).toContain('save:x');
    expect(String(error.message)).not.toContain('SENSITIVE-STATE');
  });

  it('an empty batch is a no-op that opens no transaction', async () => {
    await db.dbBatch([]);
    expect(idb.transactionCount()).toBe(0);
  });
});
