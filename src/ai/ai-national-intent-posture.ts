// src/ai/ai-national-intent-posture.ts
// #1248: the per-intent bias table the AI's research, production, diplomacy, war and expansion scoring all read.
// Pure data keyed by NationalIntent — it imports only that type. It lives apart from ai-national-intent.ts (which
// *resolves* an intent from perception and imports the expansion soft cap) so ai-strategy, ai-research,
// ai-production and the rest can read a posture without importing the resolver, which closed an
// ai-strategy -> ai-national-intent -> ai-expansion-sites -> ai-strategy import cycle. Values are unchanged.
import type { NationalIntent } from '@/core/types/ai';

export interface NationalIntentPosture {
  expandBias: number;
  captureBias: number;
  resourceBias: number;
  settlementRoleWeight: number;
  economyRoleWeight: number;
  combatRoleWeight: number;
  /** #1087: multiplies weightTechChoice's military-track score component only. */
  researchMilitaryTrackWeight: number;
  /** #1087: subtracted from shouldDeclareWar's threshold comparison -- positive lowers the bar. */
  warDeclarationBias: number;
  /** #1087: added to evaluateDiplomacy/evaluateMinorCivDiplomacy/evaluateEmbargoResponse/
   *  evaluateLeagueResponse's openness thresholds -- positive makes the civ more diplomatically open. */
  diplomaticOpennessBias: number;
  /** #1087: added to evaluateVassalage's strength-ratio threshold -- positive makes the civ
   *  willing to submit to a relatively stronger neighbor than it otherwise would. */
  vassalageSeekingBias: number;
}

export const NATIONAL_INTENT_POSTURE: Record<NationalIntent, NationalIntentPosture> = {
  expand: { expandBias: 20, captureBias: 0, resourceBias: 8, settlementRoleWeight: 1.4, economyRoleWeight: 1.1, combatRoleWeight: 0.9, researchMilitaryTrackWeight: 1.0, warDeclarationBias: 0, diplomaticOpennessBias: 0, vassalageSeekingBias: 0 },
  develop: { expandBias: 0, captureBias: 0, resourceBias: 5, settlementRoleWeight: 1.0, economyRoleWeight: 1.3, combatRoleWeight: 0.85, researchMilitaryTrackWeight: 0.85, warDeclarationBias: -0.1, diplomaticOpennessBias: 0.1, vassalageSeekingBias: 0 },
  dominate: { expandBias: 0, captureBias: 18, resourceBias: 0, settlementRoleWeight: 0.9, economyRoleWeight: 0.9, combatRoleWeight: 1.3, researchMilitaryTrackWeight: 1.3, warDeclarationBias: 0.2, diplomaticOpennessBias: -0.15, vassalageSeekingBias: -0.15 },
  deter: { expandBias: -5, captureBias: -8, resourceBias: 0, settlementRoleWeight: 0.8, economyRoleWeight: 1.0, combatRoleWeight: 1.25, researchMilitaryTrackWeight: 1.15, warDeclarationBias: 0, diplomaticOpennessBias: -0.05, vassalageSeekingBias: 0.1 },
  recover: { expandBias: -20, captureBias: -20, resourceBias: -10, settlementRoleWeight: 0.5, economyRoleWeight: 1.1, combatRoleWeight: 1.1, researchMilitaryTrackWeight: 0.9, warDeclarationBias: -0.3, diplomaticOpennessBias: 0.15, vassalageSeekingBias: 0.25 },
};
