import type { EventBus } from '@/core/event-bus';
import type { CombatResult, GameState } from '@/core/types';
import {
  beginMajorCityAssault,
  resolveMajorCityCapture,
  type MajorCityAssaultFailureReason,
  type MajorCityCaptureDisposition,
  type MajorCityCaptureResult,
  type PendingMajorCityCapture,
} from '@/systems/city-capture-system';

export type PendingCityCaptureChoice = PendingMajorCityCapture;

export type PlayerCityAssaultChoiceResult =
  | { ok: true; state: GameState; pending: PendingCityCaptureChoice }
  | { ok: false; state: GameState; reason: MajorCityAssaultFailureReason };

export function shouldPromptForPlayerCityCapture(
  city: { population: number },
): boolean {
  return city.population >= 1;
}

export function beginPlayerCityAssaultChoice(
  state: GameState,
  attackerId: string,
  cityId: string,
  bus?: EventBus,
  precedingCombat?: CombatResult,
  attackerMultiplier?: number,
): PlayerCityAssaultChoiceResult {
  return beginMajorCityAssault(
    state,
    attackerId,
    cityId,
    {
      actor: 'player',
      civId: state.currentPlayer,
      bus,
      precedingCombat,
      attackerMultiplier,
    },
  );
}

export function finalizePlayerCityAssaultChoice(
  state: GameState,
  pending: PendingCityCaptureChoice,
  disposition: MajorCityCaptureDisposition,
  turn: number,
  bus?: EventBus,
): MajorCityCaptureResult {
  return resolveMajorCityCapture(state, pending.cityId, state.currentPlayer, disposition, turn, bus);
}
