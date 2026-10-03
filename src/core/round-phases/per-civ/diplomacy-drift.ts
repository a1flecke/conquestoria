import type { GameState } from '@/core/types';
import { processRelationshipDrift, decayEvents } from '@/systems/diplomacy-state';
import { decayTreachery } from '@/systems/diplomacy-treachery';
import { tickTreaties } from '@/systems/diplomacy-treaties';
import { getVassalageMilitaryCount } from '@/systems/diplomacy-vassal-rules';
import type { CivTurn, CivRoster } from './types';

/**
 * Relationship drift toward neighbours whose units stand near its cities, event and treaty decay, and trade
 * agreement income.
 */
export function driftCivDiplomacy(state: GameState, turn: CivTurn, roster: CivRoster, grossGoldByCiv: Record<string, number>): void {
  const { civId, civ } = turn;
  const { civUnits } = roster;

  // Process diplomacy
  if (civ.diplomacy) {
    const unitsNearBorder: Record<string, boolean> = {};
    for (const otherCivId of Object.keys(state.civilizations)) {
      if (otherCivId === civId) continue;
      const otherCities = state.civilizations[otherCivId].cities
        .map(id => state.cities[id])
        .filter(Boolean);
      const hasUnitsNear = civUnits.some(u =>
        otherCities.some(c => {
          const dq = Math.abs(u.position.q - c!.position.q);
          const dr = Math.abs(u.position.r - c!.position.r);
          return dq + dr <= 3;
        }),
      );
      unitsNearBorder[otherCivId] = hasUnitsNear;
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
