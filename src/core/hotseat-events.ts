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
): void {
  pending[civId] = [];
}

export interface TurnSummary {
  turn: number;
  era: number;
  gold: number;
  cities: number;
  units: number;
  currentResearch: string | null;
  researchProgress: number;
  sciencePerTurn: number;
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
    sciencePerTurn: 0, // calculated at render time from city yields
    atWarWith: civ?.diplomacy?.atWarWith ?? [],
    allies,
    events: pending[civId] ?? [],
  };
}
