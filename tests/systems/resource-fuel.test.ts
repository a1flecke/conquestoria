import { describe, expect, it } from 'vitest';
import type { City, Civilization, GameState } from '@/core/types';
import {
  FUEL_STARTUP_ALLOWANCE,
  allocateFuelForRound,
  ensureFuelStartupAllowance,
  getCityFuelDemands,
  getCityFuelStatus,
  getFuelRunway,
  setFuelConservationPolicy,
} from '@/systems/resource-fuel-system';
import { calculateCityYields } from '@/systems/resource-system';
import { BUILDINGS } from '@/systems/city-building-catalog';
import { getExportableQuantity } from '@/systems/resource-reserve-system';
import { resourceGoodId } from '@/systems/trade-good-definitions';

/**
 * #1512 MR15 — selected industrial fuel demand and graceful shortages.
 *
 * One civilization-wide allocation before production; the last fuel unit can fund one building, and
 * an unfueled building falls back without being destroyed.
 */

const COAL = resourceGoodId('coal');
const URANIUM = resourceGoodId('uranium');
const OIL = resourceGoodId('oil');

function city(id: string, owner: string, buildings: string[]): City {
  return {
    id,
    name: id,
    owner,
    position: { q: 0, r: 0 },
    population: 1,
    food: 0,
    production: 0,
    gold: 0,
    science: 0,
    buildings,
    productionQueue: [],
    productionProgress: 0,
    workedTiles: [],
    ownedTiles: [{ q: 0, r: 0 }],
    focus: 'balanced',
    happiness: 0,
    health: 0,
    maturity: 'town',
    unrestLevel: 0,
    unrestTurns: 0,
    spyUnrestBonus: 0,
  } as unknown as City;
}

function civ(id: string, cities: string[]): Civilization {
  return {
    id,
    name: id,
    color: '#fff',
    isHuman: true,
    civType: 'generic',
    cities,
    units: [],
    techState: { completed: ['steam-power'], currentResearch: null, researchQueue: [], researchProgress: 0, trackPriorities: {} },
    gold: 100,
    visibility: {},
    score: 0,
    diplomacy: {
      relationships: {},
      treaties: [],
      events: [],
      atWarWith: [],
      treacheryScore: 0,
      vassalage: { overlord: null, vassals: [], protectionScore: 0, protectionTimers: [] },
    },
  } as unknown as Civilization;
}

function world(buildings: string[][], balances: Record<string, { native: number; imported: number }> = {}): GameState {
  const cities = Object.fromEntries(buildings.map((list, index) => [`c${index}`, city(`c${index}`, 'player', list)]));
  return {
    turn: 10,
    currentPlayer: 'player',
    cities,
    civilizations: { player: civ('player', Object.keys(cities)) },
    units: {},
    map: { width: 4, height: 4, tiles: {}, wrapsHorizontally: false, rivers: [] },
    materialReservesByCiv: {
      player: { balances, reservations: [], incoming: [], lastAccruedTurn: -1 },
    },
    gameOver: false,
    winner: null,
  } as unknown as GameState;
}

