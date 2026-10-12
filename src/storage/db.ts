const DB_NAME = 'conquestoria';
const DB_VERSION = 1;
const STORE_NAME = 'saves';

let persistRequested = false;
let cachedDb: IDBDatabase | null = null;
let openingPromise: Promise<IDBDatabase> | null = null;

function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  // Fire-and-forget — don't block DB operations
  if (navigator.storage?.persist) {
    navigator.storage.persist().then(granted => {
      console.log(granted ? '[save] Persistent storage granted' : '[save] Persistent storage denied — saves may be evicted');
    }).catch(() => { /* not supported */ });
  }
}

function openDB(): Promise<IDBDatabase> {
  if (cachedDb) {
    return Promise.resolve(cachedDb);
  }

  if (openingPromise) {
    return openingPromise;
  }

  requestPersistentStorage();

  openingPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      cachedDb = request.result;
      openingPromise = null;
      // Clear cache if connection is closed unexpectedly
      const opened = cachedDb;
      opened.onclose = () => { if (cachedDb === opened) cachedDb = null; };
      // Another tab upgrading the DB must not be blocked by this connection.
      opened.onversionchange = () => {
        if (cachedDb === opened) cachedDb = null;
        opened.close();
      };
      resolve(cachedDb);
    };
    request.onerror = () => {
      openingPromise = null;
      reject(request.error);
    };
  });

  return openingPromise;
}

export async function dbGet<T>(key: string): Promise<T | undefined> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}

export type DbWriteOp =
  | { type: 'put'; key: string; value: unknown }
  | { type: 'delete'; key: string };

function describeOps(ops: readonly DbWriteOp[]): string {
  // Keys only -- never values, which are whole game states.
  return ops.map(op => `${op.type}:${op.key}`).join(', ');
}

function describeError(error: unknown): string {
  if (error instanceof Error || (typeof DOMException !== 'undefined' && error instanceof DOMException)) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}

/**
 * Applies every op in ONE readwrite transaction. The returned promise settles
 * only on the transaction itself: it resolves on `oncomplete` (the commit) and
 * rejects on `onabort`/`onerror`. A request's `onsuccess` only means the
 * request was accepted -- the transaction can still abort afterwards (quota,
 * eviction, closed connection), so it is never treated as durability.
 *
 * The transaction is opened and all ops are enqueued synchronously, right after
 * the (already awaited) connection is obtained, so the transaction is still
 * active when the requests are placed.
 */
export async function dbBatch(ops: readonly DbWriteOp[]): Promise<void> {
  if (ops.length === 0) return;
  const db = await openDB();
  return new Promise<void>((resolve, reject) => {
    let settled = false;
    const fail = (cause: unknown): void => {
      if (settled) return;
      settled = true;
      reject(new Error(`IndexedDB write failed [${describeOps(ops)}]: ${describeError(cause)}`, { cause }));
    };
    let tx: IDBTransaction | undefined;
    try {
      const created = db.transaction(STORE_NAME, 'readwrite');
      tx = created;
      created.oncomplete = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      created.onabort = () => fail(created.error ?? new Error('transaction aborted'));
      created.onerror = () => fail(created.error ?? new Error('transaction error'));
      const store = created.objectStore(STORE_NAME);
      for (const op of ops) {
        // request.onsuccess/onerror are intentionally unused: the transaction
        // is the only completion boundary. A failed request aborts the tx.
        if (op.type === 'put') store.put(op.value, op.key);
        else store.delete(op.key);
      }
    } catch (error) {
      // Synchronous construction failure (closed connection, DataCloneError,
      // inactive transaction). An already-created tx is aborted so nothing of a
      // half-enqueued batch can commit.
      if (error instanceof DOMException && error.name === 'InvalidStateError') {
        cachedDb = null;
      }
      fail(error);
      try { tx?.abort(); } catch { /* already finished */ }
    }
  });
}

export function dbPut<T>(key: string, value: T): Promise<void> {
  return dbBatch([{ type: 'put', key, value }]);
}

export function dbDelete(key: string): Promise<void> {
  return dbBatch([{ type: 'delete', key }]);
}

export async function dbGetAllKeys(): Promise<string[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const store = tx.objectStore(STORE_NAME);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(request.result as string[]);
    request.onerror = () => reject(request.error);
  });
}
