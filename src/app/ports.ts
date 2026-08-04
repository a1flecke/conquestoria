/**
 * Narrow ports the composition root depends on.
 *
 * Controllers extracted from `src/main.ts` import from this module and nothing
 * else concrete — no `RenderLoop`, no `AudioContext`, no `HTMLCanvasElement`.
 * That keeps test doubles drop-in replacements (LSP) and keeps `main.ts` the
 * only module that constructs concrete services (DIP).
 *
 * See docs/superpowers/plans/2026-08-04-composition-root-decomposition.md.
 */
import type { GameState } from '@/core/types';

/**
 * The single owner of game state.
 *
 * Before this port existed, publishing a state change correctly meant writing
 * three statements in the right order (`gameState = …`, `renderLoop.setGameState(…)`,
 * `updateHUD()`), and 46 of 93 assignment sites in `main.ts` did not write all
 * three. `commit()` makes that invariant structural instead of a discipline.
 */
export interface GameSession {
  /** The single source of truth. Never cache the result across an await. */
  getState(): GameState;

  /**
   * Replace the state and refresh every subscriber (renderer, HUD, open panels).
   * This is the ONLY correct way to publish a state change to the player.
   *
   * Notifies synchronously. Do not add microtask coalescing: async refresh would
   * change observable ordering in `endTurn` and in the hot-seat handoff.
   */
  commit(next: GameState): void;

  /** Read-modify-commit. `fn` must be pure and must not mutate its argument. */
  update(fn: (state: GameState) => GameState): void;

  /**
   * Replace the state WITHOUT refreshing subscribers.
   *
   * Deliberately ugly. It exists only so Phase 2 can be a mechanically
   * behavior-identical refactor of the 46 existing assignment sites that do not
   * currently refresh. Every remaining call site is an open question about
   * whether the player is looking at stale data. Phase 11 drives this to zero
   * or to a documented allowlist.
   */
  setStateWithoutRefresh(next: GameState): void;

  /** Returns an unsubscribe function, matching EventBus.on's contract. */
  subscribe(listener: (state: GameState) => void): () => void;
}
