import type { GameState, LegendaryWonderIntelEntry, LegendaryWonderProject } from '@/core/types';

export function recordLegendaryWonderIntel(
  state: GameState,
  viewerId: string,
  entry: LegendaryWonderIntelEntry,
): Record<string, LegendaryWonderIntelEntry[]> {
  const existing = state.legendaryWonderIntel?.[viewerId] ?? [];
  return {
    ...(state.legendaryWonderIntel ?? {}),
    [viewerId]: [
      ...existing.filter(candidate => candidate.projectKey !== entry.projectKey),
      entry,
    ],
  };
}

export function sanitizeLegendaryWonderIntel(
  state: GameState,
  projects: Record<string, LegendaryWonderProject>,
): Record<string, LegendaryWonderIntelEntry[]> {
  return Object.fromEntries(
    Object.entries(state.legendaryWonderIntel ?? {})
      .map(([viewerId, entries]) => [
        viewerId,
        entries.filter(entry => {
          const project = projects[entry.projectKey];
          return Boolean(project && project.phase === 'building');
        }),
      ])
      .filter(([, entries]) => entries.length > 0),
  );
}

export function getLegendaryWonderIntelForViewer(
  state: GameState,
  viewerId: string,
): LegendaryWonderIntelEntry[] {
  return state.legendaryWonderIntel?.[viewerId] ?? [];
}
