import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';

// #1363: the playtest report turns #1244 exports into deterministic evidence, from fixture logs only.
const ROOT = resolve(process.cwd());
const SCRIPT = resolve(ROOT, 'scripts/playtest-report.mjs');
const dirs: string[] = [];
afterEach(() => { while (dirs.length) rmSync(dirs.pop()!, { recursive: true, force: true }); });

interface Row {
  turn: number; startedAtMs: number; closed: boolean; endRequested: boolean; durationMs: number | null;
  panelOpens: Record<string, number>; idleCitiesAtEnd: number; idleUnitsAtEnd: number; goldAtEnd: number;
  notifications: { total: number; byType: { info: number; success: number; warning: number } };
  council: { cardsShown: number; cardsShownByBucket: Record<string, number>; constraintKindsShown: string[]; actionsTaken: string[] };
  constraintsShown: string[]; victoryChanges: Array<{ id: string; from: string | null; to: string }>;
}

const row = (turn: number, over: Partial<Row> = {}): Row => ({
  turn, startedAtMs: turn * 1000, closed: true, endRequested: true, durationMs: 1000,
  panelOpens: {}, idleCitiesAtEnd: 0, idleUnitsAtEnd: 0, goldAtEnd: 10,
  notifications: { total: 0, byType: { info: 0, success: 0, warning: 0 } },
  council: { cardsShown: 0, cardsShownByBucket: { 'do-now': 0, soon: 0, 'to-win': 0, drama: 0 }, constraintKindsShown: [], actionsTaken: [] },
  constraintsShown: [], victoryChanges: [], ...over,
});

const log = (turns: Row[], lifetimes: unknown[] = [], gameId = 'g1', seat = 'player', schemaVersion: unknown = 1) => ({
  schema: 'conquestoria-playtest-log', schemaVersion, note: 'x',
  games: [{ gameId, seats: { [seat]: { turns, constraintLifetimes: lifetimes } } }],
});

function files(...logs: unknown[]): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'playtest-report-'));
  dirs.push(dir);
  return logs.map((value, index) => {
    const path = join(dir, `log-${index}.json`);
    writeFileSync(path, typeof value === 'string' ? value : JSON.stringify(value));
    return path;
  });
}

function run(paths: string[], ...extra: string[]) {
  return spawnSync(process.execPath, [SCRIPT, ...paths, ...extra], { cwd: ROOT, encoding: 'utf8' });
}
function report(paths: string[]) {
  const result = run(paths, '--format', 'json');
  expect(result.status, result.stderr).toBe(0);
  return JSON.parse(result.stdout);
}

describe('single session shape (#1363)', () => {
  const turns = [1000, 2000, 3000, 4000, 10000].map((ms, i) => row(i + 1, {
    durationMs: ms, notifications: { total: i, byType: { info: i, success: 0, warning: 0 } },
  }));

  it('reports turns, seats, median, p90, max, the longest turn and notifications', () => {
    const { combined } = report(files(log(turns)));
    expect(combined.shape.turnsRecorded).toBe(5);
    expect(combined.shape.seats).toEqual(['player']);
    expect(combined.shape.durations).toEqual({ measuredTurns: 5, medianMs: 3000, p90Ms: 10000, maxMs: 10000 });
    expect(combined.shape.longestTurns[0]).toMatchObject({ seat: 'player', turn: 5, durationMs: 10000 });
    expect(combined.shape.notifications).toMatchObject({ total: 10, averagePerTurn: 2 });
  });

  it('averages the two middle values for an even count and handles an open turn (null duration)', () => {
    const even = [row(1, { durationMs: 1000 }), row(2, { durationMs: 3000 }), row(3, { durationMs: null, closed: false, endRequested: false })];
    const { combined } = report(files(log(even)));
    expect(combined.shape.durations).toMatchObject({ measuredTurns: 2, medianMs: 2000 });
    expect(combined.shape.closedTurns).toBe(2);
  });
});

