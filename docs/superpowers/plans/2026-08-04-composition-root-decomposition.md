# Composition Root Decomposition Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do not use subagents** — `CLAUDE.md` forbids them in this repo; execute inline.

**Goal:** Reduce `src/main.ts` from 5,462 lines of module-scope singleton to a ~120-line composition root that constructs services and wires controllers, and collapse the three competing save-normalization routes into one authoritative versioned pipeline.

**Architecture:** Introduce a small set of narrow *ports* (`GameSession`, `Notifier`, `PanelHost`, `SelectionStore`) in `src/app/`, make state ownership explicit before extracting any behavior, then strangler-fig each responsibility out of `main.ts` into a controller that depends only on ports. `main.ts` ends as the single module that knows concrete types (`RenderLoop`, `AudioSystem`, `document`, `EventBus`).

**Tech Stack:** TypeScript (strict), Vite, Vitest (`environment: node` with per-suite jsdom), Canvas 2D renderer, DOM/CSS panels, EventBus.

---

## Global Constraints

- All commands run as `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)"`.
- `yarn test` does **not** type-check. Before every push: `yarn build` **and** `yarn test`, both exit 0.
- Bash timeouts: `git commit` → 30000 ms; `git push` / `gh pr create` → 120000 ms.
- All work happens in this worktree (`architecture-planning-0acde5`). Never on `main`.
- Every phase below is **one PR**, independently mergeable, with the full suite green. No phase leaves `main.ts` in a half-migrated state that another phase must finish.
- **Behavior-preserving.** No player-visible change in any phase except Phase 11's explicitly-listed stale-refresh fixes. If a phase tempts you to fix a bug you find, file an issue and keep the refactor pure.
- **No gameplay change of any kind.** No yields, costs, combat modifiers, tech gating, AI decisions, difficulty scaling, RNG seeding, or victory conditions are touched. `src/systems/`, `src/ai/`, and `src/core/turn-manager.ts` are read-only for this entire plan except where a phase explicitly names a file.
- No new runtime dependencies.
- `Math.random()` remains forbidden. `state.currentPlayer` remains the only ownership source. `innerHTML` with game strings remains forbidden.
- Every phase runs the **determinism guard** (Part V) before merge, not just unit tests. Phases that touch the turn pipeline, difficulty, or campaign entry additionally run `yarn test:ai-playability` and `yarn test:web-smoke` — see Part VI for which.
- Single-file runs work: `yarn test <path>` forwards the path to Vitest (`scripts/run-test-suite.sh` shifts `full` and passes `"$@"` through), then always runs the hook smoke tests.

---

## Part I — Why This, Measured

Numbers below were taken from `src/main.ts` at commit `208dad56`. Re-measure before starting; if they have drifted more than ~10%, re-read the affected section before trusting the task breakdown.

| Metric | Count | What it means |
|---|---|---|
| Total lines | 5,462 | Largest hand-written file in the repo; 2.4x the largest system module (`city-system.ts`, 2,231) |
| Top-level `function` declarations | 103 | All sharing one closure scope |
| Module-scope `let` bindings | **23** | Full inventory in Part II; every one is assigned a phase |
| `bus.on(...)` registrations at module scope | 72 | Run as an import side effect |
| `gameState = …` assignments | 93 | 93 places that can desync the UI |
| `renderLoop.setGameState(…)` calls | 89 | Manual refresh discipline |
| `updateHUD()` calls | 74 | Second manual refresh discipline |
| `gameState = …` with no nearby `setGameState` | 46 | Latent stale-render sites |
| `showNotification(…)` calls | 153 | — |
| Tests that import `@/main` | **0** | The module cannot be imported |
| Assertions in `tests/main.integration.test.ts` that `readFileSync` **the source of `main.ts` and grep it as a string** | 21 | The tell |

That last row is the strongest argument in this document. `tests/main.integration.test.ts` is 334 lines that read `src/main.ts` as text and assert things like:

```ts
expect(main.match(/await beginCampaignEntry\(/g)).toHaveLength(3);
expect(endTurn).toMatch(/await replayAIMoves\(soloMoves\);\s*updateHUD\(\);\s*showRequiredChoicesIfNeeded\(\);/);
```

The team did not choose regex-over-source because it is good testing. They chose it because `main.ts` executes `new AudioContext()`, `document.getElementById(...)`, 72 event-bus registrations, two `window.addEventListener` calls, and `init()` at import time — so there is no way to import it in a test. **Every real behavior in `main.ts` is currently guarded by whitespace-sensitive string matching, or not at all.** Converting those 21 assertions into real behavioral tests is a first-class deliverable of this plan, not incidental churn.

### The three save routes

`grep` for save normalization finds three distinct paths, and a save can go through a different subset depending on how the player got into the game:

1. **Versioned pipeline** — `migrateSaveToCurrent(raw)` in `src/storage/save-migrations.ts`. Numbered migrations 1…`CURRENT_SAVE_SCHEMA_VERSION` (11), each stamping `saveSchemaVersion`. This is the good one.
2. **Unconditional normalizers** — `normalizeLoadedState(state)` in `src/storage/save-manager.ts:825`. Calls `migrateSaveToCurrent` and then ~20 hand-written `normalizeX` / `migrateLegacyX` functions that run on *every* load regardless of version. Reachable from tests via `normalizeLoadedStateForTest`.
3. **`migrateLegacySave()`** — `src/main.ts:5146`, 124 lines, mutates the module-scope `gameState` **in place** with 23 fixups and 20 `as any` casts. Not exported. Not importable. Not tested. Called from exactly one place: `enterCampaign()` at `src/main.ts:5013`.

Route 3 has two concrete defects beyond being untestable:

- **It runs on brand-new hot-seat games.** `showGameModeSelection`'s `onChooseHotSeat` calls `createHotSeatGame(...)` → `enterCampaign(...)` → `migrateLegacySave()`. New *solo* games call `startGame()` directly and skip it. So the two new-game paths do not produce identical state shapes, and nothing tests that they do. **Verified consequence:** `createNewGame` and `createHotSeatGame` both hard-code `knownCivilizations: []` (`src/core/game-state.ts:263, 289, 476`) and neither calls `refreshKnownCivilizations` — so new hot-seat games get their known-civ list populated at entry and new solo games do not. Phase 1 Step 6 is designed to surface exactly this.
- **One of its fixups is not a migration at all.** `gameState.settings.councilTalkLevel = persistedSettings?.councilTalkLevel ?? 'normal'` reads a value loaded from IndexedDB user settings, not from the save. It cannot move into a pure `(state) => state` migration, and a naive "move it all into the pipeline" refactor would either drop it or smuggle a global read into `save-migrations.ts`. Phase 1 handles it explicitly.

---

## Part II — Design

### The mistake to avoid

The obvious move is to start carving out `TurnFlowController`, `SelectionController`, etc. Do not start there. Look at what happened the last time a piece was extracted from `main.ts` — `src/ui/unit-turn-flow.ts`:

```ts
export interface UnitTurnFlowDeps {
  uiLayer: HTMLElement;
  getState: () => GameState;
  setState: (state: GameState) => void;
  getSelectedUnitId: () => string | null;
  selectUnit: (unitId: string) => void;
  deselectUnit: () => void;
  selectNextUnit: () => void;
  centerOn: (coord: HexCoord) => void;
  refreshVisibility: () => void;
  setRenderState: (state: GameState) => void;
  updateHUD: () => void;
  showNotification: (message: string, type: 'info' | 'success' | 'warning') => void;
  setBlockingOverlay: (id: string | null) => void;
  endTurn: (options: { allowUnmovedUnits?: boolean }) => void;
  onUnitDisbanded?: (state: GameState, unitId: string, routeId: string) => GameState;
}
```

Fifteen loose function references, three of which (`setState`, `setRenderState`, `updateHUD`) are the same logical operation split into three callbacks the caller must remember to invoke together. The extraction succeeded — that file is testable — but it paid for it with a deps bag that is itself an Interface Segregation violation, and it left the "remember to refresh" hazard intact and now duplicated across a module boundary.

If we extract six more controllers this way, we get six more 15-field deps bags all naming the same six capabilities, and `main.ts` becomes a 900-line wiring harness instead of a 5,400-line god module. That is not obviously better.

**So: define the ports first, fix state ownership first, then extract.** Each controller should take two to four ports, not fifteen callbacks.

### Complete module-scope binding inventory

Every mutable binding and every stateful construction in `main.ts`, with its destination. Phase 11's boundary test asserts `main.ts` contains **zero** `^let ` — so an unassigned binding is a plan defect, not an implementation detail. This table is the completeness contract.

| Line | Binding | Destination | Phase |
|---|---|---|---|
| 307 | `gameState` | `GameSession` | 2 |
| 308 | `drawer: TreasuryDrawer` | `HudController` | 10 |
| 309 | `selectedUnitId` | `SelectionStore` | 3 |
| 310 | `selectedUnitWaterRecovery` | `SelectionStore` | 3 |
| 311 | `selectedPirateFactionId` | `SelectionStore` | 3 |
| 312 | `selectedPirateHistoryId` | `SelectionStore` | 3 |
| 313 | `movementRange` | `SelectionStore` | 3 |
| 314 | `attackRange` | `SelectionStore` | 3 |
| 317 | `_mistapNotified` | `SelectionStore` (see "mis-tap forgiveness" below) | 3 |
| 318 | `currentCityIndex` | `SelectionStore` | 3 |
| 319 | `inputInitialized` | `GameSessionController` (guard becomes construct-once) | 10 |
| 320 | `councilPanelOpen` | **deleted** — `PanelRouter.isOpen('council')` | 5 |
| 321 | `persistedSettings` | `UserSettingsStore` | 4 |
| 322 | `pacingDebugOpen` | `PanelRouter` (`'pacing-debug'` registry entry) | 5 |
| 323 | `pendingCityCaptureChoice` | `SelectionStore` → `PendingMapIntent` | 3 |
| 324 | `pendingJourneyUnitId` | `SelectionStore` → `PendingMapIntent` | 3 |
| 325 | `pendingAirMission` | `SelectionStore` → `PendingMapIntent` | 3 |
| 326 | `deferWonderDiscoveryRevealUntilMoveSettles` | `CeremonyCoordinator` | 6 |
| 360 | `currentMasterVolume` | `UserSettingsStore` | 4 |
| 377 | `wonderDiscoveryQueue` | `CeremonyCoordinator` | 6 |
| 378 | `legendaryCompletionQueue` | `CeremonyCoordinator` | 6 |
| 713 | `isShowingNotification` | `NotificationCenter` | 4 |
| 714 | `currentDismissTimer` | `NotificationCenter` | 4 |

Non-`let` module-scope state and side effects, same contract:

| Line | Item | Destination | Phase |
|---|---|---|---|
| 354–362 | `bus`, `audioCtx`, `audio`, `roundPresentationGate`, `advisorSystem`, `uiInteractions` | `AppServices`, constructed in `main.ts` | 10 |
| 365–368 | `canvas`, `uiLayer`, `renderLoop`, `airDefenseOverlayButton` | `AppServices` / `HudController` | 10 |
| 422 | `window.addEventListener('resize', …)` | `GameSessionController` | 10 |
| 432–448 | `window.addEventListener('keydown', …)` — Escape cancels journey, backtick toggles pacing debug | `GlobalShortcuts` (see below) | 5 |
| 712 | `notificationQueue` | `NotificationCenter` | 4 |
| 750–755 | `notificationDelivery`, `appendToCivLog` | `NotificationCenter` | 4 |
| 4568 | `notifiedBarbarianCampsPerCiv` | `register-raider-presentation.ts` | 7 |
| 4377–4961 | 72 × `bus.on(...)` | 12 presentation registrars | 7 |
| 5462 | `init()` | `bootstrap()` | 10 |

### Port 1 — `GameSession` (the important one)

```ts
// src/app/ports.ts
export interface GameSession {
  /** The single source of truth. Never cache the result across an await. */
  getState(): GameState;

  /**
   * Replace the state and refresh every subscriber (renderer, HUD, open panels).
   * This is the ONLY correct way to publish a state change to the player.
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
```

Why this is the highest-value change in the plan: today, publishing a state change correctly means writing three statements in the right order, and 46 of 93 sites do not write all three. `commit()` makes the invariant structural instead of a discipline. It also makes every downstream controller trivially testable — a fake `GameSession` over a plain object is ten lines.

`commit()` notifies **synchronously**. Do not add microtask coalescing: async refresh would change observable ordering in `endTurn` and in the hot-seat handoff, which would make Phase 2 a behavior change rather than a refactor. If profiling later shows a hot loop, add explicit batching then (YAGNI).

### Port 2 — `Notifier`

```ts
export interface Notifier {
  /** Transient toast for the active viewer. */
  toast(message: string, type: NotificationEntry['type'], target?: NotificationEntry['target'], sfxCue?: string): void;
  /** The full delivery contract: log always, toast if active viewer, queue for hot-seat. */
  readonly deliver: NotificationSink;
  /** A toast that stays until the player picks one of `actions`. */
  choice(message: string, actions: readonly ChoiceAction[]): void;
  /**
   * Stamps notifications produced inside `fn` with `turn` instead of the live
   * state's turn. REQUIRED — `endTurn` (main.ts:4154) and `beginHotSeatHandoff`
   * (main.ts:4083) both wrap `events.commitTo(bus)` in this so a completed
   * round's notifications carry the round's turn, not the new one. Omitting it
   * from the port leaves Phase 9 unable to compile against `Notifier`.
   */
  withHappenedTurn<T>(turn: number, fn: () => T): T;
}

/** Already defined inline at src/main.ts:4193; move to ports.ts verbatim. */
export interface ChoiceAction {
  readonly label: string;
  readonly onSelect: () => void;
}
```

Backed by the existing `createNotificationDelivery` plus the toast queue currently living in `main.ts:711-965`. That queue is pure DOM + timers with zero game-logic coupling, and it is a 250-line free win for testability with fake timers.

**`sfxCue` is required plumbing, not an optional nicety.** `showNotification`'s fourth parameter routes into `SFX.*`, and several event handlers pass a cue that is the only audio feedback for that event. `NotificationCenterDeps.playCue` is therefore **non-optional** — an optional callback that a wiring mistake leaves `undefined` would silently mute a class of game audio with no test failure. See Part IV, Phase 4.

### Port 3 — `PanelHost`, and the hidden ceremony pump

A naive reading says `PanelHost` just absorbs `createUiInteractionState()`. That is wrong, and getting it wrong silently breaks the game's reward moments. The real `setBlockingOverlay` at `src/main.ts:380` is:

```ts
function setBlockingOverlay(id: string | null): void {
  uiInteractions.setBlockingOverlay(id);
  if (id === null) {
    wonderDiscoveryQueue?.pump();
    legendaryCompletionQueue?.pump();
  }
}
```

**Unblocking the UI is what pumps the natural-wonder discovery and legendary-wonder completion ceremony queues.** Those queues hold the game's biggest payoff moments — the reveal animation, the discovery audio sting, the completion ceremony. If Phase 5 ports `createUiInteractionState` verbatim into `PanelHost`, every ceremony that was queued while a panel was open never plays, and **no existing test would catch it** (there are no tests on this path at all).

So `PanelHost` publishes the unblock, and the ceremony owner subscribes:

```ts
import type { UiInteractionState } from '@/ui/ui-interaction-state';

/**
 * Extends the existing UiInteractionState rather than replacing it: that
 * interface has four consumers besides main.ts (src/ui/context-menu.ts plus
 * tests/ui/keyboard-shortcuts.test.ts and tests/ui/desktop-controls.test.ts),
 * so deleting the module in Phase 5 would break them. The FACTORY
 * (createUiInteractionState) is retired in Phase 11 once PanelHost supplies it
 * everywhere; the interface stays where it is.
 */
export interface PanelHost extends UiInteractionState {
  readonly layer: HTMLElement;
  /** Fires whenever the last blocking overlay clears. Returns an unsubscribe fn. */
  onInteractionUnblocked(listener: () => void): () => void;
  /** Removes the panel with this id if present. Idempotent. */
  close(panelId: PanelId): void;
  closeGroup(group: PanelGroup): void;
}
```

This is the inverted-dependency version of the same behavior: `PanelHost` no longer knows what a wonder ceremony is, and `CeremonyCoordinator` no longer has to be reachable from every `setBlockingOverlay` call site. It is also the reason `CeremonyCoordinator` is its own phase (6) rather than being smeared across the presentation registrars and the selection controller.

### Port 4 — `SelectionStore`, and making illegal states unrepresentable

Ten module-scope `let`s currently model selection and pending input intent:

```ts
let selectedUnitId: string | null;
let selectedUnitWaterRecovery: LandUnitWaterRecovery;
let selectedPirateFactionId: string | null;
let selectedPirateHistoryId: string | null;
let movementRange: HexCoord[];
let attackRange: HexCoord[];
let currentCityIndex: number;
let pendingCityCaptureChoice: PendingCityCaptureChoice | null;
let pendingJourneyUnitId: string | null;
let pendingAirMission: { unitId: string; mission: 'strike' | 'recon' } | null;
```

The last three (plus `getPendingUnload()` from `src/ui/transport-ui-state.ts`) are all "the next map tap means something special." Four independent nullables encode 16 states, of which 5 are legal. `handleHexTap` currently disambiguates by checking them in a fixed order — which is a correct-by-accident precedence rule that nothing documents or tests.

Replace with one discriminated union:

```ts
export type PendingMapIntent =
  | { readonly kind: 'none' }
  | { readonly kind: 'journey'; readonly unitId: string }
  | { readonly kind: 'air-mission'; readonly unitId: string; readonly mission: 'strike' | 'recon' }
  | { readonly kind: 'unload'; readonly transportId: string; readonly range: readonly HexCoord[] }
  | { readonly kind: 'city-capture'; readonly choice: PendingCityCaptureChoice };
```

