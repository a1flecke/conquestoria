import { describe, it, expect } from 'vitest';
import { generateBalancedMap } from '@/systems/balanced-map-generator';
import { generateContinentMap } from '@/systems/continent-map-generator';
import { tagLandmassRegions } from '@/systems/landmass-tagger';
import type { GameMap, HexTile } from '@/core/types';

describe('landmass tagging', () => {
  it('generateBalancedMap assigns regionKey to all land tiles', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed', 2);
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey, `tile at ${tile.coord.q},${tile.coord.r} missing regionKey`).toBeDefined();
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });

  it('ocean tiles have no regionKey', () => {
    const { map } = generateBalancedMap(30, 30, 'test-seed-2', 2);
    const oceanTiles = Object.values(map.tiles).filter(t => t.terrain === 'ocean');
    for (const tile of oceanTiles) {
      expect(tile.regionKey).toBeUndefined();
    }
  });
});

describe('tagLandmassRegions', () => {
  function makeTile(q: number, r: number, terrain: string): HexTile {
    return {
      coord: { q, r }, terrain: terrain as any, elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
  }

  it('assigns continent-0 to the largest connected land component (≥9 tiles)', () => {
    const tiles: Record<string, HexTile> = {};
    // 10-tile connected component (large enough for continent threshold=9)
    [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    // 2-tile isolated component (island)
    [[8,8],[8,9]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 15, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['0,0'].regionKey).toBe('continent-0');
    expect(tagged['4,1'].regionKey).toBe('continent-0');
  });

  it('labels components under 9 tiles as island-N', () => {
    const tiles: Record<string, HexTile> = {};
    // 10-tile large component
    [[0,0],[1,0],[2,0],[3,0],[4,0],[0,1],[1,1],[2,1],[3,1],[4,1]].forEach(([q,r]) => {
      tiles[`${q},${r}`] = makeTile(q, r, 'grassland');
    });
    // 2-tile isolated component
    [[8,8],[8,9]].forEach(([q,r]) => { tiles[`${q},${r}`] = makeTile(q, r, 'plains'); });
    const map: GameMap = { width: 15, height: 15, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['8,8'].regionKey).toMatch(/^island-\d+$/);
  });

  it('leaves ocean tiles without regionKey', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['0,0'] = makeTile(0, 0, 'grassland');
    tiles['1,0'] = makeTile(1, 0, 'ocean');
    const map: GameMap = { width: 5, height: 5, tiles, wrapsHorizontally: false, rivers: [] };

    const tagged = tagLandmassRegions(map);
    expect(tagged['1,0'].regionKey).toBeUndefined();
  });
});

describe('continent-map-generator landmass tagging', () => {
  it('assigns regionKey to all non-ocean tiles', () => {
    const { map } = generateContinentMap(40, 40, 'continent-test');
    const landTiles = Object.values(map.tiles).filter(
      t => t.terrain !== 'ocean' && t.terrain !== 'coast'
    );
    expect(landTiles.length).toBeGreaterThan(0);
    for (const tile of landTiles) {
      expect(tile.regionKey).toMatch(/^(continent|island)-\d+$/);
    }
  });
});
