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

export interface DominationCounterplay {
  threatId: string;
  forceDemand: {
    role: 'frontline';
    sourceId: string;
    priority: number;
  };
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

/**
 * Picks one observed threat deterministically. The result is a demand seed;
 * production and diplomacy remain owned by their existing planners.
 */
export function getDominationCounterplay(
  knowledge: DominationKnowledge,
): DominationCounterplay | null {
  const reportsByContenderId = new Map(knowledge.reports.map(report => [report.contenderId, report]));
  const threat = getDominationThreats(knowledge)
    .sort((left, right) =>
      left.unresolvedRivalIds.length - right.unresolvedRivalIds.length
      || right.securedRivalIds.length - left.securedRivalIds.length
      || (reportsByContenderId.get(right.contenderId)?.observedTurn ?? -1)
        - (reportsByContenderId.get(left.contenderId)?.observedTurn ?? -1)
      || left.contenderId.localeCompare(right.contenderId))[0];
  if (!threat) return null;
  return {
    threatId: threat.contenderId,
    forceDemand: {
      role: 'frontline',
      sourceId: `domination-threat:${threat.contenderId}`,
      priority: 220,
    },
  };
}
