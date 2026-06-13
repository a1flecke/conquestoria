import type { GameState, TradeRoute } from '@/core/types';
import { applyQuestGameplayAction, type ChainTransition } from './quest-chain-system';
import { establishRoute } from './trade-system';

export function establishQuestAwareRoute(
  state: GameState,
  caravanUnitId: string,
  toCityId: string,
  resourceDiversity: number = 0,
): { state: GameState; route: TradeRoute; questTransitions: ChainTransition[] } {
  const caravan = state.units[caravanUnitId];
  if (!caravan) throw new Error(`Unit ${caravanUnitId} not found`);
  const previousRouteIds = new Set((state.marketplace?.tradeRoutes ?? []).map(route => route.id));
  const routedState = establishRoute(state, caravanUnitId, toCityId, undefined, resourceDiversity);
  const route = routedState.marketplace?.tradeRoutes.find(candidate => !previousRouteIds.has(candidate.id));
  if (!route) throw new Error('Route establishment did not create a route');
  const progress = applyQuestGameplayAction(routedState, {
    type: 'trade_route_created',
    actorCivId: caravan.owner,
    fromCityId: route.fromCityId,
    toCityId: route.toCityId,
    routeId: route.id,
    turn: state.turn,
  });
  return { state: progress.state, route, questTransitions: progress.transitions };
}
