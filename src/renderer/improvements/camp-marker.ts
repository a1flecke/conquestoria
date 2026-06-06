// Camp improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <polygon points="24,8 6,38 42,38" fill="#c19a6b" stroke="#5e3f24" stroke-width="1.4" stroke-linejoin="round"/>
  <polygon points="24,8 14,38 34,38" fill="#d4b482" stroke="#5e3f24" stroke-width="0.8" stroke-linejoin="round"/>
  <rect x="18" y="28" width="12" height="10" rx="1" fill="#8a6a3a" stroke="#5e3f24" stroke-width="0.8"/>
  <circle cx="24" cy="40" r="3" fill="#d4a13c" stroke="#8a5a18" stroke-width="0.8"/>
  <circle cx="24" cy="40" r="1.5" fill="#e8c64a"/>
  <line x1="20" y1="40" x2="28" y2="40" stroke="#c98a3a" stroke-width="0.8"/>
  <line x1="24" y1="36" x2="24" y2="43" stroke="#c98a3a" stroke-width="0.8"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadCampMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('camp-marker load failed')); };
    img.src = url;
  });
}

export function getCampMarkerImage(): HTMLImageElement | null { return cached; }
