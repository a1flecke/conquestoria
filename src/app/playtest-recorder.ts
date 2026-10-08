// #1244: a local-only playtest recorder. A human tester turns it on with `?playtest=1`, plays
// normally, and exports a JSON log of how much of each turn was strategy and how much was
// administrative churn.
//
// It is an OBSERVER and nothing else:
//   - it is constructed only when the flag is on (see `createAppComposition`); with the flag off no
//     recorder, observer, listener or button exists;
//   - it holds a read-only session port (`getState` + `subscribe`, never `commit`/`update`), so it
//     cannot publish or mutate game state, and no system module imports it (pinned by
//     `tests/app/architecture/rules.ts`);
//   - it adds no event and no field to `GameState` or any save; the log lives in memory and leaves
//     the machine only when the tester presses the export button (`getSaveFileAdapter().exportText`,
//     the same local file-save path the save panel uses). There is no network call, no account or
//     device identifier, and no timestamp that touches simulation state: durations come from an
//     injectable clock and are reported relative to the recorder's own start.
//
// One central seam per fact, rather than a call inside every controller:
//   - turn rows begin/end from session publication (a seat's turn begins at the publication that
//     reveals it, so hot-seat's silent adoption is correctly not a turn start);
//   - the moment of ending a turn is observed by decorating `turnFlow.endTurn` once at the
//     composition root (`withPlaytestEndTurn`), which covers the button, the unmoved-units
//     confirmation and every other caller;
//   - panel opens are seen as the panel's DOM appearing in the UI layer, matched against the panel
//     registry's DOM ids, so parameterized panels (city, wonder) are covered like the rest;
//   - Council cards and their actions come from the pure agenda builder and a delegated click on
//     the Council's card buttons;
//   - notifications come from the viewer's own persisted notification log;
//   - idle cities/units and gold come from the same predicates the end-turn prompt uses.
//
// Viewer privacy: each seat's rows contain only that seat's own facts (its own idle counts, gold,
// notification log and viewer-safe assessment). Hot seat keeps seats in separate logs.
import type { GameState } from '@/core/types';
import type { CouncilCard, StrategicConstraintKind, VictoryStage } from '@/core/types/council';
import type { NotificationEntry } from '@/core/notification-log';
import type { GameSession } from '@/app/ports';
import { buildCouncilAgenda } from '@/systems/council-system';
import { getIdleCityIds } from '@/systems/planning-system';
import { MAX_STRATEGIC_CONSTRAINTS, buildStrategicAssessment } from '@/systems/strategic-assessment';
import { getUnmovedUnitsForEndTurn } from '@/systems/unit-lifecycle-system';

export const PLAYTEST_FLAG_PARAM = 'playtest';

/** True only for an explicit `?playtest=1`. Anything else (absent, `0`, `true`) leaves the recorder off. */
export function isPlaytestRecorderEnabled(search: string): boolean {
  return new URLSearchParams(search).get(PLAYTEST_FLAG_PARAM) === '1';
}

export interface PlaytestClock {
  now(): number;
}

// --- Export schema (v1) -----------------------------------------------------------------------

export interface PlaytestTurnRow {
  turn: number;
  /** Milliseconds since the recorder started (never a wall-clock time). */
  startedAtMs: number;
  /** False for the turn still in progress when the log was exported. */
  closed: boolean;
  /** Whether the player asked to end this turn (false when the turn was left another way, e.g. a load). */
  endRequested: boolean;
  /** Turn start to the player's last end-turn request; null when no end was requested. */
  durationMs: number | null;
  panelOpens: Record<string, number>;
  idleCitiesAtEnd: number;
  idleUnitsAtEnd: number;
  goldAtEnd: number;
  notifications: { total: number; byType: Record<NotificationEntry['type'], number> };
  council: {
    cardsShown: number;
    cardsShownByBucket: Record<CouncilCard['bucket'], number>;
    /** Constraint kinds the Council put in front of the player when it was opened. */
    constraintKindsShown: string[];
    /** Card ids whose action button the player pressed. */
    actionsTaken: string[];
  };
  /** Constraint kinds present in the seat's strategic assessment at turn start. */
  constraintsShown: StrategicConstraintKind[];
  /** Victory lanes whose stage changed since the seat's previous turn start. */
  victoryChanges: Array<{ id: string; from: VictoryStage | null; to: VictoryStage }>;
}

