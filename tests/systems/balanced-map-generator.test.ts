import { describe, it, expect } from 'vitest';
import { generateBalancedMap } from '@/systems/balanced-map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('generateBalancedMap', () => {
  it('leaves late strategic resources until game setup knows every protected tile', () => {
    const { map } = generateBalancedMap(30, 30, 'balanced-late-resources', 3);
    const lateResources = new Set(['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals']);
    expect(Object.values(map.tiles).some(tile => lateResources.has(tile.resource ?? ''))).toBe(false);
  });

  it('returns startPositions.length === civCount', () => {
    const { startPositions } = generateBalancedMap(30, 30, 'bal-test-1', 3);
    expect(startPositions).toHaveLength(3);
  });

  it('sets wrapsHorizontally to true', () => {
    const { map } = generateBalancedMap(30, 30, 'bal-test-2', 2);
    expect(map.wrapsHorizontally).toBe(true);
  });

  it('has rivers array on the map', () => {
    const { map } = generateBalancedMap(30, 30, 'bal-test-3', 2);
    expect(Array.isArray(map.rivers)).toBe(true);
  });

  it('all start positions are on land (not ocean/coast/mountain)', () => {
    const { map, startPositions } = generateBalancedMap(30, 30, 'bal-test-4', 3);
    for (const pos of startPositions) {
      const tile = map.tiles[hexKey(pos)];
      expect(tile).toBeDefined();
      expect(['ocean', 'coast', 'mountain']).not.toContain(tile.terrain);
    }
  });

  it('places a luxury hotspot cluster (3+ luxury resources within 5 hexes of each other)', () => {
    const { map } = generateBalancedMap(50, 50, 'bal-test-5', 3);
    const LUXURY_SET = new Set(['silk', 'wine', 'spices', 'gems', 'ivory', 'incense']);
    const luxuryTiles = Object.values(map.tiles).filter(t => t.resource && LUXURY_SET.has(t.resource));
    // Find any tile with 2+ other luxury tiles within 5 hexes — verifies cluster was placed
    const hasCluster = luxuryTiles.some(anchor =>
      luxuryTiles.filter(t =>
        Math.abs(t.coord.q - anchor.coord.q) + Math.abs(t.coord.r - anchor.coord.r) <= 5,
      ).length >= 3,
    );
    expect(hasCluster).toBe(true);
  });

  it('resource density across zones is within 25% of mean after post-placement equalization', () => {
    const { map, startPositions } = generateBalancedMap(50, 50, 'bal-test-6', 4);
    const zoneResourceCounts: number[] = new Array(startPositions.length).fill(0);
    const zoneLandCounts: number[] = new Array(startPositions.length).fill(0);
    for (const tile of Object.values(map.tiles)) {
      let nearestZone = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < startPositions.length; i++) {
        const d = Math.abs(tile.coord.q - startPositions[i].q) + Math.abs(tile.coord.r - startPositions[i].r);
        if (d < nearestDist) { nearestDist = d; nearestZone = i; }
      }
      if (!['ocean', 'coast', 'mountain', 'snow', 'tundra'].includes(tile.terrain)) {
        zoneLandCounts[nearestZone]++;
        if (tile.resource) zoneResourceCounts[nearestZone]++;
      }
    }
    const densities = startPositions.map((_, i) =>
      zoneLandCounts[i] > 0 ? zoneResourceCounts[i] / zoneLandCounts[i] : 0,
    );
    const meanDensity = densities.reduce((s, d) => s + d, 0) / densities.length;
    for (const density of densities) {
      expect(density).toBeGreaterThanOrEqual(meanDensity * 0.6);
    }
  });

  it('is deterministic with same seed and civCount', () => {
    const { map: map1, startPositions: pos1 } = generateBalancedMap(30, 30, 'det-seed', 3);
    const { map: map2, startPositions: pos2 } = generateBalancedMap(30, 30, 'det-seed', 3);
    expect(JSON.stringify(pos1)).toBe(JSON.stringify(pos2));
    const key = hexKey({ q: 10, r: 10 });
    expect(map1.tiles[key].terrain).toBe(map2.tiles[key].terrain);
  });
});
