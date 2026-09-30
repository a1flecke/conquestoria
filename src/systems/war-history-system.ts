/**
 * #991 -- a persistent, named historical record per major-vs-major war.
 * Deliberately a cycle-free-in-one-direction leaf (imports only `@/core/types`
 * and `@/systems/simulation-rng`): `diplomacy-war.ts`, `city-capture-system.ts`,
 * `civilization-elimination-system.ts`, `war-goal-system.ts` and
 * `settlement-system.ts` all import FROM here to record facts at their own
 * canonical mutation points; nothing here imports back, so there is no cycle.
 *
 * Scope (#991, deliberately separate from #988's war-GOALS mechanics, and from
 * minor-civ/coalition wars -- see the design note in this PR): only
 * major-vs-major wars get a `WarRecord`. `DiplomaticEvent`'s capped rolling
 * log is untouched; this is an additional, differently-scoped structure, per
 * #991's own non-goal.
 *
 * Every recorded fact is something the caller can determine exactly at the
 * moment it happens -- never a heuristic "importance" score, never
 * reconstructed later from other state.
 */
import type {
  GameState,
  WarRecord,
  WarParticipant,
  WarParticipantSide,
  WarHistoryEvent,
  WarLeaveReason,
  WarOutcome,
  WarGoalKind,
} from '@/core/types';
import { createSimulationRng } from '@/systems/simulation-rng';
import { hasMetCivilization, hasDiscoveredCity } from '@/systems/discovery-system';

/** Bounded so a long campaign's save size stays sane (#991: "size matters --
 * cap or summarise concluded wars"). `declared`/`concluded` are never dropped;
 * the oldest non-structural event is dropped first once the cap is exceeded. */
export const MAX_WAR_HISTORY_EVENTS = 60;

function pushEvent(record: WarRecord, event: WarHistoryEvent): WarHistoryEvent[] {
  const events = [...record.events, event];
  if (events.length <= MAX_WAR_HISTORY_EVENTS) return events;
  const structuralIdx = events.findIndex(e => e.type === 'declared' || e.type === 'concluded');
  const dropIdx = events.findIndex((e, i) => i !== structuralIdx);
  if (dropIdx === -1) return events;
  return [...events.slice(0, dropIdx), ...events.slice(dropIdx + 1)];
}

function withRecord(state: GameState, record: WarRecord): GameState {
  return { ...state, wars: { ...state.wars, [record.id]: record } };
}

export function isActiveParticipant(record: WarRecord, civId: string): boolean {
  return record.participants.some(p => p.civId === civId && p.leftTurn === undefined);
}

export function sideOf(record: WarRecord, civId: string): WarParticipantSide | undefined {
  return record.participants.find(p => p.civId === civId)?.side;
}

function opposingSide(side: WarParticipantSide): WarParticipantSide {
  return side === 'aggressor' ? 'defender' : 'aggressor';
}

/** The one active (unconcluded) war record `civId` is currently a live
 * combatant in, or `undefined`. A civ is never a live combatant in more than
 * one active record by construction (see `declareWarRecord`'s join branch). */
export function findActiveWarForCiv(state: GameState, civId: string): WarRecord | undefined {
  return Object.values(state.wars ?? {}).find(
    record => record.endTurn === undefined && isActiveParticipant(record, civId),
  );
}

export function findActiveWarBetween(state: GameState, civA: string, civB: string): WarRecord | undefined {
  return Object.values(state.wars ?? {}).find(
    record => record.endTurn === undefined && isActiveParticipant(record, civA) && isActiveParticipant(record, civB),
  );
}

/**
 * This war's ordinal among all wars ever fought between its original
 * aggressor/defender pair (in either role), counting only records that
 * started at or before it -- deterministic regardless of `state.wars`
 * iteration order. `1` for the first such war, `2` for the second, etc.
 * Recomputed at presentation time rather than stored, so it never needs
 * retroactive correction if history is somehow replayed out of order.
 */
