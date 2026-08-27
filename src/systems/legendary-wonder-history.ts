import type {
  CombatRole,
  GameState,
  HexCoord,
  LegendaryWonderDiscoverySiteType,
  LegendaryWonderMilitaryFact,
  LegendaryWonderQuestStepDefinition,
  LegendaryWonderNetworkPlanResolutionRecord,
} from '@/core/types';
import { getUnitRoleDefinition } from '@/systems/combat-role-definitions';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';

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

/** Appends transition-owned military facts once; callers must not reconstruct them later. */
export function appendLegendaryWonderMilitaryFacts(
  state: GameState,
  facts: readonly LegendaryWonderMilitaryFact[],
): GameState {
  if (facts.length === 0) return state;
  const records = state.legendaryWonderHistory?.militaryFacts ?? [];
  const knownIds = new Set(records.map(record => record.id));
  const additions = facts.filter(fact => {
    if (knownIds.has(fact.id)) return false;
    knownIds.add(fact.id);
    return true;
  });
  if (additions.length === 0) return state;
  return {
    ...state,
    legendaryWonderHistory: {
      destroyedStrongholds: state.legendaryWonderHistory?.destroyedStrongholds ?? [],
      discoveredSites: state.legendaryWonderHistory?.discoveredSites ?? [],
      ...(state.legendaryWonderHistory?.networkPlanResolutions
        ? { networkPlanResolutions: state.legendaryWonderHistory.networkPlanResolutions }
        : {}),
      militaryFacts: [...records, ...additions],
    },
  };
}

/** Current fielding is deliberately a roster query: quests may require units simultaneously alive on the map. */
export function getCurrentCombatRoleFielding(
  state: GameState,
  civId: string,
): Partial<Record<CombatRole, number>> {
  const roles: Partial<Record<CombatRole, number>> = {};
  for (const unit of Object.values(state.units)) {
    if (unit.owner !== civId || unit.transportId) continue;
    if ((UNIT_DEFINITIONS[unit.type]?.strength ?? 0) <= 0) continue;
    const role = getUnitRoleDefinition(unit.type)?.primaryRole;
    if (!role) continue;
    roles[role] = (roles[role] ?? 0) + 1;
  }
  return roles;
}

export interface LegendaryWonderMilitaryQuestProgress {
  current: number;
  target: number;
  secondaryCurrent?: number;
  secondaryTarget?: number;
}

export function getLegendaryWonderMilitaryQuestProgress(
  state: GameState,
  civId: string,
  step: Extract<LegendaryWonderQuestStepDefinition, { type: 'field-combat-roles' | 'surviving-combat-wins' | 'fort-completions' | 'fortification-repels' | 'successful-interceptions' }>,
): LegendaryWonderMilitaryQuestProgress {
  const facts = (state.legendaryWonderHistory?.militaryFacts ?? []).filter(fact => fact.civId === civId);
  switch (step.type) {
    case 'field-combat-roles': {
      const roles = getCurrentCombatRoleFielding(state, civId);
      const allowed = step.allowedRoles ? new Set(step.allowedRoles) : undefined;
      const eligible = Object.entries(roles).filter(([role]) => !allowed || allowed.has(role as CombatRole));
      return {
        current: eligible.reduce((sum, [, count]) => sum + count, 0),
        target: step.targetUnitCount,
        secondaryCurrent: eligible.length,
        secondaryTarget: step.targetRoleCount,
      };
    }
    case 'surviving-combat-wins': {
      const allowed = step.allowedRoles ? new Set(step.allowedRoles) : undefined;
      const current = facts.filter((fact): fact is Extract<LegendaryWonderMilitaryFact, { kind: 'surviving-combat-win' }> =>
        fact.kind === 'surviving-combat-win' && (!allowed || allowed.has(fact.role)),
      ).length;
      return { current, target: step.targetCount };
    }
    case 'fort-completions': {
      const matching = facts.filter((fact): fact is Extract<LegendaryWonderMilitaryFact, { kind: 'fort-completed' }> => fact.kind === 'fort-completed');
      const current = step.distinctCityTerritories ? new Set(matching.map(fact => fact.cityId)).size : matching.length;
      return { current, target: step.targetCount };
    }
    case 'fortification-repels': {
      const allowed = step.tiers ? new Set(step.tiers) : undefined;
      const current = facts.filter((fact): fact is Extract<LegendaryWonderMilitaryFact, { kind: 'fortification-repel' }> =>
        fact.kind === 'fortification-repel' && (!allowed || allowed.has(fact.tier)),
      ).length;
      return { current, target: step.targetCount };
    }
    case 'successful-interceptions':
      return { current: facts.filter(fact => fact.kind === 'successful-interception').length, target: step.targetCount };
  }
}
