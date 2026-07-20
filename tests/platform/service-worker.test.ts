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

type SwEventHandler = (event: { waitUntil: (p: Promise<unknown>) => void }) => void;

function loadServiceWorkerListeners(cachesApi: unknown): Record<string, SwEventHandler[]> {
  const listeners: Record<string, SwEventHandler[]> = {};
  const sandbox: Record<string, unknown> = {
    caches: cachesApi,
    addEventListener: (type: string, handler: SwEventHandler) => {
      (listeners[type] ??= []).push(handler);
    },
    skipWaiting: () => {},
    clients: { claim: () => {} },
    fetch: async () => ({ ok: true, clone: () => ({}) }),
    console,
  };
  sandbox.self = sandbox;
  vm.createContext(sandbox);
  const source = readFileSync(resolve(__dirname, '../../public/sw.js'), 'utf-8');
  vm.runInContext(source, sandbox);
  return listeners;
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
});
