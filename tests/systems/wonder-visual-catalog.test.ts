import { describe, expect, it } from 'vitest';
import { WONDER_DEFINITIONS } from '@/systems/wonder-definitions';
import { getLegendaryWonderDefinitions } from '@/systems/legendary-wonder-definitions';
import { getWonderVisualDefinition } from '@/systems/wonder-visual-catalog';

describe('wonder visual catalog', () => {
  it('covers every natural wonder with map and vignette identity', () => {
    for (const wonder of WONDER_DEFINITIONS) {
      const visual = getWonderVisualDefinition(wonder.id);

      expect(visual.id).toBe(wonder.id);
      expect(visual.kind).toBe('natural');
      expect(visual.medallionGlyph.length).toBeGreaterThan(0);
      expect(visual.mapLandmark).not.toBe('masked');
      expect(visual.vignette).not.toBe('masked');
      expect(visual.palette.base).toMatch(/^#/);
      expect(visual.palette.accent).toMatch(/^#/);
      expect(visual.palette.glow).toMatch(/^#/);
      expect(visual.reducedMotionFallback).toBe('static-landmark');
    }
  });

  it('covers every legendary wonder with masked medallion metadata', () => {
    for (const wonder of getLegendaryWonderDefinitions()) {
      const visual = getWonderVisualDefinition(wonder.id);

      expect(visual.id).toBe(wonder.id);
      expect(visual.kind).toBe('legendary');
      expect(visual.medallionGlyph.length).toBeGreaterThan(0);
      expect(visual.mapLandmark).toBe('masked');
      expect(visual.vignette).toBe('masked');
      expect(visual.maskedLabel).toBeTruthy();
      expect(visual.reducedMotionFallback).toBe('static-medallion');
    }
  });

  it('returns a safe static fallback for unknown wonder ids', () => {
    const visual = getWonderVisualDefinition('missing-wonder');

    expect(visual.id).toBe('missing-wonder');
    expect(visual.kind).toBe('natural');
    expect(visual.mapLandmark).toBe('masked');
    expect(visual.vignette).toBe('masked');
    expect(visual.supportsAmbientAnimation).toBe(false);
  });
});
