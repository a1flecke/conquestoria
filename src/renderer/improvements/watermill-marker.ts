// Watermill improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="4" y="36" width="40" height="6" rx="1" fill="#3a6e94" opacity="0.7"/>
  <rect x="14" y="26" width="20" height="14" rx="2" fill="#8a6a3a" stroke="#5e3f24" stroke-width="1.2"/>
  <circle cx="24" cy="22" r="12" fill="none" stroke="#5e3f24" stroke-width="1.6"/>
  <line x1="24" y1="10" x2="24" y2="34" stroke="#5e3f24" stroke-width="1.2"/>
  <line x1="12" y1="22" x2="36" y2="22" stroke="#5e3f24" stroke-width="1.2"/>
  <line x1="15.5" y1="13.5" x2="32.5" y2="30.5" stroke="#5e3f24" stroke-width="1.2"/>
  <line x1="32.5" y1="13.5" x2="15.5" y2="30.5" stroke="#5e3f24" stroke-width="1.2"/>
  <circle cx="24" cy="22" r="2.5" fill="#d4a13c" stroke="#1f1a14" stroke-width="0.8"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadWatermillMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('watermill-marker load failed')); };
    img.src = url;
  });
}

export function getWatermillMarkerImage(): HTMLImageElement | null { return cached; }
