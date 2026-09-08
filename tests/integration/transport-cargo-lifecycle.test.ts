import { describe, expect, it } from 'vitest';
import type { GameState, HexCoord, Unit } from '@/core/types';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';
import { executeUnitMove } from '@/systems/unit-movement-system';
import { loadUnitOntoTransport, unloadUnitFromTransport } from '@/systems/transport-system';
import { removePlayerUnitFromState } from '@/systems/unit-lifecycle-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';

/**
 * #1000 — the transport/cargo dual reference and its position tracking must
 * survive the whole lifecycle: load → sail (cargo tracks the hull) → save/reload
 * → unload → the transport is destroyed with a unit still aboard (co-removal +
 * roster scrub) → reload. `assertSaveStateInvariants` (cargo reciprocity +
 * air-base integrity + the roster/war invariants) is asserted after every step.
 *
 * Deterministic: one seed, one hand-carved coast lane, explicit operations — no
 * AI, no RNG.
 */

function carveCoastLane(state: GameState, from: HexCoord, length: number): HexCoord[] {
  const lane: HexCoord[] = [];
  for (let i = 1; i <= length; i++) {
    const coord = { q: from.q + i, r: from.r };
    state.map.tiles[hexKey(coord)] = {
      coord, terrain: 'coast', elevation: 'lowland', resource: null, improvement: 'none',
      owner: null, improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    lane.push(coord);
  }
  return lane;
}

function addPlayerUnit(state: GameState, id: string, type: Unit['type'], position: HexCoord): Unit {
  const anchor = Object.values(state.units).find(u => u.owner === 'player')!;
  const u: Unit = {
    ...anchor, id, type, owner: 'player', position: { ...position },
    transportId: undefined, cargoUnitIds: undefined, airBase: undefined,
    movementPointsLeft: 6, hasMoved: false, hasActed: false, isResting: false, health: 100,
  };
  state.units[id] = u;
  state.civilizations.player.units.push(id);
  return u;
}

describe('#1000 transport/cargo lifecycle keeps both representations reciprocal', () => {
  it('load → sail → save/reload → unload → destroy-with-cargo → reload', () => {
    let state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 2, seed: 'txp-lifecycle', gameTitle: 'txp' });
    const bus = new EventBus();

    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const origin = { ...settler.position };
    const city = foundCity('player', origin, state.map, { nextUnitId: 5000, nextCityId: 5000, nextCampId: 5000, nextQuestId: 5000 });
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);
    state.map.tiles[hexKey(origin)]!.owner = 'player';
    delete state.units[settler.id];
    state.civilizations.player.units = state.civilizations.player.units.filter(id => id !== settler.id);

    const lane = carveCoastLane(state, origin, 3);
    // A guaranteed-empty land tile adjacent to lane[0] to disembark onto.
    const unloadPad = { q: origin.q + 1, r: origin.r + 1 };
    state.map.tiles[hexKey(unloadPad)] = {
      coord: unloadPad, terrain: 'grassland', elevation: 'lowland', resource: null, improvement: 'none',
      owner: 'player', improvementTurnsLeft: 0, hasRiver: false, wonder: null,
    };
    const transport = addPlayerUnit(state, 'unit-txp', 'transport', lane[0]);
    const rider1 = addPlayerUnit(state, 'unit-rider-1', 'warrior', origin);
    const rider2 = addPlayerUnit(state, 'unit-rider-2', 'warrior', origin);

    assertSaveStateInvariants(state, 'lifecycle: initial');

    // --- Step 1: load rider1 from the coastal city (adjacent to the transport) ---
    const loaded1 = loadUnitOntoTransport(state, rider1.id, transport.id);
    expect(loaded1.ok).toBe(true);
    if (!loaded1.ok) return;
    state = loaded1.state;
    expect(state.units[transport.id].cargoUnitIds).toEqual([rider1.id]);
    expect(state.units[rider1.id].transportId).toBe(transport.id);
    expect(state.units[rider1.id].position).toEqual(state.units[transport.id].position);
    assertSaveStateInvariants(state, 'lifecycle: after load 1');

    // --- Step 2: sail the transport one coast tile; cargo tracks the hull ---
    // `executeUnitMove` mutates the passed state in place and returns move metadata.
    state = { ...state, units: { ...state.units, [transport.id]: { ...state.units[transport.id], movementPointsLeft: 3, hasMoved: false, hasActed: false } } };
    const sailed = executeUnitMove(state, transport.id, lane[1], { actor: 'player', civId: 'player' });
    expect(sailed.ok).toBe(true);
    if (!sailed.ok) return;
    expect(state.units[transport.id].position).toEqual(lane[1]);
    expect(state.units[rider1.id].position).toEqual(lane[1]); // cargo followed
    assertSaveStateInvariants(state, 'lifecycle: after sail');

    // --- Step 3: save + reload mid-voyage ---
    const parsed = parseSaveFile(serializeSaveFile(state));
    if (parsed.status !== 'success') throw new Error(`reload failed: ${parsed.message}`);
    state = parsed.state;
    expect(state.units[transport.id].cargoUnitIds).toEqual([rider1.id]);
    expect(state.units[rider1.id].transportId).toBe(transport.id);
    expect(state.units[rider1.id].position).toEqual(state.units[transport.id].position);
    assertSaveStateInvariants(state, 'lifecycle: after reload');

    // --- Step 4: sail back adjacent to shore, load rider2, unload rider1 onto land ---
    state = { ...state, units: { ...state.units, [transport.id]: { ...state.units[transport.id], movementPointsLeft: 3, hasMoved: false, hasActed: false } } };
    const backHome = executeUnitMove(state, transport.id, lane[0], { actor: 'player', civId: 'player' });
    expect(backHome.ok).toBe(true);
    if (!backHome.ok) return;

    state = { ...state, units: { ...state.units, [rider2.id]: { ...state.units[rider2.id], movementPointsLeft: 2, hasMoved: false, hasActed: false } } };
    const loaded2 = loadUnitOntoTransport(state, rider2.id, transport.id);
    expect(loaded2.ok).toBe(true);
    if (!loaded2.ok) return;
    state = loaded2.state;
    expect(new Set(state.units[transport.id].cargoUnitIds)).toEqual(new Set([rider1.id, rider2.id]));
    assertSaveStateInvariants(state, 'lifecycle: after load 2');

    state = { ...state, units: { ...state.units, [rider1.id]: { ...state.units[rider1.id], movementPointsLeft: 2, hasMoved: false, hasActed: false } } };
    const unloaded = unloadUnitFromTransport(state, transport.id, rider1.id, unloadPad);
    expect(unloaded.ok).toBe(true);
    if (!unloaded.ok) return;
    state = unloaded.state;
    expect(state.units[transport.id].cargoUnitIds).toEqual([rider2.id]);
    expect(state.units[rider1.id].transportId).toBeUndefined();
    expect(state.units[rider1.id].position).toEqual(unloadPad);
    assertSaveStateInvariants(state, 'lifecycle: after unload 1');

    // --- Step 5: the transport is destroyed with rider2 still aboard ---
    state = removePlayerUnitFromState(state, 'player', transport.id, bus);
    expect(state.units[transport.id]).toBeUndefined();
    expect(state.units[rider2.id]).toBeUndefined(); // cascaded
    expect(state.civilizations.player.units).not.toContain(transport.id);
    expect(state.civilizations.player.units).not.toContain(rider2.id);
    expect(state.units[rider1.id]).toBeDefined(); // the one that disembarked survives
    assertSaveStateInvariants(state, 'lifecycle: after transport destroyed with cargo aboard');

    // --- Step 6: final save + reload ---
    const finalParsed = parseSaveFile(serializeSaveFile(state));
    if (finalParsed.status !== 'success') throw new Error(`final reload failed: ${finalParsed.message}`);
    assertSaveStateInvariants(finalParsed.state, 'lifecycle: after final reload');
    expect(finalParsed.state.units[rider1.id]).toBeDefined();
    expect(finalParsed.state.units[transport.id]).toBeUndefined();
    expect(finalParsed.state.units[rider2.id]).toBeUndefined();
  });
});
