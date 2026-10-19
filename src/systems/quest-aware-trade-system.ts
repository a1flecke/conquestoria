import type { GameState, TradeRoute, TradeRouteModeId } from '@/core/types';
import { applyQuestGameplayAction, type ChainTransition } from './quest-chain-system';
import {
  establishTradeRoute,
  type TradeRouteDenialReason,
} from './trade-route-contract';

export type QuestAwareRouteResult =
  | { ok: true; state: GameState; route: TradeRoute; questTransitions: ChainTransition[] }
  | { ok: false; state: GameState; reason: TradeRouteDenialReason };

/**
 * Creates a trade route through the family's canonical executor and then advances any quest that the
 * creation fulfils (#1500 item 6).
 *
 * A refusal is a typed `ok:false` carrying the contract's reason and the untouched state: no route is
 * created and no quest progresses, so a stale or repeated Confirm cannot double-advance a quest.
 */
export function establishQuestAwareRoute(
  state: GameState,
  caravanUnitId: string,
  toCityId: string,
  options: { automated?: boolean; originCityId?: string; mode?: TradeRouteModeId } = {},
): QuestAwareRouteResult {
  const caravan = state.units[caravanUnitId];
  if (!caravan) return { ok: false, state, reason: 'unit-missing' };

  const result = establishTradeRoute(state, {
    caravanUnitId,
    toCityId,
    actingCivId: caravan.owner,
    automated: options.automated ?? true,
    originCityId: options.originCityId,
    mode: options.mode,
  });
  if (!result.ok) return { ok: false, state, reason: result.reason };

  // Quest progress only after the canonical creation succeeded.
  const progress = applyQuestGameplayAction(result.state, {
    type: 'trade_route_created',
    actorCivId: caravan.owner,
    fromCityId: result.route.fromCityId,
    toCityId: result.route.toCityId,
    routeId: result.route.id,
    turn: state.turn,
  });
  return { ok: true, state: progress.state, route: result.route, questTransitions: progress.transitions };
}
