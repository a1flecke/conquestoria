// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { derivePalette } from '@/renderer/sprites/sprite-system';

/**
 * #1439 follow-up: the sprite cache outlives a campaign. `startGame()` runs for a new game, a loaded
 * save and hot-seat re-entry in one page session, and `createNewGame` reuses `player` as a civ id with a
 * different colour each time. These tests pin the lifecycle: an image is tied to the palette it was built
 * for, a load that finishes after the campaign moved on can never replace current art or resurrect
 * released art, unchanged demand is idempotent, and a failed load is retried at an explicit boundary
 * (the next start), never per frame.
 */

const COLOR_A = '#4a90d9';
const COLOR_B = '#d94a4a';
const COLOR_C = '#3fa34d';
const PALETTE_A = derivePalette(COLOR_A);
const PALETTE_B = derivePalette(COLOR_B);

let pending: HTMLImageElement[] = [];
let svgByUrl = new Map<string, string>();
let svgByImage = new WeakMap<HTMLImageElement, string>();
let createdUrls = 0;
let revokedUrls = 0;
let nextUrl = 0;

class CapturingBlob extends Blob {
  readonly svg: string;
  constructor(parts?: BlobPart[], options?: BlobPropertyBag) {
    super(parts, options);
    this.svg = (parts ?? []).map(String).join('');
  }
}

async function flush(): Promise<void> {
  await new Promise(resolve => setTimeout(resolve, 0));
}

async function finish(image: HTMLImageElement, outcome: 'load' | 'error' = 'load'): Promise<void> {
  pending = pending.filter(candidate => candidate !== image);
  if (outcome === 'load') image.onload?.(new Event('load'));
  else image.onerror?.(new Event('error'));
  await flush();
}

async function settleAll(outcome: 'load' | 'error' = 'load'): Promise<void> {
  let guard = 0;
  while (pending.length > 0 && guard < 20_000) {
    await finish(pending[0]!, outcome);
    guard += 1;
  }
  await flush();
}

/** Pending sprite images whose SVG was built from `palette`. */
function pendingFor(palette: { mid: string }): HTMLImageElement[] {
  return pending.filter(image => (svgByImage.get(image) ?? '').includes(palette.mid));
}

function svgOf(image: HTMLImageElement | null): string {
  return (image && svgByImage.get(image)) ?? '';
}

async function loadModules() {
  vi.resetModules();
  const loader = await import('@/renderer/sprites/sprite-loader');
  const ready = await import('@/renderer/canvas-asset-ready');
  return { ...loader, onCanvasAssetReady: ready.onCanvasAssetReady };
}

