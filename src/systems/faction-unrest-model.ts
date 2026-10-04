// src/systems/faction-unrest-model.ts
// #1246: the import-light leaf of the faction/unrest family. Types, thresholds and the tiny pure
// city/unit predicates every other faction-* module (and religion-loyalty) reads. It imports
// nothing from the faction family, so nothing below it can form a cycle through it.
import type { GameState, City } from '../core/types';
import { hexDistance } from './hex-utils';

// --- Thresholds ---
export const UNREST_TRIGGER_PRESSURE = 40;
export const REVOLT_UNREST_TURNS = 10;       // turns at unrest before revolt escalates (#552)
export const BREAKAWAY_REVOLT_TURNS = 10;    // turns at revolt before breakaway
export const CONQUEST_UNREST_DURATION = 15;  // turns until conquestTurn is cleared

// #919 MR2: the Era-2 administration-ladder nudge. One extra "free" city before
// empire overextension pressure starts, so a modest early empire that has not yet
// teched `magistracy` is not instantly in revolt. Slope (3) and cap
// (MAX_PRESSURE_EMPIRE) are unchanged — the Courthouse does the real work.
export const OVEREXTENSION_FREE_CITIES = 6;

// Pressure caps shared by the pressure rows and the relief formulas that are bounded by them.
export const MAX_PRESSURE_EMPIRE = 30;
export const MAX_PRESSURE_DISTANCE = 20;

// --- Shapes ---

export interface UnrestPressureRow {
  label: string;
  amount: number;
}

// #919 MR2 — administration ladder. Each entry emits zero or more NEGATIVE rows
// from the positive pressure rows already computed for a city. Later ladder rungs
// (roads-cut-distance, second seat of government, civil-service bureaucracy,
// governors) append an entry here — never a branch in getUnrestPressureBreakdown.
// `id` is source identity; buildingId and researchUnlockTechId declare how the
// source is acquired so AI production/research can score it generically. Keep every
// entry registered in .claude/rules/game-balance.md's "Unrest Relief Inventory" table.
export interface UnrestReliefSource {
  id: string;
  buildingId?: string;
  researchUnlockTechId?: string;
  targetRowLabels: readonly string[];
  isActive(city: City, state: GameState, context: UnrestEvaluationContext): boolean;
  reliefRows(city: City, state: GameState, positiveRows: UnrestPressureRow[], context: UnrestEvaluationContext): UnrestPressureRow[];
  /** Optional AI planning gate for a source that is researched before it can be active. */
  isPotentiallyUseful?(city: City, state: GameState, context: UnrestEvaluationContext): boolean;
}

export interface UnrestEvaluationContext {
  connectedOwnedRoadCityIdsByCivId: Map<string, Set<string>>;
}

export function createUnrestEvaluationContext(): UnrestEvaluationContext {
  return { connectedOwnedRoadCityIdsByCivId: new Map() };
}

export function canGarrisonCity(cityId: string, state: GameState): boolean {
  const city = state.cities[cityId];
  if (!city) return false;
  return Object.values(state.units).some(
    u => u.owner === city.owner && hexDistance(u.position, city.position) === 0,
  );
}

// --- Yield helpers (used by turn-manager) ---

export function getUnrestYieldMultiplier(city: City): number {
  if (city.unrestLevel === 2) return 0.5;
  if (city.unrestLevel === 1) return 0.75;
  return 1.0;
}

export function isCityProductionLocked(city: City): boolean {
  return city.unrestLevel === 2 || (city.productionDisabledTurns ?? 0) > 0;
}
