import { loadStaticSvgImage } from '@/renderer/static-svg-image';
import { notifyCanvasAssetReady } from '@/renderer/canvas-asset-ready';

// City-map badge for a city losing loyalty to another civilization's faith (#1620).
// Replaces the shared 🙏 "Faith" glyph, which did not distinguish "religion present"
// from "an outside faith is eroding this city's allegiance".
//
// Identity is the SILHOUETTE, not the colour, so it survives colour-blindness and
// grayscale: a pale hexagonal loyalty crest, split by a dark fissure, pinched between
// two thick inward-pointing pressure arrows. The religion badge is a plus/cross, and
// the crisis badges are a teardrop, spore cluster, bolt and claw slashes, so the
// fractured-crest read stays distinct at map sizes.
//
// Deliberately abstract: this project invents its own faiths and never uses real-world
// religious iconography. No animation, gradient, text, or faction palette — same
// 48x48 dark disc as every other city badge.
const DISC = '<circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>';

export const LOYALTY_PRESSURE_BADGE_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" data-loyalty-pressure-badge="fractured-crest">
  ${DISC}
  <g class="cq-loyalty-arrow" fill="none" stroke="#0f2f3d" stroke-width="6.2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.5,17 L13.5,24 L5.5,31"/>
    <path d="M42.5,17 L34.5,24 L42.5,31"/>
  </g>
  <g class="cq-loyalty-arrow" fill="none" stroke="#9dc3d6" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round">
    <path d="M5.5,17 L13.5,24 L5.5,31"/>
    <path d="M42.5,17 L34.5,24 L42.5,31"/>
  </g>
  <path class="cq-loyalty-crest" d="M24,8.5 L33,16.5 L33,30 L24,39.5 L15,30 L15,16.5 Z"
        fill="#d9e9f2" stroke="#12303d" stroke-width="1.7" stroke-linejoin="round"/>
  <path class="cq-loyalty-fissure" d="M24,8.5 L21.5,16 L26,23 L21.5,30 L24,39.5"
        fill="none" stroke="#12303d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

let cached: HTMLImageElement | null = null;

/** Rasterise the badge once, up front (never per frame). */
export async function preloadLoyaltyPressureBadgeMarker(): Promise<void> {
  if (cached) return;
  cached = await loadStaticSvgImage(LOYALTY_PRESSURE_BADGE_SVG);
  notifyCanvasAssetReady();
}

/** The cached badge, or null while loading / after a failed load (caller keeps the emoji fallback). */
export function getLoyaltyPressureBadgeMarkerImage(): HTMLImageElement | null {
  return cached;
}
