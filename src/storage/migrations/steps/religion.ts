import type { GameState } from '@/core/types';

/**
 * Religion defaults (#591 MR4) and the per-religion conversion-progress ledger
 * (#592 MR5). Both are compatibility normalization: the fields are optional, every
 * reader uses `?? {}`, and no numbered migration was taken for either.
 */

export function withReligionDefaults(state: GameState): GameState {
  return {
    ...state,
    religions: state.religions ?? {},
    cityFaith: state.cityFaith ?? {},
  };
}

// #592 MR5: CityFaith.conversionProgress changed shape from a single
// { toReligionId, points } slot (MR4) to a per-religion { [religionId]: points } map, so
// getCityConversionPoints/applyCityConversionPoints (which index by religionId) would
// silently read 0 for any city with genuine in-flight conversion progress saved under the
// old shape -- not a crash, but a real loss of live game state on load. Detect the old
// shape (a `toReligionId` string field, which no real religionId key would ever collide
// with -- religion ids are always `religion-${civId}`) and convert it to the new map
// in-place. Unconditional (not a versioned migration) for the same additive-safety reason
// as withReligionDefaults above -- pre-MR4 saves have no cityFaith at all and are
// unaffected; only saves written between MR4 and this MR need the conversion.
export function normalizeCityFaithConversionProgress(state: GameState): GameState {
  if (!state.cityFaith) return state;
  let changed = false;
  const cityFaith: typeof state.cityFaith = { ...state.cityFaith };
  for (const [cityId, faith] of Object.entries(cityFaith)) {
    const progress = faith?.conversionProgress as Record<string, unknown> | undefined;
    if (
      progress
      && typeof progress === 'object'
      && typeof progress.toReligionId === 'string'
      && typeof progress.points === 'number'
    ) {
      const toReligionId = progress.toReligionId;
      const points = progress.points;
      cityFaith[cityId] = { ...faith, conversionProgress: { [toReligionId]: points } };
      changed = true;
    }
  }
  return changed ? { ...state, cityFaith } : state;
}
