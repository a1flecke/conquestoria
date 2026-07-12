import type { NetworkPlan } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { getNetworkPlanDefinition } from './network-plan-definitions';

export type NetworkEffectEvent =
  | { kind: 'exploit-delayed'; planId: string; cityId: string; goldTransferred: 0 }
  | { kind: 'exploit-resolved'; planId: string; cityId: string; goldTransferred: number };

export interface NetworkEffectResolution {
  state: GameState;
  creditsByOwner: Record<string, number>;
  events: NetworkEffectEvent[];
}

function findPlan(state: GameState, planId: string): { ownerCivId: string; plan: NetworkPlan } | null {
  for (const [ownerCivId, autonomy] of Object.entries(state.autonomyByCiv ?? {})) {
    const plan = autonomy.plans[planId];
    if (plan) return { ownerCivId, plan };
  }
  return null;
}

function updatePlan(state: GameState, ownerCivId: string, plan: NetworkPlan): GameState {
  const autonomy = state.autonomyByCiv![ownerCivId];
  return {
    ...state,
    autonomyByCiv: {
      ...state.autonomyByCiv,
      [ownerCivId]: {
        ...autonomy,
        plans: { ...autonomy.plans, [plan.id]: plan },
      },
    },
  };
}

function findHardenPlanForCity(
  state: GameState,
  cityId: string,
): { ownerCivId: string; plan: NetworkPlan } | null {
  const matches = Object.entries(state.autonomyByCiv ?? {})
    .flatMap(([ownerCivId, autonomy]) => Object.values(autonomy.plans)
      .filter(plan => plan.definitionId === 'harden'
        && plan.status === 'active'
        && plan.target.kind === 'city'
        && plan.target.cityId === cityId
        && (plan.effectState?.hardenCharges ?? 0) > 0)
      .map(plan => ({ ownerCivId, plan })))
    .sort((left, right) => left.plan.id.localeCompare(right.plan.id));
  return matches[0] ?? null;
}

export function resolveNetworkPlanAtTargetEnd(
  state: GameState,
  planId: string,
  context: { baseCityGold: number },
): NetworkEffectResolution {
  const found = findPlan(state, planId);
  if (!found || found.plan.definitionId !== 'exploit' || found.plan.target.kind !== 'city') {
    return { state, creditsByOwner: {}, events: [] };
  }
  const city = state.cities[found.plan.target.cityId];
  if (!city) return { state, creditsByOwner: {}, events: [] };
  const definition = getNetworkPlanDefinition('exploit');
  if (definition.effect.kind !== 'city-gold-transfer') return { state, creditsByOwner: {}, events: [] };

  const raw = Math.floor(Math.max(0, context.baseCityGold) * definition.effect.normalPercent / 100);
  const hasCdc = city.buildings.includes('cyber_defense_center');
  if (raw > 0 && hasCdc && !found.plan.effectState?.cdcDelayApplied) {
    const delayedPlan: NetworkPlan = {
      ...found.plan,
      effectState: { ...found.plan.effectState, cdcDelayApplied: true },
    };
    return {
      state: updatePlan(state, found.ownerCivId, delayedPlan),
      creditsByOwner: {},
      events: [{ kind: 'exploit-delayed', planId, cityId: city.id, goldTransferred: 0 }],
    };
  }

  let nextState = state;
  let mitigated = hasCdc ? Math.floor(raw / 2) : raw;
  const harden = raw > 0 ? findHardenPlanForCity(nextState, city.id) : null;
  if (harden) {
    mitigated = Math.floor(mitigated / 2);
    nextState = updatePlan(nextState, harden.ownerCivId, {
      ...harden.plan,
      effectState: {
        ...harden.plan.effectState,
        hardenCharges: (harden.plan.effectState?.hardenCharges ?? 1) - 1,
      },
    });
  }
  const goldTransferred = raw > 0 ? Math.max(1, mitigated) : 0;
  return {
    state: nextState,
    creditsByOwner: goldTransferred > 0 ? { [found.plan.ownerCivId]: goldTransferred } : {},
    events: [{ kind: 'exploit-resolved', planId, cityId: city.id, goldTransferred }],
  };
}
