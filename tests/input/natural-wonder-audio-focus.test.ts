import { describe, expect, it } from 'vitest';
import { createNewGame } from '../../src/core/game-state';
import type { GameState, VisibilityMap } from '../../src/core/types';
import { resolveNaturalWonderAudioFocus } from '../../src/input/natural-wonder-audio-focus';
import { hexKey } from '../../src/systems/hex-utils';

function stateWithWonder(): GameState {
  const state = createNewGame(undefined, 'natural-wonder-audio-focus-test');
  for (const tile of Object.values(state.map.tiles)) tile.wonder = null;
  const coord = { q: 0, r: 0 };
  state.map.tiles[hexKey(coord)].wonder = 'great_volcano';
  state.discoveredWonders.great_volcano = 'player';
  state.wonderDiscoverers.great_volcano = ['player'];
  state.civilizations.player.visibility = {
    tiles: { [hexKey(coord)]: 'visible' },
  } as VisibilityMap;
  return state;
}

describe('resolveNaturalWonderAudioFocus', () => {
  it('allows audio for live visible discovered natural wonder tiles', () => {
    const state = stateWithWonder();

    expect(resolveNaturalWonderAudioFocus(state, 'player', { q: 0, r: 0 })).toEqual({
      wonderId: 'great_volcano',
    });
  });

  it('denies audio for discovered last-seen wonders that are not currently visible', () => {
    const state = stateWithWonder();
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

    expect(resolveNaturalWonderAudioFocus(state, 'player', { q: 0, r: 0 })).toBeNull();
  });

  it('denies audio when the viewer has not discovered the wonder', () => {
    const state = stateWithWonder();
    state.wonderDiscoverers.great_volcano = ['ai-1'];

    expect(resolveNaturalWonderAudioFocus(state, 'player', { q: 0, r: 0 })).toBeNull();
  });
});
