import type { AIPlanReason, OpponentChallenge, PersonalityTraits } from '@/core/types';
import { getDominationThreats } from '@/systems/domination-presentation';
import type { DominationKnowledge } from '@/systems/domination-types';

export interface DominationDoctrine {
  pursuit: boolean;
  threatId: string | null;
  captureValueBonus: number;
  reasonCodes: AIPlanReason[];
}

export interface DominationDoctrineInput {
  knowledge: DominationKnowledge;
  ownCityCount: number;
  personality: PersonalityTraits;
  challenge: OpponentChallenge;
}

const PURSUIT_BONUS: Record<OpponentChallenge, number> = {
  explorer: 8,
  standard: 14,
  veteran: 20,
};

/**
 * Computes an AI-only preference from the same earned knowledge contract used
 * for player warnings. It deliberately returns transient planning input: it
 * neither selects a target nor stores a strategic state in the save file.
 */
export function evaluateDominationDoctrine(
  input: DominationDoctrineInput,
): DominationDoctrine {
  const pursuit = input.knowledge.ownRole === 'independent'
    && input.ownCityCount > 0
    && input.personality.traits.includes('aggressive');
  return {
    pursuit,
    threatId: getDominationThreats(input.knowledge)[0]?.contenderId ?? null,
    captureValueBonus: pursuit ? PURSUIT_BONUS[input.challenge] : 0,
    reasonCodes: pursuit ? ['domination-pursuit'] : [],
  };
}

/** A foreign target is usable only when this observer earned a current independent fact. */
export function isKnownIndependentDominationTarget(
  knowledge: DominationKnowledge,
  civId: string,
): boolean {
  const fact = knowledge.knownActorFacts.find(candidate => candidate.civId === civId);
  return fact?.disposition === 'independent'
    && fact.evidence !== 'unconfirmed'
    && fact.observedTurn !== null
    && knowledge.turn - fact.observedTurn <= 5;
}