export function getWarOrdinal(state: GameState, warId: string): number {
  const record = state.wars?.[warId];
  if (!record) return 1;
  const { originalAggressorId: a, originalDefenderId: d, startTurn } = record;
  return Object.values(state.wars ?? {}).filter(other =>
    ((other.originalAggressorId === a && other.originalDefenderId === d)
      || (other.originalAggressorId === d && other.originalDefenderId === a))
    && (other.startTurn < startTurn || (other.startTurn === startTurn && other.id <= record.id))).length;
}

const ORDINAL_WORDS = ['', 'Second', 'Third', 'Fourth', 'Fifth', 'Sixth', 'Seventh', 'Eighth', 'Ninth', 'Tenth'];
function ordinalPrefix(ordinal: number): string {
  return ordinal <= 1 ? '' : `${ORDINAL_WORDS[Math.min(ordinal - 1, ORDINAL_WORDS.length - 1)]} `;
}

/** Deterministic name-template candidates, keyed by `nameTemplateIndex`.
 * `aggressorName`/`defenderName` are already viewer-redacted by the caller
 * (see `getWarPresentationForViewer`) -- this function never reads knowledge. */
export const WAR_NAME_TEMPLATES: ReadonlyArray<(aggressor: string, defender: string, ordinal: number) => string> = [
  (a, d, o) => `${ordinalPrefix(o)}${a}–${d} War`,
  (a, d, o) => `${ordinalPrefix(o)}War of ${a} against ${d}`,
  (a, d, o) => `${a}'s ${ordinalPrefix(o)}Invasion of ${d}`,
];

export function renderWarName(record: Pick<WarRecord, 'nameTemplateIndex'>, aggressorName: string, defenderName: string, ordinal: number): string {
  const template = WAR_NAME_TEMPLATES[record.nameTemplateIndex] ?? WAR_NAME_TEMPLATES[0];
  return template(aggressorName, defenderName, ordinal);
}

/**
 * Starts a new war record, OR -- if either civ already has an active record
 * the other is not yet part of -- joins the newcomer onto that record instead
 * (the vassal-drag-in / league-join shape: `addWarPair` is the single choke
 * point for every major-civ bilateral war pair, voluntary or forced). Call
 * this from `addWarPair`, never re-derive war-record membership elsewhere.
 */
export function declareWarRecord(
  state: GameState,
  aggressorId: string,
  defenderId: string,
  turn: number,
): GameState {
  if (findActiveWarBetween(state, aggressorId, defenderId)) return state;

  const defenderRecord = findActiveWarForCiv(state, defenderId);
  if (defenderRecord && !isActiveParticipant(defenderRecord, aggressorId)) {
    const side = opposingSide(sideOf(defenderRecord, defenderId)!);
    return addParticipant(state, defenderRecord.id, aggressorId, side, turn);
  }
  const aggressorRecord = findActiveWarForCiv(state, aggressorId);
  if (aggressorRecord && !isActiveParticipant(aggressorRecord, defenderId)) {
    const side = opposingSide(sideOf(aggressorRecord, aggressorId)!);
    return addParticipant(state, aggressorRecord.id, defenderId, side, turn);
  }

  const nextId = state.idCounters.nextWarId ?? 1;
  const id = `war-${nextId}`;
  const rng = createSimulationRng(state, { domain: 'war-naming', eventId: id });
  const nameTemplateIndex = Math.floor(rng() * WAR_NAME_TEMPLATES.length);
  const record: WarRecord = {
    id,
    nameTemplateIndex,
    originalAggressorId: aggressorId,
    originalDefenderId: defenderId,
    startTurn: turn,
    participants: [
      { civId: aggressorId, side: 'aggressor', joinedTurn: turn },
      { civId: defenderId, side: 'defender', joinedTurn: turn },
    ],
    events: [{ type: 'declared', turn, aggressorId, defenderId }],
  };
  return withRecord(
    { ...state, idCounters: { ...state.idCounters, nextWarId: nextId + 1 } },
    record,
  );
}

