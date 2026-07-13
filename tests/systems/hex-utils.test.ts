import {
  hexKey,
  parseHexKey,
  hexNeighbors,
  hexDistance,
  getWrappedHexNeighbors,
  getWrappedHexesInRange,
  hexRing,
  hexesInRange,
  pixelToHex,
  hexToPixel,
  wrappedHexDistance,
  wrapHexCoord,
  mapDistance,
  mapNeighbors,
  mapHexesInRange,
} from '@/systems/hex-utils';
import type { GameMap } from '@/core/types';

function makeMap(width: number, wrapsHorizontally: boolean): GameMap {
  return { width, height: 10, tiles: {}, wrapsHorizontally, rivers: [] };
}

describe('hexKey / parseHexKey', () => {
  it('converts coord to string key and back', () => {
    expect(hexKey({ q: 3, r: -2 })).toBe('3,-2');
    expect(parseHexKey('3,-2')).toEqual({ q: 3, r: -2 });
  });
});

describe('hexNeighbors', () => {
  it('returns 6 neighbors for a hex', () => {
    const neighbors = hexNeighbors({ q: 0, r: 0 });
    expect(neighbors).toHaveLength(6);
    expect(neighbors).toContainEqual({ q: 1, r: 0 });
    expect(neighbors).toContainEqual({ q: 0, r: 1 });
    expect(neighbors).toContainEqual({ q: -1, r: 1 });
  });
});

describe('hexDistance', () => {
  it('returns 0 for same hex', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 0, r: 0 })).toBe(0);
  });

  it('returns 1 for adjacent hexes', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 1, r: 0 })).toBe(1);
  });

  it('calculates correct distance', () => {
    expect(hexDistance({ q: 0, r: 0 }, { q: 3, r: -1 })).toBe(3);
  });
});

describe('hexRing', () => {
  it('returns center for radius 0', () => {
    const ring = hexRing({ q: 0, r: 0 }, 0);
    expect(ring).toEqual([{ q: 0, r: 0 }]);
  });

  it('returns 6 hexes for radius 1', () => {
    const ring = hexRing({ q: 0, r: 0 }, 1);
    expect(ring).toHaveLength(6);
  });

  it('returns 12 hexes for radius 2', () => {
    const ring = hexRing({ q: 0, r: 0 }, 2);
    expect(ring).toHaveLength(12);
  });
});

describe('hexesInRange', () => {
  it('returns 1 hex for range 0', () => {
    const hexes = hexesInRange({ q: 0, r: 0 }, 0);
    expect(hexes).toHaveLength(1);
  });

  it('returns 7 hexes for range 1', () => {
    const hexes = hexesInRange({ q: 0, r: 0 }, 1);
    expect(hexes).toHaveLength(7);
  });

  it('returns 19 hexes for range 2', () => {
    const hexes = hexesInRange({ q: 0, r: 0 }, 2);
    expect(hexes).toHaveLength(19);
  });
});

describe('hexToPixel / pixelToHex', () => {
  it('round-trips through pixel conversion', () => {
    const coord = { q: 5, r: 3 };
    const size = 32;
    const pixel = hexToPixel(coord, size);
    const back = pixelToHex(pixel.x, pixel.y, size);
    expect(back).toEqual(coord);
  });

  it('origin hex maps to near origin pixel', () => {
    const pixel = hexToPixel({ q: 0, r: 0 }, 32);
    expect(pixel.x).toBeCloseTo(0, 0);
    expect(pixel.y).toBeCloseTo(0, 0);
  });
});

describe('wrapHexCoord', () => {
  it('wraps q coordinate when exceeding map width', () => {
    const wrapped = wrapHexCoord({ q: 31, r: 0 }, 30);
    expect(wrapped.q).toBe(1);
  });

  it('wraps negative q coordinate', () => {
    const wrapped = wrapHexCoord({ q: -1, r: 0 }, 30);
    expect(wrapped.q).toBe(29);
  });

  it('does not wrap r coordinate', () => {
    const wrapped = wrapHexCoord({ q: 5, r: 35 }, 30);
    expect(wrapped.r).toBe(35);
  });

  it('leaves valid coordinates unchanged', () => {
    const wrapped = wrapHexCoord({ q: 15, r: 10 }, 30);
    expect(wrapped).toEqual({ q: 15, r: 10 });
  });
});

describe('wrapped hex helpers', () => {
  it('treats horizontal wrap neighbors as adjacent', () => {
    const neighbors = getWrappedHexNeighbors({ q: 0, r: 0 }, 5);
    expect(neighbors).toContainEqual({ q: 4, r: 0 });
    expect(neighbors).toContainEqual({ q: 4, r: 1 });
  });

  it('uses the wrapped distance across horizontal seams', () => {
    expect(wrappedHexDistance({ q: 0, r: 0 }, { q: 4, r: 0 }, 5)).toBe(1);
    expect(wrappedHexDistance({ q: 0, r: 0 }, { q: 3, r: 0 }, 5)).toBe(2);
  });

  it('wraps every coordinate in a range through the horizontal seam', () => {
    const range = getWrappedHexesInRange({ q: 0, r: 1 }, 1, 5);

    expect(range).toContainEqual({ q: 4, r: 1 });
    expect(range).toContainEqual({ q: 4, r: 2 });
    expect(range).toContainEqual({ q: 0, r: 1 });
    expect(range).toContainEqual({ q: 1, r: 0 });
  });

  it('deduplicates wrapped range coordinates using canonical keys', () => {
    const range = getWrappedHexesInRange({ q: 0, r: 1 }, 3, 5);
    const keys = range.map(hexKey);

    expect(new Set(keys).size).toBe(keys.length);
    expect(keys.every(key => Number(key.split(',')[0]) >= 0)).toBe(true);
    expect(keys.every(key => Number(key.split(',')[0]) < 5)).toBe(true);
  });
});

describe('map-aware helpers', () => {
  it('mapDistance uses raw distance on a non-wrapping map', () => {
    const map = makeMap(30, false);
    expect(mapDistance(map, { q: 0, r: 5 }, { q: 29, r: 5 })).toBe(29);
  });

  it('mapDistance uses wrapped distance on a wrapping map', () => {
    const map = makeMap(30, true);
    expect(mapDistance(map, { q: 0, r: 5 }, { q: 29, r: 5 })).toBe(1);
  });

  it('mapNeighbors returns raw neighbors on a non-wrapping map', () => {
    const map = makeMap(30, false);
    const neighbors = mapNeighbors(map, { q: 0, r: 0 });
    expect(neighbors).toContainEqual({ q: -1, r: 0 });
  });

  it('mapNeighbors wraps neighbors across the seam on a wrapping map', () => {
    const map = makeMap(5, true);
    const neighbors = mapNeighbors(map, { q: 0, r: 0 });
    expect(neighbors).toContainEqual({ q: 4, r: 0 });
    expect(neighbors.every(n => n.q >= 0 && n.q < 5)).toBe(true);
  });

  it('mapHexesInRange does not wrap on a non-wrapping map', () => {
    const map = makeMap(30, false);
    const range = mapHexesInRange(map, { q: 0, r: 0 }, 1);
    expect(range).toContainEqual({ q: -1, r: 0 });
  });

  it('mapHexesInRange wraps across the seam on a wrapping map', () => {
    const map = makeMap(5, true);
    const range = mapHexesInRange(map, { q: 0, r: 1 }, 1);
    expect(range).toContainEqual({ q: 4, r: 1 });
    expect(range.every(c => c.q >= 0 && c.q < 5)).toBe(true);
  });
});
