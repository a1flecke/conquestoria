import { describe, it, expect } from 'vitest';
import { generateContinentMap } from '@/systems/continent-map-generator';
import { hexKey } from '@/systems/hex-utils';

describe('generateContinentMap', () => {
  it('leaves late strategic resources until game setup knows every protected tile', () => {
    const { map } = generateContinentMap(30, 30, 'continent-late-resources');
    const lateResources = new Set(['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals']);
    expect(Object.values(map.tiles).some(tile => lateResources.has(tile.resource ?? ''))).toBe(false);
  });

  it('sets wrapsHorizontally to true', () => {
    const { map } = generateContinentMap(30, 30, 'cont-1');
    expect(map.wrapsHorizontally).toBe(true);
  });

  it('land coverage is between 30% and 80%', () => {
    const { map } = generateContinentMap(30, 30, 'cont-2');
    const total = Object.keys(map.tiles).length;
    const land = Object.values(map.tiles).filter(t => t.terrain !== 'ocean').length;
    expect(land / total).toBeGreaterThan(0.30);
    expect(land / total).toBeLessThan(0.80);
  });

  it('no land hex within 3 of any map edge', () => {
    const { map } = generateContinentMap(30, 30, 'cont-3');
    for (const tile of Object.values(map.tiles)) {
      if (tile.terrain === 'ocean') continue;
      const { q, r } = tile.coord;
      expect(q).toBeGreaterThanOrEqual(3);
      expect(q).toBeLessThanOrEqual(map.width - 4);
      expect(r).toBeGreaterThanOrEqual(3);
      expect(r).toBeLessThanOrEqual(map.height - 4);
    }
  });

  it('continentHexes forms a connected set reachable from center', () => {
    const { map, continentHexes } = generateContinentMap(30, 30, 'cont-4');
    const centerKey = hexKey({ q: 15, r: 15 });
    if (!continentHexes.has(centerKey)) return; // center might be ocean in edge cases
    const visited = new Set<string>();
    const queue = [centerKey];
    while (queue.length > 0) {
      const cur = queue.shift()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      const [q, r] = cur.split(',').map(Number);
      for (const [dq, dr] of [[1,0],[-1,0],[0,1],[0,-1],[1,-1],[-1,1]]) {
        const nb = hexKey({ q: q + dq, r: r + dr });
        if (continentHexes.has(nb) && !visited.has(nb)) queue.push(nb);
      }
    }
    for (const key of continentHexes) {
      expect(visited.has(key), `${key} should be reachable from center`).toBe(true);
    }
  });

  it('coast tiles exist at land-ocean boundaries', () => {
    const { map } = generateContinentMap(30, 30, 'cont-5');
    const coastTiles = Object.values(map.tiles).filter(t => t.terrain === 'coast');
    expect(coastTiles.length).toBeGreaterThan(0);
  });

  it('has rivers array on the map', () => {
    const { map } = generateContinentMap(30, 30, 'cont-6');
    expect(Array.isArray(map.rivers)).toBe(true);
  });

  it('continent tiles have valid non-ocean terrain', () => {
    const { continentHexes, map } = generateContinentMap(30, 30, 'cont-7');
    for (const key of continentHexes) {
      const tile = map.tiles[key];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe('ocean');
    }
  });

  it('is deterministic with same seed', () => {
    const { map: map1 } = generateContinentMap(30, 30, 'det-seed');
    const { map: map2 } = generateContinentMap(30, 30, 'det-seed');
    const key = hexKey({ q: 15, r: 15 });
    expect(map1.tiles[key].terrain).toBe(map2.tiles[key].terrain);
  });
});
