import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { migrateSpiesLeaveForeignCities } from '@/storage/migrations/steps/spies-leave-foreign-cities';
import { hexDistance, hexKey, hexNeighbors, hexesInRange } from '@/systems/hex-utils';
import { migrateShipsOnSailableWater } from '@/storage/migrations/steps/ships-on-sailable-water';
import { createUnit } from '@/systems/unit-lifecycle';
import { assertNoIllegalBlockingOccupancy, assertUnitsOnEnterableTerrain } from '../helpers/save-state-invariants';
import { buildBaselineSave } from './fixtures/save-compat/baseline';

/**
 * The two unit-placement migrations. Schema 39: a spy may no longer stand on a city its owner does
 * not hold (parked idle, or lying low after a failed infiltration). Schema 40: every ship floats on
 * water its hull can sail (pirate flotillas of coast-only hulls on open ocean). Each fixes a unit
 * once and never deletes one; land units on water keep their own #447 recovery.
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

describe('schema 40 — ships float on water they can sail', () => {
  it('leaves a land unit on water to its designed recovery (#447) instead of moving it', () => {
    const { state, spyId } = withParkedSpy('stranded-land-unit');
    const water = Object.values(state.map.tiles).find(tile => tile.terrain === 'coast')!;
    const stranded = createUnit('warrior', 'player', water.coord, state.idCounters);
    state.units[stranded.id] = stranded;
    state.civilizations.player.units.push(stranded.id);
    delete state.units[spyId];
    state.civilizations['ai-1'].units = state.civilizations['ai-1'].units.filter(id => id !== spyId);

    expect(migrateShipsOnSailableWater(state)).toBe(state);
    expect(() => assertUnitsOnEnterableTerrain(state)).not.toThrow();
  });

  it('keeps a ship in its own port where it is', () => {
    const baseline = buildBaselineSave('stranded-migration-port');
    const state = baseline.state;
    const city = state.cities[baseline.playerCityId];
    // A port only counts when the city is genuinely coastal.
    const neighbour = hexNeighbors(city.position).find(coord => state.map.tiles[hexKey(coord)])!;
    state.map.tiles[hexKey(neighbour)] = { ...state.map.tiles[hexKey(neighbour)], terrain: 'coast' };
    const ship = createUnit('trireme', 'player', city.position, state.idCounters);
    state.units[ship.id] = ship;
    state.civilizations.player.units.push(ship.id);
    expect(migrateShipsOnSailableWater(state)).toBe(state);
  });
});

describe('schema 40 — stranded pirate hulls', () => {
  function pirateWorld(seed: string, kind: 'deep-sea-flotilla' | 'coastal-enclave') {
    const baseline = buildBaselineSave(seed);
    const state = baseline.state;
    const occupied = new Set(Object.values(state.units).map(unit => hexKey(unit.position)));
    // Open ocean next to free coast (a haven's ship), or any open ocean (a flotilla, refitted wherever it is).
    const ocean = Object.values(state.map.tiles).find(tile => tile.terrain === 'ocean'
      && !occupied.has(hexKey(tile.coord))
      && (kind === 'coastal-enclave'
        ? hexesInRange(tile.coord, 1).some(nb => state.map.tiles[hexKey(nb)]?.terrain === 'coast' && !occupied.has(hexKey(nb)))
        : true))!;
    const ship = createUnit('pirate_corsair', 'pirate-1', ocean.coord, state.idCounters);
    state.units[ship.id] = ship;
    state.pirates = {
      ...state.pirates!,
      factions: {
        'pirate-1': {
          id: 'pirate-1', name: 'Test Raiders', spawnedRound: 1, behavior: 'patrolling', maritimeStage: 2,
          notoriety: 0, shipIds: [ship.id],
          headquarters: kind === 'deep-sea-flotilla'
            ? { kind, flagshipUnitId: ship.id, relocation: { planned: null, lastRelocatedRound: null } }
            : { kind, position: ocean.coord, integrity: 100, maxIntegrity: 100 },
          tributeByCiv: {}, demandByCiv: {}, contract: null, intent: null, transitionGuards: { emittedEventKeys: [] },
        },
      },
    } as GameState['pirates'];
    return { state, shipId: ship.id, at: ocean.coord };
  }

  it('refits a deep-sea flotilla corsair stranded on open ocean as an ocean-going hull, in place', () => {
    const { state, shipId, at } = pirateWorld('stranded-flotilla', 'deep-sea-flotilla');
    expect(() => assertUnitsOnEnterableTerrain(state)).toThrow(/pirate_corsair\) stands on ocean/);

    const migrated = migrateShipsOnSailableWater(state);

    expect(migrated.units[shipId]).toMatchObject({ type: 'pirate_frigate', position: at, owner: 'pirate-1' });
    expect(() => assertUnitsOnEnterableTerrain(migrated)).not.toThrow();
  });

  it('moves a haven corsair that drifted onto open ocean back to the coast it can sail', () => {
    const { state, shipId } = pirateWorld('stranded-haven', 'coastal-enclave');

    const migrated = migrateShipsOnSailableWater(state);

    expect(migrated.units[shipId].type).toBe('pirate_corsair');
    expect(migrated.map.tiles[hexKey(migrated.units[shipId].position)].terrain).toBe('coast');
  });
});
