import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
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

  it('returns assault-minor-civ for an ungarrisoned city-state city in movement range', () => {
    const state = makeTapAssaultFixture();
    // Replace the major enemy city at {q:1,r:0} with a city-state city.
    delete state.cities.enemyCity;
    state.civilizations['ai-1'].cities = [];

    state.cities['mc-city'] = {
      ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map),
      id: 'mc-city',
      name: 'Warriors Haven',
      owner: 'mc-warriors',
      position: { q: 1, r: 0 },
      population: 3,
      ownedTiles: [{ q: 1, r: 0 }],
    };
    state.minorCivs['mc-warriors'] = {
      id: 'mc-warriors',
      definitionId: 'warriors',
      cityId: 'mc-city',
      units: [],
      diplomacy: createDiplomacyState(Object.keys(state.civilizations), 'mc-warriors', 0),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'assault-minor-civ', cityId: 'mc-city', minorCivId: 'mc-warriors' });
  });

  it('returns move (not assault-minor-civ) when a garrison occupies the city-state hex', () => {
    const state = makeTapAssaultFixture();
    delete state.cities.enemyCity;
    state.civilizations['ai-1'].cities = [];

    state.cities['mc-city'] = {
      ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map),
      id: 'mc-city',
      name: 'Warriors Haven',
      owner: 'mc-warriors',
      position: { q: 1, r: 0 },
      population: 3,
      ownedTiles: [{ q: 1, r: 0 }],
    };
    // Use createUnit so all required Unit fields are populated correctly.
    const garrison = createUnit('warrior', 'mc-warriors', { q: 1, r: 0 });
    state.minorCivs['mc-warriors'] = {
      id: 'mc-warriors',
      definitionId: 'warriors',
      cityId: 'mc-city',
      units: [garrison.id],
      diplomacy: createDiplomacyState(Object.keys(state.civilizations), 'mc-warriors', 0),
      activeQuests: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };
    // Put the garrison on the city hex so occupiedByOtherUnit fires.
    state.units[garrison.id] = garrison;

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'move' });
  });
});
