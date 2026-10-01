import { describe, expect, it, vi } from 'vitest';
import { createNewGame } from '@/core/game-state';
import { EventBus } from '@/core/event-bus';
import type { GameState, Unit } from '@/core/types';
import { createUnit } from '@/systems/unit-lifecycle';
import { removeUnits, removeUnitsFromSlice } from '@/systems/unit-removal-system';
import { createEspionageCivState, createSpyFromUnit } from '@/systems/espionage-system';
import { SAVE_STATE_INVARIANTS } from '../helpers/save-state-invariants';

const counters = (start: number) => ({ nextUnitId: start, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });

function fixture(seed: string): { state: GameState; civId: string; at: Unit['position'] } {
  const state = createNewGame(undefined, seed, 'small');
  const civId = state.currentPlayer;
  const anchor = Object.values(state.units).find(unit => unit.owner === civId)!;
  return { state, civId, at: anchor.position };
}

function add(state: GameState, unit: Unit): Unit {
  state.units[unit.id] = unit;
  const owner = state.civilizations[unit.owner] ?? state.minorCivs[unit.owner];
  if (owner) owner.units.push(unit.id);
  return unit;
}

function expectAllInvariants(state: GameState): void {
  for (const { name, check } of SAVE_STATE_INVARIANTS) {
    expect(() => check(state), `invariant ${name}`).not.toThrow();
  }
}