describe('multiple sessions (#1363)', () => {
  const a = log([row(1, { durationMs: 1000 }), row(2, { durationMs: 2000 })], [], 'g-a');
  const b = log([row(1, { durationMs: 9000 })], [], 'g-b', 'player-1');

  it('combines them, labels each by content hash, and does not depend on argument order', () => {
    const forward = run(files(a, b), '--format', 'json').stdout;
    const reversed = run(files(b, a), '--format', 'json').stdout;
    expect(reversed).toBe(forward);
    const out = JSON.parse(forward);
    expect(out.combined.sessionCount).toBe(2);
    expect(out.combined.shape.turnsRecorded).toBe(3);
    expect(out.combined.shape.seats).toEqual(['player', 'player-1']);
    expect(out.combined.shape.durations.maxMs).toBe(9000);
    expect(out.sessions.map((s: { id: string }) => s.id)).toEqual(out.sessions.map((s: { id: string }) => s.id).sort());
    expect(out.sessions[0].id).toMatch(/^s-[0-9a-f]{8}$/);
  });
});

describe('empty, short and unsupported input (#1363)', () => {
  it('a log with no games is a valid, empty report', () => {
    const out = report(files({ schema: 'conquestoria-playtest-log', schemaVersion: 1, note: '', games: [] }));
    expect(out.combined.shape).toMatchObject({ turnsRecorded: 0, durations: { measuredTurns: 0, medianMs: null, p90Ms: null, maxMs: null } });
    const md = run(files({ schema: 'conquestoria-playtest-log', schemaVersion: 1, note: '', games: [] })).stdout;
    expect(md).toContain('0 turns recorded');
  });

  it('a one-turn session does not invent statistics', () => {
    const out = report(files(log([row(1)])));
    expect(out.combined.churn.highChurnTurns.turns).toEqual([]);
    expect(out.combined.economy.trend).toBeNull();
    expect(out.combined.direction.victoryLaneTransitions).toEqual([]);
  });

  it.each([
    ['an unsupported schema version', log([row(1)], [], 'g', 'player', 2), 'unsupported schemaVersion'],
    ['a different export', { schema: 'something-else', schemaVersion: 1, games: [] }, 'not a conquestoria-playtest-log export'],
    ['malformed JSON', '{ not json', 'not valid JSON'],
    ['a row missing a required field', { ...log([row(1)]), games: [{ gameId: 'g', seats: { player: { turns: [{ turn: 1 }], constraintLifetimes: [] } } }] }, 'has no numeric'],
    ['games that is not an array', { schema: 'conquestoria-playtest-log', schemaVersion: 1, games: {} }, '"games" must be an array'],
  ])('rejects %s with a clear message and no report', (_name, input, message) => {
    const result = run(files(input));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(message);
    expect(result.stdout).toBe('');
  });

  it('reports a missing file and missing arguments as errors', () => {
    expect(run(['/no/such/log.json']).status).toBe(2);
    expect(run([]).status).toBe(2);
    expect(run(files(log([row(1)])), '--format', 'xml').status).toBe(2);
  });
});

