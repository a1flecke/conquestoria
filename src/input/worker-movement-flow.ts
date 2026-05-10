import type { GameState, HexCoord } from '@/core/types';
import {
  abandonWorkerTask,
  executeUnitMove,
  type ExecuteUnitMoveOptions,
  type ExecuteUnitMoveResult,
} from '@/systems/unit-movement-system';

export function confirmBusyWorkerMove(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: ExecuteUnitMoveOptions,
): ExecuteUnitMoveResult & { state: GameState } {
  abandonWorkerTask(state, unitId);
  const result = executeUnitMove(state, unitId, to, options);
  return { ...result, state };
}
