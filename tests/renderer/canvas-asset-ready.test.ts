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
  const EXEMPT = new Set(['src/renderer/sprites/png/png-sprite-canvas.ts']);

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
