import type { GameState } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';
import { getDominationActorFact } from './domination-sovereignty';
import type {
  DominationActorFact,
  DominationDisposition,
  DominationKnownActorFact,
  DominationKnowledge,
  DominationPoliticalReport,
} from './domination-types';
import { shouldListMajorCivForViewer } from './viewer-intel';

type ForeignEvidence = Omit<DominationKnownActorFact, 'civName'>;

function compareIds(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

function foreignName(state: GameState, civId: string, defeatNameById: ReadonlyMap<string, string>): string {
  return defeatNameById.get(civId) ?? state.civilizations[civId]?.name ?? 'Unknown empire';
}

function selectForeignEvidence(candidates: readonly ForeignEvidence[]): ForeignEvidence {
  if (candidates.length === 0) {
    return { civId: '', disposition: 'unknown', overlordId: null, observedTurn: null, evidence: 'unconfirmed' };
  }
  const newestTurn = Math.max(...candidates.map(candidate => candidate.observedTurn ?? -1));
  const newest = candidates.filter(candidate => candidate.observedTurn === newestTurn);
  const dispositions = new Set(newest.map(candidate => `${candidate.disposition}:${candidate.overlordId ?? ''}`));
  if (dispositions.size > 1) {
    return {
      ...newest[0],
      disposition: 'unknown',
      overlordId: null,
      evidence: 'unconfirmed',
    };
  }
  return newest.sort((a, b) => a.evidence.localeCompare(b.evidence))[0]!;
}

function reportEvidence(report: DominationPoliticalReport, civId: string): ForeignEvidence | null {
  if (report.contenderId === civId) {
    return {
      civId,
      disposition: report.contenderRole,
      overlordId: null,
      observedTurn: report.observedTurn,
      evidence: 'report',
    };
  }
  if (report.directVassalIds.includes(civId)) {
    return {
      civId,
      disposition: 'vassal',
      overlordId: report.contenderId,
      observedTurn: report.observedTurn,
      evidence: 'report',
    };
  }
  if (report.defeatedCivIds.includes(civId)) {
    return {
      civId,
      disposition: 'eliminated',
      overlordId: null,
      observedTurn: report.observedTurn,
      evidence: 'report',
    };
  }
  return null;
}

function ownFact(state: GameState, observerId: string): DominationActorFact {
  return getDominationActorFact(state, observerId)
    ?? { civId: observerId, disposition: 'eliminated', overlordId: null };
}

/**
 * Builds the information an observer has earned. Foreign political roles come
 * only from saved reports or terminal observations; the sole sovereignty query
 * is the observer's own legal position.
 */
export function buildDominationKnowledge(state: GameState, observerId: string): DominationKnowledge {
  const own = ownFact(state, observerId);
  const observerIntel = state.dominationIntel?.[observerId];
  const reports = Object.values(observerIntel?.reportsByContenderId ?? {})
    .filter(report => report.observedTurn <= state.turn)
    .sort((a, b) => a.contenderId.localeCompare(b.contenderId));
  const defeatFacts = Object.values(observerIntel?.defeatsByCivId ?? {})
    .filter(fact => fact.observedTurn <= state.turn);
  const defeatNameById = new Map(defeatFacts.map(fact => [fact.civId, fact.civName]));

  const knownIds = new Set<string>([observerId]);
  for (const civId of Object.keys(state.civilizations)) {
    if (isMajorCivOwner(civId) && shouldListMajorCivForViewer(state, observerId, civId)) knownIds.add(civId);
  }
  for (const fact of defeatFacts) knownIds.add(fact.civId);
  for (const report of reports) {
    knownIds.add(report.contenderId);
    report.directVassalIds.forEach(civId => knownIds.add(civId));
    report.defeatedCivIds.forEach(civId => knownIds.add(civId));
  }

  const ownDirectVassalIds = [...new Set(state.civilizations[observerId]?.diplomacy.vassalage.vassals ?? [])]
    .filter(civId => isMajorCivOwner(civId) && knownIds.has(civId))
    .sort(compareIds);
  const ownEarnedDefeatIds = [...new Set(defeatFacts.map(fact => fact.civId))].sort(compareIds);

  const knownActorFacts: DominationKnownActorFact[] = [...knownIds]
    .sort(compareIds)
    .map(civId => {
      if (civId === observerId) {
        return {
          civId,
          civName: state.civilizations[civId]?.name ?? 'Your empire',
          disposition: own.disposition,
          overlordId: own.overlordId,
          observedTurn: state.turn,
          evidence: 'own' as const,
        };
      }

      const candidates: ForeignEvidence[] = [];
      for (const fact of defeatFacts) {
        if (fact.civId === civId) {
          candidates.push({
            civId,
            disposition: 'eliminated',
            overlordId: null,
            observedTurn: fact.observedTurn,
            evidence: 'defeat',
          });
        }
      }
      for (const report of reports) {
        const evidence = reportEvidence(report, civId);
        if (evidence) candidates.push(evidence);
      }

      const selected = selectForeignEvidence(candidates);
      const age = selected.observedTurn === null ? null : state.turn - selected.observedTurn;
      const staleRole = selected.evidence === 'report'
        && selected.disposition !== 'eliminated'
        && age !== null
        && age > 5;
      return {
        ...selected,
        civId,
        civName: foreignName(state, civId, defeatNameById),
        disposition: staleRole ? 'unknown' : selected.disposition,
        overlordId: staleRole ? null : selected.overlordId,
      };
    });

  return {
    observerId,
    turn: state.turn,
    ownRole: own.disposition as DominationDisposition,
    ownOverlordId: own.overlordId,
    knownActorFacts,
    ownDirectVassalIds,
    ownEarnedDefeatIds,
    knownCivIds: knownActorFacts.map(fact => fact.civId),
    reports,
    unconfirmedKnownCivIds: knownActorFacts
      .filter(fact => fact.evidence === 'unconfirmed')
      .map(fact => fact.civId),
  };
}