describe('churn, idleness and council evidence (#1363)', () => {
  it('aggregates panel opens, reopen counts and ranks panels with a stable tie-break', () => {
    const turns = [
      row(1, { panelOpens: { council: 3, city: 1 } }),
      row(2, { panelOpens: { council: 1, tech: 3 } }),
    ];
    const { combined } = report(files(log(turns)));
    expect(combined.churn.panelOpens.total).toBe(8);
    expect(combined.churn.panelOpens.byPanel.map((p: { panel: string; opens: number }) => [p.panel, p.opens])).toEqual([['council', 4], ['tech', 3], ['city', 1]]);
    // council reopened twice on turn 1, tech twice on turn 2: equal reopens break by name.
    expect(combined.churn.mostReopenedPanels.map((p: { panel: string; reopens: number }) => [p.panel, p.reopens])).toEqual([['council', 2], ['tech', 2]]);
  });

  it('flags an unusually churny turn only with enough turns, and says why otherwise', () => {
    const quiet = Array.from({ length: 9 }, (_, i) => row(i + 1, { panelOpens: { city: 1 } }));
    quiet.push(row(10, { panelOpens: { city: 12 } }));
    const flagged = report(files(log(quiet))).combined.churn.highChurnTurns;
    expect(flagged.turns).toEqual([expect.objectContaining({ turn: 10, panelOpens: 12 })]);
    const few = report(files(log(quiet.slice(5)))).combined.churn.highChurnTurns;
    expect(few.turns).toEqual([]);
    expect(few.rule).toContain('at least 8 turns');
  });

  it('measures idleness at end turn and finds repeated stretches', () => {
    const turns = [
      row(1, { idleUnitsAtEnd: 2 }), row(2, { idleCitiesAtEnd: 1 }), row(3, { idleUnitsAtEnd: 1 }), row(4, { idleUnitsAtEnd: 4 }),
      row(5), row(6, { idleUnitsAtEnd: 1 }), row(7, { idleUnitsAtEnd: 1 }),
    ];
    const idle = report(files(log(turns))).combined.churn.idleAtEnd;
    expect(idle.turnsEndedWithIdle).toBe(6);
    expect(idle.maxIdleUnits).toBe(4);
    expect(idle.repeatedIdleStretches).toEqual([{ seat: 'player', game: 'g1', fromTurn: 1, toTurn: 4, turns: 4 }]);
  });

  it('computes the Council action rate and states that a by-bucket rate is not available', () => {
    const turns = [
      row(1, { constraintsShown: ['food'], council: { cardsShown: 4, cardsShownByBucket: { 'do-now': 1, soon: 1, 'to-win': 1, drama: 1 }, constraintKindsShown: ['food'], actionsTaken: ['constraint-food'] } }),
      row(2, { constraintsShown: ['food', 'gold'], council: { cardsShown: 6, cardsShownByBucket: { 'do-now': 2, soon: 2, 'to-win': 1, drama: 1 }, constraintKindsShown: ['food'], actionsTaken: ['constraint-gold', 'wonder-x'] } }),
      row(3, { constraintsShown: ['food'] }),
    ];
    const { council } = report(files(log(turns))).combined;
    expect(council.cardsShown).toBe(10);
    expect(council.actionButtonUses).toBe(3);
    expect(council.actionRate).toBe(30);
    expect(council.cardsShownByBucket).toEqual({ 'do-now': 3, soon: 3, 'to-win': 2, drama: 2 });
    expect(council.actionRateByBucket.supported).toBe(false);
    expect(council.constraints[0]).toEqual({ kind: 'food', turnsAsConstraint: 3, turnsCouncilShowedIt: 2, actionButtonUses: 1 });
    expect(council.constraints[1]).toMatchObject({ kind: 'gold', turnsAsConstraint: 1, actionButtonUses: 1 });
    const md = run(files(log(turns))).stdout;
    expect(md).toContain('food was a strategic constraint on 3 turns; the Council showed it on 2; its action button was used 1 time.');
  });

  it('computes constraint lifetimes, open constraints and only provable recurrence', () => {
    const turns = [row(3), row(4), row(5), row(6), row(7), row(8), row(9), row(10)];
    const lifetimes = [
      { kind: 'food', firstSeenTurn: 3, resolvedTurn: 6, turnsToResolve: 3 },
      { kind: 'food', firstSeenTurn: 8, resolvedTurn: null, turnsToResolve: null },
      { kind: 'unrest', firstSeenTurn: 4, resolvedTurn: 10, turnsToResolve: 6 },
      { kind: 'gold', firstSeenTurn: 9, resolvedTurn: null, turnsToResolve: null },
    ];
    const { council } = report(files(log(turns, lifetimes))).combined;
    expect(council.longestResolvedConstraints.map((c: { kind: string; turnsToResolve: number }) => [c.kind, c.turnsToResolve])).toEqual([['unrest', 6], ['food', 3]]);
    expect(council.longestStillOpenConstraints.map((c: { kind: string; turnsObserved: number }) => [c.kind, c.turnsObserved])).toEqual([['food', 2], ['gold', 1]]);
    expect(council.recurringConstraints).toEqual([{ seat: 'player', game: 'g1', kind: 'food', occurrences: 2 }]);
  });
});

