import { Banner, type FactionPalette } from '@/renderer/sprites/sprite-system';
import { resolveAppAssetUrl } from '@/renderer/asset-url';
import { BUILDING_ART, getBuildingArtPath } from './building-art-catalog';

// The sprite frame every building uses (see BUILDING_SPRITE_SIZE): the art fills it, the owner's banner stands on top.
const FRAME = 192;
const ART_INSET_X = 8;
const ART_INSET_TOP = 12;
const ART_SIZE = FRAME - 2 * ART_INSET_X;
const BANNER_SCALE = 2.2; // large enough to read as a flag in the 36 px panel icon

/** The city-panel icon's SVG: the same art referenced by file URL (an inline SVG may fetch it), or null for a building without art. */
export function buildBuildingArtPanelSvg(buildingId: string, palette: FactionPalette, sizePx: number): string | null {
  const path = getBuildingArtPath(buildingId);
  return path ? buildBuildingArtSvg(buildingId, palette, resolveAppAssetUrl(path), sizePx) : null;
}

/**
 * The SVG for a building that has production art: the art as an `<image>` (`href` is a data URI for the canvas bake, where an
 * SVG loaded as an `<img>` may not fetch anything, or a plain URL inside a panel) with the owner's banner over it. Null for a
 * building without art. Civ colour comes only from `palette`.
 */
export function buildBuildingArtSvg(buildingId: string, palette: FactionPalette, href: string, sizePx: number = FRAME): string | null {
  const entry = BUILDING_ART[buildingId];
  if (!entry) return null;
  const banner = Banner({ x: entry.bannerX, y: entry.bannerY, palette, scale: BANNER_SCALE });
  return `<svg viewBox="0 0 ${FRAME} ${FRAME}" width="${sizePx}" height="${sizePx}" xmlns="http://www.w3.org/2000/svg">` +
    `<image href="${href}" x="${ART_INSET_X}" y="${ART_INSET_TOP}" width="${ART_SIZE}" height="${ART_SIZE}" preserveAspectRatio="xMidYMid meet"/>` +
    `${banner}</svg>`;
}
