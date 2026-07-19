import type { AutonomyPostureId } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';

export function requestAutonomyPosture(
  state: GameState,
  civId: string,
  posture: AutonomyPostureId,
): GameState {
  const autonomy = state.autonomyByCiv?.[civId];
  if (!autonomy || autonomy.posture === posture || autonomy.pendingPosture) return state;
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [civId]: { ...autonomy, pendingPosture: { id: posture, appliesOnTurn: state.turn + 1 } },
    },
  };
}

export function applyPendingAutonomyPosture(state: GameState, civId: string): GameState {
  const autonomy = state.autonomyByCiv?.[civId];
  if (!autonomy?.pendingPosture || autonomy.pendingPosture.appliesOnTurn > state.turn) return state;
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [civId]: { ...autonomy, posture: autonomy.pendingPosture.id, pendingPosture: null },
    },
  };
}
