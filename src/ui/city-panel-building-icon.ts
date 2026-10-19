import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { PRODUCTION_ICON_FALLBACK } from '@/systems/city-production-presentation';
import { buildBuildingArtPanelSvg } from '@/renderer/buildings/building-art-sprite';
import { productionIconHtml } from './legendary-wonder-icon';
import { hashCode } from '@/renderer/sprite-overlay';
import type { FactionPalette } from '@/renderer/sprites/sprite-system';

export function namespaceSvgIds(svg: string, suffix: string): string {
  const ids = new Set<string>();
  const idPattern = /\bid="([^"]+)"/g;
  let match: RegExpExecArray | null;
  while ((match = idPattern.exec(svg)) !== null) {
    ids.add(match[1]);
  }
  if (ids.size === 0) return svg;

  let result = svg;
  for (const id of ids) {
    const escaped = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result
      .replace(new RegExp(`\\bid="${escaped}"`, 'g'), `id="${id}-${suffix}"`)
      .replace(new RegExp(`url\\(#${escaped}\\)`, 'g'), `url(#${id}-${suffix})`)
      .replace(new RegExp(`href="#${escaped}"`, 'g'), `href="#${id}-${suffix}"`);
  }
  return result;
}

const ICON_SIZE_PX = 36;

const PRODUCTION_ICON_SIZE_PX = 28;

/**
 * The icon for a production item in the build chooser, the "Producing" line and the queue (#620): a building with production art
 * shows that art with the owner's banner over it; every other item keeps what it always showed (a legendary wonder's art, or the
 * shared emoji). The name is always rendered next to it, so the art is decorative and hidden from assistive technology.
 */
export function getProductionItemIconHtml(itemId: string, palette: FactionPalette): string {
  const artSvg = buildBuildingArtPanelSvg(itemId, palette, PRODUCTION_ICON_SIZE_PX);
  if (!artSvg) return productionIconHtml(itemId);
  return `<span data-building-art="${itemId}" aria-hidden="true" ` +
    `style="display:inline-block;width:${PRODUCTION_ICON_SIZE_PX}px;height:${PRODUCTION_ICON_SIZE_PX}px;vertical-align:middle;">${artSvg}</span>`;
}

export function getAnimatedBuildingIconHtml(
  buildingId: string,
  palette: FactionPalette,
  phaseKey: string,
): string {
  // #620: production art (a plain file URL inside the panel's own inline SVG) with the owner's banner over it.
  const artSvg = buildBuildingArtPanelSvg(buildingId, palette, ICON_SIZE_PX);
  if (artSvg) {
    return `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="building" ` +
      `style="width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;overflow:hidden;border-radius:6px;">${artSvg}</div>`;
  }

  const spriteFn = BUILDING_SPRITE_CATALOG[buildingId];
  if (!spriteFn) {
    return `<div style="width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;` +
      `display:flex;align-items:center;justify-content:center;font-size:20px;">` +
      `${PRODUCTION_ICON_FALLBACK}</div>`;
  }

  const rawSvg = spriteFn({ palette, svgOnly: true });
  const hash = Math.abs(hashCode(phaseKey));
  const suffix = `${buildingId}-${hash}`;
  // SpriteFrame's svgOnly output always bakes in `width="192" height="192"` (the sprite's
  // native viewBox size) — replace those in place rather than prepending a second width/height
  // pair, which would leave two attributes of the same name on one element.
  const svg = namespaceSvgIds(rawSvg, suffix)
    .replace(/(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/, `$1 width="${ICON_SIZE_PX}" height="${ICON_SIZE_PX}"`);
  const phase = (hash % 100) / 100;

  return `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="building" ` +
    `style="--phase:${phase};width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;` +
    `overflow:hidden;border-radius:6px;">${svg}</div>`;
}
