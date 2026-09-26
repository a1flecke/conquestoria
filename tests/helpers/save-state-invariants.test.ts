import { describe, it, expect } from 'vitest';
import type { GameState, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { createUnit } from '@/systems/unit-system';
import { createEmptyPirateState } from '@/core/pirate-state';
import {
  assertBilateralWar,
  assertCityRosters,
  assertUnitRosters,
  assertCargoReciprocity,
  assertAirBaseIntegrity,
  assertVassalageReciprocity,
  assertTreatyReciprocity,
  assertNationalProjectUniqueness,
  assertMarketplaceReferences,
  assertOpponentAIPortfolioIntegrity,
  assertNoIllegalBlockingOccupancy,
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

describe('#1003 assertVassalageReciprocity', () => {
  it('passes for a fresh game (nobody vassalized)', () => {
    expect(() => assertVassalageReciprocity(freshState('inv-vassal-ok'))).not.toThrow();
  });

  it('passes for a correctly reciprocal vassal pair', () => {
    const state = freshState('inv-vassal-bilateral');
    state.civilizations.player.diplomacy.vassalage.overlord = 'ai-1';
    state.civilizations['ai-1'].diplomacy.vassalage.vassals = ['player'];
    expect(() => assertVassalageReciprocity(state)).not.toThrow();
  });

  it('throws on a one-sided overlord (vassal claims an overlord that does not list it back)', () => {
    const state = freshState('inv-vassal-onesided-overlord');
    state.civilizations.player.diplomacy.vassalage.overlord = 'ai-1';
    expect(() => assertVassalageReciprocity(state)).toThrow(/does not list "player" as a vassal/s);
  });

  it('throws on a one-sided vassal (overlord claims a vassal that does not name it back)', () => {
    const state = freshState('inv-vassal-onesided-vassal');
    state.civilizations['ai-1'].diplomacy.vassalage.vassals = ['player'];
    expect(() => assertVassalageReciprocity(state)).toThrow(/does not have "ai-1" as its overlord/s);
  });

  it('throws on self-vassalage', () => {
    const state = freshState('inv-vassal-self');
    state.civilizations.player.diplomacy.vassalage.overlord = 'player';
    expect(() => assertVassalageReciprocity(state)).toThrow(/is its own overlord/s);
  });

  it('throws when an overlord itself has an overlord (vassal-of-a-vassal, not a depth-1 star)', () => {
    const state = freshState('inv-vassal-chain');
    state.civilizations.player.diplomacy.vassalage.overlord = 'ai-1';
    state.civilizations['ai-1'].diplomacy.vassalage.vassals = ['player'];
    state.civilizations['ai-1'].diplomacy.vassalage.overlord = 'ai-2';
    state.civilizations['ai-2'].diplomacy.vassalage.vassals = ['ai-1'];
    expect(() => assertVassalageReciprocity(state)).toThrow(/"ai-1" is an overlord of "player" but itself has an overlord \("ai-2"\)/s);
  });

  it('throws when a vassal has vassals of its own', () => {
    const state = freshState('inv-vassal-hasvassals');
    state.civilizations.player.diplomacy.vassalage.overlord = 'ai-1';
    state.civilizations['ai-1'].diplomacy.vassalage.vassals = ['player'];
    state.civilizations.player.diplomacy.vassalage.vassals = ['ai-2'];
    state.civilizations['ai-2'].diplomacy.vassalage.overlord = 'player';
    expect(() => assertVassalageReciprocity(state)).toThrow(/"player" is a vassal of "ai-1" but itself has vassals: ai-2/s);
  });

  it('throws when overlord is an unknown civ id', () => {
    const state = freshState('inv-vassal-ghost-overlord');
    state.civilizations.player.diplomacy.vassalage.overlord = 'ai-ghost';
    expect(() => assertVassalageReciprocity(state)).toThrow(/unknown civ "ai-ghost"/s);
  });

  it('throws when the vassals list names an unknown civ id', () => {
    const state = freshState('inv-vassal-ghost-vassal');
    state.civilizations['ai-1'].diplomacy.vassalage.vassals = ['ai-ghost'];
    expect(() => assertVassalageReciprocity(state)).toThrow(/unknown civ "ai-ghost"/s);
  });

  it('throws on a duplicated vassal entry', () => {
    const state = freshState('inv-vassal-dup');
    state.civilizations['ai-1'].diplomacy.vassalage.vassals = ['player', 'player'];
    state.civilizations.player.diplomacy.vassalage.overlord = 'ai-1';
    expect(() => assertVassalageReciprocity(state)).toThrow(/duplicate vassal entry "player"/s);
  });
});

describe('#1003 assertTreatyReciprocity', () => {
  it('passes for a fresh game (no treaties)', () => {
    expect(() => assertTreatyReciprocity(freshState('inv-treaty-ok'))).not.toThrow();
  });

  it('passes for a correctly reciprocal treaty pair', () => {
    const state = freshState('inv-treaty-bilateral');
    state.civilizations.player.diplomacy.treaties = [{ type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 }];
    state.civilizations['ai-1'].diplomacy.treaties = [{ type: 'alliance', civA: 'ai-1', civB: 'player', turnsRemaining: -1 }];
    expect(() => assertTreatyReciprocity(state)).not.toThrow();
  });

  it('throws on a one-sided treaty', () => {
    const state = freshState('inv-treaty-onesided');
    state.civilizations.player.diplomacy.treaties = [{ type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 }];
    expect(() => assertTreatyReciprocity(state)).toThrow(/"ai-1" has no matching alliance treaty back to "player"/s);
  });

  it('throws when the two sides disagree on treaty type', () => {
    const state = freshState('inv-treaty-mismatch');
    state.civilizations.player.diplomacy.treaties = [{ type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 }];
    state.civilizations['ai-1'].diplomacy.treaties = [{ type: 'trade_agreement', civA: 'ai-1', civB: 'player', turnsRemaining: -1, goldPerTurn: 2 }];
    expect(() => assertTreatyReciprocity(state)).toThrow(/"ai-1" has no matching alliance treaty back to "player"/s);
  });

  it('throws on a self-treaty', () => {
    const state = freshState('inv-treaty-self');
    state.civilizations.player.diplomacy.treaties = [{ type: 'alliance', civA: 'player', civB: 'player', turnsRemaining: -1 }];
    expect(() => assertTreatyReciprocity(state)).toThrow(/treaty with itself/s);
  });

  it('throws when a treaty names an unknown civ id', () => {
    const state = freshState('inv-treaty-ghost');
    state.civilizations.player.diplomacy.treaties = [{ type: 'alliance', civA: 'player', civB: 'ai-ghost', turnsRemaining: -1 }];
    expect(() => assertTreatyReciprocity(state)).toThrow(/unknown civ "ai-ghost"/s);
  });

  it('throws when a treaty record does not carry its own owner as civA', () => {
    const state = freshState('inv-treaty-wrongcivA');
    state.civilizations.player.diplomacy.treaties = [{ type: 'alliance', civA: 'ai-1', civB: 'player', turnsRemaining: -1 }];
    expect(() => assertTreatyReciprocity(state)).toThrow(/"player" holds a treaty record whose civA is "ai-1", not itself/s);
  });

  it('throws on a duplicated same-type treaty with the same partner', () => {
    const state = freshState('inv-treaty-dup');
    state.civilizations.player.diplomacy.treaties = [
      { type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 },
      { type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 },
    ];
    state.civilizations['ai-1'].diplomacy.treaties = [{ type: 'alliance', civA: 'ai-1', civB: 'player', turnsRemaining: -1 }];
    expect(() => assertTreatyReciprocity(state)).toThrow(/duplicate alliance treaty with "ai-1"/s);
  });

  it('allows two different-type treaties with the same partner', () => {
    const state = freshState('inv-treaty-multitype');
    state.civilizations.player.diplomacy.treaties = [
      { type: 'alliance', civA: 'player', civB: 'ai-1', turnsRemaining: -1 },
      { type: 'trade_agreement', civA: 'player', civB: 'ai-1', turnsRemaining: -1, goldPerTurn: 2 },
    ];
    state.civilizations['ai-1'].diplomacy.treaties = [
      { type: 'alliance', civA: 'ai-1', civB: 'player', turnsRemaining: -1 },
      { type: 'trade_agreement', civA: 'ai-1', civB: 'player', turnsRemaining: -1, goldPerTurn: 2 },
    ];
    expect(() => assertTreatyReciprocity(state)).not.toThrow();
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

/**
 * Lightweight fixture — `assertNationalProjectUniqueness` reads only
 * `civilizations.*.cities` and `cities.*.{owner,buildings,productionQueue}`,
 * so a full `createNewGame` state is unnecessary overhead here; matches the
 * fixture style already used for this same domain in
 * `tests/systems/national-project-system.test.ts`.
 */
function npState(
  civs: Record<string, string[]>,
  cities: Record<string, { owner: string; buildings?: string[]; productionQueue?: string[] }>,
): GameState {
  return {
    civilizations: Object.fromEntries(
      Object.entries(civs).map(([civId, cityIds]) => [civId, { id: civId, cities: cityIds } as any]),
    ),
    cities: Object.fromEntries(
      Object.entries(cities).map(([cityId, c]) => [cityId, {
        id: cityId,
        owner: c.owner,
        buildings: c.buildings ?? [],
        productionQueue: c.productionQueue ?? [],
      } as any]),
    ),
  } as GameState;
}

describe('#1080 assertNationalProjectUniqueness', () => {
  it('passes for a fresh game (no national projects)', () => {
    expect(() => assertNationalProjectUniqueness(freshState('inv-np-ok'))).not.toThrow();
  });

  it('passes when built in exactly one city', () => {
    const state = npState({ p1: ['c1'] }, { c1: { owner: 'p1', buildings: ['sacred_grove'] } });
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });

  it('passes when queued in exactly one city', () => {
    const state = npState({ p1: ['c1'] }, { c1: { owner: 'p1', productionQueue: ['sacred_grove'] } });
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });

  it('throws when built in two owned cities', () => {
    const state = npState(
      { p1: ['c1', 'c2'] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'] }, c2: { owner: 'p1', buildings: ['sacred_grove'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).toThrow(/sacred_grove.*built in multiple cities.*c1.*c2/s);
  });

  it('throws when queued in two owned cities', () => {
    const state = npState(
      { p1: ['c1', 'c2'] },
      { c1: { owner: 'p1', productionQueue: ['sacred_grove'] }, c2: { owner: 'p1', productionQueue: ['sacred_grove'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).toThrow(/sacred_grove.*queued in multiple cities.*c1.*c2/s);
  });

  it('does not flag a same-city built+queued pair as a cross-city violation', () => {
    // Structurally shouldn't happen in live play (a completed item leaves the queue), but if a
    // malformed save carried it, this is a single-city shape, not the empire-uniqueness
    // violation this invariant targets — "queued elsewhere" explicitly excludes a city already
    // counted as "built", so a queue entry sitting alongside its own completed building in the
    // SAME city is out of scope here (a same-city queue/building consistency check, if ever
    // needed, belongs in a different, narrower invariant).
    const state = npState(
      { p1: ['c1'] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'], productionQueue: ['sacred_grove'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });

  it('throws when built in one city and queued in a different city', () => {
    const state = npState(
      { p1: ['c1', 'c2'] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'] }, c2: { owner: 'p1', productionQueue: ['sacred_grove'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).toThrow(/sacred_grove.*already built in c1.*queued in c2/s);
  });

  it('does not flag two different unique projects, each in its own city', () => {
    const state = npState(
      { p1: ['c1', 'c2'] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'] }, c2: { owner: 'p1', buildings: ['tribal_muster_ground'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });

  it('does not flag a non-unique building present in multiple cities', () => {
    const state = npState(
      { p1: ['c1', 'c2'] },
      { c1: { owner: 'p1', buildings: ['granary'] }, c2: { owner: 'p1', buildings: ['granary'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });

  it('allows two different civs to each own the same empire-unique project', () => {
    const state = npState(
      { p1: ['c1'], p2: ['c2'] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'] }, c2: { owner: 'p2', buildings: ['sacred_grove'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });

  it('error message names the civ, the project, and every conflicting city id', () => {
    const state = npState(
      { p1: ['c1', 'c2'] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'] }, c2: { owner: 'p1', buildings: ['sacred_grove'] } },
    );
    let message = '';
    try {
      assertNationalProjectUniqueness(state);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/"p1"/);
    expect(message).toMatch(/"sacred_grove"/);
    expect(message).toMatch(/c1/);
    expect(message).toMatch(/c2/);
  });

  it('ignores a city whose owner disagrees with the civ roster (a #997 finding, not this one)', () => {
    // c2 is listed in p1's roster but its own `.owner` says p2 — city-roster drift, out of
    // this invariant's scope (assertCityRosters catches it). This invariant must not
    // mis-attribute c2's building to p1 just because p1's roster names it.
    const state = npState(
      { p1: ['c1', 'c2'], p2: [] },
      { c1: { owner: 'p1', buildings: ['sacred_grove'] }, c2: { owner: 'p2', buildings: ['sacred_grove'] } },
    );
    expect(() => assertNationalProjectUniqueness(state)).not.toThrow();
  });
});

/** Lightweight fixture for #1083 — only reads `civilizations`, `minorCivs`, `marketplace`. */
function marketState(overrides: {
  civilizations?: Record<string, unknown>;
  minorCivs?: Record<string, unknown>;
  tradeRoutes?: Array<{ id: string; fromCityId: string; toCityId: string; foreignCivId?: string }>;
  purchasedResources?: Array<{ civId: string; resource: string; expiresOnTurn: number }>;
}): GameState {
  return {
    civilizations: overrides.civilizations ?? {},
    minorCivs: overrides.minorCivs ?? {},
    marketplace: {
      prices: {},
      priceHistory: {},
      fashionable: null,
      fashionTurnsLeft: 0,
      tradeRoutes: (overrides.tradeRoutes ?? []) as any,
      purchasedResources: (overrides.purchasedResources ?? []) as any,
    },
  } as GameState;
}

describe('#1083 assertMarketplaceReferences', () => {
  it('is a no-op when there is no marketplace at all', () => {
    expect(() => assertMarketplaceReferences({ civilizations: {}, minorCivs: {} } as GameState)).not.toThrow();
  });

  it('passes for a fresh game (no routes, no purchases)', () => {
    expect(() => assertMarketplaceReferences(freshState('inv-mkt-ok'))).not.toThrow();
  });

  it('passes when a trade route names a real major civ', () => {
    const state = marketState({
      civilizations: { p1: {}, p2: {} },
      tradeRoutes: [{ id: 'route-1', fromCityId: 'c1', toCityId: 'c2', foreignCivId: 'p2' }],
    });
    expect(() => assertMarketplaceReferences(state)).not.toThrow();
  });

  it('passes when a trade route names a real minor civ (city-state destination)', () => {
    const state = marketState({
      civilizations: { p1: {} },
      minorCivs: { 'mc-sparta': {} },
      tradeRoutes: [{ id: 'route-1', fromCityId: 'c1', toCityId: 'c2', foreignCivId: 'mc-sparta' }],
    });
    expect(() => assertMarketplaceReferences(state)).not.toThrow();
  });

  it('passes when a trade route has no foreignCivId (same-civ domestic route)', () => {
    const state = marketState({
      civilizations: { p1: {} },
      tradeRoutes: [{ id: 'route-1', fromCityId: 'c1', toCityId: 'c2' }],
    });
    expect(() => assertMarketplaceReferences(state)).not.toThrow();
  });

  it('throws when a trade route names an unknown foreignCivId', () => {
    const state = marketState({
      civilizations: { p1: {} },
      tradeRoutes: [{ id: 'route-1', fromCityId: 'c1', toCityId: 'c2', foreignCivId: 'ghost-civ' }],
    });
    expect(() => assertMarketplaceReferences(state)).toThrow(/route-1.*ghost-civ.*not a known civ or minor civ/s);
  });

  it('passes when a purchase names a real major civ', () => {
    const state = marketState({
      civilizations: { p1: {} },
      purchasedResources: [{ civId: 'p1', resource: 'iron', expiresOnTurn: 20 }],
    });
    expect(() => assertMarketplaceReferences(state)).not.toThrow();
  });

  it('throws when a purchase names an unknown civId', () => {
    const state = marketState({
      civilizations: { p1: {} },
      purchasedResources: [{ civId: 'ghost-civ', resource: 'iron', expiresOnTurn: 20 }],
    });
    expect(() => assertMarketplaceReferences(state)).toThrow(/purchasedResources.*ghost-civ.*not a known civ/s);
  });

  it('throws when a purchase names a minor civ (purchases are major-civ-only)', () => {
    const state = marketState({
      civilizations: { p1: {} },
      minorCivs: { 'mc-sparta': {} },
      purchasedResources: [{ civId: 'mc-sparta', resource: 'iron', expiresOnTurn: 20 }],
    });
    expect(() => assertMarketplaceReferences(state)).toThrow(/purchasedResources.*mc-sparta.*not a known civ/s);
  });

  it('reports every problem across multiple routes/purchases in one throw', () => {
    const state = marketState({
      civilizations: { p1: {} },
      tradeRoutes: [
        { id: 'route-1', fromCityId: 'c1', toCityId: 'c2', foreignCivId: 'ghost-a' },
        { id: 'route-2', fromCityId: 'c3', toCityId: 'c4', foreignCivId: 'ghost-b' },
      ],
    });
    let message = '';
    try {
      assertMarketplaceReferences(state);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/route-1/);
    expect(message).toMatch(/ghost-a/);
    expect(message).toMatch(/route-2/);
    expect(message).toMatch(/ghost-b/);
  });
});

/** A minimal `AIStrategicPlan`-shaped fixture: the assert only reads `assignedUnitIds`. */
function plan(assignedUnitIds: string[]): unknown {
  return { assignedUnitIds };
}

function portfolioState(overrides: {
  units?: Record<string, { owner: string }>;
  majorCivs?: Record<string, unknown>;
  barbarianHomeCampByUnitId?: Record<string, string>;
}): GameState {
  return {
    units: overrides.units ?? {},
    opponentAI: {
      majorCivs: overrides.majorCivs ?? {},
      barbarianHomeCampByUnitId: overrides.barbarianHomeCampByUnitId ?? {},
    },
  } as unknown as GameState;
}

describe('#1081 assertOpponentAIPortfolioIntegrity', () => {
  it('is a no-op when there is no opponentAI state at all', () => {
    expect(() => assertOpponentAIPortfolioIntegrity({ units: {} } as GameState)).not.toThrow();
  });

  it('passes for a fresh game (no plans yet)', () => {
    expect(() => assertOpponentAIPortfolioIntegrity(freshState('inv-ai-ok'))).not.toThrow();
  });

  it('passes when a primary plan assigns a live unit the civ still owns', () => {
    const state = portfolioState({
      units: { 'unit-1': { owner: 'ai-1' } },
      majorCivs: {
        'ai-1': {
          primaryPlan: plan(['unit-1']),
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: {},
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).not.toThrow();
  });

  it('passes for a unit that is transported cargo but still alive and correctly owned', () => {
    const state = portfolioState({
      units: { 'unit-1': { owner: 'ai-1' } }, // transportId is irrelevant to this invariant
      majorCivs: {
        'ai-1': {
          primaryPlan: plan(['unit-1']),
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: {},
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).not.toThrow();
  });

  it('throws when a primary plan assigns a unit that no longer exists', () => {
    const state = portfolioState({
      units: {},
      majorCivs: {
        'ai-1': {
          primaryPlan: plan(['unit-dead']),
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: {},
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/ai-1.*unit-dead.*does not exist/s);
  });

  it('throws when a defense plan assigns a unit that no longer exists', () => {
    const state = portfolioState({
      units: {},
      majorCivs: {
        'ai-1': {
          primaryPlan: null,
          defensePlansByCityId: { 'city-1': plan(['unit-dead']) },
          upgradeRoutesByUnitId: {},
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/ai-1.*unit-dead.*does not exist/s);
  });

  it('throws when a plan assigns a unit that was captured by another civ (ownership changed, unit still alive)', () => {
    const state = portfolioState({
      units: { 'unit-1': { owner: 'ai-2' } }, // captured away from ai-1
      majorCivs: {
        'ai-1': {
          primaryPlan: plan(['unit-1']),
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: {},
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/ai-1.*unit-1.*now owned by "ai-2"/s);
  });

  it('throws when upgradeRoutesByUnitId references a unit that no longer exists', () => {
    const state = portfolioState({
      units: {},
      majorCivs: {
        'ai-1': {
          primaryPlan: null,
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: { 'unit-dead': { cityId: 'city-1', createdTurn: 1 } },
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/ai-1.*unit-dead.*does not exist/s);
  });

  it('throws when upgradeRoutesByUnitId references a unit captured by another civ', () => {
    const state = portfolioState({
      units: { 'unit-1': { owner: 'ai-2' } },
      majorCivs: {
        'ai-1': {
          primaryPlan: null,
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: { 'unit-1': { cityId: 'city-1', createdTurn: 1 } },
        },
      },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/ai-1.*unit-1.*now owned by "ai-2"/s);
  });

  it('passes for a live barbarianHomeCampByUnitId entry still owned by barbarian', () => {
    const state = portfolioState({
      units: { 'raider-1': { owner: 'barbarian' } },
      barbarianHomeCampByUnitId: { 'raider-1': 'camp-1' },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).not.toThrow();
  });

  it('throws when barbarianHomeCampByUnitId references a dead unit', () => {
    const state = portfolioState({
      units: {},
      barbarianHomeCampByUnitId: { 'raider-dead': 'camp-1' },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/raider-dead.*camp-1.*does not exist/s);
  });

  it('throws when barbarianHomeCampByUnitId references a unit captured away from the barbarians', () => {
    const state = portfolioState({
      units: { 'raider-1': { owner: 'player' } },
      barbarianHomeCampByUnitId: { 'raider-1': 'camp-1' },
    });
    expect(() => assertOpponentAIPortfolioIntegrity(state)).toThrow(/raider-1.*camp-1.*now owned by "player"/s);
  });

  it('reports every problem across multiple plans/civs in one throw', () => {
    const state = portfolioState({
      units: {},
      majorCivs: {
        'ai-1': {
          primaryPlan: plan(['unit-dead-a']),
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: {},
        },
        'ai-2': {
          primaryPlan: plan(['unit-dead-b']),
          defensePlansByCityId: {},
          upgradeRoutesByUnitId: {},
        },
      },
    });
    let message = '';
    try {
      assertOpponentAIPortfolioIntegrity(state);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(/ai-1/);
    expect(message).toMatch(/unit-dead-a/);
    expect(message).toMatch(/ai-2/);
    expect(message).toMatch(/unit-dead-b/);
  });
});

describe('#994 assertNoIllegalBlockingOccupancy', () => {
  it('passes for a fresh game', () => {
    expect(() => assertNoIllegalBlockingOccupancy(freshState('occ-fresh'))).not.toThrow();
  });

  // #843: a unit ending up on a foreign, unallied city's tile is exactly the shape ordinary
  // movement now refuses via getBlockingMapEntityAt — this proves the final-state validator
  // reuses that same canonical predicate rather than re-deriving ownership rules.
  it('throws when a unit sits on a foreign, unallied city tile (#843)', () => {
    const state = freshState('occ-foreign-city');
    const aiSettler = Object.values(state.units).find(u => u.owner === 'ai-1' && u.type === 'settler')!;
    const city = foundCity('ai-1', aiSettler.position, state.map, state.idCounters);
    state.cities[city.id] = city;
    state.civilizations['ai-1'].cities.push(city.id);

    const intruder = createUnit('warrior', 'player', city.position, state.idCounters);
    state.units[intruder.id] = intruder;

    expect(() => assertNoIllegalBlockingOccupancy(state)).toThrow(new RegExp(`${intruder.id}.*foreign-city|foreign-city.*${intruder.id}`, 's'));
  });

  it('does not throw when a unit garrisons its own city', () => {
    const { state, cityId } = stateWithPlayerCity('occ-own-city');
    const city = state.cities[cityId];
    const garrison = createUnit('warrior', 'player', city.position, state.idCounters);
    state.units[garrison.id] = garrison;

    expect(() => assertNoIllegalBlockingOccupancy(state)).not.toThrow();
  });

  // #845: an undefended barbarian camp had zero representation in the movement system before
  // getBlockingMapEntityAt covered it. A unit walking onto (or being spawned onto) one is the
  // same illegal-final-state shape.
  it('throws when a non-barbarian unit sits on a barbarian camp tile (#845)', () => {
    const state = freshState('occ-camp');
    state.barbarianCamps['camp-1'] = { id: 'camp-1', position: { q: 3, r: 3 }, strength: 10, spawnCooldown: 3 };
    const intruder = createUnit('warrior', 'player', { q: 3, r: 3 }, state.idCounters);
    state.units[intruder.id] = intruder;

    expect(() => assertNoIllegalBlockingOccupancy(state)).toThrow(new RegExp(`${intruder.id}.*barbarian-camp|barbarian-camp.*${intruder.id}`, 's'));
  });

  it('does not throw when a barbarian unit sits on its own camp', () => {
    const state = freshState('occ-camp-own');
    state.barbarianCamps['camp-1'] = { id: 'camp-1', position: { q: 3, r: 3 }, strength: 10, spawnCooldown: 3 };
    const raider = createUnit('warrior', 'barbarian', { q: 3, r: 3 }, state.idCounters);
    state.units[raider.id] = raider;

    expect(() => assertNoIllegalBlockingOccupancy(state)).not.toThrow();
  });

  // #965: a pirate faction's coastal-enclave headquarters anchor had zero representation
  // either — a land unit could walk onto (and stack on) it.
  it('throws when a non-pirate unit sits on a pirate coastal-enclave anchor tile (#965)', () => {
    const state = freshState('occ-enclave');
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Salt Reavers', spawnedRound: 1, behavior: 'raiding',
      maritimeStage: 2, notoriety: 2, shipIds: [],
      headquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, integrity: 100, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    const intruder = createUnit('warrior', 'player', { q: 4, r: 4 }, state.idCounters);
    state.units[intruder.id] = intruder;

    expect(() => assertNoIllegalBlockingOccupancy(state)).toThrow(new RegExp(`${intruder.id}.*pirate-enclave|pirate-enclave.*${intruder.id}`, 's'));
  });

  it('does not throw when a pirate unit sits on its own faction enclave', () => {
    const state = freshState('occ-enclave-own');
    state.pirates = createEmptyPirateState();
    state.pirates.factions['pirate-1'] = {
      id: 'pirate-1', name: 'The Salt Reavers', spawnedRound: 1, behavior: 'raiding',
      maritimeStage: 2, notoriety: 2, shipIds: [],
      headquarters: { kind: 'coastal-enclave', position: { q: 4, r: 4 }, integrity: 100, maxIntegrity: 100 },
      tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null,
      transitionGuards: { emittedEventKeys: [] },
    };
    const raider = createUnit('warrior', 'pirate-1', { q: 4, r: 4 }, state.idCounters);
    state.units[raider.id] = raider;

    expect(() => assertNoIllegalBlockingOccupancy(state)).not.toThrow();
  });

  // #970's own bug shape generalized: an executor (airborne landing, transport unload, or any
  // future one) placing a unit on a tile a hostile-owned unit already occupies, bypassing
  // ordinary combat. This is the final-state net for a *fifth* executor with no blocking check.
  it('throws when two units of different owners occupy the same tile', () => {
    const state = freshState('occ-hostile-stack');
    const a = createUnit('warrior', 'player', { q: 1, r: 1 }, state.idCounters);
    const b = createUnit('warrior', 'ai-1', { q: 1, r: 1 }, state.idCounters);
    state.units[a.id] = a;
    state.units[b.id] = b;

    expect(() => assertNoIllegalBlockingOccupancy(state)).toThrow(new RegExp(`${a.id}.*${b.id}|${b.id}.*${a.id}`, 's'));
  });

  it('does not throw when two units of the same owner occupy the same tile', () => {
    const state = freshState('occ-friendly-stack');
    const a = createUnit('warrior', 'player', { q: 1, r: 1 }, state.idCounters);
    const b = createUnit('archer', 'player', { q: 1, r: 1 }, state.idCounters);
    state.units[a.id] = a;
    state.units[b.id] = b;

    expect(() => assertNoIllegalBlockingOccupancy(state)).not.toThrow();
  });

  it('reports every violation, not just the first, in one throw', () => {
    const state = freshState('occ-multi');
    state.barbarianCamps['camp-1'] = { id: 'camp-1', position: { q: 3, r: 3 }, strength: 10, spawnCooldown: 3 };
    const campIntruder = createUnit('warrior', 'player', { q: 3, r: 3 }, state.idCounters);
    state.units[campIntruder.id] = campIntruder;
    const a = createUnit('warrior', 'player', { q: 1, r: 1 }, state.idCounters);
    const b = createUnit('warrior', 'ai-1', { q: 1, r: 1 }, state.idCounters);
    state.units[a.id] = a;
    state.units[b.id] = b;

    let message = '';
    try {
      assertNoIllegalBlockingOccupancy(state);
    } catch (error) {
      message = (error as Error).message;
    }
    expect(message).toMatch(new RegExp(campIntruder.id));
    expect(message).toMatch(new RegExp(a.id));
    expect(message).toMatch(new RegExp(b.id));
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

  it('SAVE_STATE_INVARIANTS lists exactly the twelve documented checks', () => {
    expect(SAVE_STATE_INVARIANTS.map(inv => inv.name).sort()).toEqual([
      'air-base-integrity',
      'bilateral-war',
      'cargo-reciprocity',
      'city-rosters',
      'marketplace-references',
      'national-project-uniqueness',
      'no-eliminated-civ-entities',
      'no-illegal-blocking-occupancy',
      'opponent-ai-portfolio-integrity',
      'treaty-reciprocity',
      'unit-rosters',
      'vassalage-reciprocity',
    ]);
  });
});
