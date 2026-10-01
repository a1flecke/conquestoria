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
