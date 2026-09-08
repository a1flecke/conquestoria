import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import type { GameState, Unit } from '@/core/types';
import { normalizeCargoReciprocity } from '@/storage/migrations/steps/cargo-reciprocity';
import { normalizeLoadedState } from '@/storage/save-manager';
import { assertAirBaseIntegrity, assertCargoReciprocity, assertUnitRosters } from '../helpers/save-state-invariants';

/**
 * #1000 — the two transport/aircraft representations and the repair that scrubs
 * hand-edited corruption in each:
 *
 *  - naval cargo is a DUAL reference (`transport.cargoUnitIds[]` ⇔
 *    `cargo.transportId`); a rejected rider becomes a free land unit;
 *  - carrier/city air basing is a DERIVED roster (`airBase` ref only); an
 *    aircraft whose base is gone is removed, matching `resolveAirBaseLoss`.
 *
 * The invariant validators are owned here (`assertCargoReciprocity`,
 * `assertAirBaseIntegrity` in tests/helpers/save-state-invariants.ts is the
 * shared surface, also run by the save-compat matrix and the AI-playability
 * fixture). `normalizeCargoReciprocity` must be a no-op on every save the game
 * itself wrote and must leave the state passing both validators afterward.
 */

function newGame(seed: string): GameState {
  return createNewGame({ civType: 'generic', seed, mapSize: 'small', opponentCount: 2, gameTitle: seed });
}

/** Add a fully-specified synthetic player unit, cloning a real one for the boilerplate fields. */
function addUnit(state: GameState, id: string, overrides: Partial<Unit>): Unit {
  const anchor = Object.values(state.units).find(u => u.owner === 'player')!;
  const u: Unit = {
    ...anchor, id, owner: 'player', transportId: undefined, cargoUnitIds: undefined, airBase: undefined,
    position: { ...anchor.position }, ...overrides,
  };
  state.units[id] = u;
  if (!state.civilizations.player.units.includes(id)) state.civilizations.player.units.push(id);
  return u;
}

/** transport `unit-ship` (cap 2) carrying `unit-cargo`; `unit-free` idle on the same tile. */
function transportGroup(seed: string): { state: GameState; shipId: string; cargoId: string; freeId: string } {
  const state = newGame(seed);
  addUnit(state, 'unit-ship', { type: 'transport', cargoUnitIds: ['unit-cargo'] });
  addUnit(state, 'unit-cargo', { type: 'warrior', transportId: 'unit-ship' });
  addUnit(state, 'unit-free', { type: 'warrior' });
  return { state, shipId: 'unit-ship', cargoId: 'unit-cargo', freeId: 'unit-free' };
}

/** carrier `unit-cv` (deck 2) hosting `count` biplanes on its tile. */
function carrierGroup(seed: string, count: number): { state: GameState; carrierId: string; airIds: string[] } {
  const state = newGame(seed);
  addUnit(state, 'unit-cv', { type: 'carrier' });
  const airIds: string[] = [];
  for (let i = 0; i < count; i++) {
    const id = `unit-air-${i}`;
    addUnit(state, id, { type: 'biplane', airBase: { kind: 'carrier', unitId: 'unit-cv' } });
    airIds.push(id);
  }
  return { state, carrierId: 'unit-cv', airIds };
}

describe('#1000 normalizeCargoReciprocity — no-op on well-formed state', () => {
  it('returns the same reference for a fresh game', () => {
    const state = newGame('cr-fresh');
    expect(normalizeCargoReciprocity(state)).toBe(state);
  });

  it('returns the same reference for a correctly-loaded transport', () => {
    const { state } = transportGroup('cr-loaded-noop');
    expect(() => assertCargoReciprocity(state)).not.toThrow();
    expect(normalizeCargoReciprocity(state)).toBe(state);
  });

  it('returns the same reference for a correctly-based carrier air wing', () => {
    const { state } = carrierGroup('cr-carrier-noop', 2);
    expect(() => assertAirBaseIntegrity(state)).not.toThrow();
    expect(normalizeCargoReciprocity(state)).toBe(state);
  });
});

