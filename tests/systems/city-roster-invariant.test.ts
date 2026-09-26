import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import type { GameState, HexCoord } from '@/core/types';
import { getCapitalCityId } from '@/systems/capital-system';
import {
  resolveMajorCityCapture,
  transferCapturedCityOwnership,
} from '@/systems/city-capture-system';
import { eliminateCivilization } from '@/systems/civilization-elimination-system';
import { foundCity } from '@/systems/city-system';
import { foundCityInState } from '@/systems/city-founding-system';
import { hexKey } from '@/systems/hex-utils';
import {
  conquestMinorCiv,
  peacefullyAbsorbMinorCiv,
} from '@/systems/minor-civ-system';
import { applyCitySiegeOutcome } from '@/systems/city-siege-system';
import { canFoundCityAt } from '@/systems/city-territory-system';
import { applyCityStep } from '@/testing/scenario-steps/city-step';
import { normalizeLoadedState } from '@/storage/save-manager';
import {
  createBreakawayFromCity,
  tryReabsorbBreakaway,
} from '@/systems/breakaway-system';
import { assertCityRosters } from '../helpers/save-state-invariants';

// #997 — every city-lifecycle transition must leave `city.owner` and the
// major-civ `cities` rosters in agreement. The invariant itself is owned by
// `assertCityRosters` (tests/helpers/save-state-invariants.ts), also run by
// the save-compat matrix and the AI-playability fixture. This file proves each
// real production transition preserves it: valid state in, transition,
// still-valid state out plus the expected roster contents. There is no
// liberation path on current main (no `liberat*` transition exists in src),
// so none is covered here.

const mkCounters = () => ({ nextUnitId: 100, nextCityId: 100, nextCampId: 100, nextQuestId: 100 });

function placeCity(state: GameState, id: string, owner: string, position: HexCoord): void {
  const city = {
    ...foundCity(owner, position, state.map, mkCounters()),
    id,
    name: id,
    owner,
    position: { ...position },
  };
  state.cities[id] = city;
  state.civilizations[owner].cities.push(id);
  for (const coord of city.ownedTiles) {
    const tile = state.map.tiles[hexKey(coord)];
    if (tile) tile.owner = owner;
  }
}

/** Fresh game with exactly two major-owned cities: `c-player` and `c-ai`. */
function twoCityState(seed: string): { state: GameState; playerCityId: string; aiCityId: string } {
  const state = createNewGame(undefined, seed, 'small');
  // Fresh majors hold no cities (only settlers); leave minor-civ cities alone —
  // wiping `state.cities` would orphan every minorCiv.cityId pointer.
  state.civilizations.player.diplomacy.relationships['ai-1'] = 0;
  state.civilizations['ai-1'].diplomacy.relationships.player = 0;
  placeCity(state, 'c-player', 'player', { q: 1, r: 0 });
  placeCity(state, 'c-ai', 'ai-1', { q: 5, r: 4 });
  assertCityRosters(state);
  return { state, playerCityId: 'c-player', aiCityId: 'c-ai' };
}

