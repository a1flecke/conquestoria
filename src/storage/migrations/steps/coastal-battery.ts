import type { GameState } from '@/core/types';

/**
 * Schema 13 — retains valid per-city Coastal Battery counterfire turn markers
 * while removing malformed save data.
 */

/** Retains valid per-city Battery turn markers while removing malformed save data. */
export function normalizeCoastalBatteryCounterfireTurns(state: GameState): GameState {
  let changed = false;
  const cities = { ...state.cities };
  for (const [cityId, city] of Object.entries(state.cities)) {
    const marker = city.coastalBatteryCounterfireTurn;
    if (marker === undefined || (Number.isFinite(marker) && Number.isInteger(marker))) continue;
    const { coastalBatteryCounterfireTurn: _invalidMarker, ...normalizedCity } = city;
    cities[cityId] = normalizedCity;
    changed = true;
  }
  return changed ? { ...state, cities } : state;
}
