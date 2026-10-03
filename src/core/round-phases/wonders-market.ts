import type { GameState } from '@/core/types';
import { processFashionCycle, updatePrices } from '@/systems/trade-system';
import { processWonderEffects } from '@/systems/wonder-system';
import { createRng } from '@/systems/map-generator';
import { createSimulationRng } from '@/systems/simulation-rng';
import { reconcileLegendaryWonderAvailability, tickLegendaryWonderProjects } from '@/systems/legendary-wonder-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Legendary-wonder projects tick and their availability is reconciled; the marketplace rolls one global fashion
 * cycle for the round and reprices from this round's supply (resource tiles in city territory) and demand
 * (population); natural wonders apply their effects (`wonder:eruption`).
 */
function runWondersMarket(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  newState = tickLegendaryWonderProjects(newState, bus);
  newState = reconcileLegendaryWonderAvailability(newState, bus);

  // --- Process marketplace ---
  if (newState.marketplace) {
    // #982: one global fashion-cycle roll per turn. Was `turn*16807` alone --
    // no gameId, so two campaigns at the same turn shared one fashion cycle.
    const simpleRng = createSimulationRng(newState, { domain: 'marketplace-fashion-cycle', eventId: 'fashion-cycle' });
    newState.marketplace = processFashionCycle(newState.marketplace, simpleRng);

    // Compute supply (resource tiles in city territory) and demand (population)
    const supply: Record<string, number> = {};
    const demand: Record<string, number> = {};
    for (const city of Object.values(newState.cities)) {
      // Count resource-bearing tiles in the city's territory for supply
      for (const coord of city.ownedTiles) {
        const tile = newState.map.tiles[`${coord.q},${coord.r}`];
        if (tile?.resource) {
          supply[tile.resource] = (supply[tile.resource] ?? 0) + 1;
        }
      }
      // Population drives demand for all resources
      const pop = city.population;
      for (const r of Object.keys(newState.marketplace.prices)) {
        demand[r] = (demand[r] ?? 0) + pop;
      }
    }
    newState.marketplace = updatePrices(newState.marketplace, supply, demand);
  }

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
