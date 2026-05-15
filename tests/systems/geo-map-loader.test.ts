import { describe, it, expect } from 'vitest';
import { loadGeoMap } from '@/systems/geo-map-loader';
import type { GeoTile } from '@/systems/geo-map-loader';
import { hexKey } from '@/systems/hex-utils';

function makeGeoTiles(width: number, height: number): GeoTile[] {
  const tiles: GeoTile[] = [];
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      tiles.push({ q, r, terrain: 'grassland', resource: null });
    }
  }
  return tiles;
}

describe('loadGeoMap', () => {
  it('creates a map with correct dimensions', () => {
    const tiles = makeGeoTiles(20, 20);
    const map = loadGeoMap(tiles, [], { width: 20, height: 20 }, true);
    expect(map.width).toBe(20);
    expect(map.height).toBe(20);
  });

  it('populates all tiles from GeoTile array', () => {
    const tiles = makeGeoTiles(10, 10);
    const map = loadGeoMap(tiles, [], { width: 10, height: 10 }, false);
    expect(Object.keys(map.tiles).length).toBe(100);
  });

  it('preserves terrain type from GeoTile', () => {
    const tiles: GeoTile[] = [
      { q: 0, r: 0, terrain: 'desert', resource: null },
      { q: 1, r: 0, terrain: 'ocean', resource: null },
      { q: 0, r: 1, terrain: 'mountain', resource: null },
    ];
    const map = loadGeoMap(tiles, [], { width: 5, height: 5 }, false);
    expect(map.tiles[hexKey({ q: 0, r: 0 })].terrain).toBe('desert');
    expect(map.tiles[hexKey({ q: 1, r: 0 })].terrain).toBe('ocean');
    expect(map.tiles[hexKey({ q: 0, r: 1 })].terrain).toBe('mountain');
  });

  it('preserves resource from GeoTile', () => {
    const tiles: GeoTile[] = [
      { q: 3, r: 3, terrain: 'grassland', resource: 'silk' },
    ];
    const map = loadGeoMap(tiles, [], { width: 10, height: 10 }, false);
    expect(map.tiles[hexKey({ q: 3, r: 3 })].resource).toBe('silk');
  });

  it('sets wrapsHorizontally correctly', () => {
    const tiles = makeGeoTiles(5, 5);
    const wrapping = loadGeoMap(tiles, [], { width: 5, height: 5 }, true);
    const nonWrapping = loadGeoMap(tiles, [], { width: 5, height: 5 }, false);
    expect(wrapping.wrapsHorizontally).toBe(true);
    expect(nonWrapping.wrapsHorizontally).toBe(false);
  });

  it('derives correct elevation from terrain', () => {
    const tiles: GeoTile[] = [
      { q: 0, r: 0, terrain: 'mountain', resource: null },
      { q: 1, r: 0, terrain: 'hills', resource: null },
      { q: 2, r: 0, terrain: 'grassland', resource: null },
      { q: 3, r: 0, terrain: 'volcanic', resource: null },
    ];
    const map = loadGeoMap(tiles, [], { width: 5, height: 5 }, false);
    expect(map.tiles[hexKey({ q: 0, r: 0 })].elevation).toBe('mountain');
    expect(map.tiles[hexKey({ q: 1, r: 0 })].elevation).toBe('highland');
    expect(map.tiles[hexKey({ q: 2, r: 0 })].elevation).toBe('lowland');
    expect(map.tiles[hexKey({ q: 3, r: 0 })].elevation).toBe('highland');
  });

  it('marks hasRiver on tiles touched by a river segment', () => {
    const tiles = makeGeoTiles(10, 10);
    const rivers = [{ from: { q: 2, r: 2 }, to: { q: 3, r: 2 } }];
    const map = loadGeoMap(tiles, rivers, { width: 10, height: 10 }, false);
    expect(map.tiles[hexKey({ q: 2, r: 2 })].hasRiver).toBe(true);
  });

  it('initializes all tiles with improvement=none and no owner', () => {
    const tiles = makeGeoTiles(5, 5);
    const map = loadGeoMap(tiles, [], { width: 5, height: 5 }, false);
    for (const tile of Object.values(map.tiles)) {
      expect(tile.improvement).toBe('none');
      expect(tile.owner).toBeNull();
    }
  });
});