describe('#1512 MR15 — industrial fuel allocation', () => {
  it('spends the last unit on one city and gives the others their declared fallback', () => {
    const state = world([['factory'], ['factory'], ['factory']], {
      [COAL]: { native: 1, imported: 0 },
    });
    const allocated = allocateFuelForRound(state);
    const statuses = Object.values(allocated.cities).map(city => getCityFuelStatus(allocated, city));
    expect(statuses.flat().filter(entry => entry.powered)).toHaveLength(1);
    expect(statuses.flat().filter(entry => !entry.powered)).toHaveLength(2);
    expect(allocated.materialReservesByCiv!.player!.balances[COAL]).toEqual({ native: 0, imported: 0 });
  });

  it('reduces only the declared fuel-backed output when fuel is missing', () => {
    const state = world([['factory']], { [COAL]: { native: 0, imported: 0 } });
    const allocated = allocateFuelForRound(state);
    const city = allocated.cities.c0!;
    const powered = calculateCityYields({ ...city, fuelFallbackBuildingIds: [] }, allocated.map, undefined, ['steam-power']);
    const fallback = calculateCityYields(city, allocated.map, undefined, ['steam-power']);
    expect(powered.production - fallback.production).toBe(2);
    expect(fallback.production).toBeGreaterThan(0);
  });

  it('does not destroy a nuclear plant when uranium is zero', () => {
    const state = world([['nuclear_power_plant']], { [URANIUM]: { native: 0, imported: 0 } });
    const allocated = allocateFuelForRound(state);
    expect(allocated.cities.c0!.buildings).toContain('nuclear_power_plant');
    expect(getCityFuelStatus(allocated, allocated.cities.c0!)[0]).toMatchObject({ powered: false });
  });

  it('funds the next round after an import arrives, never the round already produced', () => {
    const state = world([['factory']], { [COAL]: { native: 0, imported: 0 } });
    const first = allocateFuelForRound(state);
    expect(getCityFuelStatus(first, first.cities.c0!)[0]!.powered).toBe(false);
    first.materialReservesByCiv = {
      player: {
        ...first.materialReservesByCiv!.player!,
        balances: { ...first.materialReservesByCiv!.player!.balances, [COAL]: { native: 0, imported: 1 } },
      },
    };
    const next = allocateFuelForRound(first);
    expect(getCityFuelStatus(next, next.cities.c0!)[0]!.powered).toBe(true);
  });

  it('conservation reprioritizes the same fuel to the larger lost output', () => {
    BUILDINGS.fuel_test = {
      id: 'fuel_test', name: 'Fuel Test', yields: { food: 0, production: 5, gold: 0, science: 0 },
      productionCost: 1, description: 'test-only fuel building',
      fuelDemand: {
        goodId: COAL, unitsPerRound: 1,
        poweredYields: { production: 5 }, fallbackYields: { production: 0 },
      },
    };
    const state = world([['factory', 'fuel_test']], { [COAL]: { native: 1, imported: 0 } });
    const balanced = allocateFuelForRound(state);
    expect(getCityFuelStatus(balanced, balanced.cities.c0!).find(entry => entry.buildingId === 'factory')!.powered).toBe(true);
    const conserved = allocateFuelForRound(setFuelConservationPolicy(state, 'player', 'conserve'));
    expect(getCityFuelStatus(conserved, conserved.cities.c0!).find(entry => entry.buildingId === 'fuel_test')!.powered).toBe(true);
    expect(getCityFuelStatus(conserved, conserved.cities.c0!).find(entry => entry.buildingId === 'factory')!.powered).toBe(false);
  });

  it('reports runway and delivery uncertainty from real scheduled demand', () => {
    const state = world([['factory'], ['factory'], ['factory']], { [COAL]: { native: 6, imported: 0 } });
    expect(getFuelRunway(state, 'player', COAL)).toMatchObject({
      demandPerRound: 3,
      free: 6,
      runwayRounds: 2,
      status: 'funded',
    });
    const empty = world([['factory']], { [COAL]: { native: 0, imported: 0 } });
    expect(getFuelRunway(empty, 'player', COAL)).toMatchObject({ status: 'shortage', runwayRounds: 0 });
    empty.materialReservesByCiv!.player!.incoming = [{ id: 'incoming', goodId: COAL, ownerCivId: 'player', amount: 2 }];
    expect(getFuelRunway(empty, 'player', COAL)).toMatchObject({ status: 'delivery-uncertain' });
    expect(getFuelRunway(world([[]]), 'player', OIL).status).toBe('no-demand');
  });

  it('grants a bounded non-exportable startup allowance exactly once', () => {
    const state = world([['factory']], {});
    const granted = ensureFuelStartupAllowance(state);
    expect(granted.materialReservesByCiv!.player!.balances[COAL]).toEqual({
      native: 0,
      imported: FUEL_STARTUP_ALLOWANCE,
    });
    expect(getExportableQuantity(granted.materialReservesByCiv!.player!, COAL)).toBe(0);
    expect(granted.fuelStartupGrantedByCiv?.player).toBe(true);
    const repeated = ensureFuelStartupAllowance(granted);
    expect(repeated.materialReservesByCiv!.player!.balances[COAL]!.imported).toBe(FUEL_STARTUP_ALLOWANCE);
  });

  it('declares demand only for the selected fuel-backed buildings', () => {
    const state = world([['factory', 'assembly_line', 'oil_refinery']]);
    expect(getCityFuelDemands(state.cities.c0!).map(entry => entry.goodId)).toEqual([COAL, OIL]);
  });
});
