import { describe, expect, it } from 'vitest';
import type { Unit } from '@/core/types';
import { resolveMajorCityCapture, transferCapturedCityOwnership } from '@/systems/city-capture-system';
import { foundCity } from '@/systems/city-lifecycle';
import { EventBus } from '@/core/event-bus';
import { hexDistance, hexKey, hexNeighbors } from '@/systems/hex-utils';
import { executeSettlement } from '@/systems/settlement-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { assertSaveStateInvariants } from '../helpers/save-state-invariants';
import { buildBaselineSave } from '../storage/fixtures/save-compat/baseline';

/**
 * A city can change hands without a battle: a peace settlement cedes it, a spy's flip_loyalty
 * mission turns it, a religion's loyalty pull defects it. All three go through
 * transferCapturedCityOwnership. A military capture first needs an empty city, and it resolves the
 * city's air base; a peaceful transfer can happen with the old owner's units still inside.
 */
function cededCityWithOccupants(seed: string) {
  const baseline = buildBaselineSave(seed);
  const state = baseline.state;
  const cityId = baseline.aiCityId;
  const city = state.cities[cityId];
  const counters = state.idCounters;
  // The ceding civ keeps another city, so losing this one does not eliminate it.
  const elsewhere = Object.values(state.map.tiles).find(tile => tile.terrain === 'grassland'
    && Object.values(state.cities).every(other => hexDistance(other.position, tile.coord) >= 6))!;
  const second = foundCity('ai-1', elsewhere.coord, state.map, counters);
  state.cities[second.id] = second;
  state.civilizations['ai-1'].cities.push(second.id);
  const add = (unit: Unit) => {
    state.units[unit.id] = unit;
    state.civilizations[unit.owner].units.push(unit.id);
    return unit;
  };
  // The ceding civ's own garrison stands in the city.
  const garrison = Object.values(state.units).find(unit => unit.owner === 'ai-1' && hexKey(unit.position) === hexKey(city.position))
    ?? add(createUnit('warrior', 'ai-1', city.position, counters));
  // An aircraft based at the city's airfield.
  state.cities[cityId] = { ...city, buildings: [...city.buildings, 'airfield'] };
  const plane = add({ ...createUnit('biplane', 'ai-1', city.position, counters), airBase: { kind: 'city', cityId } });
  return { state, cityId, garrisonId: garrison.id, planeId: plane.id, cityPosition: city.position };
}

describe('a city that changes hands without a battle leaves no foreign units inside it', () => {
  it('moves the old garrison out and resolves its based aircraft, keeping every invariant', () => {
    const { state, cityId, garrisonId, planeId, cityPosition } = cededCityWithOccupants('ceded-city-occupants');
    assertSaveStateInvariants(state, 'before the transfer');

    const after = transferCapturedCityOwnership(state, cityId, 'player', state.turn);

    expect(after.cities[cityId].owner).toBe('player');
    assertSaveStateInvariants(after, 'after the transfer');
    // The garrison is not deleted: it stands next to the city it left, still its owner's.
    const garrison = after.units[garrisonId];
    expect(garrison?.owner).toBe('ai-1');
    expect(hexDistance(garrison!.position, cityPosition)).toBe(1);
    // The aircraft is no longer based in a city its owner does not hold.
    const plane = after.units[planeId];
    if (plane?.airBase?.kind === 'city') expect(after.cities[plane.airBase.cityId]?.owner).toBe(plane.owner);
  });

  it('a peace settlement that cedes an occupied city leaves the game valid', () => {
    const { state, cityId, garrisonId } = cededCityWithOccupants('settlement-cedes-occupied-city');
    const next = executeSettlement(state, 'player', 'ai-1', [
      { kind: 'transfer_city', cityId, fromCivId: 'ai-1', toCivId: 'player' },
    ], state.turn, new EventBus());

    expect(next.cities[cityId].owner).toBe('player');
    expect(next.units[garrisonId]?.owner).toBe('ai-1');
    assertSaveStateInvariants(next, 'after the settlement');
  });

  it('sails a loaded transport out of port with its cargo aboard', () => {
    const { state, cityId, cityPosition } = cededCityWithOccupants('ceded-port-transport');
    const water = hexNeighbors(cityPosition)[0]!;
    state.map.tiles[hexKey(water)] = { ...state.map.tiles[hexKey(water)]!, terrain: 'coast' };
    for (const unit of Object.values(state.units)) {
      if (hexKey(unit.position) === hexKey(water)) unit.position = { ...cityPosition };
    }
    const counters = state.idCounters;
    const ship = { ...createUnit('transport', 'ai-1', cityPosition, counters), cargoUnitIds: [] as string[] };
    const rider = { ...createUnit('warrior', 'ai-1', cityPosition, counters), transportId: ship.id };
    ship.cargoUnitIds = [rider.id];
    for (const unit of [ship, rider]) {
      state.units[unit.id] = unit;
      state.civilizations['ai-1'].units.push(unit.id);
    }
    assertSaveStateInvariants(state, 'before the transfer');

    const after = transferCapturedCityOwnership(state, cityId, 'player', state.turn);

    expect(after.units[ship.id]?.position).toEqual(water);
    expect(after.units[rider.id]).toMatchObject({ position: water, transportId: ship.id });
    assertSaveStateInvariants(after, 'after the transfer');
  });

  it('razing a city with aircraft at its airfield leaves none based at a city that is gone', () => {
    const { state, cityId, garrisonId, planeId } = cededCityWithOccupants('razed-airfield');
    // A raze, like any capture, needs the city's ground defenders gone first.
    delete state.units[garrisonId];
    state.civilizations['ai-1'].units = state.civilizations['ai-1'].units.filter(id => id !== garrisonId);
    assertSaveStateInvariants(state, 'before the raze');

    const result = resolveMajorCityCapture(state, cityId, 'player', 'raze', state.turn);

    expect(result.outcome).toBe('razed');
    expect(result.state.cities[cityId]).toBeUndefined();
    const plane = result.state.units[planeId];
    if (plane?.airBase?.kind === 'city') expect(result.state.cities[plane.airBase.cityId]).toBeDefined();
    assertSaveStateInvariants(result.state, 'after the raze');
  });
});
