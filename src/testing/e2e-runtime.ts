import type { GameState, HexCoord } from '@/core/types';
import { isOpponentChallenge } from '@/core/opponent-challenge';
import type { LoadedSaveEntry } from '@/storage/save-manager';
import type { CityBadgeSlot, CityBadgeSlotLayout } from '@/renderer/city-badge-presentation';

export interface ViewportPoint {
  x: number;
  y: number;
}

export interface E2ERuntimeDependencies {
  loadAutosave: () => Promise<LoadedSaveEntry | undefined>;
  enterSoloCampaign: (state: GameState) => Promise<void>;
  getVisibleHexCopies: (coord: HexCoord) => ViewportPoint[];
  getCityBadgeSlots: (cityId: string, slot: CityBadgeSlot) => CityBadgeSlotLayout[];
}

export interface E2EDiagnostics {
  readiness: () => readonly string[];
  errors: () => readonly string[];
  getVisibleHexCopies: (coord: HexCoord) => ViewportPoint[];
  getCityBadgeSlots: (cityId: string, slot: CityBadgeSlot) => CityBadgeSlotLayout[];
}

/**
 * Enters an already-installed solo autosave without resolving difficulty,
 * mutating persistence, or exposing mutable runtime objects to browser tests.
 */
export async function startE2ERuntime(deps: E2ERuntimeDependencies): Promise<E2EDiagnostics> {
  const loaded = await deps.loadAutosave();
  if (!loaded) throw new Error('E2E direct entry requires an installed autosave.');

  const state = loaded.state;
  if (!isOpponentChallenge(state.opponentChallenge)) {
    throw new Error('E2E autosave requires a valid opponent challenge.');
  }
  if (state.hotSeat) {
    throw new Error('E2E direct entry does not bypass hot-seat handoff.');
  }

  const phases = new Set<string>();
  const errors: string[] = [];
  const spritesReady = deps.enterSoloCampaign(state);
  phases.add('campaign-ready');
  void spritesReady.then(
    () => phases.add('sprites-ready'),
    error => errors.push(error instanceof Error ? error.message : String(error)),
  );

  return Object.freeze({
    readiness: () => Object.freeze([...phases]),
    errors: () => Object.freeze([...errors]),
    getVisibleHexCopies: deps.getVisibleHexCopies,
    getCityBadgeSlots: deps.getCityBadgeSlots,
  });
}

export async function installE2ERuntime(deps: E2ERuntimeDependencies): Promise<E2EDiagnostics> {
  const runtime = await startE2ERuntime(deps);
  window.__CONQUESTORIA_E2E_DIAGNOSTICS__ = runtime;
  return runtime;
}
