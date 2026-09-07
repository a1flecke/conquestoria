import type { GameState } from '@/core/types';
import { createEmptyAutonomyCivState } from '@/core/autonomy-state';
import { hexDistance } from '@/systems/hex-utils';
import { assignNetworkPlan, isAutonomyActivated } from '@/systems/network-plan-system';

/**
 * Schemas 3 and 6 — the autonomy/network subsystem: first its container and
 * cyber-unit plans (3), then the posture fields added later (6).
 */

export function migrateAutonomyNetwork(state: GameState): GameState {
  const autonomyByCiv = Object.fromEntries(Object.keys(state.civilizations ?? {}).map(civId => [
    civId,
    state.autonomyByCiv?.[civId] ?? createEmptyAutonomyCivState(),
  ]));
  let working: GameState = {
    ...state,
    autonomyByCiv,
    networkCivicPressureByCity: state.networkCivicPressureByCity ?? {},
    idCounters: { ...state.idCounters, nextNetworkPlanId: state.idCounters?.nextNetworkPlanId ?? 1 },
  };
  for (const civId of Object.keys(working.civilizations).sort()) {
    if (!isAutonomyActivated(working, civId)) continue;
    const sourceIds = Object.values(working.units)
      .filter(unit => unit.owner === civId && unit.type === 'cyber_unit')
      .map(unit => unit.id)
      .sort();
    for (const sourceUnitId of sourceIds) {
      const source = working.units[sourceUnitId];
      const owner = working.civilizations[civId];
      const target = Object.values(working.cities)
        .filter(city => city.owner !== civId
          && working.civilizations[city.owner]
          && owner.diplomacy.atWarWith.includes(city.owner)
          && hexDistance(source.position, city.position) <= 1)
        .sort((left, right) => left.id.localeCompare(right.id))[0];
      if (!target) continue;
      const assigned = assignNetworkPlan(working, {
        ownerCivId: civId,
        sourceUnitId,
        definitionId: 'exploit',
        target: { kind: 'city', cityId: target.id },
      });
      working = assigned.state;
    }
  }
  return working;
}


export function migrateAutonomyNetworkPostures(state: GameState): GameState {
  const autonomyByCiv = Object.fromEntries(Object.keys(state.civilizations ?? {}).map(civId => {
    const autonomy = state.autonomyByCiv?.[civId] ?? createEmptyAutonomyCivState();
    return [civId,
    {
      ...autonomy,
      plans: Object.fromEntries(Object.entries(autonomy.plans ?? {}).map(([planId, plan]) => [planId, {
        ...plan,
        source: plan.source ?? (plan.sourceUnitId ? { kind: 'unit' as const, unitId: plan.sourceUnitId } : undefined),
        linkedUnitIds: plan.linkedUnitIds ?? [],
        linkedCityIds: plan.linkedCityIds ?? [],
        surgeResolutionTurn: plan.surgeResolutionTurn ?? null,
      }])),
      posture: autonomy.posture ?? 'integrated',
      pendingPosture: autonomy.pendingPosture ?? null,
      surgeRecoveryUntilTurn: autonomy.surgeRecoveryUntilTurn ?? null,
      surgeCooldownUntilTurn: autonomy.surgeCooldownUntilTurn ?? null,
      postureChangedTurn: autonomy.postureChangedTurn ?? null,
    }];
  }));
  return { ...state, autonomyByCiv };
}
