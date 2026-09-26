import type { GameState, HexCoord } from '@/core/types';
import { getMovementBlockerReason } from '@/systems/unit-movement-explainer';
import {
  getLandUnitWaterRecoveryTapMessage,
  type LandUnitWaterRecovery,
} from '@/systems/unit-water-recovery';

export interface SelectedUnitMovementFeedbackCallbacks {
  showNotification: (message: string, type: 'info' | 'warning') => void;
  reselectUnit: (unitId: string) => void;
  playError: () => void;
}

export function handleSelectedUnitMovementBlocker(
  state: GameState,
  unitId: string,
  target: HexCoord,
  waterRecovery: LandUnitWaterRecovery,
  callbacks: SelectedUnitMovementFeedbackCallbacks,
): boolean {
  const unit = state.units[unitId];
  if (!unit) return false;
  // #1025 MR4 / #1002: the explainer scopes itself to the unit owner's own knowledge (fog,
  // concealment, path) — never state.currentPlayer, and never a caller-supplied visibility.
  const reason = getMovementBlockerReason(state, unitId, target);
  if (!reason) return false;

  const recoveryMessage = reason.code === 'impassable-water'
    ? getLandUnitWaterRecoveryTapMessage(waterRecovery)
    : null;
  const type = reason.code === 'unexplored' || reason.code === 'unknown-tile' || reason.code === 'hidden-obstacle'
    ? 'info'
    : 'warning';
  callbacks.showNotification(recoveryMessage ?? reason.message, type);
  if (type === 'warning') callbacks.playError();
  callbacks.reselectUnit(unitId);
  return true;
}
