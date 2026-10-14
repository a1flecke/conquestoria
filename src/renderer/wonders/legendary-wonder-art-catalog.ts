// Production art for the Era 5-9 legendary wonders (#613, #619): one 128x128 transparent isometric PNG per wonder under
// public/images/wonders/art/, each with a provenance record in design/wonder-art/. The canvas drawings in
// legendary-wonder-bespoke-assets.ts stay as the offline / load-failure fallback.
export const LEGENDARY_WONDER_ART_IDS = [
  'palace-of-the-sun',
  'iron-arsenal',
  'merchant-admiralty',
  'crystal-palace',
  'suez-canal',
  'continental-congress',
  'eiffel-tower',
  'brooklyn-bridge',
  'trans-siberian-railway',
  'panama-canal',
  'empire-state-building',
  'hoover-dam',
  'wright-flyer',
] as const;

export type LegendaryWonderArtId = typeof LEGENDARY_WONDER_ART_IDS[number];

const ART_IDS: ReadonlySet<string> = new Set(LEGENDARY_WONDER_ART_IDS);

/** App-relative path (no leading slash; resolve it with `resolveAppAssetUrl`), or null for a wonder without art. */
export function getLegendaryWonderArtPath(wonderId: string): string | null {
  return ART_IDS.has(wonderId) ? `images/wonders/art/${wonderId}.png` : null;
}
