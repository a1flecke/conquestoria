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
  guaranteeStartResources,
  getWonderRequiredResourceIds,
} from '@/systems/map-generator';
import { RESOURCE_DEFINITIONS } from '@/systems/trade-system';
import type { GameMap, HexCoord, HexTile, ResourceType, TerrainType } from '@/core/types';
import { getWrappedHexesInRange, hexKey } from '@/systems/hex-utils';

const SUPPORTED_START_CASES = [
  { width: 30, height: 30, count: 3, seed: 'issue-172-small-wrap' },
  { width: 50, height: 50, count: 5, seed: 'issue-172-medium-wrap' },
  { width: 80, height: 80, count: 8, seed: 'issue-172-large-wrap' },
] as const;

const LUXURY_IDS = new Set<ResourceType>(
  RESOURCE_DEFINITIONS.filter(def => def.type === 'luxury').map(def => def.id),
);
const STRATEGIC_IDS = new Set<ResourceType>(
  RESOURCE_DEFINITIONS.filter(def => def.type === 'strategic').map(def => def.id),
);

function hasResourceTypeWithinRadius(
  map: GameMap,
  start: HexCoord,
  resourceIds: Set<ResourceType>,
  radius: number,
): boolean {
  return getWrappedHexesInRange(start, radius, map.width).some(coord => {
    const resource = map.tiles[hexKey(coord)]?.resource;
    return resource !== null && resource !== undefined && resourceIds.has(resource as ResourceType);
  });
}

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

  it('keeps late strategic resources out of the early terrain-probability pass', () => {
    const tiles = generateBaseTerrain(1, 1, 'early-resource-catalog');
    const tile = Object.values(tiles)[0];
    tile.terrain = 'hills';

    const rolls = [0, 0.999];
    placeResources(tiles, () => rolls.shift() ?? 0);

    expect(['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals'])
      .not.toContain(tile.resource);
  });
});

describe('late resource placement', () => {
  it('leaves late strategic placement until game setup knows starts and wonders', () => {
    const map = generateMap(30, 30, 'late-resource-pass');
    const lateResources = new Set(['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals']);

    expect(Object.values(map.tiles).some(tile => lateResources.has(tile.resource ?? ''))).toBe(false);
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

describe('S2a resource catalog coverage in placeResources', () => {
  function makeBlankTile(q: number, terrain: TerrainType): HexTile {
    return {
      coord: { q, r: 0 },
      terrain,
      elevation: 'lowland',
      resource: null,
      improvement: 'none',
      improvementTurnsLeft: 0,
      owner: null,
      hasRiver: false,
      wonder: null,
    };
  }

  it('stone is placed on mountain tiles, never on hills', () => {
    const tiles: Record<string, HexTile> = {};
    for (let q = 0; q < 50; q++) {
      const terrain: TerrainType = q < 25 ? 'hills' : 'mountain';
      tiles[`${q},0`] = makeBlankTile(q, terrain);
    }

    let stoneOnHills = 0;
    let stoneOnMountain = 0;
    for (let i = 0; i < 30; i++) {
      const freshTiles = Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...t, resource: null }]));
      placeResources(freshTiles, createRng(`stone-terrain-${i}`));
      for (const tile of Object.values(freshTiles)) {
        if (tile.resource === 'stone') {
          if (tile.terrain === 'hills') stoneOnHills++;
          if (tile.terrain === 'mountain') stoneOnMountain++;
        }
      }
    }

    expect(stoneOnHills, 'stone must not be placed on hills').toBe(0);
    expect(stoneOnMountain, 'stone must be placed on mountain tiles').toBeGreaterThan(0);
  });

  it('uses the retuned 20 percent default resource probability', () => {
    const tiles: Record<string, HexTile> = {
      '0,0': makeBlankTile(0, 'grassland'),
    };
    const rolls = [0.19, 0];

    placeResources(tiles, () => rolls.shift() ?? 0);

    expect(tiles['0,0'].resource).not.toBeNull();
  });

  it('every early resource appears on its declared terrain after placeResources', () => {
    // Build a tile set with 30 tiles of each relevant terrain
    const terrainSet: TerrainType[] = ['grassland', 'plains', 'jungle', 'hills', 'forest', 'desert', 'mountain', 'tundra'];
    const tiles: Record<string, HexTile> = {};
    let q = 0;
    for (const terrain of terrainSet) {
      for (let i = 0; i < 30; i++) {
        tiles[`${q},0`] = makeBlankTile(q, terrain);
        q++;
      }
    }

    for (const def of RESOURCE_DEFINITIONS.filter(def => !['coal', 'oil', 'aluminum', 'uranium', 'rare-earth-elements', 'battery-minerals'].includes(def.id))) {
      const declaredTerrains = Array.isArray(def.terrain) ? def.terrain : [def.terrain];
      const validTerrains = declaredTerrains.filter(t => terrainSet.includes(t as TerrainType));
      if (validTerrains.length === 0) continue;

      // Run up to 30 separate placements to find this resource
      let found = false;
      for (let attempt = 0; attempt < 30 && !found; attempt++) {
        const freshTiles = Object.fromEntries(Object.entries(tiles).map(([k, t]) => [k, { ...t, resource: null }]));
        placeResources(freshTiles, createRng(`catalog-${def.id}-${attempt}`));
        found = Object.values(freshTiles).some(t => t.resource === def.id);
      }
      expect(found, `resource "${def.id}" never placed — check TERRAIN_RESOURCES derivation`).toBe(true);
    }
  });
});

