import type { NetworkPlanDefinitionId } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { createRng } from '@/systems/map-generator';
import {
  assignNetworkPlan,
  cancelInvalidNetworkPlans,
  validateNetworkPlanAssignment,
} from '@/systems/network-plan-system';
import { planNetworkTurn } from './ai-network-planning';

export interface AINetworkIntentOptions {
  /** City IDs in the actor's freshly earned perception; hostile targets never bypass this boundary. */
  knownCityIds: ReadonlySet<string>;
}

interface Candidate {
  definitionId: NetworkPlanDefinitionId;
  cityId: string;
  score: number;
}

/**
 * Assigns only validator-approved plans.  This is deliberately a small tactical layer:
 * challenge settings choose among legal candidates, never change effects or reveal targets.
 */
export function assignNetworkIntentsForAI(
  state: GameState,
  civId: string,
  options: AINetworkIntentOptions,
): GameState {
  let nextState = cancelInvalidNetworkPlans(state).state;
  const civ = nextState.civilizations[civId];
  if (!civ || civ.isHuman || civ.isEliminated) return nextState;
  const profile = getChallengeProfileForCiv(nextState, civId);
  const sourceIds = civ.units
    .filter(unitId => nextState.units[unitId]?.type === 'cyber_unit')
    .sort();

  for (const sourceUnitId of sourceIds) {
    const alreadyAssigned = Object.values(nextState.autonomyByCiv?.[civId]?.plans ?? {})
      .some(plan => plan.sourceUnitId === sourceUnitId);
    if (alreadyAssigned) continue;

    const candidates: Candidate[] = [];
    for (const city of Object.values(nextState.cities)) {
      const harden = {
        ownerCivId: civId,
        sourceUnitId,
        definitionId: 'harden' as const,
        target: { kind: 'city' as const, cityId: city.id },
      };
      if (validateNetworkPlanAssignment(nextState, harden).ok) {
        candidates.push({
          definitionId: 'harden',
          cityId: city.id,
          score: 20 + (city.buildings.includes('cyber_defense_center') ? 0 : 5),
        });
      }

      if (!options.knownCityIds.has(city.id)) continue;
      const exploit = { ...harden, definitionId: 'exploit' as const };
      if (validateNetworkPlanAssignment(nextState, exploit).ok) {
        candidates.push({ definitionId: 'exploit', cityId: city.id, score: 100 + city.population });
      }
    }
    candidates.sort((left, right) => right.score - left.score
      || left.definitionId.localeCompare(right.definitionId)
      || left.cityId.localeCompare(right.cityId));
    if (candidates.length === 0) continue;

    const rng = createRng(`${nextState.gameId ?? 'legacy'}:${nextState.turn}:${civId}:${sourceUnitId}:network`);
    const chosen = rng() < profile.seededSuboptimalChance && candidates.length > 1
      ? candidates[Math.min(profile.tacticalTopK, candidates.length) - 1]!
      : candidates[0]!;
    const assigned = assignNetworkPlan(nextState, {
      ownerCivId: civId,
      sourceUnitId,
      definitionId: chosen.definitionId,
      target: { kind: 'city', cityId: chosen.cityId },
    });
    nextState = assigned.state;
  }
  return planNetworkTurn(nextState, civId);
}
