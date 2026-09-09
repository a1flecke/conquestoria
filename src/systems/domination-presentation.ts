import type { GameState } from '@/core/types';
import { buildDominationKnowledge } from './domination-knowledge';
import type { DominationKnownActorFact, DominationPanelModel, DominationPanelRow } from './domination-types';

const RULE_TEXT = 'To win, be the last independent empire.';

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
  const rows = knowledge.knownActorFacts
    .filter(fact => fact.civId !== viewerId)
    .map(rowForFact);
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
