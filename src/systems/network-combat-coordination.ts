import type { GameState, Unit } from '@/core/types';
import { hexDistance } from './hex-utils';
import { getNetworkPlanDefinition } from './network-plan-definitions';

export interface NetworkCombatCoordination {
  strengthBonus: number;
  planId: string | null;
}

const NONE: NetworkCombatCoordination = { strengthBonus: 0, planId: null };

function appliesToUnit(state: GameState, plan: NonNullable<GameState['autonomyByCiv']>[string]['plans'][string], unit: Unit, mode: 'attack' | 'defense'): boolean {
  const effect = getNetworkPlanDefinition(plan.definitionId).effect;
  if (plan.status !== 'active' || plan.target.kind !== 'formation' || !plan.target.unitIds.includes(unit.id)
    || effect.kind !== 'formation-strength' || effect.mode !== mode) return false;
  const sourceId = plan.source?.kind === 'unit' ? plan.source.unitId : plan.sourceUnitId;
  const source = sourceId ? state.units[sourceId] : undefined;
  return !!source && source.owner === unit.owner && plan.target.unitIds.every(unitId => {
    const linked = state.units[unitId];
    return linked?.owner === unit.owner && hexDistance(source.position, linked.position) <= getNetworkPlanDefinition(plan.definitionId).range;
  });
}

export function getNetworkCombatCoordination(state: GameState, unit: Unit, mode: 'attack' | 'defense'): NetworkCombatCoordination {
  const candidates = Object.values(state.autonomyByCiv?.[unit.owner]?.plans ?? {})
    .filter(plan => appliesToUnit(state, plan, unit, mode))
    .map(plan => {
      const effect = getNetworkPlanDefinition(plan.definitionId).effect;
      return { planId: plan.id, strengthBonus: effect.kind === 'formation-strength'
        ? (plan.surgeResolutionTurn === state.turn ? effect.surgedAmount : effect.normalAmount) : 0 };
    })
    .sort((a, b) => b.strengthBonus - a.strengthBonus || a.planId.localeCompare(b.planId));
  return candidates[0] ?? NONE;
}
