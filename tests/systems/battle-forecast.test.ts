import { describe, expect, it, vi } from 'vitest';
import type { GameMap, Unit } from '@/core/types';
import { forecastCombat, classifyBattleOutcome } from '@/systems/battle-forecast';
import {
  calculateCombatStrengths, computeExchangeDamage, deterministicCombatSeed, resolveCombat, resolveCombatStrengths,
} from '@/systems/combat-system';

const map: GameMap = { width: 12, height: 12, wrapsHorizontally: false, rivers: [], tiles: {} } as unknown as GameMap;

function unit(overrides: Partial<Unit> & { id: string; type: Unit['type'] }): Unit {
  return {
    owner: 'player', position: { q: 1, r: 1 }, health: 100, experience: 0, movementPointsLeft: 2,
    hasMoved: false, hasActed: false, isResting: false, ...overrides,
  } as Unit;
}

const knight = unit({ id: 'k', type: 'knight' as Unit['type'] });
const spearman = unit({ id: 's', type: 'spearman', owner: 'enemy', position: { q: 2, r: 1 } });

describe('battle forecast (#1135) uses the real combat math', () => {
  it('its strengths are exactly the strengths the fight resolves with', () => {
    const forecast = forecastCombat(knight, spearman, map);
    expect(forecast.strengths.attackerStrength).toBe(resolveCombatStrengths(knight, spearman, map).attackerStrength);
    expect(forecast.strengths.attackerStrength).toBe(calculateCombatStrengths(knight, spearman, map).attackerStrength);
    expect(forecast.strengths.defenderStrength).toBe(calculateCombatStrengths(knight, spearman, map).defenderStrength);
  });

  it('every real, seeded fight lands inside the forecast range', () => {
    const fighters: Array<[Unit, Unit]> = [
      [knight, spearman],
      [unit({ id: 'a', type: 'warrior' }), unit({ id: 'b', type: 'swordsman', owner: 'enemy', position: { q: 2, r: 1 }, health: 60 })],
      [unit({ id: 'c', type: 'archer', position: { q: 1, r: 1 } }), unit({ id: 'd', type: 'warrior', owner: 'enemy', position: { q: 3, r: 1 } })],
    ];
    for (const era of [0, 2, 4]) {
      for (const [attacker, defender] of fighters) {
        const forecast = forecastCombat(attacker, defender, map, undefined, era);
        for (let turn = 1; turn <= 60; turn++) {
          const seed = deterministicCombatSeed('g', turn, attacker.id, defender.id);
          const result = resolveCombat(attacker, defender, map, seed, undefined, era);
          expect(result.defenderDamage).toBeGreaterThanOrEqual(forecast.defenderDamage.min);
          expect(result.defenderDamage).toBeLessThanOrEqual(forecast.defenderDamage.max);
          expect(result.attackerDamage).toBeGreaterThanOrEqual(forecast.attackerDamage.min);
          expect(result.attackerDamage).toBeLessThanOrEqual(forecast.attackerDamage.max);
        }
      }
    }
  });

  it('computeExchangeDamage is the formula resolveCombat uses (same rolls, same damage)', () => {
    const seed = deterministicCombatSeed('g', 3, knight.id, spearman.id);
    let state = seed;
    const rng = () => { state = (state * 48271) % 2147483647; return state / 2147483647; };
    const ratioRoll = rng(); const baseRoll = rng();
    const strengths = resolveCombatStrengths(knight, spearman, map);
    const direct = computeExchangeDamage({
      atkStrength: strengths.attackerStrength, defStrength: strengths.defenderStrength, attacker: knight, defender: spearman,
      era: 3, exchange: strengths.exchange, ratioRoll, baseRoll,
    });
    const real = resolveCombat(knight, spearman, map, seed, undefined, 3);
    expect(direct).toEqual({ attackerDamage: real.attackerDamage, defenderDamage: real.defenderDamage });
  });

  it('is a pure read: same input, same forecast, no mutation, no randomness consumed', () => {
    const random = vi.spyOn(Math, 'random');
    const before = JSON.stringify([knight, spearman]);
    const a = forecastCombat(knight, spearman, map, undefined, 3);
    const b = forecastCombat(knight, spearman, map, undefined, 3);
    expect(a).toEqual(b);
    expect(JSON.stringify([knight, spearman])).toBe(before);
    expect(random).not.toHaveBeenCalled();
    random.mockRestore();
  });
});

