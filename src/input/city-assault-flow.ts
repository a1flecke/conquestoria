import type { GameState, HexCoord } from '@/core/types';
import { moveUnit } from '@/systems/unit-system';
import { computeRazeGold, resolveMajorCityCapture, type MajorCityCaptureDisposition } from '@/systems/city-capture-system';

export interface PendingCityCaptureChoice {
  attackerId: string;
  cityId: string;
  targetCoord: HexCoord;
  occupiedPopulation: number;
  razeGold: number;
}

export function shouldPromptForPlayerCityCapture(
  city: { population: number },
): boolean {
  return city.population >= 1;
}

export function beginPlayerCityAssaultChoice(
  state: GameState,
  attackerId: string,
  cityId: string,
): { state: GameState; pending: PendingCityCaptureChoice } {
  const attacker = state.units[attackerId];
  const city = state.cities[cityId];
  if (!attacker || !city) {
    throw new Error('Cannot begin city assault without attacker and city');
  }

  const movedAttacker = {
    ...moveUnit(attacker, city.position, 1),
    movementPointsLeft: 0,
    hasMoved: true,
  };

  return {
    state: {
      ...state,
      units: {
        ...state.units,
        [attackerId]: movedAttacker,
      },
    },
    pending: {
      attackerId,
      cityId,
      targetCoord: city.position,
      occupiedPopulation: Math.max(1, Math.floor(city.population / 2)),
      razeGold: computeRazeGold(city),
    },
  };
}

export function finalizePlayerCityAssaultChoice(
  state: GameState,
  pending: PendingCityCaptureChoice,
  disposition: MajorCityCaptureDisposition,
  turn: number,
): { state: GameState; outcome: 'occupied' | 'razed'; goldAwarded: number } {
  return resolveMajorCityCapture(state, pending.cityId, state.currentPlayer, disposition, turn);
}
