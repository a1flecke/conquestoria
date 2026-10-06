#!/usr/bin/env node
// #1363: turn one or more #1244 playtest exports into deterministic, local product EVIDENCE.
//
//   yarn playtest:report <log.json> [<log2.json> ...] [--format markdown|json] [--out FILE]
//
// Input: the JSON a tester exports with the playtest recorder (docs/playtest-recorder.md, schema v1).
// Output: a Markdown summary (default) or the machine-readable report (`--format json`). Same input bytes give
// byte-identical output: sessions are ordered by a content hash and labelled `s-<hash8>` (so neither the argument order
// nor a host path nor a file name leaks in), every list has an explicit tie-break, and no timestamp is ever produced.
//
// What this is: a list of observations the log supports ("food was a Council constraint on 11 turns and its action was
// used once"). What it is not: a verdict. It never says a mechanic is unbalanced or a screen is bad; a human reads the
// observations and judges. It reads only the exported file: no game state, no network, nothing leaves the machine.
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export const REPORT_VERSION = 1;
const SUPPORTED_SCHEMA = 'conquestoria-playtest-log';
const SUPPORTED_SCHEMA_VERSION = 1;
const TOP = 3;
const MIN_IDLE_STRETCH = 3;
const MIN_CHURN_SAMPLE = 8;
const MIN_CHURN_ABSOLUTE = 5;
const MIN_TREND_SAMPLE = 6;
const GOLD_OUTLIER_FACTOR = 5;
const NOTE = 'Observations drawn only from the exported playtest log; no design judgement is made. Local only; nothing is uploaded.';

// ---------------------------------------------------------------------------
// Small deterministic numeric helpers
// ---------------------------------------------------------------------------

const round1 = value => Math.round(value * 10) / 10;
const sum = values => values.reduce((total, value) => total + value, 0);
const avg = values => (values.length === 0 ? null : round1(sum(values) / values.length));
const asc = (a, b) => a - b;
const byText = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

/** Nearest-rank percentile of a numeric list (0 < p <= 1). */
function percentile(values, p) {
  if (values.length === 0) return null;
  const sorted = [...values].sort(asc);
  return sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)];
}

function median(values) {
  if (values.length === 0) return null;
  const sorted = [...values].sort(asc);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : round1((sorted[middle - 1] + sorted[middle]) / 2);
}

// ---------------------------------------------------------------------------
// Reading and validating an export
// ---------------------------------------------------------------------------

export class PlaytestInputError extends Error {}

const isRecord = value => typeof value === 'object' && value !== null && !Array.isArray(value);
const isCount = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function validateRow(row, where) {
  if (!isRecord(row)) throw new PlaytestInputError(`${where}: a turn row must be an object`);
  if (!isCount(row.turn)) throw new PlaytestInputError(`${where}: turn row has no numeric "turn"`);
  for (const field of ['idleCitiesAtEnd', 'idleUnitsAtEnd', 'goldAtEnd']) {
    if (typeof row[field] !== 'number' || !Number.isFinite(row[field])) throw new PlaytestInputError(`${where}: turn ${row.turn} has no numeric "${field}"`);
  }
  if (row.durationMs !== null && !isCount(row.durationMs)) throw new PlaytestInputError(`${where}: turn ${row.turn} has an invalid "durationMs"`);
  if (!isRecord(row.panelOpens)) throw new PlaytestInputError(`${where}: turn ${row.turn} has no "panelOpens" object`);
  if (!isRecord(row.notifications) || !isCount(row.notifications.total)) throw new PlaytestInputError(`${where}: turn ${row.turn} has no "notifications.total"`);
  if (!isRecord(row.council) || !isCount(row.council.cardsShown) || !Array.isArray(row.council.actionsTaken)) {
    throw new PlaytestInputError(`${where}: turn ${row.turn} has an invalid "council" block`);
  }
  if (!Array.isArray(row.constraintsShown) || !Array.isArray(row.victoryChanges)) {
    throw new PlaytestInputError(`${where}: turn ${row.turn} is missing "constraintsShown" or "victoryChanges"`);
  }
}

