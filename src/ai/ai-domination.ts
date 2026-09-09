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

export interface DominationCounterplayDiplomacyCandidate {
  civId: string;
  canRequestPeace: boolean;
  canOfferAlliance: boolean;
}

export interface DominationCounterplayDiplomacyAction {
  targetCivId: string;
  kind: 'peace' | 'alliance';
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
 * Picks one credible political lead deterministically. Warning presentation
 * waits for its stricter near-victory threshold; the AI responds earlier once
 * a current report confirms two secured rivals, leaving time for legal peace,
 * alliance, and frontline preparation. Every fact remains observer-earned.
 */
export function getDominationCounterplay(
  knowledge: DominationKnowledge,
): DominationCounterplay | null {
  if (knowledge.ownRole !== 'independent') return null;
  const factsById = new Map(knowledge.knownActorFacts.map(fact => [fact.civId, fact]));
  const contender = knowledge.reports.flatMap(report => {
    if (!isKnownIndependentDominationTarget(knowledge, report.contenderId)) return [];
    const securedRivalCount = [...report.directVassalIds, ...report.defeatedCivIds]
      .filter((civId, index, entries) => entries.indexOf(civId) === index)
      .filter(civId => {
        const fact = factsById.get(civId);
        const currentReportFact = fact?.evidence === 'report'
          && fact.observedTurn === report.observedTurn;
        return currentReportFact
          && (fact.disposition === 'eliminated'
            || fact.disposition === 'vassal' && fact.overlordId === report.contenderId);
      }).length;
    return securedRivalCount >= 2
      ? [{ contenderId: report.contenderId, securedRivalCount, observedTurn: report.observedTurn }]
      : [];
  }).sort((left, right) =>
    right.securedRivalCount - left.securedRivalCount
    || right.observedTurn - left.observedTurn
    || left.contenderId.localeCompare(right.contenderId))[0];
  if (!contender) return null;
  return {
    threatId: contender.contenderId,
    forceDemand: {
      role: 'frontline',
      sourceId: `domination-threat:${contender.contenderId}`,
      priority: 220,
    },
  };
}

/**
 * Selects one defensive diplomatic action from candidates whose contact and
 * legality were checked by the diplomacy owner. The doctrine never makes a
 * treaty request against the reported contender itself and never upgrades
 * unconfirmed political knowledge into a diplomatic target.
 */
export function chooseDominationCounterplayDiplomacyAction(
  knowledge: DominationKnowledge,
  candidates: readonly DominationCounterplayDiplomacyCandidate[],
): DominationCounterplayDiplomacyAction | null {
  const counterplay = getDominationCounterplay(knowledge);
  if (!counterplay) return null;

  const eligible = candidates
    .filter(candidate =>
      candidate.civId !== counterplay.threatId
      && isKnownIndependentDominationTarget(knowledge, candidate.civId))
    .sort((left, right) => left.civId.localeCompare(right.civId));
  const peaceTarget = eligible.find(candidate => candidate.canRequestPeace);
  if (peaceTarget) return { targetCivId: peaceTarget.civId, kind: 'peace' };
  const allianceTarget = eligible.find(candidate => candidate.canOfferAlliance);
  return allianceTarget
    ? { targetCivId: allianceTarget.civId, kind: 'alliance' }
    : null;
}
