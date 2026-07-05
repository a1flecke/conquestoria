import type { GameState, HexCoord } from '@/core/types';
import { getVisibility } from '@/systems/fog-of-war';
import { getMovementBlockerReason } from '@/systems/unit-system';
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
  const civ = state.civilizations[state.currentPlayer];
  const visibilityState = civ?.visibility
    ? getVisibility(civ.visibility, target)
    : undefined;
  const completedTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  const reason = getMovementBlockerReason(
    unit,
    target,
    state.map,
    { visibilityState, completedTechs },
  );
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
