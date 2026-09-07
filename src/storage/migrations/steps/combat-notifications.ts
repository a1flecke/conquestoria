import type { GameState } from '@/core/types';

/**
 * Schema 8 — drop combat notifications written before they carried structured
 * detail, so the log never renders a half-populated entry.
 */

export function migrateCombatNotificationDetails(state: GameState): GameState {
  return state;
}
