import {
  generateMap,
  findStartPositions,
  getMinimumStartDistance,
  getStartPositionDistance,
} from '@/systems/map-generator';
import type { GameMap } from '@/core/types';
import { hexKey, hexDistance } from '@/systems/hex-utils';

const SUPPORTED_START_CASES = [
  { width: 30, height: 30, count: 3, seed: 'issue-172-small-wrap' },
  { width: 50, height: 50, count: 5, seed: 'issue-172-medium-wrap' },
  { width: 80, height: 80, count: 8, seed: 'issue-172-large-wrap' },
] as const;

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

describe('new terrain types', () => {
  it('generates jungle tiles', () => {
    const map = generateMap(30, 30, 'jungle-test');
    const jungleTiles = Object.values(map.tiles).filter(t => t.terrain === 'jungle');
    expect(jungleTiles.length).toBeGreaterThan(0);
  });

  it('generates swamp tiles', () => {
    const map = generateMap(30, 30, 'swamp-test');
    const swampTiles = Object.values(map.tiles).filter(t => t.terrain === 'swamp');
    expect(swampTiles.length).toBeGreaterThan(0);
  });

  it('generates volcanic tiles', () => {
    let found = false;
    for (const seed of ['vol-1', 'vol-2', 'vol-3', 'vol-4', 'vol-5']) {
      const map = generateMap(30, 30, seed);
      if (Object.values(map.tiles).some(t => t.terrain === 'volcanic')) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it('all tiles have hasRiver field', () => {
    const map = generateMap(30, 30, 'river-field-test');
    for (const tile of Object.values(map.tiles)) {
      expect(tile.hasRiver).toBeDefined();
    }
  });

  it('map has rivers array', () => {
    const map = generateMap(30, 30, 'rivers-test');
    expect(Array.isArray(map.rivers)).toBe(true);
  });
});

describe('findStartPositions', () => {
  it('treats horizontally wrapped edge starts as adjacent for spacing checks', () => {
    const map = generateMap(30, 30, 'issue-172-distance-helper');

    expect(getStartPositionDistance(map, { q: 0, r: 12 }, { q: 29, r: 12 })).toBe(1);
    expect(getStartPositionDistance(map, { q: 1, r: 12 }, { q: 28, r: 12 })).toBe(3);
  });

  it('keeps generated start positions outside the wrapped minimum distance for supported map sizes', () => {
    for (const setup of SUPPORTED_START_CASES) {
      const map = generateMap(setup.width, setup.height, setup.seed);
      const positions = findStartPositions(map, setup.count);
      const minimumDistance = getMinimumStartDistance(map);

      expect(positions).toHaveLength(setup.count);
      for (let i = 0; i < positions.length; i++) {
        for (let j = i + 1; j < positions.length; j++) {
          expect(getStartPositionDistance(map, positions[i], positions[j])).toBeGreaterThanOrEqual(minimumDistance);
        }
      }
    }
  });

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