function addParticipant(
  state: GameState,
  warId: string,
  civId: string,
  side: WarParticipantSide,
  turn: number,
): GameState {
  const record = state.wars?.[warId];
  if (!record || record.endTurn !== undefined || isActiveParticipant(record, civId)) return state;
  const participant: WarParticipant = { civId, side, joinedTurn: turn };
  const next: WarRecord = {
    ...record,
    participants: [...record.participants, participant],
    events: pushEvent(record, { type: 'participant-joined', turn, civId, side }),
  };
  return withRecord(state, next);
}

/** True once a side has no active (not-yet-left) combatant. */
function sideIsEmpty(record: WarRecord, side: WarParticipantSide): boolean {
  return !record.participants.some(p => p.side === side && p.leftTurn === undefined);
}

/**
 * `defaultOutcome` is overridden to `'settled'` when the record already logged
 * a `settlement-signed` event. That event is only ever written by
 * {@link withSettlementSigned}, which runs the peace transition itself AFTER
 * logging it, so the settlement's own event is always present the moment either
 * side empties out (#1014: this ordering used to be a comment asking the caller to
 * call two functions in the right order). This is the one place that decides the
 * final `WarOutcome`; nothing else writes `endTurn`.
 */
function concludeIfResolved(state: GameState, record: WarRecord, turn: number, defaultOutcome: WarOutcome): GameState {
  if (record.endTurn !== undefined) return withRecord(state, record);
  const resolved = sideIsEmpty(record, 'aggressor') || sideIsEmpty(record, 'defender');
  if (!resolved) return withRecord(state, record);
  const outcome: WarOutcome = record.events.some(e => e.type === 'settlement-signed') ? 'settled' : defaultOutcome;
  const concluded: WarRecord = {
    ...record,
    endTurn: turn,
    outcome,
    events: pushEvent(record, { type: 'concluded', turn, outcome }),
  };
  return withRecord(state, concluded);
}

/**
 * `civId` makes bilateral peace with `opponentId` -- the only way a
 * participant currently leaves a war short of elimination (a released or
 * independent vassal keeps its inherited wars by design, see #1054; there is
 * no other "leaves but the war continues for it" path today). A no-op when
 * there is no active war record covering this pair. Concludes the record if
 * this empties either side.
 */
export function recordParticipantLeft(
  state: GameState,
  civId: string,
  opponentId: string,
  turn: number,
): GameState {
  const record = findActiveWarBetween(state, civId, opponentId);
  if (!record) return state;
  const idx = record.participants.findIndex(p => p.civId === civId && p.leftTurn === undefined);
  if (idx === -1) return state;
  const participants = [...record.participants];
  participants[idx] = { ...participants[idx]!, leftTurn: turn, leaveReason: 'peace' };
  const withLeave: WarRecord = { ...record, participants, events: pushEvent(record, { type: 'participant-left', turn, civId, reason: 'peace' }) };
  return concludeIfResolved(state, withLeave, turn, 'white-peace');
}

/** `civId` is eliminated entirely -- leaves EVERY active war it is in. */
export function recordParticipantEliminated(state: GameState, civId: string, turn: number): GameState {
  let next = state;
  for (const record of Object.values(next.wars ?? {})) {
    if (record.endTurn !== undefined || !isActiveParticipant(record, civId)) continue;
    const withEvent: WarRecord = { ...record, events: pushEvent(record, { type: 'participant-eliminated', turn, civId }) };
    next = withRecord(next, withEvent);
    const stored = next.wars![record.id]!;
    const idx = stored.participants.findIndex(p => p.civId === civId && p.leftTurn === undefined);
    const participants = [...stored.participants];
    participants[idx] = { ...participants[idx]!, leftTurn: turn, leaveReason: 'eliminated' };
    const side = sideOf(stored, civId)!;
    const outcome: WarOutcome = side === 'aggressor' ? 'aggressor-eliminated' : 'defender-eliminated';
    next = concludeIfResolved(next, { ...stored, participants }, turn, outcome);
  }
  return next;
}

