import type { GameState } from '@/core/types';
import { getChallengeProfileForCiv } from '@/core/opponent-challenge';
import { getPirateFleetLeader } from '@/systems/pirate-behavior';

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
  const profile = getChallengeProfileForCiv(state, civId);
  const candidates: CrisisDispatchCandidate[] = [];
  for (const factionId of Object.keys(state.pirates?.factions ?? {}).sort()) {
    const faction = state.pirates!.factions[factionId];
    if (faction.intent?.targetCivId !== civId) continue;
    const leader = getPirateFleetLeader(state, factionId);
    if (!leader) continue;
    candidates.push({
      kind: 'pirate-fleet',
      sourceId: factionId,
      targetUnitId: leader.id,
      score: PIRATE_FLEET_DISPATCH_BASE_SCORE * profile.crisisDispatchWeight,
    });
  }
  return candidates;
}
