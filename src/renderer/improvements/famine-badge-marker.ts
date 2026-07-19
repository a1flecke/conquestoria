// Small map badge marking a city under an active famine crisis. Rendered directly on
// the hex map canvas by drawCityWorldPressureBadgePass — no faction palette, no JSX
// wrapper. Replaces the generic ⚠️ emoji specifically when the active crisis archetype
// is 'famine'; other crisis archetypes (outbreak/catastrophe/hunt) keep the generic ⚠️.
const FAMINE_BADGE_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>
  <path d="M24,10 C18,18 15,24 15,29 C15,35 19,39 24,39 C29,39 33,35 33,29 C33,24 30,18 24,10 Z"
        fill="#c9822c" stroke="#7a4d18" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M24,17 C21,22 19,26 19,29 C19,32.5 21.2,35 24,35 C26.8,35 29,32.5 29,29 C29,26 27,22 24,17 Z"
        fill="#e8a85a"/>
</svg>`;

let cachedImage: HTMLImageElement | null = null;

export async function preloadFamineBadgeMarker(): Promise<void> {
  const blob = new Blob([FAMINE_BADGE_SVG], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cachedImage = img; resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export function getFamineBadgeMarkerImage(): HTMLImageElement | null {
  return cachedImage;
}
