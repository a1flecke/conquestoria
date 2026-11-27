import { describe, expect, it } from 'vitest';
import type { GameMap, HexTile, TerrainType } from '@/core/types';
import { generateMap, findStartPositions, MIN_MAJOR_CIV_START_DISTANCE } from '@/systems/map-generator';
import { hexDistance, wrappedHexDistance } from '@/systems/hex-utils';
import { createStartQualityIndex } from '@/systems/start-quality';
import { assignHomelandRoom, describeHomelandSite, selectHomelandOptions } from '@/systems/homeland-options';

function buildMap(
  width: number,
  height: number,
  fill: TerrainType,
  paint: (q: number, r: number) => TerrainType | undefined = () => undefined,
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
  return { width, height, tiles, wrapsHorizontally: false, rivers: [] };
}

const MIX: TerrainType[] = ['grassland', 'forest', 'hills', 'plains'];
const mixed = (q: number, r: number): TerrainType => MIX[(q * 7 + r * 13) % MIX.length];

function world(seed: string, civs = 4) {
  const map = generateMap(80, 80, seed);
  const starts = findStartPositions(map, Array.from({ length: civs }, (_, i) => `c${i}`), 'procedural', 'large', { seed });
  return { map, starts };
}

const dist = (map: GameMap, a: { q: number; r: number }, b: { q: number; r: number }) =>
  map.wrapsHorizontally ? wrappedHexDistance(a, b, map.width) : hexDistance(a, b);

const keys = (options: Array<{ coord: { q: number; r: number } }>) => options.map(o => `${o.coord.q},${o.coord.r}`);

describe('selectHomelandOptions (design 2026-11-25, Phase C)', () => {
  it('offers the placed start first, then up to two alternates that pass the major start minimum', () => {
    const { map, starts } = world('homeland-1');
    const options = selectHomelandOptions({ map, starts, humanIndices: [0], seed: 'homeland-1' }).get(0)!;
    expect(options.length).toBeGreaterThanOrEqual(2);
    expect(options.length).toBeLessThanOrEqual(3);
    expect(options[0].coord).toEqual(starts[0]);
    const quality = createStartQualityIndex(map);
    for (const option of options.slice(1)) expect(quality.floorFailures(option.coord, 'major')).toEqual([]);
  });

  it('keeps every alternate a full start distance from every other civilization, and a real choice away from its own start', () => {
    for (const seed of ['homeland-2', 'homeland-3', 'homeland-4']) {
      const { map, starts } = world(seed);
      const options = selectHomelandOptions({ map, starts, humanIndices: [0], seed }).get(0)!;
      for (const option of options.slice(1)) {
        for (let other = 1; other < starts.length; other++) {
          expect(dist(map, option.coord, starts[other]), `${seed} option vs civ ${other}`).toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
        }
        const fromOwn = dist(map, option.coord, starts[0]);
        expect(fromOwn).toBeGreaterThanOrEqual(6);
        expect(fromOwn).toBeLessThanOrEqual(16);
      }
    }
  });

  it('never lets one human\'s options crowd another human\'s or an AI start, so every combination of choices is legal', () => {
    const { map, starts } = world('homeland-hot', 4);
    const result = selectHomelandOptions({ map, starts, humanIndices: [0, 1], seed: 'homeland-hot' });
    const a = result.get(0)!;
    const b = result.get(1)!;
    for (const x of a) {
      for (const y of b) expect(dist(map, x.coord, y.coord)).toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
    }
    for (const option of [...a.slice(1), ...b.slice(1)]) {
      for (const ai of [2, 3]) expect(dist(map, option.coord, starts[ai])).toBeGreaterThanOrEqual(MIN_MAJOR_CIV_START_DISTANCE);
    }
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const { map, starts } = world('homeland-5');
    const pick = (seed: string) => keys(selectHomelandOptions({ map, starts, humanIndices: [0], seed }).get(0)!);
    expect(pick('same')).toEqual(pick('same'));
    const sets = new Set<string>();
    for (let n = 0; n < 8; n++) sets.add(pick(`seed-${n}`).join('|'));
    expect(sets.size).toBeGreaterThanOrEqual(2);
  });

  it('gives only the placed start when no alternate fits, rather than a worse site', () => {
    // One small livable island and nothing else: no alternate can pass the minimum six hexes away.
    const map = buildMap(30, 30, 'coast', (q, r) => ((Math.abs(q - 15) + Math.abs(r - 15) + Math.abs(q - 15 + r - 15)) / 2 <= 5 ? mixed(q, r) : undefined));
    const result = selectHomelandOptions({ map, starts: [{ q: 15, r: 15 }], humanIndices: [0], seed: 'tiny' });
    expect(result.get(0)!.map(o => o.coord)).toEqual([{ q: 15, r: 15 }]);
  });

  it('offers nothing to an AI civilization', () => {
    const { map, starts } = world('homeland-6');
    const result = selectHomelandOptions({ map, starts, humanIndices: [0], seed: 'homeland-6' });
    expect([...result.keys()]).toEqual([0]);
  });
});

