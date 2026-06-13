import type { IdCounters } from './types';

/**
 * Minimal shape needed for scanning — accepts full GameState or test fixtures.
 * All fields are optional so scanIdCounters is safe on partial/legacy saves.
 */
type ScanableState = {
  units?:          Record<string, { id: string }>;
  cities?:         Record<string, { id: string }>;
  barbarianCamps?: Record<string, { id: string }>;
  minorCivs?:      Record<string, { activeQuests: Record<string, { id: string }> }>;
};

/**
 * Return a fresh counter set for a brand-new game (before any entities are created).
 */
export function emptyIdCounters(): IdCounters {
  return { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
}

/**
 * Reconstruct IdCounters from an existing GameState by scanning entity IDs.
 * Used once by migrateLegacySave() for saves predating this field.
 *
 * EXTENSION CONTRACT: when adding a new counter to IdCounters, add a matching
 * scan block here AND add the field to emptyIdCounters() above.
 */
export function scanIdCounters(state: ScanableState): IdCounters {
  let maxUnit = 0, maxCity = 0, maxCamp = 0, maxQuest = 0;

  for (const id of Object.keys(state.units ?? {})) {
    const n = /^unit-(\d+)$/.exec(id);
    if (n) maxUnit = Math.max(maxUnit, +n[1]);
  }
  for (const id of Object.keys(state.cities ?? {})) {
    const n = /^city-(\d+)$/.exec(id);
    if (n) maxCity = Math.max(maxCity, +n[1]);
  }
  for (const id of Object.keys(state.barbarianCamps ?? {})) {
    const n = /^camp-(\d+)$/.exec(id);
    if (n) maxCamp = Math.max(maxCamp, +n[1]);
  }
  for (const mc of Object.values(state.minorCivs ?? {})) {
    for (const quest of Object.values(mc.activeQuests ?? {})) {
      const n = /^quest-(\d+)$/.exec(quest.id);
      if (n) maxQuest = Math.max(maxQuest, +n[1]);
    }
  }

  return {
    nextUnitId:  maxUnit  + 1,
    nextCityId:  maxCity  + 1,
    nextCampId:  maxCamp  + 1,
    nextQuestId: maxQuest + 1,
  };
}
