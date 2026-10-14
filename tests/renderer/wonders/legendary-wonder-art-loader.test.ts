import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { LEGENDARY_WONDER_ART_IDS } from '@/renderer/wonders/legendary-wonder-art-catalog';

interface StubImage { src: string; onload: (() => void) | null; onerror: (() => void) | null }

describe('legendary wonder art loader (#613)', () => {
  let images: StubImage[];

  beforeEach(() => {
    vi.resetModules();
    images = [];
    class ControlledImage implements StubImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      src = '';
      constructor() { images.push(this); }
    }
    vi.stubGlobal('Image', ControlledImage);
  });
  afterEach(() => { vi.unstubAllGlobals(); });

  const load = () => import('@/renderer/wonders/legendary-wonder-art-loader');
  const settle = async (): Promise<void> => { await Promise.resolve(); await Promise.resolve(); };

  it('returns null before anything is preloaded and for unknown ids', async () => {
    const { getLegendaryWonderArtImage } = await load();
    expect(getLegendaryWonderArtImage('crystal-palace')).toBeNull();
    expect(getLegendaryWonderArtImage('manhattan-project')).toBeNull();
    expect(getLegendaryWonderArtImage('')).toBeNull();
  });

  it('caches every image by wonder id, requests the base-resolved path, and announces readiness', async () => {
    const listener = vi.fn();
    // Imported after vi.resetModules() so the listener lives in the same module graph as the loader.
    const { onCanvasAssetReady } = await import('@/renderer/canvas-asset-ready');
    const off = onCanvasAssetReady(listener);
    const { preloadLegendaryWonderArt, getLegendaryWonderArtImage } = await load();
    const pending = preloadLegendaryWonderArt();
    expect(images.map(image => image.src).sort()).toEqual(
      LEGENDARY_WONDER_ART_IDS.map(id => resolveAppAssetUrl(`images/wonders/art/${id}.png`)).sort(),
    );
    for (const image of images) image.onload?.();
    await pending;
    await settle();
    for (const id of LEGENDARY_WONDER_ART_IDS) expect(getLegendaryWonderArtImage(id), id).not.toBeNull();
    expect(getLegendaryWonderArtImage('crystal-palace')?.src).toContain('crystal-palace.png');
    expect(listener).toHaveBeenCalled();
    off();
  });

  it('a failed image falls back to null, the rest still load, and preload never rejects', async () => {
    const { preloadLegendaryWonderArt, getLegendaryWonderArtImage } = await load();
    const pending = preloadLegendaryWonderArt();
    const failed = images.find(image => image.src.endsWith('suez-canal.png'))!;
    for (const image of images) (image === failed ? image.onerror : image.onload)?.();
    await expect(pending).resolves.toBeUndefined();
    expect(getLegendaryWonderArtImage('suez-canal')).toBeNull();
    expect(getLegendaryWonderArtImage('iron-arsenal')).not.toBeNull();
  });

  it('coalesces concurrent preloads and does not refetch loaded art', async () => {
    const { preloadLegendaryWonderArt } = await load();
    const first = preloadLegendaryWonderArt();
    const count = images.length;
    const second = preloadLegendaryWonderArt();
    expect(images).toHaveLength(count);
    for (const image of images) image.onload?.();
    await Promise.all([first, second]);
    await preloadLegendaryWonderArt();
    expect(images).toHaveLength(count);
  });

  it('retries only the failed image on a later preload (a transient offline start must not poison the session)', async () => {
    const { preloadLegendaryWonderArt, getLegendaryWonderArtImage } = await load();
    const first = preloadLegendaryWonderArt();
    const failed = images.find(image => image.src.endsWith('suez-canal.png'))!;
    for (const image of images) (image === failed ? image.onerror : image.onload)?.();
    await first;
    const before = images.length;
    const retry = preloadLegendaryWonderArt();
    expect(images).toHaveLength(before + 1);
    images[before]!.onload?.();
    await retry;
    expect(getLegendaryWonderArtImage('suez-canal')).not.toBeNull();
  });
});

describe('resolveAppAssetUrl', () => {
  it('prefixes the build base and never double-slashes a relative path', () => {
    const url = resolveAppAssetUrl('images/x.png');
    expect(url.endsWith('images/x.png')).toBe(true);
    expect(url).not.toMatch(/\/\/images/);
  });
});
