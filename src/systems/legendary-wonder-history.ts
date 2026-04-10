import type {
  GameState,
  HexCoord,
  LegendaryWonderDiscoverySiteType,
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
