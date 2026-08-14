import { describe, expect, it } from 'vitest';
import type { GameState } from '@/core/types';
import { resolveCoastalBatteryCounterfire } from '@/systems/coastal-defense-system';

function makeState(): GameState {
  return {
    turn: 42,
    cities: {
      port: {
        id: 'port', name: 'Port', owner: 'player', position: { q: 0, r: 0 },
        population: 1, food: 0, foodNeeded: 15, buildings: ['coastal_battery'],
        productionQueue: [], productionProgress: 0, ownedTiles: [], workedTiles: [],
        focus: 'balanced', maturity: 'core', unrestLevel: 0, unrestTurns: 0,
        spyUnrestBonus: 0,
      },
    },
    units: {
      ship: {
        id: 'ship', type: 'pirate_frigate', owner: 'pirates', position: { q: 1, r: 0 },
        movementPointsLeft: 0, health: 100, experience: 0, hasMoved: true, hasActed: true,
        isResting: false,
      },
    },
  } as unknown as GameState;
}

describe('resolveCoastalBatteryCounterfire', () => {
  it('returns twenty percent of the first damaging naval siege, marks only that city, and identifies its owner', () => {
    const state = makeState();
    const result = resolveCoastalBatteryCounterfire(state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 40, source: 'pirate',
    });

    expect(result.damage).toBe(8);
    expect(result.state).not.toBe(state);
    expect(result.state.units.ship.health).toBe(92);
    expect(result.state.cities.port.coastalBatteryCounterfireTurn).toBe(42);
    expect(result.event).toEqual({
      cityId: 'port', attackerUnitId: 'ship', recipientCivId: 'player', source: 'pirate', damage: 8, attackerDied: false,
    });
    expect(state.units.ship.health).toBe(100);
    expect(state.cities.port.coastalBatteryCounterfireTurn).toBeUndefined();
  });

  it('caps damage, never fires twice in a turn, and rejects non-naval or zero-damage sieges', () => {
    const state = makeState();
    const first = resolveCoastalBatteryCounterfire(state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 100, source: 'ai',
    });
    expect(first.damage).toBe(12);
    expect(resolveCoastalBatteryCounterfire(first.state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 100, source: 'ai',
    }).event).toBeUndefined();
    expect(resolveCoastalBatteryCounterfire(state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'land', cityDamage: 100, source: 'barbarian',
    }).event).toBeUndefined();
    expect(resolveCoastalBatteryCounterfire(state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 0, source: 'player',
    }).event).toBeUndefined();
  });

  it('consumes the first damaging hit even when the rounded retaliation is zero', () => {
    const state = makeState();
    const first = resolveCoastalBatteryCounterfire(state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 1, source: 'ai',
    });

    expect(first.damage).toBe(0);
    expect(first.event).toBeUndefined();
    expect(first.state.cities.port.coastalBatteryCounterfireTurn).toBe(state.turn);
    expect(resolveCoastalBatteryCounterfire(first.state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 40, source: 'ai',
    }).damage).toBe(0);
  });

  it('tracks each Battery city independently and resets on the next global turn', () => {
    const state = makeState();
    state.cities.secondPort = { ...state.cities.port, id: 'secondPort', position: { q: 3, r: 0 } };
    const firstPort = resolveCoastalBatteryCounterfire(state, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 40, source: 'pirate',
    });
    const secondPort = resolveCoastalBatteryCounterfire(firstPort.state, {
      cityId: 'secondPort', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 40, source: 'pirate',
    });
    expect(secondPort.damage).toBe(8);

    const nextTurn = resolveCoastalBatteryCounterfire({ ...firstPort.state, turn: state.turn + 1 }, {
      cityId: 'port', attackerUnitId: 'ship', attackerDomain: 'naval', cityDamage: 40, source: 'pirate',
    });
    expect(nextTurn.damage).toBe(8);
  });
});
