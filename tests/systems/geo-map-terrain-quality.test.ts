/**
 * Real-world map data quality (design 2026-11-25 follow-up). The generator used to save every shoreline LAND tile
 * as `coast` (water in game), which removed 40-70% of each map's land, and it turned every inland tile within 30
 * degrees of the equator into desert (the Amazon and the Congo were deserts; Earth had no jungle). These checks pin
 * the regenerated data so neither can come back.
 */
import { describe, expect, it } from 'vitest';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { loadGeoMap } from '@/systems/geo-map-loader';
import { GEO_LATITUDE_BOUNDS } from '@/systems/geo-latitude';
import { getWrappedHexNeighbors, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { isValidStartTile } from '@/systems/map-validation';
import { EARTH_START_POSITIONS } from '@/systems/earth-start-positions';
import { OLD_WORLD_START_POSITIONS } from '@/systems/old-world-start-positions';
import { NEW_WORLD_START_POSITIONS } from '@/systems/new-world-start-positions';
import type { GameMap } from '@/core/types';
import { readGeoMapDataFromDisk } from '../helpers/geo-map-data';

const SIZES = ['small', 'medium', 'large'] as const;
const SCRIPTS = [
  { id: 'earth' as const, wraps: true, lonMin: -180, lonMax: 180, landShare: [0.25, 0.36], starts: EARTH_START_POSITIONS },
  { id: 'old-world' as const, wraps: false, lonMin: -15, lonMax: 150, landShare: [0.40, 0.60], starts: OLD_WORLD_START_POSITIONS },
  { id: 'new-world' as const, wraps: false, lonMin: -170, lonMax: -30, landShare: [0.20, 0.32], starts: NEW_WORLD_START_POSITIONS },
];
const WATER = new Set(['ocean', 'coast']);

function mapFor(script: (typeof SCRIPTS)[number], size: (typeof SIZES)[number]): GameMap {
  const data = readGeoMapDataFromDisk(script.id);
  return loadGeoMap(data.tiles[size], data.rivers[size], MAP_DIMENSIONS[size], script.wraps);
}

function terrainAt(map: GameMap, script: (typeof SCRIPTS)[number], lon: number, lat: number): string | undefined {
  const { latMin, latMax } = GEO_LATITUDE_BOUNDS[script.id];
  const q = Math.round(((lon - script.lonMin) / (script.lonMax - script.lonMin)) * map.width - 0.5);
  const r = Math.round(((latMax - lat) / (latMax - latMin)) * map.height - 0.5);
  return map.tiles[`${q},${r}`]?.terrain;
}

describe('real-world map terrain', () => {
  for (const script of SCRIPTS) {
    for (const size of SIZES) {
      describe(`${script.id} ${size}`, () => {
        const map = mapFor(script, size);
        const neighbours = (coord: { q: number; r: number }) =>
          script.wraps ? getWrappedHexNeighbors(coord, map.width) : hexNeighbors(coord);

        it('keeps a real-world share of land (shoreline land is land, not water)', () => {
          const tiles = Object.values(map.tiles);
          const land = tiles.filter(tile => !WATER.has(tile.terrain)).length / tiles.length;
          expect(land).toBeGreaterThanOrEqual(script.landShare[0]);
          expect(land).toBeLessThanOrEqual(script.landShare[1]);
        });

        it('uses coast only for water next to land, and ocean only away from land', () => {
          const wrong: string[] = [];
          for (const tile of Object.values(map.tiles)) {
            if (!WATER.has(tile.terrain)) continue;
            const touchesLand = neighbours(tile.coord).some(n => {
              const other = map.tiles[hexKey(n)];
              return other !== undefined && !WATER.has(other.terrain);
            });
            if ((tile.terrain === 'coast') !== touchesLand) wrong.push(`${hexKey(tile.coord)} ${tile.terrain}`);
          }
          expect(wrong).toEqual([]);
        });

        it('puts every historical homeland on land a city can stand on, one civilization per tile', () => {
          const positions = Object.entries(script.starts[size]);
          const bad = positions.filter(([, coord]) => !isValidStartTile(map.tiles[hexKey(coord)]))
            .map(([civ, coord]) => `${civ}@${hexKey(coord)} ${map.tiles[hexKey(coord)]?.terrain}`);
          expect(bad).toEqual([]);
          expect(new Set(positions.map(([, coord]) => hexKey(coord))).size).toBe(positions.length);
        });
      });
    }
  }

  it('grows rainforest in the tropics and keeps deserts in the desert belts (Earth large)', () => {
    const earth = SCRIPTS[0];
    const map = mapFor(earth, 'large');
    for (const [lon, lat] of [[-62, -4], [22, 0], [8, 7]]) {
      expect(['jungle', 'grassland', 'forest', 'plains', 'hills']).toContain(terrainAt(map, earth, lon, lat));
      expect(terrainAt(map, earth, lon, lat)).not.toBe('desert');
    }
    expect(terrainAt(map, earth, 10, 23)).toBe('desert');
    expect(Object.values(map.tiles).some(tile => tile.terrain === 'jungle')).toBe(true);
  });

  it('keeps every Earth homeland, including the fantasy civilizations', () => {
    for (const size of SIZES) expect(Object.keys(EARTH_START_POSITIONS[size]).length).toBe(29);
  });
});