describe('removeUnits (#1198) — the one unit-removal transition', () => {
  it('removes the unit and scrubs the owner roster without touching the input', () => {
    const { state, civId, at } = fixture('removal-basic');
    const unit = add(state, { ...createUnit('warrior', civId, at, counters(500)), id: 'u-basic' });

    const { state: next, removed } = removeUnits(state, [unit.id], { reason: 'destroyed' });

    expect(next.units[unit.id]).toBeUndefined();
    expect(next.civilizations[civId].units).not.toContain(unit.id);
    expect(removed.map(entry => entry.id)).toEqual([unit.id]);
    expect(state.units[unit.id]).toBeDefined();
    expect(state.civilizations[civId].units).toContain(unit.id);
    expectAllInvariants(next);
  });

  it('returns the same state object when nothing named exists', () => {
    const { state } = fixture('removal-noop');
    const result = removeUnits(state, ['no-such-unit'], { reason: 'destroyed' });
    expect(result.state).toBe(state);
    expect(result.removed).toEqual([]);
  });

  it('scrubs a MINOR civ garrison roster (#996)', () => {
    const { state, at } = fixture('removal-minor');
    const mc = Object.values(state.minorCivs)[0];
    const unit = add(state, { ...createUnit('warrior', mc.id, at, counters(510)), id: 'u-minor' });
    expect(mc.units).toContain(unit.id);

    const { state: next } = removeUnits(state, [unit.id], { reason: 'destroyed' });

    expect(next.minorCivs[mc.id].units).not.toContain(unit.id);
    expectAllInvariants(next);
  });

  it('keeps a rosterless owner rosterless (barbarian)', () => {
    const { state, at } = fixture('removal-barbarian');
    const unit = add(state, { ...createUnit('warrior', 'barbarian', at, counters(520)), id: 'u-barb' });

    const { state: next } = removeUnits(state, [unit.id], { reason: 'destroyed' });

    expect(next.units[unit.id]).toBeUndefined();
    expect(next.civilizations.barbarian).toBeUndefined();
    expect(Object.keys(next.civilizations)).toEqual(Object.keys(state.civilizations));
  });

  it('removes an embarked unit from its SURVIVING transport manifest', () => {
    const { state, civId, at } = fixture('removal-embarked');
    const transport = add(state, { ...createUnit('transport', civId, at, counters(530)), id: 't-1', cargoUnitIds: ['c-1', 'c-2'] });
    const cargo1 = add(state, { ...createUnit('warrior', civId, at, counters(531)), id: 'c-1', transportId: transport.id });
    add(state, { ...createUnit('warrior', civId, at, counters(532)), id: 'c-2', transportId: transport.id });

    const { state: next } = removeUnits(state, [cargo1.id], { reason: 'destroyed' });

    expect(next.units[transport.id]!.cargoUnitIds).toEqual(['c-2']);
    expectAllInvariants(next);
  });

  it('removing a transport takes its cargo, whichever side of the link names it', () => {
    const { state, civId, at } = fixture('removal-transport');
    const transport = add(state, { ...createUnit('transport', civId, at, counters(540)), id: 't-2', cargoUnitIds: ['listed'] });
    add(state, { ...createUnit('warrior', civId, at, counters(541)), id: 'listed' });
    add(state, { ...createUnit('warrior', civId, at, counters(542)), id: 'linked', transportId: transport.id });

    const { state: next, removed } = removeUnits(state, [transport.id], { reason: 'destroyed' });

    expect(removed.map(entry => entry.id)).toEqual(['linked', 'listed', 't-2']);
    for (const id of ['t-2', 'listed', 'linked']) {
      expect(next.units[id]).toBeUndefined();
      expect(next.civilizations[civId].units).not.toContain(id);
    }
  });

  it('removing a carrier takes its based aircraft; a city-based aircraft is untouched', () => {
    const { state, civId, at } = fixture('removal-carrier');
    const carrier = add(state, { ...createUnit('carrier', civId, at, counters(550)), id: 'carrier-1' });
    add(state, { ...createUnit('biplane', civId, at, counters(551)), id: 'jet-ship', airBase: { kind: 'carrier', unitId: carrier.id } });
    add(state, { ...createUnit('biplane', civId, at, counters(552)), id: 'jet-city' });

    const { state: next } = removeUnits(state, [carrier.id], { reason: 'destroyed' });

    expect(next.units['jet-ship']).toBeUndefined();
    expect(next.units['jet-city']).toBeDefined();
    expect(next.civilizations[civId].units).not.toContain('jet-ship');
    expectAllInvariants(next);
  });

  it('closes over a cascade several levels deep without removing anything twice', () => {
    const { state, civId, at } = fixture('removal-deep');
    const outer = add(state, { ...createUnit('transport', civId, at, counters(560)), id: 'outer', cargoUnitIds: ['carrier-cargo'] });
    add(state, { ...createUnit('carrier', civId, at, counters(561)), id: 'carrier-cargo', transportId: outer.id });
    add(state, { ...createUnit('biplane', civId, at, counters(562)), id: 'jet-deep', airBase: { kind: 'carrier', unitId: 'carrier-cargo' } });

    const { state: next, removed } = removeUnits(state, [outer.id, 'jet-deep', outer.id], { reason: 'destroyed' });

    expect(removed.map(entry => entry.id)).toEqual(['carrier-cargo', 'jet-deep', 'outer']);
    expectAllInvariants(next);
  });

  it('does not depend on the order the ids are named', () => {
    const { state, civId, at } = fixture('removal-order');
    add(state, { ...createUnit('warrior', civId, at, counters(570)), id: 'o-a' });
    add(state, { ...createUnit('warrior', civId, at, counters(571)), id: 'o-b' });
    add(state, { ...createUnit('warrior', civId, at, counters(572)), id: 'o-c' });

    const forward = removeUnits(state, ['o-a', 'o-b', 'o-c'], { reason: 'destroyed' });
    const backward = removeUnits(state, ['o-c', 'o-b', 'o-a'], { reason: 'destroyed' });

    expect(backward.state).toEqual(forward.state);
    expect(backward.removed).toEqual(forward.removed);
  });

  describe('spy records', () => {
    function withSpy(seed: string) {
      const { state, civId, at } = fixture(seed);
      const spyUnit = add(state, { ...createUnit('spy_scout', civId, at, counters(580)), id: 'spy-1' });
      const created = createSpyFromUnit({ ...createEspionageCivState(), maxSpies: 1 }, spyUnit.id, civId, 'spy_scout', `${seed}-spy`);
      state.espionage = { [civId]: created.state };
      return { state, civId, spyUnit };
    }

    it('a killed spy ends its espionage record', () => {
      const { state, civId, spyUnit } = withSpy('removal-spy-killed');
      const { state: next } = removeUnits(state, [spyUnit.id], { reason: 'destroyed' });
      expect(next.espionage?.[civId]?.spies[spyUnit.id]).toBeUndefined();
    });

    it('a spy that goes off-map by design (consumed) keeps its record', () => {
      const { state, civId, spyUnit } = withSpy('removal-spy-consumed');
      const { state: next } = removeUnits(state, [spyUnit.id], { reason: 'consumed' });
      expect(next.units[spyUnit.id]).toBeUndefined();
      expect(next.civilizations[civId].units).not.toContain(spyUnit.id);
      expect(next.espionage?.[civId]?.spies[spyUnit.id]).toBeDefined();
    });
  });

  describe('caravan trade routes', () => {
    function withCaravan(seed: string) {
      const { state, civId, at } = fixture(seed);
      state.marketplace = {
        prices: {}, priceHistory: {}, fashionable: null, fashionTurnsLeft: 0,
        tradeRoutes: [
          { id: 'route-1', fromCityId: 'city-a', toCityId: 'city-b', goldPerTrip: 5, turnsPerTrip: 3 },
          { id: 'route-2', fromCityId: 'city-c', toCityId: 'city-d', goldPerTrip: 5, turnsPerTrip: 3 },
        ],
      };
      const caravan = add(state, { ...createUnit('caravan', civId, at, counters(590)), id: 'caravan-1', committedToRouteId: 'route-1' });
      return { state, caravan };
    }

    it('ends the route its runner was running and announces it from the returned data', () => {
      const { state, caravan } = withCaravan('removal-caravan');
      const bus = new EventBus();
      const ended = vi.fn();
      bus.on('trade:route-ended', ended);

      const { state: next, endedRoutes } = removeUnits(state, [caravan.id], { reason: 'destroyed', bus });

      expect(next.marketplace!.tradeRoutes.map(route => route.id)).toEqual(['route-2']);
      expect(endedRoutes).toEqual([{ routeId: 'route-1', fromCityId: 'city-a', toCityId: 'city-b', reason: 'unit-died' }]);
      expect(ended).toHaveBeenCalledTimes(1);
      expect(ended).toHaveBeenCalledWith(endedRoutes[0]);
    });

    it.each([
      ['disbanded', 'unit-disbanded'],
      ['trips-exhausted', 'trips-exhausted'],
      ['eliminated', 'unit-died'],
    ] as const)('closes the route with the right reason for %s', (reason, expected) => {
      const { state, caravan } = withCaravan(`removal-caravan-${reason}`);
      expect(removeUnits(state, [caravan.id], { reason }).endedRoutes[0].reason).toBe(expected);
    });

    it('is silent without a bus (lookahead) but still ends the route in state', () => {
      const { state, caravan } = withCaravan('removal-caravan-silent');
      const { state: next } = removeUnits(state, [caravan.id], { reason: 'destroyed' });
      expect(next.marketplace!.tradeRoutes.map(route => route.id)).toEqual(['route-2']);
    });
  });

  describe('slices', () => {
    it('works on a partial slice and does not invent absent tables', () => {
      const unit = { ...createUnit('warrior', 'player', { q: 0, r: 0 }, counters(600)), id: 'slice-unit' };
      const slice = { units: { [unit.id]: unit }, civilizations: { player: { units: [unit.id] } } } as unknown as Parameters<typeof removeUnitsFromSlice>[0];

      const { slice: next } = removeUnitsFromSlice(slice, [unit.id], 'destroyed');

      expect(next.units).toEqual({});
      expect(next.civilizations.player.units).toEqual([]);
      expect('minorCivs' in next).toBe(true);
      expect(next.minorCivs).toBeUndefined();
      expect('espionage' in next).toBe(false);
      expect('marketplace' in next).toBe(false);
    });
  });
});
