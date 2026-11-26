import { describe, expect, it } from 'vitest';
import type { GameMap, HexTile, TerrainType } from '@/core/types';
import { getPolarRowBand } from '@/systems/geo-latitude';
import { isFertileStart } from '@/systems/start-fertility';
import { START_FLOORS, createStartQualityIndex } from '@/systems/start-quality';

/** A map of `fill`, with `paint(q, r)` overriding single tiles. */
function buildMap(
  width: number,
  height: number,
  fill: TerrainType,
  paint: (q: number, r: number) => TerrainType | undefined = () => undefined,
  wrapsHorizontally = false,
): GameMap {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < height; r++) {
    for (let q = 0; q < width; q++) {
      tiles[`${q},${r}`] = {
        coord: { q, r }, terrain: paint(q, r) ?? fill, elevation: 'lowland', resource: null,
        improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
      } as HexTile;
    }
  }
  return { width, height, tiles, wrapsHorizontally, rivers: [] };
}

const axial = (dq: number, dr: number) => (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
const MIX: TerrainType[] = ['grassland', 'forest', 'hills', 'plains'];
const mixed = (q: number, r: number): TerrainType => MIX[(q * 7 + r * 13) % MIX.length];

describe('start-quality floors (design 2026-11-25, B1)', () => {
  it('rejects an Arctic islet like the reported start (Earth large q46 r6) for land, expansion room and latitude', () => {
    // The regenerated Earth keeps its real shoreline, so the original one-tile islet no longer exists; this rebuilds
    // its shape: one tundra tile in open water, in Earth large's polar rows.
    const map = buildMap(80, 80, 'coast', (q, r) => (q === 46 && r === 6 ? 'tundra' : undefined), true);
    const index = createStartQualityIndex(map, { polarRows: getPolarRowBand('earth', 80) });
    const failures = index.floorFailures({ q: 46, r: 6 }, 'major');
    expect(failures).toEqual(expect.arrayContaining(['land-r2', 'expansion-room', 'polar-band']));
    expect(index.assess({ q: 46, r: 6 }).landmassTiles).toBe(1);
  });

  it('rejects a coast-ringed site that the old food floor accepted', () => {
    const map = buildMap(15, 15, 'coast', (q, r) => (q === 7 && r === 7 ? 'grassland' : undefined));
    expect(isFertileStart(map, { q: 7, r: 7 })).toBe(true);
    const index = createStartQualityIndex(map);
    expect(index.passesFloor({ q: 7, r: 7 }, 'major')).toBe(false);
    expect(index.assess({ q: 7, r: 7 }).landFood6).toBe(0);
  });

  it('rejects a mostly frozen start', () => {
    const map = buildMap(20, 20, 'tundra', (q, r) => ((q + r) % 4 === 0 ? 'forest' : undefined));
    expect(createStartQualityIndex(map).floorFailures({ q: 10, r: 10 }, 'major')).toContain('frozen');
  });

  it('rejects a barren desert for food and production', () => {
    const map = buildMap(20, 20, 'desert');
    const failures = createStartQualityIndex(map).floorFailures({ q: 10, r: 10 }, 'major');
    expect(failures).toEqual(expect.arrayContaining(['land-food', 'land-production']));
  });

  it('holds city-states to land and yield but not expansion room', () => {
    // A radius-2 island of good land: plenty to work, no second city site 4+ away.
    const map = buildMap(15, 15, 'coast', (q, r) => (axial(q - 7, r - 7) <= 2 ? mixed(q, r) : undefined));
    const index = createStartQualityIndex(map);
    expect(index.floorFailures({ q: 7, r: 7 }, 'major')).toEqual(['expansion-room']);
    expect(index.passesFloor({ q: 7, r: 7 }, 'city-state')).toBe(true);
  });

  it('accepts a varied river site and scores it above a desert', () => {
    const good = buildMap(20, 20, 'grassland', mixed);
    good.tiles['10,10'].hasRiver = true;
    const index = createStartQualityIndex(good);
    expect(index.passesFloor({ q: 10, r: 10 }, 'major')).toBe(true);
    expect(index.passesFloor({ q: 10, r: 10 }, 'city-state')).toBe(true);
    expect(index.assess({ q: 10, r: 10 }).freshWater).toBe(true);
    const desert = createStartQualityIndex(buildMap(20, 20, 'desert'));
    expect(index.assess({ q: 10, r: 10 }).score).toBeGreaterThan(desert.assess({ q: 10, r: 10 }).score);
  });

  it('counts land across the seam only on a wrapping map', () => {
    const paint = (q: number) => (q >= 8 ? 'grassland' as const : undefined);
    const wrapping = createStartQualityIndex(buildMap(10, 10, 'coast', paint, true));
    const flat = createStartQualityIndex(buildMap(10, 10, 'coast', paint, false));
    expect(wrapping.assess({ q: 0, r: 5 }).landTilesR2).toBeGreaterThan(0);
    expect(flat.assess({ q: 0, r: 5 }).landTilesR2).toBe(0);
  });

  it('keeps the major floor stricter than the city-state floor', () => {
    expect(START_FLOORS.major.landR2).toBe(8);
    expect(START_FLOORS['city-state'].landR2).toBe(6);
    expect(START_FLOORS.major.minExpansionSites).toBe(2);
    expect(START_FLOORS['city-state'].minExpansionSites).toBe(0);
  });
});
