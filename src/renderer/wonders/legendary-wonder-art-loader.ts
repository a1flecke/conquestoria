import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';
import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { LEGENDARY_WONDER_ART_IDS, getLegendaryWonderArtPath } from './legendary-wonder-art-catalog';

// Loader for the Era 5-7 legendary wonder PNGs (#613). Same contract as wonder-tile-loader.ts: cache by wonder id and
// return null for anything not loaded, so the renderer keeps drawing the canvas fallback (offline, 404, still loading).
const cache = new Map<string, HTMLImageElement>();
const inFlight = new Map<string, Promise<void>>();

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`Legendary wonder art failed to load: ${url}`));
    image.src = url;
  });
}

function loadOne(wonderId: string): Promise<void> {
  const existing = inFlight.get(wonderId);
  if (existing) return existing;
  const path = getLegendaryWonderArtPath(wonderId);
  if (!path) return Promise.resolve();
  const promise = loadImage(resolveAppAssetUrl(path))
    .then(image => { cache.set(wonderId, image); notifyCanvasAssetReady(); })
    .catch(() => { /* the canvas fallback stays in effect; a later preload retries */ })
    .finally(() => { inFlight.delete(wonderId); });
  inFlight.set(wonderId, promise);
  return promise;
}

/** Never rejects. Safe to call repeatedly: loaded art is kept, in-flight loads are shared, failed ones are retried. */
export async function preloadLegendaryWonderArt(): Promise<void> {
  await Promise.all(LEGENDARY_WONDER_ART_IDS.filter(id => !cache.has(id)).map(loadOne));
}

/** The cached production art for a wonder, or null when it has none or has not loaded (draw the canvas fallback). */
export function getLegendaryWonderArtImage(wonderId: string): HTMLImageElement | null {
  return cache.get(wonderId) ?? null;
}

export function resetLegendaryWonderArtForTests(): void {
  cache.clear();
  inFlight.clear();
}
