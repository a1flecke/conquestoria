import { describe, it, expect } from 'vitest';
import { placeBeastLairs, BEAST_OWNER, LAIR_COUNTS } from '@/systems/beast-system';
import { BEAST_DEFINITIONS } from '@/systems/beast-definitions';
import { generateMap } from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';

describe('placeBeastLairs', () => {
  const map = generateMap(40, 30, 'beast-test-seed');
  const starts = [{ q: 5, r: 5 }, { q: 30, r: 20 }];

  it('places lairs only on matching habitat terrain, away from starts', () => {
    const lairs = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    for (const lair of Object.values(lairs)) {
      const def = BEAST_DEFINITIONS[lair.beastId];
      const tile = map.tiles[hexKey(lair.position)];
      expect(def.habitatTerrains).toContain(tile.terrain);
      expect(tile.wonder).toBeNull();
      for (const start of starts) {
        expect(hexDistance(lair.position, start)).toBeGreaterThanOrEqual(6);
      }
      expect(lair.status).toBe('dormant');
      expect(lair.unitIds).toEqual([]);
      expect(lair.strength).toBe(0);
    }
  });

  it('is deterministic for the same seed', () => {
    const a = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    const b = placeBeastLairs(map, starts, 'medium', 'beast-test-seed');
    expect(a).toEqual(b);
  });

  it('never places more lairs than the map-size budget', () => {
    const lairs = placeBeastLairs(map, starts, 'small', 'beast-test-seed');
    expect(Object.keys(lairs).length).toBeLessThanOrEqual(LAIR_COUNTS.small);
  });

  it('exports the beasts owner constant', () => {
    expect(BEAST_OWNER).toBe('beasts');
  });
});
