import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { GameMap, HexCoord, TerrainType } from '@/core/types';
import {
  EXPANSION_SEARCH_RADIUS,
  getExpansionCitySoftCap,
  getKnownExpansionSites,
} from '@/ai/ai-expansion-sites';
import { hexKey } from '@/systems/hex-utils';

/** A flat known map. Only the tiles listed exist — absence models fog. */
function knownMap(
  tiles: Array<{ q: number; r: number; terrain: TerrainType }>,
  options: { wrapsHorizontally?: boolean; width?: number } = {},
): GameMap {
  return {
    width: options.width ?? 40,
    height: 40,
    wrapsHorizontally: options.wrapsHorizontally ?? false,
    tiles: Object.fromEntries(tiles.map(tile => [
      hexKey({ q: tile.q, r: tile.r }),
      {
        coord: { q: tile.q, r: tile.r },
        terrain: tile.terrain,
        elevation: 0,
        resource: null,
        improvement: null,
        owner: null,
        hasRiver: false,
      },
    ])),
  } as unknown as GameMap;
}

/** A square-ish patch of one terrain, centred on (cq, cr). */
function patch(cq: number, cr: number, radius: number, terrain: TerrainType) {
  const out: Array<{ q: number; r: number; terrain: TerrainType }> = [];
  for (let q = cq - radius; q <= cq + radius; q++) {
    for (let r = cr - radius; r <= cr + radius; r++) out.push({ q, r, terrain });
  }
  return out;
}

const ORIGIN: HexCoord = { q: 0, r: 0 };

describe('getKnownExpansionSites', () => {
  it('returns a legal site outside MIN_CITY_CENTER_DISTANCE of every known city', () => {
    const map = knownMap(patch(0, 0, 8, 'grassland'));
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 5);

    expect(sites.length).toBeGreaterThan(0);
    for (const site of sites) {
      expect(Math.abs(site.anchor.q) + Math.abs(site.anchor.r)).toBeGreaterThan(0);
    }
  });

  it('orders by score descending, then hexKey ascending', () => {
    const map = knownMap([
      ...patch(0, 0, 8, 'desert'),
      ...patch(6, 0, 2, 'grassland'),
    ]);
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 10);

    for (let i = 1; i < sites.length; i++) {
      const previous = sites[i - 1]!;
      const current = sites[i]!;
      if (previous.score === current.score) {
        expect(hexKey(previous.anchor) < hexKey(current.anchor)).toBe(true);
      } else {
        expect(previous.score).toBeGreaterThan(current.score);
      }
    }
  });

  it('respects the limit', () => {
    const map = knownMap(patch(0, 0, 8, 'grassland'));
    expect(getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 3)).toHaveLength(3);
  });

  it('prefers a grassland neighbourhood over a desert one', () => {
    const map = knownMap([
      ...patch(0, 0, 8, 'desert'),
      ...patch(5, 0, 2, 'grassland'),
    ]);
    const best = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 1)[0]!;
    const tile = map.tiles[hexKey(best.anchor)]!;

    expect(tile.terrain).toBe('grassland');
  });

  it('rejects a seam-adjacent site too close to a known city ACROSS the wrap', () => {
    // Width 10. A known city at q=1 and a candidate at q=9 are 2 apart across the
    // seam, well inside MIN_CITY_CENTER_DISTANCE=4 -- but 8 apart if you (wrongly)
    // use hexDistance. This test fails if cityDistance is not used.
    const map = knownMap(
      Array.from({ length: 10 }, (_, q) => ({ q, r: 0, terrain: 'grassland' as TerrainType })),
      { wrapsHorizontally: true, width: 10 },
    );
    const sites = getKnownExpansionSites(map, [{ q: 1, r: 0 }], [{ q: 1, r: 0 }], 20);

    expect(sites.map(site => site.anchor.q)).not.toContain(9);
  });

  it('never returns a tile failing the city-centre terrain rule', () => {
    const map = knownMap([
      ...patch(0, 0, 8, 'ocean'),
      ...patch(0, 0, 0, 'grassland'),
      { q: 6, r: 0, terrain: 'mountain' },
      { q: 6, r: 1, terrain: 'coast' },
    ]);
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 20);

    for (const site of sites) {
      expect(['ocean', 'coast', 'mountain']).not.toContain(map.tiles[hexKey(site.anchor)]!.terrain);
    }
  });

  it('never returns a tile within MIN_CITY_CENTER_DISTANCE of a known city', () => {
    const map = knownMap(patch(0, 0, 8, 'grassland'));
    const sites = getKnownExpansionSites(map, [ORIGIN, { q: 6, r: 0 }], [ORIGIN], 50);

    for (const site of sites) {
      expect(hexKey(site.anchor)).not.toBe(hexKey({ q: 6, r: 0 }));
      expect(hexKey(site.anchor)).not.toBe(hexKey({ q: 5, r: 0 }));
    }
  });

  it('never returns a tile absent from the known map, however good it would be', () => {
    // The perfect site at (6,0) is simply not in tiles -- the civ has not seen it.
    const map = knownMap([...patch(0, 0, 8, 'desert')].filter(t => !(t.q === 6 && t.r === 0)));
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 50);

    expect(sites.map(site => hexKey(site.anchor))).not.toContain(hexKey({ q: 6, r: 0 }));
  });

  it('never returns a tile beyond EXPANSION_SEARCH_RADIUS of every anchor', () => {
    const map = knownMap(patch(0, 0, EXPANSION_SEARCH_RADIUS + 6, 'grassland'));
    const sites = getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 500);

    for (const site of sites) {
      const ring = Math.max(
        Math.abs(site.anchor.q),
        Math.abs(site.anchor.r),
        Math.abs(site.anchor.q + site.anchor.r),
      );
      expect(ring).toBeLessThanOrEqual(EXPANSION_SEARCH_RADIUS);
    }
  });

  it('returns [] when there is no anchor', () => {
    expect(getKnownExpansionSites(knownMap(patch(0, 0, 8, 'grassland')), [], [], 5)).toEqual([]);
  });

  it('returns [] when no legal site exists', () => {
    const map = knownMap(patch(0, 0, 8, 'ocean'));
    expect(getKnownExpansionSites(map, [ORIGIN], [ORIGIN], 5)).toEqual([]);
  });
});

describe('getExpansionCitySoftCap', () => {
  it('returns 2 at expansionDrive 0 and 6 at 1', () => {
    expect(getExpansionCitySoftCap(0)).toBe(2);
    expect(getExpansionCitySoftCap(1)).toBe(6);
  });

  it('is monotonic in expansionDrive', () => {
    const caps = [0, 0.25, 0.5, 0.75, 1].map(getExpansionCitySoftCap);
    for (let i = 1; i < caps.length; i++) {
      expect(caps[i]!).toBeGreaterThanOrEqual(caps[i - 1]!);
    }
  });
});

describe('module purity', () => {
  it('never imports or references the GameState type', () => {
    // Purity is the contract, not a convention: a pure function over an
    // already-fog-bounded map cannot leak hidden information, because the
    // omniscient state is not in scope to read. Checked against CODE, not raw
    // text -- the module's own doc comment explains this contract in prose and
    // legitimately says the word "GameState" while doing so.
    const source = readFileSync('src/ai/ai-expansion-sites.ts', 'utf8');
    const withoutComments = source
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/\/\/.*$/gm, '');
    expect(withoutComments).not.toContain('GameState');
  });
});
