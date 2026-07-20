import type {
  GameState,
  HexCoord,
  LegendaryWonderDiscoverySiteType,
} from '@/core/types';
import { isConstructiveSpecialistPlan } from './network-plan-definitions';

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

export function recordStableConstructivePlanResolutions(state: GameState, civId: string): GameState {
  const autonomy = state.autonomyByCiv?.[civId];
  if (!autonomy || autonomy.surgeRecoveryUntilTurn !== null && autonomy.surgeRecoveryUntilTurn > state.turn) return state;
  const records = state.legendaryWonderHistory?.networkPlanResolutions ?? [];
  const additions = Object.values(autonomy.plans)
    .filter(plan => plan.status === 'active' && (isConstructiveSpecialistPlan(plan.definitionId) || plan.definitionId === 'survey-grid'))
    .filter(plan => !records.some(record => record.civId === civId && record.planId === plan.id && record.turn === state.turn))
    .map(plan => ({ civId, planId: plan.id, definitionId: plan.definitionId, cityId: plan.source?.kind === 'city' ? plan.source.cityId : undefined, stable: true, turn: state.turn }));
  if (additions.length === 0) return state;
  return { ...state, legendaryWonderHistory: { destroyedStrongholds: state.legendaryWonderHistory?.destroyedStrongholds ?? [], discoveredSites: state.legendaryWonderHistory?.discoveredSites ?? [], networkPlanResolutions: [...records, ...additions] } };
}
