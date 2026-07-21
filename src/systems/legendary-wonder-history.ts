import type {
  GameState,
  HexCoord,
  LegendaryWonderDiscoverySiteType,
  LegendaryWonderNetworkPlanResolutionRecord,
} from '@/core/types';

export function recordLegendaryWonderDiscoverySite(
  state: GameState,
  civId: string,
  siteId: string,
  siteType: LegendaryWonderDiscoverySiteType,
  position: HexCoord,
): void {
  state.legendaryWonderHistory ??= { destroyedStrongholds: [], discoveredSites: [] };
  state.legendaryWonderHistory.discoveredSites ??= [];

  const alreadyRecorded = state.legendaryWonderHistory.discoveredSites.some(record =>
    record.civId === civId && record.siteId === siteId && record.siteType === siteType,
  );
  if (alreadyRecorded) {
    return;
  }

  state.legendaryWonderHistory.discoveredSites.push({
    civId,
    siteId,
    siteType,
    position,
    turn: state.turn,
  });
}

export function countLegendaryWonderDiscoverySites(
  state: GameState,
  civId: string,
  allowedTypes: LegendaryWonderDiscoverySiteType[],
): number {
  const allowed = new Set(allowedTypes);
  return (state.legendaryWonderHistory?.discoveredSites ?? []).filter(record =>
    record.civId === civId && allowed.has(record.siteType),
  ).length;
}

/** Appends facts emitted by the NetworkPlan owner-turn resolver; never scans plan state. */
export function appendLegendaryWonderNetworkPlanResolutions(
  state: GameState,
  resolutions: readonly LegendaryWonderNetworkPlanResolutionRecord[],
): GameState {
  if (resolutions.length === 0) return state;
  const records = state.legendaryWonderHistory?.networkPlanResolutions ?? [];
  const additions = resolutions.filter(resolution => !records.some(record =>
    record.civId === resolution.civId
      && record.planId === resolution.planId
      && record.turn === resolution.turn,
  ));
  if (additions.length === 0) return state;
  return { ...state, legendaryWonderHistory: { destroyedStrongholds: state.legendaryWonderHistory?.destroyedStrongholds ?? [], discoveredSites: state.legendaryWonderHistory?.discoveredSites ?? [], networkPlanResolutions: [...records, ...additions] } };
}