export interface PlaytestConstraintLifetime {
  kind: StrategicConstraintKind;
  firstSeenTurn: number;
  /** Null while the constraint is still present at the last turn start recorded. */
  resolvedTurn: number | null;
  turnsToResolve: number | null;
}

export interface PlaytestSeatLog {
  turns: PlaytestTurnRow[];
  constraintLifetimes: PlaytestConstraintLifetime[];
}

export interface PlaytestExport {
  schema: 'conquestoria-playtest-log';
  schemaVersion: 1;
  note: string;
  games: Array<{ gameId: string; seats: Record<string, PlaytestSeatLog> }>;
}

export interface PlaytestRecorder {
  /** Called once per end-turn request, before the turn flow runs. The latest request in a turn wins. */
  onEndTurnRequested(): void;
  buildExport(): PlaytestExport;
  /** The export as pretty-printed JSON text. */
  exportText(): string;
  dispose(): void;
}

export interface PlaytestRecorderDeps {
  /** Read-only: the recorder can never publish or change game state. */
  readonly session: Pick<GameSession, 'getState' | 'subscribe'>;
  readonly uiLayer: HTMLElement;
  /** DOM id -> panel id, from the panel registry. Read lazily, on the first mutation. */
  readonly panelDomIds: () => Readonly<Record<string, string>>;
  readonly clock?: PlaytestClock;
}

const EXPORT_NOTE = 'Local only. Never uploaded. Per-seat gameplay metrics; no account or device identifiers.';

const EMPTY_BUCKETS = (): Record<CouncilCard['bucket'], number> => ({ 'do-now': 0, soon: 0, 'to-win': 0, drama: 0 });
const EMPTY_NOTIFICATION_TYPES = (): Record<NotificationEntry['type'], number> => ({ info: 0, success: 0, warning: 0 });

interface EndRequest {
  atMs: number;
  idleCities: number;
  idleUnits: number;
  gold: number;
}

interface OpenRow {
  seat: string;
  turn: number;
  startedAtMs: number;
  panelOpens: Record<string, number>;
  notifications: { total: number; byType: Record<NotificationEntry['type'], number> };
  council: PlaytestTurnRow['council'];
  constraintsShown: StrategicConstraintKind[];
  victoryChanges: PlaytestTurnRow['victoryChanges'];
  endRequest?: EndRequest;
}

interface SeatMemory {
  turns: PlaytestTurnRow[];
  constraintLifetimes: PlaytestConstraintLifetime[];
  /** Constraint kind -> the turn it was first seen, while it is still present. */
  constraintFirstSeen: Map<StrategicConstraintKind, number>;
  lastVictoryStage: Map<string, VictoryStage>;
  seenNotificationIds: Set<string>;
  /** False until the seat's first row: what predates recording is a baseline, not "this turn". */
  hasBaseline: boolean;
}

interface GameRecording {
  gameId: string;
  seats: Map<string, SeatMemory>;
}

function snapshotOf(state: GameState, seat: string): { idleCities: number; idleUnits: number; gold: number } {
  return {
    idleCities: getIdleCityIds(state, seat).length,
    idleUnits: getUnmovedUnitsForEndTurn(state, seat).length,
    gold: state.civilizations[seat]?.gold ?? 0,
  };
}

