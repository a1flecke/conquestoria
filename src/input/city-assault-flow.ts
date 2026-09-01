import type { EventBus } from '@/core/event-bus';
import type { CombatResult, GameState } from '@/core/types';
import {
  beginMajorCityAssault,
  recordCityCaptureCareerEvents,
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
  // #887 MR1: capture the historical city name before resolve (a razed city is
  // gone from state.cities afterwards). No precedingCombat is available here —
  // it was consumed at beginMajorCityAssault time — but the capturing unit still
  // carries its own same-turn lastStandHold / seizeGrantedBy markers, which is
  // the attribution signal recordCityCaptureCareerEvents reads.
  const cityName = state.cities[pending.cityId]?.name ?? '';
  const result = resolveMajorCityCapture(state, pending.cityId, state.currentPlayer, disposition, turn, bus);
  return {
    ...result,
    state: recordCityCaptureCareerEvents(
      result.state,
      pending.cityId,
      cityName,
      state.currentPlayer,
      pending.attackerId,
    ),
  };
}
