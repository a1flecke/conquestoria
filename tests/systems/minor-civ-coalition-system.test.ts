import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { setMinorCivWarState } from '@/systems/minor-civ-actions';
import { processMinorCivCoalitionsTurn } from '@/systems/minor-civ-coalition-system';

// A coalition went from 'forming' to 'active' when it declared war, and nothing ever moved it on. A
// coalition whose war was over stayed 'active' forever: its members stayed mobilized, could never
// graduate, and no new coalition could form against the same civilization.
function activeCoalition(seed: string): { state: GameState; members: string[] } {
  let state = createNewGame(undefined, seed, 'small');
  const members = Object.keys(state.minorCivs).filter(id => !state.minorCivs[id].isDestroyed).slice(0, 2);
  if (members.length < 2) throw new Error('need two city-states');
  state = {
    ...state,
    minorCivCoalitions: {
      'coalition-1': {
        id: 'coalition-1', targetCivId: 'player', memberIds: members,
        status: 'forming', createdTurn: state.turn, updatedTurn: state.turn, cooldownUntilTurn: state.turn,
      },
    },
  };
  state = processMinorCivCoalitionsTurn(state);
  expect(state.minorCivCoalitions?.['coalition-1'].status).toBe('active');
  return { state, members };
}

describe('a coalition whose war is over cools', () => {
  it('stays active while any member is still at war with its target', () => {
    let { state, members } = activeCoalition('coalition-still-at-war');
    state = setMinorCivWarState(state, 'player', members[0], false).state;

    state = processMinorCivCoalitionsTurn(state);

    expect(state.minorCivCoalitions?.['coalition-1'].status).toBe('active');
  });

  it('cools once its target is at peace with every member', () => {
    let { state, members } = activeCoalition('coalition-peace');
    for (const member of members) state = setMinorCivWarState(state, 'player', member, false).state;

    state = processMinorCivCoalitionsTurn(state);

    expect(state.minorCivCoalitions?.['coalition-1']).toMatchObject({ status: 'cooling', updatedTurn: state.turn });
  });

  it('cools when the members still at war have been destroyed', () => {
    let { state, members } = activeCoalition('coalition-destroyed');
    state = setMinorCivWarState(state, 'player', members[0], false).state;
    state = { ...state, minorCivs: { ...state.minorCivs, [members[1]]: { ...state.minorCivs[members[1]], isDestroyed: true } } };

    state = processMinorCivCoalitionsTurn(state);

    expect(state.minorCivCoalitions?.['coalition-1'].status).toBe('cooling');
  });

  it('no longer blocks a new coalition against the same civilization', () => {
    let { state, members } = activeCoalition('coalition-reform');
    for (const member of members) state = setMinorCivWarState(state, 'player', member, false).state;
    state = processMinorCivCoalitionsTurn(state);

    const blocking = Object.values(state.minorCivCoalitions ?? {})
      .filter(coalition => coalition.targetCivId === 'player' && (coalition.status === 'forming' || coalition.status === 'active'));
    expect(blocking).toEqual([]);
  });
});
