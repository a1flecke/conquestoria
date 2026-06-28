import type { GameEvents, GameState } from '@/core/types';
import {
  routeCombatResolved,
  type NotificationSink,
} from '@/ui/notification-routing';

export interface CombatResolvedPresentationDependencies {
  isPresentationSuppressed: () => boolean;
  applyVisual: (result: GameEvents['combat:resolved']['result']) => void;
  appendNotification: NotificationSink;
}

export function handleCombatResolvedEvent(
  state: GameState,
  event: GameEvents['combat:resolved'],
  dependencies: CombatResolvedPresentationDependencies,
): void {
  if (
    !dependencies.isPresentationSuppressed()
    && event.visibleToViewerIds.includes(state.currentPlayer)
  ) {
    dependencies.applyVisual(event.result);
  }
  routeCombatResolved(state, event.result, dependencies.appendNotification, event);
}