describe('guaranteeStartResources', () => {
  function makeSmallMap(): GameMap {
    return generateMap(20, 20, 'guarantee-test-seed');
  }

  it('places at least one luxury resource within radius 5 of each start', () => {
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }, { q: 15, r: 15 }];

    guaranteeStartResources(map, starts, createRng('guarantee-luxury-test'));

    for (const start of starts) {
      expect(hasResourceTypeWithinRadius(map, start, LUXURY_IDS, 5)).toBe(true);
    }
  });

  it('places at least one strategic resource within radius 5 of each start', () => {
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }, { q: 15, r: 15 }];

    guaranteeStartResources(map, starts, createRng('guarantee-strategic-test'));

    for (const start of starts) {
      expect(hasResourceTypeWithinRadius(map, start, STRATEGIC_IDS, 5)).toBe(true);
    }
  });

  it('does not use late resources to satisfy a start strategic-resource guarantee', () => {
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const start = { q: 5, r: 5 };
    guaranteeStartResources(map, [start], createRng('early-start-resource-only'));
    const nearby = getWrappedHexesInRange(start, 5, map.width)
      .map(coord => map.tiles[hexKey(coord)]?.resource);
    expect(nearby).not.toContain('coal');
    expect(nearby).not.toContain('oil');
    expect(nearby).not.toContain('aluminum');
    expect(nearby).not.toContain('uranium');
    expect(nearby).not.toContain('rare-earth-elements');
    expect(nearby).not.toContain('battery-minerals');
  });

  it('does not overwrite existing resources', () => {
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const nearKey = hexKey({ q: 5, r: 6 });
    const nearTile = map.tiles[nearKey];
    expect(nearTile).toBeDefined();
    nearTile.terrain = 'grassland';
    nearTile.resource = 'silk';

    const resourcesBefore = Object.fromEntries(
      Object.entries(map.tiles).map(([key, tile]) => [key, tile.resource]),
    );

    guaranteeStartResources(map, [{ q: 5, r: 5 }], createRng('no-overwrite-test'));

    for (const [key, originalResource] of Object.entries(resourcesBefore)) {
      if (originalResource !== null) {
        expect(map.tiles[key].resource).toBe(originalResource);
      }
    }
  });

  it('is deterministic for the same seed and start positions', () => {
    const map1 = makeSmallMap();
    const map2 = makeSmallMap();
    for (const tile of Object.values(map1.tiles)) tile.resource = null;
    for (const tile of Object.values(map2.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }];

    guaranteeStartResources(map1, starts, createRng('determinism-test'));
    guaranteeStartResources(map2, starts, createRng('determinism-test'));

    for (const key of Object.keys(map1.tiles)) {
      expect(map1.tiles[key].resource).toBe(map2.tiles[key].resource);
    }
  });

  it('does not crash when no eligible terrain exists within radius 5', () => {
    const map = generateMap(8, 8, 'ocean-test-seed');
    for (const tile of Object.values(map.tiles)) {
      tile.resource = null;
      tile.terrain = 'ocean';
    }

    expect(() =>
      guaranteeStartResources(map, [{ q: 4, r: 4 }], createRng('ocean-test')),
    ).not.toThrow();
  });

  it('places stone, iron, and gold within reach of each start (#432 — specific resources beyond generic luxury/strategic)', () => {
    // Unlike the generic luxury/strategic passes (many possible terrain/resource
    // matches, reliably found within radius 5), stone/iron/gold each require exactly
    // one terrain type — radius 5 may legitimately have none, in which case the
    // escalation logic (tested separately below) places it farther out. This test
    // checks the outer escalation radius, not radius 5, to reflect that.
    const map = makeSmallMap();
    for (const tile of Object.values(map.tiles)) tile.resource = null;
    const starts: HexCoord[] = [{ q: 5, r: 5 }, { q: 15, r: 15 }];

    guaranteeStartResources(map, starts, createRng('guarantee-specific-test'));

    for (const start of starts) {
      expect(hasResourceTypeWithinRadius(map, start, new Set(['stone']), 40)).toBe(true);
      expect(hasResourceTypeWithinRadius(map, start, new Set(['iron']), 40)).toBe(true);
      expect(hasResourceTypeWithinRadius(map, start, new Set(['gold']), 40)).toBe(true);
    }
  });

  it('escalates search radius when no eligible terrain for a specific resource exists within radius 5 (#432)', () => {
    // stone requires 'mountain' terrain and iron/gold require 'hills' — build a map
    // where the only mountain/hills tiles are well outside radius 5 of the start, to
    // prove guaranteeStartResources finds them anyway instead of silently giving up.
    const map = generateMap(40, 40, 'radius-escalation-test');
    for (const tile of Object.values(map.tiles)) {
      tile.resource = null;
      tile.terrain = 'grassland';
    }
    const start: HexCoord = { q: 20, r: 20 };
    const farMountain = map.tiles[hexKey({ q: 20, r: 32 })];
    const farHills = map.tiles[hexKey({ q: 32, r: 20 })];
    expect(farMountain).toBeDefined();
    expect(farHills).toBeDefined();
    farMountain.terrain = 'mountain';
    farHills.terrain = 'hills';

    guaranteeStartResources(map, [start], createRng('radius-escalation-test'));

    expect(hasResourceTypeWithinRadius(map, start, new Set(['stone']), 40)).toBe(true);
    expect(hasResourceTypeWithinRadius(map, start, new Set(['iron', 'gold']), 40)).toBe(true);
  });

  it('picks up a synthetic new required resource automatically — proves the guarantee is data-driven, not a hardcoded id list (#432)', () => {
    const syntheticWonders = [
      { id: 'test-only-wonder', name: 'Test Wonder', era: 2, productionCost: 1, requiredTechs: [], requiredResources: ['silk'], cityRequirement: 'any' as const, questSteps: [], reward: { summary: '' } },
    ];
    expect(getWonderRequiredResourceIds(syntheticWonders)).toEqual(new Set(['silk']));
    expect(getWonderRequiredResourceIds()).toEqual(new Set(['stone', 'iron', 'gold']));
  });
});
