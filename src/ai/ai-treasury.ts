import type { EventBus } from '@/core/event-bus';
import type { GameState } from '@/core/types';
import {
  calculateCivEconomy,
  calculateMaintenance,
  type EconomyProjection,
  getRushBuyQuote,
  rushBuyActiveProduction,
} from '@/systems/economy-system';

/**
 * #1094: the AI never called `rushBuyActiveProduction` -- the same gold-for-
 * production-speed mechanic every human player has via the city panel
 * (`getRushBuyQuote`/`rushBuyActiveProduction` in `economy-system.ts`). With
 * production genuinely queued (the common case for a developed civ, not the
 * separate empty-queue `production-idle` finding), an AI's gold has *no*
 * legal use at all once treasury strain is 'none', so a healthy economy's
 * gold only ever climbs -- exactly the `gold-hoard` long-horizon finding,
 * confirmed to reproduce for the FULL length of a 300-round campaign,
 * independent of any idle window (see the #1094 design doc).
 *
 * `getRushBuyQuote` already refuses when treasury strain is 'high'/'critical'
 * and when gold is short of the rush cost -- this only adds the AI-specific
 * question "is spending here worth it *right now*", via the same
 * reserve-headroom shape `reserveAllows` already uses in `ai-production.ts`:
 * gold remaining after the purchase must still cover `RESERVE_ROUNDS` rounds
 * of the civ's own current total maintenance. A civ with zero maintenance
 * (very early game) has a reserve requirement of 0, matching
 * `reserveAllows`'s existing behavior for the same edge case.
 *
 * Deliberately NOT emergency-aware and NOT personality-weighted: the queue
 * item being rushed was already the AI's own best-scored production choice
 * (`applyAIProduction`), including its emergency-defense scoring -- rushing
 * it faster inherits that priority for free. Difficulty-invariant: every
 * challenge tier and personality gets the identical rule, matching
 * `getRushBuyQuote`'s own legality (no challenge-profile input).
 */
const RESERVE_ROUNDS = 2;

function totalMaintenanceFor(state: GameState, civId: string): number {
  const maintenance = calculateMaintenance(state, civId);
  return maintenance.buildingUpkeep + maintenance.unitUpkeep;
}

/**
 * Rush-buys active production in every one of `civId`'s cities where it is
 * legal (`getRushBuyQuote`) and leaves the civ's treasury with its ordinary
 * maintenance reserve intact afterward. Cities are processed in the civ's own
 * (already-deterministic) `cities` order; each purchase re-reads gold from
 * the threaded state, so an early purchase naturally reduces what a later
 * city in the same round can afford -- no separate per-round spending cap is
 * needed on top of that.
 *
 * `totalMaintenanceFor` is cached across cities in the same round and only
 * recomputed after a successful purchase (the one thing that can change it --
 * a rushed building/unit can add its own upkeep). This is an exact
 * optimization, not an approximation: a multi-city civ with several
 * already-queued cities would otherwise pay `calculateMaintenance`'s full
 * O(cities + units) cost once per candidate city, which is the redundant
 * quadratic-shaped cost `.claude/rules/performance-budgets.md` calls out --
 * see the #1094 PR for the measured wall-clock this fixed on `lh-veteran-large`.
 *
 * #1125: that PR left `getRushBuyQuote`'s own `calculateCivEconomy` call
 * unaddressed ("out of scope... without risking the shared human rush-buy
 * path"). `calculateCivEconomy(state, civId)` takes no per-city input, so
 * calling it once per producing city against the SAME unchanged `state` was an
 * exact, provable redundancy -- `ownerStatus` below gets the identical
 * cache/invalidate-on-purchase treatment `cachedMaintenance` already has.
 * `rushBuyActiveProduction` itself is deliberately left untouched (its own
 * internal re-validation quote call and its post-purchase `economyStatusByCiv`
 * persistence call both still do their own `calculateCivEconomy` work) --
 * threading a precomputed context into the one function BOTH the human "Rush
 * Buy" button and this AI loop share would special-case the AI caller's trust
 * level, which is exactly the divergent-legality pattern this module's own
 * design doc (docs/superpowers/specs/2026-09-18-issue-1125-long-horizon-
 * stability-design.md §5d) rules out. See that doc for the full call-graph
 * accounting.
 */
export function applyAIGoldSpending(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  let nextState = state;
  let cachedMaintenance: number | null = null;
  let ownerStatus: EconomyProjection | null = null;
  for (const cityId of civ.cities) {
    const city = nextState.cities[cityId];
    if (!city || city.owner !== civId || city.productionQueue.length === 0) continue;
    ownerStatus ??= calculateCivEconomy(nextState, civId);
    const quote = getRushBuyQuote(nextState, civId, cityId, ownerStatus);
    if (!quote.available) continue;
    cachedMaintenance ??= totalMaintenanceFor(nextState, civId);
    const civGold = nextState.civilizations[civId]!.gold;
    if (civGold - quote.cost < cachedMaintenance * RESERVE_ROUNDS) continue;
    const result = rushBuyActiveProduction(nextState, civId, cityId, bus);
    if (result.success) {
      nextState = result.state;
      cachedMaintenance = null;
      ownerStatus = null;
    }
  }
  return nextState;
}
