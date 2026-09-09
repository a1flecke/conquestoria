import { describe, it, expect } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import {
  assertBilateralWar,
  assertCityRosters,
  assertUnitRosters,
  assertCargoReciprocity,
  assertAirBaseIntegrity,
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

  it('throws on a war with a major civ that does not exist', () => {
    const state = freshState('inv-war-ghost');
    state.civilizations.player.diplomacy.atWarWith = ['ai-ghost'];
    expect(() => assertBilateralWar(state)).toThrow(/unknown major civ.*ai-ghost/s);
  });

  it('#995: does not flag a legitimate minor-civ (city-state) war id', () => {
    const state = freshState('inv-war-minor');
    state.civilizations.player.diplomacy.atWarWith = ['mc-sparta'];
    expect(() => assertBilateralWar(state)).not.toThrow();
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

/**
 * Synthesize a valid transport + aboard-cargo group on a fresh game: `unit-ship`
 * is a `transport` hull (capacity 2) carrying `unit-cargo`, with `unit-cargo2`
 * and `unit-cargo3` free on the same tile. All player-owned, all on one tile.
 * Returns their ids so a test can then corrupt exactly one facet.
 */
function loadedTransportState(seed: string): {
  state: GameState; shipId: string; cargoId: string; cargo2Id: string; cargo3Id: string;
} {
  const state = freshState(seed);
  const anchor = Object.values(state.units).find(u => u.owner === 'player')!;
  const mk = (id: string, type: Unit['type'], extra: Partial<Unit> = {}): void => {
    state.units[id] = {
      ...anchor, id, type, owner: 'player',
      position: { ...anchor.position }, transportId: undefined, cargoUnitIds: undefined,
      ...extra,
    };
    state.civilizations.player.units.push(id);
  };
  mk('unit-ship', 'transport', { cargoUnitIds: ['unit-cargo'] });
  mk('unit-cargo', 'warrior', { transportId: 'unit-ship' });
  mk('unit-cargo2', 'warrior');
  mk('unit-cargo3', 'warrior');
  return { state, shipId: 'unit-ship', cargoId: 'unit-cargo', cargo2Id: 'unit-cargo2', cargo3Id: 'unit-cargo3' };
}

describe('#1000 assertCargoReciprocity', () => {
  it('passes for a fresh game (no transports loaded)', () => {
    expect(() => assertCargoReciprocity(freshState('inv-cargo-ok'))).not.toThrow();
  });

  it('passes for a correctly linked transport/cargo pair', () => {
    const { state } = loadedTransportState('inv-cargo-linked');
    expect(() => assertCargoReciprocity(state)).not.toThrow();
  });

  it('throws when a transport lists cargo that does not point back', () => {
    const { state, cargoId } = loadedTransportState('inv-cargo-oneway');
    state.units[cargoId] = { ...state.units[cargoId], transportId: undefined };
    expect(() => assertCargoReciprocity(state)).toThrow(/does not point back|transportId/s);
  });

  it('throws when cargo names a transport that does not exist', () => {
    const state = freshState('inv-cargo-ghostship');
    const b = Object.keys(state.units)[0];
    state.units[b] = { ...state.units[b], transportId: 'unit-ghostship' };
    expect(() => assertCargoReciprocity(state)).toThrow(/unit-ghostship.* does not exist/s);
  });

  it('throws when a transport lists a nonexistent cargo unit', () => {
    const { state, shipId } = loadedTransportState('inv-cargo-ghostcargo');
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-ghostcargo'] };
    expect(() => assertCargoReciprocity(state)).toThrow(/unit-ghostcargo.* does not exist/s);
  });

  it('throws when a non-transport unit carries a cargo manifest', () => {
    const { state, shipId } = loadedTransportState('inv-cargo-nontransport');
    state.units[shipId] = { ...state.units[shipId], type: 'warrior' };
    expect(() => assertCargoReciprocity(state)).toThrow(/is not a naval transport/s);
  });

  it('throws when cargo is owned by a different civ than its transport', () => {
    const { state, cargoId } = loadedTransportState('inv-cargo-owner');
    state.units[cargoId] = { ...state.units[cargoId], owner: 'ai-1' };
    expect(() => assertCargoReciprocity(state)).toThrow(/owned by ai-1/s);
  });

  it('throws when total cargo size exceeds the transport capacity', () => {
    const { state, shipId, cargoId, cargo2Id, cargo3Id } = loadedTransportState('inv-cargo-capacity');
    // transport capacity is 2; three size-1 land units overfill it.
    for (const id of [cargo2Id, cargo3Id]) {
      state.units[id] = { ...state.units[id], transportId: shipId };
    }
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: [cargoId, cargo2Id, cargo3Id] };
    expect(() => assertCargoReciprocity(state)).toThrow(/over its capacity/s);
  });

  it('throws when the same unit is listed by two transports', () => {
    const { state, cargoId, cargo2Id } = loadedTransportState('inv-cargo-twoships');
    state.units[cargo2Id] = { ...state.units[cargo2Id], type: 'transport', cargoUnitIds: [cargoId] };
    // cargo still points at ship 1; ship 2 also lists it
    expect(() => assertCargoReciprocity(state)).toThrow(/listed by two transports/s);
  });

  it('throws when cargo has drifted off its transport tile', () => {
    const { state, cargoId } = loadedTransportState('inv-cargo-drift');
    const c = state.units[cargoId];
    state.units[cargoId] = { ...c, position: { q: c.position.q + 3, r: c.position.r } };
    expect(() => assertCargoReciprocity(state)).toThrow(/its transport .* is at/s);
  });

  it('throws when a transport is carried as cargo by another transport', () => {
    const { state, shipId, cargoId } = loadedTransportState('inv-cargo-nested');
    state.units[cargoId] = { ...state.units[cargoId], type: 'transport' };
    expect(() => assertCargoReciprocity(state)).toThrow(/carries another transport/s);
  });

  it('reports an unknown-type cargo cleanly instead of throwing a raw TypeError', () => {
    const { state, shipId, cargoId } = loadedTransportState('inv-cargo-badtype');
    state.units[cargoId] = { ...state.units[cargoId], type: 'not_a_real_unit' as GameState['units'][string]['type'] };
    expect(() => assertCargoReciprocity(state)).toThrow(/cargo-reciprocity invariant violated/s);
    expect(() => assertCargoReciprocity(state)).toThrow(/of unknown type "not_a_real_unit"/s);
  });
});

/**
 * Put `count` player biplanes onto a fresh `carrier` hull (deck capacity 2),
 * all on the carrier's tile. Returns the carrier id and the aircraft ids.
 */
function carrierAirState(seed: string, count: number): { state: GameState; carrierId: string; aircraftIds: string[] } {
  const state = freshState(seed);
  const playerUnits = Object.values(state.units).filter(u => u.owner === 'player');
  const carrier = playerUnits[0];
  state.units[carrier.id] = { ...carrier, type: 'carrier' };
  const aircraftIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `unit-air-${i}`;
    state.units[id] = {
      ...playerUnits[1],
      id,
      type: 'biplane',
      owner: 'player',
      position: { ...carrier.position },
      airBase: { kind: 'carrier', unitId: carrier.id },
    };
    state.civilizations.player.units.push(id);
    aircraftIds.push(id);
  }
  return { state, carrierId: carrier.id, aircraftIds };
}

describe('#1000 assertAirBaseIntegrity', () => {
  it('passes for a fresh game (no based aircraft)', () => {
    expect(() => assertAirBaseIntegrity(freshState('inv-air-ok'))).not.toThrow();
  });

  it('passes for aircraft based on a carrier within deck capacity', () => {
    const { state } = carrierAirState('inv-air-carrier-ok', 2);
    expect(() => assertAirBaseIntegrity(state)).not.toThrow();
  });

  it('passes for aircraft based at a friendly city with an airfield', () => {
    const { state, cityId } = stateWithPlayerCity('inv-air-city-ok');
    state.cities[cityId] = { ...state.cities[cityId], buildings: [...state.cities[cityId].buildings, 'airfield'] };
    const src = Object.values(state.units).find(u => u.owner === 'player')!;
    state.units['unit-city-air'] = {
      ...src, id: 'unit-city-air', type: 'biplane', position: { ...state.cities[cityId].position },
      airBase: { kind: 'city', cityId },
    };
    state.civilizations.player.units.push('unit-city-air');
    expect(() => assertAirBaseIntegrity(state)).not.toThrow();
  });

  it('throws when the carrier host does not exist', () => {
    const { state, carrierId, aircraftIds } = carrierAirState('inv-air-ghost-carrier', 1);
    delete state.units[carrierId];
    state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== carrierId);
    expect(() => assertAirBaseIntegrity(state)).toThrow(new RegExp(`${aircraftIds[0]}.* does not exist`, 's'));
  });

  it('throws when the air-base host is not a carrier-capable hull', () => {
    const { state, carrierId } = carrierAirState('inv-air-noncarrier', 1);
    state.units[carrierId] = { ...state.units[carrierId], type: 'destroyer' };
    expect(() => assertAirBaseIntegrity(state)).toThrow(/is not a carrier-capable hull/s);
  });

  it('throws when an aircraft and its carrier have different owners', () => {
    const { state, carrierId } = carrierAirState('inv-air-owner', 1);
    state.units[carrierId] = { ...state.units[carrierId], owner: 'ai-1' };
    expect(() => assertAirBaseIntegrity(state)).toThrow(/is based on carrier .* owned by ai-1/s);
  });

  it('throws when an aircraft has drifted off its carrier tile', () => {
    const { state, aircraftIds } = carrierAirState('inv-air-drift', 1);
    const a = state.units[aircraftIds[0]];
    state.units[aircraftIds[0]] = { ...a, position: { q: a.position.q + 2, r: a.position.r } };
    expect(() => assertAirBaseIntegrity(state)).toThrow(/but its carrier .* is at/s);
  });

  it('throws when a carrier deck holds more aircraft than its capacity', () => {
    const { state } = carrierAirState('inv-air-overcap', 3); // deck capacity is 2
    expect(() => assertAirBaseIntegrity(state)).toThrow(/over its capacity of 2/s);
  });

  it('throws when the base city does not exist', () => {
    const state = freshState('inv-air-ghost-city');
    const src = Object.values(state.units).find(u => u.owner === 'player')!;
    state.units['unit-air-nocity'] = { ...src, id: 'unit-air-nocity', type: 'biplane', airBase: { kind: 'city', cityId: 'city-ghost' } };
    state.civilizations.player.units.push('unit-air-nocity');
    expect(() => assertAirBaseIntegrity(state)).toThrow(/city "city-ghost" which does not exist/s);
  });

  it('reports a non-carrier hull cleanly without dereferencing a missing definition', () => {
    // host type is real (destroyer) → getAirBaseCapacity is safe; the `continue`
    // still matters for a garbage type, which this asserts stays an InvariantError.
    const { state, carrierId } = carrierAirState('inv-air-garbagehull', 1);
    state.units[carrierId] = { ...state.units[carrierId], type: 'not_a_real_hull' as GameState['units'][string]['type'] };
    expect(() => assertAirBaseIntegrity(state)).toThrow(/air-base-integrity invariant violated/s);
    expect(() => assertAirBaseIntegrity(state)).toThrow(/is not a carrier-capable hull/s);
  });

  it('reports a malformed airBase value (null / string) cleanly instead of a raw TypeError', () => {
    const state = freshState('inv-air-malformed');
    const src = Object.values(state.units).find(u => u.owner === 'player')!;
    state.units['unit-air-null'] = { ...src, id: 'unit-air-null', type: 'biplane' };
    state.civilizations.player.units.push('unit-air-null');
    (state.units['unit-air-null'] as { airBase: unknown }).airBase = null;
    expect(() => assertAirBaseIntegrity(state)).toThrow(/malformed air base value/s);
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
    expect(() => assertNoEliminatedCivEntities(state)).toThrow(/\[cities\] city .* is still owned by eliminated civ "ai-1"/s);
  });

  it('throws when an eliminated civ still owns a unit', () => {
    const state = freshState('inv-elim-unit');
    state.civilizations['ai-1'].isEliminated = true;
    expect(() => assertNoEliminatedCivEntities(state)).toThrow(/\[units\] unit .* is still owned by eliminated civ "ai-1"/s);
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
    expect(() => assertNoEliminatedCivEntities(state)).toThrow(/still at war with eliminated civ "ai-1"/s);
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

  it('SAVE_STATE_INVARIANTS lists exactly the six documented checks', () => {
    expect(SAVE_STATE_INVARIANTS.map(inv => inv.name).sort()).toEqual([
      'air-base-integrity',
      'bilateral-war',
      'cargo-reciprocity',
      'city-rosters',
      'no-eliminated-civ-entities',
      'unit-rosters',
    ]);
  });
});
