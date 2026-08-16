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

/**
 * Overrides a freshly constructed game's councilTalkLevel with the player's
 * persisted preference.
 *
 * Distinct from `applyPersistedUserSettings` above: that function preserves an
 * *existing save's own* councilTalkLevel and only fills in the persisted
 * default when the save has none. A brand-new game from `createNewGame`/
 * `createHotSeatGame` always has some default already (`'normal'`), so that
 * guard would never fire here -- this helper must override it unconditionally
 * whenever a persisted preference exists.
 */
export function applyCouncilTalkLevelOverride(
  state: GameState,
  councilTalkLevel: GameState['settings']['councilTalkLevel'] | undefined,
): GameState {
  if (!councilTalkLevel) return state;
  return { ...state, settings: { ...state.settings, councilTalkLevel } };
}
