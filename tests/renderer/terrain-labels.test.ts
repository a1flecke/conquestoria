// tests/renderer/terrain-labels.test.ts
import { describe, it, expect } from 'vitest';
import { getTerrainLabel, shouldShowTerrainLabel } from '@/renderer/hex-renderer';

describe('terrain labels', () => {
  describe('getTerrainLabel', () => {
    it('returns abbreviated label for each terrain type', () => {
      expect(getTerrainLabel('grassland')).toBe('Grass');
      expect(getTerrainLabel('plains')).toBe('Plains');
      expect(getTerrainLabel('desert')).toBe('Desert');
      expect(getTerrainLabel('tundra')).toBe('Tundra');
      expect(getTerrainLabel('snow')).toBe('Snow');
      expect(getTerrainLabel('forest')).toBe('Forest');
      expect(getTerrainLabel('hills')).toBe('Hills');
      expect(getTerrainLabel('mountain')).toBe('Mtn');
      expect(getTerrainLabel('ocean')).toBe('Ocean');
      expect(getTerrainLabel('coast')).toBe('Coast');
      expect(getTerrainLabel('jungle')).toBe('Jungle');
      expect(getTerrainLabel('swamp')).toBe('Swamp');
      expect(getTerrainLabel('volcanic')).toBe('Volc');
    });
  });

  describe('shouldShowTerrainLabel', () => {
    it('shows at default zoom (1.0)', () => {
      expect(shouldShowTerrainLabel(1.0)).toBe(true);
    });

    it('shows at slightly zoomed in (1.5)', () => {
      expect(shouldShowTerrainLabel(1.5)).toBe(true);
    });

    it('hides when zoomed out below threshold (0.4)', () => {
      expect(shouldShowTerrainLabel(0.4)).toBe(false);
    });

    it('shows when zoomed out just above threshold (0.6)', () => {
      expect(shouldShowTerrainLabel(0.6)).toBe(true);
    });
  });
});
