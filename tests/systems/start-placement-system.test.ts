import { beforeAll, describe, expect, it } from 'vitest';
import type { GameMap, HexTile } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { loadGeoMap } from '@/systems/geo-map-loader';
import {
  getGeographicStartAnchor,
  getStartPositionDistance,
  findStartPositions,
  MIN_MAJOR_CIV_START_DISTANCE,
} from '@/systems/map-generator';
import { placeCivilizationStarts } from '@/systems/start-placement-system';
import { createNewGame } from '@/core/game-state';
import { createStartQualityIndex } from '@/systems/start-quality';
import { getPolarRowBand } from '@/systems/geo-latitude';
import { MIN_CITY_CENTER_DISTANCE } from '@/systems/city-territory-system';
import { hexKey } from '@/systems/hex-utils';
import { getGeographicStartCapacity } from '@/systems/geo-start-capacity';
import { preloadGeoMapData, readGeoMapDataFromDisk } from '../helpers/geo-map-data';

const { tiles: EARTH_TILES, rivers: EARTH_RIVERS } = readGeoMapDataFromDisk('earth');
const { tiles: OLD_WORLD_TILES, rivers: OLD_WORLD_RIVERS } = readGeoMapDataFromDisk('old-world');
const { tiles: NEW_WORLD_TILES, rivers: NEW_WORLD_RIVERS } = readGeoMapDataFromDisk('new-world');

function largeEarth(): GameMap {
  return loadGeoMap(
    EARTH_TILES.large,
    EARTH_RIVERS.large,
    MAP_DIMENSIONS.large,
    true,
  );
}

