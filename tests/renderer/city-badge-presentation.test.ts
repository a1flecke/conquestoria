import { describe, expect, it } from 'vitest';
import { Camera } from '@/renderer/camera';
import {
  CITY_BADGE_GLYPHS,
  CITY_BADGE_GLYPH_COEXISTENCE,
  CITY_BADGE_SLOT_COEXISTENCE,
  getCityBadgeLayout,
  type BadgeBounds,
} from '@/renderer/city-badge-presentation';

function intersects(left: BadgeBounds, right: BadgeBounds): boolean {
  return left.left < right.right
    && left.right > right.left
    && left.top < right.bottom
    && left.bottom > right.top;
}

describe('city badge presentation', () => {
  it('uses a construction fallback distinct from every coexistent text badge', () => {
    expect(CITY_BADGE_GLYPHS.production).toBe('🏗️');
    for (const [left, right] of CITY_BADGE_GLYPH_COEXISTENCE) {
      expect(CITY_BADGE_GLYPHS[left], `${left}/${right}`)
        .not.toBe(CITY_BADGE_GLYPHS[right]);
    }
  });

  it('keeps every coexistent city badge bound disjoint at supported zoom sizes', () => {
    const camera = new Camera();
    for (const size of [1, camera.hexSize * camera.minZoom, camera.hexSize * camera.maxZoom]) {
      const layout = getCityBadgeLayout({ x: 0, y: 0 }, size);
      for (const [left, right] of CITY_BADGE_SLOT_COEXISTENCE) {
        expect(intersects(layout[left].bounds, layout[right].bounds), `${left}/${right} @ ${size}`)
          .toBe(false);
      }
    }
  });

  it('does not treat intentionally exclusive badges as a collision pair', () => {
    expect(CITY_BADGE_SLOT_COEXISTENCE).not.toContainEqual(['production', 'idle']);
    expect(CITY_BADGE_GLYPH_COEXISTENCE).not.toContainEqual(['underSiege', 'unrest']);
  });
});
