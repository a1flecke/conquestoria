// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getPngUnitManifest } from '@/renderer/sprites/png/png-sprite-catalog';
import { allSpriteDemand } from '../../helpers/sprite-demand';

/**
 * #1439 phase 4: sprite loads are scheduled, not fired as one burst. A civilization is ~500 SVG
 * images; creating them all at once kept the main thread busy for seconds after the first paint
 * and delayed the first interaction. These tests pin the contracts that must survive scheduling:
 * the same images end up cached, `initSprites` still means "everything is loaded", the canvas is
 * told when what is drawn at rest is ready, and a failed image never wedges the queue.
 */

type Meta = { kind: string; itemId: string; civilization: string; motion?: string };

let pending: HTMLImageElement[] = [];
let peakInFlight = 0;
let started: Meta[] = [];
let createdUrls = 0;
let revokedUrls = 0;

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function settle(count: number, outcome: 'load' | 'error' = 'load'): Promise<void> {
  for (let i = 0; i < count && pending.length > 0; i += 1) {
    const image = pending.shift()!;
    if (outcome === 'load') image.onload?.(new Event('load'));
    else image.onerror?.(new Event('error'));
    await flush();
  }
}

async function settleAll(outcome: 'load' | 'error' = 'load'): Promise<void> {
  let guard = 0;
  while (pending.length > 0 && guard < 20_000) {
    await settle(1, outcome);
    guard += 1;
  }
  await flush();
}

async function loadModules() {
  vi.resetModules();
  const loader = await import('@/renderer/sprites/sprite-loader');
  const ready = await import('@/renderer/canvas-asset-ready');
  return { ...loader, onCanvasAssetReady: ready.onCanvasAssetReady };
}

beforeEach(() => {
  pending = [];
  peakInFlight = 0;
  started = [];
  createdUrls = 0;
  revokedUrls = 0;
  vi.spyOn(URL, 'createObjectURL').mockImplementation(() => { createdUrls += 1; return 'blob:mock'; });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { revokedUrls += 1; });
  let currentSrc = '';
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    // Loads only complete when the test says so, so in-flight work is observable.
    set(this: HTMLImageElement, value: string) {
      currentSrc = value;
      pending.push(this);
      // Only sprite images count: PNG-baked units also load a spritesheet through an Image.
      const sprites = pending.filter(image => (image as unknown as Record<symbol, unknown>)[Symbol.for('conquestoria.spriteDiagnostic')]);
      peakInFlight = Math.max(peakInFlight, sprites.length);
    },
    get() { return currentSrc; },
    configurable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

function recordStarts(getMeta: (image: HTMLImageElement) => Meta | undefined): void {
  const original = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src')!;
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(this: HTMLImageElement, value: string) {
      const meta = getMeta(this);
      if (meta) started.push(meta);
      original.set!.call(this, value);
    },
    get: original.get,
    configurable: true,
  });
}

