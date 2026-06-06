// Farm improvement marker — Canvas 2D drawImage, no animation.
// Follows the resource-outpost-marker.ts pattern.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="4" y="30" width="40" height="12" rx="2" fill="#7ea860" stroke="#3a5a28" stroke-width="1.2"/>
  <line x1="12" y1="30" x2="12" y2="42" stroke="#5a8040" stroke-width="1"/>
  <line x1="24" y1="30" x2="24" y2="42" stroke="#5a8040" stroke-width="1"/>
  <line x1="36" y1="30" x2="36" y2="42" stroke="#5a8040" stroke-width="1"/>
  <path d="M6,30 Q10,20 16,22 Q20,14 24,16 Q28,10 32,14 Q38,16 42,24 L42,30 Z"
        fill="#a0c86a" stroke="#5a8040" stroke-width="1.2"/>
  <line x1="24" y1="16" x2="24" y2="30" stroke="#5a8040" stroke-width="0.8"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadFarmMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('farm-marker load failed')); };
    img.src = url;
  });
}

export function getFarmMarkerImage(): HTMLImageElement | null { return cached; }
