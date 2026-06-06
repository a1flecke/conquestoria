// Quarry improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="6"  y="36" width="36" height="6"  rx="1" fill="#9a8e78" stroke="#6a5e4a" stroke-width="1.2"/>
  <rect x="10" y="28" width="28" height="10" rx="1" fill="#c4b8a4" stroke="#6a5e4a" stroke-width="1"/>
  <rect x="14" y="20" width="20" height="10" rx="1" fill="#d6ccbc" stroke="#6a5e4a" stroke-width="1"/>
  <rect x="18" y="12" width="12" height="10" rx="1" fill="#e0d8cc" stroke="#6a5e4a" stroke-width="1"/>
  <line x1="10"  y1="28" x2="6"  y2="36" stroke="#6a5e4a" stroke-width="0.8"/>
  <line x1="38"  y1="28" x2="42" y2="36" stroke="#6a5e4a" stroke-width="0.8"/>
  <line x1="14"  y1="20" x2="10" y2="28" stroke="#6a5e4a" stroke-width="0.8"/>
  <line x1="34"  y1="20" x2="38" y2="28" stroke="#6a5e4a" stroke-width="0.8"/>
  <line x1="18"  y1="12" x2="14" y2="20" stroke="#6a5e4a" stroke-width="0.8"/>
  <line x1="30"  y1="12" x2="34" y2="20" stroke="#6a5e4a" stroke-width="0.8"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadQuarryMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('quarry-marker load failed')); };
    img.src = url;
  });
}

export function getQuarryMarkerImage(): HTMLImageElement | null { return cached; }
