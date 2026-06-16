import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState } from '@/core/types';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { resolveSelectedUnitTapIntent } from '@/input/selected-unit-tap-intent';

const mkC = () => ({ nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

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
    ...foundCity('ai-1', { q: 1, r: 0 }, state.map, mkC()),
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
  it('returns confirm-war-city for a neutral major city', () => {
    const state = makeTapAssaultFixture();
    state.civilizations.player.diplomacy.atWarWith = [];
    state.civilizations['ai-1'].diplomacy.atWarWith = [];

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'confirm-war-city', cityId: 'enemyCity', defenderId: 'ai-1' });
  });

  it('returns assault-city for an at-war ungarrisoned major city', () => {
    const state = makeTapAssaultFixture();
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'assault-city', cityId: 'enemyCity' });
  });

  it('returns move for an allied major city', () => {
    const state = makeTapAssaultFixture();
    state.civilizations.player.diplomacy.treaties.push({ type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: 10 });

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 }, [{ q: 1, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });

  it('still asks before entering a major city with only open borders', () => {
    const state = makeTapAssaultFixture();
    state.civilizations.player.diplomacy.treaties.push({ type: 'open_borders', civA: 'player', civB: 'ai-1', turnsRemaining: 10 });

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'confirm-war-city', cityId: 'enemyCity', defenderId: 'ai-1' });
  });

  it('requires war confirmation for a neutral ungarrisoned city-state city', () => {
    const state = makeTapAssaultFixture();
    // Replace the major enemy city at {q:1,r:0} with a city-state city.
    delete state.cities.enemyCity;
    state.civilizations['ai-1'].cities = [];

    state.cities['mc-city'] = {
      ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map, mkC()),
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
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'confirm-war-minor-civ', cityId: 'mc-city', minorCivId: 'mc-warriors' });
  });

  it('returns assault-minor-civ for an ungarrisoned city-state already at war', () => {
    const state = makeTapAssaultFixture();
    delete state.cities.enemyCity;
    state.civilizations['ai-1'].cities = [];
    state.cities['mc-city'] = {
      ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map, mkC()),
      id: 'mc-city', name: 'Warriors Haven', owner: 'mc-warriors', position: { q: 1, r: 0 },
      population: 3, ownedTiles: [{ q: 1, r: 0 }],
    };
    state.minorCivs['mc-warriors'] = {
      id: 'mc-warriors', definitionId: 'warriors', cityId: 'mc-city', units: [],
      diplomacy: createDiplomacyState(Object.keys(state.civilizations), 'mc-warriors', 0),
      activeQuests: {}, chainStatusByCiv: {}, questCooldownUntilByCiv: {}, lastNotifiedStatusByCiv: {},
      isDestroyed: false, garrisonCooldown: 0, lastEraUpgrade: 1,
    };
    state.civilizations.player.diplomacy.atWarWith.push('mc-warriors');
    state.minorCivs['mc-warriors'].diplomacy.atWarWith.push('player');

    expect(resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 })).toEqual({
      kind: 'assault-minor-civ', cityId: 'mc-city', minorCivId: 'mc-warriors',
    });
  });

  it('returns move (not assault-minor-civ) when a garrison occupies the city-state hex', () => {
    const state = makeTapAssaultFixture();
    delete state.cities.enemyCity;
    state.civilizations['ai-1'].cities = [];

    state.cities['mc-city'] = {
      ...foundCity('mc-warriors', { q: 1, r: 0 }, state.map, mkC()),
      id: 'mc-city',
      name: 'Warriors Haven',
      owner: 'mc-warriors',
      position: { q: 1, r: 0 },
      population: 3,
      ownedTiles: [{ q: 1, r: 0 }],
    };
    // Use createUnit so all required Unit fields are populated correctly.
    const garrison = createUnit('warrior', 'mc-warriors', { q: 1, r: 0 }, mkC());
    state.minorCivs['mc-warriors'] = {
      id: 'mc-warriors',
      definitionId: 'warriors',
      cityId: 'mc-city',
      units: [garrison.id],
      diplomacy: createDiplomacyState(Object.keys(state.civilizations), 'mc-warriors', 0),
      activeQuests: {},
      chainStatusByCiv: {},
      questCooldownUntilByCiv: {},
      lastNotifiedStatusByCiv: {},
      isDestroyed: false,
      garrisonCooldown: 0,
      lastEraUpgrade: 1,
    };
    // Put the garrison on the city hex so occupiedByOtherUnit fires.
    state.units[garrison.id] = garrison;

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 });

    expect(intent).toEqual({ kind: 'move' });
  });

  it('returns assault-city when a friendly unit is stacked on the enemy city destination', () => {
    const state = makeTapAssaultFixture();
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    const friendly = createUnit('worker', 'player', { q: 1, r: 0 }, mkC());
    friendly.id = 'friendly-worker';
    state.units[friendly.id] = friendly;
    state.civilizations.player.units.push(friendly.id);

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 }, [{ q: 1, r: 0 }]);

    expect(intent).toEqual({ kind: 'assault-city', cityId: 'enemyCity' });
  });

  it('returns move when the selected unit taps a friendly stack destination with no enemy city', () => {
    const state = makeTapAssaultFixture();
    delete state.cities.enemyCity;
    state.civilizations['ai-1'].cities = [];
    const friendly = createUnit('worker', 'player', { q: 1, r: 0 }, mkC());
    friendly.id = 'friendly-worker';
    state.units[friendly.id] = friendly;
    state.civilizations.player.units.push(friendly.id);

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 }, [{ q: 1, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });

  it('keeps hostile garrisoned cities out of direct city assault intent', () => {
    const state = makeTapAssaultFixture();
    const garrison = createUnit('warrior', 'ai-1', { q: 1, r: 0 }, mkC());
    garrison.id = 'enemy-garrison';
    state.units[garrison.id] = garrison;
    state.civilizations['ai-1'].units.push(garrison.id);

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 1, r: 0 }, [{ q: 1, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });

  it('returns move when a melee unit taps a non-adjacent hostile city inside movement range', () => {
    const state = makeTapAssaultFixture();
    state.cities.enemyCity.position = { q: 2, r: 0 };
    state.cities.enemyCity.ownedTiles = [{ q: 2, r: 0 }];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 2, r: 0 }, [{ q: 1, r: 0 }, { q: 2, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });

  it('returns move when an ordinary archer taps a non-adjacent hostile city', () => {
    const state = makeTapAssaultFixture();
    state.units['unit-1'] = { ...createUnit('archer', 'player', { q: 0, r: 0 }, mkC()), id: 'unit-1', movementPointsLeft: 2 };
    state.cities.enemyCity.position = { q: 2, r: 0 };
    state.cities.enemyCity.ownedTiles = [{ q: 2, r: 0 }];
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];

    const intent = resolveSelectedUnitTapIntent(state, 'unit-1', { q: 2, r: 0 }, [{ q: 1, r: 0 }, { q: 2, r: 0 }]);

    expect(intent).toEqual({ kind: 'move' });
  });

  it('returns move when tapping a friendly-occupied tile in range (stacking regression)', () => {
    const state = createNewGame(undefined, 'stacking-regression', 'small');
    state.currentPlayer = 'player';

    const counters = mkC();
    const movingUnit = createUnit('warrior', 'player', { q: 0, r: 0 }, counters);
    state.units[movingUnit.id] = { ...movingUnit, movementPointsLeft: 2, hasMoved: false };

    const occupant = createUnit('warrior', 'player', { q: 1, r: 0 }, counters);
    state.units[occupant.id] = occupant;

    const intent = resolveSelectedUnitTapIntent(
      state,
      movingUnit.id,
      { q: 1, r: 0 },
      [{ q: 1, r: 0 }],
    );
    expect(intent).toEqual({ kind: 'move' });
  });
});
