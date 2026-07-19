import type { GameState, ResourceYield } from '@/core/types';
import { getNetworkPlanDefinition } from './network-plan-definitions';

export function getNetworkCityYieldBonus(
  state: GameState,
  cityId: string,
  base: Pick<ResourceYield, 'production' | 'science'>,
): Pick<ResourceYield, 'production' | 'science'> {
  let production = 0;
  let science = 0;
  for (const autonomy of Object.values(state.autonomyByCiv ?? {})) {
    for (const plan of Object.values(autonomy.plans)) {
      if (plan.status !== 'active' || plan.target.kind !== 'city' || plan.target.cityId !== cityId) continue;
      const effect = getNetworkPlanDefinition(plan.definitionId).effect;
      if (effect.kind === 'city-production-percent') {
        production = Math.max(production, Math.min(effect.normalCap, Math.floor(base.production * effect.normalPercent / 100)));
      }
      if (effect.kind === 'city-science-percent') {
        science = Math.max(science, Math.min(effect.normalCap, Math.floor(base.science * effect.normalPercent / 100)));
      }
    }
  }
  return { production, science };
}