export function createPlaytestRecorder(deps: PlaytestRecorderDeps): PlaytestRecorder {
  const { session, uiLayer } = deps;
  const clock: PlaytestClock = deps.clock ?? { now: () => performance.now() };
  const startedAt = clock.now();
  const sinceStart = (): number => Math.round(clock.now() - startedAt);

  const games: GameRecording[] = [];
  let current: GameRecording | undefined;
  let openRow: OpenRow | undefined;
  let lastState: GameState | undefined;
  let panelIdByDomId: Readonly<Record<string, string>> | undefined;

  function seatMemory(recording: GameRecording, seat: string): SeatMemory {
    let memory = recording.seats.get(seat);
    if (!memory) {
      memory = {
        turns: [],
        constraintLifetimes: [],
        constraintFirstSeen: new Map(),
        lastVictoryStage: new Map(),
        seenNotificationIds: new Set(),
        hasBaseline: false,
      };
      recording.seats.set(seat, memory);
    }
    return memory;
  }

  function finalizeRow(row: OpenRow, closed: boolean, state: GameState | undefined): PlaytestTurnRow {
    // The end-turn request is the truest "state at end turn"; without one, the last state the seat saw.
    const metrics = row.endRequest
      ?? (state ? { atMs: sinceStart(), ...snapshotOf(state, row.seat) } : { atMs: sinceStart(), idleCities: 0, idleUnits: 0, gold: 0 });
    return {
      turn: row.turn,
      startedAtMs: row.startedAtMs,
      closed,
      endRequested: row.endRequest !== undefined,
      durationMs: row.endRequest ? row.endRequest.atMs - row.startedAtMs : null,
      panelOpens: { ...row.panelOpens },
      idleCitiesAtEnd: metrics.idleCities,
      idleUnitsAtEnd: metrics.idleUnits,
      goldAtEnd: metrics.gold,
      notifications: { total: row.notifications.total, byType: { ...row.notifications.byType } },
      council: {
        cardsShown: row.council.cardsShown,
        cardsShownByBucket: { ...row.council.cardsShownByBucket },
        constraintKindsShown: [...row.council.constraintKindsShown],
        actionsTaken: [...row.council.actionsTaken],
      },
      constraintsShown: [...row.constraintsShown],
      victoryChanges: row.victoryChanges.map(change => ({ ...change })),
    };
  }

  function closeOpenRow(): void {
    if (!openRow || !current) return;
    const memory = seatMemory(current, openRow.seat);
    memory.turns.push(finalizeRow(openRow, true, lastState));
    openRow = undefined;
  }

  function ingestNotifications(state: GameState, memory: SeatMemory, seat: string, row: OpenRow | undefined): void {
    for (const entry of state.notificationLog?.[seat] ?? []) {
      if (memory.seenNotificationIds.has(entry.id)) continue;
      memory.seenNotificationIds.add(entry.id);
      if (row && memory.hasBaseline) {
        row.notifications.total += 1;
        row.notifications.byType[entry.type] += 1;
      }
    }
  }

  function beginRow(state: GameState, recording: GameRecording, seat: string): OpenRow {
    const memory = seatMemory(recording, seat);
    const row: OpenRow = {
      seat,
      turn: state.turn,
      startedAtMs: sinceStart(),
      panelOpens: {},
      notifications: { total: 0, byType: EMPTY_NOTIFICATION_TYPES() },
      council: { cardsShown: 0, cardsShownByBucket: EMPTY_BUCKETS(), constraintKindsShown: [], actionsTaken: [] },
      constraintsShown: [],
      victoryChanges: [],
    };

    const assessment = buildStrategicAssessment(state, seat);
    row.constraintsShown = assessment.constraints.map(constraint => constraint.kind);

    const present = new Set(row.constraintsShown);
    for (const kind of present) {
      if (!memory.constraintFirstSeen.has(kind)) memory.constraintFirstSeen.set(kind, state.turn);
    }
    // A constraint missing from a full set may merely have been displaced by the cap, not resolved.
    if (assessment.constraints.length < MAX_STRATEGIC_CONSTRAINTS) {
      for (const [kind, firstSeenTurn] of [...memory.constraintFirstSeen]) {
        if (present.has(kind)) continue;
        memory.constraintLifetimes.push({ kind, firstSeenTurn, resolvedTurn: state.turn, turnsToResolve: state.turn - firstSeenTurn });
        memory.constraintFirstSeen.delete(kind);
      }
    }

    for (const lane of assessment.victory) {
      const before = memory.lastVictoryStage.get(lane.id);
      if (memory.hasBaseline && (before === undefined ? lane.stage !== 'not-started' : before !== lane.stage)) {
        row.victoryChanges.push({ id: lane.id, from: before ?? null, to: lane.stage });
      }
      memory.lastVictoryStage.set(lane.id, lane.stage);
    }

    ingestNotifications(state, memory, seat, row);
    memory.hasBaseline = true;
    return row;
  }

  function onState(state: GameState): void {
    lastState = state;
    const seat = state.currentPlayer;
    if (!state.civilizations[seat]?.isHuman) return;

    const gameId = state.gameId ?? 'unidentified-game';
    let recording = current;
    if (!recording || recording.gameId !== gameId) {
      closeOpenRow();
      recording = { gameId, seats: new Map() };
      current = recording;
      games.push(recording);
    }

    if (!openRow || openRow.seat !== seat || openRow.turn !== state.turn) {
      closeOpenRow();
      openRow = beginRow(state, recording, seat);
      return;
    }
    ingestNotifications(state, seatMemory(recording, seat), seat, openRow);
  }

  function recordPanelOpen(panelId: string): void {
    if (!openRow) return;
    openRow.panelOpens[panelId] = (openRow.panelOpens[panelId] ?? 0) + 1;
    if (panelId !== 'council' || !lastState) return;
    const state = session.getState();
    const agenda = buildCouncilAgenda(state, state.currentPlayer);
    const cards = [...agenda.doNow, ...agenda.soon, ...agenda.toWin, ...agenda.drama];
    openRow.council.cardsShown += cards.length;
    for (const card of cards) {
      openRow.council.cardsShownByBucket[card.bucket] += 1;
      if (card.id.startsWith('constraint-')) openRow.council.constraintKindsShown.push(card.id.slice('constraint-'.length));
    }
  }

  const observer = new MutationObserver(mutations => {
    panelIdByDomId ??= deps.panelDomIds();
    for (const mutation of mutations) {
      for (const node of Array.from(mutation.addedNodes)) {
        if (!(node instanceof Element) || !node.id) continue;
        const panelId = panelIdByDomId[node.id];
        if (panelId) recordPanelOpen(panelId);
      }
    }
  });
  observer.observe(uiLayer, { childList: true });

  const onClick = (event: Event): void => {
    if (!openRow || !(event.target instanceof Element)) return;
    const button = event.target.closest('#council-panel button[data-card-id]');
    const cardId = button instanceof HTMLElement ? button.dataset.cardId : undefined;
    if (cardId) openRow.council.actionsTaken.push(cardId);
  };
  uiLayer.addEventListener('click', onClick, true);

  const unsubscribe = session.subscribe(onState);

  function buildExport(): PlaytestExport {
    return {
      schema: 'conquestoria-playtest-log',
      schemaVersion: 1,
      note: EXPORT_NOTE,
      games: games.map(recording => {
        const seats: Record<string, PlaytestSeatLog> = {};
        for (const [seat, memory] of recording.seats) {
          const turns = [...memory.turns];
          const isOpenSeat = openRow !== undefined && recording === current && openRow.seat === seat;
          if (isOpenSeat && openRow) turns.push(finalizeRow(openRow, false, lastState));
          const stillOpen: PlaytestConstraintLifetime[] = [...memory.constraintFirstSeen].map(([kind, firstSeenTurn]) => ({
            kind, firstSeenTurn, resolvedTurn: null, turnsToResolve: null,
          }));
          seats[seat] = { turns, constraintLifetimes: [...memory.constraintLifetimes, ...stillOpen] };
        }
        return { gameId: recording.gameId, seats };
      }),
    };
  }

  return {
    onEndTurnRequested(): void {
      if (!openRow) return;
      const state = session.getState();
      if (state.currentPlayer !== openRow.seat) return;
      openRow.endRequest = { atMs: sinceStart(), ...snapshotOf(state, openRow.seat) };
    },
    buildExport,
    exportText: () => `${JSON.stringify(buildExport(), null, 2)}\n`,
    dispose(): void {
      unsubscribe();
      observer.disconnect();
      uiLayer.removeEventListener('click', onClick, true);
    },
  };
}

/**
 * Decorates `turnFlow.endTurn` so every way of ending a turn (the button, the unmoved-units
 * confirmation, any future caller) tells the recorder first. With no recorder it returns the very
 * same object, so the flag-off path is unchanged.
 */
export function withPlaytestEndTurn<T extends { endTurn(options?: { allowUnmovedUnits?: boolean }): Promise<void> }>(
  turnFlow: T,
  recorder: Pick<PlaytestRecorder, 'onEndTurnRequested'> | null,
): T {
  if (!recorder) return turnFlow;
  return {
    ...turnFlow,
    endTurn: options => {
      recorder.onEndTurnRequested();
      return turnFlow.endTurn(options);
    },
  };
}
