import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import vm from 'node:vm';
import { registerConquestoriaServiceWorker } from '@/platform/service-worker';

describe('registerConquestoriaServiceWorker', () => {
  it('registers the GitHub Pages service worker for web builds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerConquestoriaServiceWorker('web', {
      serviceWorker: { register },
    } as unknown as Navigator);

    expect(register).toHaveBeenCalledWith('/conquestoria/sw.js');
  });

  it('skips service worker registration for Tauri builds', async () => {
    const register = vi.fn().mockResolvedValue(undefined);

    await registerConquestoriaServiceWorker('tauri', {
      serviceWorker: { register },
    } as unknown as Navigator);

    expect(register).not.toHaveBeenCalled();
  });

  it('swallows registration failures so the game can continue', async () => {
    const register = vi.fn().mockRejectedValue(new Error('offline'));

    await expect(registerConquestoriaServiceWorker('web', {
      serviceWorker: { register },
    } as unknown as Navigator)).resolves.toBeUndefined();
  });
});

interface MockCache {
  addAll: (urls: string[]) => Promise<void>;
  put: (req: unknown, res: unknown) => Promise<void>;
  match: (req: unknown) => Promise<unknown>;
}

function makeEmptyMockCache(): MockCache {
  return { addAll: async () => {}, put: async () => {}, match: async () => undefined };
}

function makeMockCachesApi(existingCacheNames: string[]) {
  const stores = new Map<string, MockCache>();
  for (const name of existingCacheNames) stores.set(name, makeEmptyMockCache());
  const deleted: string[] = [];
  const opened: string[] = [];
  const cachesApi = {
    open: async (name: string) => {
      opened.push(name);
      if (!stores.has(name)) stores.set(name, makeEmptyMockCache());
      return stores.get(name)!;
    },
    keys: async () => Array.from(stores.keys()),
    delete: async (name: string) => {
      deleted.push(name);
      return stores.delete(name);
    },
    match: async () => undefined,
  };
  return { cachesApi, deleted, opened };
}

interface SwLifecycleEvent {
  waitUntil: (p: Promise<unknown>) => void;
}

interface SwFetchEvent extends SwLifecycleEvent {
  request: { url: string; method?: string };
  respondWith: (p: Promise<unknown>) => void;
}

type SwEventHandler = (event: SwLifecycleEvent) => void;
type SwFetchHandler = (event: SwFetchEvent) => void;

interface SwListeners {
  install?: SwEventHandler[];
  activate?: SwEventHandler[];
  fetch?: SwFetchHandler[];
}

interface LoadSwOptions {
  origin?: string;
  fetchImpl?: (req: unknown) => Promise<unknown>;
  claimImpl?: () => Promise<void> | void;
}

function loadServiceWorkerListeners(
  cachesApi: unknown,
  options: LoadSwOptions = {},
): SwListeners {
  const listeners: Record<string, Array<(...args: never[]) => void>> = {};
  const origin = options.origin ?? 'https://example.github.io';
  const sandbox: Record<string, unknown> = {
    URL,
    location: { origin, href: `${origin}/conquestoria/sw.js` },
    caches: cachesApi,
    addEventListener: (type: string, handler: (...args: never[]) => void) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: options.claimImpl ?? (() => {}) },
    fetch: options.fetchImpl ?? (async () => ({ ok: true, status: 200, type: 'basic', clone: () => ({}) })),
    console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
  vm.runInContext(source, sandbox);
  return listeners as SwListeners;
}

