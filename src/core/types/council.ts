// Council and strategic-assessment-digest contracts (#1361). CouncilState / council memory / AssessmentDigest are persisted; shapes are save-stable.
// Ephemeral projections (StrategicAssessment, StrategicOpportunity) deliberately live beside their systems, not here.

// --- Advisors ---

export type AdvisorType =
  | 'builder'
  | 'explorer'
  | 'chancellor'
  | 'warchief'
  | 'treasurer'
  | 'scholar'
  | 'spymaster'
  | 'artisan';

export type CouncilTalkLevel = 'quiet' | 'normal' | 'chatty' | 'chaos';

/**
 * Typed dispatch context for a `CouncilCard.actionLabel` button -- avoids
 * parsing a city/wonder id back out of a concatenated card `id` (both
 * `city-<n>` and wonder ids contain hyphens, so that string cannot be split
 * unambiguously). Event-chain drama cards omit this and are still dispatched
 * via their own id-prefix parse (`parseEventChainCardId`), unchanged from #990.
 */
export type CouncilCardAction =
  | { kind: 'scout' }
  | { kind: 'open-city'; cityId: string }
  | { kind: 'open-quest'; minorCivId: string }
  | { kind: 'open-wonder'; cityId: string; wonderId: string }
  /** #1237: no research chosen -- science is discarded until the player picks one in the tech panel. */
  | { kind: 'open-tech' }
  /** #1237: the Domination lane opens the victory-progress panel (it covers Domination only, not world races). */
  | { kind: 'open-victory-progress' }
  /** #1334: open the Diplomacy panel (tribute demands and agreements are answered and read there). */
  | { kind: 'open-diplomacy' }
  /** #1374: open the Governance panel (free capacity can be spent on a policy or governor there). */
  | { kind: 'open-governance' };

export interface CouncilCard {
  id: string;
  advisor: AdvisorType;
  bucket: 'do-now' | 'soon' | 'to-win' | 'drama';
  cardType?: 'standard' | 'wonder';
  title: string;
  summary: string;
  why: string;
  priority: number;
  actionLabel?: string;
  action?: CouncilCardAction;
}

export interface CouncilAgenda {
  doNow: CouncilCard[];
  soon: CouncilCard[];
  toWin: CouncilCard[];
  drama: CouncilCard[];
}

export interface CouncilInterrupt {
  civId: string;
  advisor: AdvisorType;
  summary: string;
  sourceCardId: string;
}

export interface CouncilState {
  talkLevel: CouncilTalkLevel;
  lastShownTurn: number;
}

export type CouncilMemoryOutcome =
  | 'pending'
  | 'followed'
  | 'ignored'
  | 'succeeded'
  | 'failed'
  | 'obsolete';

export type CouncilMemoryKind =
  | 'frontier-expansion'
  | 'watch-rival-city'
  | 'wonder-plan'
  | 'city-development'
  | 'advisor-disagreement';

export type CouncilCallbackTone = 'reflective' | 'smug' | 'resentful';

export interface CouncilMemorySubjects {
  cityId?: string;
  civId?: string;
  regionKey?: string;
  wonderId?: string;
  advisorFor?: AdvisorType;
  advisorAgainst?: AdvisorType;
  forAction?: string;
  againstAction?: string;
}

export interface CouncilMemoryEntry {
  key: string;
  advisor: AdvisorType;
  kind: CouncilMemoryKind;
  turn: number;
  subjects: CouncilMemorySubjects;
  outcome?: CouncilMemoryOutcome;
  previousOutcome?: CouncilMemoryOutcome;
  lastCallbackTurn?: number;
}

export interface CouncilMemoryLedger {
  entries: CouncilMemoryEntry[];
  eraCallbackCount: number;
  callbackEra: number;
}

export type CouncilMemoryState = Record<string, CouncilMemoryLedger>;

// --- Strategic assessment history (#1238) ---
// The unions live here (not in `strategic-assessment.ts`) so the persisted digest can name them
// without `core` importing a system; `strategic-assessment.ts` re-exports them.

/**
 * The one inventory of strategic constraint kinds (#1357). The union below, the persisted-digest validator and the
 * presentation table all derive from it, so a kind added here cannot be missing from one of them.
 */
export const STRATEGIC_CONSTRAINT_KINDS = ['food', 'production', 'science', 'gold', 'unrest', 'supply', 'blockade'] as const;
export type StrategicConstraintKind = typeof STRATEGIC_CONSTRAINT_KINDS[number];

export type VictoryStage = 'not-started' | 'building' | 'competitive' | 'leading' | 'at-risk';

/** Coarse severity band; edges match the bands documented in `strategic-assessment.ts` (1-39 / 40-69 / 70+). */
export type AssessmentSeverityBucket = 'low' | 'mid' | 'high';

/**
 * What a viewer last saw of their own strategic assessment, kept only so the Council can say what
 * changed since. A digest, never the full assessment: bucketed severities and lane stages, no copy,
 * no rival facts. Written for one civ at the end of its own turn.
 */
export interface AssessmentDigest {
  /** The turn the digest was recorded on. */
  turn: number;
  constraints: Array<{ kind: StrategicConstraintKind; bucket: AssessmentSeverityBucket; focusCityId?: string }>;
  victory: Array<{ id: string; stage: VictoryStage }>;
}
