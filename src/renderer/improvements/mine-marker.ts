// Mine improvement marker — Canvas 2D drawImage, no animation.

const SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" stroke-linecap="round">
  <ellipse cx="24" cy="44" rx="16" ry="3" fill="rgba(0,0,0,0.18)"/>
  <rect x="10" y="30" width="28" height="12" rx="2" fill="#9a8e78" stroke="#6a5e4a" stroke-width="1.2"/>
  <rect x="14" y="34" width="20" height="5" rx="1" fill="#6a5e4a" stroke="#3a3228" stroke-width="0.8"/>
  <g stroke="#1f1a14" stroke-width="1.4">
    <line x1="24" y1="6" x2="14" y2="28" />
    <line x1="24" y1="6" x2="34" y2="28" />
    <line x1="16" y1="22" x2="32" y2="22" />
  </g>
  <circle cx="24" cy="6" r="3" fill="#5a6068" stroke="#1f1a14" stroke-width="1"/>
  <circle cx="14" cy="28" r="2.5" fill="#5a6068" stroke="#1f1a14" stroke-width="0.8"/>
  <circle cx="34" cy="28" r="2.5" fill="#5a6068" stroke="#1f1a14" stroke-width="0.8"/>
</svg>`;

let cached: HTMLImageElement | null = null;

export async function preloadMineMarker(): Promise<void> {
  const blob = new Blob([SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cached = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('mine-marker load failed')); };
    img.src = url;
  });
}

export function getMineMarkerImage(): HTMLImageElement | null { return cached; }