describe('public/sw.js — activate handler cache versioning', () => {
  it('deletes every cache whose name differs from the current CACHE_NAME', async () => {
    const { cachesApi, deleted } = makeMockCachesApi(['conquestoria-old-version', 'some-unrelated-cache']);
    const listeners = loadServiceWorkerListeners(cachesApi);

    expect(listeners.activate).toBeDefined();
    let waited: Promise<unknown> = Promise.resolve();
    listeners.activate![0]({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(deleted.sort()).toEqual(['conquestoria-old-version', 'some-unrelated-cache']);
  });

  it('does not delete a cache that already matches the current CACHE_NAME', async () => {
    // Read the real CACHE_NAME out of the source instead of hardcoding it, so this
    // test doesn't silently drift from public/sw.js's actual current value.
    const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
    const match = source.match(/const CACHE_NAME = '([^']+)'/);
    expect(match).toBeTruthy();
    const currentCacheName = match![1];

    const { cachesApi, deleted } = makeMockCachesApi([currentCacheName, 'conquestoria-old-version']);
    const listeners = loadServiceWorkerListeners(cachesApi);

    let waited: Promise<unknown> = Promise.resolve();
    listeners.activate![0]({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(deleted).toEqual(['conquestoria-old-version']);
  });

  it('install handler precaches into the current CACHE_NAME', async () => {
    const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
    const match = source.match(/const CACHE_NAME = '([^']+)'/);
    const currentCacheName = match![1];

    const { cachesApi, opened } = makeMockCachesApi([]);
    const listeners = loadServiceWorkerListeners(cachesApi);

    expect(listeners.install).toBeDefined();
    let waited: Promise<unknown> = Promise.resolve();
    listeners.install![0]({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(opened).toContain(currentCacheName);
  });

  it('precaches every declared Era 13 network stinger for offline play', () => {
    const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
    for (const cue of ['constructive-resolution', 'hostile-warning', 'hostile-consequence', 'surge', 'recovery']) {
      expect(source).toContain(`/conquestoria/audio/stinger/network/${cue}.ogg`);
    }
  });

  it('awaits clients.claim() inside activate event.waitUntil (#1830)', async () => {
    const { cachesApi } = makeMockCachesApi([]);
    let claimResolved = false;
    const listeners = loadServiceWorkerListeners(cachesApi, {
      claimImpl: () => new Promise<void>((res) => {
        setTimeout(() => { claimResolved = true; res(); }, 0);
      }),
    });

    let waited: Promise<unknown> = Promise.resolve();
    (listeners.activate![0] as SwEventHandler)({ waitUntil: (p) => { waited = p; } });
    await waited;

    expect(claimResolved).toBe(true);
  });
});

describe('public/sw.js — fetch handler safety (#1830)', () => {
  function makeSpyCachesApi(matchResult?: unknown, putImpl?: (req: unknown, res: unknown) => Promise<void>) {
    const putSpy = vi.fn(putImpl ?? (async () => {}));
    const cachesApi = {
      open: async () => ({ addAll: async () => {}, put: putSpy, match: async () => matchResult }),
      keys: async () => [],
      delete: async () => true,
      match: async () => matchResult,
    };
    return { cachesApi, putSpy };
  }

  function dispatchFetch(
    handler: (event: SwFetchEvent) => void,
    request: { url: string; method?: string },
  ) {
    let responded: Promise<unknown> | null = null;
    const waited: Promise<unknown>[] = [];
    handler({
      request,
      respondWith: (p) => { responded = p; },
      waitUntil: (p) => { waited.push(p); },
    });
    return { responded, waited };
  }

  it('ignores non-GET requests and cross-origin or non-http(s) URLs without intercepting', () => {
    const { cachesApi } = makeSpyCachesApi();
    const listeners = loadServiceWorkerListeners(cachesApi, { origin: 'https://example.github.io' });
    const onFetch = listeners.fetch![0] as (event: SwFetchEvent) => void;

    expect(dispatchFetch(onFetch, { url: 'https://example.github.io/conquestoria/api', method: 'POST' }).responded).toBeNull();
    expect(dispatchFetch(onFetch, { url: 'https://third-party.example/asset.ogg', method: 'GET' }).responded).toBeNull();
    expect(dispatchFetch(onFetch, { url: 'chrome-extension://abcdef/script.js', method: 'GET' }).responded).toBeNull();
  });

  it('never caches 206 Partial Content, opaque, or error responses', async () => {
    for (const badResponse of [
      { ok: true, status: 206, type: 'basic', clone: () => ({}) },
      { ok: false, status: 0, type: 'opaque', clone: () => ({}) },
      { ok: false, status: 404, type: 'basic', clone: () => ({}) },
    ]) {
      const { cachesApi, putSpy } = makeSpyCachesApi(undefined);
      const listeners = loadServiceWorkerListeners(cachesApi, {
        fetchImpl: async () => badResponse,
      });
      const onFetch = listeners.fetch![0] as (event: SwFetchEvent) => void;
      const { responded, waited } = dispatchFetch(onFetch, {
        url: 'https://example.github.io/conquestoria/audio/track.ogg',
        method: 'GET',
      });
      expect(await responded).toBe(badResponse);
      await Promise.all(waited);
      expect(putSpy).not.toHaveBeenCalled();
    }
  });

  it('caches full 200 basic responses and tracks background revalidation with event.waitUntil', async () => {
    const cachedResponse = { ok: true, status: 200, type: 'basic', tag: 'cached' };
    const freshClone = { tag: 'fresh-clone' };
    const freshResponse = { ok: true, status: 200, type: 'basic', clone: () => freshClone };
    const { cachesApi, putSpy } = makeSpyCachesApi(cachedResponse);
    const listeners = loadServiceWorkerListeners(cachesApi, {
      fetchImpl: async () => freshResponse,
    });
    const onFetch = listeners.fetch![0] as (event: SwFetchEvent) => void;
    const req = { url: 'https://example.github.io/conquestoria/index.html', method: 'GET' };

    const { responded, waited } = dispatchFetch(onFetch, req);
    expect(await responded).toBe(cachedResponse);
    expect(waited.length).toBeGreaterThan(0);
    await Promise.all(waited);
    expect(putSpy).toHaveBeenCalledWith(req, freshClone);
  });

  it('swallows cache.put rejections so the network response still resolves', async () => {
    const freshResponse = { ok: true, status: 200, type: 'basic', clone: () => ({}) };
    const { cachesApi } = makeSpyCachesApi(undefined, async () => {
      throw new TypeError('QuotaExceededError');
    });
    const listeners = loadServiceWorkerListeners(cachesApi, {
      fetchImpl: async () => freshResponse,
    });
    const onFetch = listeners.fetch![0] as (event: SwFetchEvent) => void;
    const { responded, waited } = dispatchFetch(onFetch, {
      url: 'https://example.github.io/conquestoria/assets/app.js',
      method: 'GET',
    });

    await expect(responded).resolves.toBe(freshResponse);
    await expect(Promise.all(waited)).resolves.toBeDefined();
  });
});
