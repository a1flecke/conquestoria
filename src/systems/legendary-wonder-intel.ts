import type {
  GameState,
  HexCoord,
  LegendaryWonderCompletedIntelEntry,
  LegendaryWonderHostLocationIntelEntry,
  LegendaryWonderIntelEntry,
  LegendaryWonderStartedIntelEntry,
  NormalizedLegendaryWonderIntelEntry,
} from '@/core/types';
import { getLegendaryWonderDefinition } from '@/systems/legendary-wonder-definitions';
import { shouldListMajorCivForViewer } from '@/systems/viewer-intel';

function startedEventId(projectKey: string, revealedTurn: number): string {
  return `started:${projectKey}:${revealedTurn}`;
}

function completedEventId(wonderId: string, civId: string, completionTurn: number): string {
  return `completed:${wonderId}:${civId}:${completionTurn}`;
}

function hostLocationEventId(projectKey: string, learnedTurn: number): string {
  return `location:${projectKey}:${learnedTurn}`;
}

function isValidCoord(coord: HexCoord | undefined): coord is HexCoord {
  return !!coord && Number.isFinite(coord.q) && Number.isFinite(coord.r);
}

export function normalizeLegendaryWonderIntelEntry(
  entry: LegendaryWonderIntelEntry,
): NormalizedLegendaryWonderIntelEntry | null {
  if (entry.kind === 'completed') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    if (!entry.eventId || !entry.civId || !entry.civName) return null;
    return { ...entry };
  }

  if (entry.kind === 'started') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    if (!entry.projectKey || !entry.cityId || !entry.cityName) return null;
    return {
      ...entry,
      eventId: entry.eventId || startedEventId(entry.projectKey, entry.revealedTurn),
      intelLevel: entry.intelLevel,
    };
  }

  if (entry.kind === 'host-location-known') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    if (!entry.eventId || !entry.civId || !entry.civName || !entry.cityId || !entry.cityName) return null;
    if (!isValidCoord(entry.coord)) return null;
    if (entry.source !== 'spy-location' && entry.source !== 'map-intel' && entry.source !== 'debug-grant') return null;
    return {
      ...entry,
      coord: { ...entry.coord },
    };
  }

  if (entry.intelLevel === 'started') {
    if (!getLegendaryWonderDefinition(entry.wonderId)) return null;
    return {
      kind: 'started',
      eventId: startedEventId(entry.projectKey, entry.revealedTurn),
      projectKey: entry.projectKey,
      wonderId: entry.wonderId,
      civId: entry.civId,
      civName: entry.civName,
      cityId: entry.cityId,
      cityName: entry.cityName,
      revealedTurn: entry.revealedTurn,
      intelLevel: 'started',
    };
  }

  return null;
}

export function sanitizeLegendaryWonderIntel(
  state: GameState,
): Record<string, NormalizedLegendaryWonderIntelEntry[]> {
  return Object.fromEntries(
    Object.entries(state.legendaryWonderIntel ?? {})
      .map(([viewerId, entries]) => {
        const normalized: NormalizedLegendaryWonderIntelEntry[] = [];
        const seen = new Set<string>();
        for (const entry of entries) {
          const safeEntry = normalizeLegendaryWonderIntelEntry(entry);
          if (!safeEntry || safeEntry.civId === viewerId || seen.has(safeEntry.eventId)) continue;
          seen.add(safeEntry.eventId);
          normalized.push(safeEntry);
        }
        return [viewerId, normalized] as const;
      })
      .filter(([, entries]) => entries.length > 0),
  );
}

export function getLegendaryWonderIntelForViewer(
  state: GameState,
  viewerId: string,
): NormalizedLegendaryWonderIntelEntry[] {
  return (state.legendaryWonderIntel?.[viewerId] ?? [])
    .map(entry => normalizeLegendaryWonderIntelEntry(entry))
    .filter((entry): entry is NormalizedLegendaryWonderIntelEntry => entry !== null);
}

export function recordLegendaryWonderIntel(
  state: GameState,
  viewerId: string,
  entry: NormalizedLegendaryWonderIntelEntry,
): Record<string, NormalizedLegendaryWonderIntelEntry[]> {
  const normalized = normalizeLegendaryWonderIntelEntry(entry);
  if (!normalized) {
    return sanitizeLegendaryWonderIntel(state);
  }

  const sanitized = sanitizeLegendaryWonderIntel(state);
  const existing = sanitized[viewerId] ?? [];
  return {
    ...sanitized,
    [viewerId]: [
      ...existing.filter(candidate => candidate.eventId !== normalized.eventId),
      normalized,
    ],
  };
}

export function createStartedLegendaryWonderIntelEntry(input: {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  revealedTurn: number;
}): LegendaryWonderStartedIntelEntry {
  return {
    kind: 'started',
    eventId: startedEventId(input.projectKey, input.revealedTurn),
    ...input,
    intelLevel: 'started',
  };
}

export function createCompletedLegendaryWonderIntelEntry(input: {
  wonderId: string;
  civId: string;
  civName: string;
  completionTurn: number;
  learnedTurn: number;
}): LegendaryWonderCompletedIntelEntry {
  return {
    kind: 'completed',
    eventId: completedEventId(input.wonderId, input.civId, input.completionTurn),
    ...input,
  };
}

export function createHostLocationLegendaryWonderIntelEntry(input: {
  projectKey: string;
  wonderId: string;
  civId: string;
  civName: string;
  cityId: string;
  cityName: string;
  coord: HexCoord;
  learnedTurn: number;
  source: LegendaryWonderHostLocationIntelEntry['source'];
}): LegendaryWonderHostLocationIntelEntry {
  return {
    kind: 'host-location-known',
    eventId: hostLocationEventId(input.projectKey, input.learnedTurn),
    wonderId: input.wonderId,
    civId: input.civId,
    civName: input.civName,
    cityId: input.cityId,
    cityName: input.cityName,
    coord: { ...input.coord },
    learnedTurn: input.learnedTurn,
    source: input.source,
  };
}

export function recordKnownHumanLegendaryWonderCompletionIntel(
  state: GameState,
  completed: { wonderId: string; civId: string; completionTurn: number; learnedTurn: number },
): Record<string, NormalizedLegendaryWonderIntelEntry[]> {
  let legendaryWonderIntel = sanitizeLegendaryWonderIntel(state);
  const completingCiv = state.civilizations[completed.civId];
  if (!completingCiv) return legendaryWonderIntel;

  for (const viewer of Object.values(state.civilizations)) {
    if (!viewer.isHuman || viewer.id === completed.civId) continue;
    if (!shouldListMajorCivForViewer(state, viewer.id, completed.civId)) continue;
    legendaryWonderIntel = recordLegendaryWonderIntel(
      { ...state, legendaryWonderIntel },
      viewer.id,
      createCompletedLegendaryWonderIntelEntry({
        wonderId: completed.wonderId,
        civId: completed.civId,
        civName: completingCiv.name,
        completionTurn: completed.completionTurn,
        learnedTurn: completed.learnedTurn,
      }),
    );
  }

  return legendaryWonderIntel;
}
