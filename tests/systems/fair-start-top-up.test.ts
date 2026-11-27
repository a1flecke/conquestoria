import { describe, expect, it } from 'vitest';
import type { GameMap, HexCoord, HexTile } from '@/core/types';
import {
  FAIR_TOP_UP_MAX_PER_START,
  FAIR_TOP_UP_RESOURCE_IDS,
  createRng,
  normaliseFairStarts,
} from '@/systems/map-generator';
import { hexDistance, hexKey } from '@/systems/hex-utils';
import { createStartQualityIndex } from '@/systems/start-quality';
import { RESOURCE_DEFINITIONS } from '@/systems/resource-definitions';

function tile(coord: HexCoord, terrain: HexTile['terrain']): HexTile {
  return {
    coord, terrain, elevation: 'lowland', resource: null, improvement: 'none', owner: null,
    improvementTurnsLeft: 0, hasRiver: false, wonder: null,
  };
}

/** Grassland everywhere; the starts differ only in how many resources already surround them. */
function world(): GameMap {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 14; r++) {
    for (let q = 0; q < 60; q++) tiles[hexKey({ q, r })] = tile({ q, r }, 'grassland');
  }
  return { width: 60, height: 14, tiles, wrapsHorizontally: false, rivers: [] };
}

const STARTS = [{ q: 6, r: 7 }, { q: 22, r: 7 }, { q: 38, r: 7 }, { q: 54, r: 7 }];

function seedResources(map: GameMap, start: HexCoord, count: number): void {
  const spots = [{ q: 3, r: 0 }, { q: -3, r: 0 }, { q: 0, r: 3 }, { q: 0, r: -3 }];
  for (const spot of spots.slice(0, count)) map.tiles[hexKey({ q: start.q + spot.q, r: start.r + spot.r })].resource = 'silk';
}

const resourcesNear = (map: GameMap, start: HexCoord) => Object.values(map.tiles)
  .filter(at => at.resource && FAIR_TOP_UP_RESOURCE_IDS.has(at.resource as never) && hexDistance(at.coord, start) <= 2);

describe('Fair start top-up (design 2026-11-25, B3)', () => {
  it('uses the early resources that add food or production, read from the resource data', () => {
    const expected = RESOURCE_DEFINITIONS
      .filter(def => ['food', 'production'].includes(def.effect?.type ?? '') && !['coal', 'oil', 'aluminum', 'uranium', 'battery-minerals'].includes(def.id))
      .map(def => def.id);
    expect([...FAIR_TOP_UP_RESOURCE_IDS].sort()).toEqual([...expected].sort());
    expect(FAIR_TOP_UP_RESOURCE_IDS.has('cattle')).toBe(true);
  });

  it('tops up only the starts below the median, within two hexes, up to the median and at most twice each', () => {
    const map = world();
    seedResources(map, STARTS[0], 0);
    seedResources(map, STARTS[1], 1);
    seedResources(map, STARTS[2], 3);
    seedResources(map, STARTS[3], 4);
    const index = createStartQualityIndex(map);
    const before = STARTS.map(start => index.assess(start).score);
    const median = (before[1] + before[2]) / 2;

    const added = normaliseFairStarts(map, STARTS, STARTS, createRng('fair-top-up'));

    expect(resourcesNear(map, STARTS[0])).toHaveLength(FAIR_TOP_UP_MAX_PER_START);
    expect(resourcesNear(map, STARTS[1])).toHaveLength(1); // one resource short of the median (two)
    expect(resourcesNear(map, STARTS[2])).toHaveLength(0);
    expect(resourcesNear(map, STARTS[3])).toHaveLength(0);
    expect(added).toBe(FAIR_TOP_UP_MAX_PER_START + 1);
    const after = createStartQualityIndex(map);
    expect(after.assess(STARTS[0]).score).toBeGreaterThan(before[0]);
    expect(after.assess(STARTS[1]).score).toBeCloseTo(median);
  });

  it('never places on the start tile itself', () => {
    const map = world();
    seedResources(map, STARTS[0], 0);
    seedResources(map, STARTS[1], 3);
    seedResources(map, STARTS[2], 3);
    seedResources(map, STARTS[3], 3);
    normaliseFairStarts(map, STARTS, STARTS, createRng('fair-median'));
    expect(resourcesNear(map, STARTS[0])).toHaveLength(FAIR_TOP_UP_MAX_PER_START);
    for (const start of STARTS) expect(map.tiles[hexKey(start)].resource).toBeNull();
  });

  it('tops up reserved homeland options too, measured against the placed starts', () => {
    const map = world();
    const option = { q: 30, r: 2 };
    for (const start of STARTS) seedResources(map, start, 3);
    normaliseFairStarts(map, STARTS, [...STARTS, option], createRng('fair-option'));
    expect(resourcesNear(map, option).length).toBeGreaterThan(0);
    for (const start of STARTS) expect(resourcesNear(map, start)).toHaveLength(0);
  });

  it('does nothing with fewer than two starts', () => {
    const map = world();
    expect(normaliseFairStarts(map, [STARTS[0]], [STARTS[0]], createRng('fair-one'))).toBe(0);
  });
});