describe('battle forecast outcome bands', () => {
  it('a clearly favourable fight is an advantage, ideally with a likely kill', () => {
    const weak = unit({ id: 'w', type: 'warrior', owner: 'enemy', position: { q: 2, r: 1 }, health: 25 });
    const forecast = forecastCombat(unit({ id: 'big', type: 'swordsman' }), weak, map, undefined, 3);
    expect(['strong-advantage', 'advantage']).toContain(forecast.band);
    expect(forecast.defenderKillChance).toBeGreaterThan(0.5);
    expect(forecast.band).toBe('strong-advantage');
  });

  it('a clearly unfavourable fight is risky or worse, and a likely attacker death is a severe risk', () => {
    const wounded = unit({ id: 'w', type: 'warrior', health: 15 });
    const strong = unit({ id: 'big', type: 'swordsman', owner: 'enemy', position: { q: 2, r: 1 } });
    const forecast = forecastCombat(wounded, strong, map, undefined, 3);
    expect(forecast.attackerDeathChance).toBeGreaterThan(0.5);
    expect(forecast.band).toBe('severe-risk');
  });

  it('a mirror match is an even fight', () => {
    const forecast = forecastCombat(unit({ id: 'a', type: 'swordsman' }), unit({ id: 'b', type: 'swordsman', owner: 'enemy', position: { q: 2, r: 1 } }), map, undefined, 3);
    expect(forecast.band).toBe('even');
  });

  it('the thresholds order the bands sensibly', () => {
    expect(classifyBattleOutcome(0.9, 0, 80, 5)).toBe('strong-advantage');
    expect(classifyBattleOutcome(0.1, 0.02, 40, 20)).toBe('advantage');
    expect(classifyBattleOutcome(0, 0, 25, 25)).toBe('even');
    expect(classifyBattleOutcome(0, 0.2, 25, 25)).toBe('risky');
    expect(classifyBattleOutcome(0, 0.6, 10, 40)).toBe('severe-risk');
  });

  it('a 0-strength defender is destroyed outright; a 0-strength attacker never wins', () => {
    const settlerLike = unit({ id: 'x', type: 'settler', owner: 'enemy', position: { q: 2, r: 1 } });
    expect(forecastCombat(knight, settlerLike, map).defenderKillChance).toBe(1);
    const scout = unit({ id: 'sc', type: 'worker' });
    const f = forecastCombat(scout, spearman, map);
    expect(f.attackerDeathChance).toBe(1);
    expect(f.band).toBe('severe-risk');
  });
});

// ───────────────────────── #1213 — two-stage air-strike chain ─────────────────────────
import { forecastAirStrike } from '@/systems/air-strike-forecast';
import { resolveAirStrike } from '@/systems/air-operations-system';
import { buildCombatContextForDefender } from '@/systems/combat-context';
import { resolveCombatEra } from '@/systems/era-resolution';
import type { GameState } from '@/core/types';

