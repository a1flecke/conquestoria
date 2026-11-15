import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { migrateSpiesLeaveForeignCities } from '@/storage/migrations/steps/spies-leave-foreign-cities';
import { hexDistance, hexKey, hexNeighbors, hexesInRange } from '@/systems/hex-utils';
import { migrateUnitsLeaveImpassableTerrain } from '@/storage/migrations/steps/units-leave-impassable-terrain';
import { createUnit } from '@/systems/unit-lifecycle';
import { assertNoIllegalBlockingOccupancy, assertUnitsOnEnterableTerrain } from '../helpers/save-state-invariants';
import { buildBaselineSave } from './fixtures/save-compat/baseline';

/**
 * The two unit-placement migrations. Schema 39: a spy may no longer stand on a city its owner does
 * not hold (parked idle, or lying low after a failed infiltration). Schema 40: no unit stands on
 * terrain it cannot enter (land units stranded on water by the old spawn paths). Each moves a unit
 * once and never deletes one.
 */

function withParkedSpy(seed: string): { state: GameState; spyId: string; cityId: string; homeId: string } {
  const baseline = buildBaselineSave(seed);
  const state = baseline.state;
  const city = state.cities[baseline.playerCityId];
  const spy = createUnit('spy_agent', 'ai-1', city.position, state.idCounters);
  state.units[spy.id] = spy;
  state.civilizations['ai-1'].units.push(spy.id);
  return { state, spyId: spy.id, cityId: baseline.playerCityId, homeId: baseline.aiCityId };
}

describe('schema 39 — spies leave foreign cities', () => {
  it('moves a parked spy to a tile next to the city it was standing on', () => {
    const { state, spyId, cityId } = withParkedSpy('spy-migration-adjacent');
    expect(() => assertNoIllegalBlockingOccupancy(state)).toThrow(/foreign-city/);

    const migrated = migrateSpiesLeaveForeignCities(state);

    const moved = migrated.units[spyId].position;
    expect(hexDistance(moved, state.cities[cityId].position)).toBe(1);
    expect(() => assertNoIllegalBlockingOccupancy(migrated)).not.toThrow();
    // Idempotent: the moved spy is no longer on a foreign city.
    expect(migrateSpiesLeaveForeignCities(migrated)).toBe(migrated);
  });

  it('sends the spy home when nothing next to the city can hold it', () => {
    const { state, spyId, cityId, homeId } = withParkedSpy('spy-migration-home');
    for (const coord of hexNeighbors(state.cities[cityId].position)) {
      const tile = state.map.tiles[hexKey(coord)];
      if (tile) tile.terrain = 'ocean';
    }

    const migrated = migrateSpiesLeaveForeignCities(state);

    const home = state.cities[homeId].position;
    expect(hexDistance(migrated.units[spyId].position, home)).toBeLessThanOrEqual(1);
    expect(() => assertNoIllegalBlockingOccupancy(migrated)).not.toThrow();
  });

  it('leaves a spy in its own city, and cargo aboard a ship, where they are', () => {
    const { state, spyId, homeId } = withParkedSpy('spy-migration-untouched');
    const home = state.cities[homeId].position;
    state.units[spyId] = { ...state.units[spyId], position: { ...home } };
    expect(migrateSpiesLeaveForeignCities(state)).toBe(state);

    const { state: cargoState, spyId: cargoId } = withParkedSpy('spy-migration-cargo');
    cargoState.units[cargoId] = { ...cargoState.units[cargoId], transportId: 'some-ship' };
    expect(migrateSpiesLeaveForeignCities(cargoState)).toBe(cargoState);
  });
});

describe('schema 40 — units leave terrain they cannot enter', () => {
  it('carries a stranded land unit to the nearest tile it may stand on', () => {
    const { state, spyId } = withParkedSpy('stranded-migration');
    // Strand a warrior on water: the old rebel and quest-reward spawns could do exactly this.
    const water = Object.values(state.map.tiles).find(tile => tile.terrain === 'coast'
      && hexesInRange(tile.coord, 1).some(nb => state.map.tiles[hexKey(nb)]?.terrain === 'grassland'
        || state.map.tiles[hexKey(nb)]?.terrain === 'plains'))!;
    const stranded = createUnit('warrior', 'player', water.coord, state.idCounters);
    state.units[stranded.id] = stranded;
    state.civilizations.player.units.push(stranded.id);
    delete state.units[spyId];
    state.civilizations['ai-1'].units = state.civilizations['ai-1'].units.filter(id => id !== spyId);
    expect(() => assertUnitsOnEnterableTerrain(state)).toThrow(/cannot enter/);

    const migrated = migrateUnitsLeaveImpassableTerrain(state);

    const moved = migrated.units[stranded.id].position;
    expect(hexDistance(moved, water.coord)).toBe(1);
    expect(() => assertUnitsOnEnterableTerrain(migrated)).not.toThrow();
    expect(migrateUnitsLeaveImpassableTerrain(migrated)).toBe(migrated);
  });

  it('keeps a ship in its own port where it is', () => {
    const baseline = buildBaselineSave('stranded-migration-port');
    const state = baseline.state;
    const city = state.cities[baseline.playerCityId];
    const ship = createUnit('trireme', 'player', city.position, state.idCounters);
    state.units[ship.id] = ship;
    state.civilizations.player.units.push(ship.id);
    expect(migrateUnitsLeaveImpassableTerrain(state)).toBe(state);
  });
});
