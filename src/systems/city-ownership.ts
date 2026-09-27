import type { City, GameState } from '@/core/types';

/**
 * Canonical owned-city resolution (#1019).
 *
 * `city.owner` is authoritative for ownership. `civ.cities` and `minorCiv.cityId`
 * are denormalized indexes that may carry ordering or capital semantics; callers
 * that need those properties should continue to use the roster directly.
 *
 * Returns all live cities whose `owner` matches `ownerId`. Works for major
 * civilizations, minor civs, and unsupported owner kinds (the latter return an
 * empty result).
 */
export function getOwnedCities(state: GameState, ownerId: string): readonly City[] {
  return Object.values(state.cities ?? {}).filter(city => city.owner === ownerId);
}

/**
 * Count of cities owned by `ownerId`. Equivalent to `getOwnedCities(...).length`
 * but avoids allocating an intermediate array.
 */
export function getOwnedCityCount(state: GameState, ownerId: string): number {
  let count = 0;
  for (const city of Object.values(state.cities ?? {})) {
    if (city.owner === ownerId) count += 1;
  }
  return count;
}