Setting one intent structurally clears the others, `handleHexTap` becomes an exhaustive `switch` with an `assertNever` default, and the precedence rule stops being emergent. This is the one place in the plan where the type system is doing load-bearing work rather than documentation.

**Mis-tap forgiveness.** `_mistapNotified` (`main.ts:317`, used at `3248`) makes the *first* mis-tap during an unload show a warning toast plus `SFX.error()`, and stay silent afterwards so a child jabbing at the map is not machine-gunned with error sounds. It is reset by `clearUnloadState()`. It belongs to the `unload` intent's lifetime, so it lives in `SelectionStore` and resets whenever `setPendingIntent` changes the intent kind — which is *more* correct than today, where it resets only via `clearUnloadState`. That is a behavior improvement, so it needs a test and a line in the Phase 3 PR body. See Part VI.

### The eighth controller: `CeremonyCoordinator`

The source list of six omits two things that are 600+ lines of `main.ts` between them and that couple across phases. Both get named owners:

**`MapInteractionController`** — `handleHexTap` is **624 lines**, the largest function in the file, larger than most whole modules in this repo. It is not selection, not turn flow, not panel routing. Folding it into `SelectionController` rebuilds the god object one level down. It is split the way this codebase already splits input elsewhere (`src/input/selected-unit-tap-intent.ts` is the precedent): a **pure resolver** `(state, selection, coord) => MapTapIntent` and a **thin executor**.

**`CeremonyCoordinator`** — owns `wonderDiscoveryQueue`, `legendaryCompletionQueue`, `deferWonderDiscoveryRevealUntilMoveSettles`, and `prefersReducedMotion`. Without it, `deferWonderDiscoveryRevealUntilMoveSettles` is written by `executeAnimatedUnitMove` (Phase 8's `SelectionController`) and read by the `wonder:discovered` handler (Phase 7's registrar) — a shared mutable flag straddling two phases, which is precisely the coupling this refactor exists to remove. The flag encodes a real UX rule worth preserving deliberately:

> If a wonder is discovered *by a unit that is currently animating a move*, hold the reveal until the move settles, so the ceremony does not fire over a sliding sprite.

`CeremonyCoordinator` exposes that as an intention-revealing API instead of a boolean:

```ts
export interface CeremonyCoordinator {
  /** Queue a natural-wonder reveal. Plays when nothing is blocking and no move is settling. */
  enqueueWonderDiscovery(item: WonderDiscoveryRevealItem): void;
  enqueueLegendaryCompletion(item: LegendaryWonderCompletionItem): void;
  /** Called around an animated move: reveals queued during the move wait for `endAction`. */
  beginDeferredAction(): void;
  endAction(): void;
}
```

`PresentationCoordinator` is also deliberately *not* a single class. One coordinator owning 72 event subscriptions is the same god object with a nicer name; ~12 `register*Presentation(bus, ctx): () => void` functions give real SRP and let each be tested by emitting on a throwaway bus.

### SOLID, concretely

- **SRP** — `main.ts` currently changes when *any* feature changes: a new unit type, a new panel, a new diplomacy action, a new notification, a new save field. After this plan, adding a panel touches `panel-registry.ts`; adding a notification touches one presentation registrar; adding a save field touches `save-migrations.ts`. Each file has one axis of change.
- **OCP** — two concrete open/closed wins. `togglePanel` (288 lines of `else if (panel === '...')`) becomes a registry the router iterates. The 72 `bus.on` handlers become ~12 domain registrars, each a file you add rather than a chain you edit. **Extension rule, to be written into `CLAUDE.md` in Phase 11:** a new player-visible panel = one `PANEL_REGISTRY` entry; a new game-event notification = one handler inside the existing domain registrar, or a new registrar file if the domain is new; neither ever edits `main.ts`.
- **LSP** — the substitutability that matters here is test doubles: a fake `GameSession` over a plain object, a fake `Notifier` that records calls, and a `PanelHost` over a detached `<div>` must be drop-in for the real ones. Keep the ports free of concrete-type leakage (no `RenderLoop`, no `AudioContext`, no `HTMLCanvasElement` in a port signature) and this holds by construction.
- **ISP** — the reason ports are four small interfaces and not one `AppContext`. `NotificationCenter` takes four fields. Presentation registrars take `GameSession` (read-only usage) and `Notifier`. Only `TurnFlowController` needs all four ports.
- **DIP** — controllers import from `@/app/ports` only. `main.ts` is the sole module allowed to `new RenderLoop(...)`, `new AudioContext()`, or call `document.getElementById`. Phase 11 enforces this mechanically.

### Target file structure

```
src/app/                         [NEW]
  ports.ts                       GameSession, Notifier, PanelHost, SelectionStore,
                                 PendingMapIntent, PanelId, PanelGroup, PanelContext,
                                 ChoiceAction, SelectionSnapshot
  game-session.ts                createGameSession(initial): GameSession
  selection-store.ts             createSelectionStore(): SelectionStore
  user-settings-store.ts         createUserSettingsStore(deps): UserSettingsStore
  panel-host.ts                  createPanelHost(layer): PanelHost
  panel-registry.ts              PANEL_REGISTRY satisfies Readonly<Record<PanelId, PanelDescriptor>>
  panel-router.ts                createPanelRouter(deps): PanelRouter
  global-shortcuts.ts            installGlobalShortcuts(deps): () => void
  controllers/
    campaign-entry-controller.ts   save panel, mode select, campaign/hot-seat setup, enterCampaign
    game-session-controller.ts     startGame: sprite warmup, camera, input install, audio, render start
    hud-controller.ts              updateHUD, treasury drawer, AA overlay button, viewport inset
    turn-flow-controller.ts        endTurn, hot-seat handoff, solo round, AI replay, victory, autosave
    selection-controller.ts        select/deselect/next, highlights, animated moves, auto-explore
    map-interaction-controller.ts  handleHexTap, handleHexLongPress
    ceremony-coordinator.ts        wonder discovery + legendary completion queues, reduced motion
  bootstrap.ts                     wires controllers + registrars; the only async entry point

src/presentation/                [EXISTS — gains the registrars]
  round-presentation-gate.ts     (unchanged)
  register-city-presentation.ts        \
  register-diplomacy-presentation.ts    |
  register-combat-presentation.ts       |  each: (bus, ctx) => () => void
  register-wonder-presentation.ts       |  ~12 files, replacing 72 module-scope bus.on calls
  register-espionage-presentation.ts    |
  register-faction-crisis-presentation.ts
  register-religion-presentation.ts     |
  register-beast-presentation.ts        |
  register-raider-presentation.ts       |  (barbarian + pirate)
  register-network-presentation.ts      |
  register-trade-presentation.ts        |
  register-era-presentation.ts         /
  register-all.ts

src/main.ts                      ~120 lines: construct concrete services, call bootstrap()
```

### Non-goals

- No change to game rules, balance, yields, AI decision-making, difficulty scaling, or victory conditions.
- No renderer or Canvas changes.
- No new save schema *fields* (Phase 1 bumps the version to relocate existing fixups; it adds nothing new).
- No conversion of `src/systems/*` or `src/ui/*` panel modules to classes. The `createX(deps): X` factory idiom is the house style and stays.
- No DI container, no decorators, no `reflect-metadata`. Ports are constructor arguments.
- No new player-facing content, mechanics, sprites, or SFX. This plan is explicitly *not* a feature vehicle — see Part III.

---

## Part III — What This Refactor Must Not Break

You asked for review across gameplay, fun, ages, playstyles, difficulty, AI, UI/UX, extensibility, data, SFX, saves, and hot seat. For a behavior-preserving refactor most of those reduce to one question — *is this surface protected?* — so they are enumerated here as protected surfaces with an owning phase and a guard, rather than as design opportunities.

**On new mechanics and fun specifically:** this plan deliberately adds none. A composition-root refactor is the single worst place to land a gameplay change, because there is no test baseline to distinguish "the refactor broke it" from "the new mechanic changed it." The correct sequencing is: land these 12 phases, *then* build new mechanics on top — which is far cheaper afterwards, because a new mechanic becomes one registrar plus one registry entry instead of another 200 lines in `main.ts`. The extensibility payoff is real, and it is the reward for keeping this plan boring.

### Protected surfaces

| Surface | Why it matters | Where it lives now | Owner | Guard |
|---|---|---|---|---|
| **Difficulty (`'explorer' \| 'standard' \| 'veteran'`)** | The only difficulty dial the game has; a 7-year-old and a 43-year-old need different ones | `main.ts:490-500` (pause menu), `4029` (`applyPendingChallengeForCiv` at handoff), `5304/5325` (setup); `normalizeLoadedState` also drops invalid values on load | `HudController` + `TurnFlowController` + `CampaignEntryController` | Phase 9 test: a pending challenge set mid-game applies at the next handoff, once, for the right civ; plus `yarn test:ai-playability` in Phases 1/9/11 |
| **Legacy-save challenge prompt** | Old saves have no challenge; `showLegacyOpponentChallengePrompt` asks, and skipping it would silently pick a difficulty for the player | `main.ts:5109/5123/5135` via `beginCampaignEntry` | `CampaignEntryController` | Phase 10 test: all three entry routes still pass `showChallengePrompt` |
| **AI move replay** | The only way a player sees what the AI did; without it the world changes silently between turns | `captureAIMoves`/`replayAIMoves`, `main.ts:3852-3884` | `TurnFlowController` | Phase 9 test: solo `endTurn` replays only current-viewer moves, capped at 6, and aborts on gate suppression |
| **Reduced motion** | Accessibility; also the setting a motion-sensitive adult needs to play at all | `prefersReducedMotion`, `main.ts:388` — read by both ceremony queues | `CeremonyCoordinator` | Phase 6 test: with `matchMedia` reporting reduce, queues receive `reducedMotion: true` |
| **Mis-tap forgiveness** | Touch affordance for young/imprecise players — one warning, not one per tap | `_mistapNotified`, `main.ts:317/3248` | `SelectionStore` | Phase 3 test: N mis-taps produce exactly 1 toast and 1 `SFX.error()` |
| **Wonder + legendary ceremonies** | The game's payoff moments; currently pumped by a side effect inside `setBlockingOverlay` | `main.ts:380-386, 393-420, 4482-4516` | `CeremonyCoordinator` | Phase 6 test: a ceremony queued while blocked plays when the overlay clears |
| **Notification dwell + queueing** | Reading speed varies hugely across ages; toasts must queue, never stack or truncate | `main.ts:711-965` | `NotificationCenter` | Phase 4 test: two toasts show sequentially; timer not reset by the second |
| **SFX cue routing** | `sfxCue` on notifications and `SFX.*` calls are the audio half of every action | `showNotification`'s 4th arg; `routeSfxThrough` | `NotificationCenter` + `GameSessionController` | Phase 4: `playCue` is a **required** dep; test asserts cue fires with the toast |
| **Hot-seat audio muting** | Player 2 must not hear player 1's turn; `currentMasterVolume` is restored after handoff | `main.ts:360`, `audio.setMasterVolume(0)` in `enterCampaign`/handoff | `UserSettingsStore` + `TurnFlowController` | Phase 9 test: master volume is 0 during handoff and restored to the stored value after |
| **Icon legend + advisors** | Onboarding surfaces for new and young players | `main.ts:463-476` (legend), `advisorSystem.check` | `PanelRouter` + `GameSessionController` | Phase 5: legend is a registry entry, rebuilt with current techs each open |
| **Keyboard-only play** | A playstyle: end turn, next unit, fortify, settle, center, journey, panels | `installKeyboardShortcuts` in `startGame`; `window.keydown` at `432` | `GameSessionController` + `GlobalShortcuts` | Phase 5/10: every shortcut still reachable; Escape still cancels a journey |
| **Touch-only play** | The primary input per `CLAUDE.md`; long-press, pinch, tap-to-select | `TouchHandler`, `handleHexLongPress` | `MapInteractionController` | Phase 8: long-press opens territory inspection; pinch still suppresses tap |
| **Pacing debug panel** | Balance tooling; backtick-toggled | `main.ts:322, 440-447` | `PanelRouter` (`'pacing-debug'`) | Phase 5: toggle still works and is still keyboard-only |

### How computer players are affected

They are not, and that is enforced rather than assumed. No file under `src/ai/` is modified by any phase. `processNonHumanMajorRound`, `runCompletedRound`, `processTurn`, and `applyStrategicWarningTransitions` are called from `runCurrentCompletedRound` and move to `TurnFlowController` **as a verbatim call**, with the same bus and the same four callbacks.

The repo already owns the right regression suite for this: `tests/simulation/ai-playability.test.ts` (`yarn test:ai-playability`) runs 30-turn simulations across all three difficulties and multiple AI personality sets. It runs in Phases 1, 9, and 11 — see Part VI. Phase 1 Step 1 records the pre-refactor "before" reading.

Two AI-adjacent risks are real and get explicit guards:

1. **`captureAIMoves` is a temporary subscription.** It does `bus.on('unit:move', …)`, runs `result.events.commitTo(bus)`, then unsubscribes. Phase 7 converts 72 permanent handlers into registrars; if a registrar were to be registered *inside* the captured window, or if `commitTo` ordering changed, AI move animations would break or duplicate. Phase 7 Step 6 asserts registrars are installed exactly once at bootstrap, and Phase 9 asserts `captureAIMoves` still observes moves emitted during `commitTo`.
2. **Difficulty application happens at handoff**, not at setup — `applyPendingChallengeForCiv` at `main.ts:4029` is inside `beginHotSeatHandoff`. Moving that function must not move the *timing*, or a mid-game difficulty change would apply a turn early or late. Phase 9 tests the timing, not just the call.

### Data and extensibility

- **Save data:** one authoritative route after Phase 1. The extension rule becomes: a new persisted field gets a numbered migration in `save-migrations.ts`; a derived rebuild gets a normalizer in `save-manager.ts`; a user preference that is not part of the save gets a function in `settings-merge.ts`. Nothing goes in `main.ts` ever again.
- **Panels:** one `PANEL_REGISTRY` entry.
- **Notifications:** one handler in the matching domain registrar.
- **Save compatibility direction:** Phase 1 bumps `CURRENT_SAVE_SCHEMA_VERSION` 11 → 12. Saves written after Phase 1 will throw `UnsupportedSaveSchemaVersionError` in a pre-Phase-1 build. This is the existing, intended contract (forward-incompatible, backward-compatible) and needs a line in the Phase 1 PR body so nobody is surprised mid-playtest. Family playtest saves made during the refactor should be kept on a branch build that is at or ahead of Phase 1.

---

## Part IV — Player Truth Table

Per `docs/superpowers/plans/README.md`. This refactor is behavior-preserving, so the table records what must *remain* true — these are the regressions this plan can plausibly cause, and each row names the phase and test that guards it.

| Before | Action | Immediate visible result that must not change | Guarded by |
|---|---|---|---|
| HUD shows `💰 120`, unit selected | Rush-buy production | HUD gold updates in the same frame; treasury drawer updates | Phase 2 + 10, `game-session.test.ts`, `hud-controller.test.ts` |
| Unit selected, movement overlay drawn | Tap a reachable hex | Unit animates, overlay clears, HUD move count updates, next-unit badge decrements | Phase 8, `map-interaction-controller.test.ts` |
| Transport unload pending | Tap a non-highlighted hex 3 times | Exactly one warning toast and one error SFX, not three | Phase 3, `selection-store.test.ts` |
| Tech panel open | Click another tech to queue | Panel rerenders with the new queue; panel stays open | Phase 5, `panel-router.test.ts` |
| City panel open, queue `A, B, C` | Click `↑` on `C` | Queue rerenders `C, A, B` without closing the panel | Phase 5 (existing `city-panel.test.ts` must stay green) |
| Council panel open | Press `C` | Panel closes; no second panel opens; `isOpen('council')` is false | Phase 5, `panel-router.test.ts` |
| Journey intent armed | Press Escape | "Journey cancelled." toast; next tap behaves normally | Phase 5, `global-shortcuts.test.ts` |
| Natural wonder discovered while a city panel is open | Close the panel | Reveal ceremony plays, discovery audio fires | **Phase 6**, `ceremony-coordinator.test.ts` |
| Natural wonder discovered by a unit mid-move | — | Reveal waits for the move to settle, then plays | Phase 6, `ceremony-coordinator.test.ts` |
| Hot-seat, discovery reveal queued (or deferred) when a player ends their turn | Confirm handoff | Reveal never plays on the *next* player's screen; it is dropped, not carried across the hot-seat veil | Phase 6, `ceremony-coordinator.test.ts` (`clearForHandoff`) |
| Ceremony actively presenting when a hot-seat handoff begins | Handoff completes, ceremony's own promise resolves | Handoff's blocking overlay stays active until the handoff itself clears it; the ceremony resolving does not prematurely unblock the next player's screen | **Phase 12**, `panel-host.test.ts` |
| Pause menu open, difficulty set to a harder challenge | End turn | Challenge applies once, at the next handoff, to the right civ | Phase 9, `turn-flow-controller.test.ts` |
| Hot-seat, player 1 ends turn | Confirm handoff | Blocking overlay, audio muted to 0, autosave, then player 2's HUD/civ name, volume restored | Phase 9, `turn-flow-controller.test.ts` |
| Toast visible, second event fires | — | Second toast queues, shows after the first dismisses; timer not reset | Phase 4, `notification-center.test.ts` |
| Espionage capture pending | Choose "execute" | Persistent choice notification dismisses; exactly one outcome applies | Phase 4, `notification-center.test.ts` |
| Save from schema v10 | Load it | Same map, cities, and treaties as before this refactor | Phase 1, `save-migrations-v12.test.ts` golden fixture |
| Legacy save with no challenge | Load it | Challenge prompt still appears before entry | Phase 10, `campaign-entry-controller.test.ts` |
| Brand-new hot-seat game | Start | Identical state shape to before (no `beasts.migrationPending`, no lair placement on tick 1) | Phase 1, `new-game-completeness.test.ts` |

