/**
 * #887 MR1 — the Great General campaign chronicle: a transition-owned career
 * ledger + pure aggregation.
 *
 * Events are appended at canonical gameplay mutation sources (spawn, ability
 * issuance, combat outcome, city capture, death, retirement) via
 * `appendGeneralCareerEvent`, and stored inside the owning
 * `GeneralHistoryEntry.careerEvents`. Nothing here reconstructs history from
 * current game state; nothing here reads a #886 profile or #885 specialty; the
 * AI never reads this module (it only writes, via the shared domain sources).
 *
 * `summarizeGeneralCareer` is the canonical data source a future Hall of Fame UI
 * (#887 MR2) consumes with zero world-state reconstruction.
 */
import type {
  Civilization,
  GameState,
  GeneralCareerEvent,
  GeneralHistoryEntry,
} from '@/core/types';

/**
 * Immutably append `event` to the `careerEvents` of `civId`'s history entry for
 * `generalDefinitionId`. No-ops (returns `state` unchanged) when:
 *   - `generalDefinitionId` is falsy (e.g. a pre-#887 in-flight Last Stand hold
 *     with no `generalDefinitionId`),
 *   - the civ has no `generalHistory`, or
 *   - no entry matches (e.g. the entry was dropped by save normalization).
 * Callers always know `civId` (owner of the General / capturing civ), so there
 * is no roster scan.
 */
export function appendGeneralCareerEvent(
  state: GameState,
  civId: string,
  generalDefinitionId: string | undefined,
  event: GeneralCareerEvent,
): GameState {
  if (!generalDefinitionId) return state;
  const civ = state.civilizations[civId];
  const history = civ?.generalHistory;
  if (!civ || !history) return state;
  const index = history.findIndex(e => e.generalDefinitionId === generalDefinitionId);
  if (index === -1) return state;

  const entry = history[index]!;
  const nextEntry: GeneralHistoryEntry = {
    ...entry,
    careerEvents: [...(entry.careerEvents ?? []), event],
  };
  const nextHistory = [...history];
  nextHistory[index] = nextEntry;

  return {
    ...state,
    civilizations: {
      ...state.civilizations,
      [civId]: { ...civ, generalHistory: nextHistory },
    },
  };
}

export interface GeneralCareerSummary {
  generalDefinitionId: string;
  spawnedTurn: number;
  /** Turn of the last recorded event (spawn turn if that is the only one). */
  lastActiveTurn: number;
  status: 'active' | 'retired' | 'fallen';
  /** (retiredTurn ?? diedTurn ?? lastActiveTurn) − spawnedTurn, floored at 0. */
  careerTurns: number;
  battlesInfluenced: number;   // distinct combatId in battle-influenced events
  citiesCaptured: number;      // distinct cityId in city-captured events
  uniqueCitiesDefended: number; // distinct cityId in city-defended events
  cityDefenseActions: number;  // total city-defended events
  unitsSaved: number;
  rallyUses: number;
  seizeUses: number;
  lastStandUses: number;       // last-stand-issued count
  finalCommandUsed: boolean;
}

/** Pure. O(events for this one General). Tolerates `careerEvents` absent. */
export function summarizeGeneralCareer(entry: GeneralHistoryEntry): GeneralCareerSummary {
  const events = entry.careerEvents ?? [];
  const combatIds = new Set<string>();
  const capturedCityIds = new Set<string>();
  const defendedCityIds = new Set<string>();
  let cityDefenseActions = 0;
  let unitsSaved = 0;
  let rallyUses = 0;
  let seizeUses = 0;
  let lastStandUses = 0;
  let finalCommandUsed = false;
  let lastActiveTurn = entry.spawnedTurn;

  for (const e of events) {
    lastActiveTurn = Math.max(lastActiveTurn, e.turn);
    switch (e.type) {
      case 'battle-influenced': combatIds.add(e.combatId); break;
      case 'city-captured': capturedCityIds.add(e.cityId); break;
      case 'city-defended': defendedCityIds.add(e.cityId); cityDefenseActions += 1; break;
      case 'unit-saved': unitsSaved += 1; break;
      case 'rally-used': rallyUses += 1; break;
      case 'seize-used': seizeUses += 1; break;
      case 'last-stand-issued': lastStandUses += 1; break;
      case 'final-command': finalCommandUsed = true; break;
      default: break;
    }
  }

  const status: GeneralCareerSummary['status'] =
    entry.outcome === 'died' ? 'fallen' : entry.outcome === 'retired' ? 'retired' : 'active';
  const endTurn = entry.retiredTurn ?? entry.diedTurn ?? lastActiveTurn;

  return {
    generalDefinitionId: entry.generalDefinitionId,
    spawnedTurn: entry.spawnedTurn,
    lastActiveTurn,
    status,
    careerTurns: Math.max(0, endTurn - entry.spawnedTurn),
    battlesInfluenced: combatIds.size,
    citiesCaptured: capturedCityIds.size,
    uniqueCitiesDefended: defendedCityIds.size,
    cityDefenseActions,
    unitsSaved,
    rallyUses,
    seizeUses,
    lastStandUses,
    finalCommandUsed,
  };
}

/** Every General a civ has ever had, summarized. The Hall of Fame data source. */
export function summarizeCivHallOfFame(
  civ: Pick<Civilization, 'generalHistory'>,
): GeneralCareerSummary[] {
  return (civ.generalHistory ?? []).map(summarizeGeneralCareer);
}

/**
 * Viewer-safe boundary (#887 Phase 25): returns the career summary for
 * `generalDefinitionId` ONLY if `viewerCivId` owns / owned that General (its
 * entry is in that civ's `generalHistory`). A rival's General → `undefined`.
 * Phase A never exposes rival career data; a future "discovered enemy Hall of
 * Fame" needs a discovery model that does not exist yet. UI must use this, not
 * iterate all civs' `generalHistory`.
 */
export function getGeneralCareerForViewer(
  state: GameState,
  viewerCivId: string,
  generalDefinitionId: string,
): GeneralCareerSummary | undefined {
  const entry = state.civilizations[viewerCivId]?.generalHistory
    ?.find(e => e.generalDefinitionId === generalDefinitionId);
  return entry ? summarizeGeneralCareer(entry) : undefined;
}

/**
 * A terse, truthful campaign-stat clause for the existing end-of-career line
 * (#887 Phase 31). Returns `''` when the career has only `spawned` + a terminal
 * event, so a peaceful-empire General's line is unchanged. Not display polish —
 * a bounded factual summary of what the General actually did.
 */
export function describeGeneralCareerHighlights(summary: GeneralCareerSummary): string {
  const parts: string[] = [];
  if (summary.citiesCaptured > 0) {
    parts.push(`${summary.citiesCaptured} ${summary.citiesCaptured === 1 ? 'city' : 'cities'} captured`);
  }
  if (summary.uniqueCitiesDefended > 0) {
    parts.push(`${summary.uniqueCitiesDefended} ${summary.uniqueCitiesDefended === 1 ? 'city' : 'cities'} defended`);
  }
  if (summary.unitsSaved > 0) {
    parts.push(`${summary.unitsSaved} ${summary.unitsSaved === 1 ? 'unit' : 'units'} saved`);
  }
  if (summary.battlesInfluenced > 0) {
    parts.push(`${summary.battlesInfluenced} ${summary.battlesInfluenced === 1 ? 'battle' : 'battles'} influenced`);
  }
  return parts.length === 0 ? '' : ` — ${parts.join(', ')}.`;
}