function parseExport(text, label) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new PlaytestInputError(`${label}: not valid JSON`);
  }
  if (!isRecord(data) || data.schema !== SUPPORTED_SCHEMA) throw new PlaytestInputError(`${label}: not a ${SUPPORTED_SCHEMA} export`);
  if (data.schemaVersion !== SUPPORTED_SCHEMA_VERSION) {
    throw new PlaytestInputError(`${label}: unsupported schemaVersion ${JSON.stringify(data.schemaVersion)} (this report reads version ${SUPPORTED_SCHEMA_VERSION})`);
  }
  if (!Array.isArray(data.games)) throw new PlaytestInputError(`${label}: "games" must be an array`);
  const units = [];
  for (const game of data.games) {
    if (!isRecord(game) || typeof game.gameId !== 'string' || !isRecord(game.seats)) throw new PlaytestInputError(`${label}: a game needs a "gameId" and a "seats" object`);
    for (const seat of Object.keys(game.seats).sort(byText)) {
      const log = game.seats[seat];
      if (!isRecord(log) || !Array.isArray(log.turns) || !Array.isArray(log.constraintLifetimes ?? [])) {
        throw new PlaytestInputError(`${label}: seat "${seat}" needs "turns" and "constraintLifetimes" arrays`);
      }
      log.turns.forEach(row => validateRow(row, `${label} seat "${seat}"`));
      // Stable by turn number; rows with the same number keep their recorded order.
      const turns = log.turns.map((row, index) => ({ row, index })).sort((a, b) => a.row.turn - b.row.turn || a.index - b.index).map(entry => entry.row);
      units.push({ gameId: game.gameId, seat, turns, lifetimes: log.constraintLifetimes ?? [] });
    }
  }
  units.sort((a, b) => byText(a.gameId, b.gameId) || byText(a.seat, b.seat));
  return units;
}

