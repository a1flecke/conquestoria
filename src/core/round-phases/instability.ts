import type { GameState } from '@/core/types';
import { processFactionTurn } from '@/systems/faction-system';
import { processBreakawayTurn } from '@/systems/breakaway-system';
import { processCrisisTurn } from '@/systems/crisis-system';
import { processEventChainTurn } from '@/systems/event-chain-lifecycle';
import { processWorldRacesTurn } from '@/systems/world-race-system';
import { processReligionTurn } from '@/systems/religion-system';
import { processLoyaltyTurn } from '@/systems/religion-loyalty-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Unrest and revolts, breakaway states, crises, event chains, world races, religion and loyalty resolve BEFORE any
 * city yield, so instability affects this round's production.
 */
function runInstability(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // Resolve unrest and revolts before city yields so instability impacts the current turn.
  newState = processFactionTurn(newState, bus);
  newState = processBreakawayTurn(newState, bus);
  newState = processCrisisTurn(newState, bus);
  newState = processEventChainTurn(newState, bus);
  newState = processWorldRacesTurn(newState, bus);
  newState = processReligionTurn(newState, bus);
  newState = processLoyaltyTurn(newState, bus);
  return newState;
}

export const instabilityPhase: RoundPhase = { id: 'instability', run: runInstability };