beforeEach(() => {
  pending = [];
  svgByUrl = new Map();
  svgByImage = new WeakMap();
  createdUrls = 0;
  revokedUrls = 0;
  nextUrl = 0;
  vi.stubGlobal('Blob', CapturingBlob);
  vi.spyOn(URL, 'createObjectURL').mockImplementation((blob: Blob | MediaSource) => {
    createdUrls += 1;
    const url = `blob:sprite-${nextUrl++}`;
    svgByUrl.set(url, (blob as CapturingBlob).svg ?? '');
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => { revokedUrls += 1; });
  let currentSrc = '';
  Object.defineProperty(HTMLImageElement.prototype, 'src', {
    set(this: HTMLImageElement, value: string) {
      currentSrc = value;
      svgByImage.set(this, svgByUrl.get(value) ?? '');
      pending.push(this);
    },
    get() { return currentSrc; },
    configurable: true,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('a palette change for a reused civilization id (#1439 follow-up)', () => {
  it('rebuilds art in the new colour when a new campaign reuses the same civ id', async () => {
    const { initSprites, spriteCache } = await loadModules();
    const demand = [{ id: 'granary', civId: 'player' }, { id: 'warrior', civId: 'player' }];

    void initSprites({ player: COLOR_A }, demand);
    await flush();
    await settleAll();
    const buildingA = spriteCache.getBuilding('granary', 'player');
    const unitA = spriteCache.getUnit('warrior', 'player');
    expect(svgOf(buildingA)).toContain(PALETTE_A.mid);

    void initSprites({ player: COLOR_B }, demand);
    await flush();
    await settleAll();

    const buildingB = spriteCache.getBuilding('granary', 'player');
    const unitB = spriteCache.getUnit('warrior', 'player');
    expect(buildingB).not.toBe(buildingA);
    expect(unitB).not.toBe(unitA);
    expect(svgOf(buildingB)).toContain(PALETTE_B.mid);
    expect(svgOf(buildingB)).not.toContain(PALETTE_A.mid);
    expect(svgOf(unitB)).toContain(PALETTE_B.mid);
  });

  it('never serves the previous colour while the new colour is still loading', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ player: COLOR_A }, [{ id: 'granary', civId: 'player' }]);
    await flush();
    await settleAll();
    expect(spriteCache.getBuilding('granary', 'player')).not.toBeNull();

    void initSprites({ player: COLOR_B }, [{ id: 'granary', civId: 'player' }]);
    await flush();

    expect(spriteCache.getBuilding('granary', 'player')).toBeNull(); // fallback glyph, not the old colour
    await settleAll();
    expect(svgOf(spriteCache.getBuilding('granary', 'player'))).toContain(PALETTE_B.mid);
  });

  it('a neutral owner whose colour changes is rebuilt in the new colour', async () => {
    const { spriteCache } = await loadModules();
    spriteCache.ensureUnit('warrior', 'barbarian', COLOR_A);
    await flush();
    await settleAll();
    expect(svgOf(spriteCache.getUnit('warrior', 'barbarian'))).toContain(PALETTE_A.mid);

    spriteCache.ensureUnit('warrior', 'barbarian', COLOR_B);
    await flush();
    await settleAll();
    expect(svgOf(spriteCache.getUnit('warrior', 'barbarian'))).toContain(PALETTE_B.mid);
  });
});

describe('overlapping loads across a campaign switch (#1439 follow-up)', () => {
  async function startOverlap() {
    const mods = await loadModules();
    void mods.initSprites({ player: COLOR_A }, [{ id: 'granary', civId: 'player' }]);
    await flush();
    const staleA = pendingFor(PALETTE_A).filter(image => image);
    expect(staleA.length).toBeGreaterThan(0);
    // Campaign B begins while A's building image is still decoding.
    void mods.initSprites({ player: COLOR_B }, [{ id: 'granary', civId: 'player' }]);
    await flush();
    return { ...mods, staleA };
  }

  it('A finishing after B does not replace B', async () => {
    const { spriteCache, staleA } = await startOverlap();
    // Pirate images fill the in-flight slots; finish those (not A's) until B's building starts decoding.
    let guard = 0;
    while (pendingFor(PALETTE_B).length === 0 && guard < 100) {
      await finish(pending.find(image => !staleA.includes(image))!);
      guard += 1;
    }
    const currentB = pendingFor(PALETTE_B);
    expect(currentB.length).toBeGreaterThan(0);

    for (const image of currentB) await finish(image);
    const imageB = spriteCache.getBuilding('granary', 'player');
    expect(svgOf(imageB)).toContain(PALETTE_B.mid);

    for (const image of staleA) await finish(image);
    await settleAll();
    expect(spriteCache.getBuilding('granary', 'player')).toBe(imageB);
    expect(createdUrls - revokedUrls).toBe(0);
  });

  it('A finishing before B is complete never leaves A in the cache', async () => {
    const { spriteCache, staleA } = await startOverlap();
    for (const image of staleA) await finish(image);
    expect(spriteCache.getBuilding('granary', 'player')).toBeNull();

    await settleAll();
    expect(svgOf(spriteCache.getBuilding('granary', 'player'))).toContain(PALETTE_B.mid);
    expect(createdUrls - revokedUrls).toBe(0);
  });

  it('a stale completion does not announce itself to the canvas', async () => {
    const { spriteCache, staleA, onCanvasAssetReady } = await startOverlap();
    for (const image of pendingFor(PALETTE_B)) await finish(image);
    await settleAll();
    expect(spriteCache.getBuilding('granary', 'player')).not.toBeNull();

    const announcements = vi.fn();
    onCanvasAssetReady(announcements);
    for (const image of staleA) await finish(image);
    await flush();
    expect(announcements).not.toHaveBeenCalled();
  });

  it('a civilization released by a new campaign is not resurrected by its late image', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ old: COLOR_A }, [{ id: 'granary', civId: 'old' }]);
    await flush();
    const late = pendingFor(PALETTE_A);
    expect(late.length).toBeGreaterThan(0);

    void initSprites({ fresh: COLOR_B }, []); // a different campaign: 'old' no longer exists
    await flush();
    for (const image of late) await finish(image);
    await settleAll();

    const before = createdUrls;
    expect(spriteCache.getBuilding('granary', 'old')).toBeNull();
    await flush();
    expect(createdUrls).toBe(before); // no palette is registered for it, so it cannot even be re-requested
    expect(createdUrls - revokedUrls).toBe(0);
  });

  it('a still-needed same-palette request is not cancelled or duplicated by the next start', async () => {
    const { initSprites, spriteCache } = await loadModules();
    void initSprites({ player: COLOR_A }, [{ id: 'granary', civId: 'player' }]);
    await flush();
    const inFlight = pendingFor(PALETTE_A);
    const urlsAfterFirst = createdUrls;

    const second = initSprites({ player: COLOR_A }, [{ id: 'granary', civId: 'player' }]);
    await flush();
    expect(createdUrls).toBe(urlsAfterFirst); // joined, not duplicated

    for (const image of inFlight) await finish(image);
    await settleAll();
    await second;
    expect(svgOf(spriteCache.getBuilding('granary', 'player'))).toContain(PALETTE_A.mid);
  });
});

