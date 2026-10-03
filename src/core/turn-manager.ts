import type { GameState } from './types';
import { EventBus } from './event-bus';
import { createRoundPhaseContext } from './round-phases/types';
import { perCivPhase } from './round-phases/per-civ';
export { applyHoldSiegeOrder } from './round-phases/per-civ';
export { deriveGeneralCandidateSeed } from './round-phases/per-civ';
import { preludePhase } from './round-phases/prelude';
import { instabilityPhase } from './round-phases/instability';
import { postCivHousekeepingPhase } from './round-phases/post-civ-housekeeping';
import { territoryFrontierPhase } from './round-phases/territory-frontier';
import { wondersMarketPhase } from './round-phases/wonders-market';
import { minorCivsPhase } from './round-phases/minor-civs';
import { barbariansPhase } from './round-phases/barbarians';
import { beastsPhase } from './round-phases/beasts';
import { threatSchedulingPhase } from './round-phases/threat-scheduling';
import { espionagePhase } from './round-phases/espionage';
import { diplomacyTradePhase } from './round-phases/diplomacy-trade';
import { tradeIncomePhase } from './round-phases/trade-income';
import { leaguesPhase } from './round-phases/leagues';
import { eraProgressionPhase } from './round-phases/era-progression';
import { beastRewardsPhase } from './round-phases/beast-rewards';
import { economyPhase } from './round-phases/economy';
import { piratesPhase } from './round-phases/pirates';
import { preCivReconciliationPhase } from './round-phases/pre-civ-reconciliation';
import { finalizationPhase } from './round-phases/finalization';
export { finalizeOpponentRoundState } from './round-phases/finalization';

/**
 * One completed round of world processing. The ORDER below is load-bearing and is pinned by
 * `tests/core/round-phase-order.test.ts` (#1239): which system seams are entered in which order, how civilizations
 * are visited, what is emitted, and a digest of the resulting state. Reordering a phase is a behaviour change, not
 * a cleanup; if one is intended, change that test's literals in the same PR and say why.
 *
 * Phases, in the order they run (ids are the test's, and #1240's decomposition uses the same ones):
 *   prelude                 clone, seed wonder projects, reconcile liveness, normalise the AI container, `turn:end`
 *   instability             unrest/revolts, breakaway, crises, event chains, world races, religion, loyalty
 *   pre-civ-reconciliation  liveness again, crisis responses, occupation, wonder availability, marketplace expiry
 *   per-civ                 for each living civ in roster order: supply/naval/air, world-pressure turns, autonomy,
 *                           network plans, city production and yields, gold, research, upkeep, healing, movement
 *                           reset, standing orders, diplomacy drift, vision and contacts, advisors, general candidates
 *   post-civ-housekeeping   expire diplomatic requests, tick production-disabled timers
 *   territory-frontier      recalculate ownership, advance frontier contests
 *   wonders-market          legendary-wonder projects and availability, fashion cycle and prices, wonder effects
 *   barbarians              reset, plan, spawn, pillage, move, attack units and cities, city HP regeneration
 *   minor-civs              city-state turn, camp evolution
 *   beasts                  lairs, spawns, growth, moves, attacks
 *   threat-scheduling       independent threats, crisis/event-chain/stampede/rogue-host scheduling and lifecycle events
 *   espionage               missions, detection, interrogations, spy vision, counter-intelligence, last-seen re-snapshot
 *   diplomacy-trade         vassalage turn, embargo auto-join, stale/embargoed route scrub, caravan runners
 *   pirates                 pirate round
 *   trade-income            route income credited to each civ
 *   leagues                 defensive-league dissolution
 *   era-progression         era advancement, national-project expiry and dequeue, civ and minor-civ era events
 *   beast-rewards           auto-resolve AI hoard choices, trophy gold
 *   economy                 `applyEconomyTurn` per civ (last: every phase above credits gold to it)
 *   finalization            liveness, opponent-AI round state, `turn + 1`, victories, `turn:start`
 */
export function processTurn(
  state: GameState,
  bus: EventBus,
): GameState {
  const context = createRoundPhaseContext(state, bus);
  let newState = preludePhase.run(state, context);

  newState = instabilityPhase.run(newState, context);
  newState = preCivReconciliationPhase.run(newState, context);

  newState = perCivPhase.run(newState, context);
  newState = postCivHousekeepingPhase.run(newState, context);

  newState = territoryFrontierPhase.run(newState, context);

  newState = wondersMarketPhase.run(newState, context);

  newState = barbariansPhase.run(newState, context);

  newState = minorCivsPhase.run(newState, context);

  newState = beastsPhase.run(newState, context);

  newState = threatSchedulingPhase.run(newState, context);

  newState = espionagePhase.run(newState, context);

  newState = diplomacyTradePhase.run(newState, context);

  newState = piratesPhase.run(newState, context);

  newState = tradeIncomePhase.run(newState, context);

  newState = leaguesPhase.run(newState, context);

  newState = eraProgressionPhase.run(newState, context);

  newState = beastRewardsPhase.run(newState, context);

  newState = economyPhase.run(newState, context);

  newState = finalizationPhase.run(newState, context);
  return newState;
}
