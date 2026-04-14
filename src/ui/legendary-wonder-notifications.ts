import type { GameState } from '@/core/types';
import type { NotificationEntry } from '@/ui/notification-log';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { hasMetCivilization } from '@/systems/discovery-system';

type LegendaryWonderNotificationEvent =
  | { type: 'wonder:legendary-ready'; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-completed'; civId: string; cityId: string; wonderId: string }
  | { type: 'wonder:legendary-lost'; civId: string; cityId: string; wonderId: string; goldRefund: number; transferableProduction: number }
  | { type: 'wonder:legendary-race-revealed'; observerId: string; civId: string; cityId: string; wonderId: string };

export function getLegendaryWonderNotification(
  state: GameState,
  currentPlayer: string,
  event: LegendaryWonderNotificationEvent,
): NotificationEntry | null {
  const city = state.cities[event.cityId];
  const wonder = getLegendaryWonderDefinition(event.wonderId);

  if (!city) {
    return null;
  }

  if (event.type === 'wonder:legendary-race-revealed') {
    if (event.observerId !== currentPlayer) {
      return null;
    }

    const builder = state.civilizations[event.civId];
    return {
      message: `Spy report: ${builder?.name ?? event.civId} started ${wonder?.name ?? event.wonderId} in ${city.name}.`,
      type: 'info',
      turn: state.turn,
    };
  }

  if (event.civId !== currentPlayer) {
    // Observers see wonder completions (class-2 global event) once they've met the builder.
    if (event.type === 'wonder:legendary-completed') {
      const builder = state.civilizations[event.civId];
      const builderLabel = hasMetCivilization(state, currentPlayer, event.civId)
        ? (builder?.name ?? event.civId)
        : 'A rival civilization';
      return {
        message: `${builderLabel} completed ${wonder?.name ?? event.wonderId}!`,
        type: 'info',
        turn: state.turn,
      };
    }
    return null;
  }

  if (event.type === 'wonder:legendary-ready') {
    return {
      message: `${city.name} is ready to begin ${wonder?.name ?? event.wonderId}.`,
      type: 'info',
      turn: state.turn,
    };
  }

  if (event.type === 'wonder:legendary-completed') {
    return {
      message: `${city.name} completed ${wonder?.name ?? event.wonderId}!`,
      type: 'success',
      turn: state.turn,
    };
  }

  return {
    message: `${city.name} abandoned ${wonder?.name ?? event.wonderId}. +${event.goldRefund} gold and ${event.transferableProduction} carryover recovered.`,
    type: 'warning',
    turn: state.turn,
  };
}
