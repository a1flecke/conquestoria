// src/systems/trade-route-travel.ts
// #1502 MR05: how long a trader's leg takes, from the *same* movement model the executor spends.
//
// This is a leaf: it owns travel timing (the allowance, the per-step cost walk, and the rounds a
// path needs) and imports nothing from the route economy or the runner, so both can depend on it
// without a cycle. The quote's ETA and the runner's actual walk call the same two functions, which
// is what stops "roads, terrain costs, and unit speed match ETA" from being a promise.
import type { GameState, HexCoord, Unit } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-definitions';
import { findPathToCity } from './unit-pathfinding';
import { getMovementStepCost } from './unit-movement-cost';
import { resetUnitTurn } from './unit-lifecycle';

/**
 * The one movement allowance a trader gets per round: exactly what the canonical per-owner-turn
 * reset grants (definition movement + bonuses − supply/endurance penalties). Assignment,
 * positioning and automatic travel must never each grant a separate allowance, so this is the
 * single number the ETA is computed from.
 */
export function getRouteRunnerAllowance(unit: Unit): number {
  return Math.max(1, resetUnitTurn(unit).movementPointsLeft);
}

/**
 * Rounds a sequence of step costs needs, given `allowance` movement per round. Mirrors the
 * canonical executor: walk every step the allowance covers, and allow the single adjacent step
 * that finishes the leg with any movement left (`validateUnitMove`'s forced march).
 */
export function countPathRounds(stepCosts: readonly number[], allowance: number): number {
  if (stepCosts.length === 0) return 0;
  const budget = Math.max(1, allowance);
  let rounds = 0;
  let index = 0;
  while (index < stepCosts.length) {
    rounds += 1;
    let remaining = budget;
    while (index < stepCosts.length && stepCosts[index]! <= remaining) {
      remaining -= stepCosts[index]!;
      index += 1;
    }
    // Forced march: the last, adjacent step may be completed with any movement left.
    if (index === stepCosts.length - 1 && remaining >= 1) index += 1;
  }
  return rounds;
}

/** Canonical per-step costs for a path, from the one movement cost model. */
export function getRouteStepCosts(state: GameState, unit: Unit, path: readonly HexCoord[]): number[] {
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const costs: number[] = [];
  for (let i = 1; i < path.length; i++) {
    costs.push(getMovementStepCost(unit, state.map, path[i - 1]!, path[i]!, { completedTechs }));
  }
  return costs;
}

/**
 * The path this trader would walk from `from` to `targetCityId`, in its own domain and with its own
 * techs — the same canonical pathfinder the executor validates against.
 */
export function getRoutePathBetween(
  state: GameState,
  unit: Unit,
  from: HexCoord,
  targetCityId: string,
): HexCoord[] | null {
  const target = state.cities[targetCityId];
  if (!target) return null;
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  return findPathToCity(from, target.position, state.map, domain, { unit, completedTechs });
}

/** The path the trader would walk from where it stands to `targetCityId`. */
export function getRouteLegPath(state: GameState, unit: Unit, targetCityId: string): HexCoord[] | null {
  return getRoutePathBetween(state, unit, unit.position, targetCityId);
}

/** Rounds this trader needs to walk from `from` to `targetCityId`, or null when no path exists. */
export function getRouteRoundsBetween(
  state: GameState,
  unit: Unit,
  from: HexCoord,
  targetCityId: string,
): number | null {
  const path = getRoutePathBetween(state, unit, from, targetCityId);
  if (!path || path.length === 0) return null;
  return countPathRounds(getRouteStepCosts(state, unit, path), getRouteRunnerAllowance(unit));
}

/** Rounds this trader still needs to reach `targetCityId`, or null when no path exists. */
export function getRouteLegRounds(state: GameState, unit: Unit, targetCityId: string): number | null {
  return getRouteRoundsBetween(state, unit, unit.position, targetCityId);
}
