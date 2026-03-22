import { generateRivers, getRiverYieldBonus, getRiverDefensePenalty } from '@/systems/river-system';
import { generateMap } from '@/systems/map-generator';

describe('river system', () => {
  describe('generateRivers', () => {
    it('creates rivers on a map', () => {
      const map = generateMap(30, 30, 'river-gen-test');
      const rivers = generateRivers(map, 'river-gen-test');
      expect(rivers.length).toBeGreaterThan(0);
    });

    it('rivers connect adjacent hexes', () => {
      const map = generateMap(30, 30, 'river-adj-test');
      const rivers = generateRivers(map, 'river-adj-test');
      for (const river of rivers) {
        const dq = Math.abs(river.from.q - river.to.q);
        const dr = Math.abs(river.from.r - river.to.r);
        expect(dq).toBeLessThanOrEqual(1);
        expect(dr).toBeLessThanOrEqual(1);
      }
    });

    it('rivers start at high elevation and flow toward water', () => {
      const map = generateMap(30, 30, 'river-flow-test');
      const rivers = generateRivers(map, 'river-flow-test');
      if (rivers.length > 0) {
        const startTile = map.tiles[`${rivers[0].from.q},${rivers[0].from.r}`];
        expect(['highland', 'mountain']).toContain(startTile?.elevation);
      }
    });
  });

  describe('getRiverYieldBonus', () => {
    it('returns +1 gold for river tiles', () => {
      const bonus = getRiverYieldBonus(true);
      expect(bonus.gold).toBe(1);
    });

    it('returns no bonus for non-river tiles', () => {
      const bonus = getRiverYieldBonus(false);
      expect(bonus.gold).toBe(0);
    });
  });

  describe('getRiverDefensePenalty', () => {
    it('returns penalty when attacking across a river', () => {
      const penalty = getRiverDefensePenalty(true);
      expect(penalty).toBeLessThan(0);
    });

    it('returns no penalty without river', () => {
      const penalty = getRiverDefensePenalty(false);
      expect(penalty).toBe(0);
    });
  });
});
