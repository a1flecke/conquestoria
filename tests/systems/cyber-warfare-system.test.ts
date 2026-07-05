import { describe, it, expect } from 'vitest';
import {
  processCyberDrain,
  computeCyberDrainRoll,
} from '@/systems/cyber-warfare-system';
import type { City, GameState, Unit } from '@/core/types';

function makeCyberUnit(overrides: Partial<Unit> & { id: string; owner: string; position: { q: number; r: number } }): Unit {
  return {
    type: 'cyber_unit', health: 100, movementPointsLeft: 3,
    hasMoved: true, hasActed: true, experience: 0, isResting: false,
    ...overrides,
  } as Unit;
}

function makeCity(overrides: Partial<City> & { id: string; owner: string; position: { q: number; r: number } }): City {
  return {
    name: overrides.id, buildings: [], productionQueue: [], productionProgress: 0,
    food: 0, foodNeeded: 15, population: 1, ownedTiles: [], workedTiles: [],
    focus: 'balanced', maturity: 'settled', unrestLevel: 0, unrestTurns: 0,
    spyUnrestBonus: 0, idleProduction: null,
    ...overrides,
  } as unknown as City;
}

function makeState(opts: {
  turn?: number;
  cities: City[];
  units: Unit[];
  atWar?: boolean;
}): GameState {
  const atWar = opts.atWar ?? true;
  return {
    turn: opts.turn ?? 1, era: 12, currentPlayer: 'p1',
    cities: Object.fromEntries(opts.cities.map(c => [c.id, c])),
    units: Object.fromEntries(opts.units.map(u => [u.id, u])),
    civilizations: {
      p1: {
        id: 'p1', name: 'Alpha', cities: opts.cities.filter(c => c.owner === 'p1').map(c => c.id),
        diplomacy: { atWarWith: atWar ? ['p2'] : [], relationships: {}, treaties: [], events: [], treacheryScore: 0 } as any,
        gold: 100,
      },
      p2: {
        id: 'p2', name: 'Beta', cities: opts.cities.filter(c => c.owner === 'p2').map(c => c.id),
        diplomacy: { atWarWith: atWar ? ['p1'] : [], relationships: {}, treaties: [], events: [], treacheryScore: 0 } as any,
        gold: 100,
      },
    },
  } as unknown as GameState;
}

describe('processCyberDrain', () => {
  it('drains 2 gold from an at-war victim city with an adjacent enemy cyber unit and no CDC', () => {
    const state = makeState({
      turn: 1,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 } })],
      units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
    });

    const result = processCyberDrain(state, 'p1', 10);

    expect(result.remainingGold).toBe(8);
    expect(result.creditsByOwner.p2).toBe(2);
    expect(result.events).toEqual([
      { cityId: 'city-p1', cityName: 'city-p1', drainerOwner: 'p2', drainerUnitId: 'cu1', goldLost: 2, blocked: false },
    ]);
  });

  it('caps the drain at the available income this turn (min(2, victimGold))', () => {
    const state = makeState({
      turn: 1,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 } })],
      units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
    });

    const result = processCyberDrain(state, 'p1', 1);

    expect(result.remainingGold).toBe(0);
    expect(result.creditsByOwner.p2).toBe(1);
    expect(result.events[0].goldLost).toBe(1);
  });

  it('does not drain when the civs are not at war', () => {
    const state = makeState({
      turn: 1,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 } })],
      units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
      atWar: false,
    });

    const result = processCyberDrain(state, 'p1', 10);

    expect(result.remainingGold).toBe(10);
    expect(result.creditsByOwner).toEqual({});
    expect(result.events).toEqual([]);
  });

  it('does not drain when the cyber unit is not adjacent (hexDistance > 1)', () => {
    const state = makeState({
      turn: 1,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 } })],
      units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 9, r: 9 } })],
    });

    const result = processCyberDrain(state, 'p1', 10);

    expect(result.remainingGold).toBe(10);
    expect(result.events).toEqual([]);
  });

  it('drains 4 total gold when two adjacent enemy cyber units threaten the same city', () => {
    const state = makeState({
      turn: 1,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 } })],
      units: [
        makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } }),
        makeCyberUnit({ id: 'cu2', owner: 'p2', position: { q: 0, r: 0 } }),
      ],
    });

    const result = processCyberDrain(state, 'p1', 10);

    expect(result.remainingGold).toBe(6);
    expect(result.creditsByOwner.p2).toBe(4);
    expect(result.events).toHaveLength(2);
  });

  it('blocks the drain when Cyber Defense Center rolls under the block chance, crediting no gold', () => {
    // Find a (turn, cityId, unitId) combination whose roll is known relative to 0.65.
    let turn = 1;
    while (computeCyberDrainRoll(turn, 'city-p1', 'cu1') >= 0.65) turn++;

    const state = makeState({
      turn,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 }, buildings: ['cyber_defense_center'] })],
      units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
    });

    const result = processCyberDrain(state, 'p1', 10);

    expect(result.remainingGold).toBe(10);
    expect(result.creditsByOwner).toEqual({});
    expect(result.events).toEqual([
      { cityId: 'city-p1', cityName: 'city-p1', drainerOwner: 'p2', drainerUnitId: 'cu1', goldLost: 0, blocked: true },
    ]);
  });

  it('signals_hub raises the CDC block chance to 0.75 — a roll between 0.65 and 0.75 is blocked only with the hub', () => {
    let turn = 1;
    let roll = computeCyberDrainRoll(turn, 'city-p1', 'cu1');
    while (!(roll >= 0.65 && roll < 0.75)) {
      turn++;
      roll = computeCyberDrainRoll(turn, 'city-p1', 'cu1');
    }

    const withoutHub = processCyberDrain(
      makeState({
        turn,
        cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 }, buildings: ['cyber_defense_center'] })],
        units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
      }),
      'p1',
      10,
    );
    expect(withoutHub.events[0].blocked).toBe(false);

    const withHub = processCyberDrain(
      makeState({
        turn,
        cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 }, buildings: ['cyber_defense_center', 'signals_hub'] })],
        units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
      }),
      'p1',
      10,
    );
    expect(withHub.events[0].blocked).toBe(true);
  });

  it('is deterministic — the same state produces identical results across repeated calls', () => {
    const state = makeState({
      turn: 7,
      cities: [makeCity({ id: 'city-p1', owner: 'p1', position: { q: 1, r: 0 } })],
      units: [makeCyberUnit({ id: 'cu1', owner: 'p2', position: { q: 2, r: 0 } })],
    });

    const first = processCyberDrain(state, 'p1', 10);
    const second = processCyberDrain(state, 'p1', 10);

    expect(second).toEqual(first);
  });
});