describe('strategic direction and economy (#1363)', () => {
  it('lists victory-lane transitions and the longest stretch without movement', () => {
    const turns = Array.from({ length: 12 }, (_, i) => row(i + 1));
    turns[1] = row(2, { victoryChanges: [{ id: 'domination', from: null, to: 'building' }] });
    turns[10] = row(11, { victoryChanges: [{ id: 'world-race-x', from: 'building', to: 'leading' }] });
    const { direction } = report(files(log(turns))).combined;
    expect(direction.victoryLaneTransitions).toEqual([
      { seat: 'player', game: 'g1', turn: 2, lane: 'domination', from: null, to: 'building' },
      { seat: 'player', game: 'g1', turn: 11, lane: 'world-race-x', from: 'building', to: 'leading' },
    ]);
    expect(direction.longestStretchWithoutVictoryMovement).toEqual({ seat: 'player', game: 'g1', turns: 8, fromTurn: 3, toTurn: 10 });
  });

  it('covers the whole log when nothing ever moved', () => {
    const { direction } = report(files(log([row(1), row(2), row(3)]))).combined;
    expect(direction.victoryLaneTransitions).toEqual([]);
    expect(direction.longestStretchWithoutVictoryMovement).toMatchObject({ turns: 3, fromTurn: 1, toTurn: 3 });
  });

  it('summarises gold and surfaces only outliers and a trend the data supports', () => {
    const gold = [10, 10, 12, 10, 11, 12, 10, 90, 13];
    const { economy } = report(files(log(gold.map((g, i) => row(i + 1, { goldAtEnd: g }))))).combined;
    expect(economy.goldAtEnd).toMatchObject({ measuredTurns: 9, min: 10, median: 11, max: 90 });
    expect(economy.trend).toMatchObject({ measuredTurns: 9, firstThirdAverage: 10.7, lastThirdAverage: 37.7 });
    expect(economy.outliers).toEqual([{ seat: 'player', game: 'g1', turn: 8, goldAtEnd: 90 }]);
  });
});

describe('deterministic, local, evidence-only output (#1363)', () => {
  const sample = () => files(
    log([row(1, { durationMs: 5000, panelOpens: { council: 2 } }), row(2, { idleUnitsAtEnd: 1, goldAtEnd: 40 })], [{ kind: 'food', firstSeenTurn: 1, resolvedTurn: 2, turnsToResolve: 1 }]),
  );

  it('produces byte-identical output for the same input, in both formats', () => {
    const paths = sample();
    for (const format of ['json', 'markdown']) {
      expect(run(paths, '--format', format).stdout).toBe(run(paths, '--format', format).stdout);
    }
  });

  it('contains no timestamp, host path or file name', () => {
    const paths = sample();
    const text = run(paths, '--format', 'json').stdout + run(paths).stdout;
    expect(text).not.toContain(tmpdir());
    expect(text).not.toContain('log-0');
    expect(text).not.toMatch(/\d{4}-\d{2}-\d{2}T\d{2}:/);
    expect(text).not.toMatch(/\/Users\/|\/home\/|C:\\\\/);
  });

  it('writes the same text to --out as it prints', () => {
    const paths = sample();
    const out = join(dirs[0], 'report.md');
    expect(run(paths, '--out', out).status).toBe(0);
    expect(readFileSync(out, 'utf8')).toBe(run(paths).stdout);
  });

  it('states observations only: no design verdict wording', () => {
    const md = run(sample()).stdout;
    expect(md).toContain('no design judgement is made');
    expect(md).not.toMatch(/\b(bad|broken|unfun|boring|poor|should|unbalanced|too slow|needs to)\b/i);
  });

  it('depends on no game state and makes no network call', () => {
    const source = readFileSync(SCRIPT, 'utf8');
    expect(source).not.toMatch(/from ['"][^'"]*\bsrc\//);
    expect(source).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|sendBeacon)\s*\(/);
    expect(source).not.toMatch(/node:(http|https|http2|net|dns|tls|dgram|child_process)/);
    expect(source).not.toMatch(/Date\.now|new Date|Math\.random/);
  });

  it('reads the schema the recorder writes: a recorder schema bump fails here until the report is updated', () => {
    const recorder = readFileSync(resolve(ROOT, 'src/app/playtest-recorder.ts'), 'utf8');
    const written = recorder.match(/schemaVersion:\s*(\d+);/)?.[1];
    const supported = readFileSync(SCRIPT, 'utf8').match(/SUPPORTED_SCHEMA_VERSION = (\d+)/)?.[1];
    expect(written).toBeDefined();
    expect(supported).toBe(written);
    expect(recorder).toContain("schema: 'conquestoria-playtest-log'");
  });
});
