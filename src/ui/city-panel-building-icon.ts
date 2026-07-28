import { BUILDING_SPRITE_CATALOG } from '@/renderer/sprites/sprite-catalog';
import { PRODUCTION_ICON_FALLBACK } from '@/systems/city-system';
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

export function getAnimatedBuildingIconHtml(
  buildingId: string,
  palette: FactionPalette,
  phaseKey: string,
): string {
  const spriteFn = BUILDING_SPRITE_CATALOG[buildingId];
  if (!spriteFn) {
    return `<div style="width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;` +
      `display:flex;align-items:center;justify-content:center;font-size:20px;">` +
      `${PRODUCTION_ICON_FALLBACK}</div>`;
  }

  const rawSvg = spriteFn({ palette, svgOnly: true });
  const suffix = `${buildingId}-${Math.abs(hashCode(phaseKey))}`;
  const svg = namespaceSvgIds(rawSvg, suffix)
    .replace('<svg ', `<svg width="${ICON_SIZE_PX}" height="${ICON_SIZE_PX}" `);
  const phase = (Math.abs(hashCode(phaseKey)) % 100) / 100;

  return `<div class="cq-sprite-wrap cq-v2" data-state="idle" data-kind="building" ` +
    `style="--phase:${phase};width:${ICON_SIZE_PX}px;height:${ICON_SIZE_PX}px;flex:none;` +
    `overflow:hidden;border-radius:6px;">${svg}</div>`;
}