describe('#1000 normalizeCargoReciprocity — naval cargo (dual reference)', () => {
  it('drops a dangling cargoUnitIds entry', () => {
    const { state, shipId } = transportGroup('cr-dangling-cargo');
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-cargo', 'unit-ghost'] };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toEqual(['unit-cargo']);
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('clears a one-sided transportId that no manifest lists', () => {
    const { state, freeId } = transportGroup('cr-onesided-back');
    state.units[freeId] = { ...state.units[freeId], transportId: 'unit-ship' };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[freeId].transportId).toBeUndefined();
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('rebuilds a missing back-pointer from the manifest', () => {
    const { state, cargoId } = transportGroup('cr-missing-back');
    state.units[cargoId] = { ...state.units[cargoId], transportId: undefined };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[cargoId].transportId).toBe('unit-ship');
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('trims the manifest tail that exceeds capacity, freeing the trimmed unit', () => {
    const { state, shipId, freeId } = transportGroup('cr-overcap');
    addUnit(state, 'unit-cargo2', { type: 'warrior', transportId: 'unit-ship' });
    state.units[freeId] = { ...state.units[freeId], transportId: 'unit-ship' };
    // capacity 2, three size-1 riders listed
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-cargo', 'unit-cargo2', freeId] };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toEqual(['unit-cargo', 'unit-cargo2']);
    expect(out.units[freeId].transportId).toBeUndefined(); // trimmed rider is now free, not deleted
    expect(out.units[freeId]).toBeDefined();
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('drops a wrong-owner rider from the manifest', () => {
    const { state, shipId, cargoId } = transportGroup('cr-owner');
    state.units[cargoId] = { ...state.units[cargoId], owner: 'ai-1' };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toEqual([]);
    expect(out.units[cargoId].transportId).toBeUndefined();
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('clears a manifest that a non-transport unit is carrying', () => {
    const { state, shipId } = transportGroup('cr-nontransport');
    state.units[shipId] = { ...state.units[shipId], type: 'warrior' };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toBeUndefined();
    expect(out.units['unit-cargo'].transportId).toBeUndefined();
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('dedupes a repeated manifest entry', () => {
    const { state, shipId } = transportGroup('cr-dupe');
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-cargo', 'unit-cargo'] };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toEqual(['unit-cargo']);
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('keeps a unit listed by two transports on the first only', () => {
    const { state, shipId, freeId } = transportGroup('cr-twoships');
    state.units[freeId] = { ...state.units[freeId], type: 'transport', cargoUnitIds: ['unit-cargo'] };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toEqual(['unit-cargo']);
    expect(out.units[freeId].cargoUnitIds).toEqual([]);
    expect(out.units['unit-cargo'].transportId).toBe(shipId);
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('snaps a drifted rider back onto its transport tile', () => {
    const { state, cargoId, shipId } = transportGroup('cr-drift');
    const c = state.units[cargoId];
    state.units[cargoId] = { ...c, position: { q: c.position.q + 4, r: c.position.r - 2 } };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[cargoId].position).toEqual(out.units[shipId].position);
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('drops a transport listed as another transport\'s cargo', () => {
    const { state, shipId } = transportGroup('cr-nested');
    addUnit(state, 'unit-ship2', { type: 'transport' });
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-cargo', 'unit-ship2'] };
    state.units['unit-ship2'] = { ...state.units['unit-ship2'], transportId: shipId };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[shipId].cargoUnitIds).toEqual(['unit-cargo']);
    expect(out.units['unit-ship2'].transportId).toBeUndefined();
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });
});

describe('#1000 normalizeCargoReciprocity — carrier / city air basing (derived roster)', () => {
  it('removes an aircraft whose carrier host is gone, and scrubs its owner roster', () => {
    const { state, carrierId, airIds } = carrierGroup('cr-air-ghost', 1);
    delete state.units[carrierId];
    state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== carrierId);
    const out = normalizeCargoReciprocity(state);
    expect(out.units[airIds[0]]).toBeUndefined();
    expect(out.civilizations.player.units).not.toContain(airIds[0]);
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });

  it('removes an aircraft based on a non-carrier hull', () => {
    const { state, carrierId, airIds } = carrierGroup('cr-air-noncarrier', 1);
    state.units[carrierId] = { ...state.units[carrierId], type: 'destroyer' };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[airIds[0]]).toBeUndefined();
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });

  it('removes an aircraft whose carrier belongs to another owner', () => {
    const { state, carrierId, airIds } = carrierGroup('cr-air-owner', 1);
    state.units[carrierId] = { ...state.units[carrierId], owner: 'ai-1' };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[airIds[0]]).toBeUndefined();
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });

  it('removes the lowest-id excess when a carrier deck is over capacity', () => {
    const { state, airIds } = carrierGroup('cr-air-overcap', 3); // deck capacity 2
    const out = normalizeCargoReciprocity(state);
    const survivors = airIds.filter(id => out.units[id] !== undefined);
    expect(survivors).toEqual([airIds[0], airIds[1]]);
    expect(out.units[airIds[2]]).toBeUndefined();
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });

  it('snaps a drifted aircraft back onto its carrier tile', () => {
    const { state, carrierId, airIds } = carrierGroup('cr-air-drift', 1);
    const a = state.units[airIds[0]];
    state.units[airIds[0]] = { ...a, position: { q: a.position.q + 3, r: a.position.r } };
    const out = normalizeCargoReciprocity(state);
    expect(out.units[airIds[0]].position).toEqual(out.units[carrierId].position);
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });

  it('removes an aircraft whose base city does not exist', () => {
    const state = newGame('cr-air-ghost-city');
    addUnit(state, 'unit-cityair', { type: 'biplane', airBase: { kind: 'city', cityId: 'city-ghost' } });
    const out = normalizeCargoReciprocity(state);
    expect(out.units['unit-cityair']).toBeUndefined();
    expect(out.civilizations.player.units).not.toContain('unit-cityair');
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });
});

describe('#1000 normalizeCargoReciprocity — tolerates hand-edited junk without crashing', () => {
  it('drops an unknown-type cargo unit from the manifest (never sizes it)', () => {
    const { state, shipId } = transportGroup('cr-junk-type');
    addUnit(state, 'unit-bogus', { type: 'not_a_real_unit' as Unit['type'], transportId: shipId });
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-cargo', 'unit-bogus'] };
    let out!: GameState;
    expect(() => { out = normalizeCargoReciprocity(state); }).not.toThrow();
    expect(out.units[shipId].cargoUnitIds).toEqual(['unit-cargo']);
    expect(out.units['unit-bogus']).toBeDefined();          // kept as a free unit
    expect(out.units['unit-bogus'].transportId).toBeUndefined();
    expect(() => assertCargoReciprocity(out)).not.toThrow();
  });

  it('normalises a null / string / unknown-kind airBase to undefined, keeping the unit', () => {
    const state = newGame('cr-junk-airbase');
    addUnit(state, 'unit-nullbase', { type: 'warrior' });
    addUnit(state, 'unit-strbase', { type: 'warrior' });
    addUnit(state, 'unit-weirdkind', { type: 'warrior' });
    (state.units['unit-nullbase'] as { airBase: unknown }).airBase = null;
    (state.units['unit-strbase'] as { airBase: unknown }).airBase = 'somewhere';
    (state.units['unit-weirdkind'] as { airBase: unknown }).airBase = { kind: 'banana' };
    let out!: GameState;
    expect(() => { out = normalizeCargoReciprocity(state); }).not.toThrow();
    for (const id of ['unit-nullbase', 'unit-strbase', 'unit-weirdkind']) {
      expect(out.units[id]).toBeDefined();
      expect(out.units[id].airBase).toBeUndefined();
    }
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });

  it('scrubs a removed aircraft from a minor-civ roster, not just a major-civ one', () => {
    const state = newGame('cr-minorciv-air');
    const mcId = Object.keys(state.minorCivs)[0];
    const anchor = Object.values(state.units).find(u => u.owner === 'player')!;
    state.units['unit-mc-air'] = {
      ...anchor, id: 'unit-mc-air', owner: mcId, transportId: undefined, cargoUnitIds: undefined,
      type: 'biplane', position: { ...anchor.position }, airBase: { kind: 'carrier', unitId: 'unit-ghost-cv' },
    };
    state.minorCivs[mcId].units.push('unit-mc-air');
    const out = normalizeCargoReciprocity(state);
    expect(out.units['unit-mc-air']).toBeUndefined();
    expect(out.minorCivs[mcId].units).not.toContain('unit-mc-air');
    expect(() => assertUnitRosters(out)).not.toThrow();
    expect(() => assertAirBaseIntegrity(out)).not.toThrow();
  });
});

describe('#1000 normalizeCargoReciprocity — runs in the load pipeline', () => {
  it('a corrupt persisted save is reciprocal again after normalizeLoadedState', () => {
    const { state, shipId, freeId } = transportGroup('cr-pipeline');
    state.units[shipId] = { ...state.units[shipId], cargoUnitIds: ['unit-cargo', 'unit-ghost'] };
    state.units[freeId] = { ...state.units[freeId], transportId: 'unit-ship' }; // one-sided back-ref
    const loaded = normalizeLoadedState(JSON.parse(JSON.stringify(state)) as GameState);
    expect(() => assertCargoReciprocity(loaded)).not.toThrow();
    expect(() => assertAirBaseIntegrity(loaded)).not.toThrow();
    expect(loaded.units[shipId].cargoUnitIds).toEqual(['unit-cargo']);
    expect(loaded.units[freeId].transportId).toBeUndefined();
  });
});
