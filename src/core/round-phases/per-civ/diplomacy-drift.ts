import type { GameState } from '@/core/types';
import { processRelationshipDrift, decayEvents } from '@/systems/diplomacy-state';
import { decayTreachery } from '@/systems/diplomacy-treachery';
import { tickTreaties } from '@/systems/diplomacy-treaties';
import { hasBorderTension } from '@/systems/border-tension';
import { getVassalageMilitaryCount } from '@/systems/diplomacy-vassal-rules';
import type { CivTurn } from './types';

/**
 * Relationship drift against neighbours whose troops stand near this civ's cities, event and treaty decay, and trade
 * agreement income.
 */
export function driftCivDiplomacy(state: GameState, turn: CivTurn, grossGoldByCiv: Record<string, number>): void {
  const { civId, civ } = turn;

  // Process diplomacy
  if (civ.diplomacy) {
    // The civ resents rivals whose troops stand near its own cities (#1763 follow-up: the intruder used to
    // lose opinion of the civ it approached, so massing troops on a border earned the approached civ's goodwill).
    const unitsNearBorder: Record<string, boolean> = {};
    for (const otherCivId of Object.keys(state.civilizations)) {
      if (otherCivId === civId) continue;
      unitsNearBorder[otherCivId] = hasBorderTension(state, civId, otherCivId);
    }

    let dipState = processRelationshipDrift(civ.diplomacy, unitsNearBorder);
    dipState = decayEvents(dipState, state.turn);
    dipState = tickTreaties(dipState);

    // Treachery decay
    dipState = decayTreachery(dipState, state.turn);

    // Trade agreement gold income
    for (const treaty of dipState.treaties) {
      if (treaty.type === 'trade_agreement' && treaty.goldPerTurn) {
        grossGoldByCiv[civId] = (grossGoldByCiv[civId] ?? 0) + treaty.goldPerTurn;
      }
    }

    state.civilizations[civId].diplomacy = dipState;
  }
}

/**
 * Raises the civ's recorded peak city and military counts, which vassalage eligibility reads.
 */
export function recordVassalagePeaks(state: GameState, turn: CivTurn): void {
  const { civId, currentCivState } = turn;

  // Update peak counts (read from state to pick up earlier mutations in this loop)
  if (currentCivState.diplomacy) {
    const cityCount = currentCivState.cities.length;
    const milCount = getVassalageMilitaryCount(state, civId);
    if (cityCount > currentCivState.diplomacy.vassalage.peakCities) {
      state.civilizations[civId].diplomacy.vassalage.peakCities = cityCount;
    }
    if (milCount > currentCivState.diplomacy.vassalage.peakMilitary) {
      state.civilizations[civId].diplomacy.vassalage.peakMilitary = milCount;
    }
  }
}
