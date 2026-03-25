import { describe, it, expect } from 'vitest';
import { placeWonders } from '@/systems/wonder-system';
import { generateMap, findStartPositions } from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';

function makeMap(size: 'small' | 'medium' | 'large') {
  const dims = { small: { w: 30, h: 30 }, medium: { w: 50, h: 50 }, large: { w: 80, h: 80 } };
  const d = dims[size];
  return generateMap(d.w, d.h, `wonder-test-${size}`);
}

describe('placeWonders', () => {
  it('places up to 5 wonders on a small map', () => {
    const map = makeMap('small');
    const starts = findStartPositions(map, 2);
    const placed = placeWonders(map, starts, 'small', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(5);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('places up to 8 wonders on a medium map', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    const placed = placeWonders(map, starts, 'medium', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(8);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('places up to 15 wonders on a large map', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 4);
    const placed = placeWonders(map, starts, 'large', 'wonder-seed');
    expect(placed.length).toBeLessThanOrEqual(15);
    expect(placed.length).toBeGreaterThan(0);
  });

  it('enforces minimum 8-hex distance between wonders', () => {
    const map = makeMap('large');
    const starts = findStartPositions(map, 2);
    placeWonders(map, starts, 'large', 'wonder-dist-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (let i = 0; i < wonderTiles.length; i++) {
      for (let j = i + 1; j < wonderTiles.length; j++) {
        expect(hexDistance(wonderTiles[i].coord, wonderTiles[j].coord)).toBeGreaterThanOrEqual(8);
      }
    }
  });

  it('enforces minimum 6-hex distance from start positions', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 3);
    placeWonders(map, starts, 'medium', 'wonder-start-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (const wt of wonderTiles) {
      for (const sp of starts) {
        expect(hexDistance(wt.coord, sp)).toBeGreaterThanOrEqual(6);
      }
    }
  });

  it('replaces tile resource when placing a wonder', () => {
    const map = makeMap('medium');
    const starts = findStartPositions(map, 2);
    placeWonders(map, starts, 'medium', 'wonder-resource-test');
    const wonderTiles = Object.values(map.tiles).filter(t => t.wonder !== null);
    for (const wt of wonderTiles) {
      expect(wt.resource).toBeNull();
    }
  });
});
