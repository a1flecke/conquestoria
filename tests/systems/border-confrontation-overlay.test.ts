import { describe, expect, it } from 'vitest';
import type { City, GameState, HexTile, Unit } from '@/core/types';
import { createDiplomacyState } from '@/systems/diplomacy-state';
import { BORDER_TENSION_RADIUS } from '@/systems/border-tension';
import { getBorderTensionPresentationForViewer } from '@/systems/border-confrontation';
import { hexKey } from '@/systems/hex-utils';

const WIDTH = 24;

interface Opts {
  rivalAt?: { q: number; r: number };
  /** Hexes each side currently sees; defaults to everything (so the knowledge gates pass). */
  hostSees?: boolean;
  playerExploredHostCity?: boolean;
  atWar?: boolean;
}

/** `player` owns a city at (4,4); `ai-1` owns a city at (16,4) and a warrior placed by the caller. */
function world(opts: Opts): GameState {
  const tiles: Record<string, HexTile> = {};
  for (let r = 0; r < 9; r++) for (let q = 0; q < WIDTH; q++) {
    tiles[`${q},${r}`] = { coord: { q, r }, terrain: 'grassland', owner: null } as HexTile;
  }
  const ids = ['player', 'ai-1'];
  const vis = (visible: boolean) => ({
    tiles: visible ? Object.fromEntries(Object.keys(tiles).map(k => [k, 'visible'])) : {},
    lastSeen: {},
  });
  const civ = (id: string, cities: string[], units: string[], visible: boolean) => ({
    id, name: id, cities, units, isEliminated: false, visibility: vis(visible),
    diplomacy: { ...createDiplomacyState(ids, id), atWarWith: opts.atWar ? ids.filter(o => o !== id) : [] },
  });
  const rivalAt = opts.rivalAt ?? { q: 6, r: 4 };
  return {
    turn: 10,
    currentPlayer: 'player',
    map: { width: WIDTH, height: 9, tiles, wrapsHorizontally: true, rivers: [] },
    civilizations: {
      player: civ('player', ['c-p'], [], opts.hostSees ?? true),
      'ai-1': civ('ai-1', ['c-a'], ['u-a'], true),
    },
    cities: {
      'c-p': { id: 'c-p', owner: 'player', position: { q: 4, r: 4 } } as City,
      'c-a': { id: 'c-a', owner: 'ai-1', position: { q: 16, r: 4 } } as City,
    },
    units: { 'u-a': { id: 'u-a', owner: 'ai-1', type: 'warrior', position: rivalAt } as Unit },
  } as unknown as GameState;
}

const keys = (state: GameState, viewer: string) =>
  new Set(getBorderTensionPresentationForViewer(state, viewer).tiles.map(t => hexKey(t.coord)));

describe('border tension overlay (#1766)', () => {
  it('shows the approached civ the radius around its own threatened city', () => {
    const tiles = getBorderTensionPresentationForViewer(world({}), 'player').tiles;
    expect(tiles.length).toBe(1 + 3 * BORDER_TENSION_RADIUS * (BORDER_TENSION_RADIUS + 1));
    expect(tiles.some(t => t.coord.q === 4 && t.coord.r === 4 && !t.edge)).toBe(true);
    expect(tiles.filter(t => t.edge).length).toBe(6 * BORDER_TENSION_RADIUS);
  });

  it('shows nothing when no rival armed unit is near', () => {
    expect(getBorderTensionPresentationForViewer(world({ rivalAt: { q: 12, r: 4 } }), 'player').tiles).toEqual([]);
  });

  it('does not reveal a rival unit the approached civ cannot see', () => {
    expect(getBorderTensionPresentationForViewer(world({ hostSees: false }), 'player').tiles).toEqual([]);
  });

  it('shows the intruder the radius around the city it is crowding, only once that city is explored', () => {
    // The player's own unit is near ai-1's city; the player has not explored it yet.
    const crowding = world({ rivalAt: { q: 12, r: 4 } });
    crowding.civilizations.player.units = ['u-p'];
    crowding.units['u-p'] = { id: 'u-p', owner: 'player', type: 'warrior', position: { q: 15, r: 4 } } as Unit;
    crowding.civilizations.player.visibility = { tiles: {}, lastSeen: {} } as never;
    expect(getBorderTensionPresentationForViewer(crowding, 'player').tiles).toEqual([]);
    crowding.civilizations.player.visibility.tiles['16,4'] = 'fog';
    expect(keys(crowding, 'player').has('16,4')).toBe(true);
  });

  it('follows the map seam', () => {
    const state = world({ rivalAt: { q: WIDTH - 1, r: 4 } });
    state.cities['c-p'].position = { q: 0, r: 4 };
    expect(keys(state, 'player').has(`${WIDTH - 1},4`)).toBe(true);
  });

  it('stays quiet at war, which has its own consequences', () => {
    expect(getBorderTensionPresentationForViewer(world({ atWar: true }), 'player').tiles).toEqual([]);
  });
});
