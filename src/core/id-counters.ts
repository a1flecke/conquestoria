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

/**
 * Return a fresh counter set for a brand-new game (before any entities are created).
 */
export function emptyIdCounters(): IdCounters {
  return {
    nextUnitId: 1,
    nextCityId: 1,
    nextCampId: 1,
    nextQuestId: 1,
    nextRouteId: 1,
    nextPirateFactionId: 1,
    nextNotificationId: 1,
    nextNetworkPlanId: 1,
  };
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
  let maxRoute = 0, maxPirateFaction = 0, maxNotification = 0, maxNetworkPlan = 0;

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
  for (const route of state.marketplace?.tradeRoutes ?? []) {
    const match = /^route-(\d+)$/.exec(route.id ?? '');
    if (match) maxRoute = Math.max(maxRoute, +match[1]);
  }
  const pirateIds = [
    ...Object.keys(state.pirates?.factions ?? {}),
    ...(state.pirates?.history ?? []).map(entry => entry.factionId ?? ''),
  ];
  for (const id of pirateIds) {
    const match = /^pirate-(\d+)$/.exec(id);
    if (match) maxPirateFaction = Math.max(maxPirateFaction, +match[1]);
  }
  for (const entries of Object.values(state.notificationLog ?? {})) {
    for (const entry of entries) {
      const match = /^notification-(\d+)$/.exec(entry.id ?? '');
      if (match) maxNotification = Math.max(maxNotification, +match[1]);
    }
  }
  for (const autonomy of Object.values(state.autonomyByCiv ?? {})) {
    for (const id of Object.keys(autonomy.plans ?? {})) {
      const match = /^network-plan-(\d+)$/.exec(id);
      if (match) maxNetworkPlan = Math.max(maxNetworkPlan, +match[1]);
    }
  }

  return {
    nextUnitId:  maxUnit  + 1,
    nextCityId:  maxCity  + 1,
    nextCampId:  maxCamp  + 1,
    nextQuestId: maxQuest + 1,
    nextRouteId: maxRoute + 1,
    nextPirateFactionId: maxPirateFaction + 1,
    nextNotificationId: maxNotification + 1,
    nextNetworkPlanId: maxNetworkPlan + 1,
  };
}
