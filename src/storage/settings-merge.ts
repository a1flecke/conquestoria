import type { GameState } from '@/core/types';

/**
 * Applies user-level settings that are persisted OUTSIDE the save file.
 *
 * Deliberately not a `SaveMigration`. `councilTalkLevel` was the one fixup in
 * main.ts's migrateLegacySave() that could not move into the versioned
 * pipeline (#787 phase 1): it reads the player's IndexedDB preferences via
 * loadSettings(), not the save's own bytes, so it can never be a deterministic
 * `(state) => GameState`. Smuggling a module-global read into
 * save-migrations.ts would make every migration untestable.
 *
 * A save that already carries a `councilTalkLevel` keeps it — the campaign's
 * own choice outranks the machine-level default.
 */
export function applyPersistedUserSettings(
  state: GameState,
  persisted: GameState['settings'] | undefined,
): GameState {
  if (state.settings.councilTalkLevel) return state;
  return {
    ...state,
    settings: {
      ...state.settings,
      councilTalkLevel: persisted?.councilTalkLevel ?? 'normal',
    },
  };
}
