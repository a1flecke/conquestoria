import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { notifyCanvasAssetReady, onCanvasAssetReady } from '@/renderer/canvas-asset-ready';

describe('canvas asset readiness signal (#1439)', () => {
  it('coalesces a burst of notifications into one listener call', async () => {
    const listener = vi.fn();
    const off = onCanvasAssetReady(listener);
    notifyCanvasAssetReady();
    notifyCanvasAssetReady();
    notifyCanvasAssetReady();
    expect(listener).not.toHaveBeenCalled();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(1);
    off();
  });

  it('fires again for a later burst and stops after unsubscribe', async () => {
    const listener = vi.fn();
    const off = onCanvasAssetReady(listener);
    notifyCanvasAssetReady();
    await Promise.resolve();
    notifyCanvasAssetReady();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
    off();
    notifyCanvasAssetReady();
    await Promise.resolve();
    expect(listener).toHaveBeenCalledTimes(2);
  });
});

describe('canvas image loaders announce readiness (#1439)', () => {
  const originalImage = (globalThis as { Image?: unknown }).Image;
  beforeEach(() => {
    class FakeImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onload?.()); }
    }
    (globalThis as { Image?: unknown }).Image = FakeImage;
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:x', revokeObjectURL: () => {} }));
  });
  afterEach(() => {
    (globalThis as { Image?: unknown }).Image = originalImage;
    vi.unstubAllGlobals();
  });

  it('terrain tiles notify when the cache fills', async () => {
    const listener = vi.fn();
    const off = onCanvasAssetReady(listener);
    const { preloadTerrainTiles, getTerrainTileImage } = await import('@/renderer/terrain/terrain-tile-loader');
    await preloadTerrainTiles();
    await Promise.resolve();
    expect(getTerrainTileImage('grassland', 0, 0)).not.toBeNull();
    expect(listener).toHaveBeenCalled();
    off();
  });

  it('a marker preload notifies when its image is cached', async () => {
    const listener = vi.fn();
    const off = onCanvasAssetReady(listener);
    const { preloadFarmMarker, getFarmMarkerImage } = await import('@/renderer/improvements/farm-marker');
    await preloadFarmMarker();
    await Promise.resolve();
    expect(getFarmMarkerImage()).not.toBeNull();
    expect(listener).toHaveBeenCalled();
    off();
  });
});

describe('every canvas image cache is wired to the readiness signal (#1439)', () => {
  // png-sprite-canvas only feeds SpriteCache.loadCiv, whose commit announces readiness.
  // Static SVG decoding feeds the domain caches; those announce readiness after committing.
  const EXEMPT = new Set(['src/renderer/sprites/png/png-sprite-canvas.ts', 'src/renderer/static-svg-image.ts']);

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap(name => {
      const path = join(dir, name);
      return statSync(path).isDirectory() ? walk(path) : [path];
    });
  }

  it('any src/renderer module creating an Image imports canvas-asset-ready', () => {
    const offenders = walk('src/renderer')
      .filter(path => /\.(ts|tsx)$/.test(path))
      .filter(path => !EXEMPT.has(path))
      .filter(path => /new Image\(/.test(readFileSync(path, 'utf8')))
      .filter(path => !/canvas-asset-ready/.test(readFileSync(path, 'utf8')));
    expect(offenders).toEqual([]);
  });
});

