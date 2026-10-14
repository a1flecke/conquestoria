import { getProductionIconForItem } from '@/systems/city-production-presentation';
import { getLegendaryWonderArtPath } from '@/renderer/wonders/legendary-wonder-art-catalog';
import {
  createLegendaryWonderThumbnail,
  legendaryWonderIdFromQueueItem,
} from '@/renderer/wonders/legendary-wonder-art-thumbnail';

// The one UI-layer entry to the renderer's wonder-art helpers: panels import from here, not from src/renderer.
export { createLegendaryWonderThumbnail };

export const LEGENDARY_WONDER_ICON_SIZE_PX = 28;

/**
 * Icon markup for a production item inside a panel template. A legendary wonder with production art gets a placeholder span
 * (the shared emoji inside it) that `hydrateLegendaryWonderIcons` swaps for the art after the panel's HTML is inserted;
 * everything else is exactly the emoji it always was. The id in the attribute is catalog-validated, never raw save data.
 */
export function productionIconHtml(itemId: string): string {
  const emoji = getProductionIconForItem(itemId);
  const wonderId = legendaryWonderIdFromQueueItem(itemId);
  if (!wonderId || !getLegendaryWonderArtPath(wonderId)) return emoji;
  return `<span data-wonder-thumb="${wonderId}">${emoji}</span>`;
}

/** Replaces each `[data-wonder-thumb]` placeholder under `root` with the wonder's art; a missing art leaves the emoji. */
export function hydrateLegendaryWonderIcons(root: ParentNode, sizePx: number = LEGENDARY_WONDER_ICON_SIZE_PX): void {
  for (const placeholder of Array.from(root.querySelectorAll<HTMLElement>('[data-wonder-thumb]'))) {
    const art = createLegendaryWonderThumbnail(placeholder.dataset.wonderThumb ?? '', sizePx);
    if (art) placeholder.replaceChildren(art);
  }
}
