import type { GameState, ResourceYield, TradeRoute } from '@/core/types';
import { getNetworkPlanDefinition } from './network-plan-definitions';

function isActiveOwnedPlanForCity(state: GameState, ownerCivId: string, cityId: string, definitionId?: string): boolean {
  return Object.values(state.autonomyByCiv?.[ownerCivId]?.plans ?? {}).some(plan =>
    plan.status === 'active'
      && ((plan.target.kind === 'city' && plan.target.cityId === cityId) || plan.linkedCityIds?.includes(cityId))
      && (!definitionId || plan.definitionId === definitionId),
  );
}

function isPlanSurgedThisTurn(state: GameState, plan: { surgeResolutionTurn?: number | null }): boolean {
  return plan.surgeResolutionTurn === state.turn;
}

export function getNetworkCityYieldBonus(
  state: GameState,
  cityId: string,
  base: Pick<ResourceYield, 'production' | 'science'>,
): Pick<ResourceYield, 'production' | 'science'> {
  let production = 0;
  let science = 0;
  const city = state.cities[cityId];
  if (!city) return { production, science };
  for (const autonomy of Object.values(state.autonomyByCiv ?? {})) {
    for (const plan of Object.values(autonomy.plans)) {
      if (plan.ownerCivId !== city.owner || plan.status !== 'active'
        || (plan.target.kind !== 'city' || (plan.target.cityId !== cityId && !plan.linkedCityIds?.includes(cityId)))) continue;
      const effect = getNetworkPlanDefinition(plan.definitionId).effect;
      if (effect.kind === 'city-production-percent') {
        const percent = isPlanSurgedThisTurn(state, plan) ? effect.surgedPercent : effect.normalPercent;
        const cap = isPlanSurgedThisTurn(state, plan) ? effect.surgedCap : effect.normalCap;
        production = Math.max(production, Math.min(cap, Math.floor(base.production * percent / 100)));
      }
      if (effect.kind === 'city-science-percent') {
        const percent = isPlanSurgedThisTurn(state, plan) ? effect.surgedPercent : effect.normalPercent;
        const cap = isPlanSurgedThisTurn(state, plan) ? effect.surgedCap : effect.normalCap;
        science = Math.max(science, Math.min(cap, Math.floor(base.science * percent / 100)));
      }
    }
  }
  return { production, science };
}

/** The plan's two earliest route ids are deliberately stable across reloads and hot-seat turns. */
export function getNetworkRouteGoldBonus(state: GameState, route: TradeRoute): number {
  const city = state.cities[route.fromCityId];
  if (!city || !isActiveOwnedPlanForCity(state, city.owner, city.id, 'logistics-routing')) return 0;
  const eligibleRoutes = (state.marketplace?.tradeRoutes ?? [])
    .filter(candidate => candidate.fromCityId === city.id)
    .sort((a, b) => a.id.localeCompare(b.id));
  if (!eligibleRoutes.slice(0, 2).some(candidate => candidate.id === route.id)) return 0;
  const plans = Object.values(state.autonomyByCiv?.[city.owner]?.plans ?? {})
    .filter(plan => plan.status === 'active' && plan.definitionId === 'logistics-routing'
      && plan.target.kind === 'city' && plan.target.cityId === city.id);
  return Math.max(0, ...plans.map(plan => {
    const effect = getNetworkPlanDefinition(plan.definitionId).effect;
    return effect.kind === 'route-gold' ? (isPlanSurgedThisTurn(state, plan) ? effect.surgedAmount : effect.normalAmount) : 0;
  }));
}

export function getNetworkUnitVisionBonus(state: GameState, unitId: string): number {
  const unit = state.units[unitId];
  if (!unit) return 0;
  let bonus = 0;
  for (const plan of Object.values(state.autonomyByCiv?.[unit.owner]?.plans ?? {})) {
    if (plan.status !== 'active' || plan.definitionId !== 'survey-grid' || !plan.linkedUnitIds?.includes(unitId)) continue;
    const effect = getNetworkPlanDefinition(plan.definitionId).effect;
    if (effect.kind === 'unit-vision') bonus = Math.max(bonus, isPlanSurgedThisTurn(state, plan) ? effect.surgedAmount : effect.normalAmount);
  }
  return bonus;
}