/** Records a city changing hands between two combatants, if there is an
 * active war between them (a peaceful cession between non-combatants is not
 * a war fact and is silently skipped). */
export function recordCityCaptured(
  state: GameState,
  cityId: string,
  cityName: string,
  fromCivId: string,
  toCivId: string,
  turn: number,
  wasCapital: boolean,
): GameState {
  const record = findActiveWarBetween(state, fromCivId, toCivId);
  if (!record) return state;
  const next: WarRecord = { ...record, events: pushEvent(record, { type: 'city-captured', turn, cityId, cityName, fromCivId, toCivId, wasCapital }) };
  return withRecord(state, next);
}

export function recordGoalDeclared(
  state: GameState,
  civId: string,
  opponentCivId: string,
  kind: WarGoalKind,
  turn: number,
): GameState {
  const record = findActiveWarBetween(state, civId, opponentCivId);
  if (!record) return state;
  const next: WarRecord = { ...record, events: pushEvent(record, { type: 'goal-declared', turn, civId, opponentCivId, kind }) };
  return withRecord(state, next);
}

/**
 * Signs a negotiated settlement between two combatants: logs the
 * `settlement-signed` event, THEN runs `peaceTransition` on the result, so the war
 * concludes with outcome `'settled'` rather than the plain-peace default
 * `'white-peace'`.
 *
 * The order is the whole point and is not the caller's to get right (#1014): the
 * event is only reachable through this function, which hands `peaceTransition` a
 * state that already carries it. The previous shape -- an exported
 * `recordSettlementSigned` plus "call it BEFORE `makeMajorPeace`" -- failed
 * silently when called after: `findActiveWarBetween` finds no active war once peace
 * has concluded it, so the settlement was dropped and the war was mislabelled
 * `'white-peace'`.
 *
 * With no active war record between the pair there is nothing to annotate and the
 * transition still runs (peace is not conditional on the war history).
 */
export function withSettlementSigned(
  state: GameState,
  civA: string,
  civB: string,
  termCount: number,
  turn: number,
  peaceTransition: (withEvent: GameState) => GameState,
): GameState {
  const record = findActiveWarBetween(state, civA, civB);
  const withEvent = record
    ? withRecord(state, { ...record, events: pushEvent(record, { type: 'settlement-signed', turn, termCount }) })
    : state;
  return peaceTransition(withEvent);
}

// --- Viewer-safe presentation ---

const REDACTED_CIV_NAME = 'an unknown civilization';
const REDACTED_CITY_NAME = 'an unseen city';

export interface WarParticipantPresentation {
  /** `null` when the viewer has never met this civ -- never surface the id. */
  civId: string | null;
  name: string;
  side: WarParticipantSide;
  joinedTurn: number;
  leftTurn?: number;
  leaveReason?: WarLeaveReason;
}

export interface WarEventPresentation {
  type: WarHistoryEvent['type'];
  turn: number;
  /** Fully pre-rendered, viewer-safe copy -- unmet civs and undiscovered
   * cities are already redacted; the UI never resolves an id itself. */
  text: string;
}

export interface WarPresentation {
  id: string;
  name: string;
  startTurn: number;
  endTurn?: number;
  outcome?: WarOutcome;
  participants: WarParticipantPresentation[];
  events: WarEventPresentation[];
}

function civName(state: GameState, viewerId: string, civId: string): string {
  return hasMetCivilization(state, viewerId, civId)
    ? (state.civilizations[civId]?.name ?? civId)
    : REDACTED_CIV_NAME;
}

