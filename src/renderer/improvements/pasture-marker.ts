// Pasture improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="4" y="34" width="40" height="8" rx="1" fill="#7ea860" stroke="#3a5a28" stroke-width="1"/>
  <rect x="4"  y="20" width="3"  height="14" rx="1" fill="#5e3f24" stroke="#1f1a14" stroke-width="0.8"/>
  <rect x="41" y="20" width="3"  height="14" rx="1" fill="#5e3f24" stroke="#1f1a14" stroke-width="0.8"/>
  <rect x="4"  y="20" width="40" height="3"  rx="1" fill="#8a6a3a" stroke="#1f1a14" stroke-width="0.8"/>
  <rect x="4"  y="28" width="40" height="3"  rx="1" fill="#8a6a3a" stroke="#1f1a14" stroke-width="0.8"/>
  <ellipse cx="18" cy="30" rx="6" ry="4" fill="#c4b8a4" stroke="#6a5e4a" stroke-width="1"/>
  <circle  cx="18" cy="26" r="3.5" fill="#c4b8a4" stroke="#6a5e4a" stroke-width="1"/>
  <ellipse cx="32" cy="30" rx="6" ry="4" fill="#c4b8a4" stroke="#6a5e4a" stroke-width="1"/>
  <circle  cx="32" cy="26" r="3.5" fill="#c4b8a4" stroke="#6a5e4a" stroke-width="1"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadPastureMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('pasture-marker load failed')); };
    img.src = url;
  });
}

export function getPastureMarkerImage(): HTMLImageElement | null { return cached; }
