import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  assertBilateralWar,
  assertCityRosters,
  assertUnitRosters,
  assertCargoReciprocity,
  assertNoEliminatedCivEntities,
  assertSaveStateInvariants,
  SAVE_STATE_INVARIANTS,
} from './save-state-invariants';

/**
 * #1006 — the shared cross-system validators the save-compatibility matrix
 * asserts after every migrate → turn → save → reload. These are deliberately
 * minimal (structural reciprocity only); the dedicated invariant issues
 * (#995 war, #997 rosters, #1000 cargo, #1001 eliminated civs) will make each
 * one exhaustive/property-based. This file pins that they catch the concrete
 * corruption shapes the migration matrix exists to guard against.
 */

function freshState(seed: string): GameState {
  return createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 2, seed, gameTitle: seed });
}

/** A fresh game only has minor-civ cities; found one for `player` so major-civ roster checks have something to bite on. */
function stateWithPlayerCity(seed: string): { state: GameState; cityId: string } {
  const state = freshState(seed);
  const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
  const city = foundCity('player', settler.position, state.map, { nextUnitId: 999, nextCityId: 999, nextCampId: 999, nextQuestId: 999 });
  state.cities[city.id] = city;
  state.civilizations.player.cities.push(city.id);
  return { state, cityId: city.id };
}

describe('#1006 assertBilateralWar', () => {
  it('passes for a fresh game (nobody at war)', () => {
    expect(() => assertBilateralWar(freshState('inv-war-ok'))).not.toThrow();
  });

  it('passes when a war is recorded on both sides', () => {
    const state = freshState('inv-war-bilateral');
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    expect(() => assertBilateralWar(state)).not.toThrow();
  });

  it('throws on a one-sided war', () => {
    const state = freshState('inv-war-onesided');
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    expect(() => assertBilateralWar(state)).toThrow(/one-sided war.*player.*ai-1/s);
  });

  it('throws on a duplicated atWarWith entry', () => {
    const state = freshState('inv-war-dup');
    state.civilizations.player.diplomacy.atWarWith = ['ai-1', 'ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    expect(() => assertBilateralWar(state)).toThrow(/duplicate.*ai-1/s);
  });

  it('throws on a war with a civ that does not exist', () => {
    const state = freshState('inv-war-ghost');
    state.civilizations.player.diplomacy.atWarWith = ['ai-ghost'];
    expect(() => assertBilateralWar(state)).toThrow(/unknown civ.*ai-ghost/s);
  });

  it('throws on self-war', () => {
    const state = freshState('inv-war-self');
    state.civilizations.player.diplomacy.atWarWith = ['player'];
    expect(() => assertBilateralWar(state)).toThrow(/at war with itself.*player/s);
  });
});

describe('#1006 assertCityRosters', () => {
  it('passes for a fresh game', () => {
    expect(() => assertCityRosters(freshState('inv-city-ok'))).not.toThrow();
  });

  it('throws when a city is missing from its owner roster', () => {
    const { state, cityId } = stateWithPlayerCity('inv-city-missing');
    state.civilizations.player.cities = state.civilizations.player.cities.filter(id => id !== cityId);
    expect(() => assertCityRosters(state)).toThrow(/city .*not in .* roster/s);
  });

  it('throws when a civ roster names a city it does not own', () => {
    const { state, cityId } = stateWithPlayerCity('inv-city-wrongowner');
    state.cities[cityId].owner = 'ai-2'; // player roster still names it, owner now ai-2
    expect(() => assertCityRosters(state)).toThrow(/its owner is "ai-2"/s);
  });

  it('throws when a civ roster names a nonexistent city', () => {
    const state = freshState('inv-city-ghost');
    state.civilizations.player.cities.push('city-ghost');
    expect(() => assertCityRosters(state)).toThrow(/city-ghost.* does not exist/s);
  });

  it('accepts a minor-civ-owned city (owner is in state.minorCivs, not state.civilizations)', () => {
    // Fresh games place city-states; the check must not flag their cities.
    const state = freshState('inv-city-minor');
    expect(Object.values(state.cities).some(c => c.owner.startsWith('mc-'))).toBe(true);
    expect(() => assertCityRosters(state)).not.toThrow();
  });
});

describe('#1006 assertUnitRosters', () => {
  it('passes for a fresh game', () => {
    expect(() => assertUnitRosters(freshState('inv-unit-ok'))).not.toThrow();
  });

  it('throws when a unit is missing from its owner roster', () => {
    const state = freshState('inv-unit-missing');
    const unitId = Object.keys(state.units)[0];
    const owner = state.units[unitId].owner;
    state.civilizations[owner].units = state.civilizations[owner].units.filter(id => id !== unitId);
    expect(() => assertUnitRosters(state)).toThrow(/unit .*not in .* roster/s);
  });

  it('throws when a civ roster names a nonexistent unit', () => {
    const state = freshState('inv-unit-ghost');
    state.civilizations.player.units.push('unit-ghost');
    expect(() => assertUnitRosters(state)).toThrow(/unit-ghost.* does not exist/s);
  });

  it('ignores non-roster owners like barbarian/pirate/beasts', () => {
    const state = freshState('inv-unit-nonmajor');
    const unitId = state.civilizations.player.units[0];
    state.units[unitId] = { ...state.units[unitId], owner: 'barbarian' };
    state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== unitId);
    expect(() => assertUnitRosters(state)).not.toThrow();
  });

  it('checks minor-civ unit rosters too', () => {
    const state = freshState('inv-unit-minor');
    const mcId = Object.keys(state.minorCivs)[0];
    state.minorCivs[mcId].units.push('unit-mc-ghost');
    expect(() => assertUnitRosters(state)).toThrow(/unit-mc-ghost.* does not exist/s);
  });
});

