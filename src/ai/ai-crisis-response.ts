import type { ActiveCrisis, City, GameState } from '@/core/types';
import { getChallengeProfileForCiv, resolveChallengeForCiv } from '@/core/opponent-challenge';
import { getPirateFleetLeader } from '@/systems/pirate-behavior';
import { isVisible } from '@/systems/fog-of-war';
import { applyQuarantine, applyRemedy } from '@/systems/crisis-system';
import { getCityAppeaseCost } from '@/systems/faction-system';

export interface CrisisDispatchCandidate {
  kind: 'pirate-fleet' | 'hunt-foe';
  sourceId: string;        // fleetId or crisisId — used for expiry checks
  targetUnitId: string;    // the pirate ship / hunt foe unit
  score: number;           // base score × profile.crisisDispatchWeight
}

// 100 matches the ceiling of AICityThreat.captureRisk (ai-plan-portfolio.ts), the
// existing defend-city candidate magnitude this competes against for primaryPlan.
const PIRATE_FLEET_DISPATCH_BASE_SCORE = 100;

export function getCrisisDispatchCandidates(state: GameState, civId: string): CrisisDispatchCandidate[] {
  const civ = state.civilizations[civId];
  const profile = getChallengeProfileForCiv(state, civId);
  const candidates: CrisisDispatchCandidate[] = [];
  for (const factionId of Object.keys(state.pirates?.factions ?? {}).sort()) {
    const faction = state.pirates!.factions[factionId];
    if (faction.intent?.targetCivId !== civId) continue;
    const leader = getPirateFleetLeader(state, factionId);
    if (!leader) continue;
    // Fog-of-war legitimacy: a dispatch candidate is an "exact target" plan
    // (ai-playability-fixture.ts's targetWasPerceived invariant) -- the civ
    // must actually currently see the fleet leader's tile, not just know its
    // faction is targeting them.
    if (!civ?.visibility || !isVisible(civ.visibility, leader.position)) continue;
    candidates.push({
      kind: 'pirate-fleet',
      sourceId: factionId,
      targetUnitId: leader.id,
      score: PIRATE_FLEET_DISPATCH_BASE_SCORE * profile.crisisDispatchWeight,
    });
  }
  return candidates;
}

// ── Crisis response policy (#529 MR3 Task 3.2) ──────────────────────────────
// AI civs quarantine and fund remedies for their own outbreak crises through
// the same applyQuarantine/applyRemedy helpers the human UI calls — humans
// are never processed here; their crisis choices stay theirs.

export type CrisisResponseAction =
  | { kind: 'quarantine'; crisisId: string; cityId: string }
  | { kind: 'fund-remedy'; crisisId: string; cityId: string };

export function getCrisisResponseActions(state: GameState, civId: string): CrisisResponseAction[] {
  const civ = state.civilizations[civId];
  if (!civ || civ.isHuman) return [];
  const profile = getChallengeProfileForCiv(state, civId);
  // Tougher-difficulty AI escalates to quarantine on a smaller outbreak (2 infected
  // cities) rather than waiting for 3 — same competence axis as crisisResponseDelayTurns.
  const spreadThreshold = 2 + (resolveChallengeForCiv(state, civId) === 'veteran' ? 0 : 1);

  const crises = Object.values(state.activeCrises ?? {})
    .filter((c): c is ActiveCrisis => c.targetCivId === civId && c.archetype === 'outbreak')
    .sort((a, b) => a.id.localeCompare(b.id));

  const actions: CrisisResponseAction[] = [];

  for (const crisis of crises) {
    const age = state.turn - crisis.startedTurn;
    if (age < profile.crisisResponseDelayTurns && crisis.cityIds.length < spreadThreshold) continue;
    const candidate = crisis.cityIds
      .filter(id => !crisis.quarantinedCityIds?.includes(id))
      .map(id => state.cities[id])
      .filter((c): c is City => !!c)
      .sort((a, b) => a.population - b.population || a.id.localeCompare(b.id))[0];
    if (candidate) actions.push({ kind: 'quarantine', crisisId: crisis.id, cityId: candidate.id });
  }

  // One remedy per civ per turn: the most-populous infected city across ALL of
  // this civ's outbreak crises that doesn't already have a remedy underway.
  let bestRemedy: { crisisId: string; city: City } | null = null;
  for (const crisis of crises) {
    for (const cityId of crisis.cityIds) {
      if (crisis.remedyCompletionByCity?.[cityId] !== undefined) continue;
      const city = state.cities[cityId];
      if (!city) continue;
      if (!bestRemedy || city.population > bestRemedy.city.population ||
          (city.population === bestRemedy.city.population && city.id < bestRemedy.city.id)) {
        bestRemedy = { crisisId: crisis.id, city };
      }
    }
  }
  if (bestRemedy) {
    const cost = getCityAppeaseCost(bestRemedy.city);
    if (civ.gold >= cost * profile.crisisRemedyGoldMultiplier) {
      actions.push({ kind: 'fund-remedy', crisisId: bestRemedy.crisisId, cityId: bestRemedy.city.id });
    }
  }

  return actions;
}

export function applyCrisisResponses(state: GameState): GameState {
  let next = state;
  for (const civId of Object.keys(next.civilizations).sort()) {
    for (const action of getCrisisResponseActions(next, civId)) {
      next = action.kind === 'quarantine'
        ? applyQuarantine(next, action.crisisId, action.cityId).state
        : applyRemedy(next, action.crisisId, action.cityId).state;
    }
  }
  return next;
}
