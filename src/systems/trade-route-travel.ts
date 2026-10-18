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
import { hexKey } from './hex-utils';

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
 * canonical executor for a mover that walks one adjacent step at a time (the trade runner): every
 * step the allowance covers is taken, and with any movement left one more adjacent step is
 * completed — the movement rule's forced march, which the executor allows for a single-step move.
 */
export function countPathRounds(stepCosts: readonly number[], allowance: number): number {
  if (stepCosts.length === 0) return 0;
  const budget = Math.max(1, allowance);
  let rounds = 0;
  let index = 0;
  while (index < stepCosts.length) {
    rounds += 1;
    let remaining = budget;
    while (index < stepCosts.length) {
      const cost = stepCosts[index]!;
      if (cost <= remaining) {
        remaining -= cost;
        index += 1;
        continue;
      }
      if (remaining >= 1) {
        remaining = 0;
        index += 1;
        continue;
      }
      break;
    }
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
 * #1502 MR05b: how many extra rounds a leg may spend re-routing around an obstruction before the
 * trader waits instead. A detour may delay a delivery; it may never mint extra rewards (the leg's
 * payable-round budget bounds the money independently) and it may not run forever.
 */
export const MAX_ROUTE_DETOUR_ROUNDS = 3;

/**
 * Map tiles held by a unit that is not the trader's — the tiles a detour must route around. Loaded
 * cargo is not an occupying map entity, so it is excluded exactly as the movement rules exclude it.
 */
export function getForeignOccupiedHexKeys(state: GameState, unit: Unit): Set<string> {
  const keys = new Set<string>();
  for (const candidate of Object.values(state.units)) {
    if (candidate.id === unit.id || candidate.owner === unit.owner) continue;
    if (candidate.transportId) continue;
    keys.add(hexKey(candidate.position));
  }
  return keys;
}

/**
 * The path this trader would walk from `from` to `targetCityId`, in its own domain and with its own
 * techs — the same canonical pathfinder the executor validates against. `avoid` lets a detour skip
 * tiles a foreign unit holds; without it the path is the committed one.
 */
export function getRoutePathBetween(
  state: GameState,
  unit: Unit,
  from: HexCoord,
  targetCityId: string,
  avoid?: { blockedHexKeys?: ReadonlySet<string> },
): HexCoord[] | null {
  const target = state.cities[targetCityId];
  if (!target) return null;
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  return findPathToCity(from, target.position, state.map, domain, {
    unit,
    completedTechs,
    blockedHexKeys: avoid?.blockedHexKeys,
  });
}

/** The path the trader would walk from where it stands to `targetCityId`. */
export function getRouteLegPath(
  state: GameState,
  unit: Unit,
  targetCityId: string,
  avoid?: { blockedHexKeys?: ReadonlySet<string> },
): HexCoord[] | null {
  return getRoutePathBetween(state, unit, unit.position, targetCityId, avoid);
}

/** Rounds this trader needs to walk from `from` to `targetCityId`, or null when no path exists. */
export function getRouteRoundsBetween(
  state: GameState,
  unit: Unit,
  from: HexCoord,
  targetCityId: string,
  avoid?: { blockedHexKeys?: ReadonlySet<string> },
): number | null {
  const path = getRoutePathBetween(state, unit, from, targetCityId, avoid);
  if (!path || path.length === 0) return null;
  return countPathRounds(getRouteStepCosts(state, unit, path), getRouteRunnerAllowance(unit));
}

/** Rounds this trader still needs to reach `targetCityId`, or null when no path exists. */
export function getRouteLegRounds(
  state: GameState,
  unit: Unit,
  targetCityId: string,
  avoid?: { blockedHexKeys?: ReadonlySet<string> },
): number | null {
  return getRouteRoundsBetween(state, unit, unit.position, targetCityId, avoid);
}
