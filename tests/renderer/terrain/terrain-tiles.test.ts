import { describe, it, expect } from 'vitest';
import { TERRAIN_TILES } from '@/renderer/terrain/terrain-tiles';
import type { TerrainType } from '@/core/types';

const ALL_TERRAIN_TYPES: TerrainType[] = [
  'grassland', 'plains', 'desert', 'tundra', 'snow',
  'forest', 'hills', 'mountain', 'ocean', 'coast',
  'jungle', 'swamp', 'volcanic',
];

describe('TERRAIN_TILES coverage', () => {
  it('has exactly 4 non-empty string variants for every TerrainType', () => {
    for (const terrain of ALL_TERRAIN_TYPES) {
      const variants = TERRAIN_TILES[terrain];
      expect(variants, `missing entry for terrain: ${terrain}`).toBeDefined();
      expect(variants.length, `${terrain} must have exactly 4 variants`).toBe(4);
      for (let i = 0; i < 4; i++) {
        expect(typeof variants[i], `${terrain} variant ${i} must be a string`).toBe('string');
        expect(variants[i].length, `${terrain} variant ${i} must be non-empty`).toBeGreaterThan(0);
      }
    }
  });
});
