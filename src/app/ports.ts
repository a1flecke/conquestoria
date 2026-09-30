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
import type { GameState, HexCoord } from '@/core/types';
import type { NotificationEntry } from '@/core/notification-log';
import type { NotificationSink } from '@/ui/notification-routing';
import type { PendingCityCaptureChoice } from '@/input/city-assault-flow';
import type { LandUnitWaterRecovery } from '@/systems/unit-water-recovery';

/**
 * The single owner of game state.
 *
 * Before this port existed, publishing a state change correctly meant writing
 * three statements in the right order (`gameState = …`, `renderLoop.setGameState(…)`,
 * `updateHUD()`), and 46 of 93 assignment sites in `main.ts` did not write all
 * three. `commit()` makes that invariant structural instead of a discipline.
 * #1015 finished that job: the silent write is gone from this interface (68 call
 * sites converted to `commit`/`batch`, four named exceptions behind
 * `UnpublishedStateWriter`). See `.claude/rules/session-publication.md`.
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
   * Run a multi-step transition and publish ONCE, synchronously, when the
   * outermost `batch` returns (or throws). Every `commit`/`update` inside applies
   * to `getState()` immediately but defers publication, so a handler that writes
   * several times, emits bus events and shows notifications refreshes the
   * renderer/HUD/panels exactly once, at the end, with the final state -- the
   * same observable result the old "write silently, then refresh by hand" code
   * aimed for, without a hand-written refresh to forget (#1015).
   *
   * Nested batches coalesce into the outermost one. A batch that never wrote
   * publishes nothing. Do NOT `await` inside `fn`: publication would be deferred
   * across an async gap. Wrap the whole synchronous body and `return` its value:
   * a bare `return` inside the callback only leaves the callback.
   */
  batch<T>(fn: () => T): T;

  /** Returns an unsubscribe function, matching EventBus.on's contract. */
  subscribe(listener: (state: GameState) => void): () => void;
}

/**
 * Why a transition is allowed to change `GameSession` state WITHOUT publishing.
 * Closed set: a new reason is a design decision, made here and pinned in
 * `architecture-boundaries.test.ts`, never at a call site.
 *
 * - `pre-world-entry`: state is being installed before the renderer/HUD/panels
 *   exist for it; `startGame()` (or the handoff overlay) publishes it.
 * - `viewer-not-yet-revealed`: hot-seat handoff. The next player's state is
 *   adopted while an overlay hides it; publishing would flash their fog, yields
 *   and units to the previous viewer. `enterViewerTurn` publishes.
 * - `presentation-deferred`: a caller publishes after it has captured something
 *   the publication would destroy (e.g. AI moves to animate).
 * - `derived-bookkeeping`: a field with no renderer/HUD/panel projection, written
 *   from inside a visibility refresh that may itself run during a publication.
 */
export type UnpublishedReason =
  | 'pre-world-entry'
  | 'viewer-not-yet-revealed'
  | 'presentation-deferred'
  | 'derived-bookkeeping';

/**
 * The ONLY way to change session state without publishing (#1015). It is not on
 * `GameSession`; `bootstrap.ts` hands it to the few controllers that own one of
 * the reasons above, and `architecture-boundaries.test.ts` pins the exact
 * callers and counts. Everything else uses `commit`/`update`/`batch`.
 */
export interface UnpublishedStateWriter {
  adopt(next: GameState, reason: UnpublishedReason): void;
}

/**
 * "The next map tap means something special."
 *
 * This replaces four independent nullable flags in `main.ts`
 * (`pendingCityCaptureChoice`, `pendingJourneyUnitId`, `pendingAirMission`, and
 * `transport-ui-state`'s module-scope pending unload). Four nullables encode 16
 * representable states, of which only 5 are legal; `handleHexTap` disambiguated
 * them by checking in a fixed order, a precedence rule nothing documented or
 * tested. As a union, setting one intent structurally clears the others.
 */
export type PendingMapIntent =
  | { readonly kind: 'none' }
  | { readonly kind: 'journey'; readonly unitId: string }
  | { readonly kind: 'air-mission'; readonly unitId: string; readonly mission: 'strike' | 'recon' | 'patrol' }
  | { readonly kind: 'unload'; readonly transportId: string; readonly cargoUnitId: string; readonly range: readonly HexCoord[] }
  | { readonly kind: 'paradrop'; readonly unitId: string }
  | { readonly kind: 'air-assault'; readonly unitId: string }
  | { readonly kind: 'city-capture'; readonly choice: PendingCityCaptureChoice }
  /** #544 MR4: Last Stand's target-hex selection. `range` is precomputed at
   * pending-intent-set time from getEffectiveCommandStats(general).commandRange,
   * mirroring `unload`'s own precomputed-range convention exactly. */
  | { readonly kind: 'last-stand-target'; readonly unitId: string; readonly range: readonly HexCoord[] };

