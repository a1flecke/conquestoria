import type { GameState } from '@/core/types';

/**
 * Schema 26 (#974 phase 2) — `City.bombardment` ({ turn, hpLostThisTurn })
 * drives the per-turn bombardment cap and HP-regen suppression.
 *
 * CORRUPTION REPAIR, not a real versioning step: the field is optional and
 * absent already means "never bombarded" everywhere it is read, so this is a
 * no-op for every save the game itself wrote. It exists to scrub a malformed
 * hand-edited value rather than let a non-integer or negative tally silently
 * corrupt the cap arithmetic into granting unlimited damage.
 */
export function repairCityBombardmentTallies(state: GameState): GameState {
  return {
    ...state,
    cities: Object.fromEntries(Object.entries(state.cities).map(([cityId, city]) => {
      const raw = city.bombardment;
      const valid = raw !== undefined
        && raw !== null
        && Number.isInteger(raw.turn) && raw.turn >= 0
        && Number.isInteger(raw.hpLostThisTurn) && raw.hpLostThisTurn >= 0;
      if (valid ? raw === city.bombardment : city.bombardment === undefined) return [cityId, city];
      return [cityId, { ...city, bombardment: valid ? raw : undefined }];
    })),
  };
}
