// Fort / Citadel tile-improvement markers.
//
// Drawn on the hex map via Canvas 2D. Follows the resource-outpost-marker.ts
// pattern: a standalone `viewBox="0 0 48 48"` SVG string is preloaded into an
// HTMLImageElement once at game start and blitted with `ctx.drawImage`. When the
// image is not available (still loading, load failure, or the node/vitest test
// environment with no Image API) the marker falls back to deterministic Canvas
// primitives so the tile is never blank.
//
// Both tiers share one silhouette family — an angular defensive enclosure with a
// front gate and a central strongpoint — so a Citadel reads as the Fort scaled
// up rather than as unrelated art:
//   * Fort    — low earth berm, timber palisade teeth, small blockhouse.
//   * Citadel — same enclosure in masonry, pointed corner bastions, a reinforced
//               gatehouse and a tall crenellated keep. Larger overall silhouette.
//
// Faction-neutral by design, like every other improvement marker (see
// `.claude/rules/sprites.md`): forts belong to a tile, not to a civ's heraldry,
// and the earthy palette keeps them legible on every terrain. The only accent is
// a neutral amber pennant, matching the outpost marker's amber flag.

export type FortMarkerTier = 'fort' | 'citadel';

const INK = '#1f1a14';
const EARTH = '#8a6a3a';
const EARTH_DARK = '#5e3f24';
const TIMBER = '#5e3f24';
const STONE = '#9a8e78';
const STONE_LIGHT = '#c4b8a4';
const STONE_DARK = '#6a5e4a';
const AMBER = '#d4a13c';

// Palisade teeth along the Fort's rear rampart.
const FORT_PALISADE = [12, 17, 22, 27, 32, 37]
  .map(x => `<rect x="${x - 1.4}" y="16.5" width="2.8" height="7" rx="0.6" fill="${TIMBER}"/>`)
  .join('');

export const FORT_MARKER_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="24" cy="41.5" rx="18" ry="3.4" fill="rgba(0,0,0,0.22)"/>
  <path class="cq-fort-ditch" d="M5,39 L43,39 L38.5,23 L9.5,23 Z" fill="none" stroke="${EARTH_DARK}" stroke-width="2.4" opacity="0.7"/>
  <path class="cq-fort-berm" d="M7,38 L41,38 L36.5,22 L11.5,22 Z" fill="${EARTH}" stroke="${INK}" stroke-width="1.4"/>
  <path d="M11.5,22 L36.5,22 L34.5,29 L13.5,29 Z" fill="${EARTH_DARK}" opacity="0.35"/>
  ${FORT_PALISADE}
  <g class="cq-fort-gate">
    <rect x="20.5" y="30" width="7" height="9" fill="${EARTH_DARK}" stroke="${INK}" stroke-width="1"/>
    <rect x="18.5" y="27.5" width="3" height="12" fill="${TIMBER}" stroke="${INK}" stroke-width="0.9"/>
    <rect x="26.5" y="27.5" width="3" height="12" fill="${TIMBER}" stroke="${INK}" stroke-width="0.9"/>
  </g>
  <g class="cq-fort-blockhouse">
    <rect x="19.5" y="13" width="9" height="9" fill="${EARTH}" stroke="${INK}" stroke-width="1"/>
    <path d="M18,13 L30,13 L24,7 Z" fill="${TIMBER}" stroke="${INK}" stroke-width="1"/>
    <rect x="20" y="3" width="1.4" height="7" fill="${TIMBER}"/>
    <path d="M21.2,3 L27,5 L21.2,7.4 Z" fill="${AMBER}" stroke="${INK}" stroke-width="0.7"/>
  </g>
