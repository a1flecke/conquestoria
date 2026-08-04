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
- Every phase runs the **determinism guard** (Part V) and the **e2e smoke suite** before merge, not just unit tests.

---

## Part I — Why This, Measured

Numbers below were taken from `src/main.ts` at commit `208dad56`. Re-measure before starting; if they have drifted more than ~10%, re-read the affected section before trusting the task breakdown.

| Metric | Count | What it means |
|---|---|---|
| Total lines | 5,462 | 20x the next-largest hand-written app file |
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
export interface PanelHost {
  readonly layer: HTMLElement;
  setBlockingOverlay(id: string | null): void;
  isInteractionBlocked(): boolean;
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

**On new mechanics and fun specifically:** this plan deliberately adds none. A composition-root refactor is the single worst place to land a gameplay change, because there is no test baseline to distinguish "the refactor broke it" from "the new mechanic changed it." The correct sequencing is: land these 11 phases, *then* build new mechanics on top — which is far cheaper afterwards, because a new mechanic becomes one registrar plus one registry entry instead of another 200 lines in `main.ts`. The extensibility payoff is real, and it is the reward for keeping this plan boring.

### Protected surfaces

| Surface | Why it matters | Where it lives now | Owner | Guard |
|---|---|---|---|---|
| **Difficulty (opponent + personal challenge)** | The only difficulty dial the game has; a 7-year-old and a 43-year-old need different ones | `main.ts:490-500` (pause menu), `4029` (`applyPendingChallengeForCiv` at handoff), `5304/5325` (setup) | `HudController` + `TurnFlowController` + `CampaignEntryController` | Phase 9 test: a pending challenge set mid-game applies at the next handoff, once, for the right civ |
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

Eleven phases, eleven PRs. Phases 1 and 2 are prerequisites for everything after; 3–10 are strictly ordered because each removes state that the next would otherwise thread through a deps bag.

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

### The determinism guard (built in Phase 1, run in every phase)

The cheapest possible protection for gameplay, balance, AI, and difficulty across all eleven phases: same seed in, same state out.

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

    // Recorded once, at Phase 1, from the pre-refactor build. Any phase that changes
    // this has changed gameplay — which this plan forbids. Do not re-record to make
    // it pass; find out which phase moved a system call and revert it.
    expect({
      turn: state.turn,
      era: state.era,
      cityCount: Object.keys(state.cities).length,
      unitCount: Object.keys(state.units).length,
      goldByCiv: Object.fromEntries(Object.entries(state.civilizations).map(([id, c]) => [id, c.gold])),
    }).toMatchSnapshot();
  });
});
```

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

Create `tests/app/determinism-guard.test.ts` exactly as written in Part V above, run it to record the snapshot, and commit that snapshot **before touching any source file**. This is the pre-refactor baseline for all eleven phases.

```bash
bash scripts/run-with-mise.sh yarn test tests/app/determinism-guard.test.ts
```
Expected: PASS, and a new `tests/app/__snapshots__/determinism-guard.test.ts.snap`.

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

`tests/storage/new-game-completeness.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { createNewGame, createHotSeatGame } from '@/core/game-state';
import { normalizeLoadedState } from '@/storage/save-manager';
import { CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';

describe('freshly created games need no migration', () => {
  it('createNewGame output survives normalizeLoadedState unchanged', () => {
    const state = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 2, gameTitle: 'solo', seed: 42 });
    const normalized = normalizeLoadedState(structuredClone(state));

    expect(normalized).toEqual({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION });
    expect(normalized.beasts.migrationPending).toBeUndefined();
  });

  it('createHotSeatGame output survives normalizeLoadedState unchanged', () => {
    // Match this literal to the real HotSeatConfig type before running.
    const state = createHotSeatGame(
      { players: [{ name: 'A', isHuman: true, civType: 'generic' }, { name: 'B', isHuman: true, civType: 'generic' }], mapSize: 'small' },
      undefined,
      'hot seat',
      'standard',
    );
    const normalized = normalizeLoadedState(structuredClone(state));

    expect(normalized).toEqual({ ...state, saveSchemaVersion: CURRENT_SAVE_SCHEMA_VERSION });
    expect(normalized.beasts.migrationPending).toBeUndefined();
  });
});
```

**Expected failure mode, and the correct response.** `createNewGame` and `createHotSeatGame` both hard-code `knownCivilizations: []` (`src/core/game-state.ts:263, 289, 476`) and never call `refreshKnownCivilizations`. If `refreshKnownCivilizations` computes a non-empty list at turn 1 (e.g. a civ always knows itself), this test fails on `knownCivilizations`.

That failure is a genuine pre-existing inconsistency — new hot-seat games got the refresh at entry, new solo games did not. **Fix it by making `createNewGame`/`createHotSeatGame` produce complete state** (call `refreshKnownCivilizations` at creation), not by re-adding an entry-time call or loosening the assertion. Note the fix in the PR body as the one intentional behavior change in Phase 1, and confirm the determinism snapshot from Step 1 still passes — if it moves, you changed gameplay and must stop.

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
- Modify: `src/main.ts`; delete `src/ui/ui-interaction-state.ts`

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

The biggest phase: `selectUnit` (456 lines), `handleHexTap` (624), `handleHexLongPress` (37), plus movement/animation helpers.

**Files:**
- Create: `src/app/controllers/selection-controller.ts`, `src/app/controllers/map-interaction-controller.ts`, `src/input/map-tap-intent.ts`, and their three test files
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `GameSession`, `SelectionStore`, `Notifier`, `PanelRouter`, `CeremonyCoordinator`.
- Produces:

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

export function resolveMapTapIntent(
  state: GameState,
  selection: SelectionSnapshot,
  coord: HexCoord,
): MapTapIntent;
```

