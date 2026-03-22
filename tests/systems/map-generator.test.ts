import { generateMap, findStartPositions } from '@/systems/map-generator';
import type { GameMap } from '@/core/types';
import { hexKey, hexDistance } from '@/systems/hex-utils';

describe('generateMap', () => {
  let map: GameMap;

  beforeAll(() => {
    map = generateMap(30, 30, 'test-seed-123');
  });

  it('creates a map with correct dimensions', () => {
    expect(map.width).toBe(30);
    expect(map.height).toBe(30);
  });

  it('populates all tiles', () => {
    const tileCount = Object.keys(map.tiles).length;
    expect(tileCount).toBe(30 * 30);
  });

  it('has wrapsHorizontally set to true', () => {
    expect(map.wrapsHorizontally).toBe(true);
  });

  it('generates polar ice at top and bottom rows', () => {
    const topTile = map.tiles[hexKey({ q: 15, r: 0 })];
    const bottomTile = map.tiles[hexKey({ q: 15, r: 29 })];
    expect(['snow', 'tundra']).toContain(topTile.terrain);
    expect(['snow', 'tundra']).toContain(bottomTile.terrain);
  });

  it('places ocean tiles', () => {
    const terrains = Object.values(map.tiles).map(t => t.terrain);
    expect(terrains).toContain('ocean');
  });

  it('places land tiles', () => {
    const terrains = Object.values(map.tiles).map(t => t.terrain);
    expect(terrains).toContain('grassland');
  });

  it('is deterministic with same seed', () => {
    const map2 = generateMap(30, 30, 'test-seed-123');
    expect(Object.keys(map.tiles).length).toBe(Object.keys(map2.tiles).length);
    const sampleKey = hexKey({ q: 10, r: 10 });
    expect(map.tiles[sampleKey].terrain).toBe(map2.tiles[sampleKey].terrain);
  });

  it('produces different maps with different seeds', () => {
    const map2 = generateMap(30, 30, 'different-seed');
    let differences = 0;
    for (const key of Object.keys(map.tiles)) {
      if (map.tiles[key].terrain !== map2.tiles[key]?.terrain) differences++;
    }
    expect(differences).toBeGreaterThan(0);
  });
});

describe('findStartPositions', () => {
  it('finds requested number of start positions on land', () => {
    const map = generateMap(30, 30, 'start-pos-seed');
    const positions = findStartPositions(map, 2);
    expect(positions).toHaveLength(2);

    for (const pos of positions) {
      const tile = map.tiles[hexKey(pos)];
      expect(tile).toBeDefined();
      expect(tile.terrain).not.toBe('ocean');
      expect(tile.terrain).not.toBe('coast');
      expect(tile.terrain).not.toBe('mountain');
    }
  });

  it('places start positions far apart', () => {
    const map = generateMap(30, 30, 'start-pos-seed');
    const positions = findStartPositions(map, 2);
    const dist = hexDistance(positions[0], positions[1]);
    expect(dist).toBeGreaterThan(8);
  });
});