describe('sprite load scheduling (#1439 phase 4)', () => {
  it('never has more than SPRITE_LOAD_CONCURRENCY images in flight, and still caches everything', async () => {
    const { initSprites, spriteCache, SPRITE_LOAD_CONCURRENCY } = await loadModules();
    let resolved = false;
    void initSprites({ a: '#4a90d9' }, allSpriteDemand(['a'])).then(() => { resolved = true; });
    await flush();
    expect(pending.length).toBeGreaterThan(0);
    expect(pending.length).toBeLessThanOrEqual(SPRITE_LOAD_CONCURRENCY);

    await settleAll();

    expect(peakInFlight).toBeLessThanOrEqual(SPRITE_LOAD_CONCURRENCY);
    expect(createdUrls - revokedUrls).toBe(0);
    expect(resolved).toBe(true);
    expect(spriteCache.getUnit('warrior', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'a', 'move-a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'a', 'move-b')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getBuilding('granary', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnit('pirate_galley', 'pirates')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getLandmark('pirate_enclave_stage_1')).toBeInstanceOf(HTMLImageElement);
  });

  it('does not generate every SVG up front: blob URLs stay bounded while loads are outstanding', async () => {
    const { initSprites, SPRITE_LOAD_CONCURRENCY } = await loadModules();
    void initSprites({ a: '#4a90d9' }, allSpriteDemand(['a']));
    await flush();
    expect(createdUrls).toBeLessThanOrEqual(SPRITE_LOAD_CONCURRENCY * 2);
    await settle(5);
    expect(createdUrls - revokedUrls).toBeLessThanOrEqual(SPRITE_LOAD_CONCURRENCY);
    await settleAll();
  });

  it('loads what is drawn at rest before walk frames, and pirates before walk frames', async () => {
    const { initSprites, getSpriteDiagnosticMetadata } = await loadModules();
    recordStarts(image => getSpriteDiagnosticMetadata(image) as Meta | undefined);
    void initSprites({ a: '#4a90d9' }, allSpriteDemand(['a']));
    await flush();
    await settleAll();

    // PNG-baked units await a sheet bake before their SVG fallback shows up, so their image order
    // reflects the bake, not the queue; every other sprite's image is created when its turn starts.
    const ordered = started.filter(meta => meta.kind !== 'unit' || !getPngUnitManifest(meta.itemId));
    const isWalk = (meta: Meta) => meta.motion === 'move-a' || meta.motion === 'move-b';
    const firstWalk = ordered.findIndex(isWalk);
    const lastRest = ordered.map((meta, index) => (isWalk(meta) ? -1 : index)).reduce((a, b) => Math.max(a, b), -1);
    expect(firstWalk).toBeGreaterThan(-1);
    expect(lastRest).toBeGreaterThan(-1);
    // Every idle frame, building and pirate landmark starts before any walk frame.
    expect(lastRest).toBeLessThan(firstWalk);
    expect(ordered.some(meta => meta.kind === 'building' && meta.civilization === 'a')).toBe(true);
  });

  it('announces to the canvas once the at-rest sprites are ready, before walk frames finish, and again at the end', async () => {
    const { initSprites, spriteCache, onCanvasAssetReady } = await loadModules();
    const announcements = vi.fn();
    onCanvasAssetReady(announcements);
    let resolved = false;
    void initSprites({ a: '#4a90d9' }, allSpriteDemand(['a'])).then(() => { resolved = true; });
    await flush();

    // Settle until the first walk frame is the next image in flight: all at-rest images are loaded.
    let guard = 0;
    while (!spriteCache.getBuilding('granary', 'a') && guard < 5_000) { await settle(1); guard += 1; }
    while (pending.length > 0 && guard < 20_000) {
      if (spriteCache.getUnitMotion('warrior', 'a', 'move-a') !== null) break;
      await settle(1);
      guard += 1;
    }
    await flush();
    const midCalls = announcements.mock.calls.length;
    expect(spriteCache.getUnit('warrior', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getBuilding('granary', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(midCalls).toBeGreaterThanOrEqual(1);
    expect(resolved).toBe(false); // walk frames and pirates are still loading

    await settleAll();
    expect(resolved).toBe(true);
    expect(announcements.mock.calls.length).toBeGreaterThan(midCalls);
  });

  it('keeps per-civilization palettes separate (cache keyed by civ, not shared across colours)', async () => {
    const { initSprites, spriteCache, getSpriteDiagnosticMetadata } = await loadModules();
    void initSprites({ a: '#4a90d9', b: '#d94a4a' }, allSpriteDemand(['a', 'b']));
    await flush();
    await settleAll();
    const a = spriteCache.getUnit('warrior', 'a')!;
    const b = spriteCache.getUnit('warrior', 'b')!;
    expect(a).not.toBe(b);
    expect(getSpriteDiagnosticMetadata(a)?.civilization).toBe('a');
    expect(getSpriteDiagnosticMetadata(b)?.civilization).toBe('b');
    expect(spriteCache.getBuilding('granary', 'a')).not.toBe(spriteCache.getBuilding('granary', 'b'));
  });

  it('a failing image rejects the load but never wedges the queue: later work still completes', async () => {
    const { initSprites, spriteCache } = await loadModules();
    const failing = initSprites({ a: '#4a90d9' }, allSpriteDemand(['a']));
    const outcome = failing.then(() => 'resolved', () => 'rejected');
    await flush();
    await settle(1, 'error');
    expect(await outcome).toBe('rejected');
    await settleAll();

    spriteCache.registerCiv('later', '#8a6f2a');
    void spriteCache.request('warrior', 'later');
    void spriteCache.request('granary', 'later');
    await flush();
    await settleAll();
    expect(spriteCache.getUnit('warrior', 'later')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getBuilding('granary', 'later')).toBeInstanceOf(HTMLImageElement);
  });

  it('coalesces on-demand loads for the same civilization', async () => {
    const { spriteCache } = await loadModules();
    spriteCache.ensureUnit('warrior', 'minor', '#8a6f2a');
    spriteCache.ensureUnit('warrior', 'minor', '#8a6f2a');
    await flush();
    const firstBurst = createdUrls;
    spriteCache.ensureUnit('warrior', 'minor', '#8a6f2a');
    await flush();
    expect(createdUrls).toBe(firstBurst);
    await settleAll();
    expect(spriteCache.getUnit('warrior', 'minor')).toBeInstanceOf(HTMLImageElement);
  });
});

describe('demand-driven sprite creation (#1439 phase 5)', () => {
  /** Images created by pirates alone: the fixed cost every game pays regardless of demand. */
  async function pirateBaseline(): Promise<number> {
    const { initSprites } = await loadModules();
    void initSprites({ a: '#4a90d9' }, []);
    await flush();
    await settleAll();
    return createdUrls;
  }

  it('creates only the demanded sprites, not the whole catalog', async () => {
    const base = await pirateBaseline();
    createdUrls = 0;
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ a: '#4a90d9' }, [{ id: 'warrior', civId: 'a' }]);
    await flush();
    await settleAll();
    // Pirates + one unit type x 3 motions; the ~500-image civilization catalog is not created.
    expect(createdUrls).toBe(base + 3);
    expect(spriteCache.getUnit('warrior', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'a', 'move-a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnitMotion('warrior', 'a', 'move-b')).toBeInstanceOf(HTMLImageElement);
  });

  it('a cache miss requests the missing sprite exactly once, then it is cached and announced', async () => {
    const { initSprites, spriteCache, onCanvasAssetReady } = await loadModules();
    void initSprites({ a: '#4a90d9' }, []);
    await flush();
    await settleAll();
    const before = createdUrls;
    const announcements = vi.fn();
    onCanvasAssetReady(announcements);

    for (let frame = 0; frame < 50; frame += 1) {
      expect(spriteCache.getUnit('archer', 'a')).toBeNull(); // every frame until it lands: the caller falls back
    }
    await flush();
    await settleAll();

    expect(createdUrls - before).toBe(3); // 50 misses -> one request (3 motions)
    expect(spriteCache.getUnit('archer', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(announcements).toHaveBeenCalled();
  });

  it('does not request anything for a civilization whose palette is unknown, until the renderer supplies it', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ a: '#4a90d9' }, []);
    await flush();
    await settleAll();
    const before = createdUrls;

    expect(spriteCache.getUnit('warrior', 'barbarian')).toBeNull();
    await flush();
    expect(createdUrls).toBe(before); // no colour, nothing to draw with

    spriteCache.ensureUnit('warrior', 'barbarian', '#8b4513');
    await flush();
    await settleAll();
    expect(spriteCache.getUnit('warrior', 'barbarian')).toBeInstanceOf(HTMLImageElement);
  });

  it('resolves a production-queue head to the right catalog: a building id and a unit id both work', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ a: '#4a90d9' }, []);
    await flush();
    await settleAll();

    // The city badge asks getBuilding(head) ?? getUnit(head) with a head that may be either kind.
    expect(spriteCache.getBuilding('granary', 'a')).toBeNull();
    expect(spriteCache.getBuilding('warrior', 'a')).toBeNull(); // a unit id queued in a city
    await flush();
    await settleAll();

    expect(spriteCache.getBuilding('granary', 'a')).toBeInstanceOf(HTMLImageElement);
    expect(spriteCache.getUnit('warrior', 'a')).toBeInstanceOf(HTMLImageElement);
  });

  it('an id with no sprite art (a wonder in the queue) is remembered, never re-requested per frame', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ a: '#4a90d9' }, []);
    await flush();
    await settleAll();
    const before = createdUrls;

    for (let frame = 0; frame < 100; frame += 1) {
      expect(spriteCache.getBuilding('some_legendary_wonder', 'a')).toBeNull();
    }
    await flush();
    expect(createdUrls).toBe(before);
    expect(pending).toHaveLength(0);
  });

  it('a failed image is not retried every frame', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ a: '#4a90d9' }, []);
    await flush();
    await settleAll();

    expect(spriteCache.getUnit('archer', 'a')).toBeNull();
    await flush();
    await settle(3, 'error');
    await settleAll('error');
    const afterFailure = createdUrls;

    for (let frame = 0; frame < 50; frame += 1) spriteCache.getUnit('archer', 'a');
    await flush();
    expect(createdUrls).toBe(afterFailure);
  });

  it('the same unit type for two civilizations keeps separate palettes', async () => {
    const { initSprites, spriteCache, getSpriteDiagnosticMetadata } = await loadModules();
    void initSprites({ a: '#4a90d9', b: '#d94a4a' }, [
      { id: 'warrior', civId: 'a' },
      { id: 'warrior', civId: 'b' },
    ]);
    await flush();
    await settleAll();
    const a = spriteCache.getUnit('warrior', 'a')!;
    const b = spriteCache.getUnit('warrior', 'b')!;
    expect(a).not.toBe(b);
    expect(getSpriteDiagnosticMetadata(a)?.civilization).toBe('a');
    expect(getSpriteDiagnosticMetadata(b)?.civilization).toBe('b');
  });
});