describe('repeated starts of an unchanged campaign (#1439 follow-up)', () => {
  it('creates no new images for unchanged (id, colour) demand, pirates included', async () => {
    const { initSprites } = await loadModules();
    const colors = { player: COLOR_A, ai_1: COLOR_B };
    const demand = [
      { id: 'warrior', civId: 'player' },
      { id: 'granary', civId: 'player' },
      { id: 'archer', civId: 'ai_1' },
    ];
    void initSprites(colors, demand);
    await flush();
    await settleAll();
    const afterFirst = createdUrls;
    expect(afterFirst).toBeGreaterThan(0);

    for (let start = 0; start < 5; start += 1) {
      await Promise.all([initSprites(colors, demand)].map(p => (async () => { await flush(); await settleAll(); return p; })()));
    }
    expect(createdUrls).toBe(afterFirst);
    expect(pending).toHaveLength(0);
  });

  it('joins the pirate set already in flight instead of scheduling a second one', async () => {
    const single = await loadModules();
    void single.initSprites({ a: COLOR_A }, []);
    await flush();
    await settleAll();
    const oneSet = createdUrls;
    expect(oneSet).toBeGreaterThan(0);

    createdUrls = 0;
    const { initSprites } = await loadModules();
    void initSprites({ a: COLOR_A }, []);
    await flush();
    void initSprites({ a: COLOR_A }, []); // hot-seat re-entry while pirates still decode
    await flush();
    await settleAll();
    expect(createdUrls).toBe(oneSet);
  });
});

