import {
  generateMap,
  findStartPositions,
  generateBaseTerrain,
  getLandTerrain,
  placeResources,
  createNoise,
  createRng,
  getMinimumStartDistance,
  getStartPositionDistance,
} from '@/systems/map-generator';
import type { GameMap } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

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

describe('generateBaseTerrain', () => {
  it('returns a full grid of tiles', () => {
    const tiles = generateBaseTerrain(20, 20, 'base-terrain-test');
    expect(Object.keys(tiles).length).toBe(400);
  });

  it('all tiles have required fields', () => {
    const tiles = generateBaseTerrain(10, 10, 'base-terrain-fields');
    for (const tile of Object.values(tiles)) {
      expect(tile.terrain).toBeDefined();
      expect(tile.coord).toBeDefined();
      expect(tile.hasRiver).toBe(false);
      expect(tile.resource).toBeNull();
    }
  });

  it('is deterministic with same seed', () => {
    const a = generateBaseTerrain(10, 10, 'same-seed');
    const b = generateBaseTerrain(10, 10, 'same-seed');
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('getLandTerrain', () => {
  it('never returns ocean or coast', () => {
    const terrains = new Set<string>();
    for (let i = 0; i < 20; i++) {
      const t = getLandTerrain(i / 20, i / 20, i / 20, 5, 20);
      terrains.add(t);
    }
    expect(terrains).not.toContain('ocean');
    expect(terrains).not.toContain('coast');
  });

  it('returns snow or tundra at polar rows', () => {
    const t = getLandTerrain(0.4, 0.2, 0.4, 0, 30);
    expect(['snow', 'tundra']).toContain(t);
  });

  it('returns mountain for high elevation', () => {
    const t = getLandTerrain(0.4, 0.7, 0.4, 15, 30);
    expect(t).toBe('mountain');
  });
});

describe('placeResources', () => {
  it('does not overwrite pre-existing resources', () => {
    const tiles = generateBaseTerrain(10, 10, 'resource-overwrite-test');
    const grassTile = Object.values(tiles).find(t => t.terrain === 'grassland');
    if (!grassTile) return;
    grassTile.resource = 'horses';
    placeResources(tiles, createRng('resource-rng'));
    expect(grassTile.resource).toBe('horses');
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
      const size = setup.width === 30 ? 'small' : setup.width === 50 ? 'medium' : 'large';
      const positions = findStartPositions(
        map,
        Array.from({ length: setup.count }, (_, i) => `civ-${i}`),
        'procedural',
        size,
      );
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
    const positions = findStartPositions(map, ['civ-0', 'civ-1'], 'procedural', 'small');
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
    const positions = findStartPositions(map, ['civ-0', 'civ-1'], 'procedural', 'small');
    const dist = getStartPositionDistance(map, positions[0], positions[1]);
    expect(dist).toBeGreaterThan(8);
  });

  it('keeps supported player counts safely spaced across representative seeds', () => {
    const seeds = Array.from({ length: 20 }, (_, index) => `issue-172-seed-sweep-${index}`);

    for (const setup of SUPPORTED_START_CASES) {
      for (const seed of seeds) {
        const map = generateMap(setup.width, setup.height, `${setup.seed}-${seed}`);
        const size = setup.width === 30 ? 'small' : setup.width === 50 ? 'medium' : 'large';
        const positions = findStartPositions(
          map,
          Array.from({ length: setup.count }, (_, i) => `civ-${i}`),
          'procedural',
          size,
        );
        const minimumDistance = getMinimumStartDistance(map);

        expect(positions, `${setup.width}x${setup.height} ${seed}`).toHaveLength(setup.count);
        for (let i = 0; i < positions.length; i++) {
          for (let j = i + 1; j < positions.length; j++) {
            expect(
              getStartPositionDistance(map, positions[i], positions[j]),
              `${setup.width}x${setup.height} ${seed} ${hexKey(positions[i])} -> ${hexKey(positions[j])}`,
            ).toBeGreaterThanOrEqual(minimumDistance);
          }
        }
      }
    }
  });
});