</svg>`;

// Diamond corner bastions that give the Citadel its star-fort corners.
const CITADEL_BASTIONS = `
  <path class="cq-citadel-bastion-l" d="M9.5,37 L4,31 L10,27 L15,33 Z" fill="${STONE}" stroke="${INK}" stroke-width="1.2"/>
  <path class="cq-citadel-bastion-r" d="M38.5,37 L44,31 L38,27 L33,33 Z" fill="${STONE}" stroke="${INK}" stroke-width="1.2"/>`;

const CITADEL_MERLONS = [0, 1, 2, 3]
  .map(i => `<rect x="${18.5 + i * 3.6}" y="4" width="2.4" height="3.4" fill="${STONE_LIGHT}" stroke="${INK}" stroke-width="0.6"/>`)
  .join('');

export const CITADEL_MARKER_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round" stroke-linejoin="round">
  <ellipse cx="24" cy="41.5" rx="20" ry="3.6" fill="rgba(0,0,0,0.24)"/>
  ${CITADEL_BASTIONS}
  <path class="cq-citadel-curtain" d="M7,38 L41,38 L36,20 L12,20 Z" fill="${STONE}" stroke="${INK}" stroke-width="1.5"/>
  <g stroke="${STONE_DARK}" stroke-width="0.7" opacity="0.55">
    <path d="M12,26 L36,26 M13,32 L35,32 M10,38 L38,38"/>
    <path d="M18,20 L18,38 M24,20 L24,38 M30,20 L30,38"/>
  </g>
  <g class="cq-citadel-gatehouse">
    <rect x="19.5" y="24" width="9" height="15" fill="${STONE_LIGHT}" stroke="${INK}" stroke-width="1.2"/>
    <path d="M21,39 L21,32 Q24,28.5 27,32 L27,39 Z" fill="${EARTH_DARK}" stroke="${INK}" stroke-width="0.9"/>
  </g>
  <g class="cq-citadel-keep">
    <rect x="17.5" y="7" width="13" height="17" fill="${STONE_LIGHT}" stroke="${INK}" stroke-width="1.4"/>
    ${CITADEL_MERLONS}
    <rect x="17.5" y="14" width="13" height="2.6" fill="${AMBER}" opacity="0.9"/>
    <rect x="22.5" y="17" width="3.4" height="7" fill="${STONE_DARK}"/>
    <rect x="23" y="1" width="1.4" height="7" fill="${TIMBER}"/>
    <path d="M24.4,1 L30,3 L24.4,5.4 Z" fill="${AMBER}" stroke="${INK}" stroke-width="0.7"/>
  </g>
</svg>`;

export const FORT_MARKER_SVG_BY_TIER: Record<FortMarkerTier, string> = {
  fort: FORT_MARKER_SVG,
  citadel: CITADEL_MARKER_SVG,
};

const cachedImages: Record<FortMarkerTier, HTMLImageElement | null> = {
  fort: null,
  citadel: null,
};

function loadOne(tier: FortMarkerTier): Promise<void> {
  const blob = new Blob([FORT_MARKER_SVG_BY_TIER[tier]], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cachedImages[tier] = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(`fort-marker (${tier}) load failed`)); };
    img.src = url;
  });
}

export async function preloadFortMarker(): Promise<void> {
  await Promise.all([loadOne('fort'), loadOne('citadel')]);
}

export function getFortMarkerImage(tier: FortMarkerTier): HTMLImageElement | null {
  return cachedImages[tier];
}

/** Deterministic Canvas fallback — used when the SVG image has not loaded (or in
 * the test environment, which has no Image API). Keeps the Fort low and flat and
 * the Citadel taller with a keep + neutral accent, so the two tiers stay
 * distinguishable even in the degraded path. */
function drawFallback(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tier: FortMarkerTier,
): void {
  const height = tier === 'citadel' ? size * 0.42 : size * 0.28;
  const top = cy + size * 0.28 - height;
  ctx.fillStyle = tier === 'citadel' ? 'rgba(154, 142, 120, 0.96)' : 'rgba(138, 106, 58, 0.94)';
  ctx.fillRect(cx - size * 0.3, top, size * 0.6, height);
  ctx.strokeStyle = 'rgba(31, 26, 20, 0.95)';
  ctx.lineWidth = Math.max(1, size * 0.04);
  ctx.strokeRect(cx - size * 0.3, top, size * 0.6, height);
  if (tier === 'citadel') {
    ctx.fillStyle = 'rgba(196, 184, 164, 0.98)';
    ctx.fillRect(cx - size * 0.12, top - size * 0.24, size * 0.24, size * 0.28);
    ctx.fillStyle = 'rgba(212, 161, 60, 0.95)';
    ctx.fillRect(cx - size * 0.04, top - size * 0.36, size * 0.08, size * 0.14);
  } else {
    ctx.fillStyle = 'rgba(94, 63, 36, 0.95)';
    for (let i = 0; i < 4; i++) {
      ctx.fillRect(cx - size * 0.26 + i * size * 0.17, top - size * 0.06, size * 0.06, size * 0.08);
    }
  }
}

export function drawFortMarker(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  size: number,
  tier: FortMarkerTier,
): void {
  (ctx as unknown as { operations?: string[] }).operations?.push(`fort-marker:${tier}`);

  const img = cachedImages[tier];
  const canDrawImage = img != null && typeof (ctx as Partial<CanvasRenderingContext2D>).drawImage === 'function';
  if (canDrawImage) {
    const w = size * (tier === 'citadel' ? 0.98 : 0.82);
    const h = w;
    // Anchor the marker's base to the same spot the old fill used (cy + size*0.28).
    ctx.drawImage(img as CanvasImageSource, cx - w / 2, cy + size * 0.28 - h, w, h);
    return;
  }

  drawFallback(ctx, cx, cy, size, tier);
}