/**
 * A plain-value read of `SelectionStore` at one instant.
 *
 * Exists so `resolveMapTapIntent` (Phase 8) can be a pure function of a value
 * — `(state, selection: SelectionSnapshot, coord) => MapTapIntent` — instead
 * of closing over a live, mutable store.
 */
export interface SelectionSnapshot {
  readonly selectedUnitId: string | null;
  readonly movementRange: readonly HexCoord[];
  readonly attackRange: readonly HexCoord[];
  readonly pendingIntent: PendingMapIntent;
  readonly waterRecovery: LandUnitWaterRecovery;
}

/**
 * Owns everything about "what the player currently has selected and what their
 * next tap will do" — ten module-scope `let`s in `main.ts` before this port.
 */
export interface SelectionStore {
  /** A frozen-in-time value read; does not include pirate-panel focus. */
  snapshot(): SelectionSnapshot;

  getSelectedUnitId(): string | null;
  setSelectedUnitId(unitId: string | null): void;

  getWaterRecovery(): LandUnitWaterRecovery;
  setWaterRecovery(recovery: LandUnitWaterRecovery): void;

  getMovementRange(): readonly HexCoord[];
  getAttackRange(): readonly HexCoord[];
  /** Sets both ranges together — they are always computed and cleared as a pair. */
  setRanges(movement: readonly HexCoord[], attack: readonly HexCoord[]): void;

  getPirateSelection(): { factionId: string | null; historyId: string | null };
  setPirateSelection(factionId: string | null, historyId: string | null): void;

  getPendingIntent(): PendingMapIntent;
  /** Replaces the intent wholesale and re-arms mis-tap forgiveness. */
  setPendingIntent(intent: PendingMapIntent): void;

  /**
   * True the first time only, per pending-intent lifetime.
   *
   * Mis-tap forgiveness: the first tap outside a pending unload's legal range
   * warns once (toast + error SFX) and every tap after it stays silent, so a
   * child jabbing at the map is not machine-gunned with error sounds.
   */
  shouldWarnOnMistap(): boolean;

  /**
   * Resets the unit selection: selected unit, water recovery, both ranges, and
   * any pending intent EXCEPT a city-capture choice.
   *
   * The capture exception is deliberate and preserves existing behavior: the
   * capture panel owns its own lifecycle and `handleHexTap` returns early while
   * a choice is pending, so deselecting a unit must not silently strand a city
   * the player has already taken but not yet chosen to occupy or raze.
   */
  clear(): void;
}

/**
 * A single button in a `Notifier.choice` prompt.
 *
 * Matches the shape already used by `createPersistentChoiceNotification` at
 * main.ts:4156 (`danger` drives red destructive-action styling, e.g. the
 * espionage "Execute" button) — not a simplified `onSelect`-only shape.
 */
export interface ChoiceAction {
  readonly label: string;
  readonly danger?: boolean;
  readonly onClick: () => void;
}

/**
 * Everything `main.ts` uses to tell the player something happened.
 *
 * `toast` is the pure DOM enqueue (today's `enqueueToast`): it does not touch
 * the notification log. `showNotification`'s log-appending behavior for the
 * active player's own input stays a thin main.ts wrapper around `toast` so
 * the distinction `focusNotificationTarget`/`focusPirateTarget` rely on (a
 * toast that does not create a permanent log entry) is preserved exactly.
 */
export interface Notifier {
  toast(message: string, type: NotificationEntry['type'], target?: NotificationEntry['target'], sfxCue?: string): void;
  /** The full delivery contract: log always, toast if active viewer, queue for hot-seat. */
  readonly deliver: NotificationSink;
  /** A toast that stays until the player picks one of `actions`. */
  choice(message: string, actions: readonly ChoiceAction[]): void;
  /**
   * Stamps notifications produced inside `fn` with `turn` instead of the live
   * state's turn. REQUIRED — `endTurn` and `beginHotSeatHandoff` both wrap
   * `events.commitTo(bus)` in this so a completed round's notifications carry
   * the round's turn, not the new one.
   */
  withHappenedTurn<T>(turn: number, fn: () => T): T;
}
