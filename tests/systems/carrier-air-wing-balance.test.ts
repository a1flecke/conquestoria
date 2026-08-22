import { describe, expect, it } from 'vitest';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import { calculateCombatStrengths } from '@/systems/combat-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { getAirBaseRoster, getAirBaseCapacity } from '@/systems/air-operations-system';
import { isSubmarineConcealedFrom } from '@/systems/concealment';
import type { GameState, Unit } from '@/core/types';

function tile(terrain: string) {
  return { terrain };
}

function makeCombatState(): GameState {
  return {
    turn: 1,
    units: {},
    cities: {},
    civilizations: {
      'civ-a': { diplomacy: { atWarWith: ['civ-b'], events: [] }, visibility: { tiles: {} }, techState: { completed: [], currentResearch: null, researchProgress: 0 } },
      'civ-b': { diplomacy: { atWarWith: ['civ-a'], events: [] }, visibility: { tiles: {} }, techState: { completed: [], currentResearch: null, researchProgress: 0 } },
    },
    map: {
      width: 10, height: 10, wrapsHorizontally: false,
      tiles: { '0,0': tile('grassland'), '1,0': tile('ocean') },
    },
  } as unknown as GameState;
}

describe('carrier air wing balance (#582)', () => {
  it('Naval Strike Aircraft\'s 1.35x modifier gives it a real edge over a plain Jet Fighter specifically against a Destroyer, without being overpowered against a land unit', () => {
    const state = makeCombatState();
    const strike: Unit = {
      id: 'strike', type: 'naval_strike_aircraft', owner: 'civ-a', position: { q: 0, r: 0 },
      movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const jet: Unit = {
      id: 'jet', type: 'jet_fighter', owner: 'civ-a', position: { q: 0, r: 0 },
      movementPointsLeft: 6, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const destroyer: Unit = {
      id: 'destroyer', type: 'destroyer', owner: 'civ-b', position: { q: 1, r: 0 },
      movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };
    const warrior: Unit = {
      id: 'warrior', type: 'warrior', owner: 'civ-b', position: { q: 1, r: 0 },
      movementPointsLeft: 1, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    };

    // Against a Destroyer: Naval Strike Aircraft's typed anti-naval
    // modifier gives it a real edge -- its 38 base strength ends up higher
    // than Jet Fighter's flat 50 once the 1.35x naval multiplier applies
    // (38 * 1.35 = 51.3), even though Jet Fighter is the stronger unit on
    // raw stats alone.
    const strikeVsDestroyer = calculateCombatStrengths(strike, destroyer, state.map, buildCombatContextForDefender(state, strike, destroyer));
    const jetVsDestroyer = calculateCombatStrengths(jet, destroyer, state.map, buildCombatContextForDefender(state, jet, destroyer));
    expect(strikeVsDestroyer.attackerStrength).toBeGreaterThan(jetVsDestroyer.attackerStrength);
    expect(strikeVsDestroyer.attackerStrength).toBeCloseTo(UNIT_DEFINITIONS.naval_strike_aircraft.strength * 1.35, 1);

    // Against a land unit, the same multiplier must not apply -- Naval
    // Strike Aircraft stays at its plain, lower base strength and is not
    // overpowered relative to Jet Fighter there.
    const strikeVsWarrior = calculateCombatStrengths(strike, warrior, state.map, buildCombatContextForDefender(state, strike, warrior));
    const jetVsWarrior = calculateCombatStrengths(jet, warrior, state.map, buildCombatContextForDefender(state, jet, warrior));
    expect(strikeVsWarrior.attackerStrength).toBeCloseTo(UNIT_DEFINITIONS.naval_strike_aircraft.strength, 1);
    expect(strikeVsWarrior.attackerStrength).toBeLessThan(jetVsWarrior.attackerStrength);
  });

  it('a 2-slot Carrier cannot run all three roles at once; a 3-slot Supercarrier can', () => {
    expect(UNIT_DEFINITIONS.carrier.carrierDeckCapacity).toBe(2);
    expect(UNIT_DEFINITIONS.supercarrier.carrierDeckCapacity).toBe(3);

    const makeWing = (hostType: 'carrier' | 'supercarrier'): GameState => {
      const host: Unit = {
        id: 'host', type: hostType, owner: 'civ-a', position: { q: 0, r: 0 },
        movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
      };
      const fighter: Unit = {
        id: 'fighter', type: 'jet_fighter', owner: 'civ-a', position: { q: 0, r: 0 },
        movementPointsLeft: 6, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        airBase: { kind: 'carrier', unitId: 'host' },
      };
      const strike: Unit = {
        id: 'strike', type: 'naval_strike_aircraft', owner: 'civ-a', position: { q: 0, r: 0 },
        movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        airBase: { kind: 'carrier', unitId: 'host' },
      };
      const patrol: Unit = {
        id: 'patrol', type: 'maritime_patrol_aircraft', owner: 'civ-a', position: { q: 0, r: 0 },
        movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        airBase: { kind: 'carrier', unitId: 'host' },
      };
      return {
        turn: 1,
        units: { host, fighter, strike, patrol },
        cities: {},
        civilizations: {},
        map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {} },
      } as unknown as GameState;
    };

    const carrierState = makeWing('carrier');
    const carrierRoster = getAirBaseRoster(carrierState, { kind: 'carrier', unitId: 'host' });
    const carrierCapacity = getAirBaseCapacity(carrierState, { kind: 'carrier', unitId: 'host' });
    expect(carrierRoster.length).toBeGreaterThan(carrierCapacity);

    const supercarrierState = makeWing('supercarrier');
    const supercarrierRoster = getAirBaseRoster(supercarrierState, { kind: 'carrier', unitId: 'host' });
    const supercarrierCapacity = getAirBaseCapacity(supercarrierState, { kind: 'carrier', unitId: 'host' });
    expect(supercarrierRoster.length).toBeLessThanOrEqual(supercarrierCapacity);
  });

  it('Destroyer remains the only persistent (no-action-cost) submarine detector; Patrol\'s coverage vanishes the turn after it flies', () => {
    // Destroyer: passive detection from merely existing within its
    // concealedNavalRange, no player action required this turn.
    const destroyerState: GameState = {
      turn: 3,
      units: {
        destroyer: {
          id: 'destroyer', type: 'destroyer', owner: 'player', position: { q: 0, r: 0 },
          movementPointsLeft: 5, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        },
        sub: {
          id: 'sub', type: 'submarine', owner: 'ai-1', position: { q: 2, r: 0 },
          movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        },
      },
      cities: {},
      civilizations: {},
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: { '0,0': tile('ocean'), '2,0': tile('ocean') } },
    } as unknown as GameState;
    const destroyerSub = destroyerState.units['sub']!;
    expect(isSubmarineConcealedFrom(destroyerState, destroyerSub, 'player')).toBe(false);

    // Patrol: an active reveal from the SAME turn it was flown still
    // detects...
    const sameTurnState: GameState = {
      turn: 5,
      units: {
        sub: {
          id: 'sub', type: 'submarine', owner: 'ai-1', position: { q: 0, r: 0 },
          movementPointsLeft: 4, health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
        },
      },
      cities: {},
      patrolReveals: [{ ownerCivId: 'player', center: { q: 0, r: 0 }, range: 6, expiresAtTurn: 5 }],
      civilizations: {},
      map: { width: 10, height: 10, wrapsHorizontally: false, tiles: { '0,0': tile('ocean') } },
    } as unknown as GameState;
    expect(isSubmarineConcealedFrom(sameTurnState, sameTurnState.units['sub']!, 'player')).toBe(false);

    // ...but that same reveal, now one turn stale, no longer detects --
    // coverage vanishes the turn after the patrol flew, unlike Destroyer's
    // persistent passive range.
    const nextTurnState: GameState = { ...sameTurnState, turn: 6 };
    expect(isSubmarineConcealedFrom(nextTurnState, nextTurnState.units['sub']!, 'player')).toBe(true);
  });
});
