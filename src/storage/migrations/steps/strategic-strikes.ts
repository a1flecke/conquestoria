import type { GameState } from '@/core/types';

/**
 * Schema 20 (#545 MR4) — `strategicStrikesReceivedFrom` became a `DiplomacyState`
 * field. Default every civ's to `[]` rather than leaving it undefined on an old
 * save: the list is append-only and never decayed, because a nuclear strike must
 * not be "forgotten" for retaliation classification.
 */
export function migrateStrategicStrikeLedger(state: GameState): GameState {
  return {
    ...state,
    civilizations: Object.fromEntries(Object.entries(state.civilizations).map(([civId, civ]) => [
      civId,
      {
        ...civ,
        diplomacy: {
          ...civ.diplomacy,
          strategicStrikesReceivedFrom: civ.diplomacy.strategicStrikesReceivedFrom ?? [],
        },
      },
    ])),
  };
}