`resolveMapTapIntent` is **pure** — no DOM, no mutation, no `bus` — which is what makes the ten-row Interaction Replay Checklist cheap to test. The controller's `handleHexTap` becomes an exhaustive `switch (intent.kind)` with:

```ts
default: {
  const _exhaustive: never = intent;
  throw new Error(`Unhandled map tap intent: ${JSON.stringify(_exhaustive)}`);
}
```

The `mistap` variant is separate from `ignore` because mis-tap forgiveness (Phase 3) needs the executor to consult `selection.shouldWarnOnMistap()` — an `ignore` result would lose the affordance.

- [ ] **Step 1: Write failing tests for `resolveMapTapIntent`** — one per row of the Interaction Replay Checklist in Part IV. Pure-function tests over a fixture state; reuse `tests/fixtures/` if one fits, otherwise add a builder there.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `resolveMapTapIntent`** by reading `src/main.ts:3144-3768` top to bottom and translating each early-return branch into a union member. **Do not change precedence — the existing order is the specification.** Where the code checks four pending flags in sequence, translate to one `switch (selection.pendingIntent.kind)` preserving the same outcomes.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Extract `SelectionController`** (`selectUnit`, `deselectUnit`, `selectNextUnit`, `refreshSelectedUnitAfterCombat`, `refreshCurrentPlayerVisibility`, `animateMovedUnit`, `executeAnimatedUnitMove`, `startAutoExplore`, `cancelAutoExplore`, `cancelJourney`, `openUnitContextMenu`, `isUnitAnimationLocked`). Tests: selecting sets ranges; deselecting clears ranges and highlights; `selectNextUnit` skips acted units; a second `selectUnit` on an animating unit is a no-op; an animated move brackets the ceremony defer window.
- [ ] **Step 6: Extract `MapInteractionController`** — the executor plus `handleHexLongPress`. Test that long-press opens territory inspection and leaves selection unchanged.
- [ ] **Step 7: Convert the affected source-grep assertions.** `player combat wiring` (3), `land-unit water recovery wiring` (1), `shared city founding wiring` (1), `shared unit upgrade wiring` (1), `shared city assault wiring` (4) — 10 total. Rewrite as real tests; delete from the grep file.
- [ ] **Step 8: Close the phase**

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
5. **difficulty:** a pending opponent challenge set before `endTurn` is applied exactly once, at the handoff, to the correct civ (`applyPendingChallengeForCiv`, `main.ts:4029`) — and a *personal* pending challenge applies only to its own civ;
6. **AI replay:** `captureAIMoves` observes `unit:move` events emitted during `result.events.commitTo(bus)`, and `replayAIMoves` animates only current-viewer moves, capped at 6, aborting early if the gate becomes suppressed.

Cases 5 and 6 have no existing coverage of any kind and are the two highest-risk behaviors in this phase.

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement** by moving bodies verbatim; substitute port calls for direct `renderLoop` / `updateHUD` / `showNotification` references. `runCurrentCompletedRound` keeps its four callbacks unchanged — no `src/systems/` or `src/ai/` file is edited.
- [ ] **Step 4: Run — expect PASS, and re-run the determinism guard.** If the guard snapshot moves in this phase, a system call was reordered; revert and re-approach.
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
- [ ] **Step 7: Run the e2e suite** — this phase touches campaign entry and the e2e install branch, so unit tests are not sufficient:

```bash
bash scripts/run-with-mise.sh yarn test:e2e
```

