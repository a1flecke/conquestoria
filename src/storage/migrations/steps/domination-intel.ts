import type { GameState } from '@/core/types';
import { isMajorCivOwner } from '@/core/owner-kind';
import type {
  DominationDefeatFact,
  DominationIntelState,
  DominationObserverIntel,
  DominationPoliticalReport,
} from '@/systems/domination-types';

type UnknownRecord = Record<string, unknown>;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isTurn(value: unknown, currentTurn: number): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= currentTurn;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function normalizeReferencedIds(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every(isNonEmptyString)) return null;
  return [...new Set(value)].sort();
}

function repairDefeatFact(
  civId: string,
  value: unknown,
  currentTurn: number,
): DominationDefeatFact | null {
  if (!isRecord(value)
    || value.civId !== civId
    || !isNonEmptyString(value.civName)
    || !isTurn(value.observedTurn, currentTurn)
    || (value.defeatedById !== null && !isNonEmptyString(value.defeatedById))
    || (value.source !== 'participant' && value.source !== 'witness')) {
    return null;
  }

  return {
    civId,
    civName: value.civName,
    observedTurn: value.observedTurn,
    defeatedById: value.defeatedById,
    source: value.source,
  };
}

function repairPoliticalReport(
  contenderId: string,
  value: unknown,
  currentTurn: number,
): DominationPoliticalReport | null {
  if (!isRecord(value)
    || value.contenderId !== contenderId
    || !isTurn(value.observedTurn, currentTurn)
    || !['independent', 'vassal', 'provisional', 'unknown'].includes(value.contenderRole as string)) {
    return null;
  }

  const directVassalIds = normalizeReferencedIds(value.directVassalIds);
  const defeatedCivIds = normalizeReferencedIds(value.defeatedCivIds);
  if (!directVassalIds || !defeatedCivIds) return null;

  return {
    contenderId,
    observedTurn: value.observedTurn,
    contenderRole: value.contenderRole as DominationPoliticalReport['contenderRole'],
    directVassalIds: directVassalIds.filter(civId => civId !== contenderId && isMajorCivOwner(civId)),
    defeatedCivIds: defeatedCivIds.filter(civId =>
      civId !== contenderId && isMajorCivOwner(civId) && !directVassalIds.includes(civId)),
  };
}

function repairObserverIntel(value: unknown, currentTurn: number): DominationObserverIntel | null {
  if (!isRecord(value) || !isRecord(value.defeatsByCivId) || !isRecord(value.reportsByContenderId)) {
    return null;
  }

  const defeatsByCivId: Record<string, DominationDefeatFact> = {};
  for (const [civId, fact] of Object.entries(value.defeatsByCivId)) {
    const repaired = repairDefeatFact(civId, fact, currentTurn);
    if (repaired) defeatsByCivId[civId] = repaired;
  }

  const reportsByContenderId: Record<string, DominationPoliticalReport> = {};
  for (const [contenderId, report] of Object.entries(value.reportsByContenderId)) {
    if (!isMajorCivOwner(contenderId)) continue;
    const repaired = repairPoliticalReport(contenderId, report, currentTurn);
    if (repaired) reportsByContenderId[contenderId] = repaired;
  }

  return { defeatsByCivId, reportsByContenderId };
}

/** Older saves have no earned Domination observations and must not receive a backfill. */
export function migrateDominationIntel(state: GameState): GameState {
  return state.dominationIntel ? state : { ...state, dominationIntel: {} };
}

/**
 * Repair validates only recorded evidence. It does not compare observations to
 * live political state, because that would fabricate hidden historical knowledge.
 */
export function repairDominationIntel(state: GameState): GameState {
  if (!isRecord(state.dominationIntel)) return { ...state, dominationIntel: {} };

  const dominationIntel: DominationIntelState = {};
  for (const [observerId, observerIntel] of Object.entries(state.dominationIntel)) {
    if (!state.civilizations[observerId] || !isMajorCivOwner(observerId)) continue;
    const repaired = repairObserverIntel(observerIntel, state.turn);
    if (repaired) dominationIntel[observerId] = repaired;
  }

  return { ...state, dominationIntel };
}
