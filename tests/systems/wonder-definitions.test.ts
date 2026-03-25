import { describe, it, expect } from 'vitest';
import { WONDER_DEFINITIONS, getWonderDefinition } from '@/systems/wonder-definitions';

describe('Wonder Definitions', () => {
  it('has exactly 15 wonders', () => {
    expect(WONDER_DEFINITIONS).toHaveLength(15);
  });

  it('all wonders have unique IDs', () => {
    const ids = WONDER_DEFINITIONS.map(w => w.id);
    expect(new Set(ids).size).toBe(15);
  });

  it('all wonders have valid terrain types', () => {
    const validTerrains = ['grassland', 'plains', 'desert', 'tundra', 'snow', 'forest', 'hills', 'mountain', 'ocean', 'coast', 'jungle', 'swamp', 'volcanic'];
    for (const w of WONDER_DEFINITIONS) {
      expect(w.validTerrain.length).toBeGreaterThan(0);
      for (const t of w.validTerrain) {
        expect(validTerrains).toContain(t);
      }
    }
  });

  it('all wonders have non-zero yields or discovery bonus', () => {
    for (const w of WONDER_DEFINITIONS) {
      const totalYields = w.yields.food + w.yields.production + w.yields.gold + w.yields.science;
      const hasBonus = w.discoveryBonus.amount > 0;
      expect(totalYields > 0 || hasBonus).toBe(true);
    }
  });

  it('getWonderDefinition returns correct wonder by ID', () => {
    const wonder = getWonderDefinition('great_volcano');
    expect(wonder).toBeDefined();
    expect(wonder!.name).toBe('Great Volcano');
  });

  it('getWonderDefinition returns undefined for unknown ID', () => {
    expect(getWonderDefinition('nonexistent')).toBeUndefined();
  });
});
