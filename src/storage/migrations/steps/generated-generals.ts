import type { GameState, GeneralCareerEvent, GeneratedGeneralIdentity } from '@/core/types';

/**
 * Schema 23 — the fallback-generated officer registry (#888) — plus the General
 * career ledger (#887 MR1), which deliberately took no numbered slot.
 *
 * Both are validate-and-scrub passes: they drop structurally malformed entries
 * rather than trusting hand-edited save data.
 */

function isPositiveInt(value: unknown): boolean {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}

function isValidGeneratedGeneral(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const g = value as Record<string, unknown>;
  return typeof g.id === 'string' && g.id.length > 0
    && typeof g.name === 'string' && g.name.length > 0
    && typeof g.era === 'number' && Number.isInteger(g.era) && g.era >= 1 && g.era <= 12
    && Array.isArray(g.civTypeEligibility) && g.civTypeEligibility.every(c => typeof c === 'string')
    && typeof g.descriptor === 'string' && g.descriptor.length > 0
    && typeof g.portraitIcon === 'string' && g.portraitIcon.length > 0
    // command stats must be usable — a NaN/negative range would silently break
    // getEffectiveCommandStats / mapHexesInRange downstream, so drop the record
    // (resolver -> undefined -> safe degrade) rather than pass garbage through.
    && isPositiveInt(g.commandRange)
    && isPositiveInt(g.commandCapacity)
    && isPositiveInt(g.maxCommandCharges)
    && isPositiveInt(g.cooldownTurns)
    && Array.isArray(g.abilityIds) && g.abilityIds.length > 0 && g.abilityIds.every(a => typeof a === 'string');
}

export function normalizeGeneratedGenerals(state: GameState): GameState {
  const raw = state.generatedGenerals;
  if (raw === undefined) return { ...state, generatedGenerals: {} };
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ...state, generatedGenerals: {} };
  }
  let changed = false;
  const next: Record<string, GeneratedGeneralIdentity> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (isValidGeneratedGeneral(value) && (value as { id: string }).id === key) {
      const entry = value as unknown as GeneratedGeneralIdentity;
      next[key] = entry.origin === 'generated' ? entry : { ...entry, origin: 'generated' };
      if (next[key] !== value) changed = true;
    } else {
      changed = true;
    }
  }
  return changed ? { ...state, generatedGenerals: next } : state;
}

// #887 MR1: `GeneralHistoryEntry.careerEvents` is a new optional field. A save
// written before it has entries with no `careerEvents` at all -- normalize each
// to a clean array WITHOUT fabricating any history (a legacy General's deeds are
// simply unrecorded -- persist facts, don't invent them). Also drops any
// structurally-malformed event so a corrupt file can't crash summarization.
// Runs unconditionally in the additive tail of migrateSaveToCurrent (NOT as a
// numbered SAVE_MIGRATIONS slot -- version 24 is reserved for the research-cost
// retune, see the note in SAVE_MIGRATIONS). Idempotent + additive, same
// safety rationale as withReligionDefaults / normalizeCityFaithConversionProgress.
// The known-type set below is the MR1 set -- a future MR that adds career-event
// types adds its own pass rather than widening this one.
const MR1_CAREER_EVENT_TYPES: ReadonlySet<string> = new Set([
  'spawned', 'rally-used', 'seize-used', 'last-stand-issued', 'unit-saved',
  'battle-influenced', 'city-defended', 'city-captured', 'final-command',
  'retired', 'killed',
]);

function isValidCareerEvent(value: unknown): value is GeneralCareerEvent {
  if (!value || typeof value !== 'object') return false;
  const event = value as Record<string, unknown>;
  return typeof event.type === 'string' && MR1_CAREER_EVENT_TYPES.has(event.type)
    && typeof event.turn === 'number' && Number.isFinite(event.turn);
}

export function normalizeGeneralCareerLedger(state: GameState): GameState {
  let changed = false;
  const civilizations: GameState['civilizations'] = {};
  for (const [civId, civ] of Object.entries(state.civilizations)) {
    const history = civ.generalHistory;
    if (!Array.isArray(history)) {
      civilizations[civId] = civ;
      continue;
    }
    let historyChanged = false;
    const nextHistory = history.map(entry => {
      const clean = Array.isArray(entry.careerEvents)
        ? entry.careerEvents.filter(isValidCareerEvent)
        : [];
      if (Array.isArray(entry.careerEvents) && clean.length === entry.careerEvents.length) {
        return entry;
      }
      historyChanged = true;
      return { ...entry, careerEvents: clean };
    });
    if (historyChanged) {
      changed = true;
      civilizations[civId] = { ...civ, generalHistory: nextHistory };
    } else {
      civilizations[civId] = civ;
    }
  }
  return changed ? { ...state, civilizations } : state;
}
