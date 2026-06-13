import { describe, expect, it } from 'vitest';
import type { GameMap, GameState, HexTile, VisibilityMap } from '@/core/types';
import { buildTerrainLabelSuppressionSet } from '@/renderer/terrain-label-presentation';

function tile(q: number, overrides: Partial<HexTile> = {}): HexTile {
  return {
    coord: { q, r: 0 },
    terrain: 'plains',
    elevation: 'lowland',
    owner: null,
    improvement: 'none',
    improvementTurnsLeft: 0,
    resource: null,
    hasRiver: false,
    wonder: null,
    ...overrides,
  };
}

function makeState(): GameState {
  const tiles = Object.fromEntries(Array.from({ length: 10 }, (_, q) => [`${q},0`, tile(q)]));
  tiles['3,0'].improvement = 'farm';
  tiles['4,0'].resource = 'stone';
  tiles['5,0'].wonder = 'great_volcano';
  tiles['9,0'].improvement = 'mine';
  tiles['9,0'].resource = 'stone';
  const visibility: VisibilityMap = {
    tiles: Object.fromEntries(Array.from({ length: 10 }, (_, q) => [`${q},0`, q === 1 || q === 9 ? 'fog' : 'visible'])),
    lastSeen: {
      '1,0': {
        coord: { q: 1, r: 0 },
        terrain: 'plains',
        elevation: 'lowland',
        resource: null,
        improvement: 'none',
        improvementTurnsLeft: 0,
        owner: 'ai-1',
        hasRiver: false,
        wonder: null,
        city: { id: 'stale-city', name: 'Remembered', owner: 'ai-1', population: 4 },
      },
      '9,0': {
        coord: { q: 9, r: 0 },
        terrain: 'plains',
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
  return {
    map: { width: 10, height: 1, wrapsHorizontally: false, rivers: [], tiles } as GameMap,
    cities: {
      live: { id: 'live', owner: 'player', position: { q: 0, r: 0 } },
      hidden: { id: 'hidden', owner: 'ai-1', position: { q: 9, r: 0 } },
    },
    civilizations: { player: { visibility } },
  } as unknown as GameState;
}

describe('terrain label presentation', () => {
  it('suppresses every higher-priority presented object and keeps an empty tile labeled', () => {
    const suppressed = buildTerrainLabelSuppressionSet({
      state: makeState(),
      viewerId: 'player',
      visibleUnitCoords: [{ q: 2, r: 0 }],
      villagePositions: new Set(['6,0']),
      beastLairPositions: new Set(['7,0']),
      viewerTechs: new Set(['gathering']),
    });

    for (const q of [0, 1, 2, 3, 4, 5, 6, 7]) {
      expect(suppressed.has(`${q},0`), `expected ${q},0 to suppress its terrain label`).toBe(true);
    }
    expect(suppressed.has('8,0')).toBe(false);
  });

  it('does not leak hidden current cities, improvements, or resources through suppression', () => {
    const suppressed = buildTerrainLabelSuppressionSet({
      state: makeState(),
      viewerId: 'player',
      visibleUnitCoords: [],
      villagePositions: new Set(),
      beastLairPositions: new Set(['9,0']),
      viewerTechs: new Set(['gathering']),
    });

    expect(suppressed.has('9,0')).toBe(false);
  });

  it('does not suppress a resource the viewer cannot render yet', () => {
    const suppressed = buildTerrainLabelSuppressionSet({
      state: makeState(),
      viewerId: 'player',
      visibleUnitCoords: [],
      villagePositions: new Set(),
      beastLairPositions: new Set(),
      viewerTechs: new Set(),
    });

    expect(suppressed.has('4,0')).toBe(false);
  });
});
