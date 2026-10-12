import { loadStaticSvgImage } from '@/renderer/static-svg-image';
import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';
import { getRailSegmentSvg } from './rail-segment-marker';

let cachedImage: HTMLImageElement | null = null;

export async function preloadRailSegment(): Promise<void> {
  const img = await loadStaticSvgImage(getRailSegmentSvg());
  cachedImage = img;
  notifyCanvasAssetReady();
}

export function getRailSegmentImage(): HTMLImageElement | null {
  return cachedImage;
}
