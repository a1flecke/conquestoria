import { describe, expect, it } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit, UnitType } from '@/core/types';
import { AIR_SPENT_AT, AIR_WORN_AT } from '@/systems/air-readiness';
import { NAVAL_DEPLETED_AT, NAVAL_EXTENDED_AT } from '@/systems/naval-endurance';
import { BADLY_WOUNDED_HEALTH, getOwnForceReadiness } from '@/systems/own-force-readiness';
import { createUnit } from '@/systems/unit-lifecycle';
import { makeWarGoalFixture } from './helpers/war-goal-fixture';

const VIEWER = 'attacker';

function base(): GameState {
  const state = makeWarGoalFixture(new EventBus());
  // The fixture seeds one warrior per civ; start each test from an empty roster so counts are exact.
  state.units = {};
  for (const [id, civ] of Object.entries(state.civilizations)) state.civilizations[id] = { ...civ, units: [] };
  return state;
}

function addUnit(state: GameState, type: UnitType, owner: string, patch: Partial<Unit> = {}): Unit {
  const home = state.cities[state.civilizations[owner].cities[0]];
  const unit = { ...createUnit(type, owner, { q: home.position.q + 1, r: home.position.r }, state.idCounters), ...patch };
  state.units[unit.id] = unit;
  state.civilizations[owner].units.push(unit.id);
  return unit;
}

function addAircraft(state: GameState, owner: string, patch: Partial<Unit> = {}): Unit {
  const cityId = state.civilizations[owner].cities[0];
  const city = state.cities[cityId];
  city.buildings = [...city.buildings, 'airfield'];
  return addUnit(state, 'bomber', owner, { position: { ...city.position }, airBase: { kind: 'city', cityId }, ...patch });
}

