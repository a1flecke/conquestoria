// src/systems/rush-buy-system.ts
// #1248: buying the active production item with gold. The *quote* (what it costs, whether it may be bought) is a
// pure query and stays in economy-system.ts with the rest of the treasury model; this is the *command* that spends the
// gold and completes the item, and so is the one place that needs unit completion (#1202). Moved verbatim out of
// economy-system.ts so the economy model (read by pirates, quests, pricing and the AI treasury) no longer imports the
// unit-production completion — which imports the air, espionage and world-actor systems — to answer an economy question.
import type { GameState } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { completeCityProductionItem } from './city-system';
import { announceUnitProduction, completeUnitProduction } from './unit-production-completion';
import {
  calculateCivEconomy,
  getProductionLabel,
  getRushBuyQuote,
  toResolvedEconomyStatus,
  type RushBuyDisabledReason,
} from './economy-system';

export type RushBuyResult =
  | { success: true; state: GameState; itemId: string; label: string; cost: number }
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
  };
}
