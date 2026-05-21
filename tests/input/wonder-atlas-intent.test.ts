import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, VisibilityMap } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { resolveWonderAtlasIntent } from '@/input/wonder-atlas-intent';

function makeState(): GameState {
  const state = createNewGame(undefined, 'wonder-atlas-intent-test');
  for (const tile of Object.values(state.map.tiles)) {
    tile.wonder = null;
  }
  state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = 'great_volcano';
  state.discoveredWonders = { great_volcano: 'player' };
  state.wonderDiscoverers = { great_volcano: ['player'] };
  state.civilizations.player.visibility = {
    tiles: { '0,0': 'visible' },
  } as VisibilityMap;
  return state;
}

describe('wonder-atlas-intent', () => {
  it('opens the Atlas for a discovered visible natural wonder tile', () => {
    const state = makeState();

    expect(resolveWonderAtlasIntent(state, 'player', { q: 0, r: 0 })).toEqual({
      type: 'open-atlas',
      wonderId: 'great_volcano',
      coord: { q: 0, r: 0 },
    });
  });

  it('does not open the Atlas for a wonder unknown to the viewer', () => {
    const state = makeState();
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    expect(resolveWonderAtlasIntent(state, 'player', { q: 0, r: 0 })).toEqual({ type: 'none' });
  });

  it('does not open the Atlas for unexplored wonder tiles', () => {
    const state = makeState();
    state.civilizations.player.visibility = {
      tiles: { '0,0': 'unexplored' },
    } as VisibilityMap;

    expect(resolveWonderAtlasIntent(state, 'player', { q: 0, r: 0 })).toEqual({ type: 'none' });
  });

  it('opens from last-seen fog when the viewer-safe snapshot contains the discovered wonder', () => {
    const state = makeState();
    state.map.tiles[hexKey({ q: 0, r: 0 })].wonder = null;
    state.civilizations.player.visibility = {
      tiles: { '0,0': 'fog' },
      lastSeen: {
        '0,0': {
          coord: { q: 0, r: 0 },
          terrain: 'volcanic',
          elevation: 'lowland',
          resource: null,
          improvement: 'none',
          improvementTurnsLeft: 0,
          owner: null,
          hasRiver: false,
          wonder: 'great_volcano',
        },
      },
    } as VisibilityMap;

    expect(resolveWonderAtlasIntent(state, 'player', { q: 0, r: 0 })).toMatchObject({
      type: 'open-atlas',
      wonderId: 'great_volcano',
    });
  });

  it('normalizes wrapped coordinates before resolving the wonder', () => {
    const state = makeState();
    state.map.wrapsHorizontally = true;
    state.map.width = 4;

    expect(resolveWonderAtlasIntent(state, 'player', { q: 4, r: 0 })).toEqual({
      type: 'open-atlas',
      wonderId: 'great_volcano',
      coord: { q: 0, r: 0 },
    });
  });
});
