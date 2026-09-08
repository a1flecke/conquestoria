import type { DominationActorFact, DominationProgress } from './domination-types';

export type { DominationActorFact, DominationDisposition, DominationProgress } from './domination-types';

export function evaluateDominationFacts(
  facts: readonly DominationActorFact[],
  contenderId: string,
  competitive: boolean,
): DominationProgress {
  const byId = new Map<string, DominationActorFact>();
  for (const fact of facts) {
    if (!byId.has(fact.civId)) byId.set(fact.civId, fact);
  }
  const actors = [...byId.values()].sort((a, b) => compareIds(a.civId, b.civId));
  const contender = byId.get(contenderId);
  const provisionalCivIds = actors
    .filter(fact => fact.disposition === 'provisional')
    .map(fact => fact.civId);
  const rivals = actors.filter(fact =>
    fact.civId !== contenderId && fact.disposition !== 'provisional');
  const eliminatedRivalIds = rivals
    .filter(fact => fact.disposition === 'eliminated')
    .map(fact => fact.civId);
  const directVassalIds = rivals
    .filter(fact => fact.disposition === 'vassal' && fact.overlordId === contenderId)
    .map(fact => fact.civId);
  const unresolvedRivalIds = rivals
    .filter(fact => classifyDominationRival(fact, contenderId) === 'unresolved')
    .map(fact => fact.civId);
  const independentRivalIds = rivals
    .filter(fact => fact.disposition === 'independent')
    .map(fact => fact.civId);
  const ineligibleReason = !contender || contender.disposition === 'eliminated'
    ? 'not-living-major'
    : contender.disposition === 'vassal'
      ? 'vassal'
      : contender.disposition === 'provisional'
        ? 'provisional'
        : !competitive
          ? 'noncompetitive'
          : null;
  const eligible = ineligibleReason === null;

  return {
    contenderId,
    eligible,
    ineligibleReason,
    rivalCount: rivals.length,
    securedRivalCount: eliminatedRivalIds.length + directVassalIds.length,
    eliminatedRivalIds,
    directVassalIds,
    unresolvedRivalIds,
    independentRivalIds,
    provisionalCivIds,
    conditionMet: eligible && unresolvedRivalIds.length === 0,
  };
}

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export function classifyDominationRival(
  fact: DominationActorFact,
  contenderId: string,
): 'exempt' | 'secured' | 'unresolved' {
  if (fact.disposition === 'provisional') return 'exempt';
  if (fact.disposition === 'eliminated') return 'secured';
  if (fact.disposition === 'vassal' && fact.overlordId === contenderId) return 'secured';
  return 'unresolved';
}
