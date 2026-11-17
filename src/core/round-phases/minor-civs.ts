import type { GameState } from '@/core/types';
import { processMinorCivTurn, checkCampEvolution } from '@/systems/minor-civ-system';
import { recalculateTerritory } from '@/systems/city-territory-system';
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
    // The raiders that joined it are no longer barbarians, so the barbarian AI no longer tracks their home camp.
    if (newState.opponentAI) {
      const homeCamps = { ...newState.opponentAI.barbarianHomeCampByUnitId };
      for (const uid of evolution.transferUnitIds) delete homeCamps[uid];
      newState.opponentAI = { ...newState.opponentAI, barbarianHomeCampByUnitId: homeCamps };
    }
    // The new city claims its land now, under the rule a founded city uses (never taking foreign-held tiles),
    // rather than standing on unowned tiles until the next round's territory pass.
    newState = recalculateTerritory(newState, { reason: 'founding', preserveForeignHolders: true }).state;
    bus.emit('minor-civ:evolved', {
      campId: evolution.removeCampId,
      minorCivId: evolution.newMinorCiv.id,
      position: evolution.newCity.position,
    });
  }
  return newState;
}

export const minorCivsPhase: RoundPhase = { id: 'minor-civs', run: runMinorCivs };
