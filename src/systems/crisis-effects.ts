// #1012: crisis severity math and economic effects — projecting an active crisis's
// per-challenge severity onto city yields. Pure queries; no state mutation, no
// scheduling, no stage transitions (see crisis-lifecycle.ts for those).
import type { GameState } from '@/core/types';
import { resolvePressureSeverityForCiv } from '@/core/opponent-challenge';
import { getCrisisFlavor } from './crisis-flavor-definitions';

// #919 MR1: after a remedy completes in a city it cannot be re-infected by the same
// crisis for this many turns. Base window vs. the epidemic-control (era 6) window.
export const OUTBREAK_CURE_IMMUNITY_TURNS = 3;
export const OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL = 6;

export function cureImmunityWindow(
  civ: { techState: { completed: string[] } } | undefined,
): number {
  return civ?.techState.completed.includes('epidemic-control')
    ? OUTBREAK_CURE_IMMUNITY_TURNS_EPIDEMIC_CONTROL
    : OUTBREAK_CURE_IMMUNITY_TURNS;
}

// Single source of truth for the per-crisis yield multiplier — shared with
// city-panel.ts's display so the shown percentage always matches the applied
// effect, including the 0.25 floor on quarantined cities.
export function getOutbreakSeverityMultiplier(
  severity: { yieldPenalty: number },
  quarantined: boolean,
): number {
  return quarantined
    ? Math.max(0.25, 1 - 2 * severity.yieldPenalty)
    : 1 - severity.yieldPenalty;
}

// Catastrophe's per-challenge severity.yieldPenalty is the whole-city disruption
// penalty during the recovery stage (on top of, not instead of, devastated tiles
// individually yielding zero) — e.g. displaced population, disrupted trade routes.
export function getCatastropheRecoveryMultiplier(severity: { yieldPenalty: number }): number {
  return 1 - severity.yieldPenalty;
}

export interface CrisisYieldMultiplier {
  food: number;
  production: number;
  gold: number;
  science: number;
}

// Outbreak/catastrophe penalize all four yields uniformly (general disruption).
// Famine (#590 MR3) penalizes food only — reuses the same quarantine-doubling/floor
// formula as outbreak (getOutbreakSeverityMultiplier), just scoped to one yield key.
export function getCrisisYieldMultiplier(state: GameState, cityId: string): CrisisYieldMultiplier {
  let result: CrisisYieldMultiplier = { food: 1, production: 1, gold: 1, science: 1 };
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (!crisis.cityIds.includes(cityId)) continue;
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) continue;
    const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];
    if (crisis.archetype === 'outbreak') {
      const m = getOutbreakSeverityMultiplier(severity, crisis.quarantinedCityIds?.includes(cityId) ?? false);
      result = { food: result.food * m, production: result.production * m, gold: result.gold * m, science: result.science * m };
    } else if (crisis.archetype === 'catastrophe' && crisis.stage === 'recovery') {
      const m = getCatastropheRecoveryMultiplier(severity);
      result = { food: result.food * m, production: result.production * m, gold: result.gold * m, science: result.science * m };
    } else if (crisis.archetype === 'famine') {
      const m = getOutbreakSeverityMultiplier(severity, crisis.quarantinedCityIds?.includes(cityId) ?? false);
      result = { ...result, food: result.food * m };
    }
  }
  return result;
}