describe('failed loads recover at an explicit boundary (#1439 follow-up)', () => {
  it('is retried once by the next start, never by a frame, and the queue is not stuck', async () => {
    const { initSprites, spriteCache } = await loadModules();
    const demand = [{ id: 'granary', civId: 'player' }];
    const first = initSprites({ player: COLOR_A }, demand).then(() => 'resolved', () => 'rejected');
    await flush();
    await settleAll('error');
    expect(await first).toBe('rejected');
    expect(spriteCache.getBuilding('granary', 'player')).toBeNull();

    const afterFailure = createdUrls;
    for (let frame = 0; frame < 100; frame += 1) {
      spriteCache.getBuilding('granary', 'player');
      spriteCache.getUnit('warrior', 'player');
    }
    await flush();
    // Frames may request a pair they never asked for before (the warrior), but never re-request the failed one.
    const frameCreated = createdUrls - afterFailure;
    await settleAll();
    expect(frameCreated).toBeLessThanOrEqual(3);
    expect(spriteCache.getBuilding('granary', 'player')).toBeNull();

    const second = initSprites({ player: COLOR_A }, demand); // the explicit boundary
    await flush();
    await settleAll();
    await second;
    expect(spriteCache.getBuilding('granary', 'player')).toBeInstanceOf(HTMLImageElement);
  });

  it('a failed pirate set is not retried by frames, but the next start retries it', async () => {
    const { initSprites, spriteCache } = await loadModules();
    const first = initSprites({ a: COLOR_A }, []).then(() => 'resolved', () => 'rejected');
    await flush();
    await settleAll('error');
    expect(await first).toBe('rejected');
    const afterFailure = createdUrls;

    for (let frame = 0; frame < 50; frame += 1) spriteCache.ensureUnit('pirate_galley' as never, 'pirates', '#000000');
    await flush();
    expect(createdUrls).toBe(afterFailure);

    const second = initSprites({ a: COLOR_A }, []);
    await flush();
    await settleAll();
    await second;
    expect(spriteCache.getUnit('pirate_galley' as never, 'pirates')).toBeInstanceOf(HTMLImageElement);
  });
});

describe('cache size across many campaigns (#1439 follow-up)', () => {
  it('does not accumulate entries for civilizations a later campaign no longer has', async () => {
    const { initSprites, getSpriteCacheStats } = await loadModules();
    const campaigns: Array<{ colors: Record<string, string>; civs: string[] }> = [
      { colors: { player: COLOR_A, ai_1: COLOR_B, ai_2: COLOR_C }, civs: ['player', 'ai_1', 'ai_2'] },
      { colors: { player: COLOR_B }, civs: ['player'] },
    ];
    const sizes: number[][] = [[], []];
    for (let round = 0; round < 4; round += 1) {
      for (const [index, campaign] of campaigns.entries()) {
        const demand = campaign.civs.map(civId => ({ id: 'granary', civId }));
        void initSprites(campaign.colors, demand);
        await flush();
        await settleAll();
        const stats = getSpriteCacheStats();
        sizes[index]!.push(stats.buildingImages);
        expect(stats.buildingImages).toBe(campaign.civs.length);
        expect(stats.civilizations).toBe(campaign.civs.length);
      }
    }
    expect(new Set(sizes[0]).size).toBe(1);
    expect(new Set(sizes[1]).size).toBe(1);
    expect(createdUrls - revokedUrls).toBe(0);
  });

  it('keeps neutral-owner art across hot-seat re-entry of the same campaign', async () => {
    const { initSprites, spriteCache } = await loadModules();
    const colors = { player: COLOR_A };
    void initSprites(colors, []);
    spriteCache.ensureUnit('warrior', 'barbarian', COLOR_B);
    await flush();
    await settleAll();
    const barbarian = spriteCache.getUnit('warrior', 'barbarian');
    expect(barbarian).not.toBeNull();

    void initSprites(colors, []); // same campaign, next hot-seat turn
    await flush();
    await settleAll();
    expect(spriteCache.getUnit('warrior', 'barbarian')).toBe(barbarian);
  });
});
