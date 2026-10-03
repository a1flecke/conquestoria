import type { GameState } from './types';
import { EventBus } from './event-bus';
import { ROUND_PHASES, createRoundPhaseContext } from './round-phases';
export { applyHoldSiegeOrder, deriveGeneralCandidateSeed } from './round-phases/per-civ';
export { finalizeOpponentRoundState } from './round-phases/finalization';

/**
 * One completed round of world processing: `ROUND_PHASES` run in order over one working clone of `state`, sharing
 * a fresh `RoundPhaseContext` that carries only what genuinely crosses phases (`src/core/round-phases/`). The order and
 * the output are pinned by `tests/core/round-phase-order.test.ts` (#1239).
 */
export function processTurn(
  state: GameState,
  bus: EventBus,
): GameState {
  const context = createRoundPhaseContext(state, bus);
  return ROUND_PHASES.reduce((current, phase) => phase.run(current, context), state);
}
