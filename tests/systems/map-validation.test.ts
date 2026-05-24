import { describe, it, expect } from 'vitest';
import type { HexTile } from '@/core/types';
import {
  isValidStartTile,
  hasWorkableSurroundings,
  findNearestValidStart,
} from '@/systems/map-validation';

function makeTile(terrain: HexTile['terrain'], q = 0, r = 0): HexTile {
  return {
    coord: { q, r },
    terrain,
    elevation: 'lowland',
    resource: null,
    improvement: 'none',
    owner: null,
    improvementTurnsLeft: 0,
    hasRiver: false,
    wonder: null,
  };
}

describe('isValidStartTile', () => {
  it('returns true for grassland', () => {
    expect(isValidStartTile(makeTile('grassland'))).toBe(true);
  });

  it('returns true for plains', () => {
    expect(isValidStartTile(makeTile('plains'))).toBe(true);
  });

  it('returns true for tundra', () => {
    expect(isValidStartTile(makeTile('tundra'))).toBe(true);
  });

  it('returns false for ocean', () => {
    expect(isValidStartTile(makeTile('ocean'))).toBe(false);
  });

  it('returns false for coast', () => {
    expect(isValidStartTile(makeTile('coast'))).toBe(false);
  });

  it('returns false for mountain', () => {
    expect(isValidStartTile(makeTile('mountain'))).toBe(false);
  });

  it('returns false for snow', () => {
    expect(isValidStartTile(makeTile('snow'))).toBe(false);
  });

  it('returns false for volcanic', () => {
    expect(isValidStartTile(makeTile('volcanic'))).toBe(false);
  });

  it('returns false for undefined', () => {
    expect(isValidStartTile(undefined)).toBe(false);
  });
});

describe('hasWorkableSurroundings', () => {
  it('returns true when enough workable neighbors exist', () => {
    const tiles: Record<string, HexTile> = {};
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;
    for (const [dq, dr] of dirs) {
      const key = `${dq},${dr}`;
      tiles[key] = makeTile('grassland', dq, dr);
    }
    expect(hasWorkableSurroundings({ q: 0, r: 0 }, tiles, 2)).toBe(true);
  });

  it('returns false when too many unworkable neighbors', () => {
    const tiles: Record<string, HexTile> = {};
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;
    for (const [dq, dr] of dirs) {
      const key = `${dq},${dr}`;
      tiles[key] = makeTile('ocean', dq, dr);
    }
    expect(hasWorkableSurroundings({ q: 0, r: 0 }, tiles, 2)).toBe(false);
  });

  it('returns false when minWorkable threshold is not met', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['1,0'] = makeTile('grassland', 1, 0);
    tiles['-1,0'] = makeTile('ocean', -1, 0);
    tiles['0,1'] = makeTile('ocean', 0, 1);
    tiles['0,-1'] = makeTile('ocean', 0, -1);
    tiles['1,-1'] = makeTile('ocean', 1, -1);
    tiles['-1,1'] = makeTile('ocean', -1, 1);
    expect(hasWorkableSurroundings({ q: 0, r: 0 }, tiles, 2)).toBe(false);
  });
});

describe('findNearestValidStart', () => {
  it('returns the origin coord if it is already valid and workable', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['0,0'] = makeTile('grassland', 0, 0);
    const dirs = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, -1], [-1, 1]] as const;
    for (const [dq, dr] of dirs) {
      tiles[`${dq},${dr}`] = makeTile('grassland', dq, dr);
    }
    expect(findNearestValidStart({ q: 0, r: 0 }, tiles)).toEqual({ q: 0, r: 0 });
  });

  it('finds the nearest valid tile when origin is ocean', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['0,0'] = makeTile('ocean', 0, 0);
    tiles['1,0'] = makeTile('grassland', 1, 0);
    tiles['2,0'] = makeTile('grassland', 2, 0);
    tiles['1,1'] = makeTile('grassland', 1, 1);
    tiles['0,1'] = makeTile('plains', 0, 1);
    tiles['2,-1'] = makeTile('plains', 2, -1);
    tiles['1,-1'] = makeTile('plains', 1, -1);
    const result = findNearestValidStart({ q: 0, r: 0 }, tiles);
    expect(result).toEqual({ q: 1, r: 0 });
  });

  it('falls back to origin if no valid tile found', () => {
    const tiles: Record<string, HexTile> = {};
    tiles['0,0'] = makeTile('ocean', 0, 0);
    expect(findNearestValidStart({ q: 0, r: 0 }, tiles)).toEqual({ q: 0, r: 0 });
  });
});
