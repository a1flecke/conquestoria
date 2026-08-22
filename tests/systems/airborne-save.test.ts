import { describe, expect, it } from 'vitest';
import { executeParadrop, executeAirAssault, getAirAssaultLaunchState } from '@/systems/airborne-system';
import { serializeSaveFile, parseSaveFile } from '@/storage/save-file-transfer';
import { processTurn } from '@/core/turn-manager';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';
import { hexKey } from '@/systems/hex-utils';

describe('paradrop save/load round-trip (#543)', () => {
  it('preserves landed position and lockout through a same-turn save/load, then clears correctly next turn', () => {
    const state = createNewGame('rome', 'paradrop-save-round-trip');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    const city = foundCity('player', startingPosition, state.map, state.idCounters);
    city.buildings = [...city.buildings, 'airfield'];
    state.cities[city.id] = city;
    playerCiv.cities = [city.id];
    state.map.tiles[hexKey(city.position)]!.owner = 'player';

    const paratrooperId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[paratrooperId] = {
      id: paratrooperId, type: 'paratrooper', owner: 'player', position: { ...city.position },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, paratrooperId];

    const destination = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(destination)] = { ...state.map.tiles[hexKey(city.position)]!, coord: destination };
    playerCiv.visibility.tiles[hexKey(destination)] = 'visible';

    const dropped = executeParadrop(state, paratrooperId, destination);
    if (!dropped.ok) throw new Error(`expected ok, got reason: ${(dropped as { reason?: string }).reason}`);

    const serialized = serializeSaveFile(dropped.state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got error: ${parsed.message}`);
    const loaded = parsed.state;

    const unit = loaded.units[paratrooperId]!;
    expect(unit.position).toEqual(destination);
    expect(unit.hasActed).toBe(true);
    expect(unit.movementPointsLeft).toBe(0);

    const nextTurnState = processTurn(loaded, new EventBus());
    const resetUnit = nextTurnState.units[paratrooperId]!;
    expect(resetUnit.hasActed).toBe(false);
    expect(resetUnit.movementPointsLeft).toBeGreaterThan(0);
  });
});

describe('air assault save/load round-trip (#543 Phase 2)', () => {
  it('preserves landed passenger position + lockout AND helicopter lockout through a same-turn save/load, then both clear correctly next turn', () => {
    const state = createNewGame('rome', 'air-assault-save-round-trip');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    const city = foundCity('player', startingPosition, state.map, state.idCounters);
    city.buildings = [...city.buildings, 'helicopter_base'];
    state.cities[city.id] = city;
    playerCiv.cities = [city.id];
    state.map.tiles[hexKey(city.position)]!.owner = 'player';

    const passengerId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[passengerId] = {
      id: passengerId, type: 'infantry', owner: 'player', position: { ...city.position },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, passengerId];
    const heliId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[heliId] = {
      id: heliId, type: 'attack_helicopter', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      airBase: { kind: 'city', cityId: city.id },
    };
    playerCiv.units = [...playerCiv.units, heliId];

    const destination = { q: city.position.q + 1, r: city.position.r };
    state.map.tiles[hexKey(destination)] = { ...state.map.tiles[hexKey(city.position)]!, coord: destination };
    playerCiv.visibility.tiles[hexKey(destination)] = 'visible';

    const dropped = executeAirAssault(state, passengerId, destination);
    if (!dropped.ok) throw new Error(`expected ok, got reason: ${(dropped as { reason?: string }).reason}`);

    const serialized = serializeSaveFile(dropped.state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got error: ${parsed.message}`);
    const loaded = parsed.state;

    const passenger = loaded.units[passengerId]!;
    expect(passenger.position).toEqual(destination);
    expect(passenger.hasActed).toBe(true);
    expect(passenger.movementPointsLeft).toBe(0);
    const helicopter = loaded.units[heliId]!;
    expect(helicopter.hasActed).toBe(true);
    expect(helicopter.movementPointsLeft).toBe(0);

    const nextTurnState = processTurn(loaded, new EventBus());
    const resetPassenger = nextTurnState.units[passengerId]!;
    const resetHelicopter = nextTurnState.units[heliId]!;
    expect(resetPassenger.hasActed).toBe(false);
    expect(resetPassenger.movementPointsLeft).toBeGreaterThan(0);
    expect(resetHelicopter.hasActed).toBe(false);
    expect(resetHelicopter.movementPointsLeft).toBeGreaterThan(0);
  });

  it('a save created as if before this feature existed (no airAssault/airAssaultPassengerEligible on any saved data -- these are UNIT_DEFINITIONS fields, not Unit instance fields) loads and works immediately with zero migration', () => {
    const state = createNewGame('rome', 'air-assault-pre-feature-save');
    const playerCiv = state.civilizations.player!;
    const startingUnitId = playerCiv.units[0]!;
    const startingPosition = state.units[startingUnitId]!.position;

    const city = foundCity('player', startingPosition, state.map, state.idCounters);
    city.buildings = [...city.buildings, 'helicopter_base'];
    state.cities[city.id] = city;
    playerCiv.cities = [city.id];
    state.map.tiles[hexKey(city.position)]!.owner = 'player';

    // A plain Unit record shaped exactly like any other unit already
    // persisted in an old save -- no new field added to the instance,
    // proving the capability comes entirely from static UNIT_DEFINITIONS.
    const passengerId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[passengerId] = {
      id: passengerId, type: 'infantry', owner: 'player', position: { ...city.position },
      movementPointsLeft: 2, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    playerCiv.units = [...playerCiv.units, passengerId];
    const heliId = `unit-${state.idCounters.nextUnitId++}`;
    state.units[heliId] = {
      id: heliId, type: 'attack_helicopter', owner: 'player', position: { ...city.position },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      airBase: { kind: 'city', cityId: city.id },
    };
    playerCiv.units = [...playerCiv.units, heliId];

    const serialized = serializeSaveFile(state);
    const parsed = parseSaveFile(serialized);
    if (parsed.status !== 'success') throw new Error(`expected successful parse, got error: ${parsed.message}`);
    const loaded = parsed.state;

    expect(getAirAssaultLaunchState(loaded, passengerId)).toEqual({ ok: true, helicopterId: heliId });
  });
});
