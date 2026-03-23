import type { PersonalityTraits, DiplomacyState, TreatyType, DiplomaticAction } from '@/core/types';
import {
  getRelationship,
  isAtWar,
  getAvailableActions,
} from '@/systems/diplomacy-system';
import { shouldDeclareWar } from './ai-personality';

export interface DiplomaticDecision {
  action: DiplomaticAction;
  targetCiv: string;
}

export function evaluateDiplomacy(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  completedTechs: string[],
  era: number,
  militaryStrengths: Record<string, number>,
  selfStrength: number,
): DiplomaticDecision[] {
  const decisions: DiplomaticDecision[] = [];

  for (const civId of Object.keys(diplomacy.relationships)) {
    const actions = getAvailableActions(diplomacy, civId, completedTechs, era);
    const relationship = getRelationship(diplomacy, civId);
    const theirStrength = militaryStrengths[civId] ?? 0;
    const advantage = selfStrength > 0 && theirStrength > 0
      ? selfStrength / theirStrength
      : 1;

    if (isAtWar(diplomacy, civId)) {
      if (advantage < 0.7 || relationship > -20) {
        decisions.push({ action: 'request_peace', targetCiv: civId });
      }
    } else {
      if (actions.includes('declare_war') && shouldDeclareWar(personality, relationship, advantage)) {
        decisions.push({ action: 'declare_war', targetCiv: civId });
        continue;
      }

      if (actions.includes('alliance') && relationship > 50) {
        decisions.push({ action: 'alliance', targetCiv: civId });
      } else if (actions.includes('trade_agreement') && relationship > 10) {
        decisions.push({ action: 'trade_agreement', targetCiv: civId });
      } else if (actions.includes('non_aggression_pact') && relationship > 0 && personality.diplomacyFocus > 0.4) {
        decisions.push({ action: 'non_aggression_pact', targetCiv: civId });
      }
    }
  }

  return decisions;
}

export function evaluateProposal(
  personality: PersonalityTraits,
  diplomacy: DiplomacyState,
  fromCiv: string,
  proposedTreaty: TreatyType,
): boolean {
  const relationship = getRelationship(diplomacy, fromCiv);

  switch (proposedTreaty) {
    case 'non_aggression_pact':
      return relationship > -20 && personality.diplomacyFocus > 0.3;
    case 'trade_agreement':
      return relationship > 0;
    case 'open_borders':
      return relationship > 20 && personality.diplomacyFocus > 0.4;
    case 'alliance':
      return relationship > 40 && personality.diplomacyFocus > 0.5;
    default:
      return false;
  }
}
