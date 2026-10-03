import type { EventBus } from '../event-bus';
import type { GameState } from '../types';
import type { CivilizationEra } from '@/systems/era-types';
import type { PirateEconomyModifiers } from '@/systems/economy-system';
import { resolveCivilizationEra } from '@/systems/tech-definitions';

/**
 * The phases of one completed round of world processing (#1240), in the order `ROUND_PHASES` runs them. The ids are
 * the ones #1239 pinned (`tests/core/round-phase-order.test.ts`), which is the contract a refactor must preserve.
 */
export type RoundPhaseId =
  | 'prelude'
  | 'instability'
  | 'pre-civ-reconciliation'
  | 'per-civ'
  | 'post-civ-housekeeping'
  | 'territory-frontier'
  | 'wonders-market'
  | 'barbarians'
  | 'minor-civs'
  | 'beasts'
  | 'threat-scheduling'
  | 'espionage'
  | 'diplomacy-trade'
  | 'pirates'
  | 'trade-income'
  | 'leagues'
  | 'era-progression'
  | 'beast-rewards'
  | 'economy'
  | 'finalization';

/**
 * One phase of the round: takes the state the previous phase produced and returns the state the next one consumes.
 * A phase reads anything it needs from the state, and from `context` ONLY what genuinely crosses phases.
 */
export interface RoundPhase {
  readonly id: RoundPhaseId;
  run(state: GameState, context: RoundPhaseContext): GameState;
}

/**
 * What crosses phase boundaries, and nothing else: a value one phase produces that a later phase consumes, plus the
 * event bus. Anything used by a single phase stays a local of that phase. A fresh context is created for every round
 * (`createRoundPhaseContext`); there is no module-level state, so two rounds can never see each other's values.
 *
 * Temporal dependencies, each with ONE writer and its readers:
 *
 *  - `previousEraByCiv`            fixed at round start from the INPUT state; read by `era-progression`.
 *  - `previousEconomyStatusByCiv`  written by `pre-civ-reconciliation` (the status before this round's economy turn);
 *                                  read by `economy`. Empty until then.
 *  - `grossGoldByCiv`              the gross gold credited to each civ this round. Credited by `per-civ`,
 *                                  `trade-income` and `beast-rewards`, plus the vassal/cyber/network transfers inside
 *                                  `per-civ`; consumed by `economy`, which settles it. The one cross-phase accumulator.
 *  - `pirateEconomyModifiers`      written by `pirates`; read by `economy`. `undefined` until then.
 */
export interface RoundPhaseContext {
  readonly bus: EventBus;
  readonly previousEraByCiv: Readonly<Record<string, CivilizationEra>>;
  previousEconomyStatusByCiv: NonNullable<GameState['economyStatusByCiv']>;
  readonly grossGoldByCiv: Record<string, number>;
  pirateEconomyModifiers: PirateEconomyModifiers | undefined;
}

/** The context for one round. `state` is the round's INPUT state (before the working clone is made). */
export function createRoundPhaseContext(state: GameState, bus: EventBus): RoundPhaseContext {
  return {
    bus,
    previousEraByCiv: Object.fromEntries(
      Object.entries(state.civilizations).map(([civId, civ]) => [civId, resolveCivilizationEra(civ.techState.completed)]),
    ),
    previousEconomyStatusByCiv: {},
    grossGoldByCiv: {},
    pirateEconomyModifiers: undefined,
  };
}