describe('assignHomelandRoom: a human boxed in gets a start with room to choose', () => {
  // A small island (no alternate six hexes away) and a wide continent with room for several.
  const hexRadius = (q: number, r: number, cq: number, cr: number) => (Math.abs(q - cq) + Math.abs(r - cr) + Math.abs(q - cq + r - cr)) / 2;
  const islandAndContinent = buildMap(70, 40, 'coast', (q, r) => {
    if (hexRadius(q, r, 8, 20) <= 4) return mixed(q, r);
    if (q >= 30 && q <= 68 && r >= 3 && r <= 36) return mixed(q, r);
    return undefined;
  });
  const ISLAND = { q: 8, r: 20 };
  const CONTINENT = { q: 49, r: 20 };

  it('trades the boxed-in human\'s start with an AI start that has room, keeping the same set of starts', () => {
    const before = selectHomelandOptions({ map: islandAndContinent, starts: [ISLAND, CONTINENT], humanIndices: [0], seed: 'room' });
    expect(before.get(0)!.length).toBe(1);

    const result = assignHomelandRoom({ map: islandAndContinent, starts: [ISLAND, CONTINENT], humanIndices: [0], seed: 'room', canTradeStarts: true });
    expect(result.starts).toEqual([CONTINENT, ISLAND]);
    expect(result.options.get(0)!.length).toBe(3);
    expect(result.options.get(0)![0].coord).toEqual(CONTINENT);
    // Exactly what selectHomelandOptions gives for the traded starts: one definition of the options.
    expect(result.options).toEqual(selectHomelandOptions({ map: islandAndContinent, starts: result.starts, humanIndices: [0], seed: 'room' }));
  });

  it('never trades when starts are bound to civilizations (True Start)', () => {
    const result = assignHomelandRoom({ map: islandAndContinent, starts: [ISLAND, CONTINENT], humanIndices: [0], seed: 'room', canTradeStarts: false });
    expect(result.starts).toEqual([ISLAND, CONTINENT]);
    expect(result.options.get(0)!.length).toBe(1);
  });

  it('never moves a human who already has a full choice, or trades with another human', () => {
    const roomy = assignHomelandRoom({ map: islandAndContinent, starts: [CONTINENT, ISLAND], humanIndices: [0], seed: 'room', canTradeStarts: true });
    expect(roomy.starts).toEqual([CONTINENT, ISLAND]);
    // Two humans: the boxed-in one may not take the other human's start.
    const humans = assignHomelandRoom({ map: islandAndContinent, starts: [ISLAND, CONTINENT], humanIndices: [0, 1], seed: 'room', canTradeStarts: true });
    expect(humans.starts).toEqual([ISLAND, CONTINENT]);
  });

  it('changes nothing on a map where every human already has room', () => {
    for (const seed of ['homeland-2', 'homeland-3']) {
      const { map, starts } = world(seed);
      const result = assignHomelandRoom({ map, starts, humanIndices: [0], seed, canTradeStarts: true });
      expect(result.starts).toEqual(starts);
      expect(result.options).toEqual(selectHomelandOptions({ map, starts, humanIndices: [0], seed }));
    }
  });
});

describe('describeHomelandSite', () => {
  const describeAt = (map: GameMap) => describeHomelandSite(map, { q: 10, r: 10 }, createStartQualityIndex(map));

  it('names a river valley, hill country, forest land and open plains from the land around the start', () => {
    const river = buildMap(20, 20, 'grassland', (q, r) => ((q + r) % 5 === 0 ? 'plains' : undefined));
    river.tiles['10,10'].hasRiver = true;
    expect(describeAt(river).character).toBe('River valley');
    expect(describeAt(buildMap(20, 20, 'hills', (q, r) => ((q + r) % 4 === 0 ? 'grassland' : undefined))).character).toBe('Hill country');
    expect(describeAt(buildMap(20, 20, 'forest', (q, r) => ((q + r) % 4 === 0 ? 'grassland' : undefined))).character).toBe('Forest land');
    expect(describeAt(buildMap(20, 20, 'plains', (q, r) => ((q + r) % 4 === 0 ? 'forest' : undefined))).character).toBe('Open plains');
  });

  it('names a coast, and reports food honestly', () => {
    const coast = describeAt(buildMap(20, 20, 'grassland', q => (q >= 11 ? 'coast' : undefined)));
    expect(coast.character).toBe('Coastal plain');
    expect(coast.summary).toContain('sea');
    expect(describeAt(buildMap(20, 20, 'grassland')).food).toBe('rich');
    expect(describeAt(buildMap(20, 20, 'tundra', (q, r) => ((q + r) % 3 === 0 ? 'forest' : undefined))).food).toBe('lean');
  });
});
