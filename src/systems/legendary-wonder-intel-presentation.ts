import type { GameState, NormalizedLegendaryWonderIntelEntry } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';

export type LegendaryWonderRivalIntelStateLabel = 'Known rival completed' | 'Spotted rival project';

export interface LegendaryWonderRivalIntelEventView {
  id: string;
  kind: 'started' | 'completed';
  civId: string;
  civName: string;
  turn: number;
  title: string;
  text: string;
}

export interface LegendaryWonderRivalIntelSummary {
  wonderId: string;
  activityCount: number;
  badgeLabel: string;
  stateLabel: LegendaryWonderRivalIntelStateLabel;
  summaryLine: string;
  events: LegendaryWonderRivalIntelEventView[];
}

function wonderName(wonderId: string): string {
  return getLegendaryWonderDefinition(wonderId)?.name ?? wonderId;
}

function eventView(entry: NormalizedLegendaryWonderIntelEntry): LegendaryWonderRivalIntelEventView {
  const name = wonderName(entry.wonderId);
  if (entry.kind === 'completed') {
    return {
      id: entry.eventId,
      kind: 'completed',
      civId: entry.civId,
      civName: entry.civName,
      turn: entry.learnedTurn,
      title: 'Known rival completed',
      text: `${entry.civName} completed ${name} on turn ${entry.completionTurn}.`,
    };
  }

  return {
    id: entry.eventId,
    kind: 'started',
    civId: entry.civId,
    civName: entry.civName,
    turn: entry.revealedTurn,
    title: 'Spotted rival project',
    text: `${entry.civName} began ${name} in ${entry.cityName} on turn ${entry.revealedTurn}.`,
  };
}

function bestState(events: LegendaryWonderRivalIntelEventView[]): LegendaryWonderRivalIntelStateLabel {
  return events.some(event => event.kind === 'completed')
    ? 'Known rival completed'
    : 'Spotted rival project';
}

function summaryLine(wonderId: string, events: LegendaryWonderRivalIntelEventView[]): string {
  const completed = [...events].reverse().find(event => event.kind === 'completed');
  if (completed) {
    return `Known rival completed: ${completed.text}`;
  }

  const started = [...events].reverse().find(event => event.kind === 'started');
  if (started) {
    return `Last known: under construction. ${started.text}`;
  }

  return `No known rival activity for ${wonderName(wonderId)}.`;
}

export function getLegendaryWonderRivalIntelSummariesForViewer(
  state: GameState,
  viewerId: string,
): Map<string, LegendaryWonderRivalIntelSummary> {
  const grouped = new Map<string, NormalizedLegendaryWonderIntelEntry[]>();

  for (const entry of getLegendaryWonderIntelForViewer(state, viewerId)) {
    const entries = grouped.get(entry.wonderId) ?? [];
    entries.push(entry);
    grouped.set(entry.wonderId, entries);
  }

  const summaries = new Map<string, LegendaryWonderRivalIntelSummary>();
  for (const [wonderId, entries] of grouped.entries()) {
    const events = entries
      .map(eventView)
      .sort((a, b) => a.turn - b.turn || a.civName.localeCompare(b.civName) || a.id.localeCompare(b.id));
    summaries.set(wonderId, {
      wonderId,
      activityCount: events.length,
      badgeLabel: events.length === 1 ? 'Known rival activity' : `${events.length} rival records`,
      stateLabel: bestState(events),
      summaryLine: summaryLine(wonderId, events),
      events,
    });
  }

  return summaries;
}

export function isLegendaryWonderVisibleToPlayer(
  state: GameState,
  viewerId: string,
  wonderId: string,
  precomputedRivalIntel?: Map<string, LegendaryWonderRivalIntelSummary>,
): boolean {
  if (state.completedLegendaryWonders?.[wonderId]?.ownerId === viewerId) return true;
  const owned = Object.values(state.legendaryWonderProjects ?? {})
    .find(p => p.ownerId === viewerId && p.wonderId === wonderId);
  if (owned && owned.phase !== 'locked') return true;
  const summaries = precomputedRivalIntel ?? getLegendaryWonderRivalIntelSummariesForViewer(state, viewerId);
  return summaries.has(wonderId);
}