function tile(q: number, r: number): HexTile {
  return {
    coord: { q, r },
    terrain: 'grassland',
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

describe('civilization start placement', () => {
  it('separates the reported England, Germany, and Rome roster on balanced large Earth', () => {
    const map = largeEarth();

    const result = placeCivilizationStarts({
      map,
      civilizationTypeIds: ['england', 'germany', 'rome'],
      mapScript: 'earth',
      mapSize: 'large',
      mode: 'balanced',
      seed: 'issue-439',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.positions).toHaveLength(3);
    for (let i = 0; i < result.positions.length; i++) {
      for (let j = i + 1; j < result.positions.length; j++) {
        expect(getStartPositionDistance(map, result.positions[i], result.positions[j]))
          .toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
      }
    }
  });

  it('keeps exact known anchors in historical mode and reports their crowding', () => {
    const map = largeEarth();
    const civs = ['england', 'germany', 'rome'];

    const result = placeCivilizationStarts({
      map,
      civilizationTypeIds: civs,
      mapScript: 'earth',
      mapSize: 'large',
      mode: 'historical',
      seed: 'issue-439',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The first homeland is exact; a homeland closer than a capital may be founded to one already placed is placed
    // by the shared selection instead (design 2026-11-25, B4). Close neighbours remain True Start's nature.
    expect(result.positions[0]).toEqual(getGeographicStartAnchor('earth', 'large', civs[0]));
    expect(result.minimumDistance).toBeGreaterThanOrEqual(MIN_CITY_CENTER_DISTANCE);
    for (const assignment of result.assignments) {
      if (!assignment.usedFallback) expect(assignment.position).toEqual(assignment.historicalAnchor);
    }
  });

  it('returns an explicit failure rather than weakening spacing', () => {
    // A radius-4 island of mixed land in a 20x20 sea: its centre passes the start-quality floor (design
    // 2026-11-25), but no two tiles are the required 9 apart, so the failure under test is spacing.
    const MIXED = ['grassland', 'forest', 'hills', 'plains'] as const;
    const tiles: Record<string, HexTile> = {};
    for (let q = 0; q < 20; q++) {
      for (let r = 0; r < 20; r++) {
        const value = tile(q, r);
        const dq = q - 10;
        const dr = r - 10;
        value.terrain = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2 <= 4
          ? MIXED[(q * 7 + r * 13) % MIXED.length]
          : 'ocean';
        tiles[`${q},${r}`] = value;
      }
    }
    const map: GameMap = {
      width: 20,
      height: 20,
      wrapsHorizontally: false,
      tiles,
      rivers: [],
    };

    expect(placeCivilizationStarts({
      map,
      civilizationTypeIds: ['a', 'b'],
      mapScript: 'procedural',
      mapSize: 'small',
      mode: 'balanced',
      seed: 'impossible',
    })).toEqual({
      ok: false,
      reason: 'insufficient-separated-sites',
      requested: 2,
      available: 1,
    });
    expect(() => findStartPositions(map, ['a', 'b'], 'procedural', 'small', { seed: 'test' }))
      .toThrow(/at least 9 hexes apart/);
  });

  it('is deterministic and preserves input civilization alignment', () => {
    const map = largeEarth();
    const input = {
      map,
      civilizationTypeIds: ['rome', 'england', 'germany'],
      mapScript: 'earth' as const,
      mapSize: 'large' as const,
      mode: 'balanced' as const,
      seed: 'repeatable',
    };

    const first = placeCivilizationStarts(input);
    const second = placeCivilizationStarts(input);

    expect(second).toEqual(first);
    expect(first.ok && first.assignments.map(assignment => assignment.civilizationTypeId))
      .toEqual(input.civilizationTypeIds);
  });

  // Exercises 9 map-size/script combinations of real geo-map generation + strict start
  // search; comfortably under 5s locally but trips the default vitest timeout on loaded
  // CI runners. Not related to this PR — bumping the timeout to unblock CI.
  it('finds strict starts at every supported geographic map capacity', () => {
    const scripts = [
      { id: 'earth' as const, tiles: EARTH_TILES, rivers: EARTH_RIVERS, wraps: true },
      { id: 'old-world' as const, tiles: OLD_WORLD_TILES, rivers: OLD_WORLD_RIVERS, wraps: false },
      { id: 'new-world' as const, tiles: NEW_WORLD_TILES, rivers: NEW_WORLD_RIVERS, wraps: false },
    ];
    for (const script of scripts) {
      for (const size of ['small', 'medium', 'large'] as const) {
        const dimensions = MAP_DIMENSIONS[size];
        const map = loadGeoMap(
          script.tiles[size],
          script.rivers[size],
          dimensions,
          script.wraps,
        );
        const capacity = getGeographicStartCapacity(script.id, size);
        const result = placeCivilizationStarts({
          map,
          civilizationTypeIds: Array.from(
            { length: capacity },
            (_, index) => `custom-${index}`,
          ),
          mapScript: script.id,
          mapSize: size,
          mode: 'balanced',
          seed: `capacity-${script.id}-${size}`,
        });

        expect(result.ok, `${script.id} ${size}`).toBe(true);
        if (!result.ok) continue;
        expect(result.positions).toHaveLength(capacity);
        for (let i = 0; i < result.positions.length; i++) {
          for (let j = i + 1; j < result.positions.length; j++) {
            expect(getStartPositionDistance(map, result.positions[i], result.positions[j]))
              .toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
          }
        }
      }
    }
  }, 20000);
});

describe('start quality on real-world maps (design 2026-11-25, B2)', () => {
  beforeAll(async () => { await preloadGeoMapData(); });

  it('never starts the reported game (Earth large, Balanced, 8 civilizations, Rome) on the Arctic islet', () => {
    const state = createNewGame({
      civType: 'rome', seed: 'game-160716449', mapSize: 'large', opponentCount: 7,
      mapScript: 'earth', startPlacementMode: 'balanced', gameTitle: 'reported',
    });
    const index = createStartQualityIndex(state.map, { polarRows: getPolarRowBand('earth', state.map.height) });
    const settlers = Object.values(state.units).filter(unit => unit.type === 'settler');
    expect(settlers).toHaveLength(8);
    for (const settler of settlers) {
      expect(index.floorFailures(settler.position, 'major'), `${settler.owner}@${hexKey(settler.position)}`).toEqual([]);
    }
    const rome = settlers.find(settler => settler.owner === 'player')!;
    expect(hexKey(rome.position)).not.toBe('46,6');
  });

  it('varies the chosen sites across seeds instead of reusing one layout', () => {
    const layouts = new Set<string>();
    for (let n = 0; n < 8; n++) {
      const state = createNewGame({
        civType: 'rome', seed: `variety-${n}`, mapSize: 'large', opponentCount: 7,
        mapScript: 'earth', startPlacementMode: 'balanced', gameTitle: 'v',
      });
      layouts.add(Object.values(state.units).filter(u => u.type === 'settler').map(u => hexKey(u.position)).sort().join('|'));
    }
    expect(layouts.size).toBeGreaterThanOrEqual(3);
  });

  it('places True Start fallbacks on livable land, clear of every homeland', () => {
    const data = readGeoMapDataFromDisk('old-world');
    const map = loadGeoMap(data.tiles.small, data.rivers.small, MAP_DIMENSIONS.small, false);
    // Gondor has no Old World homeland, so it is placed by the shared selection.
    const civs = ['rome', 'babylon', 'gondor'];
    const result = placeCivilizationStarts({
      map, civilizationTypeIds: civs, mapScript: 'old-world', mapSize: 'small', mode: 'historical', seed: 'fallback',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.fallbackCivilizationTypeIds.length).toBeGreaterThan(0);
    const index = createStartQualityIndex(map, { polarRows: getPolarRowBand('old-world', map.height) });
    const anchors = result.assignments.filter(a => !a.usedFallback).map(a => a.position);
    for (const assignment of result.assignments.filter(a => a.usedFallback)) {
      expect(index.floorFailures(assignment.position, 'major')).toEqual([]);
      for (const anchor of anchors) {
        expect(getStartPositionDistance(map, assignment.position, anchor)).toBeGreaterThanOrEqual(MIN_CITY_CENTER_DISTANCE);
      }
    }
  });
});
