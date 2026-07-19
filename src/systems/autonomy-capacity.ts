import type { GameState } from '@/core/types';
import { isAutonomyActivated } from './autonomy-activation';
import { getNetworkPlanDefinition, getNetworkPlanLoad } from './network-plan-definitions';

export interface AutonomyCapacity {
  unrestricted: number;
  restricted: Record<string, number>;
}

export interface AutonomyLoad {
  total: number;
  unrestricted: number;
  byCategory: Record<string, number>;
}

export function getAutonomyCapacity(state: GameState, civId: string): AutonomyCapacity {
  if (!isAutonomyActivated(state, civId)) return { unrestricted: 0, restricted: {} };
  const cities = Object.values(state.cities).filter(city => city.owner === civId);
  const completed = state.civilizations[civId]?.techState.completed ?? [];
  const hasQuantumNetworking = completed.includes('quantum-networking');
  const precursorBuildings = new Set([
    'data_center', 'signals_hub', 'cyber_defense_center', 'automated_port',
    'smart_grid', 'space_center', 'semiconductor_fab',
  ]);
  const precursorCapacity = hasQuantumNetworking
    ? Math.min(4, cities.filter(city => city.buildings.some(building => precursorBuildings.has(building))).length)
    : 0;
  const operationsCenters = cities.filter(city => city.buildings.includes('network_operations_center')).length;
  const operationsCapacity = Math.min(3, operationsCenters) * 2 + Math.max(0, operationsCenters - 3);
  const safetyCapacity = cities.some(city => city.buildings.includes('ai_safety_institute')) ? 1 : 0;
  const nationalCapacity = Object.entries(state.builtNationalProjects ?? {})
    .some(([key, project]) => project.civId === civId && key === `${civId}:national_ai_assurance_program`) ? 2 : 0;
  return { unrestricted: 2 + precursorCapacity + operationsCapacity + safetyCapacity + nationalCapacity, restricted: {} };
}

export function getAutonomyLoad(state: GameState, civId: string): AutonomyLoad {
  const plans = Object.values(state.autonomyByCiv?.[civId]?.plans ?? {})
    .filter(plan => plan.status !== 'canceled' && plan.status !== 'completed');
  const byCategory: Record<string, number> = {};
  const total = plans.reduce((sum, plan) => {
    const definition = getNetworkPlanDefinition(plan.definitionId);
    const planLoad = getNetworkPlanLoad(plan.definitionId, plan.linkedUnitIds);
    const safeguardedHostileLoad = state.autonomyByCiv?.[civId]?.posture === 'safeguarded'
      && definition.targetKind === 'at-war-enemy-city' ? 1 : 0;
    const surgedLoad = plan.surgeResolutionTurn === state.turn ? planLoad : 0;
    byCategory[definition.category] = (byCategory[definition.category] ?? 0) + planLoad + safeguardedHostileLoad + surgedLoad;
    return sum + planLoad + safeguardedHostileLoad + surgedLoad;
  }, 0);
  return { total, unrestricted: total, byCategory };
}
