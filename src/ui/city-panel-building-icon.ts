import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { PRODUCTION_ICON_FALLBACK } from '@/systems/city-production-presentation';
import { buildBuildingArtPanelSvg } from '@/renderer/buildings/building-art-sprite';
import { getUnitIconSource, type UnitIconSource } from '@/renderer/sprites/unit-icon-source';
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

/** Whose colour a production icon wears: the city owner's, never a hard-coded civ. `color` is null for a neutral owner. */
export interface ProductionIconOwner {
  readonly palette: FactionPalette;
  readonly color: string | null;
}

const PRODUCTION_ICON_STYLE =
  `display:inline-block;width:${PRODUCTION_ICON_SIZE_PX}px;height:${PRODUCTION_ICON_SIZE_PX}px;vertical-align:middle;`;

// Gives each rendered SVG unit icon its own id namespace, so repeating one unit (chooser, Producing line, queue) never shares a
// gradient or pattern id with another copy that may later be removed.
let unitIconSerial = 0;

function unitIconHtml(unitType: string, source: UnitIconSource): string {
  if (source.kind === 'png') {
    // `cq-png-static` holds the first frame: a list of icons does not animate.
    return `<span data-unit-art="${unitType}" data-unit-art-kind="png" class="cq-png-static" aria-hidden="true" ` +
      `style="${PRODUCTION_ICON_STYLE}position:relative;">${source.html}</span>`;
  }
  const svg = namespaceSvgIds(source.svg, `${unitType}-${unitIconSerial++}`)
    .replace(/(<svg\b[^>]*?)\swidth="\d+"\s+height="\d+"/, `$1 width="${PRODUCTION_ICON_SIZE_PX}" height="${PRODUCTION_ICON_SIZE_PX}"`);
  return `<span data-unit-art="${unitType}" data-unit-art-kind="svg" aria-hidden="true" style="${PRODUCTION_ICON_STYLE}">${svg}</span>`;
}

/**
 * The icon for a production item in the build chooser, its locked-items list, the "Producing" line and the queue (#620, #1535):
 * a building with production art shows that art with the owner's banner over it; a unit shows its real sprite (an SVG from the
 * catalog, or the first frame of its PNG sheet) in the owner's colour; every other item keeps what it always showed (a legendary
 * wonder's art, or the shared emoji). The name is always rendered next to it, so the icon is decorative and hidden from assistive
 * technology.
 */
export function getProductionItemIconHtml(itemId: string, owner: ProductionIconOwner): string {
  const artSvg = buildBuildingArtPanelSvg(itemId, owner.palette, PRODUCTION_ICON_SIZE_PX);
  if (artSvg) return `<span data-building-art="${itemId}" aria-hidden="true" style="${PRODUCTION_ICON_STYLE}">${artSvg}</span>`;
  const unitSource = getUnitIconSource(itemId, owner.color);
  if (unitSource) return unitIconHtml(itemId, unitSource);
  return productionIconHtml(itemId);
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
