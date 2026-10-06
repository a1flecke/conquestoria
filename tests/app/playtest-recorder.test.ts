// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { GameState } from '@/core/types';
import type { GameSession } from '@/app/ports';
import {
  PLAYTEST_FLAG_PARAM,
  createPlaytestRecorder,
  isPlaytestRecorderEnabled,
  withPlaytestEndTurn,
  type PlaytestRecorder,
} from '@/app/playtest-recorder';
import { buildCouncilAgenda } from '@/systems/council-system';
import { getIdleCityIds } from '@/systems/planning-system';
import { getUnmovedUnitsForEndTurn } from '@/systems/unit-lifecycle-system';
import { createUnit } from '@/systems/unit-lifecycle';
import { AI_A, HUMAN_A, HUMAN_B } from '../helpers/viewer-knowledge-fixtures';
import { twoCityWorld } from '../helpers/assessment-fixtures';
import { blockadeByMajorCiv } from '../helpers/blockade-fixture';

type TestSession = Pick<GameSession, 'getState' | 'subscribe'> & { publish(next: GameState): void };

function fakeSession(initial: GameState): TestSession {
  let state = initial;
  const listeners = new Set<(next: GameState) => void>();
  return {
    getState: () => state,
    subscribe: listener => { listeners.add(listener); return () => { listeners.delete(listener); }; },
    publish(next) {
      state = next;
      for (const listener of [...listeners]) listener(next);
    },
  };
}

const flush = (): Promise<void> => new Promise(resolve => setTimeout(resolve, 0));

/** A copy of `state` as it would look at `turn` with `seat` to play. */
function at(state: GameState, turn: number, seat: string): GameState {
  return { ...structuredClone(state), turn, currentPlayer: seat };
}

const PANEL_DOM_IDS = { 'tech-panel': 'tech', 'council-panel': 'council', 'city-panel': 'city' } as const;

describe('isPlaytestRecorderEnabled (#1244)', () => {
  it('is on only for an explicit ?playtest=1', () => {
    expect(PLAYTEST_FLAG_PARAM).toBe('playtest');
    expect(isPlaytestRecorderEnabled('?playtest=1')).toBe(true);
    expect(isPlaytestRecorderEnabled('?a=b&playtest=1')).toBe(true);
    for (const off of ['', '?', '?playtest', '?playtest=0', '?playtest=true', '?playtest=', '?Playtest=1', '?scenario=x']) {
      expect(isPlaytestRecorderEnabled(off), off).toBe(false);
    }
  });
});

describe('withPlaytestEndTurn (#1244)', () => {
  it('returns the very same object when there is no recorder (the flag-off path is unchanged)', () => {
    const turnFlow = { endTurn: vi.fn(async () => {}), other: 1 };

    expect(withPlaytestEndTurn(turnFlow, null)).toBe(turnFlow);
  });

  it('tells the recorder first, then runs the real endTurn with the same options, and keeps every other member', async () => {
    const order: string[] = [];
    const turnFlow = { endTurn: vi.fn(async (_options?: { allowUnmovedUnits?: boolean }) => { order.push('real'); }), keep: 'me' };
    const recorder = { onEndTurnRequested: vi.fn(() => { order.push('recorder'); }) };

    const wrapped = withPlaytestEndTurn(turnFlow, recorder);
    await wrapped.endTurn({ allowUnmovedUnits: true });

    expect(order).toEqual(['recorder', 'real']);
    expect(turnFlow.endTurn).toHaveBeenCalledWith({ allowUnmovedUnits: true });
    expect(wrapped.keep).toBe('me');
  });
});

