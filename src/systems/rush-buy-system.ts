// src/systems/rush-buy-system.ts
// #1248: buying the active production item with gold. The *quote* (what it costs, whether it may be bought) is a
// pure query and stays in economy-system.ts with the rest of the treasury model; this is the *command* that spends the
// gold and completes the item, and so is the one place that needs unit completion (#1202). Moved verbatim out of
// economy-system.ts so the economy model (read by pirates, quests, pricing and the AI treasury) no longer imports the
// unit-production completion — which imports the air, espionage and world-actor systems — to answer an economy question.
import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { completeCityProductionItem } from './city-system';
import { projectActiveProduction } from './production-decision';
import { announceUnitProduction, completeUnitProduction } from './unit-production-completion';
import {
  calculateCivEconomy,
  getProductionLabel,
  getRushBuyQuote,
  toResolvedEconomyStatus,
  type EconomyProjection,
  type RushBuyDisabledReason,
} from './economy-system';

/**
 * #1415: true when the city's own production finishes its active item this turn
 * (`progress + projected production >= cost`). Buying such an item buys nothing: the gold is spent AND the item
 * completes immediately, so `processCity` then finds an empty queue and the city's WHOLE turn of output is
 * discarded instead of only the overflow (measured: 54 of 54 AI rush-buys in lh-late-era-medium ai-1, rounds
 * 186-200). The yield is the same projection AI production scoring uses for `productionPerTurn`; it slightly
 * under-reads the turn's real yield, so this errs toward allowing a purchase, never toward blocking a useful one.
 * An unrest-locked city produces nothing this turn, so a purchase there still buys real progress. Wonders are
 * never bought. A query only: the human rush-buy command below is unchanged.
 */
export function completesFromOwnProduction(state: GameState, civId: string, cityId: string): boolean {
  const projection = projectActiveProduction(state, civId, cityId);
  if (!projection || projection.itemId.startsWith('legendary:')) return false;
  return projection.progress + projection.productionPerTurn >= projection.cost;
}

export type RushBuyResult =
  | { success: true; state: GameState; itemId: string; label: string; cost: number; status: EconomyProjection }
  | { success: false; state: GameState; reason: RushBuyDisabledReason; message: string };

export function rushBuyActiveProduction(
  state: GameState,
  civId: string,
  cityId: string,
  bus: EventBus,
): RushBuyResult {
  const quote = getRushBuyQuote(state, civId, cityId);
  if (!quote.available || !quote.itemId) {
    return {
      success: false,
      state,
      reason: quote.reason ?? 'invalid-active-item',
      message: quote.message ?? 'This production item cannot be bought.',
    };
  }

  const city = state.cities[cityId];
  const civ = state.civilizations[civId];
  if (!city || !civ || city.owner !== civId) {
    return { success: false, state, reason: 'not-owner', message: 'Only the owner can buy production.' };
  }

  const completion = completeCityProductionItem(city, quote.itemId);
  const nextCiv = { ...civ, gold: civ.gold - quote.cost, units: [...civ.units] };
  if (nextCiv.gold < 0) {
    return { success: false, state, reason: 'not-enough-gold', message: `Not enough gold: need ${quote.cost}.` };
  }
  if (!completion.completedBuilding && !completion.completedUnit) {
    return { success: false, state, reason: 'invalid-active-item', message: 'This production item cannot be bought.' };
  }

  let nextState: GameState = {
    ...state,
    idCounters: { ...state.idCounters },
    cities: {
      ...state.cities,
      [cityId]: completion.city,
    },
    civilizations: {
      ...state.civilizations,
      [civId]: nextCiv,
    },
    units: { ...state.units },
    espionage: state.espionage ? { ...state.espionage } : state.espionage,
  };

  if (completion.completedBuilding) {
    bus.emit('city:building-complete', { cityId, buildingId: completion.completedBuilding });
  }

  if (completion.completedUnit) {
    // #1202: the same completion the turn path runs, so a bought unit is not a second-class unit.
    const made = completeUnitProduction(nextState, { civId, cityId, unitType: completion.completedUnit });
    if (!made.ok) {
      return { success: false, state, reason: 'invalid-active-item', message: 'This unit cannot be completed here right now.' };
    }
    nextState = made.state;
    announceUnitProduction(bus, cityId, civId, made);
  }

  const status = calculateCivEconomy(nextState, civId);
  nextState = {
    ...nextState,
    economyStatusByCiv: {
      ...(nextState.economyStatusByCiv ?? {}),
      [civId]: toResolvedEconomyStatus(status),
    },
  };

  return {
    success: true,
    state: nextState,
    itemId: quote.itemId,
    label: getProductionLabel(quote.itemId),
    cost: quote.cost,
    // #1320: hand back the projection computed for the post-purchase state so a
    // caller that needs the civ's economy again for this exact state (the AI
    // treasury batch loop) can reuse it instead of recomputing the identical
    // value. The projection depends only on state fields that this function
    // does not touch after computing it (`economyStatusByCiv` is not an input to
    // `calculateCivEconomy`), so it describes `state` exactly.
    status,
  };
}