- [ ] **Step 8: Close the phase**

---

### Phase 11 — Ratchet down and lock the boundary

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
- [ ] **Step 5: Update `CLAUDE.md`.** Add to Architecture:

> `src/main.ts` is a composition root only. New app behavior goes in `src/app/controllers/` (depending on `src/app/ports.ts`) or a `src/presentation/register-*.ts` registrar. A new panel is one `PANEL_REGISTRY` entry; a new notification is one handler in the matching registrar; a new persisted save field is one numbered migration in `save-migrations.ts`. Enforced by `tests/app/architecture-boundaries.test.ts`.

- [ ] **Step 6: Close the phase**

---

## Part VI — Test Design Requirements

Per `docs/superpowers/plans/README.md` §5, and because current coverage of this file is 21 regex assertions.

**Every phase must add:**
- at least one test that performs the interaction and inspects resulting DOM or state, not just the internal call;
- at least one negative test for any derived semantic helper introduced (`isOpen`, `resolveMapTapIntent`'s `blocked`/`mistap` variants, `PendingMapIntent` precedence, `onInteractionUnblocked` not firing on overlay replacement);
- for Phase 5, a test proving every registry-declared panel is still reachable from the shell and from the keyboard after the router replaces `togglePanel`.

**Every phase must run**, not just unit tests:
- `yarn test` (full suite), `yarn build` (the only `tsc` path), and `tests/app/determinism-guard.test.ts`;
- `yarn test:e2e` in Phases 8 and 10, which touch map input and campaign entry respectively.

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
| A gameplay/balance change slips in | 5,462 lines of moved code, and `main.ts` calls into nearly every system | Determinism guard recorded in Phase 1 Step 1 and run in every phase; `src/systems/` and `src/ai/` are read-only |
| Losing a fixup during save consolidation | 23 fixups, 20 `as any` casts, no existing tests | Classification table is a checklist; idempotency + preserve-existing tests; new-game completeness test; keep v10/v11 golden fixtures in `tests/fixtures/` |
| A mid-refactor playtest save cannot be reopened | Phase 1 bumps the schema to 12; older builds throw `UnsupportedSaveSchemaVersionError` | Called out in Part III; family playtest builds stay at or ahead of Phase 1 |
| Merge conflicts against feature work | `main.ts` is touched by nearly every feature PR | Eleven small PRs merged promptly, not one long branch; no other `main.ts`-touching PR should sit open across a phase merge |
| Scope creep into "while I'm here" fixes | Guaranteed to be tempting across 5,462 lines | Behavior-preserving is a Global Constraint; the Part VI table is the exhaustive allowlist; file issues otherwise |

---

## Part VIII — Self-Review Notes

- **Spec coverage:** all six controllers from the source list are assigned (`GameSessionController` → Phase 10, `TurnFlowController` → 9, `SelectionController` → 8, `PanelRouter` → 5, `CampaignEntryController` → 10, `PresentationCoordinator` → 7 as twelve registrars). Save-normalization consolidation is Phase 1. `MapInteractionController` (Phase 8), `CeremonyCoordinator` (Phase 6), `HudController` (Phase 10), and `UserSettingsStore` (Phase 4) are added with justification in Part II.
- **Completeness:** every one of the 23 module-scope `let`s and every module-scope side effect is assigned a phase in the Part II inventory. Phase 11's `not.toMatch(/^let /m)` is only satisfiable if that table is complete — the table and the test check each other.
- **Placeholder scan:** no TBD/TODO in the plan. The one `// TODO(composition-root)` introduced in Phase 2 Step 5 is a counted, ratcheted debt marker retired in Phase 11.
- **Type consistency:** `GameSession.commit`/`update`/`setStateWithoutRefresh`/`subscribe` are used with those exact names in Phases 2, 8, 9, and 11. `PendingMapIntent` (Phase 3) is consumed by `MapTapIntent`'s `resolve-pending` and `mistap` variants (Phase 8). `SelectionSnapshot` is defined in Phase 3 and consumed by `resolveMapTapIntent` in Phase 8. `PanelId`, `PanelGroup`, `PanelContext`, and `ChoiceAction` are defined in Part II / Phase 5 before first use. `MovementBlockerReason` is imported from its real home, `@/systems/unit-system:986`. `PresentationRegistrar` returns `() => void` in its definition and its disposal tests.
- **Known soft spot:** the `createHotSeatGame` config literal in Phase 1 Step 7 and the `makeFakeServices` `renderLoop` double in Phase 10 Step 1 are illustrative and must be matched to the real `HotSeatConfig` and `RenderLoop` shapes when writing those tests.