describe('air-strike forecast chain (#1213)', () => {
  const base = (id: string, type: Unit['type'], owner: string, pos: { q: number; r: number }, extra: Partial<Unit> = {}): Unit => ({
    id, type, owner, position: pos, movementPointsLeft: 4, health: 100, experience: 0,
    hasMoved: false, hasActed: false, isResting: false, ...extra,
  });
  const world = (turn: number, strikerHealth = 100): GameState => ({
    gameId: 'air-chain', turn, currentPlayer: 'player',
    map: { width: 10, height: 10, wrapsHorizontally: false, tiles: {}, rivers: [] },
    units: {
      striker: base('striker', 'bomber', 'player', { q: 2, r: 2 }, { health: strikerHealth, airBase: { kind: 'city', cityId: 'city-1' } }),
      interceptor: base('interceptor', 'jet_fighter', 'enemy', { q: 4, r: 2 }, { airBase: { kind: 'city', cityId: 'enemy-city' }, airMission: 'intercept' }),
      target: base('target', 'swordsman', 'enemy', { q: 5, r: 2 }),
    },
    cities: {
      'city-1': { id: 'city-1', owner: 'player', position: { q: 2, r: 2 }, buildings: ['airfield'] },
      'enemy-city': { id: 'enemy-city', owner: 'enemy', position: { q: 4, r: 2 }, buildings: ['airfield'] },
    },
    civilizations: {
      player: { units: ['striker'], cities: ['city-1'], techState: { completed: [] }, diplomacy: { atWarWith: ['enemy'], events: [] } },
      enemy: { units: ['interceptor', 'target'], cities: ['enemy-city'], techState: { completed: [] }, diplomacy: { atWarWith: ['player'], events: [] } },
    },
  } as unknown as GameState);

  const forecastFor = (state: GameState) => {
    const striker = state.units.striker!; const interceptor = state.units.interceptor!; const target = state.units.target!;
    return forecastAirStrike({
      state, map: state.map, striker,
      leg: { kind: 'unit', target, era: resolveCombatEra(state, striker, target), context: buildCombatContextForDefender(state, striker, target) },
      interception: { interceptor, era: resolveCombatEra(state, interceptor, striker), context: buildCombatContextForDefender(state, interceptor, striker, { isIntercepting: true }) },
    });
  };

  it('every real strike (many seeds) lands inside the forecast ranges of the branch it took', () => {
    for (let turn = 1; turn <= 60; turn++) {
      const state = world(turn);
      const f = forecastFor(state).ifIntercepted!;
      const real = resolveAirStrike(state, 'striker', { q: 5, r: 2 });
      expect(real.ok).toBe(true);
      expect(real.ok && real.interception?.interceptorId).toBe('interceptor');
      const after = real.state;
      const strikerLoss = after.units.striker ? 100 - after.units.striker.health : 100;
      const interceptorLoss = after.units.interceptor ? 100 - after.units.interceptor.health : 100;
      const targetLoss = after.units.target ? 100 - after.units.target.health : 100;
      expect(strikerLoss, `turn ${turn} striker`).toBeGreaterThanOrEqual(f.strikerDamage.min);
      expect(strikerLoss, `turn ${turn} striker`).toBeLessThanOrEqual(f.strikerDamage.max);
      expect(interceptorLoss, `turn ${turn} interceptor`).toBeLessThanOrEqual(f.stage.interceptorDamage.max);
      expect(targetLoss, `turn ${turn} target`).toBeGreaterThanOrEqual(f.targetDamage.min);
      expect(targetLoss, `turn ${turn} target`).toBeLessThanOrEqual(f.targetDamage.max);
      if (!after.units.striker) expect(f.strikerDeathChance).toBeGreaterThan(0);
    }
  });

  it('conditions the target leg on what interception did to the striker (not a full-health striker)', () => {
    const f = forecastFor(world(5));
    expect(f.ifIntercepted!.targetDamage.expected).toBeLessThan(f.withoutInterception.targetDamage.expected);
    expect(f.ifIntercepted!.reachesTargetChance).toBeLessThan(1);
    expect(f.ifIntercepted!.strikerDamage.expected).toBeGreaterThan(f.withoutInterception.strikerDamage.expected - 1);
  });

  it('a striker that is nearly dead is almost certainly lost before it reaches the target', () => {
    const f = forecastFor(world(5, 3)).ifIntercepted!;
    expect(f.stage.strikerDestroyedChance).toBeGreaterThan(0.9);
    expect(f.targetDamage.expected).toBeLessThanOrEqual(5);
  });

  it('without an interceptor it is exactly the ordinary forecast for the target leg', () => {
    const state = world(5);
    const striker = state.units.striker!; const target = state.units.target!;
    const ctx = buildCombatContextForDefender(state, striker, target);
    const era = resolveCombatEra(state, striker, target);
    const chain = forecastAirStrike({ state, map: state.map, striker, leg: { kind: 'unit', target, era, context: ctx } });
    const direct = forecastCombat(striker, target, state.map, ctx, era, state);
    expect(chain.ifIntercepted).toBeUndefined();
    expect(chain.withoutInterception.targetDamage).toEqual(direct.defenderDamage);
    expect(chain.withoutInterception.strikerDamage).toEqual(direct.attackerDamage);
    expect(chain.withoutInterception.band).toBe(direct.band);
  });

  it('consumes no randomness: a spied Math.random is never touched and repeated forecasts agree', () => {
    const spy = vi.spyOn(Math, 'random');
    const a = forecastFor(world(7)); const b = forecastFor(world(7));
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect(b).toEqual(a);
  });
});
