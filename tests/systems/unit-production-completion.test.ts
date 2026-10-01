import { describe, expect, it } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { foundCityInState } from '@/systems/city-founding-system';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit, UnitType } from '@/core/types';
import { TRAINABLE_UNITS } from '@/systems/city-unit-catalog';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { isSpyUnitType } from '@/systems/spy-unit-types';
import { hasAITradeRole } from '@/ai/ai-unit-roles';
import { createEspionageCivState } from '@/systems/espionage-system';
import { announceUnitProduction, completeUnitProduction } from '@/systems/unit-production-completion';
import { removeUnits } from '@/systems/unit-removal-system';
import { isNavalTransportUnit } from '@/systems/transport-system';
import { assertAirBaseIntegrity, assertCargoReciprocity, assertUnitRosters } from '../helpers/save-state-invariants';

/**
 * #1202 — generic lifecycle coverage for every trainable unit.
 *
 * The categories are DERIVED from typed definition metadata (never a hand-kept list of unit names), so a new
 * `TRAINABLE_UNITS` entry joins the matrix on its own. A category's companion contract is the only hand-written
 * part: it states what must exist after production and what must be gone after removal. A future unit whose
 * production writes some other piece of state fails the footprint guard until someone categorises it.
 */
type Category = 'spy' | 'air-based' | 'carrier' | 'transport' | 'trade' | 'missionary' | 'settler' | 'ordinary';

function categoryOf(type: UnitType): Category {
  const definition = UNIT_DEFINITIONS[type];
  if (isSpyUnitType(type)) return 'spy';
  if (definition.airOperation) return 'air-based';
  if (definition.carrierDeckCapacity != null) return 'carrier';
  if (isNavalTransportUnit({ type } as Unit)) return 'transport';
  if (hasAITradeRole(type)) return 'trade';
  if (type === 'missionary') return 'missionary';
  if (definition.canFoundCity) return 'settler';
  return 'ordinary';
}

/** Top-level `GameState` keys a completion may change, beyond the three every unit touches. */
const FOOTPRINT: Record<Category, string[]> = {
  spy: ['espionage'],
  'air-based': [],
  carrier: [],
  transport: [],
  trade: [],
  missionary: [],
  settler: [],
  ordinary: [],
};
const BASE_FOOTPRINT = ['units', 'civilizations', 'idCounters'];

interface Fixture { state: GameState; civId: string; cityId: string }

function fixtureFor(type: UnitType, seed = 'unit-lifecycle'): Fixture {
  const start = createNewGame(undefined, `${seed}-${type}`, 'small');
  const civId = start.currentPlayer;
  const settlerId = start.civilizations[civId].units.find(id => start.units[id]?.type === 'settler')!;
  const founded = foundCityInState(start, settlerId, new EventBus());
  const state = founded.state;
  const cityId = founded.cityId;
  state.cities[cityId] = { ...state.cities[cityId], buildings: [...state.cities[cityId].buildings] };
  const definition = UNIT_DEFINITIONS[type];
  if (definition.airOperation) {
    state.cities[cityId].buildings.push(definition.airOperation.baseKinds[0]);
  }
  state.espionage = { ...(state.espionage ?? {}), [civId]: { ...createEspionageCivState(), maxSpies: 50 } };
  return { state, civId, cityId };
}

/** What must hold right after production, per category. Throws when it does not. */
function assertCompanionCreated(category: Category, state: GameState, unit: Unit, civId: string, cityId: string): void {
  expect(state.units[unit.id], 'the unit exists').toBeDefined();
  expect(state.civilizations[civId].units, 'it is on its owner roster').toContain(unit.id);
  switch (category) {
    case 'spy':
      expect(state.espionage?.[civId]?.spies[unit.id], 'a spy has its espionage record').toBeDefined();
      break;
    case 'air-based':
      expect(state.units[unit.id].airBase, 'an aircraft is based').toEqual({ kind: 'city', cityId });
      break;
    case 'missionary':
      expect(state.units[unit.id].chargesRemaining ?? 0, 'a missionary has charges').toBeGreaterThan(0);
      break;
    default:
      break;
  }
}

