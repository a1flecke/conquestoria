// src/systems/production-decision.ts
// Production-decision arc: ONE pure, read-only answer to "what happens if I leave this city's production as it is, buy
// the item, or change the queue?" It exists so the city panel can explain consequences from the same numbers the
// simulation uses, instead of each surface deriving its own. Nothing here changes a rule: cost is the canonical
// `buildProductionCostContext` price, the rush price is `getRushBuyQuote`, the overflow rule is
// `canCarryProductionOverflow`, and per-turn output is `projectActiveProduction`.
//
// Honesty about the future: the per-turn figure is a PROJECTION of this city's own yield (see
// `projectActiveProduction`), so every forecast here is an estimate. `isEstimate` is always true; a caller must not
// word it as a guarantee. The query reads only the deciding civ's own city, never another civ's state.
import type { GameState } from '@/core/types';
import { resolveCivDefinition } from './civ-registry';
import { calculateProjectedCityYields } from './city-work-system';
import { canCarryProductionOverflow } from './city-turn';
import { getRushBuyQuote, type RushBuyDisabledReason } from './economy-system';
import { isCityProductionLocked } from './faction-unrest-model';
import { getProductionCostForCivItem } from './production-cost-context';

// --- The one read of the active item: cost, stored progress, this turn's output. ---
// The AI treasury (`completesFromOwnProduction`, rush-buy-system.ts) and the decision view below both read it, so a
// preview and a purchase guard cannot disagree about the same city. It recomputes neither cost nor yield.
export interface ActiveProductionProjection {
  itemId: string;
  /** Canonical cost for this owner and city (`buildProductionCostContext`). */
  cost: number;
  /** Production already stored on the active item. */
  progress: number;
  /** Production the city is projected to add this turn; 0 while production is locked. */
  productionPerTurn: number;
  /** True when an unrest lock or disabled-production counter stops the city producing this turn. */
  locked: boolean;
}

/**
 * Projects the owner's active production item. Returns null for a missing city, a city the civ does not own, an empty
 * queue or an unpriced item, so a caller never previews something it could not act on.
 *
 * `productionPerTurn` is an ESTIMATE: it is the same city-work projection AI scoring uses (`calculateProjectedCityYields`),
 * which leaves out empire-wide technology percentages and transient multipliers the turn applies. A caller that has a
 * more complete displayed figure (the city panel) passes it as `productionPerTurnOverride`; a lock still zeroes it.
 */
export function projectActiveProduction(
  state: GameState,
  civId: string,
  cityId: string,
  productionPerTurnOverride?: number,
): ActiveProductionProjection | null {
  const city = state.cities[cityId];
  if (!city || city.owner !== civId) return null;
  const itemId = city.productionQueue[0];
  if (!itemId) return null;
  const cost = getProductionCostForCivItem(state, civId, cityId, itemId);
  if (cost <= 0) return null;
  const locked = isCityProductionLocked(city);
  const projected = productionPerTurnOverride
    ?? calculateProjectedCityYields(state, cityId, resolveCivDefinition(state, state.civilizations[civId]?.civType ?? '')?.bonusEffect).production;
  return {
    itemId,
    cost,
    progress: city.productionProgress,
    productionPerTurn: locked ? 0 : Math.max(0, projected),
    locked,
  };
}

// --- The player-facing decision view. ---


export interface ProductionDecisionOptions {
  /** A caller's own displayed per-turn production (the city panel's figure). A production lock still zeroes it. */
  productionPerTurn?: number;
}

export type ProductionOverflowOutcome = 'none' | 'discarded' | 'carried';

