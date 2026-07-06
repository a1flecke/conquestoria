import { describe, expect, it } from 'vitest';
import type { GameMap, HexTile } from '@/core/types';
import { MAP_DIMENSIONS } from '@/core/game-state';
import { EARTH_RIVERS, EARTH_TILES } from '@/systems/earth-map-data';
import { OLD_WORLD_RIVERS, OLD_WORLD_TILES } from '@/systems/old-world-map-data';
import { NEW_WORLD_RIVERS, NEW_WORLD_TILES } from '@/systems/new-world-map-data';
import { loadGeoMap } from '@/systems/geo-map-loader';
import {
  getGeographicStartAnchor,
  getStartPositionDistance,
  findStartPositions,
  MIN_MAJOR_CIV_START_DISTANCE,
} from '@/systems/map-generator';
import { placeCivilizationStarts } from '@/systems/start-placement-system';

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
    expect(result.positions).toEqual(civs.map(civ =>
      getGeographicStartAnchor('earth', 'large', civ),
    ));
    expect(result.minimumDistance).toBe(3);
    expect(result.fallbackCivilizationTypeIds).toEqual([]);
  });

  it('returns an explicit failure rather than weakening spacing', () => {
    const tiles = Object.fromEntries([
      tile(0, 0),
      tile(1, 0),
      tile(2, 0),
    ].map(value => [`${value.coord.q},${value.coord.r}`, value]));
    const map: GameMap = {
      width: 3,
      height: 1,
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
    expect(() => findStartPositions(map, ['a', 'b'], 'procedural', 'small'))
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
        const result = placeCivilizationStarts({
          map,
          civilizationTypeIds: Array.from(
            { length: dimensions.maxPlayers },
            (_, index) => `custom-${index}`,
          ),
          mapScript: script.id,
          mapSize: size,
          mode: 'balanced',
          seed: `capacity-${script.id}-${size}`,
        });

        expect(result.ok, `${script.id} ${size}`).toBe(true);
        if (!result.ok) continue;
        expect(result.positions).toHaveLength(dimensions.maxPlayers);
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
