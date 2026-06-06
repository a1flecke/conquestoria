// Lumber camp improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="6"  y="32" width="36" height="7" rx="2" fill="#8a6a3a" stroke="#5e3f24" stroke-width="1.2"/>
  <rect x="8"  y="36" width="32" height="5" rx="1" fill="#c19a6b" stroke="#5e3f24" stroke-width="0.8"/>
  <line x1="14" y1="32" x2="14" y2="41" stroke="#5e3f24" stroke-width="1"/>
  <line x1="22" y1="32" x2="22" y2="41" stroke="#5e3f24" stroke-width="1"/>
  <line x1="30" y1="32" x2="30" y2="41" stroke="#5e3f24" stroke-width="1"/>
  <g stroke="#1f1a14" stroke-width="1.4" fill="none">
    <line x1="30" y1="8" x2="38" y2="30"/>
    <line x1="26" y1="8" x2="34" y2="30"/>
    <line x1="28" y1="14" x2="36" y2="14"/>
    <line x1="30" y1="20" x2="38" y2="20"/>
  </g>
  <rect x="10" y="6" width="14" height="5" rx="2" fill="#5e3f24" stroke="#1f1a14" stroke-width="1"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadLumberCampMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('lumber-camp-marker load failed')); };
    img.src = url;
  });
}

export function getLumberCampMarkerImage(): HTMLImageElement | null { return cached; }
