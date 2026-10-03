import type { GameState } from '@/core/types';
import { processMinorCivTurn, checkCampEvolution } from '@/systems/minor-civ-system';
import type { RoundPhase, RoundPhaseContext } from './types';

/**
 * City-states take their turn, then a barbarian camp that has grown evolves into a minor civ (`minor-
 * civ:evolved`).
 */
function runMinorCivs(state: GameState, context: RoundPhaseContext): GameState {
  let newState = state;
  const { bus } = context;
  // --- Minor civ turn phase ---
  newState = processMinorCivTurn(newState, bus);

  // --- Barbarian evolution check ---
  const evolution = checkCampEvolution(newState, newState.turn);
  if (evolution) {
    delete newState.barbarianCamps[evolution.removeCampId];
    newState.cities[evolution.newCity.id] = evolution.newCity;
    newState.units[evolution.newGarrison.id] = evolution.newGarrison;
    for (const uid of evolution.transferUnitIds) {
      if (newState.units[uid]) {
        newState.units[uid].owner = evolution.newMinorCiv.id;
      }
    }
    newState.minorCivs[evolution.newMinorCiv.id] = evolution.newMinorCiv;
    bus.emit('minor-civ:evolved', {
      campId: evolution.removeCampId,
      minorCivId: evolution.newMinorCiv.id,
      position: evolution.newCity.position,
    });
  }
  return newState;
}

export const minorCivsPhase: RoundPhase = { id: 'minor-civs', run: runMinorCivs };