describe('#997 founding keeps owner and roster in agreement', () => {
  it('foundCityInState rosters the new city exactly once under its founder', () => {
    const state = createNewGame(undefined, '997-founding', 'small');
    const settlerId = state.civilizations.player.units
      .find(unitId => state.units[unitId]?.type === 'settler')!;
    const { state: next, cityId } = foundCityInState(state, settlerId, new EventBus());

    expect(next.cities[cityId].owner).toBe('player');
    expect(next.civilizations.player.cities.filter(id => id === cityId)).toHaveLength(1);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('a scenario city step rosters the new city under its civ', () => {
    const { state } = twoCityState('997-scenario-step');
    const position = Object.values(state.map.tiles)
      .map(tile => tile.coord)
      .find(coord => canFoundCityAt(state, coord))!;
    const next = applyCityStep(state, { kind: 'city', civId: 'player', position });
    const placedId = next.civilizations.player.cities[next.civilizations.player.cities.length - 1];

    expect(next.cities[placedId].owner).toBe('player');
    expect(() => assertCityRosters(next)).not.toThrow();
  });
});

describe('#997 capture keeps owner and roster in agreement', () => {
  it('occupying a city moves it across rosters exactly once', () => {
    const { state, aiCityId } = twoCityState('997-capture-occupy');
    const next = resolveMajorCityCapture(state, aiCityId, 'player', 'occupy', state.turn).state;

    expect(next.cities[aiCityId].owner).toBe('player');
    expect(next.civilizations.player.cities.filter(id => id === aiCityId)).toHaveLength(1);
    expect(next.civilizations['ai-1'].cities).not.toContain(aiCityId);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('razing a city deletes it and scrubs the loser roster', () => {
    const { state, aiCityId } = twoCityState('997-capture-raze');
    const next = resolveMajorCityCapture(state, aiCityId, 'player', 'raze', state.turn).state;

    expect(next.cities[aiCityId]).toBeUndefined();
    expect(next.civilizations['ai-1'].cities).not.toContain(aiCityId);
    expect(next.civilizations.player.cities).not.toContain(aiCityId);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('transferCapturedCityOwnership moves the roster entry without duplicating it', () => {
    const { state, aiCityId } = twoCityState('997-transfer');
    const next = transferCapturedCityOwnership(state, aiCityId, 'player', state.turn);

    expect(next.cities[aiCityId].owner).toBe('player');
    expect(next.civilizations.player.cities.filter(id => id === aiCityId)).toHaveLength(1);
    expect(next.civilizations['ai-1'].cities).not.toContain(aiCityId);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('capturing a capital hands capital status to the next owned city; the captor capital is untouched', () => {
    const { state } = twoCityState('997-capital');
    placeCity(state, 'c-ai-second', 'ai-1', { q: 6, r: 5 });
    // ai-1 roster is now ['c-ai', 'c-ai-second']: c-ai is the capital.
    expect(getCapitalCityId(state, 'ai-1')).toBe('c-ai');
    const playerCapitalBefore = getCapitalCityId(state, 'player');

    const next = resolveMajorCityCapture(state, 'c-ai', 'player', 'occupy', state.turn).state;

    expect(next.civilizations['ai-1'].cities).toEqual(['c-ai-second']);
    expect(getCapitalCityId(next, 'ai-1')).toBe('c-ai-second');
    expect(getCapitalCityId(next, 'player')).toBe(playerCapitalBefore);
    expect(() => assertCityRosters(next)).not.toThrow();
  });
});

describe('#997 breakaway and reabsorption keep owner and roster in agreement', () => {
  it('createBreakawayFromCity moves the city into the new civ roster', () => {
    const { state, aiCityId } = twoCityState('997-breakaway');
    const next = createBreakawayFromCity(state, aiCityId, new EventBus());
    const breakawayId = `breakaway-${aiCityId}`;

    expect(next.cities[aiCityId].owner).toBe(breakawayId);
    expect(next.civilizations[breakawayId].cities).toEqual([aiCityId]);
    expect(next.civilizations['ai-1'].cities).not.toContain(aiCityId);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('tryReabsorbBreakaway returns every breakaway city to the origin roster and removes the civ', () => {
    const { state, aiCityId } = twoCityState('997-reabsorb');
    const seceded = createBreakawayFromCity(state, aiCityId, new EventBus());
    const breakawayId = `breakaway-${aiCityId}`;
    seceded.civilizations['ai-1'].gold = 500;
    seceded.civilizations['ai-1'].diplomacy.relationships[breakawayId] = 80;

    const next = tryReabsorbBreakaway(seceded, 'ai-1', breakawayId);

    expect(next.cities[aiCityId].owner).toBe('ai-1');
    expect(next.civilizations['ai-1'].cities).toContain(aiCityId);
    expect(next.civilizations[breakawayId]).toBeUndefined();
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('recapturing a breakaway city restores the origin roster entry exactly once', () => {
    const { state, aiCityId } = twoCityState('997-reconquer');
    const seceded = createBreakawayFromCity(state, aiCityId, new EventBus());
    const next = resolveMajorCityCapture(seceded, aiCityId, 'ai-1', 'occupy', seceded.turn).state;

    expect(next.cities[aiCityId].owner).toBe('ai-1');
    expect(next.civilizations['ai-1'].cities.filter(id => id === aiCityId)).toHaveLength(1);
    expect(() => assertCityRosters(next)).not.toThrow();
  });
});

describe('#997 minor-civ conquest and absorption keep owner and roster in agreement', () => {
  function freshMinor(state: GameState): string {
    const mcId = Object.keys(state.minorCivs).find(id => !state.minorCivs[id].isDestroyed)!;
    assertCityRosters(state);
    return mcId;
  }

  it('conquestMinorCiv transfers the city into the conqueror roster', () => {
    const state = createNewGame(undefined, '997-conquest', 'small');
    const mcId = freshMinor(state);
    const mcCityId = state.minorCivs[mcId].cityId;

    const { state: next, conquered } = conquestMinorCiv(state, mcId, 'player');

    expect(conquered).toBe(true);
    expect(next.cities[mcCityId].owner).toBe('player');
    expect(next.civilizations.player.cities).toContain(mcCityId);
    expect(next.minorCivs[mcId].isDestroyed).toBe(true);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('peacefullyAbsorbMinorCiv transfers the city into the new owner roster', () => {
    const state = createNewGame(undefined, '997-absorb', 'small');
    const mcId = freshMinor(state);
    const mcCityId = state.minorCivs[mcId].cityId;

    const { state: next, absorbed } = peacefullyAbsorbMinorCiv(state, mcId, 'ai-1');

    expect(absorbed).toBe(true);
    expect(next.cities[mcCityId].owner).toBe('ai-1');
    expect(next.civilizations['ai-1'].cities).toContain(mcCityId);
    expect(next.minorCivs[mcId].isDestroyed).toBe(true);
    expect(() => assertCityRosters(next)).not.toThrow();
  });
});

describe('#997 destruction and elimination keep owner and roster in agreement', () => {
  it('applyCitySiegeOutcome destroyed removes the city and its roster entry', () => {
    const { state, aiCityId } = twoCityState('997-siege');
    const next = applyCitySiegeOutcome(state, aiCityId, {
      hpLost: 100, newHp: 0, outcome: 'destroyed', goldLost: 0,
    });

    expect(next.cities[aiCityId]).toBeUndefined();
    expect(next.civilizations['ai-1'].cities).not.toContain(aiCityId);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('capturing the last city of a unitless civ eliminates it with empty rosters', () => {
    const { state, aiCityId } = twoCityState('997-eliminate');
    for (const unitId of state.civilizations['ai-1'].units) delete state.units[unitId];
    state.civilizations['ai-1'].units = [];

    const next = resolveMajorCityCapture(state, aiCityId, 'player', 'occupy', state.turn).state;

    expect(next.civilizations['ai-1'].isEliminated).toBe(true);
    expect(next.civilizations['ai-1'].cities).toEqual([]);
    expect(Object.values(next.cities).some(city => city.owner === 'ai-1')).toBe(false);
    expect(() => assertCityRosters(next)).not.toThrow();
  });

  it('eliminateCivilization on an assetless civ leaves empty rosters', () => {
    const { state } = twoCityState('997-eliminate-direct');
    const stripped: GameState = {
      ...state,
      cities: Object.fromEntries(Object.entries(state.cities).filter(([, city]) => city.owner !== 'ai-1')),
      units: Object.fromEntries(Object.entries(state.units).filter(([, unit]) => unit.owner !== 'ai-1')),
      civilizations: {
        ...state.civilizations,
        'ai-1': { ...state.civilizations['ai-1'], cities: [], units: [] },
      },
    };
    const result = eliminateCivilization(stripped, 'ai-1', 'player');

    expect(result.eliminated).toBe(true);
    if (result.eliminated) {
      expect(result.state.civilizations['ai-1'].cities).toEqual([]);
      expect(() => assertCityRosters(result.state)).not.toThrow();
    }
  });
});

describe('#997 save/load preserves owner-roster agreement', () => {
  it('normalizeLoadedState after a capture leaves a valid roster', () => {
    const { state, aiCityId } = twoCityState('997-load');
    const captured = resolveMajorCityCapture(state, aiCityId, 'player', 'occupy', state.turn).state;
    const reloaded = normalizeLoadedState(captured);

    expect(reloaded.cities[aiCityId].owner).toBe('player');
    expect(() => assertCityRosters(reloaded)).not.toThrow();
  });
});
