import type { GameMap, GameState, Unit } from '@/core/types';
import {
  classifyBattleOutcome,
  forecastCombat,
  sampleExchangeGrid,
  type BattleOutcomeBand,
  type DamageRange,
} from './battle-forecast';
import { resolveCombatStrengths, type CombatContext } from './combat-system';

/**
 * Air-strike forecast (#1213): the two-stage exchange of a strike, from the same math the strike uses.
 *
 *   striker -> [interceptor exchange] -> if the striker is still alive -> target strike
 *
 * Like `battle-forecast.ts` this is NOT a resolver. It never calls `resolveAirStrike`, never reads the
 * seed of the coming fight, mutates nothing and emits nothing. Stage one is `forecastCombat`'s own fixed
 * roll grid, so the striker's *surviving health* is a distribution; stage two is evaluated at each
 * distinct surviving health and mixed by weight, so the target leg is conditioned on what interception
 * did to the striker rather than pretending it starts at full health. A striker destroyed in stage one
 * contributes no target damage.
 *
 * The inputs (contexts, the city leg) are supplied by the caller already prepared for the audience --
 * this module is omniscient about whatever it is handed. What a *player* may be told, and which
 * interceptor (if any) may be reasoned about at all, is decided by
 * `src/ui/air-strike-forecast-projection.ts`.
 */

export interface AirStrikeUnitLeg {
  kind: 'unit';
  target: Unit;
  context: CombatContext | undefined;
  era: number | undefined;
}

export interface AirStrikeCityLeg {
  kind: 'city';
  cityHp: number;
  /** HP the city loses when struck by this striker at the given health (the shared city-siege formula). */
  hpLossForStriker: (striker: Unit) => number;
}

export interface AirStrikeInterception {
  interceptor: Unit;
  context: CombatContext | undefined;
  era: number | undefined;
}

export interface AirStrikeForecastInput {
  state: GameState;
  map: GameMap;
  striker: Unit;
  leg: AirStrikeUnitLeg | AirStrikeCityLeg;
  interception?: AirStrikeInterception;
}

export interface AirStrikeBranch {
  /** Total HP the striker is expected to lose across both stages. */
  strikerDamage: DamageRange;
  /** 0..1 chance the striker is destroyed before or during the target strike. */
  strikerDeathChance: number;
  /** 0..1 chance the striker survives interception and actually attacks the target. */
  reachesTargetChance: number;
  /** HP the target is expected to lose over the whole mission (0 when the striker never arrives). */
  targetDamage: DamageRange;
  /** 0..1 chance the target unit is destroyed (always 0 for a city). */
  targetKillChance: number;
  band: BattleOutcomeBand;
}

export interface AirInterceptionStage {
  interceptor: Unit;
  /** HP the striker loses to the interception alone. */
  strikerDamage: DamageRange;
  strikerDestroyedChance: number;
  interceptorDamage: DamageRange;
  interceptorDestroyedChance: number;
}

export interface AirStrikeForecast {
  /** The mission if nothing intercepts. */
  withoutInterception: AirStrikeBranch;
  /** The mission if the supplied interceptor does intercept; absent when none was supplied. */
  ifIntercepted?: AirStrikeBranch & { stage: AirInterceptionStage };
}

interface LegOutcome {
  target: DamageRange;
  killChance: number;
  strikerDamage: DamageRange;
  strikerDeathChance: number;
}

function evaluateLeg(input: AirStrikeForecastInput, striker: Unit): LegOutcome {
  const { leg, map, state } = input;
  if (leg.kind === 'city') {
    const loss = Math.min(leg.hpLossForStriker(striker), leg.cityHp);
    return {
      target: { min: loss, max: loss, expected: loss },
      killChance: 0,
      strikerDamage: { min: 0, max: 0, expected: 0 },
      strikerDeathChance: 0,
    };
  }
  const f = forecastCombat(striker, leg.target, map, leg.context, leg.era, state);
  return {
    target: f.defenderDamage,
    killChance: f.defenderKillChance,
    strikerDamage: f.attackerDamage,
    strikerDeathChance: f.attackerDeathChance,
  };
}

