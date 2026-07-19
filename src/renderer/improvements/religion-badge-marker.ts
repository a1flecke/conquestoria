// Small map badge marking a city that follows a religion. Two variants (own faith vs
// foreign faith) so a viewer can tell at a glance which cities are theirs devotionally.
// No faction palette (religion identity is separate from civ color). Deliberately an
// abstract invented mark, not an identifiable real-world religious symbol (cross,
// crescent, Star of David, etc.) -- this game invents its own per-civ faith names/
// identity, and an earlier draft of the loyalty-pressure badge (MR6) was caught in
// inline review using real-world religious iconography; this stays abstract on purpose.
const RELIGION_BADGE_OWN_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>
  <path d="M24,9 V39 M14,19 H34" stroke="#e0b0ff" stroke-width="4" stroke-linecap="round"/>
</svg>`;

const RELIGION_BADGE_FOREIGN_SVG = `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>
  <path d="M24,9 V39 M14,19 H34" stroke="#9a80ab" stroke-width="4" stroke-linecap="round" opacity="0.75"/>
</svg>`;

let cachedOwn: HTMLImageElement | null = null;
let cachedForeign: HTMLImageElement | null = null;

async function loadSvgImage(svg: string): Promise<HTMLImageElement> {
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

export async function preloadReligionBadgeMarker(): Promise<void> {
  [cachedOwn, cachedForeign] = await Promise.all([
    loadSvgImage(RELIGION_BADGE_OWN_SVG),
    loadSvgImage(RELIGION_BADGE_FOREIGN_SVG),
  ]);
}

export function getReligionBadgeMarkerImage(isOwnFaith: boolean): HTMLImageElement | null {
  return isOwnFaith ? cachedOwn : cachedForeign;
}
