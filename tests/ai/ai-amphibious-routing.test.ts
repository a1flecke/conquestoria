import { describe, expect, it } from 'vitest';
import type { GameMap, TerrainType } from '@/core/types';
import { findRegionCrossings } from '@/ai/ai-amphibious-routing';
import { hexKey } from '@/systems/hex-utils';

/** A flat map. Only the tiles listed exist -- matches ai-expansion-sites.test.ts's `knownMap` convention. */
function testMap(
  tiles: Array<{ q: number; r: number; terrain: TerrainType; regionKey?: string }>,
): GameMap {
  return {
    width: 40,
    height: 40,
    wrapsHorizontally: false,
    rivers: [],
    tiles: Object.fromEntries(tiles.map(t => [
      hexKey({ q: t.q, r: t.r }),
      {
        coord: { q: t.q, r: t.r },
        terrain: t.terrain,
        elevation: 0,
        resource: null,
        improvement: null,
        owner: null,
        improvementTurnsLeft: 0,
        hasRiver: false,
        wonder: null,
        regionKey: t.regionKey,
      },
    ])),
  } as GameMap;
}

describe('findRegionCrossings', () => {
  it('finds a one-hop sea crossing with the correct embark/disembark tiles and distance', () => {
    // origin (0,0) -- coast(1,0) -- coast(2,0) -- target(3,0)
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'coast' },
      { q: 3, r: 0, terrain: 'grassland', regionKey: 'target' },
    ]);

    const result = findRegionCrossings(map, new Set(['origin']));

    expect(result.get('target')).toEqual({
      targetRegionKey: 'target',
      embarkTile: { q: 0, r: 0 },
      disembarkTile: { q: 3, r: 0 },
      navalDistance: 2,
    });
  });

  it('returns an empty map when originRegionKeys is empty', () => {
    const map = testMap([{ q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' }]);
    expect(findRegionCrossings(map, new Set())).toEqual(new Map());
  });

  it('never records a crossing back into one of the origin regions', () => {
    // Two tiles of the SAME region separated only by coast -- there is no
    // "other" region here, so no crossing should ever be recorded.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'grassland', regionKey: 'origin' },
    ]);

    expect(findRegionCrossings(map, new Set(['origin']))).toEqual(new Map());
  });

  it('does not find a region beyond one hop', () => {
    // origin -- one coast tile -- nothing else exists, so 'target' (which
    // would need a second hop) is simply absent from the known map.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
    ]);

    expect(findRegionCrossings(map, new Set(['origin'])).has('target')).toBe(false);
  });

  it('picks the shortest of two available crossings to the same target region', () => {
    // A short crossing directly east (distance 1) and a longer one via the
    // south-east corridor (distance 3) into the SAME target region -- the
    // short one must win.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'grassland', regionKey: 'target' },
      { q: 0, r: 1, terrain: 'coast' },
      { q: -1, r: 2, terrain: 'coast' },
      { q: -2, r: 3, terrain: 'coast' },
      { q: -3, r: 4, terrain: 'grassland', regionKey: 'target' },
    ]);

    const result = findRegionCrossings(map, new Set(['origin']));
    expect(result.get('target')?.navalDistance).toBe(1);
    expect(result.get('target')?.disembarkTile).toEqual({ q: 2, r: 0 });
  });

  it('ignores a tile with no regionKey as neither an origin nor a valid target', () => {
    // A ocean/coast expanse with an untagged land tile (regionKey undefined,
    // e.g. a pre-#1004 save not yet normalized) must not be recorded as a
    // reachable "target region" -- there is no key to record it under.
    const map = testMap([
      { q: 0, r: 0, terrain: 'grassland', regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' },
      { q: 2, r: 0, terrain: 'grassland' }, // no regionKey
    ]);

    expect(findRegionCrossings(map, new Set(['origin']))).toEqual(new Map());
  });

  it('is deterministic regardless of object key insertion order', () => {
    const tilesA = [
      { q: 0, r: 0, terrain: 'grassland' as TerrainType, regionKey: 'origin' },
      { q: 1, r: 0, terrain: 'coast' as TerrainType },
      { q: 2, r: 0, terrain: 'grassland' as TerrainType, regionKey: 'target' },
    ];
    const tilesB = [...tilesA].reverse();

    const resultA = findRegionCrossings(testMap(tilesA), new Set(['origin']));
    const resultB = findRegionCrossings(testMap(tilesB), new Set(['origin']));

    expect(resultA).toEqual(resultB);
  });
});