describe('createPlaytestRecorder (#1244)', () => {
  let uiLayer: HTMLElement;
  let clockNow: number;
  let recorders: PlaytestRecorder[];

  const clock = { now: () => clockNow };
  const make = (session: TestSession): PlaytestRecorder => {
    const recorder = createPlaytestRecorder({ session, uiLayer, panelDomIds: () => PANEL_DOM_IDS, clock });
    recorders.push(recorder);
    return recorder;
  };

  beforeEach(() => {
    uiLayer = document.createElement('div');
    document.body.appendChild(uiLayer);
    clockNow = 1_000_000;
    recorders = [];
  });

  afterEach(() => {
    for (const recorder of recorders) recorder.dispose();
    uiLayer.remove();
  });

  it('records nothing until a publication reveals a human seat\'s turn', () => {
    const recorder = make(fakeSession(twoCityWorld(false)));

    expect(recorder.buildExport().games).toEqual([]);
  });

  it('times a turn with the injected clock, relative to the recorder start, up to the last end-turn request', () => {
    const base = twoCityWorld(false);
    const session = fakeSession(base);
    const recorder = make(session);

    clockNow += 250;
    session.publish(at(base, 1, HUMAN_A));
    clockNow += 4_000;
    recorder.onEndTurnRequested();
    clockNow += 1_000; // the player cancels the unmoved-units prompt and keeps playing
    recorder.onEndTurnRequested(); // ...and asks again later: the latest request wins
    clockNow += 500;
    session.publish(at(base, 2, HUMAN_A));

    const [row] = recorder.buildExport().games[0].seats[HUMAN_A].turns;
    expect(row.turn).toBe(1);
    expect(row.startedAtMs).toBe(250); // relative to the recorder, never an epoch time
    expect(row.durationMs).toBe(5_000);
    expect(row.endRequested).toBe(true);
    expect(row.closed).toBe(true);
  });

  it('marks a turn left without an end request as such, and shows the turn in progress as open', () => {
    const base = twoCityWorld(false);
    const session = fakeSession(base);
    const recorder = make(session);

    session.publish(at(base, 1, HUMAN_A));
    session.publish(at(base, 2, HUMAN_A));

    const turns = recorder.buildExport().games[0].seats[HUMAN_A].turns;
    expect(turns).toHaveLength(2);
    expect(turns[0]).toMatchObject({ turn: 1, closed: true, endRequested: false, durationMs: null });
    expect(turns[1]).toMatchObject({ turn: 2, closed: false, endRequested: false });
  });

  it('measures idle cities, idle units and gold at the moment of ending the turn, with the canonical predicates', () => {
    const base = twoCityWorld(false);
    const unit = createUnit('warrior', HUMAN_A, { q: 1, r: 1 }, { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 });
    base.units[unit.id] = unit;
    base.civilizations[HUMAN_A].units.push(unit.id);
    base.civilizations[HUMAN_A].gold = 137;
    const session = fakeSession(base);
    const recorder = make(session);
    session.publish(at(base, 4, HUMAN_A));

    recorder.onEndTurnRequested();
    session.publish(at(base, 5, HUMAN_A));

    const [row] = recorder.buildExport().games[0].seats[HUMAN_A].turns;
    expect(row.idleCitiesAtEnd).toBe(getIdleCityIds(base, HUMAN_A).length);
    expect(row.idleUnitsAtEnd).toBe(getUnmovedUnitsForEndTurn(base, HUMAN_A).length);
    expect(row.goldAtEnd).toBe(137);
    expect(row.idleCitiesAtEnd).toBeGreaterThan(0);
    expect(row.idleUnitsAtEnd).toBeGreaterThan(0);
  });

  it('counts panel opens by registry id, including repeats, and ignores unknown or nested elements', async () => {
    const base = twoCityWorld(false);
    const session = fakeSession(base);
    const recorder = make(session);
    session.publish(at(base, 1, HUMAN_A));

    for (const id of ['tech-panel', 'city-panel', 'tech-panel', 'not-a-registered-panel']) {
      const panel = document.createElement('div');
      panel.id = id;
      uiLayer.appendChild(panel);
    }
    const nested = document.createElement('div');
    nested.id = 'tech-panel';
    uiLayer.firstElementChild!.appendChild(nested); // not a direct child of the UI layer
    await flush();

    const row = recorder.buildExport().games[0].seats[HUMAN_A].turns[0];
    expect(row.panelOpens).toEqual({ tech: 2, city: 1 });
  });

  it('does not count a panel opened before any turn row exists', async () => {
    const base = twoCityWorld(false);
    const session = fakeSession(base);
    const recorder = make(session);

    const panel = document.createElement('div');
    panel.id = 'tech-panel';
    uiLayer.appendChild(panel);
    await flush();
    session.publish(at(base, 1, HUMAN_A));

    expect(recorder.buildExport().games[0].seats[HUMAN_A].turns[0].panelOpens).toEqual({});
  });

  it('counts the Council cards shown and the actions taken, from the same agenda the player sees', async () => {
    const base = twoCityWorld(true); // a starving second city, so the Council has an actionable card
    const session = fakeSession(base);
    const recorder = make(session);
    session.publish(at(base, 1, HUMAN_A));

    const council = document.createElement('div');
    council.id = 'council-panel';
    const action = document.createElement('button');
    action.dataset.cardId = 'constraint-food';
    council.appendChild(action);
    uiLayer.appendChild(council);
    await flush();
    action.click();
    const stray = document.createElement('button');
    stray.dataset.cardId = 'constraint-food';
    uiLayer.appendChild(stray);
    stray.click(); // a card button outside the Council is not a Council action

    const agenda = buildCouncilAgenda(session.getState(), HUMAN_A);
    const cards = [...agenda.doNow, ...agenda.soon, ...agenda.toWin, ...agenda.drama];
    const row = recorder.buildExport().games[0].seats[HUMAN_A].turns[0];
    expect(row.council.cardsShown).toBe(cards.length);
    expect(row.council.cardsShownByBucket['do-now']).toBe(agenda.doNow.length);
    expect(row.council.constraintKindsShown).toContain('food');
    expect(row.council.actionsTaken).toEqual(['constraint-food']);
    expect(row.panelOpens.council).toBe(1);
  });

  it('records the constraints shown each turn and how many turns each took to clear', () => {
    const starving = twoCityWorld(true);
    const healthy = twoCityWorld(false);
    const session = fakeSession(starving);
    const recorder = make(session);

    session.publish(at(starving, 3, HUMAN_A));
    session.publish(at(starving, 4, HUMAN_A));
    session.publish(at(healthy, 6, HUMAN_A));

    const seat = recorder.buildExport().games[0].seats[HUMAN_A];
    expect(seat.turns.map(row => row.constraintsShown.includes('food'))).toEqual([true, true, false]);
    expect(seat.constraintLifetimes).toEqual([
      { kind: 'food', firstSeenTurn: 3, resolvedTurn: 6, turnsToResolve: 3 },
    ]);
  });

  it('tracks a blockade through the generic constraint path, with no blockade-specific field (#1355)', () => {
    const calm = twoCityWorld(false);
    const blockaded = twoCityWorld(false);
    blockadeByMajorCiv(blockaded, 'city-b-second');
    const session = fakeSession(calm);
    const recorder = make(session);

    session.publish(at(blockaded, 3, HUMAN_A));
    session.publish(at(calm, 5, HUMAN_A));

    const seat = recorder.buildExport().games[0].seats[HUMAN_A];
    expect(seat.turns[0].constraintsShown).toContain('blockade');
    expect(seat.constraintLifetimes).toEqual([{ kind: 'blockade', firstSeenTurn: 3, resolvedTurn: 5, turnsToResolve: 2 }]);
    expect(JSON.stringify(recorder.buildExport())).not.toMatch(/blockadeLifetimes|blockadeShown/);
  });

  it('keeps a still-present constraint open in the export (no resolution yet)', () => {
    const starving = twoCityWorld(true);
    const session = fakeSession(starving);
    const recorder = make(session);
    session.publish(at(starving, 3, HUMAN_A));

    expect(recorder.buildExport().games[0].seats[HUMAN_A].constraintLifetimes).toEqual([
      { kind: 'food', firstSeenTurn: 3, resolvedTurn: null, turnsToResolve: null },
    ]);
  });

  it('records a useful victory-lane change, but never counts what predates recording as a change', () => {
    const before = twoCityWorld(false);
    before.civilizations[HUMAN_A].techState.completed.push('space-exploration');
    const after = structuredClone(before);
    after.builtNationalProjects = {
      [`${HUMAN_A}:space_program_initiative`]: { civId: HUMAN_A, buildingId: 'space_program_initiative', cityId: 'city-a-first', builtEra: 11 } as never,
    };
    const session = fakeSession(before);
    const recorder = make(session);

    session.publish(at(before, 1, HUMAN_A));
    session.publish(at(after, 2, HUMAN_A));

    const turns = recorder.buildExport().games[0].seats[HUMAN_A].turns;
    expect(turns[0].victoryChanges).toEqual([]);
    expect(turns[1].victoryChanges).toEqual([{ id: 'world-race-first-satellite', from: 'not-started', to: 'building' }]);
  });

  it('counts the notifications that arrive for a seat, by type, and excludes what predates recording', () => {
    const base = twoCityWorld(false);
    const entry = (id: string, type: 'info' | 'success' | 'warning') => ({ id, message: id, type, turn: 1, read: false });
    base.notificationLog = { [HUMAN_A]: [entry('old-1', 'info')] };
    const session = fakeSession(base);
    const recorder = make(session);

    session.publish(at(base, 1, HUMAN_A)); // old-1 predates recording: a baseline, not "this turn"
    const next = at(base, 2, HUMAN_A);
    next.notificationLog = { [HUMAN_A]: [entry('old-1', 'info'), entry('n-2', 'warning'), entry('n-3', 'warning'), entry('n-4', 'success')] };
    session.publish(next); // the round brought three new ones
    const later = at(next, 2, HUMAN_A);
    later.notificationLog = { [HUMAN_A]: [...next.notificationLog[HUMAN_A], entry('n-5', 'info')] };
    session.publish(later); // and one more during the turn
    session.publish(at(later, 3, HUMAN_A));

    const turns = recorder.buildExport().games[0].seats[HUMAN_A].turns;
    expect(turns[0].notifications).toEqual({ total: 0, byType: { info: 0, success: 0, warning: 0 } });
    expect(turns[1].notifications).toEqual({ total: 4, byType: { info: 1, success: 1, warning: 2 } });
  });

  it('keeps hot-seat seats apart: panels, end requests and notifications go to the seat that was current', async () => {
    const base = twoCityWorld(false);
    base.notificationLog = { [HUMAN_A]: [], [HUMAN_B]: [] };
    const session = fakeSession(base);
    const recorder = make(session);

    session.publish(at(base, 1, HUMAN_A));
    clockNow += 1_000;
    recorder.onEndTurnRequested(); // Alice ends
    session.publish(at(base, 1, HUMAN_B)); // handoff reveals Bob's turn
    const panel = document.createElement('div');
    panel.id = 'tech-panel';
    uiLayer.appendChild(panel);
    await flush();
    clockNow += 2_000;
    recorder.onEndTurnRequested(); // Bob ends
    session.publish(at(base, 2, HUMAN_A));

    const games = recorder.buildExport().games;
    expect(games).toHaveLength(1);
    const { seats } = games[0];
    expect(Object.keys(seats).sort()).toEqual([HUMAN_A, HUMAN_B]);
    expect(seats[HUMAN_A].turns.map(row => row.turn)).toEqual([1, 2]);
    expect(seats[HUMAN_A].turns[0].panelOpens).toEqual({});
    expect(seats[HUMAN_A].turns[0].durationMs).toBe(1_000);
    expect(seats[HUMAN_B].turns).toHaveLength(1);
    expect(seats[HUMAN_B].turns[0].panelOpens).toEqual({ tech: 1 });
    expect(seats[HUMAN_B].turns[0].durationMs).toBe(2_000);
  });

  it('ignores a publication whose current player is not a human seat', () => {
    const base = twoCityWorld(false);
    const session = fakeSession(base);
    const recorder = make(session);

    session.publish(at(base, 1, AI_A));

    expect(recorder.buildExport().games).toEqual([]);
  });

  it('starts a separate game log when the campaign changes', () => {
    const first = twoCityWorld(false);
    const second = { ...structuredClone(first), gameId: 'another-campaign' };
    const session = fakeSession(first);
    const recorder = make(session);

    session.publish(at(first, 1, HUMAN_A));
    session.publish(at(second, 1, HUMAN_A));

    const games = recorder.buildExport().games;
    expect(games.map(game => game.gameId)).toEqual([first.gameId, 'another-campaign']);
    expect(games[0].seats[HUMAN_A].turns[0].closed).toBe(true);
    expect(games[1].seats[HUMAN_A].turns[0].closed).toBe(false);
  });

  it('is an observer: it never changes the state it reads, and its session port has no way to write', () => {
    const base = twoCityWorld(true);
    const session = fakeSession(base);
    const snapshot = JSON.stringify(base);
    const recorder = make(session);

    session.publish(at(base, 1, HUMAN_A));
    recorder.onEndTurnRequested();
    recorder.exportText();

    expect(JSON.stringify(base)).toBe(snapshot);
    expect(Object.keys(session).sort()).toEqual(['getState', 'publish', 'subscribe']);
    expect(JSON.stringify(session.getState())).not.toMatch(/playtest/i);
  });

  it('exports a pinned, local-only JSON schema: relative times, seat ids, no names or account identifiers', () => {
    const base = twoCityWorld(false);
    base.civilizations[HUMAN_A].name = 'A Real Persons Name';
    const session = fakeSession(base);
    const recorder = make(session);
    session.publish(at(base, 1, HUMAN_A));

    const text = recorder.exportText();
    const parsed = JSON.parse(text);

    expect(parsed).toMatchObject({ schema: 'conquestoria-playtest-log', schemaVersion: 1 });
    expect(parsed.note).toContain('Local only');
    expect(Object.keys(parsed).sort()).toEqual(['games', 'note', 'schema', 'schemaVersion']);
    expect(Object.keys(parsed.games[0].seats[HUMAN_A].turns[0]).sort()).toEqual([
      'closed', 'council', 'constraintsShown', 'durationMs', 'endRequested', 'goldAtEnd', 'idleCitiesAtEnd',
      'idleUnitsAtEnd', 'notifications', 'panelOpens', 'startedAtMs', 'turn', 'victoryChanges',
    ].sort());
    expect(text).not.toContain('A Real Persons Name');
    expect(text.endsWith('\n')).toBe(true);
  });

  it('stops observing after dispose', async () => {
    const base = twoCityWorld(false);
    const session = fakeSession(base);
    const recorder = make(session);
    session.publish(at(base, 1, HUMAN_A));

    recorder.dispose();
    session.publish(at(base, 2, HUMAN_A));
    const panel = document.createElement('div');
    panel.id = 'tech-panel';
    uiLayer.appendChild(panel);
    await flush();

    const turns = recorder.buildExport().games[0].seats[HUMAN_A].turns;
    expect(turns).toHaveLength(1);
    expect(turns[0].panelOpens).toEqual({});
  });
});