function cityName(state: GameState, viewerId: string, cityId: string, fallbackName: string): string {
  return hasDiscoveredCity(state, viewerId, cityId) ? fallbackName : REDACTED_CITY_NAME;
}

function describeWarHistoryEvent(state: GameState, viewerId: string, event: WarHistoryEvent): string {
  const civ = (id: string) => civName(state, viewerId, id);
  switch (event.type) {
    case 'declared':
      return `${civ(event.aggressorId)} declared war on ${civ(event.defenderId)}.`;
    case 'participant-joined':
      return `${civ(event.civId)} joined the war as ${event.side === 'aggressor' ? 'an aggressor' : 'a defender'}.`;
    case 'participant-left': {
      const reasonText = event.reason === 'peace' ? 'made peace' : 'was eliminated';
      return `${civ(event.civId)} ${reasonText}.`;
    }
    case 'participant-eliminated':
      return `${civ(event.civId)} was eliminated.`;
    case 'city-captured': {
      const city = cityName(state, viewerId, event.cityId, event.cityName);
      return event.wasCapital
        ? `${civ(event.toCivId)} captured ${civ(event.fromCivId)}'s capital, ${city}.`
        : `${civ(event.toCivId)} captured ${city} from ${civ(event.fromCivId)}.`;
    }
    case 'goal-declared': {
      const goalText = event.kind === 'force_vassalage' ? 'force vassalage'
        : event.kind === 'conquer_city' ? 'conquer a city' : 'liberate a city';
      return `${civ(event.civId)} declared a war goal: ${goalText}.`;
    }
    case 'settlement-signed':
      return `A settlement was signed (${event.termCount} ${event.termCount === 1 ? 'term' : 'terms'}).`;
    case 'concluded':
      return `The war concluded (${event.outcome.replace(/-/g, ' ')}).`;
  }
}

/**
 * The single viewer-safe entry point for a war record. Returns `null` when
 * the viewer has never met ANY participant, current or former -- per #991's
 * own guardrail, "a war the viewer has no contact with must not appear at
 * all, not even anonymised" (an anonymised row would itself leak "a war is
 * happening"). Otherwise, every unmet participant's name and every
 * undiscovered city's name is redacted, but the war itself, its other
 * (known) participants, and its known events are shown.
 */
export function getWarPresentationForViewer(state: GameState, viewerId: string, warId: string): WarPresentation | null {
  const record = state.wars?.[warId];
  if (!record) return null;
  const knowsAnyParticipant = record.participants.some(p => hasMetCivilization(state, viewerId, p.civId));
  if (!knowsAnyParticipant) return null;

  const ordinal = getWarOrdinal(state, warId);
  const aggressorName = civName(state, viewerId, record.originalAggressorId);
  const defenderName = civName(state, viewerId, record.originalDefenderId);

  return {
    id: record.id,
    name: renderWarName(record, aggressorName, defenderName, ordinal),
    startTurn: record.startTurn,
    endTurn: record.endTurn,
    outcome: record.outcome,
    participants: record.participants.map(p => ({
      civId: hasMetCivilization(state, viewerId, p.civId) ? p.civId : null,
      name: civName(state, viewerId, p.civId),
      side: p.side,
      joinedTurn: p.joinedTurn,
      leftTurn: p.leftTurn,
      leaveReason: p.leaveReason,
    })),
    events: record.events.map(event => ({
      type: event.type,
      turn: event.turn,
      text: describeWarHistoryEvent(state, viewerId, event),
    })),
  };
}

/** Every war record the viewer is entitled to know exists (has met at least
 * one participant), most recently started first. */
export function getWarsForViewer(state: GameState, viewerId: string): WarPresentation[] {
  return Object.keys(state.wars ?? {})
    .map(warId => getWarPresentationForViewer(state, viewerId, warId))
    .filter((w): w is WarPresentation => w !== null)
    .sort((a, b) => b.startTurn - a.startTurn);
}