describe('immutable canvas preloads survive campaign restarts', () => {
  const loaders: Array<[string, string, () => Promise<unknown>]> = [
    ['terrain/terrain-tile-loader', 'preloadTerrainTiles', () => import('../../src/renderer/terrain/terrain-tile-loader') ],
    ['terrain/wonder-tile-loader', 'preloadNaturalWonderTiles', () => import('../../src/renderer/terrain/wonder-tile-loader') ],
    ['improvements/rail-segment-loader', 'preloadRailSegment', () => import('../../src/renderer/improvements/rail-segment-loader') ],
    ['improvements/resource-outpost-marker', 'preloadOutpostMarker', () => import('../../src/renderer/improvements/resource-outpost-marker') ],
    ['improvements/religion-badge-marker', 'preloadReligionBadgeMarker', () => import('../../src/renderer/improvements/religion-badge-marker') ],
    ['improvements/crisis-badge-markers', 'preloadCrisisBadgeMarkers', () => import('../../src/renderer/improvements/crisis-badge-markers') ],
    ['improvements/fort-marker', 'preloadFortMarker', () => import('../../src/renderer/improvements/fort-marker') ],
    ['improvements/farm-marker', 'preloadFarmMarker', () => import('../../src/renderer/improvements/farm-marker') ],
    ['improvements/mine-marker', 'preloadMineMarker', () => import('../../src/renderer/improvements/mine-marker') ],
    ['improvements/quarry-marker', 'preloadQuarryMarker', () => import('../../src/renderer/improvements/quarry-marker') ],
    ['improvements/pasture-marker', 'preloadPastureMarker', () => import('../../src/renderer/improvements/pasture-marker') ],
    ['improvements/plantation-marker', 'preloadPlantationMarker', () => import('../../src/renderer/improvements/plantation-marker') ],
    ['improvements/camp-marker', 'preloadCampMarker', () => import('../../src/renderer/improvements/camp-marker') ],
    ['improvements/watermill-marker', 'preloadWatermillMarker', () => import('../../src/renderer/improvements/watermill-marker') ],
    ['improvements/lumber-camp-marker', 'preloadLumberCampMarker', () => import('../../src/renderer/improvements/lumber-camp-marker') ],
  ];
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
  it('does not leak a Blob URL when constructing an image fails', async () => {
    vi.resetModules();
    vi.stubGlobal('Image', class { constructor() { throw new Error('Image unavailable'); } });
    const create = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const { loadStaticSvgImage } = await import('../../src/renderer/static-svg-image');
    await expect(loadStaticSvgImage('<svg/>')).rejects.toThrow('Image unavailable');
    expect(create).not.toHaveBeenCalled();
  });

  it('revokes a Blob URL when assigning the image URL fails', async () => {
    vi.resetModules();
    vi.stubGlobal('Image', class {
      onload = null;
      onerror = null;
      set src(_value: string) { throw new Error('Image URL unavailable'); }
    });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { loadStaticSvgImage } = await import('../../src/renderer/static-svg-image');
    await expect(loadStaticSvgImage('<svg/>')).rejects.toThrow('Image URL unavailable');
    expect(revoke).toHaveBeenCalledWith('blob:test');
  });
  it('revokes failed terrain URLs and retries only the failed image', async () => {
    vi.resetModules();
    const images: Array<{ onload: (() => void) | null; onerror: (() => void) | null }> = [];
    class ControlledImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { images.push(this); }
      set src(_value: string) {}
    }
    vi.stubGlobal('Image', ControlledImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const { preloadTerrainTiles } = await import('../../src/renderer/terrain/terrain-tile-loader');
    const pending = preloadTerrainTiles();
    const rejected = expect(pending).rejects.toThrow('Static SVG image load failed');
    const count = images.length;
    images[0]!.onerror?.();
    for (const image of images.slice(1)) image.onload?.();
    await rejected;
    expect(revoke).toHaveBeenCalledTimes(count);
    expect(images[0]!.onload).toBeNull();
    expect(images[0]!.onerror).toBeNull();
    const retry = preloadTerrainTiles();
    expect(images).toHaveLength(count + 1);
    images.at(-1)!.onload?.();
    await retry;
    expect(revoke).toHaveBeenCalledTimes(count + 1);
  });
  it.each(loaders)('%s coalesces concurrent loads and reuses loaded images', async (_path, name, load) => {
    vi.resetModules();
    const images: Array<{ onload: (() => void) | null }> = [];
    class ControlledImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { images.push(this); }
      set src(_value: string) {}
    }
    vi.stubGlobal('Image', ControlledImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:test');
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    const module = await (load as () => Promise<unknown>)() as Record<string, () => Promise<void>>;
    const first = module[name]!();
    const count = images.length;
    expect(count).toBeGreaterThan(0);
    const second = module[name]!();
    expect(images).toHaveLength(count);
    for (const image of images) image.onload?.();
    await Promise.all([first, second]);
    await module[name]!();
    expect(images).toHaveLength(count);
    expect(revoke).toHaveBeenCalledTimes(count);
    vi.restoreAllMocks();
  });
});
