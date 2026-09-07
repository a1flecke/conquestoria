import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
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
  // #1025 MR4: owner-scoped, not state.currentPlayer — previously visibilityState came from
  // currentPlayer while completedTechs came from unit.owner, which disagreed in hot seat.
  const ownerVisibility = state.civilizations[unit.owner]?.visibility;
  const visibilityState = ownerVisibility ? getVisibility(ownerVisibility, target) : undefined;
  const reason = getMovementBlockerReason(state, unitId, target, { visibilityState });
  if (!reason) return false;

  const recoveryMessage = reason.code === 'impassable-water'
    ? getLandUnitWaterRecoveryTapMessage(waterRecovery)
    : null;
  const type = reason.code === 'unexplored' || reason.code === 'unknown-tile'
    ? 'info'
    : 'warning';
  callbacks.showNotification(recoveryMessage ?? reason.message, type);
  if (type === 'warning') callbacks.playError();
  callbacks.reselectUnit(unitId);
  return true;
}