describe('completeUnitProduction (#1202) — every trainable unit, through the one completion', () => {
  it('covers the whole catalog with no silent skips', () => {
    expect(TRAINABLE_UNITS.length).toBeGreaterThan(50);
    const categories = new Set(TRAINABLE_UNITS.map(entry => categoryOf(entry.type)));
    // The categories the audit found must all be populated; an empty one means the derivation broke.
    for (const category of ['spy', 'air-based', 'carrier', 'transport', 'trade', 'missionary', 'settler', 'ordinary'] as Category[]) {
      expect(categories.has(category), `no trainable unit categorised as ${category}`).toBe(true);
    }
  });

  it.each(TRAINABLE_UNITS.map(entry => [entry.type] as const))('%s: completes, rosters hold, companions exist, footprint is declared', type => {
    const category = categoryOf(type);
    const { state, civId, cityId } = fixtureFor(type);

    const completion = completeUnitProduction(state, { civId, cityId, unitType: type });

    if (!completion.ok) throw new Error(`${type} did not complete: ${completion.reason}`);
    expect(completion.unit.type).toBe(type);
    expect(completion.unit.owner).toBe(civId);
    assertCompanionCreated(category, completion.state, completion.unit, civId, cityId);
    expect(() => assertUnitRosters(completion.state)).not.toThrow();
    expect(() => assertCargoReciprocity(completion.state)).not.toThrow();
    expect(() => assertAirBaseIntegrity(completion.state)).not.toThrow();

    // Footprint: only declared top-level keys changed. A unit whose production writes anything else is a new
    // lifecycle category and must be added to FOOTPRINT (and given a companion contract) before it ships.
    const changed = (Object.keys(completion.state) as Array<keyof GameState>)
      .filter(key => completion.state[key] !== state[key]);
    const allowed = new Set([...BASE_FOOTPRINT, ...FOOTPRINT[category]]);
    expect(changed.filter(key => !allowed.has(key)), `${type} (${category}) changed undeclared state`).toEqual([]);
    expect(state.units[completion.unit.id], 'the input state is untouched').toBeUndefined();
  });

  it('announces the unit once from the returned data, and a spy recruitment only for spies', () => {
    const spyType = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'spy')!.type;
    const ordinaryType = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'ordinary')!.type;
    for (const [type, expectSpy] of [[spyType, true], [ordinaryType, false]] as const) {
      const { state, civId, cityId } = fixtureFor(type);
      const completion = completeUnitProduction(state, { civId, cityId, unitType: type });
      if (!completion.ok) throw new Error(completion.reason);
      const bus = new EventBus();
      const trained: unknown[] = [];
      const recruited: unknown[] = [];
      bus.on('city:unit-trained', payload => trained.push(payload));
      bus.on('espionage:spy-recruited', payload => recruited.push(payload));

      announceUnitProduction(bus, cityId, civId, completion);

      expect(trained).toEqual([{ cityId, unitType: type }]);
      expect(recruited.length).toBe(expectSpy ? 1 : 0);
    }
  });

  it('refuses an aircraft with nowhere to land instead of producing a homeless one', () => {
    const type = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'air-based')!.type;
    const { state, civId, cityId } = fixtureFor(type);
    state.cities[cityId] = { ...state.cities[cityId], buildings: state.cities[cityId].buildings.filter(id => !['airfield', 'helicopter_base', 'stealth_airbase'].includes(id)) };

    const completion = completeUnitProduction(state, { civId, cityId, unitType: type });

    expect(completion.ok).toBe(false);
  });
});

