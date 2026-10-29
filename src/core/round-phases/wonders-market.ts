import type { GameState } from '@/core/types';
import { processWonderEffects } from '@/systems/wonder-system';
import { createRng } from '@/systems/map-generator';
import { reconcileLegendaryWonderAvailability, tickLegendaryWonderProjects } from '@/systems/legendary-wonder-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Legendary-wonder projects tick and their availability is reconciled; natural wonders apply their
 * effects (`wonder:eruption`). #1516 MR19 removed the global world-price/fashion roll: seller
 * offers are the only price source, so this phase no longer reprices a world market.
 */
function runWondersMarket(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  newState = tickLegendaryWonderProjects(newState, bus);
  newState = reconcileLegendaryWonderAvailability(newState, bus);

  // --- Process wonder effects (after city processing) ---
  const wonderRng = createRng(`wonder-${newState.turn}`);
  const eruptions = processWonderEffects(newState, wonderRng);
  for (const eruption of eruptions) {
    bus.emit('wonder:eruption', {
      wonderId: eruption.wonderId,
      position: eruption.position,
      tilesAffected: eruption.tilesAffected,
    });
  }
  return newState;
}

export const wondersMarketPhase: RoundPhase = { id: 'wonders-market', run: runWondersMarket };
