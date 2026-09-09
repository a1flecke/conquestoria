export type DominationDisposition = 'eliminated' | 'independent' | 'vassal' | 'provisional';

export interface DominationActorFact {
  civId: string;
  disposition: DominationDisposition;
  overlordId: string | null;
}

export interface DominationProgress {
  contenderId: string;
  eligible: boolean;
  ineligibleReason: 'not-living-major' | 'vassal' | 'provisional' | 'noncompetitive' | null;
  rivalCount: number;
  securedRivalCount: number;
  eliminatedRivalIds: string[];
  directVassalIds: string[];
  unresolvedRivalIds: string[];
  independentRivalIds: string[];
  provisionalCivIds: string[];
  conditionMet: boolean;
}

export interface DominationDefeatFact {
  civId: string;
  civName: string;
  observedTurn: number;
  defeatedById: string | null;
  source: 'participant' | 'witness';
}

export interface DominationPoliticalReport {
  contenderId: string;
  observedTurn: number;
  contenderRole: 'independent' | 'vassal' | 'provisional' | 'unknown';
  directVassalIds: string[];
  defeatedCivIds: string[];
}

export interface DominationObserverIntel {
  defeatsByCivId: Record<string, DominationDefeatFact>;
  reportsByContenderId: Record<string, DominationPoliticalReport>;
}

export type DominationIntelState = Record<string, DominationObserverIntel>;

export interface DominationKnownActorFact {
  civId: string;
  civName: string;
  disposition: DominationDisposition | 'unknown';
  overlordId: string | null;
  observedTurn: number | null;
  evidence: 'own' | 'defeat' | 'observation' | 'report' | 'unconfirmed';
}

export interface DominationKnowledge {
  observerId: string;
  turn: number;
  ownRole: DominationDisposition;
  ownOverlordId: string | null;
  knownActorFacts: DominationKnownActorFact[];
  ownDirectVassalIds: string[];
  ownEarnedDefeatIds: string[];
  knownCivIds: string[];
  reports: DominationPoliticalReport[];
  unconfirmedKnownCivIds: string[];
}

export interface DominationPanelRow {
  civId: string;
  civName: string;
  evidence: 'current' | 'reported' | 'unknown';
  reportTurn: number | null;
  text: string;
  warning: boolean;
}

export type DominationPanelGuidance =
  | { kind: 'text'; text: string }
  | { kind: 'diplomacy'; text: string }
  | { kind: 'owned-city'; text: string; cityId: string }
  | { kind: 'espionage'; text: string };

export interface DominationPanelModel {
  viewerId: string;
  ruleText: string;
  ownStatusText: string;
  ownVassalCount: number;
  ownEarnedDefeatCount: number;
  rows: DominationPanelRow[];
  uncertaintyText: string;
  guidance: DominationPanelGuidance;
}
