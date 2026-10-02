import type { GameMap, GameState, Unit } from '@/core/types';
import {
  computeExchangeDamage,
  resolveCombatStrengths,
  type CombatContext,
  type CombatStrengthBreakdown,
} from './combat-system';

/**
 * Battle forecast (#1135): what a unit-vs-unit fight is likely to do, from the SAME math the fight
 * uses. It is not a second resolver:
 *
 *   - strengths come from `resolveCombatStrengths` (the one function `resolveCombat` calls);
 *   - damage comes from `computeExchangeDamage` (the one damage formula), evaluated over a fixed
 *     grid of the two uniform rolls the fight draws, instead of two seeded draws.
 *
 * It never touches simulation RNG, never reads the seed of the coming roll, mutates nothing and
 * emits nothing -- same inputs, same forecast, so it cannot reveal or consume the exact result.
 * The output is an expectation, a bounded range and kill chances: honest about variance.
 *
 * This module is omniscient (it knows every modifier, as the resolver must). What a *player* may be
 * told is decided by `src/ui/battle-forecast-projection.ts`.
 */

export type BattleOutcomeBand = 'strong-advantage' | 'advantage' | 'even' | 'risky' | 'severe-risk';

export interface DamageRange {
  min: number;
  max: number;
  expected: number;
}

export interface CombatForecast {
  /** The post-command strength breakdown the fight itself would use (facts included). */
  strengths: CombatStrengthBreakdown;
  /** HP the defender is expected to lose. */
  defenderDamage: DamageRange;
  /** HP the attacker is expected to lose (counter-fire). */
  attackerDamage: DamageRange;
  /** 0..1 chance this single exchange destroys the defender / the attacker. */
  defenderKillChance: number;
  attackerDeathChance: number;
  band: BattleOutcomeBand;
}

/** Grid resolution per roll: 11 x 11 evaluations of a cheap closed-form formula. */
const FORECAST_GRID = 11;

export const BAND_THRESHOLDS = {
  /** attacker death chance at or above which the fight is a severe risk */
  severeRiskDeathChance: 0.5,
  /** attacker death chance at or above which the fight is risky */
  riskyDeathChance: 0.15,
  /** defender kill chance for a strong advantage (while the attacker is safe) */
  strongKillChance: 0.5,
  /** attacker death chance below which a strong advantage is still "safe" */
  safeDeathChance: 0.1,
  /** expected-HP edge (their loss minus yours) for an ordinary advantage */
  advantageEdge: 10,
  /** edge below which the fight tilts against you */
  riskyEdge: -8,
} as const;

export function classifyBattleOutcome(
  defenderKillChance: number,
  attackerDeathChance: number,
  expectedDefenderDamage: number,
  expectedAttackerDamage: number,
): BattleOutcomeBand {
  const t = BAND_THRESHOLDS;
  if (attackerDeathChance >= t.severeRiskDeathChance) return 'severe-risk';
  if (attackerDeathChance >= t.riskyDeathChance) return 'risky';
  if (defenderKillChance >= t.strongKillChance && attackerDeathChance < t.safeDeathChance) return 'strong-advantage';
  const edge = expectedDefenderDamage - expectedAttackerDamage;
  if (edge >= t.advantageEdge) return 'advantage';
  if (edge > t.riskyEdge) return 'even';
  return 'risky';
}

/**
 * The fixed roll grid, evaluated: one equal-weight sample per (ratio roll, base roll) cell. Shared by
 * `forecastCombat` and by multi-stage forecasts (#1213) that need the *distribution* of a first
 * exchange to chain a second one from it, not just its summary.
 */
export function sampleExchangeGrid(
  strengths: CombatStrengthBreakdown,
  atkStrength: number,
  defStrength: number,
  attacker: Unit,
  defender: Unit,
  context: CombatContext | undefined,
  era: number | undefined,
): Array<{ attackerDamage: number; defenderDamage: number }> {
  const n = FORECAST_GRID;
  const samples: Array<{ attackerDamage: number; defenderDamage: number }> = [];
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      samples.push(computeExchangeDamage({
        atkStrength, defStrength, attacker, defender, context, era, exchange: strengths.exchange,
        ratioRoll: (i + 0.5) / n, baseRoll: (j + 0.5) / n,
      }));
    }
  }
  return samples;
}

export function forecastCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  context?: CombatContext,
  era?: number,
  state?: GameState,
): CombatForecast {
  const strengths = resolveCombatStrengths(attacker, defender, map, context, state);
  const atkStrength = strengths.attackerStrength;
  const defStrength = strengths.defenderStrength;

  // The resolver's two degenerate branches, mirrored from their outcomes (not re-derived rules).
  if (defStrength === 0 || atkStrength === 0) {
    const defenderLoses = defStrength === 0;
    const loss = (health: number, dies: boolean): DamageRange => ({ min: dies ? health : 0, max: dies ? health : 0, expected: dies ? health : 0 });
    const defenderDamage = loss(defender.health, defenderLoses);
    const attackerDamage = loss(attacker.health, !defenderLoses);
    return {
      strengths, defenderDamage, attackerDamage,
      defenderKillChance: defenderLoses ? 1 : 0,
      attackerDeathChance: defenderLoses ? 0 : 1,
      band: defenderLoses ? 'strong-advantage' : 'severe-risk',
    };
  }

  let defTotal = 0; let atkTotal = 0; let kills = 0; let deaths = 0;
  let defMin = Infinity; let defMax = -Infinity; let atkMin = Infinity; let atkMax = -Infinity;
  const samples = sampleExchangeGrid(strengths, atkStrength, defStrength, attacker, defender, context, era);
  for (const { attackerDamage, defenderDamage } of samples) {
    defTotal += defenderDamage; atkTotal += attackerDamage;
    defMin = Math.min(defMin, defenderDamage); defMax = Math.max(defMax, defenderDamage);
    atkMin = Math.min(atkMin, attackerDamage); atkMax = Math.max(atkMax, attackerDamage);
    if (defender.health - defenderDamage <= 0) kills++;
    if (attacker.health - attackerDamage <= 0) deaths++;
  }
  // The grid's mid-point rolls never reach the extremes a real fight can draw, and both damages are
  // monotone in each roll, so the four corners bound the range exactly (rolls live in [0, 1)).
  for (const ratioRoll of [0, 1]) {
    for (const baseRoll of [0, 1]) {
      const { attackerDamage, defenderDamage } = computeExchangeDamage({
        atkStrength, defStrength, attacker, defender, context, era, exchange: strengths.exchange, ratioRoll, baseRoll,
      });
      defMin = Math.min(defMin, defenderDamage); defMax = Math.max(defMax, defenderDamage);
      atkMin = Math.min(atkMin, attackerDamage); atkMax = Math.max(atkMax, attackerDamage);
    }
  }
  const cells = samples.length;
  const clamp = (value: number, health: number) => Math.min(value, health);
  const defenderDamage: DamageRange = {
    min: clamp(defMin, defender.health), max: clamp(defMax, defender.health), expected: Math.round(clamp(defTotal / cells, defender.health)),
  };
  const attackerDamage: DamageRange = {
    min: clamp(atkMin, attacker.health), max: clamp(atkMax, attacker.health), expected: Math.round(clamp(atkTotal / cells, attacker.health)),
  };
  const defenderKillChance = kills / cells;
  const attackerDeathChance = deaths / cells;
  return {
    strengths, defenderDamage, attackerDamage, defenderKillChance, attackerDeathChance,
    band: classifyBattleOutcome(defenderKillChance, attackerDeathChance, defenderDamage.expected, attackerDamage.expected),
  };
}
