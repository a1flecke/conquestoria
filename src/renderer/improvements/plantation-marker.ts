// Plantation improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="22" y="28" width="4" height="14" rx="1" fill="#5e3f24" stroke="#1f1a14" stroke-width="0.8"/>
  <ellipse cx="24" cy="24" rx="14" ry="10" fill="#7ea860" stroke="#3a5a28" stroke-width="1.2"/>
  <ellipse cx="16" cy="26" rx="7" ry="6" fill="#a0c86a" stroke="#3a5a28" stroke-width="1"/>
  <ellipse cx="32" cy="26" rx="7" ry="6" fill="#a0c86a" stroke="#3a5a28" stroke-width="1"/>
  <ellipse cx="24" cy="16" rx="8" ry="7" fill="#b8d880" stroke="#3a5a28" stroke-width="1"/>
  <line x1="22" y1="28" x2="16" y2="32" stroke="#5e3f24" stroke-width="0.8"/>
  <line x1="26" y1="28" x2="32" y2="32" stroke="#5e3f24" stroke-width="0.8"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadPlantationMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('plantation-marker load failed')); };
    img.src = url;
  });
}

export function getPlantationMarkerImage(): HTMLImageElement | null { return cached; }
