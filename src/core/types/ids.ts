// Persisted per-game id counters (#1361). Leaf: imports nothing. The runtime scan/normalize logic lives in src/core/id-counters.ts.

// --- ID Counters ---

export interface IdCounters {
  nextUnitId:  number;
  nextCityId:  number;
  nextCampId:  number;
  nextQuestId: number;
  nextRouteId?: number;  // defaults to 1 on old saves (optional for back-compat)
  nextPirateFactionId?: number;
  nextNotificationId?: number;
  nextNetworkPlanId?: number;
  nextWarId?: number;
}