function branchFrom(
  striker: Unit,
  parts: Array<{ weight: number; strikerStage1Loss: number; arrives: boolean; leg?: LegOutcome }>,
  target: { health: number } | null,
): AirStrikeBranch {
  let strikerExpected = 0; let strikerMin = Infinity; let strikerMax = -Infinity;
  let targetExpected = 0; let targetMin = Infinity; let targetMax = -Infinity;
  let death = 0; let reaches = 0; let kill = 0;
  for (const part of parts) {
    const { weight, strikerStage1Loss, arrives, leg } = part;
    if (!arrives || !leg) {
      // destroyed by interception: lost all its health, no target damage
      strikerExpected += weight * striker.health; strikerMin = Math.min(strikerMin, striker.health); strikerMax = Math.max(strikerMax, striker.health);
      targetMin = Math.min(targetMin, 0); targetMax = Math.max(targetMax, 0);
      death += weight;
      continue;
    }
    reaches += weight;
    const lossMin = strikerStage1Loss + leg.strikerDamage.min;
    const lossMax = strikerStage1Loss + leg.strikerDamage.max;
    strikerExpected += weight * (strikerStage1Loss + leg.strikerDamage.expected);
    strikerMin = Math.min(strikerMin, Math.min(lossMin, striker.health));
    strikerMax = Math.max(strikerMax, Math.min(lossMax, striker.health));
    targetExpected += weight * leg.target.expected;
    targetMin = Math.min(targetMin, leg.target.min); targetMax = Math.max(targetMax, leg.target.max);
    death += weight * leg.strikerDeathChance;
    kill += weight * leg.killChance;
  }
  const strikerDamage: DamageRange = { min: strikerMin, max: strikerMax, expected: Math.round(Math.min(strikerExpected, striker.health)) };
  const targetDamage: DamageRange = {
    min: targetMin === Infinity ? 0 : targetMin,
    max: targetMax === -Infinity ? 0 : targetMax,
    expected: Math.round(target ? Math.min(targetExpected, target.health) : targetExpected),
  };
  return {
    strikerDamage, strikerDeathChance: death, reachesTargetChance: reaches,
    targetDamage, targetKillChance: kill,
    band: classifyBattleOutcome(kill, death, targetDamage.expected, strikerDamage.expected),
  };
}

export function forecastAirStrike(input: AirStrikeForecastInput): AirStrikeForecast {
  const { striker, map, state, interception } = input;
  const targetHealth = input.leg.kind === 'unit' ? { health: input.leg.target.health } : { health: input.leg.cityHp };

  const direct = branchFrom(striker, [{ weight: 1, strikerStage1Loss: 0, arrives: true, leg: evaluateLeg(input, striker) }], targetHealth);
  if (!interception) return { withoutInterception: direct };

  // Stage one: the interceptor attacks the striker (exactly the roles resolveAirStrike gives them).
  const { interceptor } = interception;
  const strengths = resolveCombatStrengths(interceptor, striker, map, interception.context, state);
  const cells = strengths.attackerStrength === 0 || strengths.defenderStrength === 0
    ? [strengths.defenderStrength === 0
      ? { attackerDamage: 0, defenderDamage: striker.health }
      : { attackerDamage: interceptor.health, defenderDamage: 0 }]
    : sampleExchangeGrid(strengths, strengths.attackerStrength, strengths.defenderStrength, interceptor, striker, interception.context, interception.era);

  const legCache = new Map<number, LegOutcome>();
  const weight = 1 / cells.length;
  let sMin = Infinity; let sMax = -Infinity; let sSum = 0; let sDead = 0;
  let iMin = Infinity; let iMax = -Infinity; let iSum = 0; let iDead = 0;
  const parts: Array<{ weight: number; strikerStage1Loss: number; arrives: boolean; leg?: LegOutcome }> = [];
  for (const cell of cells) {
    const strikerLoss = Math.min(cell.defenderDamage, striker.health);
    const interceptorLoss = Math.min(cell.attackerDamage, interceptor.health);
    sMin = Math.min(sMin, strikerLoss); sMax = Math.max(sMax, strikerLoss); sSum += strikerLoss * weight;
    iMin = Math.min(iMin, interceptorLoss); iMax = Math.max(iMax, interceptorLoss); iSum += interceptorLoss * weight;
    const strikerLeft = striker.health - cell.defenderDamage;
    if (cell.attackerDamage >= interceptor.health) iDead += weight;
    if (strikerLeft <= 0) {
      sDead += weight;
      parts.push({ weight, strikerStage1Loss: striker.health, arrives: false });
      continue;
    }
    let leg = legCache.get(strikerLeft);
    if (!leg) {
      leg = evaluateLeg(input, { ...striker, health: strikerLeft });
      legCache.set(strikerLeft, leg);
    }
    parts.push({ weight, strikerStage1Loss: cell.defenderDamage, arrives: true, leg });
  }

  const branch = branchFrom(striker, parts, targetHealth);
  return {
    withoutInterception: direct,
    ifIntercepted: {
      ...branch,
      stage: {
        interceptor,
        strikerDamage: { min: sMin, max: sMax, expected: Math.round(sSum) },
        strikerDestroyedChance: sDead,
        interceptorDamage: { min: iMin, max: iMax, expected: Math.round(iSum) },
        interceptorDestroyedChance: iDead,
      },
    },
  };
}
