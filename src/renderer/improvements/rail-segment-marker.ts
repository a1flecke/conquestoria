// Directional SVG track segment drawn along a road edge once BOTH endpoint
// tiles resolve `hasRail: true` (see `resolveTileHasRail` in
// `road-network.ts`). Rendered rotated per-edge in `hex-renderer.ts`, not
// centered on a hex like a standard Improvement Marker — steel-gray rails on
// wooden ties, faction-neutral, no animation. Replaces the plain brown line
// segment used before Railway Expansion is completed.

const RAIL_SEGMENT_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <g stroke-linecap="round" stroke-linejoin="round">
    <g stroke="#5e3f24" stroke-width="5">
      <path d="M6,14 L6,34"/>
      <path d="M15,10 L15,38"/>
      <path d="M24,7 L24,41"/>
      <path d="M33,10 L33,38"/>
      <path d="M42,14 L42,34"/>
    </g>
    <g stroke="#8a929b" stroke-width="2.4">
      <path d="M4,18 L44,18"/>
      <path d="M4,30 L44,30"/>
    </g>
    <g stroke="#e8edf2" stroke-width="0.8" opacity="0.5">
      <path d="M4,17 L44,17"/>
      <path d="M4,29 L44,29"/>
    </g>
  </g>
</svg>`;

export function getRailSegmentSvg(): string {
  return RAIL_SEGMENT_SVG;
}
