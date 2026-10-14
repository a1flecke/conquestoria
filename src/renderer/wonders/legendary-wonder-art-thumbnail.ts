import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { getLegendaryWonderArtPath } from './legendary-wonder-art-catalog';

const LEGENDARY_QUEUE_PREFIX = 'legendary:';

/** `legendary:<wonderId>` -> `<wonderId>`; null for anything that is not a legendary queue item. */
export function legendaryWonderIdFromQueueItem(itemId: string): string | null {
  if (!itemId.startsWith(LEGENDARY_QUEUE_PREFIX)) return null;
  const wonderId = itemId.slice(LEGENDARY_QUEUE_PREFIX.length);
  return wonderId.length > 0 ? wonderId : null;
}

/**
 * A decorative `<img>` of a wonder's production art for panels and queues, or null when the wonder has none
 * (callers keep their existing emoji). The wonder's name is always rendered next to it, so it is `alt=""`/aria-hidden.
 * Only call this where the viewer is already shown the wonder's name.
 */
export function createLegendaryWonderThumbnail(wonderId: string, sizePx: number): HTMLImageElement | null {
  const path = getLegendaryWonderArtPath(wonderId);
  if (!path || !Number.isFinite(sizePx) || sizePx <= 0) return null;
  const img = document.createElement('img');
  img.src = resolveAppAssetUrl(path);
  img.alt = '';
  img.setAttribute('aria-hidden', 'true');
  img.width = sizePx;
  img.height = sizePx;
  img.dataset.wonderArt = wonderId;
  img.style.cssText = 'image-rendering:pixelated;object-fit:contain;vertical-align:middle;flex:none;';
  return img;
}
