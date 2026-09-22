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
  marketplace?:    { tradeRoutes?: Array<{ id?: string }> };
  pirates?: {
    factions?: Record<string, { id?: string }>;
    history?: Array<{ factionId?: string }>;
  };
  notificationLog?: Record<string, Array<{ id?: string }>>;
  autonomyByCiv?: Record<string, {
    plans?: Record<string, unknown>;
    detections?: Record<string, unknown>;
  }>;
};

/** One counter's new-game default plus its max-suffix reconstruction. */
export type IdCounterSpec = {
  /** Fresh-game value before any entity of this kind exists. */
  initial: number;
  /** Highest numeric suffix found in state, or 0 when none match. */
  scanMax: (state: ScanableState) => number;
};

/** Highest `pattern` numeric suffix across ids; ignores non-matching ids. */
function maxSuffix(ids: Iterable<string>, pattern: RegExp): number {
  let max = 0;
  for (const id of ids) {
    const match = pattern.exec(id);
    if (match) max = Math.max(max, Number(match[1]));
  }
  return max;
}

/**
 * EXTENSION CONTRACT (structurally enforced, #1082):
 * every `keyof IdCounters` must have an entry here — the `satisfies
 * Record<keyof IdCounters, IdCounterSpec>` below is a compile error until it
 * does. Each entry owns BOTH the new-game default (`initial`) and the
 * reconstruction behavior (`scanMax`), and `emptyIdCounters()` /
 * `scanIdCounters()` derive from this table, so adding a field to
 * `IdCounters` without defining both behaviors fails the build instead of
 * relying on a comment reminder. `normalizeIdCounters`
 * (`src/storage/save-manager.ts`) also iterates this table, so load-time
 * merging stays in sync automatically.
 */
export const ID_COUNTER_SPECS = {
  nextUnitId: {
    initial: 1,
    scanMax: (state) => maxSuffix(Object.keys(state.units ?? {}), /^unit-(\d+)$/),
  },
  nextCityId: {
    initial: 1,
    scanMax: (state) => maxSuffix(Object.keys(state.cities ?? {}), /^city-(\d+)$/),
  },
  nextCampId: {
    initial: 1,
    scanMax: (state) => maxSuffix(Object.keys(state.barbarianCamps ?? {}), /^camp-(\d+)$/),
  },
  nextQuestId: {
    initial: 1,
    scanMax: (state) => {
      const ids: string[] = [];
      for (const mc of Object.values(state.minorCivs ?? {})) {
        for (const quest of Object.values(mc.activeQuests ?? {})) ids.push(quest.id);
      }
      return maxSuffix(ids, /^quest-(\d+)$/);
    },
  },
  nextRouteId: {
    initial: 1,
    scanMax: (state) =>
      maxSuffix(
        (state.marketplace?.tradeRoutes ?? []).map((route) => route.id ?? ''),
        /^route-(\d+)$/,
      ),
  },
  nextPirateFactionId: {
    initial: 1,
    scanMax: (state) =>
      maxSuffix(
        [
          ...Object.keys(state.pirates?.factions ?? {}),
          ...(state.pirates?.history ?? []).map((entry) => entry.factionId ?? ''),
        ],
        /^pirate-(\d+)$/,
      ),
  },
  nextNotificationId: {
    initial: 1,
    scanMax: (state) => {
      const ids: string[] = [];
      for (const entries of Object.values(state.notificationLog ?? {})) {
        for (const entry of entries) ids.push(entry.id ?? '');
      }
      return maxSuffix(ids, /^notification-(\d+)$/);
    },
  },
  nextNetworkPlanId: {
    initial: 1,
    scanMax: (state) => {
      const ids: string[] = [];
      for (const autonomy of Object.values(state.autonomyByCiv ?? {})) {
        ids.push(...Object.keys(autonomy.plans ?? {}));
      }
      return maxSuffix(ids, /^network-plan-(\d+)$/);
    },
  },
} satisfies Record<keyof IdCounters, IdCounterSpec>;

/**
 * Return a fresh counter set for a brand-new game (before any entities are created).
 * Derived from ID_COUNTER_SPECS so a new counter cannot miss its default.
 */
export function emptyIdCounters(): IdCounters {
  // The key list comes from the satisfies-checked table above, so exhaustiveness
  // is compile-enforced; the casts only bridge Object.keys' string[] typing.
  const out = {} as Record<keyof IdCounters, number>;
  for (const key of Object.keys(ID_COUNTER_SPECS) as (keyof IdCounters)[]) {
    out[key] = ID_COUNTER_SPECS[key].initial;
  }
  return out;
}

/**
 * Reconstruct IdCounters from an existing GameState by scanning entity IDs.
 * Used once by migrateLegacySave() for saves predating this field.
 * Derived from ID_COUNTER_SPECS so a new counter cannot miss its scan block.
 */
export function scanIdCounters(state: ScanableState): IdCounters {
  const out = {} as Record<keyof IdCounters, number>;
  for (const key of Object.keys(ID_COUNTER_SPECS) as (keyof IdCounters)[]) {
    out[key] = ID_COUNTER_SPECS[key].scanMax(state) + 1;
  }
  return out;
}
