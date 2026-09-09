import type { GameState } from '@/core/types';
import { buildDominationKnowledge } from './domination-knowledge';
import type {
  DominationKnowledge,
  DominationKnownActorFact,
  DominationPanelModel,
  DominationPanelRow,
  DominationPoliticalReport,
} from './domination-types';

const RULE_TEXT = 'To win, be the last independent empire.';
const RECENT_REPORT_MAX_AGE = 5;

export interface DominationThreat {
  contenderId: string;
  securedRivalIds: string[];
  unresolvedRivalIds: string[];
}

export interface DominationOutcomePresentation {
  sharedResult: boolean;
  winnerName: string;
  outcome: 'victory' | 'defeat';
  summary: string;
  standings: string[];
}

function isRecentIndependentReport(report: DominationPoliticalReport, turn: number): boolean {
  const age = turn - report.observedTurn;
  return report.contenderRole === 'independent'
    && Number.isFinite(report.observedTurn)
    && age >= 0
    && age <= RECENT_REPORT_MAX_AGE;
}

function isReportCurrentForFact(
  report: DominationPoliticalReport,
  fact: DominationKnownActorFact | undefined,
): boolean {
  return Boolean(fact && (
    fact.evidence === 'defeat'
    || fact.evidence === 'own'
    || fact.evidence === 'report' && fact.observedTurn === report.observedTurn
  ));
}

function classifyKnownRival(
  knowledge: DominationKnowledge,
  report: DominationPoliticalReport,
  rivalId: string,
  factsById: ReadonlyMap<string, DominationKnownActorFact>,
): 'exempt' | 'secured' | 'unresolved' {
  const fact = factsById.get(rivalId);
  if (fact?.disposition === 'provisional' && fact.evidence !== 'unconfirmed') return 'exempt';
  if (!isReportCurrentForFact(report, fact)) return 'unresolved';
  if (fact?.disposition === 'eliminated') return 'secured';
  if (rivalId === knowledge.observerId) {
    return knowledge.ownRole === 'vassal' && knowledge.ownOverlordId === report.contenderId
      ? 'secured'
      : 'unresolved';
  }
  return fact?.disposition === 'vassal'
    && fact.overlordId === report.contenderId
    && report.directVassalIds.includes(rivalId)
    ? 'secured'
    : 'unresolved';
}

/**
 * Infers an observer's near-victory concerns from earned political evidence only.
 * This projection deliberately has no GameState input so callers cannot smuggle
 * current foreign sovereignty into warning or AI presentation.
 */
export function getDominationThreats(knowledge: DominationKnowledge): DominationThreat[] {
  const factsById = new Map(knowledge.knownActorFacts.map(fact => [fact.civId, fact]));
  const knownIds = [...new Set(knowledge.knownCivIds)].sort();
  return knowledge.reports
    .filter(report => isRecentIndependentReport(report, knowledge.turn))
    .filter(report => factsById.get(report.contenderId)?.disposition === 'independent')
    .sort((left, right) => left.contenderId.localeCompare(right.contenderId))
    .flatMap(report => {
      const classifications = knownIds
        .filter(civId => civId !== report.contenderId)
        .map(civId => ({ civId, kind: classifyKnownRival(knowledge, report, civId, factsById) }));
      const securedRivalIds = classifications
        .filter(entry => entry.kind === 'secured')
        .map(entry => entry.civId);
      const unresolvedRivalIds = classifications
        .filter(entry => entry.kind === 'unresolved')
        .map(entry => entry.civId);
      const rivalCount = securedRivalIds.length + unresolvedRivalIds.length;
      const threatens = securedRivalIds.length >= 2
        && unresolvedRivalIds.length <= 1
        && rivalCount > 0
        && 3 * securedRivalIds.length >= 2 * rivalCount;
      return threatens ? [{ contenderId: report.contenderId, securedRivalIds, unresolvedRivalIds }] : [];
    });
}

function soloOutcomeSummary(knowledge: DominationKnowledge, won: boolean): string {
  if (won) return 'Your empire is the last independent empire.';
  if (knowledge.ownRole === 'vassal') return 'Your empire is protected as a vassal.';
  if (knowledge.ownRole === 'eliminated') return 'Your civilization was defeated.';
  if (knowledge.ownRole === 'provisional') return 'Your empire was still establishing independence.';
  return 'Your empire remains independent, but a rival fulfilled the Domination rule.';
}

