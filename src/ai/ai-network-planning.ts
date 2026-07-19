import type { NetworkPlanDefinitionId } from '@/core/autonomy-state';
import type { GameState } from '@/core/types';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { createRng } from '@/systems/map-generator';
import { hexDistance } from '@/systems/hex-utils';
import { isMilitaryUnitType } from '@/systems/unit-modifier-definitions';
import {
  assignNetworkPlan,
  type NetworkPlanRequest,
  previewNetworkPlan,
} from '@/systems/network-plan-system';

export interface NetworkPlanCandidate {
  request: NetworkPlanRequest;
  score: number;
}

const CONSTRUCTIVE: readonly NetworkPlanDefinitionId[] = [
  'fabrication-sprint', 'research-mesh', 'logistics-routing', 'survey-grid',
];
const FORMATION: readonly NetworkPlanDefinitionId[] = ['guardian-screen', 'swarm-strike'];

/** Generates only owner-visible, validator-approved city plans. No difficulty profile changes this list. */
export function getNetworkPlanCandidates(state: GameState, civId: string): readonly NetworkPlanCandidate[] {
  const civ = state.civilizations[civId];
  if (!civ || civ.isEliminated) return [];
  const candidates: NetworkPlanCandidate[] = [];
  const ownedCities = Object.values(state.cities).filter(candidate => candidate.owner === civId).sort((a, b) => a.id.localeCompare(b.id));
  for (const city of ownedCities) {
    for (const definitionId of CONSTRUCTIVE) {
      const request: NetworkPlanRequest = {
        ownerCivId: civId, source: { kind: 'city', cityId: city.id }, definitionId,
        target: { kind: 'city', cityId: city.id },
        ...(definitionId === 'research-mesh' ? { linkedCityIds: ownedCities.filter(candidate => candidate.id !== city.id).slice(0, 1).map(candidate => candidate.id) } : {}),
        ...(definitionId === 'survey-grid' ? { linkedUnitIds: civ.units.slice(0, 2) } : {}),
      };
      if (!previewNetworkPlan(state, request).validation.ok) continue;
      const score = definitionId === 'research-mesh' ? 60
        : definitionId === 'fabrication-sprint' ? 55
          : definitionId === 'logistics-routing' ? 45 : 35;
      candidates.push({ request, score });
    }
  }
  const controllers = civ.units
    .map(unitId => state.units[unitId])
    .filter((unit): unit is NonNullable<typeof unit> => unit?.type === 'drone_controller')
    .sort((left, right) => left.id.localeCompare(right.id));
  for (const controller of controllers) {
    const recipients = civ.units
      .map(unitId => state.units[unitId])
      .filter((unit): unit is NonNullable<typeof unit> => Boolean(unit)
        && unit.id !== controller.id
        && isMilitaryUnitType(unit.type)
        && hexDistance(controller.position, unit.position) <= 2)
      .sort((left, right) => left.id.localeCompare(right.id))
      .slice(0, 3)
      .map(unit => unit.id);
    if (recipients.length === 0) continue;
    for (const definitionId of FORMATION) {
      const request: NetworkPlanRequest = {
        ownerCivId: civId,
        sourceUnitId: controller.id,
        definitionId,
        target: { kind: 'formation', unitIds: recipients },
      };
      if (!previewNetworkPlan(state, request).validation.ok) continue;
      candidates.push({ request, score: definitionId === 'guardian-screen' ? 70 : 65 });
    }
  }
  return candidates.sort((a, b) => b.score - a.score
    || a.request.definitionId.localeCompare(b.request.definitionId)
    || (a.request.source?.kind === 'city' ? a.request.source.cityId : '').localeCompare(b.request.source?.kind === 'city' ? b.request.source.cityId : ''));
}

/** One deterministic constructive assignment per AI turn. Effects and legal targets are identical to humans. */
export function planNetworkTurn(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman || civ.isEliminated) return state;
  const candidates = getNetworkPlanCandidates(state, civId);
  if (candidates.length === 0) return state;
  const profile = getChallengeProfileForCiv(state, civId);
  const rng = createRng(`${state.gameId ?? 'legacy'}:${state.turn}:${civId}:network-constructive`);
  const index = rng() < profile.seededSuboptimalChance
    ? Math.min(Math.max(0, profile.tacticalTopK - 1), candidates.length - 1)
    : 0;
  return assignNetworkPlan(state, candidates[index]!.request).state;
}
