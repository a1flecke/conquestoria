import type { GameState, HexCoord, NormalizedLegendaryWonderIntelEntry } from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { getLegendaryWonderIntelForViewer } from '@/systems/legendary-wonder-intel';

export type LegendaryWonderRivalIntelStateLabel =
  | 'Known rival completed'
  | 'Spotted rival project'
  | 'Known rival host';

export interface LegendaryWonderRivalIntelEventView {
  id: string;
  kind: 'started' | 'completed' | 'host-location-known';
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

export interface LegendaryWonderRivalHostLocationView {
  id: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
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

  if (entry.kind === 'host-location-known') {
    return {
      id: entry.eventId,
      kind: 'host-location-known',
      civId: entry.civId,
      civName: entry.civName,
      turn: entry.learnedTurn,
      title: 'Known rival host',
      text: `${entry.cityName} for ${name}. Location learned on turn ${entry.learnedTurn}.`,
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
  if (events.some(event => event.kind === 'completed')) return 'Known rival completed';
  if (events.some(event => event.kind === 'started')) return 'Spotted rival project';
  if (events.some(event => event.kind === 'host-location-known')) return 'Known rival host';
  return 'Spotted rival project';
}

function summaryLine(wonderId: string, events: LegendaryWonderRivalIntelEventView[]): string {
  const completed = [...events].reverse().find(event => event.kind === 'completed');
  const location = [...events].reverse().find(event => event.kind === 'host-location-known');
  if (completed) {
    return location
      ? `Known rival completed: ${completed.text} Known host: ${location.text}`
      : `Known rival completed: ${completed.text}`;
  }

  const started = [...events].reverse().find(event => event.kind === 'started');
  if (started) {
    return location
      ? `Last known: under construction. ${started.text} Known host: ${location.text}`
      : `Last known: under construction. ${started.text}`;
  }

  if (location) {
    return `Known host: ${location.text}`;
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

export function getLegendaryWonderHostLocationIntelForViewer(
  state: GameState,
  viewerId: string,
  wonderId?: string,
): LegendaryWonderRivalHostLocationView[] {
  return getLegendaryWonderIntelForViewer(state, viewerId)
    .filter((entry): entry is Extract<NormalizedLegendaryWonderIntelEntry, { kind: 'host-location-known' }> =>
      entry.kind === 'host-location-known' && (!wonderId || entry.wonderId === wonderId),
    )
    .map(entry => ({
      id: entry.eventId,
      wonderId: entry.wonderId,
      civId: entry.civId,
      civName: entry.civName,
      cityName: entry.cityName,
      coord: { ...entry.coord },
      learnedTurn: entry.learnedTurn,
    }))
    .sort((a, b) => b.learnedTurn - a.learnedTurn || a.civName.localeCompare(b.civName) || a.id.localeCompare(b.id));
}
