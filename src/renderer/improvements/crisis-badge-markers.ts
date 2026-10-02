// Map badges marking a city under an active world-pressure crisis (#618, builds on #594 MR7's
// famine badge). Rendered directly on the hex map canvas by drawCityWorldPressureBadgePass —
// no faction palette, no animation, viewBox 0 0 48 48, same dark disc as every city badge.
//
// Identity is the SILHOUETTE, not the colour, so it survives colour-blindness and grayscale:
//   famine       — a single teardrop (one solid mass)
//   outbreak     — a cluster of round spores joined to a core (many small circles)
//   catastrophe  — a jagged bolt (one angular diagonal)
//   hunt         — three parallel claw slashes (three strokes)
// Each is drawn light-on-dark with a dark outline so busy terrain behind the disc cannot erase it.
//
// Record<CrisisArchetype, …> is exhaustive on purpose: adding an archetype to the type is a
// compile error here until someone designs its badge. A corrupt/unknown runtime archetype (an
// old or tampered save) simply has no entry and the renderer shows the generic ⚠️.
//
// The badge deliberately carries NO severity: crisis severity is intel gated behind
// `diplomatic-networks` (world-pressure-presentation.ts), so encoding it on an always-visible
// map badge would leak that gated detail.
import type { CrisisArchetype } from '@/core/types';

const DISC = '<circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"/>';

export const CRISIS_BADGE_SVG: Record<CrisisArchetype, string> = {
  famine: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" data-crisis-badge="famine">
  ${DISC}
  <path d="M24,10 C18,18 15,24 15,29 C15,35 19,39 24,39 C29,39 33,35 33,29 C33,24 30,18 24,10 Z"
        fill="#c9822c" stroke="#7a4d18" stroke-width="1.4" stroke-linejoin="round"/>
  <path d="M24,17 C21,22 19,26 19,29 C19,32.5 21.2,35 24,35 C26.8,35 29,32.5 29,29 C29,26 27,22 24,17 Z"
        fill="#e8a85a"/>
</svg>`,
  outbreak: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" data-crisis-badge="outbreak">
  ${DISC}
  <g stroke="#1c3a1c" stroke-width="1.4" stroke-linejoin="round" fill="#8fd16f">
    <path d="M24,24 L24,12 M24,24 L34.4,30 M24,24 L13.6,30" fill="none" stroke="#8fd16f" stroke-width="3" stroke-linecap="round"/>
    <circle cx="24" cy="24" r="6.5"/>
    <circle cx="24" cy="11.5" r="4.2"/>
    <circle cx="34.8" cy="30.2" r="4.2"/>
    <circle cx="13.2" cy="30.2" r="4.2"/>
  </g>
  <circle cx="24" cy="24" r="2.4" fill="#1c3a1c"/>
</svg>`,
  catastrophe: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" data-crisis-badge="catastrophe">
  ${DISC}
  <path d="M28,7 L14,26 L22,26 L18,41 L35,20 L26.5,20 Z"
        fill="#f4cf3a" stroke="#6b4e00" stroke-width="1.5" stroke-linejoin="miter"/>
</svg>`,
  hunt: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg" data-crisis-badge="hunt">
  ${DISC}
  <g fill="none" stroke="#1d0c08" stroke-width="5.6" stroke-linecap="round">
    <path d="M15,13 Q19,24 14,35"/><path d="M25,11 Q29,24 24,37"/><path d="M35,13 Q39,24 34,35"/>
  </g>
  <g fill="none" stroke="#f08a70" stroke-width="3.2" stroke-linecap="round">
    <path d="M15,13 Q19,24 14,35"/><path d="M25,11 Q29,24 24,37"/><path d="M35,13 Q39,24 34,35"/>
  </g>
</svg>`,
};

const cachedImages = new Map<CrisisArchetype, HTMLImageElement>();

async function preloadOne(archetype: CrisisArchetype): Promise<void> {
  const blob = new Blob([CRISIS_BADGE_SVG[archetype]], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  await new Promise<void>((resolve, reject) => {
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); cachedImages.set(archetype, img); resolve(); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(); };
    img.src = url;
  });
}

/** Rasterise every archetype's badge once, up front (never per frame). One failure does not block the rest. */
export async function preloadCrisisBadgeMarkers(): Promise<void> {
  await Promise.allSettled((Object.keys(CRISIS_BADGE_SVG) as CrisisArchetype[]).map(preloadOne));
}

/** The cached badge, or null while loading / for an archetype this build has no badge for. */
export function getCrisisBadgeMarkerImage(archetype: string): HTMLImageElement | null {
  return cachedImages.get(archetype as CrisisArchetype) ?? null;
}
