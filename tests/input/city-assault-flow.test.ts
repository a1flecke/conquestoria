import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import {
  beginPlayerCityAssaultChoice,
  finalizePlayerCityAssaultChoice,
  shouldPromptForPlayerCityCapture,
} from '@/input/city-assault-flow';

function makePlayerAssaultState({ population }: { population: number }): GameState {
  const state = createNewGame(undefined, 'player-assault', 'small');
  state.currentPlayer = 'player';
  const attacker = Object.values(state.units).find(unit => unit.owner === 'player' && unit.type === 'warrior');
  if (!attacker) {
    throw new Error('missing player attacker');
  }

  state.units['unit-1'] = {
    ...attacker,
    id: 'unit-1',
    owner: 'player',
    position: { q: 0, r: 0 },
    movementPointsLeft: 2,
    hasMoved: false,
  };
  state.civilizations.player.units = ['unit-1'];

  state.cities.athens = {
    ...foundCity('ai-1', { q: 1, r: 0 }, state.map),
    id: 'athens',
    name: 'Athens',
    owner: 'ai-1',
    position: { q: 1, r: 0 },
    population,
    ownedTiles: [{ q: 1, r: 0 }],
  };
  state.civilizations['ai-1'].cities = ['athens'];

  return state;
}

describe('city-assault-flow', () => {
  it('begins a pending player choice by moving onto a size-2 city and finalizes occupy in place', () => {
    const state = makePlayerAssaultState({ population: 4 });

    const begun = beginPlayerCityAssaultChoice(state, 'unit-1', 'athens');
    const result = finalizePlayerCityAssaultChoice(begun.state, begun.pending, 'occupy', begun.state.turn);

    expect(begun.pending.occupiedPopulation).toBe(2);
    expect(begun.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
    expect(begun.state.units['unit-1'].movementPointsLeft).toBe(0);
    expect(result.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
    expect(result.state.units['unit-1'].movementPointsLeft).toBe(0);
    expect(result.state.cities.athens.owner).toBe('player');
  });

  it('begins a pending player choice by moving onto a size-2 city and finalizes raze in place', () => {
    const state = makePlayerAssaultState({ population: 4 });

    const begun = beginPlayerCityAssaultChoice(state, 'unit-1', 'athens');
    const result = finalizePlayerCityAssaultChoice(begun.state, begun.pending, 'raze', begun.state.turn);

    expect(result.state.units['unit-1'].position).toEqual({ q: 1, r: 0 });
    expect(result.state.units['unit-1'].movementPointsLeft).toBe(0);
    expect(result.state.cities.athens).toBeUndefined();
  });

  it('keeps population-1 player captures on the choice path so major cities can be occupied', () => {
    const state = makePlayerAssaultState({ population: 1 });

    expect(shouldPromptForPlayerCityCapture(state.cities.athens)).toBe(true);

    const begun = beginPlayerCityAssaultChoice(state, 'unit-1', 'athens');
    const result = finalizePlayerCityAssaultChoice(begun.state, begun.pending, 'occupy', begun.state.turn);

    expect(begun.pending.occupiedPopulation).toBe(1);
    expect(result.outcome).toBe('occupied');
    expect(result.state.cities.athens).toMatchObject({
      owner: 'player',
      population: 1,
    });
  });
});