export function loadSession(text, label = 'input') {
  const id = `s-${createHash('sha256').update(text).digest('hex').slice(0, 8)}`;
  return { id, units: parseExport(text, label) };
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

const where = (unit, turn) => ({ seat: unit.seat, game: unit.gameId, turn });
const rowsOf = units => units.flatMap(unit => unit.turns.map(row => ({ unit, row })));
const churnOf = row => sum(Object.values(row.panelOpens).filter(value => typeof value === 'number'));

function shapeMetrics(units, sessionId) {
  const rows = rowsOf(units);
  const durations = rows.filter(({ row }) => typeof row.durationMs === 'number');
  const values = durations.map(({ row }) => row.durationMs);
  const longest = [...durations]
    .sort((a, b) => b.row.durationMs - a.row.durationMs || byText(a.unit.seat, b.unit.seat) || byText(a.unit.gameId, b.unit.gameId) || a.row.turn - b.row.turn)
    .slice(0, TOP)
    .map(({ unit, row }) => ({ ...where(unit, row.turn), durationMs: row.durationMs, ...(sessionId ? { session: sessionId } : {}) }));
  const byType = { info: 0, success: 0, warning: 0 };
  for (const { row } of rows) for (const type of Object.keys(byType)) byType[type] += row.notifications.byType?.[type] ?? 0;
  const notificationTotal = sum(rows.map(({ row }) => row.notifications.total));
  return {
    turnsRecorded: rows.length,
    closedTurns: rows.filter(({ row }) => row.closed === true).length,
    seats: [...new Set(units.map(unit => unit.seat))].sort(byText),
    games: [...new Set(units.map(unit => unit.gameId))].sort(byText),
    durations: { measuredTurns: values.length, medianMs: median(values), p90Ms: percentile(values, 0.9), maxMs: values.length ? Math.max(...values) : null },
    longestTurns: longest,
    notifications: { total: notificationTotal, averagePerTurn: avg(rows.map(({ row }) => row.notifications.total)), byType },
  };
}

function churnMetrics(units) {
  const rows = rowsOf(units);
  const byPanel = new Map();
  for (const { row } of rows) {
    for (const [panel, opens] of Object.entries(row.panelOpens)) {
      if (typeof opens !== 'number' || opens <= 0) continue;
      const entry = byPanel.get(panel) ?? { panel, opens: 0, turnsOpened: 0, reopens: 0 };
      entry.opens += opens;
      entry.turnsOpened += 1;
      entry.reopens += opens - 1;
      byPanel.set(panel, entry);
    }
  }
  const panels = [...byPanel.values()].sort((a, b) => b.opens - a.opens || byText(a.panel, b.panel));
  const mostReopened = [...panels].filter(entry => entry.reopens > 0).sort((a, b) => b.reopens - a.reopens || byText(a.panel, b.panel)).slice(0, TOP);

  const churn = rows.map(({ unit, row }) => ({ unit, row, churn: churnOf(row) }));
  let highChurn = { rule: `needs at least ${MIN_CHURN_SAMPLE} turns; a turn is flagged above Q3 + 1.5 x IQR and at least ${MIN_CHURN_ABSOLUTE} panel opens`, turns: [] };
  if (churn.length >= MIN_CHURN_SAMPLE) {
    const values = churn.map(entry => entry.churn);
    const q1 = percentile(values, 0.25);
    const q3 = percentile(values, 0.75);
    const threshold = q3 + 1.5 * (q3 - q1);
    highChurn = {
      rule: highChurn.rule,
      threshold: round1(threshold),
      turns: churn
        .filter(entry => entry.churn > threshold && entry.churn >= MIN_CHURN_ABSOLUTE)
        .sort((a, b) => b.churn - a.churn || byText(a.unit.seat, b.unit.seat) || byText(a.unit.gameId, b.unit.gameId) || a.row.turn - b.row.turn)
        .slice(0, TOP)
        .map(entry => ({ ...where(entry.unit, entry.row.turn), panelOpens: entry.churn })),
    };
  }

  const ended = rows.filter(({ row }) => row.endRequested === true);
  const idleRows = ended.filter(({ row }) => row.idleCitiesAtEnd > 0 || row.idleUnitsAtEnd > 0);
  const stretches = [];
  for (const unit of units) {
    let run = [];
    const flush = () => {
      if (run.length >= MIN_IDLE_STRETCH) stretches.push({ seat: unit.seat, game: unit.gameId, fromTurn: run[0].turn, toTurn: run[run.length - 1].turn, turns: run.length });
      run = [];
    };
    for (const row of unit.turns) {
      if (row.endRequested === true && (row.idleCitiesAtEnd > 0 || row.idleUnitsAtEnd > 0)) run.push(row);
      else flush();
    }
    flush();
  }
  stretches.sort((a, b) => b.turns - a.turns || byText(a.seat, b.seat) || byText(a.game, b.game) || a.fromTurn - b.fromTurn);

  return {
    panelOpens: { total: sum(panels.map(entry => entry.opens)), averagePerTurn: avg(rows.map(({ row }) => churnOf(row))), byPanel: panels },
    mostReopenedPanels: mostReopened,
    highChurnTurns: highChurn,
    idleAtEnd: {
      turnsWithEndRequested: ended.length,
      averageIdleCities: avg(ended.map(({ row }) => row.idleCitiesAtEnd)),
      averageIdleUnits: avg(ended.map(({ row }) => row.idleUnitsAtEnd)),
      maxIdleCities: ended.length ? Math.max(...ended.map(({ row }) => row.idleCitiesAtEnd)) : null,
      maxIdleUnits: ended.length ? Math.max(...ended.map(({ row }) => row.idleUnitsAtEnd)) : null,
      turnsEndedWithIdle: idleRows.length,
      repeatedIdleStretches: stretches.slice(0, TOP),
      stretchRule: `${MIN_IDLE_STRETCH}+ consecutive recorded turns that ended with an idle city or unit`,
    },
  };
}

function councilMetrics(units) {
  const rows = rowsOf(units);
  const cardsShown = sum(rows.map(({ row }) => row.council.cardsShown));
  const actions = rows.flatMap(({ row }) => row.council.actionsTaken);
  const byBucket = { 'do-now': 0, soon: 0, 'to-win': 0, drama: 0 };
  for (const { row } of rows) for (const bucket of Object.keys(byBucket)) byBucket[bucket] += row.council.cardsShownByBucket?.[bucket] ?? 0;
  const actionCounts = new Map();
  for (const id of actions) actionCounts.set(id, (actionCounts.get(id) ?? 0) + 1);

  const kinds = [...new Set(rows.flatMap(({ row }) => row.constraintsShown))].sort(byText);
  const constraints = kinds.map(kind => ({
    kind,
    turnsAsConstraint: rows.filter(({ row }) => row.constraintsShown.includes(kind)).length,
    turnsCouncilShowedIt: rows.filter(({ row }) => (row.council.constraintKindsShown ?? []).includes(kind)).length,
    actionButtonUses: actionCounts.get(`constraint-${kind}`) ?? 0,
  })).sort((a, b) => b.turnsAsConstraint - a.turnsAsConstraint || byText(a.kind, b.kind));

  const lifetimes = units.flatMap(unit => unit.lifetimes.filter(entry => isRecord(entry) && typeof entry.kind === 'string' && isCount(entry.firstSeenTurn)).map(entry => ({ unit, entry })));
  const lastTurn = unit => (unit.turns.length ? unit.turns[unit.turns.length - 1].turn : 0);
  const resolved = lifetimes.filter(({ entry }) => isCount(entry.turnsToResolve))
    .sort((a, b) => b.entry.turnsToResolve - a.entry.turnsToResolve || byText(a.entry.kind, b.entry.kind) || byText(a.unit.seat, b.unit.seat) || a.entry.firstSeenTurn - b.entry.firstSeenTurn)
    .slice(0, TOP).map(({ unit, entry }) => ({ seat: unit.seat, game: unit.gameId, kind: entry.kind, firstSeenTurn: entry.firstSeenTurn, resolvedTurn: entry.resolvedTurn, turnsToResolve: entry.turnsToResolve }));
  const stillOpen = lifetimes.filter(({ entry }) => !isCount(entry.turnsToResolve))
    .map(({ unit, entry }) => ({ seat: unit.seat, game: unit.gameId, kind: entry.kind, firstSeenTurn: entry.firstSeenTurn, observedThroughTurn: lastTurn(unit), turnsObserved: Math.max(0, lastTurn(unit) - entry.firstSeenTurn) }))
    .sort((a, b) => b.turnsObserved - a.turnsObserved || byText(a.kind, b.kind) || byText(a.seat, b.seat) || a.firstSeenTurn - b.firstSeenTurn).slice(0, TOP);
  // A kind with two or more recorded lifetimes in one seat and game came back after being resolved: the log proves it.
  const recurring = [];
  for (const unit of units) {
    const counts = new Map();
    for (const entry of unit.lifetimes) if (isRecord(entry) && typeof entry.kind === 'string') counts.set(entry.kind, (counts.get(entry.kind) ?? 0) + 1);
    for (const [kind, occurrences] of counts) if (occurrences >= 2) recurring.push({ seat: unit.seat, game: unit.gameId, kind, occurrences });
  }
  recurring.sort((a, b) => b.occurrences - a.occurrences || byText(a.kind, b.kind) || byText(a.seat, b.seat) || byText(a.game, b.game));

  return {
    cardsShown,
    cardsShownByBucket: byBucket,
    actionButtonUses: actions.length,
    actionRate: cardsShown === 0 ? null : round1(actions.length / cardsShown * 100),
    actionRateByBucket: { supported: false, reason: 'the log records which card ids were acted on, not their buckets' },
    actionsByCardId: [...actionCounts.entries()].map(([cardId, count]) => ({ cardId, count })).sort((a, b) => b.count - a.count || byText(a.cardId, b.cardId)),
    constraints,
    longestResolvedConstraints: resolved,
    longestStillOpenConstraints: stillOpen,
    recurringConstraints: recurring,
  };
}

function directionMetrics(units) {
  const changes = [];
  let longest = null;
  for (const unit of units) {
    const marks = unit.turns.map((row, index) => (row.victoryChanges.length > 0 ? index : -1)).filter(index => index >= 0);
    for (const index of marks) {
      const row = unit.turns[index];
      for (const change of row.victoryChanges) changes.push({ seat: unit.seat, game: unit.gameId, turn: row.turn, lane: String(change.id), from: change.from ?? null, to: change.to });
    }
    if (unit.turns.length === 0) continue;
    const bounds = [-1, ...marks, unit.turns.length];
    for (let i = 1; i < bounds.length; i += 1) {
      const turns = bounds[i] - bounds[i - 1] - 1;
      if (turns <= 0) continue;
      const candidate = { seat: unit.seat, game: unit.gameId, turns, fromTurn: unit.turns[bounds[i - 1] + 1].turn, toTurn: unit.turns[bounds[i] - 1].turn };
      if (!longest || candidate.turns > longest.turns || (candidate.turns === longest.turns && (byText(candidate.seat, longest.seat) || byText(candidate.game, longest.game) || candidate.fromTurn - longest.fromTurn) < 0)) longest = candidate;
    }
  }
  changes.sort((a, b) => byText(a.game, b.game) || byText(a.seat, b.seat) || a.turn - b.turn || byText(a.lane, b.lane));
  return { victoryLaneTransitions: changes, longestStretchWithoutVictoryMovement: longest };
}

function economyMetrics(units) {
  const rows = rowsOf(units).filter(({ row }) => row.endRequested === true);
  const gold = rows.map(({ row }) => row.goldAtEnd);
  const mid = median(gold);
  const third = Math.floor(rows.length / 3);
  const trend = rows.length >= MIN_TREND_SAMPLE
    ? { measuredTurns: rows.length, firstThirdAverage: avg(gold.slice(0, third)), lastThirdAverage: avg(gold.slice(rows.length - third)) }
    : null;
  const outliers = mid !== null && mid > 0
    ? rows.filter(({ row }) => row.goldAtEnd >= GOLD_OUTLIER_FACTOR * mid)
      .sort((a, b) => b.row.goldAtEnd - a.row.goldAtEnd || byText(a.unit.seat, b.unit.seat) || byText(a.unit.gameId, b.unit.gameId) || a.row.turn - b.row.turn)
      .slice(0, TOP).map(({ unit, row }) => ({ ...where(unit, row.turn), goldAtEnd: row.goldAtEnd }))
    : [];
  return {
    goldAtEnd: { measuredTurns: gold.length, min: gold.length ? Math.min(...gold) : null, median: mid, max: gold.length ? Math.max(...gold) : null },
    trend,
    trendRule: `needs at least ${MIN_TREND_SAMPLE} turns that ended; compares the first and last third`,
    outliers,
    outlierRule: `${GOLD_OUTLIER_FACTOR}x the median ending gold or more (only when the median is above 0)`,
  };
}

function metricsFor(units, sessionId) {
  return {
    shape: shapeMetrics(units, sessionId),
    churn: churnMetrics(units),
    council: councilMetrics(units),
    direction: directionMetrics(units),
    economy: economyMetrics(units),
  };
}

export function buildReport(sessions) {
  const ordered = [...sessions].sort((a, b) => byText(a.id, b.id));
  const all = ordered.flatMap(session => session.units.map(unit => ({ ...unit, gameId: unit.gameId, sessionId: session.id })));
  return {
    tool: 'conquestoria-playtest-report',
    reportVersion: REPORT_VERSION,
    input: { schema: SUPPORTED_SCHEMA, schemaVersion: SUPPORTED_SCHEMA_VERSION },
    note: NOTE,
    sessions: ordered.map(session => ({ id: session.id, ...metricsFor(session.units, session.id) })),
    combined: { sessionCount: ordered.length, ...metricsFor(all, null) },
  };
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

const seconds = ms => (ms === null ? 'n/a' : `${round1(ms / 1000)}s`);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const at = entry => `${entry.seat}${entry.game ? ` (game ${entry.game})` : ''} turn ${entry.turn}`;

function metricsMarkdown(metrics, heading, label = '') {
  const { shape, churn, council, direction, economy } = metrics;
  const out = [];
  out.push(`${heading} ${label}Session shape`);
  out.push(`- ${plural(shape.turnsRecorded, 'turn')} recorded (${shape.closedTurns} closed) for seat${shape.seats.length === 1 ? '' : 's'} ${shape.seats.join(', ') || 'none'}.`);
  out.push(`- Turn duration over ${plural(shape.durations.measuredTurns, 'measured turn')}: median ${seconds(shape.durations.medianMs)}, p90 ${seconds(shape.durations.p90Ms)}, max ${seconds(shape.durations.maxMs)}.`);
  if (shape.longestTurns.length) out.push(`- Longest turns: ${shape.longestTurns.map(entry => `${at(entry)} (${seconds(entry.durationMs)})`).join('; ')}.`);
  out.push(`- Notifications: ${shape.notifications.total} total, ${shape.notifications.averagePerTurn ?? 'n/a'} per turn.`);
  out.push('');
  out.push(`${heading} ${label}Interaction churn`);
  out.push(`- Panel opens: ${churn.panelOpens.total} total, ${churn.panelOpens.averagePerTurn ?? 'n/a'} per turn.`);
  if (churn.mostReopenedPanels.length) out.push(`- Most reopened within a turn: ${churn.mostReopenedPanels.map(entry => `${entry.panel} (${entry.reopens} reopen${entry.reopens === 1 ? '' : 's'} over ${plural(entry.turnsOpened, 'turn')})`).join('; ')}.`);
  out.push(churn.highChurnTurns.turns.length
    ? `- Turns with unusually many panel opens: ${churn.highChurnTurns.turns.map(entry => `${at(entry)} (${entry.panelOpens})`).join('; ')}.`
    : `- No turn was flagged for panel churn (${churn.highChurnTurns.rule}).`);
  const idle = churn.idleAtEnd;
  out.push(`- At end turn: ${idle.averageIdleCities ?? 'n/a'} idle cities and ${idle.averageIdleUnits ?? 'n/a'} idle units on average over ${plural(idle.turnsWithEndRequested, 'ended turn')}; ${idle.turnsEndedWithIdle} ended with something idle.`);
  out.push(idle.repeatedIdleStretches.length
    ? `- Repeated idle stretches (${idle.stretchRule}): ${idle.repeatedIdleStretches.map(entry => `${entry.seat} turns ${entry.fromTurn}-${entry.toTurn} (${entry.turns})`).join('; ')}.`
    : `- No repeated idle stretch (${idle.stretchRule}).`);
  out.push('');
  out.push(`${heading} ${label}Council use`);
  out.push(`- ${plural(council.cardsShown, 'card')} shown (${Object.entries(council.cardsShownByBucket).map(([bucket, n]) => `${bucket} ${n}`).join(', ')}); action button used ${plural(council.actionButtonUses, 'time')}${council.actionRate === null ? '' : ` (${council.actionRate}% of cards shown)`}.`);
  out.push(`- Action rate by bucket is not available: ${council.actionRateByBucket.reason}.`);
  for (const entry of council.constraints) {
    out.push(`- ${entry.kind} was a strategic constraint on ${plural(entry.turnsAsConstraint, 'turn')}; the Council showed it on ${entry.turnsCouncilShowedIt}; its action button was used ${plural(entry.actionButtonUses, 'time')}.`);
  }
  if (council.longestResolvedConstraints.length) out.push(`- Longest-lived resolved constraints: ${council.longestResolvedConstraints.map(entry => `${entry.kind} (${entry.firstSeenTurn} to ${entry.resolvedTurn}, ${plural(entry.turnsToResolve, 'turn')})`).join('; ')}.`);
  if (council.longestStillOpenConstraints.length) out.push(`- Constraints still present at the last recorded turn: ${council.longestStillOpenConstraints.map(entry => `${entry.kind} since turn ${entry.firstSeenTurn} (${plural(entry.turnsObserved, 'turn')} observed)`).join('; ')}.`);
  if (council.recurringConstraints.length) out.push(`- Constraints that came back after being resolved: ${council.recurringConstraints.map(entry => `${entry.kind} (${entry.occurrences} times, ${entry.seat})`).join('; ')}.`);
  out.push('');
  out.push(`${heading} ${label}Strategic direction`);
  out.push(direction.victoryLaneTransitions.length
    ? `- Victory-lane transitions: ${direction.victoryLaneTransitions.map(entry => `${entry.seat} turn ${entry.turn} ${entry.lane} ${entry.from ?? 'untracked'} to ${entry.to}`).join('; ')}.`
    : '- No victory-lane transition was recorded.');
  if (direction.longestStretchWithoutVictoryMovement) {
    const stretch = direction.longestStretchWithoutVictoryMovement;
    out.push(`- Longest stretch without victory-lane movement: ${plural(stretch.turns, 'recorded turn')} (${stretch.seat}, turns ${stretch.fromTurn}-${stretch.toTurn}).`);
  }
  out.push('');
  out.push(`${heading} ${label}Economy observations`);
  out.push(`- Gold at end of turn over ${plural(economy.goldAtEnd.measuredTurns, 'ended turn')}: min ${economy.goldAtEnd.min ?? 'n/a'}, median ${economy.goldAtEnd.median ?? 'n/a'}, max ${economy.goldAtEnd.max ?? 'n/a'}.`);
  if (economy.trend) out.push(`- First-third average ${economy.trend.firstThirdAverage}, last-third average ${economy.trend.lastThirdAverage}.`);
  if (economy.outliers.length) out.push(`- Ended with gold of ${GOLD_OUTLIER_FACTOR}x the median or more: ${economy.outliers.map(entry => `${at(entry)} (${entry.goldAtEnd})`).join('; ')}.`);
  return out;
}

export function renderMarkdown(report) {
  const out = ['# Playtest report', '', report.note, ''];
  out.push(`Sessions: ${report.combined.sessionCount}`, '');
  out.push(...metricsMarkdown(report.combined, '##', 'All sessions: '));
  for (const session of report.sessions) {
    out.push('', `## Session ${session.id}`, '');
    out.push(...metricsMarkdown(session, '###'));
  }
  return `${out.join('\n')}\n`;
}

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function main(argv) {
  const files = [];
  let format = 'markdown';
  let out = null;
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--format') { format = argv[i + 1]; i += 1; } else if (token === '--out') { out = argv[i + 1]; i += 1; } else if (token.startsWith('--')) {
      console.error(`playtest report: unknown option ${token}`);
      return 2;
    } else files.push(token);
  }
  if (!['markdown', 'json'].includes(format)) { console.error('playtest report: --format must be markdown or json'); return 2; }
  if (files.length === 0) { console.error('usage: yarn playtest:report <log.json> [<log2.json> ...] [--format markdown|json] [--out FILE]'); return 2; }
  try {
    const sessions = files.map(file => loadSession(readFileSync(file, 'utf8'), file));
    const report = buildReport(sessions);
    const text = format === 'json' ? `${JSON.stringify(report, null, 2)}\n` : renderMarkdown(report);
    if (out) writeFileSync(out, text); else process.stdout.write(text);
    return 0;
  } catch (error) {
    if (error instanceof PlaytestInputError || error?.code === 'ENOENT') {
      console.error(`playtest report: ${error.message}`);
      return 2;
    }
    throw error;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exit(main(process.argv.slice(2)));
