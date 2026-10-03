import type { GameState } from '@/core/types';
import { applyTerritoryFrontierProgressWithEvents, buildTerritoryTileFlippedEvents, recalculateTerritory } from '@/systems/city-territory-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * Tile ownership is recalculated once every city has produced and grown, tile flips are announced, then frontier
 * contests advance and their flips are announced too.
 */
function runTerritoryFrontier(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  const territoryBefore = newState;
  const territoryResult = recalculateTerritory(territoryBefore, {
    reason: 'turn',
    preserveCurrentHolderOnTie: true,
  });
  for (const event of buildTerritoryTileFlippedEvents(territoryBefore, territoryResult.state, territoryResult.resolutions)) {
    bus.emit('territory:tile-flipped', event);
  }
  const frontierResult = applyTerritoryFrontierProgressWithEvents(territoryResult);
  for (const event of buildTerritoryTileFlippedEvents(
    territoryResult.state,
    frontierResult.state,
    frontierResult.flippedResolutions,
  )) {
    bus.emit('territory:tile-flipped', event);
  }
  newState = frontierResult.state;
  return newState;
}

export const territoryFrontierPhase: RoundPhase = { id: 'territory-frontier', run: runTerritoryFrontier };