### Misleading UI risks

The derived surface at risk is **"the HUD/renderer reflects current state."** It is not a label; it is an implicit promise made 93 times.

- An item is legitimately "current" only if the render loop and HUD were refreshed after the most recent `gameState` assignment.
- Near-miss to keep out: a `setStateWithoutRefresh` call whose caller *intended* a visible change. Phase 2 must not convert any site to `setStateWithoutRefresh` on the grounds that "the next line refreshes anyway" — if a refresh follows within the same synchronous block, use `commit` and delete the manual refresh.
- Second near-miss: a ceremony that is *queued* but never pumped reads to the player as "the game forgot my wonder." `CeremonyCoordinator` must expose queue depth in tests so a silently-stuck queue fails loudly.
- Negative test: `game-session.test.ts` asserts `setStateWithoutRefresh` fires **zero** subscriber notifications, and `commit` fires exactly one per call.

### Interaction replay checklist

`handleHexTap` is the replay-sensitive surface; Phase 8 tests must cover, in one session, against one store:

- tap empty hex with nothing selected → no-op
- tap own unit → selects, overlays appear
- tap reachable hex → moves, overlays clear
- tap the *same* hex again immediately → does not re-move a spent unit
- tap enemy unit in range → attack path, not move path
- arm `journey`, then tap → journey path, and intent resets to `none`
- arm `journey`, press Escape, then tap → normal tap behavior (proves intent cleared)
- arm `air-mission`, then arm `journey` → only `journey` is live (proves the union replaced, not merged)
- arm `unload`, mis-tap three times → one toast, one SFX; then tap a valid hex → unload succeeds
- long-press any hex → territory inspection panel, and no selection change

---

## Part V — Phases

