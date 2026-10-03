import type { RoundPhase } from './types';
import { preludePhase } from './prelude';
import { instabilityPhase } from './instability';
import { preCivReconciliationPhase } from './pre-civ-reconciliation';
import { perCivPhase } from './per-civ';
import { postCivHousekeepingPhase } from './post-civ-housekeeping';
import { territoryFrontierPhase } from './territory-frontier';
import { wondersMarketPhase } from './wonders-market';
import { barbariansPhase } from './barbarians';
import { minorCivsPhase } from './minor-civs';
import { beastsPhase } from './beasts';
import { threatSchedulingPhase } from './threat-scheduling';
import { espionagePhase } from './espionage';
import { diplomacyTradePhase } from './diplomacy-trade';
import { piratesPhase } from './pirates';
import { tradeIncomePhase } from './trade-income';
import { leaguesPhase } from './leagues';
import { eraProgressionPhase } from './era-progression';
import { beastRewardsPhase } from './beast-rewards';
import { economyPhase } from './economy';
import { finalizationPhase } from './finalization';

export { createRoundPhaseContext } from './types';
export type { RoundPhase, RoundPhaseContext, RoundPhaseId } from './types';

/**
 * One completed round of world processing: these phases, in this order. The order is the only definition of it and is
 * load-bearing, pinned by `tests/core/round-phase-order.test.ts` (#1239): which system seams are entered in which
 * order, how civilizations are visited, what is emitted, and a digest of the resulting state. Reordering a phase is a
 * behaviour change, not a cleanup; if one is intended, change that test's literals in the same PR and say why.
 *
 * Why the order is what it is:
 *  - `prelude` makes the one working clone and seeds wonder projects; every later phase mutates and returns it.
 *  - `instability` runs BEFORE any yield so unrest and revolts affect this round's production.
 *  - `per-civ` is the only phase that visits civs one at a time; it credits gold into the round context.
 *  - `territory-frontier` runs after cities produce, `espionage` reads the visibility `per-civ` just refreshed.
 *  - `economy` settles last because every phase above it credits gold to it.
 *  - `finalization` advances the turn counter, checks victories and announces the new turn.
 *
 * Adding a phase: one module, one id in `RoundPhaseId`, one entry here, and the order literals in the #1239 test.
 */
export const ROUND_PHASES: readonly RoundPhase[] = [
  preludePhase,
  instabilityPhase,
  preCivReconciliationPhase,
  perCivPhase,
  postCivHousekeepingPhase,
  territoryFrontierPhase,
  wondersMarketPhase,
  barbariansPhase,
  minorCivsPhase,
  beastsPhase,
  threatSchedulingPhase,
  espionagePhase,
  diplomacyTradePhase,
  piratesPhase,
  tradeIncomePhase,
  leaguesPhase,
  eraProgressionPhase,
  beastRewardsPhase,
  economyPhase,
  finalizationPhase,
];