describe('own-force readiness (#1397)', () => {
  it('reports an empty, filler-free answer when the viewer has no military', () => {
    const state = base();
    addUnit(state, 'settler', VIEWER); // civilian: never eligible
    expect(getOwnForceReadiness(state, VIEWER)).toEqual({
      civId: VIEWER, eligibleUnits: 0, availableUnits: 0, limitedUnits: 0, limitedUnitsExcludingSupply: 0, limitations: [],
    });
  });

  it('reports a healthy army as fully available with no limitations', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER);
    addUnit(state, 'archer', VIEWER);
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness).toMatchObject({ eligibleUnits: 2, availableUnits: 2, limitedUnits: 0, limitations: [] });
  });

  it('flags units at or below the wounded line and not above it', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { health: BADLY_WOUNDED_HEALTH });
    addUnit(state, 'warrior', VIEWER, { health: BADLY_WOUNDED_HEALTH + 1 });
    addUnit(state, 'warrior', VIEWER, { health: 100 });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.eligibleUnits).toBe(3);
    expect(readiness.limitedUnits).toBe(1);
    expect(readiness.limitations).toEqual([expect.objectContaining({ kind: 'wounded', units: 1, severe: false })]);
  });

  it('reports cut-off land forces from the persisted supply state, using the supply domain\'s own eligibility', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { landSupply: { state: 'degraded', hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 } });
    addUnit(state, 'warrior', VIEWER, { landSupply: { state: 'severe', hostileUnsupportedTurns: 8, suppliedTurnsSinceRecovery: 0 } });
    addUnit(state, 'warrior', VIEWER, { landSupply: { state: 'full', hostileUnsupportedTurns: 0, suppliedTurnsSinceRecovery: 4 } });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.limitations).toEqual([expect.objectContaining({ kind: 'unsupplied', units: 2, severe: true })]);
    expect(readiness.limitedUnits).toBe(2);
    // Supply already has its own Council constraint: war guidance reads this number instead.
    expect(readiness.limitedUnitsExcludingSupply).toBe(0);
  });

  it('counts a unit once however many conditions apply, but lists each condition', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { health: 20, landSupply: { state: 'severe', hostileUnsupportedTurns: 9, suppliedTurnsSinceRecovery: 0 } });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.limitedUnits).toBe(1);
    expect(readiness.limitedUnitsExcludingSupply).toBe(1);
    expect(readiness.limitations.map(item => item.kind).sort()).toEqual(['unsupplied', 'wounded']);
    expect(readiness.availableUnits).toBe(0);
  });

  it('reports worn and spent aircraft through the air domain, and a spent wing as unable to strike', () => {
    const state = base();
    addAircraft(state, VIEWER, { airStrain: AIR_WORN_AT });
    addAircraft(state, VIEWER, { airStrain: AIR_SPENT_AT });
    addAircraft(state, VIEWER, { airStrain: 0 });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.eligibleUnits).toBe(3);
    expect(readiness.limitations).toEqual([
      expect.objectContaining({ kind: 'air-cannot-strike', units: 1, severe: true }),
      expect.objectContaining({ kind: 'air-worn', units: 1, severe: false }),
    ]);
  });

  it('reports aircraft on a depleted carrier as unable to strike even when their own strain is low', () => {
    const state = base();
    const carrier = addUnit(state, 'carrier', VIEWER, { navalOps: { awayTurns: NAVAL_DEPLETED_AT } });
    addUnit(state, 'bomber', VIEWER, { position: { ...carrier.position }, airBase: { kind: 'carrier', unitId: carrier.id } });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.limitations.map(item => item.kind)).toEqual(expect.arrayContaining(['air-cannot-strike', 'naval-depleted']));
    expect(readiness.limitedUnits).toBe(2);
  });

  it('reports extended and depleted fleets through the naval domain', () => {
    const state = base();
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: NAVAL_EXTENDED_AT } });
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: NAVAL_DEPLETED_AT } });
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: 0 } });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.limitations).toEqual([
      expect.objectContaining({ kind: 'naval-depleted', units: 1, severe: true }),
      expect.objectContaining({ kind: 'naval-extended', units: 1, severe: false }),
    ]);
  });

  it('excludes cargo, other civilizations\' units, dead units and non-combat types', () => {
    const state = base();
    const ship = addUnit(state, 'transport', VIEWER);
    addUnit(state, 'warrior', VIEWER, { health: 10, transportId: ship.id }); // carried: not available for action
    addUnit(state, 'warrior', 'defender', { health: 10 }); // someone else's
    addUnit(state, 'warrior', VIEWER, { health: 0 }); // dead
    addUnit(state, 'worker', VIEWER, { health: 10 }); // civilian
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.eligibleUnits).toBe(0);
    expect(readiness.limitations).toEqual([]);
  });

  it('tolerates malformed optional legacy fields as "no limitation", never as a crash or a phantom', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { landSupply: { state: 'bogus' } as never });
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: Number.NaN } });
    addAircraft(state, VIEWER, { airStrain: 'lots' as never });
    addUnit(state, 'warrior', VIEWER, { health: Number.NaN });
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.limitations).toEqual([]);
    expect(readiness.eligibleUnits).toBe(3); // the NaN-health unit is not a valid combatant
  });

  it('describes a mixed modern force with bounded, most-severe-first limitations', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { health: 30 });
    addUnit(state, 'warrior', VIEWER, { health: 40 });
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: NAVAL_DEPLETED_AT } });
    addAircraft(state, VIEWER, { airStrain: AIR_WORN_AT });
    addUnit(state, 'archer', VIEWER);
    const readiness = getOwnForceReadiness(state, VIEWER);
    expect(readiness.eligibleUnits).toBe(5);
    expect(readiness.limitedUnits).toBe(4);
    expect(readiness.availableUnits).toBe(1);
    expect(readiness.limitations.length).toBeLessThanOrEqual(6);
    // Severe first (depleted), then more units (wounded x2) before fewer (worn).
    expect(readiness.limitations.map(item => item.kind)).toEqual(['naval-depleted', 'wounded', 'air-worn']);
    for (const item of readiness.limitations) expect(item.effect.length).toBeGreaterThan(10);
  });

  it('quotes penalties from the owning domains\' constants rather than restating numbers', () => {
    const state = base();
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: NAVAL_DEPLETED_AT } });
    expect(getOwnForceReadiness(state, VIEWER).limitations[0].effect).toBe('Depleted ships fight 20% weaker and move 1 less.');
  });

  it('is independent of unit-roster ordering, deterministic, and never mutates the state', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { health: 10 });
    addUnit(state, 'galley', VIEWER, { navalOps: { awayTurns: NAVAL_EXTENDED_AT } });
    addAircraft(state, VIEWER, { airStrain: AIR_SPENT_AT });
    const before = JSON.stringify(state);
    const first = getOwnForceReadiness(state, VIEWER);
    expect(JSON.stringify(state)).toBe(before);
    expect(getOwnForceReadiness(state, VIEWER)).toEqual(first);

    const reversed: GameState = { ...state, units: Object.fromEntries(Object.entries(state.units).reverse()) };
    expect(getOwnForceReadiness(reversed, VIEWER)).toEqual(first);
  });

  it('answers independently for each hot-seat viewer from the same world', () => {
    const state = base();
    addUnit(state, 'warrior', VIEWER, { health: 10 });
    addUnit(state, 'warrior', 'defender');
    expect(getOwnForceReadiness(state, VIEWER).limitedUnits).toBe(1);
    expect(getOwnForceReadiness(state, 'defender').limitedUnits).toBe(0);
    expect(getOwnForceReadiness(state, 'defender').eligibleUnits).toBe(1);
  });
});
