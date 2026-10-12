/**
 * Minimal IndexedDB double that models the TRANSACTION lifecycle, which a Map
 * mock cannot: a request's `onsuccess` fires first, the transaction commits
 * (`oncomplete`) or aborts (`onabort`) later, and an abort rolls every request
 * of that transaction back. Only the surface src/storage/db.ts uses.
 */
export interface FakeIdbFaults {
  /** Abort the tx right after the request with this 0-based index succeeds. */
  abortAfterRequest?: (txIndex: number, requestIndex: number, key: string) => Error | undefined;
  /** Abort at commit time (e.g. quota) after every request has succeeded. */
  abortAtCommit?: (txIndex: number, keys: string[]) => Error | undefined;
  /** Throw synchronously from put/delete. */
  throwOnRequest?: (txIndex: number, requestIndex: number, key: string) => Error | undefined;
}

export interface FakeIdbHandle {
  factory: IDBFactory;
  committed: Map<string, unknown>;
  faults: FakeIdbFaults;
  transactionCount: () => number;
}

interface Op { kind: 'put' | 'delete' | 'get' | 'getAllKeys'; key?: string; value?: unknown; request: FakeRequest }

class FakeRequest {
  result: unknown;
  error: Error | null = null;
  onsuccess: (() => void) | null = null;
  onerror: (() => void) | null = null;
}

export function createFakeIndexedDb(): FakeIdbHandle {
  const committed = new Map<string, unknown>();
  const faults: FakeIdbFaults = {};
  let txCounter = 0;

  function makeTransaction(mode: string) {
    const txIndex = txCounter++;
    const staged = new Map(committed);
    const ops: Op[] = [];
    let active = true;
    let finished = false;
    const tx = {
      error: null as Error | null,
      oncomplete: null as (() => void) | null,
      onabort: null as (() => void) | null,
      onerror: null as (() => void) | null,
      abort() {
        if (finished) throw new DOMException('finished', 'InvalidStateError');
        finish(new DOMException('aborted', 'AbortError'));
      },
      objectStore() {
        const enqueue = (kind: Op['kind'], key?: string, value?: unknown): FakeRequest => {
          if (!active) throw new DOMException('inactive', 'TransactionInactiveError');
          if ((kind === 'put' || kind === 'delete') && mode !== 'readwrite') {
            throw new DOMException('read-only', 'ReadOnlyError');
          }
          const injected = faults.throwOnRequest?.(txIndex, ops.length, key ?? '');
          if (injected) throw injected;
          const request = new FakeRequest();
          ops.push({ kind, key, value, request });
          return request;
        };
        return {
          put: (value: unknown, key: string) => enqueue('put', key, value),
          delete: (key: string) => enqueue('delete', key),
          get: (key: string) => enqueue('get', key),
          getAllKeys: () => enqueue('getAllKeys'),
        };
      },
    };

    function finish(error: Error | null): void {
      if (finished) return;
      finished = true;
      active = false;
      if (error) {
        tx.error = error;
        queueMicrotask(() => tx.onabort?.());
      } else {
        for (const [k, v] of staged) committed.set(k, v);
        for (const k of [...committed.keys()]) if (!staged.has(k)) committed.delete(k);
        queueMicrotask(() => tx.oncomplete?.());
      }
    }

    // The tx is active only for the synchronous turn it was created in.
    setTimeout(() => {
      active = false;
      let index = 0;
      const step = (): void => {
        if (finished) return;
        if (index >= ops.length) {
          const keys = ops.filter(o => o.kind === 'put' || o.kind === 'delete').map(o => o.key as string);
          finish(faults.abortAtCommit?.(txIndex, keys) ?? null);
          return;
        }
        const op = ops[index];
        const requestIndex = index++;
        if (op.kind === 'put') staged.set(op.key as string, structuredClone(op.value));
        else if (op.kind === 'delete') staged.delete(op.key as string);
        else if (op.kind === 'get') op.request.result = structuredClone(staged.get(op.key as string));
        else op.request.result = [...staged.keys()];
        op.request.onsuccess?.();
        const abortWith = faults.abortAfterRequest?.(txIndex, requestIndex, op.key ?? '');
        if (abortWith) {
          finish(abortWith);
          return;
        }
        setTimeout(step, 0);
      };
      step();
    }, 0);
    return tx;
  }

  const db = {
    objectStoreNames: { contains: () => true },
    createObjectStore: () => ({}),
    transaction: (_store: string, mode: string = 'readonly') => makeTransaction(mode),
    close: () => {},
    onclose: null as (() => void) | null,
    onversionchange: null as (() => void) | null,
  };

  const factory = {
    open() {
      const request: { result: unknown; error: Error | null; onsuccess: (() => void) | null; onerror: (() => void) | null; onupgradeneeded: (() => void) | null } =
        { result: db, error: null, onsuccess: null, onerror: null, onupgradeneeded: null };
      setTimeout(() => request.onsuccess?.(), 0);
      return request;
    },
  } as unknown as IDBFactory;

  return { factory, committed, faults, transactionCount: () => txCounter };
}
