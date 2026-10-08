// #1238: the per-civ memory behind the Council's "Since your last turn" section.
//
// One digest per civ (`GameState.assessmentDigestByCiv`), written by exactly one caller path: the
// moment a human ends their own turn (`recordAssessmentDigest`, from `turn-flow-controller.ts`'s
// `endTurn`). It is deliberately NOT written when the Council opens: opening it twice in one turn
// would advance the baseline past changes the player had not yet acted on, and the second look
// would show an empty list. Reads (`getAssessmentChangesForViewer`) never write, so the section is
// the same every time it is opened within a turn, and the baseline moves only when the turn does.
//
// Hot seat: a digest is keyed by civ and a read takes the viewer's own civ id, so one seat's
// digest can never reach another seat's section. A digest only ever holds the viewer's own
// assessment (bucketed), so it carries no rival facts to leak.
import type { GameState } from '@/core/types';
import type { AssessmentDigest } from '@/core/types/council';
import { STRATEGIC_CONSTRAINT_KINDS } from '@/core/types/council';
import {
  buildAssessmentDigest,
  buildStrategicAssessment,
  diffAssessment,
  type AssessmentChange,
} from '@/systems/strategic-assessment';

const CONSTRAINT_KINDS: ReadonlySet<string> = new Set<string>(STRATEGIC_CONSTRAINT_KINDS);
const VICTORY_STAGES: ReadonlySet<string> = new Set(['not-started', 'building', 'competitive', 'leading', 'at-risk']);
const SEVERITY_BUCKETS: ReadonlySet<string> = new Set(['low', 'mid', 'high']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * The stored digest for `civId`, or undefined when there is none or it is not a well-formed digest
 * (hand-edited or truncated save, or one recorded on a turn that has not happened yet). Absent and
 * malformed both mean "no history": the section stays hidden rather than guessing.
 */
export function readAssessmentDigest(state: GameState, civId: string): AssessmentDigest | undefined {
  const raw: unknown = state.assessmentDigestByCiv?.[civId];
  if (!isRecord(raw)) return undefined;
  if (typeof raw.turn !== 'number' || !Number.isFinite(raw.turn) || raw.turn < 0 || raw.turn > state.turn) return undefined;
  if (!Array.isArray(raw.constraints) || !Array.isArray(raw.victory)) return undefined;

  const constraints: AssessmentDigest['constraints'] = [];
  for (const entry of raw.constraints as unknown[]) {
    if (!isRecord(entry)) return undefined;
    if (typeof entry.kind !== 'string' || !CONSTRAINT_KINDS.has(entry.kind)) return undefined;
    if (typeof entry.bucket !== 'string' || !SEVERITY_BUCKETS.has(entry.bucket)) return undefined;
    if (entry.focusCityId !== undefined && typeof entry.focusCityId !== 'string') return undefined;
    constraints.push(entry as AssessmentDigest['constraints'][number]);
  }

  const victory: AssessmentDigest['victory'] = [];
  for (const entry of raw.victory as unknown[]) {
    if (!isRecord(entry)) return undefined;
    if (typeof entry.id !== 'string') return undefined;
    if (typeof entry.stage !== 'string' || !VICTORY_STAGES.has(entry.stage)) return undefined;
    victory.push(entry as AssessmentDigest['victory'][number]);
  }

  return { turn: raw.turn, constraints, victory };
}

/** The changes the viewer should be told about now: their own previous digest against their own current assessment. Pure. */
export function getAssessmentChangesForViewer(state: GameState, viewerCivId: string): AssessmentChange[] {
  const previous = readAssessmentDigest(state, viewerCivId);
  if (!previous) return [];
  return diffAssessment(previous, buildStrategicAssessment(state, viewerCivId));
}

/**
 * Advance `civId`'s baseline to the assessment as they leave their turn. Returns a new state; a civ
 * that is not a living human (the AI never reads this, so it gets no digest) returns the same state.
 */
export function recordAssessmentDigest(state: GameState, civId: string): GameState {
  const civ = state.civilizations[civId];
  if (!civ?.isHuman || civ.isEliminated) return state;
  const digest = buildAssessmentDigest(buildStrategicAssessment(state, civId));
  return { ...state, assessmentDigestByCiv: { ...state.assessmentDigestByCiv, [civId]: digest } };
}