describe('#1006 assertCargoReciprocity', () => {
  it('passes for a fresh game (no transports loaded)', () => {
    expect(() => assertCargoReciprocity(freshState('inv-cargo-ok'))).not.toThrow();
  });

  it('passes for a correctly linked transport/cargo pair', () => {
    const state = freshState('inv-cargo-linked');
    const [a, b] = Object.keys(state.units);
    state.units[a] = { ...state.units[a], cargoUnitIds: [b] };
    state.units[b] = { ...state.units[b], transportId: a };
    expect(() => assertCargoReciprocity(state)).not.toThrow();
  });

  it('throws when a carrier lists cargo that does not point back', () => {
    const state = freshState('inv-cargo-oneway');
    const [a, b] = Object.keys(state.units);
    state.units[a] = { ...state.units[a], cargoUnitIds: [b] };
    expect(() => assertCargoReciprocity(state)).toThrow(/does not point back|transportId/s);
  });

  it('throws when cargo names a transport that does not exist', () => {
    const state = freshState('inv-cargo-ghostship');
    const b = Object.keys(state.units)[0];
    state.units[b] = { ...state.units[b], transportId: 'unit-ghostship' };
    expect(() => assertCargoReciprocity(state)).toThrow(/unit-ghostship.* does not exist/s);
  });

  it('throws when a carrier lists a nonexistent cargo unit', () => {
    const state = freshState('inv-cargo-ghostcargo');
    const a = Object.keys(state.units)[0];
    state.units[a] = { ...state.units[a], cargoUnitIds: ['unit-ghostcargo'] };
    expect(() => assertCargoReciprocity(state)).toThrow(/unit-ghostcargo.* does not exist/s);
  });
});

describe('#1006 assertNoEliminatedCivEntities', () => {
  it('passes for a fresh game (nobody eliminated)', () => {
    expect(() => assertNoEliminatedCivEntities(freshState('inv-elim-ok'))).not.toThrow();
  });

  it('throws when an eliminated civ still owns a city', () => {
    const state = freshState('inv-elim-city');
    state.civilizations['ai-1'].isEliminated = true;
    // ai-1 still has its starting-derived cities/units from createNewGame's first turn?
    // createNewGame gives settlers, not cities, so give it one explicitly.
    const cityId = Object.keys(state.cities)[0];
    state.cities[cityId] = { ...state.cities[cityId], owner: 'ai-1' };
    state.civilizations['ai-1'].cities = [cityId];
    expect(() => assertNoEliminatedCivEntities(state)).toThrow(/eliminated civ .*ai-1.* still owns/s);
  });

  it('throws when an eliminated civ still owns a unit', () => {
    const state = freshState('inv-elim-unit');
    state.civilizations['ai-1'].isEliminated = true;
    expect(() => assertNoEliminatedCivEntities(state)).toThrow(/eliminated civ .*ai-1.* still owns/s);
  });

  it('throws when another civ is still at war with an eliminated civ', () => {
    const state = freshState('inv-elim-war');
    // Strip ai-1's entities so the only complaint is the dangling war.
    for (const id of state.civilizations['ai-1'].units) delete state.units[id];
    state.civilizations['ai-1'].units = [];
    state.civilizations['ai-1'].cities = [];
    state.civilizations['ai-1'].isEliminated = true;
    state.civilizations.player.diplomacy.atWarWith = ['ai-1'];
    state.civilizations['ai-1'].diplomacy.atWarWith = ['player'];
    expect(() => assertNoEliminatedCivEntities(state)).toThrow(/eliminated civ .*ai-1.* still .*war/s);
  });
});

describe('#1006 assertSaveStateInvariants (aggregate)', () => {
  it('passes for a fresh solo game', () => {
    expect(() => assertSaveStateInvariants(freshState('inv-agg-solo'))).not.toThrow();
  });

  it('runs every registered invariant and names all failures in one throw', () => {
    const state = freshState('inv-agg-multi');
    state.civilizations.player.diplomacy.atWarWith = ['ai-1']; // one-sided war
    state.civilizations.player.units.push('unit-ghost');        // roster ghost

    let message = '';
    try {
      assertSaveStateInvariants(state);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/one-sided war/);
    expect(message).toMatch(/unit-ghost/);
  });

  it('SAVE_STATE_INVARIANTS lists exactly the five documented checks', () => {
    expect(SAVE_STATE_INVARIANTS.map(inv => inv.name).sort()).toEqual([
      'bilateral-war',
      'cargo-reciprocity',
      'city-rosters',
      'no-eliminated-civ-entities',
      'unit-rosters',
    ]);
  });
});
