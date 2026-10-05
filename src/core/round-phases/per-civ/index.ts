import type { GameState } from '@/core/types';
import { getCivilizationLiveness } from '@/systems/civilization-liveness';
import type { RoundPhase, RoundPhaseContext } from '../types';
import { startCivTurn } from './start-civ-turn';
import { runCityProduction } from './city-production';
import { settleCyberAndNetworkPlans } from './network-settlement';
import { addGoldBonuses } from './gold-bonuses';
import { runCivResearch } from './research';
import { settleUpkeepAndRemittances } from './upkeep-and-remittances';
import { driftCivDiplomacy, recordVassalagePeaks } from './diplomacy-drift';
import { healCivUnits, recoverUnitsAtTurnEnd, resetCivUnitMovement } from './unit-recovery';
import { applyStandingOrders } from './standing-orders';
import { snapshotCivRoster } from './roster-snapshot';
import { refreshCivVision, shareMinorAndAlliedVision, syncCivContacts } from './vision-and-contacts';
import { tickCivTimers } from './civ-timers';
import { queueGeneralCandidates } from './general-candidates';

export { applyHoldSiegeOrder } from './standing-orders';
export { deriveGeneralCandidateSeed } from './general-candidates';

/**
 * One visit per living civilization, in roster order. A visit is these steps, in this order (the order is load-bearing
 * and pinned by `tests/core/round-phase-order.test.ts`; each step lives in the module of the same name):
 *   start-civ-turn          supply, naval and air readiness, world-pressure turns, autonomy, network plans
 *   city-production         each city's yields, `processCity`, and what it completed
 *   network-settlement      cyber drain and network exploits take gold from the civ
 *   gold-bonuses            flat gold from wonders, luxury, trade partners and alliances
 *   research                science output, progress, completed-tech consequences
 *   upkeep-and-remittances  outpost upkeep, vassal tribute, federal remittance; credits `grossGoldByCiv`
 *   diplomacy-drift         vassalage peaks recorded
 *   unit-recovery           healing, gene-therapy recharge, General retirement, movement reset
 *   standing-orders         auto-explore, hold-siege, journeys
 *   roster-snapshot         the units and city positions diplomacy and vision read
 *   diplomacy-drift         relationship drift, decay, trade-agreement income
 *   vision-and-contacts     fog of war, shared vision, first contact
 *   civ-timers              advisor, research-penalty and satellite counters
 *   general-candidates      the next Great General choice
 */
function runPerCiv(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus, grossGoldByCiv } = context;
  for (const [civId, civ] of Object.entries(newState.civilizations)) {
    if (!getCivilizationLiveness(newState, civId).living) continue;

    const started = startCivTurn(newState, civId, civ, bus);
    newState = started.state;
    const { turn } = started;

    const production = runCityProduction(newState, turn, bus);
    newState = production.state;
    const { income } = production;

    newState = settleCyberAndNetworkPlans(newState, turn, income, context);
    addGoldBonuses(newState, turn, income);
    newState = runCivResearch(newState, turn, income, bus);
    settleUpkeepAndRemittances(newState, turn, income, grossGoldByCiv, bus);
    recordVassalagePeaks(newState, turn);

    const completedTechs = civ.techState.completed;
    healCivUnits(newState, turn, completedTechs);
    newState = recoverUnitsAtTurnEnd(newState, turn, bus);
    resetCivUnitMovement(newState, turn);
    newState = applyStandingOrders(newState, turn, completedTechs, bus);

    const roster = snapshotCivRoster(newState, turn);
    driftCivDiplomacy(newState, turn, roster, grossGoldByCiv);
    newState = refreshCivVision(newState, turn, roster);
    shareMinorAndAlliedVision(newState, turn);
    newState = syncCivContacts(newState, turn, bus);

    tickCivTimers(newState, turn);
    newState = queueGeneralCandidates(newState, turn);
  }
  return newState;
}

export const perCivPhase: RoundPhase = { id: 'per-civ', run: runPerCiv };