Twelve phases, twelve PRs. Phases 1 and 2 are prerequisites for everything after; 3–10 are strictly ordered because each removes state that the next would otherwise thread through a deps bag. Phase 12 was added after Phase 6 shipped, once its inline review surfaced a structural issue (#794) that no earlier phase covered — it has no ordering dependency on 7–10 and could in principle run any time after Phase 6, but is listed last since it was discovered last.

**Every phase ends with the same steps** (written once here, referenced as "**Close the phase**"):

```bash
bash scripts/run-with-mise.sh yarn test
```
```bash
bash scripts/run-with-mise.sh yarn build
```
```bash
bash scripts/run-with-mise.sh yarn test tests/app/determinism-guard.test.ts
```

All must exit 0. Then commit, push, and open a PR whose body states: `main.ts` line count before/after, the module-scope bindings retired (from the Part II inventory), and any intentional behavior change with its test.

### Two gameplay guards, not one

**`yarn test:ai-playability` already exists and is the better of the two.** `tests/simulation/ai-playability.test.ts` runs 30-turn simulations across real difficulty levels (`'explorer' | 'standard' | 'veteran'`) and AI personality sets via `simulateAIRounds` / `simulateLateEraAIRounds`. It is the existing, maintained answer to "do computer players still work and does difficulty still mean anything." **It is slow** (`run-ai-playability-regressions.sh` allows 300 s with a 120 s per-test timeout), so it runs in the phases that can plausibly affect it — Phase 1 (save/state construction), Phase 9 (turn flow, AI replay, difficulty application), and Phase 11 (boundary-lock, the final phase of the *original* eleven-phase scope) — not in every phase. Phase 12 is UI-blocking-overlay-only and does not touch AI, difficulty, or turn flow, so it does not need this guard.

**The determinism guard below is the cheap per-phase complement.** It runs the real turn pipeline with no UI in a couple of seconds, so every phase can afford it.

Two operational facts about it, both learned the hard way in Phase 1:

- It lives in `SLOW_TEST_FILES` (`scripts/run-tests-by-tier.sh`), per `.claude/rules/hooks-and-tooling.md`, because it advances 40 full turn rounds across 4 civs. That means `yarn test:fast` — the **local pre-push gate** — skips it. This is fine and intended: every phase runs it explicitly (`yarn test tests/app/determinism-guard.test.ts`, which forwards the path to Vitest), and CI's required `test` job runs the full suite including the slow tier. Do not assume pushing green means the guard ran.
- Both tests carry explicit headroom timeouts (30 s / 15 s). Solo local runs are ~1.5 s / 0.7 s, but the first test was measured at 6.6 s on CI, and it failed the very first CI run on vitest's 5 s default. A simulation test on the default timeout produces a red build that looks exactly like a gameplay regression.

**No `toMatchSnapshot`.** This repo has zero snapshot files and zero snapshot assertions — introducing them here would both break convention and pick exactly the wrong tool, since a snapshot's failure mode is "re-record until green," which is the one response this guard must never permit. Record the numbers once from the pre-refactor build and write them as literals.

`tests/app/determinism-guard.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { createNewGame } from '@/core/game-state';
import { runCompletedRound } from '@/core/completed-round-orchestrator';
import { processImprovementTurns } from '@/systems/improvement-turn-system';
import { processNonHumanMajorRound } from '@/ai/ai-round-scheduler';
import { processTurn } from '@/core/turn-manager';
import { applyStrategicWarningTransitions } from '@/systems/strategic-warning-system';
import type { GameState } from '@/core/types';

function advance(state: GameState, rounds: number): GameState {
  let current = state;
  for (let i = 0; i < rounds; i += 1) {
    const bus = new EventBus();
    const result = runCompletedRound(current, bus, {
      improvements: (s, b) => processImprovementTurns(s, b),
      majors: (s, b) => processNonHumanMajorRound(s, b).state,
      world: (s, b) => processTurn(s, b),
      postprocess: (before, s, b) => applyStrategicWarningTransitions(before, s, b),
    });
    if (!result.ok) throw result.error;
    current = result.state;
  }
  return current;
}

describe('determinism guard', () => {
  it('20 rounds from a fixed seed produce a byte-identical state across runs', () => {
    const config = { civType: 'generic' as const, mapSize: 'small' as const, opponentCount: 3, gameTitle: 'guard', seed: 20260804 };
    const a = advance(createNewGame(config), 20);
    const b = advance(createNewGame(config), 20);

    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it('matches the recorded baseline digest for this seed', () => {
    const config = { civType: 'generic' as const, mapSize: 'small' as const, opponentCount: 3, gameTitle: 'guard', seed: 20260804 };
    const state = advance(createNewGame(config), 20);

    // BASELINE — recorded once in Phase 1 Step 1 from the pre-refactor build, then
    // written here as literals. Deliberately NOT a snapshot: a snapshot invites
    // `-u` when it fails, and the only correct response to this failing is to find
    // which phase moved a system call and revert it. Any phase that changes these
    // numbers has changed gameplay, which this plan forbids.
    expect(state.turn).toBe(/* fill from Step 1 */ 21);
    expect(state.era).toBe(/* fill from Step 1 */ 1);
    expect(Object.keys(state.cities).length).toBe(/* fill from Step 1 */ 0);
    expect(Object.keys(state.units).length).toBe(/* fill from Step 1 */ 0);
    expect(
      Object.fromEntries(Object.entries(state.civilizations).map(([id, c]) => [id, c.gold])),
    ).toEqual(/* fill from Step 1 */ {});
  });
});
```

The `/* fill from Step 1 */` values are the one place in this plan where a number is not yet known — they are *recorded output*, not a design decision, and Phase 1 Step 1 is the step that records them. Replace every one before committing; a placeholder left in place is a failed step.

This runs the real turn pipeline with no UI, so it is unaffected by every phase *except* one that accidentally changes a system call — which is exactly the failure it exists to catch. Record the snapshot in Phase 1, before any other change.

---

### Phase 1 — One authoritative save route

**Independent of every other phase.** Do it first: lowest risk, deletes 124 lines and 20 `as any` casts, and decouples `enterCampaign` so Phase 10 can move it cleanly.

**Files:**
- Create: `src/storage/settings-merge.ts`, `tests/app/determinism-guard.test.ts`, `tests/storage/save-migrations-v12.test.ts`, `tests/storage/new-game-completeness.test.ts`
- Modify: `src/storage/save-migrations.ts`, `src/storage/save-manager.ts:825-888`, `src/main.ts:5006-5088`; delete `src/main.ts:5146-5269`

**Interfaces:**
- Consumes: `SaveMigration = (state: GameState) => GameState`, `SAVE_MIGRATIONS`, `CURRENT_SAVE_SCHEMA_VERSION` (already exported from `save-migrations.ts`).
- Produces: `applyPersistedUserSettings(state, persisted): GameState` from `@/storage/settings-merge`. `migrateLegacySave` ceases to exist.

**Classification.** Every one of `migrateLegacySave`'s 23 fixups goes into exactly one of three buckets. Do this classification before writing code and put the table in the PR body.

| # | Fixup (`main.ts:5146+`) | Bucket | Destination |
|---|---|---|---|
| 1 | `civ.civType ??= 'generic'` | versioned | `SAVE_MIGRATIONS[12]` |
| 2 | `civ.lastCombatTurnByLandmass ??= {}` | versioned | `SAVE_MIGRATIONS[12]` |
| 3 | `civ.diplomacy` default construct | versioned | `SAVE_MIGRATIONS[12]` |
| 4 | `settings.advisorsEnabled` full default | versioned | `SAVE_MIGRATIONS[12]` |
| 5 | add `treasurer` / `scholar` (M3b) | versioned | `SAVE_MIGRATIONS[12]` |
| 6 | add `spymaster` (M4a) | versioned | `SAVE_MIGRATIONS[12]` |
| 7 | `pendingEvents ??= {}` | versioned | `SAVE_MIGRATIONS[12]` |
| 8 | `tribalVillages` / `discoveredWonders` / `wonderDiscoverers` defaults | versioned | `SAVE_MIGRATIONS[12]` |
| 9 | `legendaryWonderHistory` default + `networkPlanResolutions ??= []` + `discoveredSites` backfill from `wonderDiscoverers` | versioned | `SAVE_MIGRATIONS[12]` |
| 10 | `legendaryWonderIntel ??= {}` | versioned | `SAVE_MIGRATIONS[12]` |
| 11 | `tile.wonder ??= null` backfill | versioned | `SAVE_MIGRATIONS[12]` |
| 12 | `unit.isResting ??= false` backfill | versioned | `SAVE_MIGRATIONS[12]` |
| 13 | `minorCivs ??= {}` | versioned | `SAVE_MIGRATIONS[12]` |
| 14 | `techState.trackPriorities` all-15-tracks backfill | versioned | `SAVE_MIGRATIONS[12]` |
| 15 | `marketplace ??= createMarketplaceState()` | versioned | `SAVE_MIGRATIONS[12]` |
| 16 | `TradeRoute` reshape: `id`, `goldPerTrip`, `turnsPerTrip`, `delete goldPerTurn` | versioned | `SAVE_MIGRATIONS[12]` |
| 17 | `beasts` default with `migrationPending: true` | versioned | `SAVE_MIGRATIONS[12]` |
| 18 | `resurgentCampCooldownByCivLandmass ??= {}` | versioned | `SAVE_MIGRATIONS[12]` |
| 19 | `civ.knownCivilizations ??= []` | **derived** | `normalizeLoadedState` (superseded by #20) |
| 20 | `refreshKnownCivilizations(state, civId)` per civ | **derived** | `normalizeLoadedState` |
| 21 | `reconstructLastSeenFromMap(state, civId)` per civ | **derived** | `normalizeLoadedState` |
| 22 | `clearStaleSoloPendingEvents(state)` | **derived** | `normalizeLoadedState` |
| 23 | `settings.councilTalkLevel ??= persistedSettings?.councilTalkLevel ?? 'normal'` | **runtime settings** | `settings-merge.ts` — see below |

**Why #19–22 are not versioned:** they recompute state derivable from the map and civ roster. A versioned migration runs once, at one version boundary; these must run on *every* load, because a save written by a build with a since-fixed visibility bug still needs its `lastSeen` rebuilt. `normalizeLoadedState` already hosts functions of this shape (`normalizeThreatPressureDefaults`, `normalizeMinorCivQuestState`).

**Why #23 cannot move:** `persistedSettings` is loaded from IndexedDB by `loadSettings()`, not from the save. A migration signature is `(state) => GameState`; smuggling a module-global read into `save-migrations.ts` would make migrations non-deterministic and untestable.

```ts
// src/storage/settings-merge.ts
import type { GameState } from '@/core/types';

/**
 * Applies user-level (IndexedDB) settings that are NOT part of the save.
 * Deliberately not a SaveMigration: it depends on runtime user preferences,
 * so it can never be a deterministic (state) => state function.
 */
export function applyPersistedUserSettings(
  state: GameState,
  persisted: GameState['settings'] | undefined,
): GameState {
  if (state.settings.councilTalkLevel) return state;
  return {
    ...state,
    settings: { ...state.settings, councilTalkLevel: persisted?.councilTalkLevel ?? 'normal' },
  };
}
```

**TypeScript note.** `migrateLegacySave` uses `(x as any)` twenty times because it operates on data whose type is a *lie* — typed `GameState`, actually an older shape. Do not carry the casts across:

```ts
/** A save of an older schema: same keys, but any of them may be absent. */
type LegacyShape<T> = { [K in keyof T]?: T[K] | undefined } & Record<string, unknown>;

function withDefault<T, K extends keyof T>(
  source: LegacyShape<T>, key: K, fallback: T[K],
): T[K] {
  const value = source[key];
  return value === undefined ? fallback : (value as T[K]);
}
```

- [ ] **Step 1: Record the determinism baseline first**

Create `tests/app/determinism-guard.test.ts` as written in Part V, run it, read the actual values out of the failure output, and write them in as literals **before touching any source file**. This is the pre-refactor baseline for all twelve phases.

```bash
bash scripts/run-with-mise.sh yarn test tests/app/determinism-guard.test.ts
```
Expected on the first run: the first test PASSES (run-to-run determinism), the second FAILS with the real values in the diff. Copy those in, re-run, expect PASS.

Then confirm the existing AI/difficulty regression suite is green on the untouched build — this is the "before" reading you compare against in Phase 9:

```bash
bash scripts/run-with-mise.sh yarn test:ai-playability
```

```bash
git add tests/app && git commit -m "test: record pre-refactor determinism baseline"
```

- [ ] **Step 2: Write the failing migration-12 test**

`tests/storage/save-migrations-v12.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { createNewGame } from '@/core/game-state';

const CONFIG = { civType: 'generic' as const, mapSize: 'small' as const, opponentCount: 1, gameTitle: 't', seed: 7 };

function asV11(state: unknown): Record<string, unknown> {
  return { ...(state as Record<string, unknown>), saveSchemaVersion: 11 };
}

describe('save migration 12 — absorbed main.ts legacy fixups', () => {
  it('backfills civType, diplomacy, and lastCombatTurnByLandmass on a v11 save', () => {
    const raw = asV11(createNewGame(CONFIG));
    const civs = raw.civilizations as Record<string, Record<string, unknown>>;
    for (const civ of Object.values(civs)) {
      delete civ.civType;
      delete civ.diplomacy;
      delete civ.lastCombatTurnByLandmass;
    }

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    for (const civ of Object.values(migrated.civilizations)) {
      expect(civ.civType).toBe('generic');
      expect(civ.lastCombatTurnByLandmass).toEqual({});
      expect(civ.diplomacy.atWarWith).toEqual([]);
      expect(civ.diplomacy.treaties).toEqual([]);
    }
  });

  it('reshapes legacy trade routes to id/goldPerTrip/turnsPerTrip and drops goldPerTurn', () => {
    const raw = asV11(createNewGame(CONFIG));
    (raw.marketplace as { tradeRoutes: unknown[] }).tradeRoutes = [
      { fromCityId: 'a', toCityId: 'b', goldPerTurn: 4 },
    ];

    const migrated = migrateSaveToCurrent(raw);
    const [route] = migrated.marketplace.tradeRoutes;

    expect(route.id).toBe('route-legacy-1');
    expect(route.goldPerTrip).toBe(12);
    expect(route.turnsPerTrip).toBe(3);
    expect('goldPerTurn' in route).toBe(false);
  });

  it('flags legacy saves with no beasts block so lairs place on the first tick', () => {
    const raw = asV11(createNewGame(CONFIG));
    delete raw.beasts;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.beasts.migrationPending).toBe(true);
    expect(migrated.beasts.lairs).toEqual({});
  });

  it('is idempotent — migrating an already-migrated save changes nothing', () => {
    // migrateLegacySave ran on EVERY entry, so most real v11 saves already have
    // these fields. Migration 12 must be a no-op for them.
    const raw = asV11(createNewGame(CONFIG));
    const once = migrateSaveToCurrent(raw);
    const twice = migrateSaveToCurrent({ ...once, saveSchemaVersion: 11 });

    expect(JSON.stringify(twice)).toBe(JSON.stringify(once));
  });

  it('preserves an existing beasts block instead of resetting it', () => {
    const raw = asV11(createNewGame(CONFIG));
    const lairs = (raw.beasts as { lairs: unknown }).lairs;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.beasts.lairs).toEqual(lairs);
    expect(migrated.beasts.migrationPending).toBeUndefined();
  });
});
```

The idempotency case is not optional: `migrateLegacySave` ran on *every* campaign entry, so nearly every real v11 save already carries these fields. A migration 12 that clobbers rather than defaults would wipe live player data.

- [ ] **Step 3: Run it and confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations-v12.test.ts
```
Expected: FAIL — `civType` is `undefined`, route has no `id`, `beasts.migrationPending` is `undefined`.

- [ ] **Step 4: Add migration 12**

In `src/storage/save-migrations.ts`: add `migrateLegacyMainFixups` implementing rows 1–18 (port bodies verbatim from `src/main.ts:5146-5269`, replacing each `(x as any)` with `withDefault` or an object spread), register as `SAVE_MIGRATIONS[12]`, set `CURRENT_SAVE_SCHEMA_VERSION = 12`.

Three ordering requirements carried over from `main.ts`, each needing a comment:
- row 8 before row 9 — the `discoveredSites` backfill reads `wonderDiscoverers`;
- row 15 before row 16 — the trade-route reshape reads `marketplace`;
- every fixup uses `??=` / presence checks, never unconditional assignment (idempotency).

- [ ] **Step 5: Run the test — expect PASS**

- [ ] **Step 6: Move the derived rebuilds into `normalizeLoadedState`**

In `src/storage/save-manager.ts`, add rows 19–22 to `normalizeLoadedState`: `refreshKnownCivilizations` and `reconstructLastSeenFromMap` for every civ, then `clearStaleSoloPendingEvents`. Order matters — `reconstructLastSeenFromMap` runs after known-civ refresh, matching `main.ts:5233-5241`.

- [ ] **Step 7: Write the new-game completeness test**

**Critical framing correction — read before writing this test.** `createNewGame` and `createHotSeatGame` never set `saveSchemaVersion` (verified: no occurrence in `src/core/game-state.ts`). `getSourceVersion` therefore returns **0** for a fresh state, so `normalizeLoadedState(createNewGame(...))` runs **migrations 1 through 12**, not just 12. That is real existing behavior — a brand-new game autosaved before any load carries no version, so its first load replays the whole chain — and it is exactly why migration 12 must be idempotent and no-op on modern state (Step 2's fourth case).

It also means a naive whole-state `toEqual` here is a **bad gate**: it would fail on any pre-existing non-idempotency anywhere in migrations 1–11, blocking Phase 1 on defects Phase 1 did not introduce. So the gate is scoped to what Phase 1 actually moves, and the whole-state comparison is kept separately as a **diagnostic that is allowed to fail loudly without blocking**.

`tests/storage/new-game-completeness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { normalizeLoadedState } from '@/storage/save-manager';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import type { GameState } from '@/core/types';

const solo = (): GameState => createNewGame({
  civType: 'generic', mapSize: 'small', opponentCount: 2, gameTitle: 'solo', seed: 42,
});

// Match this literal to the real HotSeatConfig type before running.
const hotSeat = (): GameState => createHotSeatGame(
  { players: [{ name: 'A', isHuman: true, civType: 'generic' }, { name: 'B', isHuman: true, civType: 'generic' }], mapSize: 'small' },
  undefined,
  'hot seat',
  'standard',
);

describe('freshly created games need no legacy fixups', () => {
  // THE GATE: only the fields Phase 1 relocates. Scoped deliberately — a fresh
  // state has no saveSchemaVersion, so this runs migrations 1..12, and a whole-
  // state assertion would fail on unrelated pre-existing non-idempotency.
  for (const [label, make] of [['solo', solo], ['hot seat', hotSeat]] as const) {
    it(`${label}: the relocated fixups are all no-ops on fresh state`, () => {
      const state = make();
      const normalized = normalizeLoadedState(structuredClone(state));

      expect(normalized.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
      expect(normalized.beasts.migrationPending).toBeUndefined();
      expect(normalized.beasts.lairs).toEqual(state.beasts.lairs);
      expect(normalized.marketplace.tradeRoutes).toEqual(state.marketplace.tradeRoutes);
      expect(normalized.minorCivs).toEqual(state.minorCivs);
      expect(normalized.legendaryWonderHistory).toEqual(state.legendaryWonderHistory);
      expect(normalized.settings.advisorsEnabled).toEqual(state.settings.advisorsEnabled);
      for (const [civId, civ] of Object.entries(normalized.civilizations)) {
        expect(civ.civType).toBe(state.civilizations[civId].civType);
        expect(civ.diplomacy).toEqual(state.civilizations[civId].diplomacy);
        expect(civ.techState.trackPriorities).toEqual(state.civilizations[civId].techState.trackPriorities);
      }
    });
  }

  // THE DIAGNOSTIC: reports total divergence. If this fails, read the diff and
  // decide — it may be a Phase 1 defect, or a pre-existing migration 1..11 issue
  // that deserves its own issue. Do not delete it and do not let it block Phase 1.
  it('diagnostic: reports any other divergence between fresh state and the load pipeline', () => {
    const state = solo();
    const normalized = normalizeLoadedState(structuredClone(state));

    expect(normalized).toEqual({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION });
  });
});
```

**Expected divergence, and the correct response.** `createNewGame` and `createHotSeatGame` both hard-code `knownCivilizations: []` (`src/core/game-state.ts:263, 289, 476`) and never call `refreshKnownCivilizations`. If that function computes a non-empty list at turn 1, the diagnostic fails on `knownCivilizations` — a genuine pre-existing inconsistency, since new hot-seat games got the refresh at entry and new solo games did not.

**Fix it by making `createNewGame`/`createHotSeatGame` produce complete state**, not by re-adding an entry-time call and not by loosening the assertion. Note the fix in the PR body as an intentional behavior change, and re-run the Step 1 determinism baseline — if those numbers move, you changed gameplay and must stop.

If the diagnostic instead fails on something owned by migrations 1–11, file an issue, add a scoped `expect(...).toEqual(...)` exclusion with the issue number in a comment, and continue. Phase 1 is not the place to fix a five-migration-old bug.

- [ ] **Step 8: Delete `migrateLegacySave` and rewire `enterCampaign`**

Delete `src/main.ts:5146-5269`. In `enterCampaign`, replace `gameState = state; migrateLegacySave();` with:

```ts
gameState = applyPersistedUserSettings(state, persistedSettings);
```

Add `src/storage/settings-merge.ts` plus a two-case unit test (respects an existing `councilTalkLevel`; falls back to `'normal'` when neither save nor persisted settings have one).

- [ ] **Step 9: Confirm the source-grep suite still passes**

No assertion currently names `migrateLegacySave`, but verify rather than assume:

```bash
bash scripts/run-with-mise.sh yarn test tests/main.integration.test.ts
```

- [ ] **Step 10: Close the phase**

```bash
git add src/storage src/core/game-state.ts src/main.ts tests && git commit -m "refactor(save): fold main.ts legacy fixups into the versioned migration pipeline"
```

---

### Phase 2 — `GameSession`: one owner for game state

**Files:**
- Create: `src/app/ports.ts`, `src/app/game-session.ts`, `tests/app/game-session.test.ts`
- Modify: `src/main.ts` — replace `let gameState` and all 93 assignment sites

**Interfaces:**
- Produces: `GameSession` (full signature in Part II), `createGameSession(initial: GameState): GameSession`.
- Consumes: nothing.

- [ ] **Step 1: Write the failing test**

`tests/app/game-session.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { createGameSession } from '@/app/game-session';
import type { GameState } from '@/core/types';

const stub = (turn: number): GameState => ({ turn } as unknown as GameState);

describe('createGameSession', () => {
  it('commit publishes the new state to every subscriber exactly once', () => {
    const session = createGameSession(stub(1));
    const a = vi.fn();
    const b = vi.fn();
    session.subscribe(a);
    session.subscribe(b);

    session.commit(stub(2));

    expect(session.getState().turn).toBe(2);
    expect(a).toHaveBeenCalledTimes(1);
    expect(b).toHaveBeenCalledTimes(1);
    expect(a).toHaveBeenCalledWith(session.getState());
  });

  it('setStateWithoutRefresh changes state and notifies nobody', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    session.subscribe(listener);

    session.setStateWithoutRefresh(stub(2));

    expect(session.getState().turn).toBe(2);
    expect(listener).not.toHaveBeenCalled();
  });

  it('update applies a pure transform and publishes once', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    session.subscribe(listener);

    session.update(state => ({ ...state, turn: state.turn + 1 }));

    expect(session.getState().turn).toBe(2);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('unsubscribe stops delivery', () => {
    const session = createGameSession(stub(1));
    const listener = vi.fn();
    const off = session.subscribe(listener);

    off();
    session.commit(stub(2));

    expect(listener).not.toHaveBeenCalled();
  });

  it('a subscriber that throws does not prevent later subscribers from running', () => {
    const session = createGameSession(stub(1));
    const boom = vi.fn(() => { throw new Error('render failed'); });
    const after = vi.fn();
    session.subscribe(boom);
    session.subscribe(after);

    expect(() => session.commit(stub(2))).not.toThrow();
    expect(after).toHaveBeenCalledTimes(1);
  });
});
```

The last case matters: today a throw inside `updateHUD()` aborts the statement sequence and skips `renderLoop.setGameState`. Isolating subscribers is a genuine robustness improvement and is behavior-compatible.

- [ ] **Step 2: Run it, confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/app/game-session.test.ts
```
Expected: FAIL — `Cannot find module '@/app/game-session'`.

- [ ] **Step 3: Implement**

`src/app/game-session.ts`:

```ts
import type { GameState } from '@/core/types';
import type { GameSession } from '@/app/ports';

export function createGameSession(initial: GameState): GameSession {
  let state = initial;
  const listeners = new Set<(next: GameState) => void>();

  const publish = (): void => {
    for (const listener of [...listeners]) {
      try {
        listener(state);
      } catch (error) {
        // One failing view must not strand the others mid-refresh.
        console.error('GameSession subscriber failed:', error);
      }
    }
  };

  return {
    getState: () => state,
    commit(next) { state = next; publish(); },
    update(fn) { state = fn(state); publish(); },
    setStateWithoutRefresh(next) { state = next; },
    subscribe(listener) {
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Adopt in `main.ts`**

Replace `let gameState: GameState;` with a module-scope `session` created in `enterCampaign`/`startGame`. Register the two subscribers once, where `renderLoop` and the HUD are known:

```ts
session.subscribe(next => renderLoop.setGameState(next));
session.subscribe(() => updateHUD());
```

Then convert call sites. Two mechanical rules, applied literally:

- `gameState = X;` followed (within the same synchronous block, before any `await` or `return`) by `renderLoop.setGameState(gameState)` and/or `updateHUD()` → `session.commit(X);` and **delete** the manual refresh lines.
- `gameState = X;` with no refresh in the same block → `session.setStateWithoutRefresh(X);` with `// TODO(composition-root): verify refresh` above it.

Do **not** exercise judgment about which unrefreshed sites "should" refresh — that is a behavior change, deferred to Phase 11. Convert 93 sites in ~6 commits of ~15 each.

- [ ] **Step 6: Add the debt ratchet**

`tests/app/refresh-bypass-ratchet.test.ts` (its own file — it is a debt counter, not a unit test of `GameSession`):

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

describe('refresh bypass debt', () => {
  it('tracks how many state writes still bypass the refresh path', () => {
    const main = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf8');
    const bypasses = main.match(/setStateWithoutRefresh\(/g)?.length ?? 0;
    // Ratchet only. Lower when you eliminate a bypass; never raise it.
    expect(bypasses).toBeLessThanOrEqual(46);
  });
});
```

This is the one source-grep assertion this plan *adds*, and it is legitimate: it measures a debt counter that can only move one direction. Phase 11 drives it to 0 and deletes the file.

- [ ] **Step 7: Close the phase**

---

### Phase 3 — `SelectionStore`, `PendingMapIntent`, and mis-tap forgiveness

**Files:**
- Create: `src/app/selection-store.ts`, `tests/app/selection-store.test.ts`; extend `src/app/ports.ts`
- Modify: `src/main.ts` (10 module `let`s); delete `src/ui/transport-ui-state.ts`

**Interfaces:**
- Consumes: `GameSession` (Phase 2).
- Produces:

```ts
export interface SelectionSnapshot {
  readonly selectedUnitId: string | null;
  readonly movementRange: readonly HexCoord[];
  readonly attackRange: readonly HexCoord[];
  readonly pendingIntent: PendingMapIntent;
  readonly waterRecovery: LandUnitWaterRecovery;
}

export interface SelectionStore {
  snapshot(): SelectionSnapshot;
  getSelectedUnitId(): string | null;
  setSelectedUnitId(unitId: string | null): void;
  getWaterRecovery(): LandUnitWaterRecovery;
  setWaterRecovery(recovery: LandUnitWaterRecovery): void;
  getMovementRange(): readonly HexCoord[];
  getAttackRange(): readonly HexCoord[];
  setRanges(movement: readonly HexCoord[], attack: readonly HexCoord[]): void;
  getPirateSelection(): { factionId: string | null; historyId: string | null };
  setPirateSelection(factionId: string | null, historyId: string | null): void;
  getCityCursor(): number;
  advanceCityCursor(cityCount: number): number;
  getPendingIntent(): PendingMapIntent;
  /** Replaces the intent wholesale and resets mis-tap forgiveness. */
  setPendingIntent(intent: PendingMapIntent): void;
  /** True the first time only, per pending-intent lifetime. */
  shouldWarnOnMistap(): boolean;
  clear(): void;
}
```

`snapshot()` exists so `resolveMapTapIntent` (Phase 8) can be a pure function of a plain value rather than of a live store.

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from 'vitest';
import { createSelectionStore } from '@/app/selection-store';

describe('createSelectionStore', () => {
  it('replaces the pending intent instead of accumulating independent flags', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'air-mission', unitId: 'u1', mission: 'strike' });
    store.setPendingIntent({ kind: 'journey', unitId: 'u2' });

    expect(store.getPendingIntent()).toEqual({ kind: 'journey', unitId: 'u2' });
  });

  it('warns on the first mis-tap only, per pending-intent lifetime', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'unload', transportId: 't1', range: [] });

    expect(store.shouldWarnOnMistap()).toBe(true);
    expect(store.shouldWarnOnMistap()).toBe(false);
    expect(store.shouldWarnOnMistap()).toBe(false);
  });

  it('re-arming a pending intent re-arms the mis-tap warning', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'unload', transportId: 't1', range: [] });
    store.shouldWarnOnMistap();

    store.setPendingIntent({ kind: 'unload', transportId: 't2', range: [] });

    expect(store.shouldWarnOnMistap()).toBe(true);
  });

  it('clear() resets selection, ranges, and pending intent together', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('u1');
    store.setRanges([{ q: 0, r: 0 }], [{ q: 1, r: 0 }]);
    store.setPendingIntent({ kind: 'journey', unitId: 'u1' });

    store.clear();

    expect(store.getSelectedUnitId()).toBeNull();
    expect(store.getMovementRange()).toEqual([]);
    expect(store.getAttackRange()).toEqual([]);
    expect(store.getPendingIntent()).toEqual({ kind: 'none' });
  });

  it('advanceCityCursor wraps at the city count', () => {
    const store = createSelectionStore();
    expect(store.advanceCityCursor(3)).toBe(1);
    expect(store.advanceCityCursor(3)).toBe(2);
    expect(store.advanceCityCursor(3)).toBe(0);
  });
});
```

- [ ] **Step 2: Run, confirm failure.** Expected: `Cannot find module '@/app/selection-store'`.

- [ ] **Step 3: Implement** `createSelectionStore(): SelectionStore` — plain closure over the ten values, `PendingMapIntent` defaulting to `{ kind: 'none' }`, `clear()` resetting all of them, `setPendingIntent` resetting the mis-tap flag.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Adopt.** Delete the ten `let`s from `main.ts`. Fold `src/ui/transport-ui-state.ts`'s `getPendingUnload` / `setPendingUnload` / `clearPendingUnload` into the `unload` variant and delete that file. `clearUnloadState()` becomes `selection.setPendingIntent({ kind: 'none' })`.

`handleHexTap`'s intent checks stay as `if` chains for now — restructuring is Phase 8. Only storage changes here.

- [ ] **Step 6: Document the one behavior change.** Mis-tap forgiveness now re-arms whenever the pending intent changes, where previously it re-armed only via `clearUnloadState`. State this in the PR body; it is strictly friendlier (a fresh action gets a fresh warning) and is covered by the third test above.

- [ ] **Step 7: Close the phase**

---

### Phase 4 — `NotificationCenter` and `UserSettingsStore`

Moves `src/main.ts:711-965` and `4185-4229` (~290 lines) plus the settings/volume bindings.

**Files:**
- Create: `src/ui/notification-center.ts`, `src/app/user-settings-store.ts`, `tests/ui/notification-center.test.ts`, `tests/app/user-settings-store.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `PanelHost.layer` (or a raw `HTMLElement` until Phase 5), `createNotificationDelivery` (existing).
- Produces:

```ts
export interface NotificationCenterDeps {
  readonly layer: HTMLElement;
  readonly getState: () => GameState;
  readonly isSuppressed: () => boolean;
  /** REQUIRED. An optional cue callback would silently mute game audio on a wiring mistake. */
  readonly playCue: (cue: string) => void;
}
export function createNotificationCenter(deps: NotificationCenterDeps): Notifier;

export interface UserSettingsStore {
  getPersisted(): GameState['settings'] | undefined;
  refresh(): Promise<GameState['settings']>;
  getOverrides(): Partial<GameState['settings']>;
  getMasterVolume(): number;
  setMasterVolume(value: number): void;
  setCustomCivilizations(civs: GameState['settings']['customCivilizations']): void;
}
export function createUserSettingsStore(deps: {
  load: () => Promise<GameState['settings'] | undefined>;
  save: (settings: GameState['settings']) => Promise<void>;
}): UserSettingsStore;
```

Four deps, not fifteen — the ISP payoff made concrete. `UserSettingsStore` owns `persistedSettings` (321) and `currentMasterVolume` (360) plus `mergePersistedSettings` / `refreshPersistedSettings` / `getPersistedSettingsOverrides`; `currentMasterVolume` is deliberately *not* in `GameState` (it is not saved), which is exactly why it needs a named owner rather than a stray module `let`.

- [ ] **Step 1: Write the failing tests**

`tests/ui/notification-center.test.ts` (prefix the file with `// @vitest-environment jsdom` — the repo default is `node`):

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotificationCenter } from '@/ui/notification-center';
import type { GameState } from '@/core/types';

const state = { turn: 3, currentPlayer: 'player', civilizations: {}, hotSeat: undefined } as unknown as GameState;

describe('notification center queue', () => {
  let layer: HTMLElement;
  let playCue: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
    playCue = vi.fn();
  });
  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  const make = () => createNotificationCenter({ layer, getState: () => state, isSuppressed: () => false, playCue });

  it('shows one toast at a time and drains the queue in order', () => {
    const center = make();

    center.toast('first', 'info');
    center.toast('second', 'info');

    expect(layer.textContent).toContain('first');
    expect(layer.textContent).not.toContain('second');

    vi.runOnlyPendingTimers();

    expect(layer.textContent).toContain('second');
  });

  it('plays the sfx cue attached to a toast', () => {
    const center = make();

    center.toast('city captured', 'success', undefined, 'city-captured');

    expect(playCue).toHaveBeenCalledWith('city-captured');
  });

  it('renders message text via textContent, never innerHTML', () => {
    const center = make();

    center.toast('<img src=x onerror=alert(1)>', 'warning');

    expect(layer.querySelector('img')).toBeNull();
    expect(layer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('a choice notification stays until an action is chosen, then applies exactly one outcome', () => {
    const center = make();
    const execute = vi.fn();
    const release = vi.fn();

    center.choice('A spy was caught.', [
      { label: 'Execute', onSelect: execute },
      { label: 'Release', onSelect: release },
    ]);

    vi.runOnlyPendingTimers();
    expect(layer.textContent).toContain('A spy was caught.');

    const [executeButton] = [...layer.querySelectorAll('button')].filter(b => b.textContent === 'Execute');
    executeButton.click();

    expect(execute).toHaveBeenCalledTimes(1);
    expect(release).not.toHaveBeenCalled();
    expect(layer.textContent).not.toContain('A spy was caught.');
  });
});
```

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement** both factories by moving existing bodies verbatim into closures; module-scope `let`s become closure `let`s, `uiLayer` becomes `deps.layer`, `SFX` calls route through `deps.playCue`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Adopt.** In `main.ts`, keep `const showNotification = notifier.toast` aliases so the 153 call sites do not all change in this PR.
- [ ] **Step 6: Close the phase**

---

### Phase 5 — `PanelHost`, `PanelRouter`, registry, and global shortcuts

Replaces `togglePanel`'s 288-line `else if` chain (`src/main.ts:1589-1877`), the eight `open*Panel` helpers, and the module-scope `keydown` listener.

**Files:**
- Create: `src/app/panel-host.ts`, `src/app/panel-registry.ts`, `src/app/panel-router.ts`, `src/app/global-shortcuts.ts`, `tests/app/panel-router.test.ts`, `tests/app/global-shortcuts.test.ts`
- Modify: `src/main.ts`, `src/ui/ui-interaction-state.ts` (keep the interface, mark the factory as superseded)

**Do not delete `src/ui/ui-interaction-state.ts` in this phase.** `UiInteractionState` has four consumers besides `main.ts`: `src/ui/context-menu.ts`, `tests/ui/keyboard-shortcuts.test.ts`, and `tests/ui/desktop-controls.test.ts`. `PanelHost extends UiInteractionState` (Part II), so `createPanelHost`'s return value is a drop-in for all of them — that is the LSP claim in Part II being cashed. Rewire `main.ts`'s two remaining consumers (`MouseHandler`'s `canInteract` and `installKeyboardShortcuts`'s `canHandle`, both in `startGame`) to the host. The `createUiInteractionState` **factory** is retired in Phase 11, once nothing constructs it.

**Interfaces:**
- Consumes: `GameSession`, `Notifier`, `SelectionStore`.
- Produces:

```ts
export type PanelId =
  | 'council' | 'tech' | 'city' | 'espionage' | 'diplomacy' | 'marketplace'
  | 'network' | 'wonder' | 'wonder-atlas' | 'bestiary' | 'pirate-waters'
  | 'notification-log' | 'city-overview' | 'territory-inspection' | 'pacing-debug';

/**
 * Panels in the same group close each other. 'main' is the mutually-exclusive
 * set that togglePanel clears today; 'transient' panels (inspection, legend)
 * close on handoff but do not close each other.
 */
export type PanelGroup = 'main' | 'transient';

/** Everything a panel factory needs. Panels never reach for `document` directly. */
export interface PanelContext {
  readonly session: GameSession;
  readonly notifier: Notifier;
  readonly host: PanelHost;
  readonly selection: SelectionStore;
  readonly router: PanelRouter;
}

export interface PanelDescriptor {
  /** The DOM id the panel factory assigns to its root element. */
  readonly domId: string;
  readonly group: PanelGroup;
  readonly open: (ctx: PanelContext) => void;
}

export interface PanelRouter {
  toggle(panel: PanelId): void;
  open(panel: PanelId): void;
  close(panel: PanelId): void;
  closeGroup(group: PanelGroup): void;
  isOpen(panel: PanelId): boolean;
}
```

The stringly-typed `togglePanel(panel: string)` becomes a closed union, and `toggle` dispatches through the registry instead of an `if` chain. Two groups rather than one, because the existing code has two closing behaviors: `togglePanel` clears six main panels, while `closeNetworkPanelsForHandoff` / `closePlanningPanels` / `closePirateWatersPanels` clear a different set at handoff. `closeGroup('transient')` replaces the ad-hoc closers.

**`togglePanel` also calls `drawer?.close()` first.** The treasury drawer is not a registry panel (it is a HUD affordance). Preserve this by having `PanelRouter.open` fire `host.setBlockingOverlay(null)`'s sibling hook — concretely, `PanelContext` gains nothing; instead `createPanelRouter` takes an `onBeforeOpen?: () => void` dep, wired in Phase 10 to `drawer.close()`. Test it in Phase 10 with the drawer, not here.

- [ ] **Step 1: Write the failing panel-router test**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPanelRouter } from '@/app/panel-router';
import { createPanelHost } from '@/app/panel-host';

const stubPanel = (layer: HTMLElement, id: string) => () => {
  layer.appendChild(Object.assign(document.createElement('div'), { id }));
};

describe('panel router', () => {
  it('opening a main-group panel closes the previously open one', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const openTech = vi.fn(stubPanel(layer, 'tech-panel'));
    const openCouncil = vi.fn(stubPanel(layer, 'council-panel'));

    const router = createPanelRouter({
      host,
      registry: {
        tech: { domId: 'tech-panel', group: 'main', open: openTech },
        council: { domId: 'council-panel', group: 'main', open: openCouncil },
      },
      context: {} as never,
    });

    router.open('tech');
    router.open('council');

    expect(layer.querySelector('#tech-panel')).toBeNull();
    expect(layer.querySelector('#council-panel')).not.toBeNull();
    expect(router.isOpen('tech')).toBe(false);
    expect(router.isOpen('council')).toBe(true);
  });

  it('a transient panel does not close a main panel', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const router = createPanelRouter({
      host,
      registry: {
        tech: { domId: 'tech-panel', group: 'main', open: stubPanel(layer, 'tech-panel') },
        'territory-inspection': { domId: 'territory-panel', group: 'transient', open: stubPanel(layer, 'territory-panel') },
      },
      context: {} as never,
    });

    router.open('tech');
    router.open('territory-inspection');

    expect(layer.querySelector('#tech-panel')).not.toBeNull();
    expect(layer.querySelector('#territory-panel')).not.toBeNull();
  });

  it('toggle closes an already-open panel instead of reopening it', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const open = vi.fn(stubPanel(layer, 'tech-panel'));
    const router = createPanelRouter({
      host,
      registry: { tech: { domId: 'tech-panel', group: 'main', open } },
      context: {} as never,
    });

    router.toggle('tech');
    router.toggle('tech');

    expect(layer.querySelector('#tech-panel')).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Write the failing `PanelHost` unblock test** — the guard for the ceremony pump discovered in Part II:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPanelHost } from '@/app/panel-host';

describe('panel host interaction blocking', () => {
  it('notifies unblock listeners exactly once when the overlay clears', () => {
    const host = createPanelHost(document.createElement('div'));
    const listener = vi.fn();
    host.onInteractionUnblocked(listener);

    host.setBlockingOverlay('turn-handoff');
    expect(host.isInteractionBlocked()).toBe(true);
    expect(listener).not.toHaveBeenCalled();

    host.setBlockingOverlay(null);
    expect(host.isInteractionBlocked()).toBe(false);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('does not notify when the overlay is replaced by another overlay', () => {
    const host = createPanelHost(document.createElement('div'));
    const listener = vi.fn();
    host.onInteractionUnblocked(listener);

    host.setBlockingOverlay('a');
    host.setBlockingOverlay('b');

    expect(listener).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run both, confirm failure.**
- [ ] **Step 4: Implement.** `toggle` = `isOpen(id) ? close(id) : open(id)`; `open` calls `onBeforeOpen?.()` then `closeGroup(descriptor.group)` for `'main'` only. Type the registry with `satisfies Readonly<Record<PanelId, PanelDescriptor>>` so key coverage is checked without widening the value type.
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Migrate the real panels.** Move each `else if` branch of `togglePanel` into its registry entry's `open`. Delete `councilPanelOpen` — `isOpen('council')` derives it from the DOM, removing a second source of truth. `pacingDebugOpen` likewise becomes `isOpen('pacing-debug')`.
- [ ] **Step 7: Extract `installGlobalShortcuts`.** Move the module-scope `window.addEventListener('keydown', …)` (`main.ts:432-448`) into `src/app/global-shortcuts.ts` with signature `installGlobalShortcuts(deps: { target: EventTarget; selection: SelectionStore; router: PanelRouter; notifier: Notifier }): () => void`. Test both branches: Escape with an armed journey cancels it and toasts; backtick toggles `'pacing-debug'`.
- [ ] **Step 8: Close the phase**

---

### Phase 6 — `CeremonyCoordinator`

The phase that exists because of the `setBlockingOverlay` discovery. Owns `wonderDiscoveryQueue`, `legendaryCompletionQueue`, `deferWonderDiscoveryRevealUntilMoveSettles`, and `prefersReducedMotion`.

**Files:**
- Create: `src/app/controllers/ceremony-coordinator.ts`, `tests/app/controllers/ceremony-coordinator.test.ts`
- Modify: `src/main.ts:326, 377-420, 380-386, 2542-2597`

**Interfaces:**
- Consumes: `PanelHost` (for `onInteractionUnblocked` and `layer`), `GameSession`, `PanelRouter`, plus two concrete callbacks it genuinely needs: `requestMapHighlight` and `playDiscoveryAudio`.
- Produces: `createCeremonyCoordinator(deps): CeremonyCoordinator` (signature in Part II).

- [ ] **Step 1: Write the failing tests** — the three rules currently encoded implicitly:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createCeremonyCoordinator } from '@/app/controllers/ceremony-coordinator';
import { createPanelHost } from '@/app/panel-host';

describe('ceremony coordinator', () => {
  it('plays a ceremony queued while the UI was blocked, once the overlay clears', () => {
    const host = createPanelHost(document.createElement('div'));
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator({ host, playDiscoveryAudio, /* … */ } as never);

    host.setBlockingOverlay('city-panel');
    coordinator.enqueueWonderDiscovery(wonderItem());
    expect(playDiscoveryAudio).not.toHaveBeenCalled();

    host.setBlockingOverlay(null);

    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);
  });

  it('defers a reveal queued during an animated move until the move settles', () => {
    const host = createPanelHost(document.createElement('div'));
    const playDiscoveryAudio = vi.fn();
    const coordinator = createCeremonyCoordinator({ host, playDiscoveryAudio, /* … */ } as never);

    coordinator.beginDeferredAction();
    coordinator.enqueueWonderDiscovery(wonderItem());
    expect(playDiscoveryAudio).not.toHaveBeenCalled();

    coordinator.endAction();

    expect(playDiscoveryAudio).toHaveBeenCalledTimes(1);
  });

  it('passes reduced-motion through to the queue when the media query matches', () => {
    const requestMapHighlight = vi.fn();
    const coordinator = createCeremonyCoordinator({
      reducedMotion: () => true, requestMapHighlight, /* … */
    } as never);

    coordinator.enqueueWonderDiscovery(wonderItem());

    expect(requestMapHighlight).toHaveBeenCalledWith(expect.anything(), true);
  });

  it('a legendary completion plays immediately — it is never deferred by a move', () => {
    const playCeremony = vi.fn();
    const coordinator = createCeremonyCoordinator({ playCeremony, /* … */ } as never);

    coordinator.beginDeferredAction();
    coordinator.enqueueLegendaryCompletion(legendaryItem());

    expect(playCeremony).toHaveBeenCalledTimes(1);
  });
});
```

The fourth case pins existing asymmetric behavior: `main.ts:4512-4513` calls `notifyActionSettled()` unconditionally for legendary completions but conditionally (on the defer flag) for wonder discoveries. Preserve the asymmetry; do not "fix" it here.

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement.** Construct both queues inside the factory, subscribe to `host.onInteractionUnblocked` for the pump, and make `beginDeferredAction`/`endAction` the only writers of the defer flag.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Adopt.** `setBlockingOverlay` in `main.ts` loses its queue-pumping tail (now handled by the subscription). `executeAnimatedUnitMove` (`main.ts:2565-2597`) calls `coordinator.beginDeferredAction()` / `endAction()` instead of writing the flag.
- [ ] **Step 6: Close the phase**

---

### Phase 7 — Presentation registrars

Replaces the 72 module-scope `bus.on(...)` registrations (`src/main.ts:4377-4961`) with ~12 domain modules. This is the phase that makes importing `main.ts` in a test *possible*.

**Files:**
- Create: `src/presentation/register-*.ts` (~12) and `src/presentation/register-all.ts`; `tests/helpers/presentation-context.ts`; `tests/presentation/register-*.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `EventBus`, `GameSession`, `Notifier`, `PanelRouter`, `CeremonyCoordinator`, `SelectionStore`.
- Produces:

```ts
export interface PresentationContext {
  readonly session: GameSession;
  readonly notifier: Notifier;
  readonly router: PanelRouter;
  readonly ceremonies: CeremonyCoordinator;
  readonly selection: SelectionStore;
}

/** Returns a disposer that removes every subscription this registrar added. */
export type PresentationRegistrar = (bus: EventBus, ctx: PresentationContext) => () => void;
```

Returning a disposer is not speculative generality: `EventBus.on` already returns an unsubscribe, hot-seat handoff already tears panels down, and without it these registrars would leak subscriptions across a "new game from the pause menu" transition — a latent bug today, since `main.ts` registers once at import and can never unregister.

- [ ] **Step 1: Write the shared fake-context helper** — `tests/helpers/presentation-context.ts`, used by all twelve suites:

```ts
import { vi } from 'vitest';
import type { GameState } from '@/core/types';
import type { PresentationContext } from '@/presentation/register-all';

export function makePresentationContext(overrides: {
  state?: Partial<GameState>;
  deliver?: ReturnType<typeof vi.fn>;
} = {}): PresentationContext & { deliver: ReturnType<typeof vi.fn> } {
  const deliver = overrides.deliver ?? vi.fn();
  const state = { turn: 1, currentPlayer: 'player', civilizations: {}, cities: {}, units: {}, ...overrides.state } as GameState;
  return {
    deliver,
    session: { getState: () => state, commit: vi.fn(), update: vi.fn(), setStateWithoutRefresh: vi.fn(), subscribe: () => () => {} },
    notifier: { toast: vi.fn(), deliver, choice: vi.fn() },
    router: { toggle: vi.fn(), open: vi.fn(), close: vi.fn(), closeGroup: vi.fn(), isOpen: () => false },
    ceremonies: { enqueueWonderDiscovery: vi.fn(), enqueueLegendaryCompletion: vi.fn(), beginDeferredAction: vi.fn(), endAction: vi.fn() },
    selection: makeSelectionStoreDouble(),
  } as never;
}
```

- [ ] **Step 2: Write the failing test for the first registrar** (diplomacy — small and self-contained, `src/main.ts:4533-4561`):

```ts
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerDiplomacyPresentation } from '@/presentation/register-diplomacy-presentation';
import { makePresentationContext } from '../helpers/presentation-context';

describe('diplomacy presentation', () => {
  it('announces a war declaration to the log once', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player' });

    expect(ctx.deliver).toHaveBeenCalledTimes(1);
    expect(ctx.deliver.mock.calls[0][1]).toContain('war');
  });

  it('disposing removes the subscription', () => {
    const bus = new EventBus();
    const ctx = makePresentationContext();
    const dispose = registerDiplomacyPresentation(bus, ctx);

    dispose();
    bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player' });

    expect(ctx.deliver).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, confirm failure.**
- [ ] **Step 4: Implement `registerDiplomacyPresentation`** by moving the four `bus.on` bodies verbatim, collecting unsubscribers, returning a disposer that calls them all.
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Repeat for the remaining eleven,** one commit each, smallest first: era, trade, religion, faction-crisis, network, wonder, city, espionage, beast, raider (barbarian + pirate; owns `notifiedBarbarianCampsPerCiv`), combat.

`wonder` now delegates to `CeremonyCoordinator` (Phase 6) instead of touching the defer flag. `combat` goes last: it delegates to `handleCombatResolvedEvent` but also touches selection, so it is the only registrar needing `SelectionStore` — available since Phase 3.

- [ ] **Step 7: Add `register-all.ts`** composing all twelve into one disposer, and assert it is installed exactly once:

```ts
it('installs every registrar exactly once and disposes them all together', () => {
  const bus = new EventBus();
  const ctx = makePresentationContext();

  const dispose = registerAllPresentation(bus, ctx);
  bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player' });
  expect(ctx.deliver).toHaveBeenCalledTimes(1);

  dispose();
  bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player' });
  expect(ctx.deliver).toHaveBeenCalledTimes(1);
});
```

This is the guard against double-registration duplicating every notification — the specific way this phase could break AI move replay and the notification log at once.

- [ ] **Step 8: Convert the affected source-grep assertions.** `tests/main.integration.test.ts`'s `era:advanced notification` block (4 assertions, lines 265-311) now lives in `register-era-presentation.ts`. Rewrite as real tests; delete from the grep file.
- [ ] **Step 9: Close the phase**

---

### Phase 8 — `SelectionController` and `MapInteractionController`

**Split into four sub-phases/sub-PRs (8a–8d), added 2026-08-06 after actually reading the
current `selectUnit`/`handleHexTap` against this section's original sketch.** The original
single-PR, 8-step version of this phase (interface sketch below the split note, kept for
history) undersold the real scope: as of `#787` Phase 7 landing, `selectUnit` is ~450 lines
(`src/main.ts:1974-2422`) wiring **~30 mutually-recursive callbacks** into
`renderSelectedUnitInfo` (several call `selectUnit` itself), and `handleHexTap` is ~650 lines
(`src/main.ts:3044-3693`) whose later branches (combat preview, city-assault preview,
confirm-war dialogs) build DOM panels with **live button callbacks that re-read selection state
at click time** — not simple discrete outcomes. The plan's original 9-variant `MapTapIntent`
sketch is consequently too small for the real branch count; the real union has roughly twice
that many variants once pirate-HQ selection, enemy-unit info display, combat/assault preview,
both confirm-war dialogs, `assault-minor-civ`, worker-busy warning, and wonder-atlas-open are
each given their own variant. Per `.claude/rules/spec-fidelity.md`, this is a plan-vs-code
deviation, not a plan mistake to silently paper over — the actual variant list is defined by
Phase 8a's implementation, not by this document; do not treat this note as the final union.

This is still the biggest and riskiest phase in the arc — the plan's own risk table already
flagged it as the phase most likely to cause a replay-sensitive regression. Splitting into four
independently-mergeable PRs, ordered strictly by increasing risk, is a scope decision (not a
technical necessity) made to keep each PR reviewable and revertible on its own:

- **8a** is purely additive (new file, zero `main.ts` changes, zero production behavior change)
  and can be reverted trivially if anything about the union shape needs to change later.
- **8b** is the one PR where a precedence mistake could actually break a live interaction; it
  changes nothing else (no file moves), so a regression is easy to bisect to this PR alone.
- **8c** and **8d** are structural (moving already-correct code into controllers) with lower
  behavioral risk than 8b, but larger diffs.

**Files (across all four sub-phases):**
- Create: `src/input/map-tap-intent.ts`, `src/app/controllers/selection-controller.ts`,
  `src/app/controllers/map-interaction-controller.ts`, and their test files
- Modify: `src/main.ts` (8b–8d only; 8a does not touch `main.ts`)

**Interfaces:**
- Consumes: `GameSession`, `SelectionStore`, `Notifier`, `PanelRouter`, `CeremonyCoordinator`.
- Produces (illustrative starting point only — see the split note above):

```ts
import type { MovementBlockerReason } from '@/systems/unit-system';

export type MapTapIntent =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'select-unit'; readonly unitId: string }
  | { readonly kind: 'open-stack-picker'; readonly coord: HexCoord; readonly unitIds: readonly string[] }
  | { readonly kind: 'move'; readonly unitId: string; readonly to: HexCoord }
  | { readonly kind: 'attack'; readonly attackerId: string; readonly targetKey: string }
  | { readonly kind: 'open-city'; readonly cityId: string }
  | { readonly kind: 'resolve-pending'; readonly intent: PendingMapIntent; readonly coord: HexCoord }
  | { readonly kind: 'mistap'; readonly intent: PendingMapIntent }
  | { readonly kind: 'blocked'; readonly reason: MovementBlockerReason };
  // 8a will add the remaining ~10 variants named in the split note above
  // (pirate-hq, enemy-info, combat-preview, assault-preview, confirm-war-city,
  // confirm-war-minor-civ, assault-minor-civ, worker-busy, wonder-atlas, ...)
  // as it reads the real branch structure top to bottom.

export function resolveMapTapIntent(
  state: GameState,
  selection: SelectionSnapshot,
  coord: HexCoord,
): MapTapIntent;
```

`resolveMapTapIntent` is **pure** — no DOM, no mutation, no `bus`. Variants whose real branch
also builds a DOM preview panel (combat preview, assault preview, confirm-war dialogs) still
carry only the *data* the executor needs to build that panel (attacker/defender ids, computed
strengths are recomputed by the executor, not carried across — keep the intent variant a plain
data descriptor, not a snapshot of derived UI state) — the DOM construction and live button
callbacks stay in the 8d executor, not in this function.

The `mistap` variant is separate from `ignore` because mis-tap forgiveness (Phase 3) needs the
executor to consult `selection.shouldWarnOnMistap()` — an `ignore` result would lose the
affordance.

#### Phase 8a — `resolveMapTapIntent` (pure function, standalone, zero `main.ts` changes)

- [ ] **Step 1: Write failing tests for `resolveMapTapIntent`** — one per row of the Interaction Replay Checklist in Part IV, **plus** one per additional real branch discovered while reading `src/main.ts:3044-3693` top to bottom (see split note — expect roughly double the checklist's 10 rows once combat/assault preview, confirm-war, pirate-HQ, and wonder-atlas branches are covered). Pure-function tests over a fixture state; reuse `tests/fixtures/` if one fits, otherwise add a builder there.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `resolveMapTapIntent`** by reading `src/main.ts:3044-3693` (current line numbers — re-check before starting, they will have shifted again since this note) top to bottom and translating each early-return branch into a union member. **Do not change precedence — the existing order is the specification.** Where the code checks four pending flags in sequence, translate to one `switch (selection.pendingIntent.kind)` preserving the same outcomes.
- [ ] **Step 4: Run — expect PASS.** `main.ts` is untouched; `handleHexTap` still runs its own inline branching. Close this as its own PR — it is safe to merge without wiring it in yet.

#### Phase 8b — Wire `resolveMapTapIntent` into `handleHexTap`

- [ ] **Step 1: Write failing tests** proving `handleHexTap` dispatches on `resolveMapTapIntent`'s result for each variant from 8a, still calling the same existing inline DOM/mutation code per branch (no code moves yet — only the branch-selection mechanism changes, from ad hoc early returns to one `switch (intent.kind)` with the exhaustiveness guard below).
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement.** Replace `handleHexTap`'s branching with a call to `resolveMapTapIntent` followed by:

```ts
default: {
  const _exhaustive: never = intent;
  throw new Error(`Unhandled map tap intent: ${JSON.stringify(_exhaustive)}`);
}
```

Each `case` body is the same code that used to live in the corresponding `if`/early-return branch, moved verbatim under the matching `case`, not rewritten.
- [ ] **Step 4: Run — expect PASS.** Run the full Interaction Replay Checklist (Part IV) as a manual or e2e smoke pass, not just the unit tests, since this PR is the one most likely to silently change precedence. Close as its own PR.

#### Phase 8c — Extract `SelectionController`

- [ ] **Step 1: Write failing tests** for `selectUnit`, `deselectUnit`, `selectNextUnit`, `refreshSelectedUnitAfterCombat`, `refreshCurrentPlayerVisibility`, `animateMovedUnit`, `executeAnimatedUnitMove`, `startAutoExplore`, `cancelAutoExplore`, `cancelJourney`, `openUnitContextMenu`, `isUnitAnimationLocked`: selecting sets ranges; deselecting clears ranges and highlights; `selectNextUnit` skips acted units; a second `selectUnit` on an animating unit is a no-op; an animated move brackets the ceremony defer window.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `SelectionController`** in `src/app/controllers/selection-controller.ts`, moving the eleven functions verbatim. The ~30 callbacks `selectUnit` wires into `renderSelectedUnitInfo` move with it unchanged; do not attempt to split them out into a separate concern in this phase — that is out of scope for Phase 8 and would be its own future MR if warranted. `main.ts` calls the controller's methods in place of the old local functions.
- [ ] **Step 4: Run — expect PASS.** Close as its own PR.

#### Phase 8d — Extract `MapInteractionController`, wire it up, convert affected grep tests

- [ ] **Step 1: Write failing tests** for the extracted executor (from 8b) plus `handleHexLongPress`. Test that long-press opens territory inspection and leaves selection unchanged.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `MapInteractionController`** in `src/app/controllers/map-interaction-controller.ts`, moving the 8b-era switch-based `handleHexTap` executor and `handleHexLongPress` verbatim, consuming `resolveMapTapIntent` (8a) and `SelectionController` (8c).
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Convert the affected source-grep assertions.** `player combat wiring` (3), `land-unit water recovery wiring` (1), `shared city founding wiring` (1), `shared unit upgrade wiring` (1), `shared city assault wiring` (4) — 10 total. Rewrite as real tests; delete from the grep file.
- [ ] **Step 6: Close the phase.** This is the last of the four sub-PRs; once merged, Phase 8 as a whole is done and Phase 9 can begin.

---

### Phase 9 — `TurnFlowController`

**Files:**
- Create: `src/app/controllers/turn-flow-controller.ts`, `tests/app/controllers/turn-flow-controller.test.ts`
- Modify: `src/main.ts`

**Moves:** `endTurn`, `beginHotSeatHandoff`, `releaseHandoffToViewer`, `closeNetworkPanelsForHandoff`, `beginNetworkPlansForCurrentViewer`, `runCurrentCompletedRound`, `captureAIMoves`, `replayAIMoves`, `handleVictoryIfNeeded`, `centerOnCurrentPlayer`, `emitCurrentPlayerAudioSnapshot`, `maybeShowCouncilInterrupt`, `showRequiredChoicesIfNeeded`, `showReligionBoonIfNeeded`, `refreshRequiredChoicesAfterAction`, `closeRequiredChoicePanel`, `finalizePendingCityCaptureChoice`.

**Interfaces:**
- Consumes: all four ports, plus narrow refs for genuinely concrete collaborators: `{ autoSave, advisorCheck, roundGate, settings: UserSettingsStore, audio: Pick<AudioSystem, 'setMasterVolume'>, animateUnitMove }`.
- Produces: `createTurnFlowController(deps): TurnFlowController` with `{ endTurn(options?): Promise<void>; enterViewerTurn(): void }`.

- [ ] **Step 1: Write failing tests** for the guarantees currently protected only by regex, or not at all:

1. solo `endTurn` runs the completed round, replays AI moves, *then* refreshes, *then* opens required choices;
2. `endTurn` is a no-op when `state.gameOver`;
3. a pending religion boon blocks `endTurn` and toasts, without advancing the turn;
4. hot-seat `endTurn` suppresses the presentation gate, sets master volume to 0, autosaves, and restores the stored master volume after the handoff resolves;
5. **difficulty:** a pending opponent challenge set before `endTurn` is applied exactly once, at the handoff, to the correct civ (`applyPendingChallengeForCiv`, `main.ts:4029`) — and a *personal* pending challenge applies only to its own civ. Use the real union values `'explorer' | 'standard' | 'veteran'` (`src/core/types.ts:1346`), and assert the transition (`'standard'` → `'veteran'`), not just that the function was called;
6. **AI replay:** `captureAIMoves` observes `unit:move` events emitted during `result.events.commitTo(bus)`, and `replayAIMoves` animates only current-viewer moves, capped at 6, aborting early if the gate becomes suppressed.

Cases 5 and 6 have no existing coverage of any kind and are the two highest-risk behaviors in this phase.

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement** by moving bodies verbatim; substitute port calls for direct `renderLoop` / `updateHUD` / `showNotification` references. `runCurrentCompletedRound` keeps its four callbacks unchanged — no `src/systems/` or `src/ai/` file is edited.
- [ ] **Step 4: Run — expect PASS, then run both gameplay guards.** If the determinism baseline moves, a system call was reordered; revert and re-approach. This is also the phase where the AI/difficulty suite matters most:

```bash
bash scripts/run-with-mise.sh yarn test:ai-playability
```
- [ ] **Step 5: Convert the affected source-grep assertions.** `completed-round AI wiring` (4) and `campaign entry wiring`'s "opens required research choices" (1) — 5 total.
- [ ] **Step 6: Close the phase**

---

### Phase 10 — `HudController`, `CampaignEntryController`, `GameSessionController`, composition root

**Files:**
- Create: `src/app/controllers/hud-controller.ts`, `src/app/controllers/campaign-entry-controller.ts`, `src/app/controllers/game-session-controller.ts`, `src/app/bootstrap.ts`, plus test files
- Modify: `src/main.ts` → final form

**Moves:** `init`, `showStartSavePanel`, `showGameModeSelection`, `enterCampaign`, `enterCampaignForE2E`, `startGame`, `createUI`, `updateHUD`, `setMapViewportBottomInset`, the `resize` listener, the treasury `drawer`, `airDefenseOverlayButton`, `inputInitialized`.

**Interfaces:**
- Produces: `bootstrap(services: AppServices): Promise<void>` where

```ts
export interface AppServices {
  readonly canvas: HTMLCanvasElement;
  readonly uiLayer: HTMLDivElement;
  readonly renderLoop: RenderLoop;
  readonly audio: AudioSystem;
  readonly bus: EventBus;
  readonly roundGate: RoundPresentationGate;
  readonly advisors: AdvisorSystem;
}
```

`main.ts`'s final form:

```ts
import '@/assets/sprite-animations-v2.css';
// …the eight beast animation stylesheets…
import { EventBus } from '@/core/event-bus';
import { RenderLoop } from '@/renderer/render-loop';
import { AudioSystem } from '@/audio/audio-system';
import { AdvisorSystem } from '@/ui/advisor-system';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { bootstrap } from '@/app/bootstrap';

const bus = new EventBus();
const audioCtx = new AudioContext();
const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;

void bootstrap({
  canvas,
  uiLayer,
  renderLoop: new RenderLoop(canvas),
  audio: new AudioSystem(audioCtx),
  bus,
  roundGate: new RoundPresentationGate(),
  advisors: new AdvisorSystem(bus),
});
```

Everything below the imports is construction. No game logic, no `bus.on`, no `let`.

- [ ] **Step 1: Write the failing bootstrap test** — the payoff test, impossible before this plan. Define the fake-services helper explicitly:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { RoundPresentationGate } from '@/presentation/round-presentation-gate';
import { bootstrap, type AppServices } from '@/app/bootstrap';

function makeFakeServices(): AppServices & { audio: { start: ReturnType<typeof vi.fn> } } {
  document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui-layer"></div>';
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  const uiLayer = document.getElementById('ui-layer') as HTMLDivElement;
  return {
    canvas,
    uiLayer,
    renderLoop: {
      camera: { centerOn: vi.fn(), setMinZoomForMap: vi.fn(), hexSize: 32 },
      setGameState: vi.fn(), start: vi.fn(), stop: vi.fn(), resizeCanvas: vi.fn(),
      setTouchHandler: vi.fn(), setSelectedUnitId: vi.fn(), setHighlights: vi.fn(),
      clearHighlights: vi.fn(), isAirDefenseOverlayEnabled: () => false,
    },
    audio: { start: vi.fn(), setMasterVolume: vi.fn(), getSfxRoutingNode: vi.fn() },
    bus: new EventBus(),
    roundGate: new RoundPresentationGate(),
    advisors: { check: vi.fn() },
  } as never;
}

describe('bootstrap', () => {
  it('shows the save panel and does not start audio before a campaign is entered', async () => {
    const services = makeFakeServices();

    await bootstrap(services);

    expect(document.getElementById('save-panel')).not.toBeNull();
    expect(services.audio.start).not.toHaveBeenCalled();
  });

  it('registers presentation exactly once, so one event yields one notification', async () => {
    const services = makeFakeServices();
    await bootstrap(services);

    // No assertion on text here — Phase 7's registrar suites own the content.
    // This asserts wiring multiplicity only.
    expect(() => services.bus.emit('diplomacy:war-declared', { attackerId: 'a', defenderId: 'b' })).not.toThrow();
  });
});
```

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `bootstrap`** as: construct ports → construct controllers → `registerAllPresentation` → `campaignEntry.showStartSavePanel()`, preserving the e2e branch (`import.meta.env.MODE === 'e2e'`) exactly, including its position **before** `showStartSavePanel`.
- [ ] **Step 4: Extract `HudController`** — `updateHUD`, the treasury `drawer` (including `PanelRouter`'s `onBeforeOpen: () => drawer.close()`), `airDefenseOverlayButton` placement in `#utility-toolbar` (the `#783` fix — assert placement, not absolute positioning), `setMapViewportBottomInset`. Test: gold text updates on commit; AA button hidden without coverage; drawer closes when a main panel opens.
- [ ] **Step 5: Extract `CampaignEntryController`** with the difficulty guard: all three entry routes (`onContinue`, `onLoadEntry`, `onImportSave`) still pass `showChallengePrompt: showLegacyOpponentChallengePrompt`, and a legacy save with no challenge still prompts before entry.
- [ ] **Step 6: Convert the remaining source-grep assertions.** `campaign entry wiring` (3 remaining) and `air-defense overlay button placement` (2) — 5 total. `tests/main.integration.test.ts` is now empty; **delete the file**.
- [ ] **Step 7: Run the browser smoke suite** — this phase touches campaign entry and the e2e install branch, so unit tests are not sufficient. The script is `test:web-smoke` (Playwright); there is no `test:e2e`:

```bash
bash scripts/run-with-mise.sh yarn test:web-smoke
```

- [ ] **Step 8: Close the phase**

---

### Phase 10b — `PanelActionsController`, `DiplomacyActionsController`, and finishing the composition root

Found during Phase 10 planning (2026-08-07), before any Phase 10 code was written. Phase 10's own "Moves" list and its "`main.ts`'s final form" code sample are inconsistent: the Moves list accounts for roughly 1,000–1,250 of `main.ts`'s (then-)2,814 lines, but Phase 11's boundary test (`expect(main.split('\n').length).toBeLessThan(150)`) requires all of it gone. Grepping every phase 1–13 section in this document for the ~47 functions below returns zero hits — they were never assigned a destination. This phase is that assignment. It must land **after Phase 10** (needs `GameSessionController`/`bootstrap.ts` to exist as a home for the final wiring) and **before Phase 11** (whose boundary test cannot pass without it).

**Split into seven sub-phases/sub-PRs (10b-a–10b-g), added 2026-08-08 after re-running the inventory grep against `main.ts` post-Phase-10 (commit `088da557`, current tip).** All target functions are still present and unrenamed. The `~900`/`~166`/`~274`/`~108` line estimates below (re-measured, not the stale pre-Phase-10 ones) held up almost exactly against the actual per-function line counts — e.g. `openCityPanelForCity` is still ~141 lines, `openEspionagePanel` is still ~279 — which means Phase 10 did not touch any code before line ~2040 of the current file; this whole phase's target block is untouched by Phase 10. Following the precedent set by Phase 8's split (`3f9e5f18`): this is a scope decision, not a technical necessity, made to keep each PR reviewable and independently revertible, ordered roughly by increasing size/risk within each controller:

- **10b-a** (`DiplomacyActionsController`) goes first: smallest, most uniform domain (14 functions, all `read state → call a systems-layer mutator → session.commit/setStateWithoutRefresh → refresh → notify`), and it establishes the deps-bag/lazy-getter pattern the panel sub-phases reuse. It takes a `deps.openDiplomacyPanel: () => void` callback — see the circularity note below.
- **10b-b/10b-c/10b-d** split `PanelActionsController` by domain, smallest/lowest-interconnection first, the two largest and most DOM-heavy panels (`openCityPanelForCity`, `openEspionagePanel`) last — same "biggest and riskiest goes last" ordering Phase 8 used for 8c/8d.
- **10b-e** folds the unit-action group into Phase 13's `PlayerActionController` (or creates it, if PR #800/Phase 13 hasn't shipped yet — check its state first).
- **10b-f** resolves the cross-cutting helpers, which can't move until the controllers that call them (a–e) already exist.
- **10b-g** is last on purpose: `panelRegistry`'s ~15 entries, and the rest of the module-scope construction in `main.ts`, can only move into `bootstrap.ts` once every function they reference (every panel opener from 10b-b/c/d, every handler from 10b-a/e) already lives outside `main.ts`.

**Known circularity to design around, found while re-reading the diplomacy handlers for this split:** every `DiplomacyActionsController` function (10b-a) ends by calling `openDiplomacyPanel()` (a `PanelActionsController` function, 10b-c) to refresh the open panel with post-mutation state — e.g. `handleGiftGold` mutates, then calls `openDiplomacyPanel()` directly, not through `router.open(...)`. Because `main.ts` remains the composition root until 10b-g, this is not a hard ordering dependency between 10b-a and 10b-c: whichever lands first takes `openDiplomacyPanel` as an injected `() => void` dep, and `main.ts`'s wiring at that point points the dep at whatever currently owns the function (its own local function, or `panelActions.openDiplomacyPanel` once 10b-c has landed). Confirm this wiring explicitly in 10b-a's Step 3 regardless of which sub-phase ships first.

**Files (across all seven sub-phases):**
- Create: `src/app/controllers/panel-actions-controller.ts`, `src/app/controllers/diplomacy-actions-controller.ts`, plus test files (10b-a–10b-d)
- Modify: `src/app/controllers/player-action-controller.ts` (10b-e — see "Fold into Phase 13" below; if Phase 13 has not yet been implemented when 10b-e starts, add these functions to Phase 13's own Moves list instead of creating a second controller)
- Modify: `src/main.ts` (all sub-phases except none — every sub-phase touches it), `src/app/bootstrap.ts` (10b-g only)

**Full inventory (re-measured 2026-08-08 against `main.ts` at commit `088da557`; re-run this grep again before starting each individual sub-phase — line numbers will keep shifting as earlier sub-phases land):**

*Panel openers → `PanelActionsController`, split across 10b-b/c/d* (~900 lines total): `openPacingDebugPanel` (446), `openBestiary` (456), `openWonderAtlas` (499), `openPirateWaters` (594), `openPirateHeadquartersAssault` (670), `openNotificationLog` (720), `openUnitStackPicker` (1512), `openNetworkIntentPanel` (1534), `openNetworkPanel` (1594), `openDiplomacyPanel` (910), `openMarketplacePanel` (929), `openWonderPanelForCityId` (959), `openCityOverviewPanel` (989), `openCouncilPanel` (1185), `openTechPanel` (1198), `openCityPanelForCity` (1044, ~141 lines — the second-largest), `openEspionagePanel` (1233, ~279 lines — the largest single function left in `main.ts`).

*Diplomacy/minor-civ/crisis handlers → `DiplomacyActionsController`, 10b-a* (~166 lines): `handleDiplomaticAction` (767), `handleAcceptPeaceRequest` (783), `handleRejectPeaceRequest` (789), `handleAcceptTreatyProposal` (795), `handleDeclineTreatyProposal` (801), `handleBreakTreaty` (807), `handleGiftGold` (845), `handleSponsorFestival` (859), `handleMinorCivReparations` (873), `handleSendAid` (886), `handleMinorCivWarPeace` (899), `handleAppeaseFaction` (1014), `handleConcedeToMovement` (1027), `handleEstablishRoute` (1640). Note: `executeMinorCivConquest` (824) sits physically in the middle of this block but is **not** part of this inventory — it already belongs to Phase 13's `PlayerActionController` domain per that phase's own function list; do not move it in 10b-a.

*Fold into Phase 13's `PlayerActionController`, 10b-e* (~274 lines) — these are player-unit-action functions, the same domain Phase 13 already covers (`executeAttack`, `foundCityAction`, `executeUpgrade`, `beginPlayerCityAssault`, `executeMinorCivConquest`); adding a third controller for the same domain would violate this arc's own SRP goal: `getUnitTurnFlow` (1654), `performWorkerAction` (1714), `performPreach` (1748), `ensurePlayerWarState` (1785), `restAction` (2016), `showEspionageCaptureChoice` (2028). If Phase 13 already shipped by the time 10b-e starts, this is an addendum to `PlayerActionController` (its own small PR), not a rewrite.

*Cross-cutting helpers → 10b-f, destination is an implementation-time decision, investigate first* (~108 lines): `currentCiv` (525), `currentCivDef` (153), `clearUnloadState` (147), `setBlockingOverlay` (195, likely deletable — it is already a one-line wrapper around `host.setBlockingOverlay`, ported to `PanelHost` in Phase 5; audit whether any call site still needs the bare function or can call `host.setBlockingOverlay` directly), `prefersReducedMotion` (199), `showNotification` (537), `appendToCivLog` (560), `focusNotificationTarget` (562), `focusPirateTarget` (570), `applyPirateActionResult` (576), `scanBeastSightings` (463), `maybeShowPendingHoardChoice` (485). These are already passed as deps into every existing controller (`ceremonies`, `selectionController`, `turnFlow`, `mapInteraction`, and as of Phase 10 also `hud`/`campaignEntry`/`gameSession`), so moving them risks constructor-ordering circularity — by 10b-f, they'll also be deps of every 10b-a–10b-e controller, so re-check every consumer's construction order, not just the pre-Phase-10 set. The pragmatic default is folding them into `GameSessionController` (Phase 10) since it is already the "foundational glue" controller and is constructed first — but confirm no earlier-constructed controller needs one of these at its own construction time before committing to that. `setBlockingOverlay`, `showNotification`+`appendToCivLog`+`focusNotificationTarget` in particular may be better resolved by having callers depend on `PanelHost`/`Notifier` directly instead of a bare-function wrapper — do not port the wrapper forward reflexively just because it exists today.

**Finishing the composition root, 10b-g:** Once 10b-a–10b-f have given every function a real controller home, `host`, `panelContext`, `ceremonies`, `selectionController`, `turnFlow`, `mapInteraction`, `presentationContext`, `panelRegistry`, and `router` construction (currently module-scope in `main.ts`, ~254 lines, never assigned a phase because each was constructed inline at extraction time in phases 5/6/8c/8d/9 with no follow-up relocation step) can finally move into `bootstrap.ts`. This is the step that actually makes `bootstrap()` the composition root Phase 10's code sample described, and the step that gets `main.ts` into Phase 11's `<150` line range for the first time.

#### Phase 10b-a — `DiplomacyActionsController`

- [ ] **Step 1: Re-run the inventory** for just this sub-phase's 14 functions (see full inventory above) — confirm current line numbers, confirm the `openDiplomacyPanel` circularity note above still applies.
- [ ] **Step 2: Write failing tests** for each handler: state mutation applied, `session.commit`/`setStateWithoutRefresh` called correctly, notification shown, `openDiplomacyPanel` dep invoked. Use the deps-bag pattern from Phase 9/10's controllers (construct real `EventBus`, fake narrow `Pick<...>` deps otherwise).
- [ ] **Step 3: Run, confirm failure.**
- [ ] **Step 4: Implement `DiplomacyActionsController`** in `src/app/controllers/diplomacy-actions-controller.ts`, moving the 14 functions verbatim (mechanical dep-substitution only, per the exhaustive-diff technique). Wire `main.ts` to call `diplomacyActions.handleX(...)` in place of the old local functions; wire the `openDiplomacyPanel` dep per the circularity note.
- [ ] **Step 5: Run — expect PASS.** Run the call-count parity audit for `session.commit(`, `session.setStateWithoutRefresh(`, `showNotification(`, `openDiplomacyPanel(` between the pre-move `main.ts` and the combined new state.
- [ ] **Step 6: Dead-import hygiene pass** on both the shrunk `main.ts` and the new controller file.
- [ ] **Step 7: Run `yarn build`, `yarn test`.** `yarn test:web-smoke` if any diplomacy-panel-adjacent Playwright coverage exists.
- [ ] **Step 8: Close the sub-phase.**

#### Phase 10b-b — `PanelActionsController` part 1: utility & world-event panels

Lowest-interconnection panels first: debug tooling and world-event overlays that don't participate in the city/diplomacy panel-refresh web.

- [ ] **Step 1: Re-run the inventory** for: `openPacingDebugPanel`, `openBestiary`, `openWonderAtlas`, `openPirateWaters`, `openPirateHeadquartersAssault`, `openNotificationLog` (~321 lines).
- [ ] **Step 2: Write failing tests**, then **Step 3: implement `PanelActionsController`** (new file) with just these six, verbatim extraction + dep substitution. `main.ts` calls `panelActions.openX(...)` in place of the old locals.
- [ ] **Step 4: Run — expect PASS.** Dead-import hygiene pass. `yarn build`, `yarn test`, `yarn test:web-smoke` (panel rendering).
- [ ] **Step 5: Close the sub-phase.**

#### Phase 10b-c — `PanelActionsController` part 2: unit/network/civ-management panels

- [ ] **Step 1: Re-run the inventory** for: `openUnitStackPicker`, `openNetworkIntentPanel`, `openNetworkPanel`, `openDiplomacyPanel`, `openMarketplacePanel`, `openWonderPanelForCityId`, `openCityOverviewPanel`, `openCouncilPanel`, `openTechPanel` (~276 lines). Confirm whether 10b-a has already landed — if so, `openDiplomacyPanel`'s extraction here closes the circularity loop opened in 10b-a (main.ts's temporary dep-pointer becomes a direct `panelActions.openDiplomacyPanel` reference).
- [ ] **Step 2: Write failing tests**, then **Step 3: extend `PanelActionsController`** with these nine functions, same verbatim-extraction technique.
- [ ] **Step 4: Run — expect PASS.** Dead-import hygiene pass. `yarn build`, `yarn test`, `yarn test:web-smoke`.
- [ ] **Step 5: Close the sub-phase.**

#### Phase 10b-d — `PanelActionsController` part 3: the two largest panels

`openCityPanelForCity` (~141 lines) and `openEspionagePanel` (~279 lines, the largest function left in `main.ts`) go last — highest line count, most callback wiring, most likely to have a subtle precedence or closure-capture mistake worth extra review time.

- [ ] **Step 1: Re-run the inventory** for these two functions specifically; read both top to bottom before writing tests, given their size.
- [ ] **Step 2: Write failing tests** covering every callback each panel wires (build queue actions, city-cycle, espionage mission launch/cancel, capture-choice handoff, etc. — enumerate the real callback list from the read in Step 1, don't guess from memory).
- [ ] **Step 3: Implement.** Extend `PanelActionsController` with both functions, verbatim extraction + dep substitution. This closes out `PanelActionsController` — all 17 panel openers now live in one file.
- [ ] **Step 4: Run — expect PASS.** Dead-import hygiene pass (expect this to be the largest cleanup of the whole phase — every panel-factory import: `createDiplomacyPanel`, `createMarketplacePanel`, `createEspionagePanel`, `createCouncilPanel`, `createTechPanel`, `createCityPanel`, `createCityOverviewPanel`, `createNetworkPanel`, `createNetworkIntentPanel`, `createPirateWatersPanel`, `createWonderAtlasPanel`, `createBestiaryPanel`, `createNotificationLogPanel`, `createPacingDebugPanel`, `createUnitStackPanel`, etc., moves out of `main.ts` entirely by this point). `yarn build`, `yarn test`, `yarn test:web-smoke`.
- [ ] **Step 5: Close the sub-phase.** `PanelActionsController` is now complete.

#### Phase 10b-e — Fold the unit-action group into `PlayerActionController`

- [ ] **Step 1: Check Phase 13/PR #800's state first** (`gh pr view 800 --json state,mergedAt`). If merged and `PlayerActionController` already exists, this is an addendum PR. If not, this sub-phase creates `PlayerActionController` with just this function group, and Phase 13 (when it runs) extends it.
- [ ] **Step 2: Re-run the inventory** for `getUnitTurnFlow`, `performWorkerAction`, `performPreach`, `ensurePlayerWarState`, `restAction`, `showEspionageCaptureChoice` (~274 lines).
- [ ] **Step 3: Write failing tests**, then **Step 4: implement**, verbatim extraction + dep substitution.
- [ ] **Step 5: Run — expect PASS.** Dead-import hygiene pass. `yarn build`, `yarn test`.
- [ ] **Step 6: Close the sub-phase.**

#### Phase 10b-f — Resolve the cross-cutting helpers

- [ ] **Step 1: Re-run the inventory** for the 12 helpers listed above, and re-confirm every consumer's construction order now that 10b-a–10b-e's controllers also depend on some of these.
- [ ] **Step 2: Decide each helper's destination** per the investigation note above (`GameSessionController` is the pragmatic default; `setBlockingOverlay`/`showNotification`+`appendToCivLog`+`focusNotificationTarget` may resolve to direct `PanelHost`/`Notifier` dependencies instead of a bare-function wrapper — decide per-helper, don't default all twelve to the same treatment).
- [ ] **Step 3: Write failing tests** for the resolved destination(s), then **Step 4: implement**.
- [ ] **Step 5: Run — expect PASS.** Dead-import hygiene pass. `yarn build`, `yarn test`.
- [ ] **Step 6: Close the sub-phase.**

#### Phase 10b-g — Finish the composition root

- [ ] **Step 1: Confirm 10b-a–10b-f are all closed** — this step cannot start until every panel opener and handler already lives outside `main.ts`, since `panelRegistry`'s ~15 entries reference them directly.
- [ ] **Step 2: Write failing tests** for the final `bootstrap()` shape (extending Phase 10's bootstrap test), asserting `host`/`ceremonies`/`selectionController`/`turnFlow`/`mapInteraction`/`presentationContext`/`panelRegistry`/`router` are constructed inside `bootstrap()`, not at `main.ts` module scope.
- [ ] **Step 3: Run, confirm failure.**
- [ ] **Step 4: Move the construction code into `bootstrap.ts`.** This is the step with the most forward-reference/circularity risk in the whole arc (`panelContext` and `router` are already mutually circular via getters; `PanelActionsController` needs the same lazy-getter pattern for `router` that `turnFlow`/`selectionController` already use). Budget real time for this step specifically.
- [ ] **Step 5: Convert `tests/main.integration.test.ts`'s remaining construction-call assertions** (`map interaction controller wiring`, `selection controller wiring`, and any others still asserting `expect(main).toContain('createX(')` for something this step just moved) — these will break even though they're not in any phase's enumerated Moves list, per the established "trust the actual test failures over the plan's enumerated count" lesson from Phases 9–10.
- [ ] **Step 6: Run — expect PASS.** Re-run Phase 11's boundary-test draft (`main.ts` line count, zero `bus.on`/`let`/`window.addEventListener`) as a sanity check before calling this phase done, even though writing the actual enforced test is Phase 11's job.
- [ ] **Step 7: Run the full verification suite** (`yarn build`, `yarn test`, `yarn test:web-smoke` — this step touches panel routing and campaign-adjacent wiring).
- [ ] **Step 8: Close the sub-phase, and Phase 10b as a whole.** Phase 11 can now start.

---

### Phase 11 — Ratchet down and lock the boundary

**Depends on Phase 10b.** The `<150` line boundary test below is unreachable until Phase 10b moves the ~47 functions/~1,700 lines it names (panel openers, diplomacy handlers, cross-cutting helpers, and the final `host`/`ceremonies`/`router`/etc. construction) out of `main.ts`. Confirm Phase 10b is closed before starting Step 2.

**Files:**
- Create: `tests/app/architecture-boundaries.test.ts`
- Modify: surviving `setStateWithoutRefresh` sites; `CLAUDE.md`; delete `tests/app/refresh-bypass-ratchet.test.ts`

- [ ] **Step 1: Audit every remaining `setStateWithoutRefresh` call.** For each, determine whether the player could observe stale data. Convert to `commit` where they could — **each conversion is a bug fix needing its own test and its own line in the PR body**, since these are the only intentional behavior changes in the plan. Known candidates from the survey: the pause-menu challenge setters (`main.ts:493, 498`) mutate state with no refresh, which is likely correct (nothing visible changes until the next turn) but must be decided deliberately, not by default.
- [ ] **Step 2: Write the boundary test.**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const main = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf8');

describe('composition root boundaries', () => {
  it('main.ts stays a composition root, not an application', () => {
    expect(main.split('\n').length).toBeLessThan(150);
  });

  it('main.ts registers no event handlers and owns no mutable state', () => {
    expect(main).not.toMatch(/\bbus\.on\(/);
    expect(main).not.toMatch(/^let /m);
    expect(main).not.toMatch(/window\.addEventListener\(/);
  });

  it('only main.ts constructs concrete platform services', () => {
    expect(main).toContain('new AudioContext()');
    expect(main).toContain('new RenderLoop(');
  });
});
```

- [ ] **Step 3: Write the port-purity test.**

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('controllers depend on ports, not on RenderLoop/AudioSystem/document', () => {
  const dir = resolve(__dirname, '../../src/app/controllers');
  for (const file of readdirSync(dir).filter(f => f.endsWith('.ts'))) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    expect(source, file).not.toMatch(/from '@\/renderer\/render-loop'/);
    expect(source, file).not.toMatch(/from '@\/audio\/audio-system'/);
    expect(source, file).not.toMatch(/\bdocument\.getElementById\(/);
  }
});
```

`document.getElementById` is banned in controllers because it is the ambient-global escape hatch that would let a controller reach around `PanelHost` and silently reintroduce the coupling this plan removes. Panels get their root from `PanelHost.layer`.

Type-only imports of `RenderLoop`/`AudioSystem` for `Pick<>` deps are fine; the regexes target value imports, so write those as `import type`.

- [ ] **Step 4: Delete `tests/app/refresh-bypass-ratchet.test.ts`** (or, if some bypasses are genuinely correct, lower its bound to that number and document each in a comment).
- [ ] **Step 4a: Retire the determinism guard's baseline test.** Delete the `matches the baseline recorded from the pre-refactor build` test, plus `BASELINE`, `digest`, and `ONE_RUN_TIMEOUT_MS`. **Keep** the run-to-run determinism test and `pinnedStart` — that one is invariant under gameplay changes and stays useful indefinitely. The baseline digest only ever backed this arc's "no gameplay change" claim; left in place it fires on ordinary content and balance work, where the only sane response is to re-record, which is the exact habit the file's docblock forbids. Once only the one test remains, re-evaluate whether the file still belongs in `SLOW_TEST_FILES` (halving the work may put it back under the fast tier's budget).
- [ ] **Step 4b: Retire `createUiInteractionState`.** Nothing should construct it once `PanelHost` is wired everywhere. Delete the factory; keep the `UiInteractionState` interface, which `src/ui/context-menu.ts` and two UI test suites still import. Run those three suites explicitly before committing:

```bash
bash scripts/run-with-mise.sh yarn test tests/ui/keyboard-shortcuts.test.ts tests/ui/desktop-controls.test.ts
```
- [ ] **Step 4c: Run both gameplay guards one final time**, including the slow AI suite:

```bash
bash scripts/run-with-mise.sh yarn test:ai-playability
```
- [ ] **Step 5: Update `CLAUDE.md`.** Add to Architecture:

> `src/main.ts` is a composition root only. New app behavior goes in `src/app/controllers/` (depending on `src/app/ports.ts`) or a `src/presentation/register-*.ts` registrar. A new panel is one `PANEL_REGISTRY` entry; a new notification is one handler in the matching registrar; a new persisted save field is one numbered migration in `save-migrations.ts`. Enforced by `tests/app/architecture-boundaries.test.ts`.

- [ ] **Step 6: Close the phase**

---

### Phase 12 — Blocking-overlay reference counting (`PanelHost`)

Found during #787 Phase 6's inline review, filed as [#794](https://github.com/a1flecke/conquestoria/issues/794), after Phases 1–11 above were already written — not part of the original six-controller/`CeremonyCoordinator`/`MapInteractionController` inventory in Part II, so it gets its own phase rather than being folded into Phase 5's or Phase 11's scope after the fact.

`createUiInteractionState` (`src/ui/ui-interaction-state.ts`) tracks exactly one `blockingOverlayId: string | null` — no reference count, no stack. Every one of the ~15 `setBlockingOverlay(...)` / `host.setBlockingOverlay(...)` call sites across `main.ts` and both ceremony queues (`wonder-discovery-queue.ts`, `legendary-wonder-completion-queue.ts`) assumes it owns the single slot for the duration of its own operation. If two blockers overlap — concretely: a ceremony's own `play()` sets `'wonder-discovery-ceremony'` while presenting, and a hot-seat handoff sets `'turn-handoff'` before the ceremony's promise has resolved — the second caller's id silently overwrites the first's, and whichever caller clears to `null` first unblocks the *other* caller's operation too, not just its own. Phase 6 (#793) fixed the narrower, confirmed-reachable instance of the wider problem — a ceremony *queued but not yet presenting* surviving a hot-seat handoff — by clearing backlog before the handoff blocks. It did not address a ceremony *already presenting* when a handoff begins; that requires this phase's structural fix to the shared blocking primitive itself.

**Files:**
- Modify: `src/ui/ui-interaction-state.ts` (or retire it into `PanelHost` directly — decide in Step 1)
- Modify: `src/app/panel-host.ts`
- Modify (call-site audit, not necessarily every site changes): `src/main.ts`, `src/ui/wonder-discovery-queue.ts`, `src/ui/legendary-wonder-completion-queue.ts`
- Modify: `tests/app/panel-host.test.ts`; re-run `tests/ui/keyboard-shortcuts.test.ts` and `tests/ui/desktop-controls.test.ts` unmodified to confirm `context-menu.ts`'s consumption still compiles and passes if the interface shape changes at all

**Interfaces:**
- `UiInteractionState`'s two consumers outside `main.ts`/`PanelHost` (`src/ui/context-menu.ts`, plus the two test suites above) must stay drop-in compatible — the same LSP constraint Phase 5 and Phase 11 Step 4b already established for this interface. Whatever the new shape is, `context-menu.ts`'s existing call pattern must keep working unmodified, or `context-menu.ts` gets an explicit, tested migration in this phase.

- [ ] **Step 1: Investigate before designing.** This phase was flagged, not root-caused, during Phase 6's review — issue #794 says so explicitly. Before writing any test:
  - Confirm whether a ceremony can realistically still be *presenting* (not just *queued*) at the exact moment `beginHotSeatHandoff` fires, given `endTurn()`'s existing guards (`showReligionBoonIfNeeded`, `showRequiredChoicesIfNeeded`, the unmoved-unit warning). If genuinely unreachable today, this phase becomes defensive hardening against future call sites re-introducing the hazard (still worth doing — it is easy to add a new blocking overlay without noticing an existing one can overlap it), not an active-bug fix. Say which it is in the PR body.
  - Grep every current `setBlockingOverlay` / `host.setBlockingOverlay` call site and tabulate: the id used, whether its `null`-clear is reached from a guaranteed path (`try/finally`) or a conditional one, and whether any two sites can plausibly both be "open" (id set, not yet cleared) at the same time. This table is the completeness check for Step 6, the same way Phase 2's 93-site inventory was for its `commit`/`setStateWithoutRefresh` conversion.
- [ ] **Step 2: Decide the API shape and write the failing tests for it.** Two live options, chosen between based on Step 1's findings:
  - **(a) Reference-counted, id-agnostic:** `setBlockingOverlay(id)` pushes `id` onto an internal stack; `setBlockingOverlay(null)` pops the most recently pushed reason (LIFO — matching how nesting already occurs in practice: ceremony-inside-handoff, never the reverse). `isInteractionBlocked()` stays `true` until the stack is empty. Keeps every call site's existing `id | null` shape unchanged.
  - **(b) Explicit push/pop with the id round-tripped:** `pushBlockingOverlay(id): () => void` returns a disposer; callers keep the disposer instead of calling `setBlockingOverlay(null)` blind. More explicit and harder to misuse, but touches every call site's shape, not just its usage.
  - Whichever is chosen: two blockers pushed, one popped, still blocked; both popped, now unblocked; `onInteractionUnblocked` fires exactly once, only when the last one clears (extending Phase 5's existing "not on overlay replacement" contract to "not while any other reason remains").
- [ ] **Step 3: Run, confirm failure.**
- [ ] **Step 4: Implement.** Keep `UiInteractionState`'s public shape stable for `context-menu.ts` unless Step 1's audit shows it genuinely needs the new semantics too (unlikely — it is a single simple blocker, not a nested one).
- [ ] **Step 5: Run — expect PASS.**
- [ ] **Step 6: Adopt at every call site from Step 1's table**, converting only the ones that can actually overlap (the ceremony-queue + hot-seat-handoff pair from the motivation above is the one confirmed reachable; others may turn out not to need it after Step 1's investigation).
- [ ] **Step 7: Regression-test the confirmed overlap case end-to-end** — a ceremony presenting, hot-seat handoff beginning mid-presentation, ceremony resolving: assert the handoff's block is still active until the handoff itself clears it, not the ceremony.
- [ ] **Step 8: Close the phase**

---

## Part VI — Test Design Requirements

Per `docs/superpowers/plans/README.md` §5, and because current coverage of this file is 21 regex assertions.

**Every phase must add:**
- at least one test that performs the interaction and inspects resulting DOM or state, not just the internal call;
- at least one negative test for any derived semantic helper introduced (`isOpen`, `resolveMapTapIntent`'s `blocked`/`mistap` variants, `PendingMapIntent` precedence, `onInteractionUnblocked` not firing on overlay replacement);
- for Phase 5, a test proving every registry-declared panel is still reachable from the shell and from the keyboard after the router replaces `togglePanel`.

**Every phase must run**, not just unit tests:
- `yarn test` (full suite), `yarn build` (the only `tsc` path), and `tests/app/determinism-guard.test.ts`;
- `yarn test:web-smoke` (Playwright — **not** `test:e2e`, which does not exist) in Phases 8 and 10, which touch map input and campaign entry respectively;
- `yarn test:ai-playability` in Phases 1, 9, and 11 — the existing 30-turn simulation across `'explorer' | 'standard' | 'veteran'` difficulties and AI personality sets. It is the real guard for "computer players still work and difficulty still means something." It is slow (300 s budget), which is why it is scoped to the three phases that can plausibly affect it rather than run everywhere.

**Running count of source-grep assertions retired** (must reach zero):

| Phase | Block retired | Assertions |
|---|---|---|
| 7 | `era:advanced notification` | 4 |
| 8 | combat / water-recovery / city-founding / upgrade / assault wiring | 10 |
| 9 | `completed-round AI wiring` + required-choices | 5 |
| 10 | `campaign entry wiring` + air-defense placement | 5 |
| — | **Total** | **24** |

(24 rather than 21 because three `it` blocks carry multiple `readFileSync` assertions; count from the file, not this table, when checking off.)

**Intentional behavior changes across the whole plan** — the complete list; anything not here is a bug:

| Phase | Change | Test |
|---|---|---|
| 1 | `createNewGame`/`createHotSeatGame` populate `knownCivilizations` at creation (only if Step 7 fails) | `new-game-completeness.test.ts` |
| 2 | A throwing view subscriber no longer strands the other subscribers | `game-session.test.ts` |
| 3 | Mis-tap forgiveness re-arms on any pending-intent change, not only via `clearUnloadState` | `selection-store.test.ts` |
| 11 | Individually-audited stale-refresh fixes | one test per conversion |

---

## Part VII — Risks

| Risk | Why it is real here | Mitigation |
|---|---|---|
| **Ceremonies silently stop playing** | `setBlockingOverlay` secretly pumps both ceremony queues; a naive `PanelHost` port drops it, and no existing test covers this path | Phase 6 is a dedicated phase with `onInteractionUnblocked` and four tests; Part IV row 8 makes it a truth-table guarantee |
| A phase silently changes refresh timing and the HUD goes stale | 46 sites do not refresh today; which are intentional is not knowable from the code | Phase 2 preserves every site via `setStateWithoutRefresh`; changes deferred to Phase 11 where each gets a test |
| `handleHexTap` precedence changes | Four independent pending flags whose ordering is emergent, not specified | Phase 8 extracts a pure resolver **first** and tests all ten replay rows before behavior moves |
| Difficulty applies at the wrong time | `applyPendingChallengeForCiv` sits inside `beginHotSeatHandoff`; moving the function could move the timing | Phase 9 test 5 asserts once, at handoff, for the right civ |
| AI move replay breaks or duplicates | `captureAIMoves` is a temporary subscription wrapping `commitTo(bus)`; Phase 7 rewrites every permanent subscription | Phase 7 Step 7 asserts single registration; Phase 9 test 6 asserts capture still observes `commitTo` |
| Hot-seat handoff regressions | Most stateful, least covered flow: audio muting, overlays, autosave, presentation gate, challenge application | Phase 9 tests four ordering guarantees; e2e smoke must pass |
| A gameplay/balance change slips in | 5,462 lines of moved code, and `main.ts` calls into nearly every system | Determinism guard (literals, not snapshots) recorded in Phase 1 Step 1 and run in every phase; `yarn test:ai-playability` in Phases 1/9/11; `src/systems/` and `src/ai/` are read-only |
| **A test written against an assumed command or convention never runs** | The plan originally cited `yarn test:e2e` (does not exist — it is `test:web-smoke`) and `toMatchSnapshot` (zero usages in this repo) | Every command and convention in this plan is now verified against `package.json` and the existing test tree; verify again if the plan sits unexecuted for long |
| Losing a fixup during save consolidation | 23 fixups, 20 `as any` casts, no existing tests | Classification table is a checklist; idempotency + preserve-existing tests; new-game completeness test; keep v10/v11 golden fixtures in `tests/fixtures/` |
| A mid-refactor playtest save cannot be reopened | Phase 1 bumps the schema to 12; older builds throw `UnsupportedSaveSchemaVersionError` | Called out in Part III; family playtest builds stay at or ahead of Phase 1 |
| Merge conflicts against feature work | `main.ts` is touched by nearly every feature PR | Twelve small PRs merged promptly, not one long branch; no other `main.ts`-touching PR should sit open across a phase merge |
| **Overlapping blocking-overlay reasons silently clobber each other** | `PanelHost`'s `blockingOverlayId` is a single value, not a stack; found during Phase 6's review (#794) | Phase 12 is a dedicated phase investigating reachability first, then converting the primitive to a reference count |
| Scope creep into "while I'm here" fixes | Guaranteed to be tempting across 5,462 lines | Behavior-preserving is a Global Constraint; the Part VI table is the exhaustive allowlist; file issues otherwise |

---

## Part VIII — Self-Review Notes

- **Spec coverage:** all six controllers from the source list are assigned (`GameSessionController` → Phase 10, `TurnFlowController` → 9, `SelectionController` → 8, `PanelRouter` → 5, `CampaignEntryController` → 10, `PresentationCoordinator` → 7 as twelve registrars). Save-normalization consolidation is Phase 1. `MapInteractionController` (Phase 8), `CeremonyCoordinator` (Phase 6), `HudController` (Phase 10), and `UserSettingsStore` (Phase 4) are added with justification in Part II.
- **Completeness:** every one of the 23 module-scope `let`s and every module-scope side effect is assigned a phase in the Part II inventory. Phase 11's `not.toMatch(/^let /m)` is only satisfiable if that table is complete — the table and the test check each other.
- **Placeholder scan:** no TBD/TODO in the plan. The one `// TODO(composition-root)` introduced in Phase 2 Step 5 is a counted, ratcheted debt marker retired in Phase 11.
- **Type consistency:** `GameSession.commit`/`update`/`setStateWithoutRefresh`/`subscribe` are used with those exact names in Phases 2, 8, 9, and 11. `PendingMapIntent` (Phase 3) is consumed by `MapTapIntent`'s `resolve-pending` and `mistap` variants (Phase 8). `SelectionSnapshot` is defined in Phase 3 and consumed by `resolveMapTapIntent` in Phase 8. `PanelId`, `PanelGroup`, `PanelContext`, and `ChoiceAction` are defined in Part II / Phase 5 before first use. `MovementBlockerReason` is imported from its real home, `@/systems/unit-system:986`. `PresentationRegistrar` returns `() => void` in its definition and its disposal tests.
- **Command and convention audit (second review pass):** every command in this plan is checked against `package.json`. `yarn test <path>` forwards to Vitest correctly. `yarn test:e2e` **does not exist** and was replaced with `yarn test:web-smoke`. `toMatchSnapshot` was removed — this repo has zero snapshot files and zero snapshot assertions, and a re-recordable baseline is the wrong tool for a guard that must never be re-recorded. `yarn test:ai-playability` was found and adopted; it is a better AI/difficulty guard than anything this plan would have invented.
- **Deletion audit:** `src/ui/transport-ui-state.ts` has exactly one consumer (`main.ts`) and is safe to delete in Phase 3. `src/ui/ui-interaction-state.ts` has **four** (`src/ui/context-menu.ts` plus two UI test suites) — the interface stays, only the factory is retired, in Phase 11.
- **Known soft spots:** the `createHotSeatGame` config literal in Phase 1 Step 7 and the `makeFakeServices` `renderLoop` double in Phase 10 Step 1 are illustrative and must be matched to the real `HotSeatConfig` and `RenderLoop` shapes. The determinism baseline literals in Part V are recorded output, filled in by Phase 1 Step 1.
- **Post-hoc addition (Phase 12):** this plan originally specified eleven phases. Phase 6's inline review (per #787's no-subagents policy, done inline rather than delegated) traced a hot-seat ceremony leak to its root cause and found a second, structurally deeper issue one level down (`PanelHost`'s blocking-overlay id is a single value, not a stack) that no phase above was scoped to fix. The narrower, confirmed-reachable leak was fixed directly in Phase 6's PR (#793); the structural issue was filed as #794 and added here as Phase 12 rather than expanding #793's blast radius or silently dropping it. All "eleven phases"/"eleven PRs" references above were updated to twelve; Phase 12 has no ordering dependency on Phases 7–10 and is appended at the end only because it was discovered last.
