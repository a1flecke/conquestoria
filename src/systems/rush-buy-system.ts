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
import { beginCityMaterialOccurrence, getCityMaterialProjection, spendActiveMaterialRecipe } from './city-production-materials';
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
  // #1506 MR09: a materially waiting head cannot finish this turn no matter how much progress it
  // has; buying it would spend gold on an item the city still cannot complete.
  if (!getCityMaterialProjection(state, cityId).funded) return false;
  return projection.progress + projection.productionPerTurn >= projection.cost;
}

export type RushBuyResult =
  | { success: true; state: GameState; itemId: string; label: string; cost: number; status: EconomyProjection }
  | { success: false; state: GameState; reason: RushBuyDisabledReason; message: string };

export interface RushBuyOptions {
  /**
   * #1506 MR09: the active occurrence the caller believes it is buying. A stale callback that no
   * longer matches must not purchase the next identical queued item. Omit only for a caller that
   * has just read the city in the same synchronous step.
   */
  expectedOccurrence?: number;
}

export function rushBuyActiveProduction(
  state: GameState,
  civId: string,
  cityId: string,
  bus: EventBus,
  options: RushBuyOptions = {},
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

  const occurrence = city.productionMaterials?.activeOccurrence ?? 0;
  if (options.expectedOccurrence !== undefined && options.expectedOccurrence !== occurrence) {
    return {
      success: false,
      state,
      reason: 'stale-occurrence',
      message: 'The city’s active production changed. Try again.',
    };
  }

  // #1506 MR09 task 6: the hard recipe is spent on the candidate state before gold, completion or
  // placement. Any later refusal returns the untouched input state, so a failed buy consumes nothing.
  const materialSpend = spendActiveMaterialRecipe(state, cityId);
  if (!materialSpend.ok) {
    return {
      success: false,
      state,
      reason: 'not-enough-materials',
      message: 'Not enough materials to buy this item.',
    };
  }
  const candidate = materialSpend.state;
  const candidateCity = candidate.cities[cityId]!;

  const completion = completeCityProductionItem(candidateCity, quote.itemId);
  if (!completion.completedBuilding && !completion.completedUnit) {
    return { success: false, state, reason: 'invalid-active-item', message: 'This production item cannot be bought.' };
  }

  const nextCiv = { ...candidate.civilizations[civId]!, gold: candidate.civilizations[civId]!.gold - quote.cost, units: [...candidate.civilizations[civId]!.units] };
  if (nextCiv.gold < 0) {
    return { success: false, state, reason: 'not-enough-gold', message: `Not enough gold: need ${quote.cost}.` };
  }

  let nextState: GameState = {
    ...candidate,
    idCounters: { ...candidate.idCounters },
    cities: {
      ...candidate.cities,
      [cityId]: completion.city,
    },
    civilizations: {
      ...candidate.civilizations,
      [civId]: nextCiv,
    },
    units: { ...candidate.units },
    espionage: candidate.espionage ? { ...candidate.espionage } : candidate.espionage,
  };

  if (completion.completedUnit) {
    // #1202: the same completion the turn path runs, so a bought unit is not a second-class unit.
    // Placement/basing is part of the same transaction: a refusal returns the original state.
    const made = completeUnitProduction(nextState, { civId, cityId, unitType: completion.completedUnit });
    if (!made.ok) {
      return { success: false, state, reason: 'invalid-active-item', message: 'This unit cannot be completed here right now.' };
    }
    nextState = made.state;
    // The purchased head is a real occurrence transition: fund the promoted head.
    nextState = beginCityMaterialOccurrence(nextState, cityId);
    if (completion.completedBuilding) {
      bus.emit('city:building-complete', { cityId, buildingId: completion.completedBuilding });
    }
    // Announce only the accepted transaction.
    announceUnitProduction(bus, cityId, civId, made);
  } else {
    nextState = beginCityMaterialOccurrence(nextState, cityId);
    if (completion.completedBuilding) {
      bus.emit('city:building-complete', { cityId, buildingId: completion.completedBuilding });
    }
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
    status,
  };
}
