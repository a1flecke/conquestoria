import type { CouncilInterrupt, GameState, GameEvent } from './types';

export function collectEvent(
  pending: Record<string, GameEvent[]>,
  civId: string,
  event: GameEvent,
): void {
  if (!pending[civId]) pending[civId] = [];
  pending[civId].push(event);
}

export function collectCouncilInterrupt(
  pending: Record<string, GameEvent[]>,
  civId: string,
  interrupt: CouncilInterrupt,
  turn: number,
): void {
  collectEvent(pending, civId, {
    type: 'council:interrupt',
    message: interrupt.summary,
    turn,
  });
}

export function getEventsForPlayer(
  pending: Record<string, GameEvent[]>,
  civId: string,
): GameEvent[] {
  return pending[civId] ?? [];
}

export function clearEventsForPlayer(
  pending: Record<string, GameEvent[]>,
  civId: string,
): Record<string, GameEvent[]> {
  return {
    ...pending,
    [civId]: [],
  };
}

// MR2 (#551): pendingEvents is hot-seat-only -- solo saves from before the
// delivery contract may carry stale queued events (from the previously
// unconditional first-contact/strategic-warning queueing) that would never
// drain, since solo always toasts immediately instead of deferring. Mutates
// state in place, matching migrateLegacySave's existing convention.
export function clearStaleSoloPendingEvents(state: GameState): void {
  if (state.hotSeat) return;
  if (!state.pendingEvents) return;
  if (Object.values(state.pendingEvents).some(list => list.length > 0)) {
    state.pendingEvents = {};
  }
}

export interface TurnSummary {
  turn: number;
  era: number;
  gold: number;
  cities: number;
  units: number;
  currentResearch: string | null;
  researchProgress: number;
  atWarWith: string[];
  allies: string[];
  events: GameEvent[];
}

export function generateSummary(
  state: GameState,
  civId: string,
): TurnSummary {
  const civ = state.civilizations[civId];
  const pending = state.pendingEvents ?? {};

  const allies = civ?.diplomacy?.treaties
    .filter(t => t.type === 'alliance')
    .map(t => t.civA === civId ? t.civB : t.civA) ?? [];

  return {
    turn: state.turn,
    era: state.era,
    gold: civ?.gold ?? 0,
    cities: civ?.cities.length ?? 0,
    units: civ?.units.length ?? 0,
    currentResearch: civ?.techState.currentResearch ?? null,
    researchProgress: civ?.techState.researchProgress ?? 0,
    atWarWith: civ?.diplomacy?.atWarWith ?? [],
    allies,
    events: pending[civId] ?? [],
  };
}