/**
 * Converts the durable outcome into display-safe text. The raw winner event is
 * deliberately not used here: each solo viewer receives only their earned
 * knowledge, while a hot-seat result uses configured public player names.
 */
export function projectDominationOutcome(
  state: GameState,
  viewerId: string | null,
): DominationOutcomePresentation {
  if (state.gameOverReason === 'all-humans-eliminated') {
    return {
      sharedResult: false,
      winnerName: '',
      outcome: 'defeat',
      summary: 'No human civilizations remain.',
      standings: [],
    };
  }
  const winnerId = state.winner;
  if (state.hotSeat) {
    const humans = state.hotSeat.players.filter(player => player.isHuman);
    const winner = humans.find(player => player.slotId === winnerId);
    return {
      sharedResult: true,
      winnerName: winner ? `${winner.name} won by Domination.` : 'A rival empire won by Domination.',
      outcome: winner ? 'victory' : 'defeat',
      summary: 'Domination means becoming the last independent empire.',
      standings: humans.map(player => `${player.name}: ${player.slotId === winnerId ? 'Winner' : 'Not winner'}`),
    };
  }

  const observerId = viewerId ?? state.currentPlayer;
  const won = winnerId === observerId;
  const knowledge = buildDominationKnowledge(state, observerId);
  const winnerFact = knowledge.knownActorFacts.find(fact => fact.civId === winnerId);
  const winnerName = won
    ? state.civilizations[observerId]?.name ?? 'Your empire'
    : winnerFact && winnerFact.evidence !== 'unconfirmed'
      ? winnerFact.civName
      : 'A rival empire';
  return {
    sharedResult: false,
    winnerName,
    outcome: won ? 'victory' : 'defeat',
    summary: soloOutcomeSummary(knowledge, won),
    standings: [],
  };
}

function rowForFact(fact: DominationKnownActorFact): DominationPanelRow {
  if (fact.evidence === 'defeat') {
    return {
      civId: fact.civId,
      civName: fact.civName,
      evidence: 'current',
      reportTurn: fact.observedTurn,
      text: `${fact.civName}'s defeat was confirmed on turn ${fact.observedTurn}.`,
      warning: false,
    };
  }
  if (fact.evidence === 'report') {
    return {
      civId: fact.civId,
      civName: fact.civName,
      evidence: 'reported',
      reportTurn: fact.observedTurn,
      text: `${fact.civName} was reported ${fact.disposition} on turn ${fact.observedTurn}.`,
      warning: false,
    };
  }
  return {
    civId: fact.civId,
    civName: fact.civName,
    evidence: 'unknown',
    reportTurn: null,
    text: `${fact.civName}'s current position is unknown.`,
    warning: false,
  };
}

function ownStatusText(role: string): string {
  if (role === 'vassal') return 'Your empire is protected as a vassal.';
  if (role === 'provisional') return 'Your empire is still establishing independence.';
  if (role === 'eliminated') return 'Your empire has no remaining survival assets.';
  return 'Your empire is independent.';
}

/** Formats earned knowledge for the UI without asking the authoritative victory adapter. */
export function projectDominationProgressForViewer(state: GameState, viewerId: string): DominationPanelModel {
  const knowledge = buildDominationKnowledge(state, viewerId);
  const threateningContenderIds = new Set(getDominationThreats(knowledge).map(threat => threat.contenderId));
  const rows = knowledge.knownActorFacts
    .filter(fact => fact.civId !== viewerId)
    .map(fact => ({ ...rowForFact(fact), warning: threateningContenderIds.has(fact.civId) }));
  const viewer = state.civilizations[viewerId];
  const ownedCityId = viewer?.cities.find(cityId => state.cities[cityId]?.owner === viewerId);

  return {
    viewerId,
    ruleText: RULE_TEXT,
    ownStatusText: ownStatusText(knowledge.ownRole),
    ownVassalCount: knowledge.ownDirectVassalIds.length,
    ownEarnedDefeatCount: knowledge.ownEarnedDefeatIds.length,
    rows,
    uncertaintyText: 'Other empires or changes may be unknown. These reports do not prove a worldwide total.',
    guidance: rows.length === 0
      ? { kind: 'text', text: 'Explore to meet other empires and learn about their progress.' }
      : ownedCityId
        ? { kind: 'owned-city', text: 'Review one of your cities and keep your empire secure.', cityId: ownedCityId }
        : { kind: 'espionage', text: 'Scout and gather intelligence to update your reports.' },
  };
}
