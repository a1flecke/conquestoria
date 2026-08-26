import type { GameState } from '@/core/types';
import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';
import { getEligibleStrategicLaunchPlatforms, type StrategicLaunchPlatform } from '@/systems/strategic-launch-system';

export interface StrategicArsenalSummaryPresentation {
  arsenalCount: number;
  arsenalCapacity: number;
  platforms: StrategicLaunchPlatform[];
  /** Every civ that has struck this civ with a strategic strike (MR4
   * retaliation-tracking field, surfaced directly -- no MR5 AI-doctrine or
   * MR9 visibility gating exists yet to filter this further). */
  strikesReceivedFromCivIds: string[];
}

export function getStrategicArsenalSummaryPresentation(
  state: GameState,
  civId: string,
): StrategicArsenalSummaryPresentation {
  const civ = state.civilizations[civId];
  return {
    arsenalCount: civ ? getStrategicArsenal(civ) : 0,
    arsenalCapacity: getStrategicArsenalCapacity(state, civId),
    platforms: getEligibleStrategicLaunchPlatforms(state, civId),
    strikesReceivedFromCivIds: civ?.diplomacy.strategicStrikesReceivedFrom ?? [],
  };
}
