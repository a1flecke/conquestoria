// src/systems/trade-route-delivery.ts
// #1504 MR07: where a route mode's per-round service actually lands.
//
// Settlement (`trade-route-economy.ts`) decides *that* a route was served and *what* the mode owes;
// this module credits that value to the one named recipient. Nothing here grants an empire-wide yield:
// a city delivery goes to the destination city, and a research delivery goes to the route owner's
// research progress — the same paths the normal turn already uses, so no second income model exists.
//
// The recipient records are transient settlement output, never persisted. `trade-income` applies them
// in the same round the route was settled, after blockades and suspended service have already been
// decided by the operating-status authority.
import type { GameState } from '@/core/types';
import { EventBus } from '@/core/event-bus';
import { applyResearchBonus } from '@/systems/tech-system';
import { applyResearchCompletionConsequences } from '@/systems/tech-completion-system';

/** The non-gold recipients a route mode can name. */
export type TradeRouteDeliveryRecipient =
  | 'destination-city-food'
  | 'destination-city-production'
  | 'owner-research';

export interface TradeRouteDelivery {
  routeId: string;
  recipient: TradeRouteDeliveryRecipient;
  /** The city that receives a city-scoped delivery. */
  cityId?: string;
  /** The civilization that receives a civ-scoped delivery. */
  civId?: string;
  /** Whole units delivered. Never negative. */
  amount: number;
}

/**
 * Credit every delivery once, to its named recipient. Returns the input state unchanged when there is
 * nothing to apply, so a round with no non-commerce routes allocates nothing.
 *
 * A production delivery lands in the destination city's current build progress (the same field the
 * wonder-completion and minor-civ ally bonuses already credit). A city with no active build has no
 * progress to receive it, so the delivery is simply not credited rather than being banked somewhere
 * the game does not model.
 *
 * Research goes through `applyResearchBonus` — the canonical path every other bonus-science source
 * uses — and, unlike those call sites, a delivery that *finishes* a technology also runs the real
 * completion consequences and emits `tech:completed`, so a trade route can never complete a tech
 * silently.
 */
export function applyTradeRouteDeliveries(
  state: GameState,
  deliveries: readonly TradeRouteDelivery[],
  bus?: EventBus,
): GameState {
  if (deliveries.length === 0) return state;

  let nextState = state;
  for (const delivery of deliveries) {
    const amount = Math.max(0, Math.floor(delivery.amount));
    if (amount === 0) continue;

    if (delivery.recipient === 'owner-research') {
      const civ = delivery.civId ? nextState.civilizations[delivery.civId] : undefined;
      if (!civ) continue;
      // Bonus science only advances an active research project, exactly as wonders and city-states do;
      // with nothing being researched there is no project to credit.
      if (!civ.techState.currentResearch) continue;
      const result = applyResearchBonus(civ.techState, amount);
      nextState = {
        ...nextState,
        civilizations: { ...nextState.civilizations, [civ.id]: { ...civ, techState: result.state } },
      };
      if (result.completedTech) {
        // A delivery can finish a technology; run the real completion path rather than leaving the
        // project at 100% silently. With no bus, the state consequences still apply.
        const eventBus = bus ?? new EventBus();
        eventBus.emit('tech:completed', {
          civId: civ.id,
          techId: result.completedTech,
          carriedProgress: result.carriedProgress,
          carriedIntoTechId: result.carriedProgress > 0 ? result.state.currentResearch : null,
        });
        nextState = applyResearchCompletionConsequences(nextState, civ.id, result.completedTech, eventBus);
      }
      continue;
    }

    const city = delivery.cityId ? nextState.cities[delivery.cityId] : undefined;
    if (!city) continue;
    if (delivery.recipient === 'destination-city-food') {
      nextState = {
        ...nextState,
        cities: { ...nextState.cities, [city.id]: { ...city, food: city.food + amount } },
      };
      continue;
    }
    // Production: only a city with an active build has progress to receive it.
    if (city.productionQueue.length === 0) continue;
    nextState = {
      ...nextState,
      cities: { ...nextState.cities, [city.id]: { ...city, productionProgress: city.productionProgress + amount } },
    };
  }
  return nextState;
}