export interface ProductionDecision {
  cityId: string;
  itemId: string;
  /** Canonical cost for this owner and city. */
  cost: number;
  progress: number;
  /** `cost - progress`, never negative. */
  remaining: number;
  /** Projected production this turn; 0 while locked. An estimate. */
  productionPerTurn: number;
  locked: boolean;
  /** Turns of ordinary production still needed (>= 1); null when the city is not producing anything. */
  turnsToComplete: number | null;
  /** Ordinary production is projected to complete the item during this turn's end-of-turn processing. */
  finishesThisTurn: boolean;
  rush: {
    available: boolean;
    /** Gold price from `getRushBuyQuote`; 0 when the quote has no price (wonder, no item). */
    goldCost: number;
    reason: RushBuyDisabledReason | null;
    /**
     * Turns earlier than ordinary production the purchase delivers the item (0 when production finishes it this turn
     * anyway: buying then only makes it available before you end the turn). Null when production would never finish it.
     */
    turnsSaved: number | null;
    /** The purchase is legal but production alone finishes the item this turn (and production is not locked). */
    redundant: boolean;
  };
  /** Stored production erased if the active item is replaced or removed (the queue-head rule). */
  progressAtStake: number;
  overflow: {
    /** Surplus beyond the item's remaining cost that this turn's output would produce. */
    excess: number;
    /** `carried` only with 3d-printing AND another item queued behind this one; otherwise the surplus is discarded. */
    outcome: ProductionOverflowOutcome;
    /** 3d-printing is researched but nothing is queued behind the active item, so nothing can receive the surplus. */
    carryNeedsQueuedItem: boolean;
  };
  isEstimate: true;
}

/** Null for a missing city, one the civ does not own, or an empty queue (nothing to decide about). */
export function getProductionDecision(
  state: GameState,
  civId: string,
  cityId: string,
  options: ProductionDecisionOptions = {},
): ProductionDecision | null {
  const projection = projectActiveProduction(state, civId, cityId, options.productionPerTurn);
  if (!projection) return null;
  const city = state.cities[cityId]!;
  const { cost, progress, productionPerTurn, locked, itemId } = projection;
  const remaining = Math.max(0, cost - progress);
  const turnsToComplete = productionPerTurn > 0 ? Math.max(1, Math.ceil(remaining / productionPerTurn)) : null;
  const finishesThisTurn = turnsToComplete === 1;
  const quote = getRushBuyQuote(state, civId, cityId);

  const excess = Math.min(productionPerTurn, Math.max(0, progress + productionPerTurn - cost));
  const completedTechs = state.civilizations[civId]?.techState.completed;
  const queuedBehind = city.productionQueue.length - 1;
  const outcome: ProductionOverflowOutcome = excess === 0
    ? 'none'
    : canCarryProductionOverflow(completedTechs, queuedBehind) ? 'carried' : 'discarded';

  return {
    cityId,
    itemId,
    cost,
    progress,
    remaining,
    productionPerTurn,
    locked,
    turnsToComplete,
    finishesThisTurn,
    rush: {
      available: quote.available,
      goldCost: quote.cost,
      reason: quote.reason,
      turnsSaved: turnsToComplete === null ? null : turnsToComplete - 1,
      redundant: quote.available && finishesThisTurn && !locked,
    },
    progressAtStake: progress,
    overflow: {
      excess,
      outcome,
      carryNeedsQueuedItem: excess > 0 && Boolean(completedTechs?.includes('3d-printing')) && queuedBehind === 0,
    },
    isEstimate: true,
  };
}

export interface IdleProductionDecision {
  mode: 'gold' | 'science' | null;
  /** Conversion happens only when the queue is empty at the start of the turn. */
  convertsThisTurn: boolean;
  /** A mode is selected but a queue exists, so it does nothing until the queue empties. */
  dormant: boolean;
}

export function getIdleProductionDecision(state: GameState, civId: string, cityId: string): IdleProductionDecision | null {
  const city = state.cities[cityId];
  if (!city || city.owner !== civId) return null;
  const mode = city.idleProduction === 'gold' || city.idleProduction === 'science' ? city.idleProduction : null;
  const queued = city.productionQueue.length > 0;
  return { mode, convertsThisTurn: mode !== null && !queued, dormant: mode !== null && queued };
}