describe('removing a produced unit (#1202 × #1198) — one representative per lifecycle category', () => {
  const representative = (category: Category): UnitType => TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === category)!.type;

  function produce(type: UnitType) {
    const fixture = fixtureFor(type, 'unit-removal-matrix');
    const completion = completeUnitProduction(fixture.state, { civId: fixture.civId, cityId: fixture.cityId, unitType: type });
    if (!completion.ok) throw new Error(completion.reason);
    return { ...fixture, state: completion.state, unit: completion.unit };
  }
  const expectClean = (state: GameState, unitId: string, civId: string): void => {
    expect(state.units[unitId]).toBeUndefined();
    expect(state.civilizations[civId].units).not.toContain(unitId);
    expect(() => assertUnitRosters(state)).not.toThrow();
    expect(() => assertCargoReciprocity(state)).not.toThrow();
    expect(() => assertAirBaseIntegrity(state)).not.toThrow();
  };

  it.each(['ordinary', 'settler', 'missionary', 'air-based'] as Category[])('%s: removal leaves every index clean', category => {
    const { state, unit, civId } = produce(representative(category));
    expectClean(removeUnits(state, [unit.id], { reason: 'destroyed' }).state, unit.id, civId);
  });

  it('spy: a killed spy ends its record; a spy that goes off-map by design keeps it', () => {
    const { state, unit, civId } = produce(representative('spy'));
    const killed = removeUnits(state, [unit.id], { reason: 'destroyed' }).state;
    expectClean(killed, unit.id, civId);
    expect(killed.espionage?.[civId]?.spies[unit.id], 'the dead spy keeps no record').toBeUndefined();
    const embedded = removeUnits(state, [unit.id], { reason: 'consumed' }).state;
    expect(embedded.espionage?.[civId]?.spies[unit.id], 'an embedded spy IS its record').toBeDefined();
  });

  it('trade: removing a committed caravan ends its route', () => {
    const { state, unit, civId } = produce(representative('trade'));
    const committed: GameState = {
      ...state,
      units: { ...state.units, [unit.id]: { ...unit, committedToRouteId: 'route-1' } },
      marketplace: {
        prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
        tradeRoutes: [{ id: 'route-1', fromCityId: 'a', toCityId: 'b', goldPerTrip: 5, turnsPerTrip: 3 }],
      },
    };
    const next = removeUnits(committed, [unit.id], { reason: 'destroyed' }).state;
    expectClean(next, unit.id, civId);
    expect(next.marketplace!.tradeRoutes).toEqual([]);
  });

  it('transport: removing the hull takes its cargo; removing the cargo clears the manifest', () => {
    const { state, unit: hull, civId, cityId } = produce(representative('transport'));
    const cargoType = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'ordinary')!.type;
    const cargoCompletion = completeUnitProduction(state, { civId, cityId, unitType: cargoType });
    if (!cargoCompletion.ok) throw new Error(cargoCompletion.reason);
    const cargo = cargoCompletion.unit;
    const loaded: GameState = {
      ...cargoCompletion.state,
      units: {
        ...cargoCompletion.state.units,
        [hull.id]: { ...cargoCompletion.state.units[hull.id], cargoUnitIds: [cargo.id], position: { ...cargo.position } },
        [cargo.id]: { ...cargoCompletion.state.units[cargo.id], transportId: hull.id },
      },
    };
    const hullGone = removeUnits(loaded, [hull.id], { reason: 'destroyed' }).state;
    expectClean(hullGone, hull.id, civId);
    expect(hullGone.units[cargo.id]).toBeUndefined();
    const cargoGone = removeUnits(loaded, [cargo.id], { reason: 'destroyed' }).state;
    expectClean(cargoGone, cargo.id, civId);
    expect(cargoGone.units[hull.id].cargoUnitIds ?? []).not.toContain(cargo.id);
  });

  it('carrier: removing the carrier takes its air wing', () => {
    const { state, unit: carrier, civId, cityId } = produce(representative('carrier'));
    const airType = representative('air-based');
    // Produced on the carrier's own state: separate fixtures reuse unit ids.
    const hosted: GameState = {
      ...state,
      cities: { ...state.cities, [cityId]: { ...state.cities[cityId], buildings: [...state.cities[cityId].buildings, 'airfield'] } },
    };
    const air = completeUnitProduction(hosted, { civId, cityId, unitType: airType });
    if (!air.ok) throw new Error(air.reason);
    const withJet: GameState = {
      ...air.state,
      units: {
        ...air.state.units,
        [air.unit.id]: { ...air.unit, airBase: { kind: 'carrier', unitId: carrier.id }, position: { ...carrier.position } },
      },
    };
    expect(() => assertAirBaseIntegrity(withJet)).not.toThrow();
    const next = removeUnits(withJet, [carrier.id], { reason: 'destroyed' }).state;
    expectClean(next, carrier.id, civId);
    expect(next.units[air.unit.id]).toBeUndefined();
  });
});

describe('the guard is not vacuous (#1202)', () => {
  // These sabotage the STATE a unit's lifecycle should have produced, never production code.
  it('creation: a spy whose espionage record was never made fails the companion contract', () => {
    const type = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'spy')!.type;
    const { state, civId, cityId } = fixtureFor(type);
    const completion = completeUnitProduction(state, { civId, cityId, unitType: type });
    if (!completion.ok) throw new Error(completion.reason);
    const { [completion.unit.id]: _dropped, ...spies } = completion.state.espionage![civId].spies;
    const sabotaged: GameState = {
      ...completion.state,
      espionage: { ...completion.state.espionage, [civId]: { ...completion.state.espionage![civId], spies } },
    };
    expect(() => assertCompanionCreated('spy', sabotaged, completion.unit, civId, cityId)).toThrow();
  });

  it('removal: a state where the dead spy kept its record is exactly what the removal matrix rejects', () => {
    const type = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'spy')!.type;
    const { state, civId, cityId } = fixtureFor(type);
    const completion = completeUnitProduction(state, { civId, cityId, unitType: type });
    if (!completion.ok) throw new Error(completion.reason);
    // 'consumed' deliberately keeps the record -- the same state a forgotten cleanup would leave.
    const leaked = removeUnits(completion.state, [completion.unit.id], { reason: 'consumed' }).state;
    expect(leaked.espionage?.[civId]?.spies[completion.unit.id]).toBeDefined();
    const clean = removeUnits(completion.state, [completion.unit.id], { reason: 'destroyed' }).state;
    expect(clean.espionage?.[civId]?.spies[completion.unit.id]).toBeUndefined();
  });

  it('footprint: a completion that writes an undeclared key is flagged', () => {
    const type = TRAINABLE_UNITS.find(entry => categoryOf(entry.type) === 'ordinary')!.type;
    const { state, civId, cityId } = fixtureFor(type);
    const completion = completeUnitProduction(state, { civId, cityId, unitType: type });
    if (!completion.ok) throw new Error(completion.reason);
    const sabotaged: GameState = { ...completion.state, embargoes: [...(completion.state.embargoes ?? []), { fake: true } as never] };
    const changed = (Object.keys(sabotaged) as Array<keyof GameState>).filter(key => sabotaged[key] !== state[key]);
    const allowed = new Set([...BASE_FOOTPRINT, ...FOOTPRINT.ordinary]);
    expect(changed.filter(key => !allowed.has(key))).toContain('embargoes');
  });
});
