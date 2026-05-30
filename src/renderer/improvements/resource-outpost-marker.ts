// Standalone SVG marker for a claimed resource outpost.
// Rendered directly on the hex map canvas — no faction palette, no JSX
// wrapper. Replaces the '🚩' emoji placeholder in hex-renderer.ts.
// Reads as a claimed outpost at 24-32 px; faction-neutral amber flag so
// it is visually distinct from a unit's heraldic <Banner>.

const RESOURCE_OUTPOST_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <ellipse cx="23" cy="43" rx="14" ry="3" fill="rgba(0,0,0,0.22)"/>
  <rect x="20.25" y="8" width="3.5" height="34" rx="1.2" fill="#5e3f24" stroke="#1f1a14" stroke-width="0.8" stroke-linejoin="round"/>
  <path d="M23.75,8.5 L39,12.5 L23.75,18 Z" fill="#d4a13c" stroke="#1f1a14" stroke-width="0.9" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M26,11.2 L33,12.8" stroke="#a9781f" stroke-width="1.4" stroke-linecap="round"/>
  <g stroke="#1f1a14" stroke-width="1" stroke-linejoin="round" stroke-linecap="round">
    <rect x="10" y="32" width="13" height="12" fill="#8a6a3a"/>
    <path d="M10,38 H23" stroke-width="0.8"/>
    <path d="M16.5,32 V44" stroke-width="0.8"/>
    <rect x="23" y="34" width="12" height="10" fill="#7a5d33"/>
    <path d="M23,39 H35" stroke-width="0.8"/>
    <path d="M29,34 V44" stroke-width="0.8"/>
  </g>
</svg>`;

let cachedImage: HTMLImageElement | null = null;

export async function preloadOutpostMarker(): Promise<void> {
  const blob = new Blob([RESOURCE_OUTPOST_SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cachedImage = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export function getOutpostMarkerImage(): HTMLImageElement | null {
  return cachedImage;
}
