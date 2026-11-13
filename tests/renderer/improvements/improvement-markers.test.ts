import { describe, it, expect, vi } from 'vitest';
import type { CrisisArchetype } from '@/core/types';
import { CRISIS_BADGE_SVG, getCrisisBadgeMarkerImage } from '@/renderer/improvements/crisis-badge-markers';
import {
  RELIGION_BADGE_OWN_SVG,
  RELIGION_BADGE_FOREIGN_SVG,
} from '@/renderer/improvements/religion-badge-marker';


// Verify each marker module exports the required preload + getImage functions.
// Actual preloading requires browser Image API (not available in node/vitest).

const markerPaths = [
  '@/renderer/improvements/farm-marker',
  '@/renderer/improvements/mine-marker',
  '@/renderer/improvements/lumber-camp-marker',
  '@/renderer/improvements/watermill-marker',
  '@/renderer/improvements/plantation-marker',
  '@/renderer/improvements/pasture-marker',
  '@/renderer/improvements/camp-marker',
  '@/renderer/improvements/quarry-marker',
];

describe('improvement marker modules', () => {
  it('each marker module exports a preload function and a getImage function', async () => {
    for (const path of markerPaths) {
      const mod = await import(path);
      const keys = Object.keys(mod);
      const hasPreload = keys.some(k => k.startsWith('preload') && k.endsWith('Marker'));
      const hasGet = keys.some(k => k.startsWith('get') && k.endsWith('MarkerImage'));
      expect(hasPreload, `${path} missing preload*Marker export`).toBe(true);
      expect(hasGet, `${path} missing get*MarkerImage export`).toBe(true);
    }
  });

  it('getImage returns null before preloading (no browser Image API in test env)', async () => {
    // In node/jsdom, preload can't run (no object URLs). getImage should return null.
    for (const path of markerPaths) {
      const mod = await import(path);
      const getKey = Object.keys(mod).find(k => k.startsWith('get') && k.endsWith('MarkerImage'));
      if (getKey) {
        expect(mod[getKey](), `${path}.${getKey}() should be null before preload`).toBeNull();
      }
    }
  });
});


const ARCHETYPES = Object.keys(CRISIS_BADGE_SVG) as CrisisArchetype[];

// Compile-time exhaustiveness: this fails `tsc` (yarn build) if CrisisArchetype gains a member
// that CRISIS_BADGE_SVG does not cover, and vice-versa.
const _exhaustive: Record<CrisisArchetype, true> = {
  famine: true, outbreak: true, catastrophe: true, hunt: true,
};
void _exhaustive;

function silhouette(svg: string): string {
  // shape geometry only — drop colour attributes so we compare outlines, not palette
  return svg.replace(/(fill|stroke)="[^"]*"/g, '').replace(/\s+/g, ' ');
}

