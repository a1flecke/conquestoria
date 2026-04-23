import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { resolveSelectedUnitTapIntent } from '@/input/selected-unit-tap-intent';

function makeTapAssaultFixture(): GameState {
  const state = createNewGame(undefined, 'tap-assault', 'small');
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

  state.cities.enemyCity = {
    ...foundCity('ai-1', { q: 1, r: 0 }, state.map),
    id: 'enemyCity',
    name: 'Enemy City',
    owner: 'ai-1',
    position: { q: 1, r: 0 },
    population: 4,
    ownedTiles: [{ q: 1, r: 0 }],
  };
  state.civilizations['ai-1'].cities = ['enemyCity'];

  return state;
}

describe('selected-unit-tap-intent', () => {
  it('returns assault-city for an ungarrisoned enemy major city in movement range', () => {
    const state = makeTapAssaultFixture();

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'assault-city', cityId: 'enemyCity' });
  });
});
