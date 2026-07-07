import { describe, expect, it } from 'vitest';
import type { GameMap, VisibilityMap } from '@/core/types';
import { resolveTilePresentationForViewer } from '@/renderer/tile-presentation';

const liveTile = {
  coord: { q: 0, r: 0 },
  terrain: 'forest',
  elevation: 'lowland',
  resource: 'deer',
  improvement: 'none',
  owner: 'ai-1',
  improvementTurnsLeft: 0,
  hasRiver: false,
  wonder: null,
} as const;

const map = { width: 4, height: 3, wrapsHorizontally: true, tiles: { '0,0': liveTile }, rivers: [] } as unknown as GameMap;

describe('tile-presentation', () => {
  it('returns live tile presentation for visible tiles', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 0, r: 0 })).toMatchObject({
      kind: 'live',
      tile: liveTile,
    });
  });

  it('returns last-seen presentation for fogged tiles', () => {
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'farm',
          improvementTurnsLeft: 0,
          owner: 'player',
          hasRiver: true,
          wonder: null,
        },
      },
    };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 0, r: 0 })).toMatchObject({
      kind: 'last-seen',
      tile: expect.objectContaining({ terrain: 'plains', owner: 'player', improvement: 'farm' }),
    });
  });

  it('returns unknown fog when an old save has no last-seen snapshot', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'fog' } };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 0, r: 0 })).toMatchObject({
      kind: 'unknown-fog',
      tile: expect.objectContaining({ terrain: 'grassland', owner: null, resource: null }),
    });
  });

  it('canonicalizes wrapped render coordinates before visibility lookup', () => {
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'desert',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: null,
        },
      },
    };

    expect(resolveTilePresentationForViewer(map, visibility, { q: 4, r: 0 })).toMatchObject({
      kind: 'last-seen',
      tile: expect.objectContaining({ terrain: 'desert' }),
    });
  });
});

describe('tile-presentation hasRail', () => {
  const railMap = {
    width: 4,
    height: 3,
    wrapsHorizontally: false,
    rivers: [],
    tiles: { '0,0': { ...liveTile, hasRoad: true, owner: 'ai-1' } },
  } as unknown as GameMap;

  it('live tile resolves hasRail true when the owner has completed railway-expansion', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };
    const result = resolveTilePresentationForViewer(railMap, visibility, { q: 0, r: 0 }, {
      'ai-1': ['railway-expansion'],
    });
    expect(result.hasRail).toBe(true);
  });

  it('live tile resolves hasRail false when the owner lacks railway-expansion (negative)', () => {
    const visibility: VisibilityMap = { tiles: { '0,0': 'visible' } };
    const result = resolveTilePresentationForViewer(railMap, visibility, { q: 0, r: 0 }, {
      'ai-1': ['road-building'],
    });
    expect(result.hasRail).toBe(false);
  });

  it('last-seen tile reads the frozen hasRail snapshot rather than re-deriving from live tech state (negative)', () => {
    const visibility: VisibilityMap = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'plains',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: 'ai-1',
          hasRiver: false,
          wonder: null,
          hasRoad: true,
          hasRail: false,
        },
      },
    };
    // Rival has since completed railway-expansion, but the viewer hasn't re-observed the tile.
    const result = resolveTilePresentationForViewer(railMap, visibility, { q: 0, r: 0 }, {
      'ai-1': ['railway-expansion'],
    });
    expect(result.hasRail).toBe(false);
  });
});