describe('crisis badge markers (#618)', () => {
  it('has a badge for every archetype, and every svg is tagged with its own archetype', () => {
    expect(ARCHETYPES.sort()).toEqual(['catastrophe', 'famine', 'hunt', 'outbreak']);
    for (const a of ARCHETYPES) {
      expect(CRISIS_BADGE_SVG[a]).toContain(`data-crisis-badge="${a}"`);
      expect(CRISIS_BADGE_SVG[a]).toContain('viewBox="0 0 48 48"');
    }
  });

  it('silhouettes are pairwise distinct by geometry, not just by colour', () => {
    for (let i = 0; i < ARCHETYPES.length; i++) {
      for (let j = i + 1; j < ARCHETYPES.length; j++) {
        const a = silhouette(CRISIS_BADGE_SVG[ARCHETYPES[i]!]).replace(/data-crisis-badge="[^"]*"/, '');
        const b = silhouette(CRISIS_BADGE_SVG[ARCHETYPES[j]!]).replace(/data-crisis-badge="[^"]*"/, '');
        expect(a, `${ARCHETYPES[i]} vs ${ARCHETYPES[j]}`).not.toBe(b);
      }
    }
  });

  it('uses structurally different primitives per target archetype (cluster / bolt / three claws)', () => {
    expect((CRISIS_BADGE_SVG.outbreak.match(/<circle/g) ?? []).length).toBeGreaterThanOrEqual(4);
    expect(CRISIS_BADGE_SVG.catastrophe).toMatch(/<path d="M[\d.,\sL]+Z"/); // straight-segment polygon = jagged bolt
    expect(CRISIS_BADGE_SVG.catastrophe).not.toContain('<circle cx="24" cy="24" r="6');
    expect((CRISIS_BADGE_SVG.hunt.match(/<path d="M\d+,\d+ Q/g) ?? []).length).toBe(6); // 3 claws x (outline + fill)
  });

  it('is self-contained, text-free and animation-free (reduced-motion / high-contrast safe)', () => {
    for (const a of ARCHETYPES) {
      const svg = CRISIS_BADGE_SVG[a];
      expect(svg).not.toMatch(/<text|<animate|<set |@keyframes|<image|href=/);
      expect(svg).toContain('<circle cx="24" cy="24" r="21"'); // same dark disc as every city badge
    }
  });

  it('returns null for a not-yet-loaded or unknown archetype instead of throwing', () => {
    expect(getCrisisBadgeMarkerImage('famine')).toBeNull(); // nothing preloaded in unit tests
    expect(getCrisisBadgeMarkerImage('not-a-real-archetype')).toBeNull();
  });
});

describe('foreign-faith loyalty-pressure city badge marker (#1620)', () => {
  it('is a self-contained 48x48 badge in the city-badge family', async () => {
    const { LOYALTY_PRESSURE_BADGE_SVG } = await import(
      '@/renderer/improvements/loyalty-pressure-badge-marker'
    );

    expect(LOYALTY_PRESSURE_BADGE_SVG).toContain('viewBox="0 0 48 48"');
    expect(LOYALTY_PRESSURE_BADGE_SVG).toContain('<circle cx="24" cy="24" r="21" fill="rgba(20,24,30,0.86)"');
    expect(LOYALTY_PRESSURE_BADGE_SVG).toContain('data-loyalty-pressure-badge="fractured-crest"');
    expect(LOYALTY_PRESSURE_BADGE_SVG).not.toMatch(/<script|<text|<animate|<set |@keyframes|<image|href=|gradient|filter/i);
    expect(LOYALTY_PRESSURE_BADGE_SVG).not.toMatch(/\p{Extended_Pictographic}/u);
  });

  it('communicates pressure with a fractured crest and two inward arrows', async () => {
    const { LOYALTY_PRESSURE_BADGE_SVG } = await import(
      '@/renderer/improvements/loyalty-pressure-badge-marker'
    );

    expect(LOYALTY_PRESSURE_BADGE_SVG).toContain('cq-loyalty-crest');
    expect(LOYALTY_PRESSURE_BADGE_SVG).toContain('cq-loyalty-fissure');
    expect((LOYALTY_PRESSURE_BADGE_SVG.match(/cq-loyalty-arrow/g) ?? []).length).toBe(2);
  });

  it('is visually distinct from both religion variants and every crisis badge', async () => {
    const { LOYALTY_PRESSURE_BADGE_SVG } = await import(
      '@/renderer/improvements/loyalty-pressure-badge-marker'
    );
    const loyalty = silhouette(LOYALTY_PRESSURE_BADGE_SVG)
      .replace(/data-loyalty-pressure-badge="[^"]*"/, '');

    for (const [label, svg] of [
      ['religion-own', RELIGION_BADGE_OWN_SVG],
      ['religion-foreign', RELIGION_BADGE_FOREIGN_SVG],
      ...Object.entries(CRISIS_BADGE_SVG),
    ] as const) {
      const other = silhouette(svg).replace(/data-crisis-badge="[^"]*"/, '');
      expect(loyalty, `loyalty badge vs ${label}`).not.toBe(other);
    }
  });

  it('returns null before preload instead of throwing', async () => {
    const { getLoyaltyPressureBadgeMarkerImage } = await import(
      '@/renderer/improvements/loyalty-pressure-badge-marker'
    );
    expect(getLoyaltyPressureBadgeMarkerImage()).toBeNull();
  });

  it('rasterises once through the static loader and reuses the cached image', async () => {
    vi.resetModules();
    const images: ControlledImage[] = [];
    class ControlledImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      constructor() { images.push(this); }
      set src(_value: string) { /* load completed by the test */ }
    }
    vi.stubGlobal('Image', ControlledImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:loyalty-pressure');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const mod = await import('@/renderer/improvements/loyalty-pressure-badge-marker');
    expect(mod.getLoyaltyPressureBadgeMarkerImage()).toBeNull();

    const first = mod.preloadLoyaltyPressureBadgeMarker();
    const second = mod.preloadLoyaltyPressureBadgeMarker();
    expect(images).toHaveLength(1);

    images[0]!.onload?.();
    await Promise.all([first, second]);
    expect(mod.getLoyaltyPressureBadgeMarkerImage()).toBe(images[0]);

    await mod.preloadLoyaltyPressureBadgeMarker();
    expect(images).toHaveLength(1);
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('leaves the fallback in place when the SVG fails to load', async () => {
    vi.resetModules();
    class FailingImage {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      set src(_value: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', FailingImage);
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:loyalty-pressure');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});

    const mod = await import('@/renderer/improvements/loyalty-pressure-badge-marker');
    await expect(mod.preloadLoyaltyPressureBadgeMarker()).rejects.toThrow('Static SVG image load failed');
    expect(mod.getLoyaltyPressureBadgeMarkerImage()).toBeNull();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });
});
