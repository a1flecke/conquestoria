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
- **Behavior-preserving.** No player-visible change in any phase except Phase 1's explicitly-listed migration ordering. If a phase tempts you to fix a bug you find, file an issue and keep the refactor pure.
- No new runtime dependencies.
- `Math.random()` remains forbidden. `state.currentPlayer` remains the only ownership source. `innerHTML` with game strings remains forbidden.

---

## Part I — Why This, Measured

Numbers below were taken from `src/main.ts` at commit `208dad56`. Re-measure before starting; if they have drifted more than ~10%, re-read the affected section before trusting the task breakdown.

| Metric | Count | What it means |
|---|---|---|
| Total lines | 5,462 | 20x the next-largest hand-written app file |
| Top-level `function` declarations | 103 | All sharing one closure scope |
| Module-scope `let` bindings | 16 | `gameState`, `selectedUnitId`, `movementRange`, `pendingAirMission`, … |
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

The team did not choose regex-over-source because it is good testing. They chose it because `main.ts` executes `new AudioContext()`, `document.getElementById(...)`, 72 event-bus registrations, and `init()` at import time — so there is no way to import it in a test. **Every real behavior in `main.ts` is currently guarded by whitespace-sensitive string matching, or not at all.** Converting those 21 assertions into real behavioral tests is a first-class deliverable of this plan, not incidental churn.

### The three save routes

`grep` for save normalization finds three distinct paths, and a save can go through a different subset depending on how the player got into the game:

1. **Versioned pipeline** — `migrateSaveToCurrent(raw)` in `src/storage/save-migrations.ts`. Numbered migrations 1…`CURRENT_SAVE_SCHEMA_VERSION` (11), each stamping `saveSchemaVersion`. This is the good one.
2. **Unconditional normalizers** — `normalizeLoadedState(state)` in `src/storage/save-manager.ts:825`. Calls `migrateSaveToCurrent` and then ~20 hand-written `normalizeX` / `migrateLegacyX` functions that run on *every* load regardless of version. Reachable from tests via `normalizeLoadedStateForTest`.
3. **`migrateLegacySave()`** — `src/main.ts:5146`, 124 lines, mutates the module-scope `gameState` **in place** with ~23 fixups and 20 `as any` casts. Not exported. Not importable. Not tested. Called from exactly one place: `enterCampaign()` at `src/main.ts:5013`.

Route 3 has two concrete defects beyond being untestable:

- **It runs on brand-new hot-seat games.** `showGameModeSelection`'s `onChooseHotSeat` calls `createHotSeatGame(...)` → `enterCampaign(...)` → `migrateLegacySave()`. New *solo* games call `startGame()` directly and skip it. So the two new-game paths do not produce identical state shapes, and nothing tests that they do.
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
   * whether the player is looking at stale data. Phase 10 drives this to zero
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
```

Backed by the existing `createNotificationDelivery` plus the toast queue currently living in `main.ts:711-965` (`notificationQueue`, `isShowingNotification`, `currentDismissTimer`, `enqueueToast`, `showNotification`, `displayNextNotification`). That queue is pure DOM + timers with zero game-logic coupling, and it is a 250-line free win for testability with fake timers.

### Port 3 — `PanelHost`

```ts
export interface PanelHost {
  readonly layer: HTMLElement;
  setBlockingOverlay(id: string | null): void;
  isInteractionBlocked(): boolean;
  /** Removes the panel with this id if present. Idempotent. */
  close(panelId: PanelId): void;
  closeAll(): void;
}
```

`isInteractionBlocked` / `setBlockingOverlay` already exist as `createUiInteractionState()` — this port absorbs it rather than replacing it.

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

### SOLID, concretely

- **SRP** — `main.ts` currently changes when *any* feature changes: a new unit type, a new panel, a new diplomacy action, a new notification, a new save field. After this plan, adding a panel touches `panel-registry.ts`; adding a notification touches one presentation registrar; adding a save field touches `save-migrations.ts`. Each file has one axis of change.
- **OCP** — two concrete open/closed wins. `togglePanel` (288 lines of `else if (panel === '...')`) becomes a registry the router iterates. The 72 `bus.on` handlers become ~12 domain registrars, each a file you add rather than a chain you edit.
- **LSP** — the substitutability that matters here is test doubles: a fake `GameSession` over a plain object, a fake `Notifier` that records calls, and a `PanelHost` over a detached `<div>` must be drop-in for the real ones. Keep the ports free of concrete-type leakage (no `RenderLoop`, no `AudioContext`, no `HTMLCanvasElement` in a port signature) and this holds by construction.
- **ISP** — the reason ports are four small interfaces and not one `AppContext`. `NotificationCenter` takes `PanelHost` and nothing else. Presentation registrars take `GameSession` (read-only usage) and `Notifier`. `TurnFlowController` is the only thing that needs all four.
- **DIP** — controllers import from `@/app/ports` only. `main.ts` is the sole module allowed to `new RenderLoop(...)`, `new AudioContext()`, or call `document.getElementById`. Phase 10 adds a test that enforces this mechanically.

### Target file structure

```
src/app/                         [NEW]
  ports.ts                       GameSession, Notifier, PanelHost, SelectionStore, PendingMapIntent, PanelId
  game-session.ts                createGameSession(): GameSession
  selection-store.ts             createSelectionStore(): SelectionStore
  panel-host.ts                  createPanelHost(layer): PanelHost  (absorbs ui-interaction-state)
  panel-registry.ts              PANEL_REGISTRY: Readonly<Record<PanelId, PanelDescriptor>>
  panel-router.ts                createPanelRouter(deps): PanelRouter
  controllers/
    campaign-entry-controller.ts   save panel, mode select, campaign/hot-seat setup, enterCampaign
    game-session-controller.ts     startGame: sprite warmup, camera, input install, audio, render start
    turn-flow-controller.ts        endTurn, hot-seat handoff, solo round, AI replay, victory, autosave
    selection-controller.ts        select/deselect/next, highlights, animated moves, auto-explore
    map-interaction-controller.ts  handleHexTap, handleHexLongPress  [NOT in the original six — see below]
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

src/main.ts                      ~120 lines: construct concrete services, call bootstrap()
```

### One addition to the original six

The source list is `GameSessionController`, `TurnFlowController`, `SelectionController`, `PanelRouter`, `CampaignEntryController`, `PresentationCoordinator`. That list has a gap: `handleHexTap` is **624 lines** — the single largest function in the file, larger than most whole modules in this repo — and it is not selection, not turn flow, and not panel routing. Folding it into `SelectionController` would recreate a god object one level down.

So this plan adds `MapInteractionController`, and splits it the way this codebase already splits input elsewhere (`src/input/selected-unit-tap-intent.ts` is the existing precedent):

- a **pure resolver** — `(state, selection, coord) => MapTapIntent` — a discriminated union, no DOM, no mutation, exhaustively testable;
- a **thin executor** — `switch (intent.kind)` dispatching to already-extracted systems.

`PresentationCoordinator` is also deliberately *not* a single class here. One coordinator owning 72 event subscriptions is the same god object with a nicer name; ~12 `register*Presentation(bus, ctx): () => void` functions give real SRP and let each be tested by emitting on a throwaway bus.

### Non-goals

- No change to game rules, balance, yields, or AI behavior.
- No renderer or Canvas changes.
- No new save schema fields (Phase 1 bumps the version to relocate existing fixups; it adds nothing new).
- No conversion of `src/systems/*` or `src/ui/*` panel modules to classes. The `createX(deps): X` factory idiom is the house style and stays.
- No DI container, no decorators, no `reflect-metadata`. Ports are constructor arguments.

---

## Part III — Player Truth Table

Per `docs/superpowers/plans/README.md`. This refactor is behavior-preserving, so the table records what must *remain* true — these are the regressions this plan can plausibly cause, and each row names the phase and test that guards it.

| Before | Action | Immediate visible result that must not change | Guarded by |
|---|---|---|---|
| HUD shows `💰 120`, unit selected | Rush-buy production | HUD gold updates in the same frame; drawer updates | Phase 2, `game-session.test.ts` + `turn-flow-controller.test.ts` |
| Unit selected, movement overlay drawn | Tap a reachable hex | Unit animates, overlay clears, HUD move count updates, next-unit badge decrements | Phase 7, `map-interaction-controller.test.ts` |
| Tech panel open | Click another tech to queue | Panel rerenders with the new queue; panel stays open | Phase 5, `panel-router.test.ts` |
| City panel open, queue `A, B, C` | Click `↑` on `C` | Queue rerenders `C, A, B` without closing the panel | Phase 5 (existing `city-panel.test.ts` must stay green) |
| Council panel open | Press `C` (shortcut) | Panel closes; no second panel opens; `councilPanelOpen` returns false | Phase 5, `panel-router.test.ts` |
| Hot-seat, player 1 ends turn | Confirm handoff | Blocking overlay, audio muted, autosave, then player 2's HUD/civ name | Phase 8, `turn-flow-controller.test.ts` |
| Toast visible, second event fires | — | Second toast queues, shows after the first dismisses; timer not reset | Phase 4, `notification-center.test.ts` |
| Espionage capture pending | Choose "execute" | Persistent choice notification dismisses; exactly one outcome applies | Phase 4, `notification-center.test.ts` |
| Save from schema v10 | Load it | Same map, cities, and treaties as before this refactor | Phase 1, `save-migrations.test.ts` golden fixture |
| Brand-new hot-seat game | Start | Identical state shape to before (no `beasts.migrationPending`, no lair placement on tick 1) | Phase 1, `new-game-completeness.test.ts` |

### Misleading UI risks

The derived surface at risk is **"the HUD/renderer reflects current state."** It is not a label; it is an implicit promise made 93 times.

- An item is legitimately "current" only if the render loop and HUD were refreshed after the most recent `gameState` assignment.
- Near-miss to keep out: a `setStateWithoutRefresh` call whose caller *intended* a visible change. Phase 2 must not convert any site to `setStateWithoutRefresh` on the grounds that "the next line refreshes anyway" — if a refresh follows within the same synchronous block, use `commit` and delete the manual refresh.
- Negative test: `game-session.test.ts` asserts `setStateWithoutRefresh` fires **zero** subscriber notifications, and `commit` fires exactly one per call (not one per subscriber-visible field).

### Interaction replay checklist

`handleHexTap` is the replay-sensitive surface; Phase 7 tests must cover, in one session, against one store:

- tap empty hex with nothing selected → no-op
- tap own unit → selects, overlays appear
- tap reachable hex → moves, overlays clear
- tap the *same* hex again immediately → does not re-move a spent unit
- tap enemy unit in range → attack path, not move path
- set `journey` intent, then tap → journey path, and intent resets to `none`
- set `journey` intent, then press Escape, then tap → normal tap behavior (proves intent cleared)
- set `air-mission`, then set `journey` → only `journey` is live (proves the union replaced, not merged)

---

## Part IV — Phases

Ten phases, ten PRs. Phases 1 and 2 are prerequisites for everything after; 3–9 are strictly ordered because each removes state that the next one would otherwise have to thread through a deps bag.

**Every phase ends with the same three steps** (written out once here, referenced as "**Close the phase**" below — do not skip them):

```bash
bash scripts/run-with-mise.sh yarn test
```
```bash
bash scripts/run-with-mise.sh yarn build
```
Both must exit 0. Then commit, push, open a PR whose body states the line count of `src/main.ts` before and after.

---

### Phase 1 — One authoritative save route

**Independent of every other phase.** Do it first: it is the lowest-risk, highest-clarity win, it deletes 124 lines and 20 `as any` casts, and it decouples `enterCampaign` so Phase 9 can move it cleanly.

**Files:**
- Modify: `src/storage/save-migrations.ts` (add migration 12, bump `CURRENT_SAVE_SCHEMA_VERSION`)
- Modify: `src/storage/save-manager.ts:825-888` (`normalizeLoadedState` gains the derived-rebuild fixups)
- Modify: `src/main.ts:5006-5088` (`enterCampaign` loses `migrateLegacySave()`), delete `src/main.ts:5146-5269`
- Test: `tests/storage/save-migrations.test.ts`, `tests/storage/new-game-completeness.test.ts` (new)

**Interfaces:**
- Consumes: `SaveMigration = (state: GameState) => GameState`, `SAVE_MIGRATIONS`, `CURRENT_SAVE_SCHEMA_VERSION` (all already exported from `save-migrations.ts`).
- Produces: nothing new. `migrateLegacySave` ceases to exist; callers of `normalizeLoadedState` are unchanged.

**Classification.** Every one of `migrateLegacySave`'s fixups goes into exactly one of three buckets. Do this classification before writing code and put the table in the PR body.

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
| 19 | `civ.knownCivilizations ??= []` | **derived** | `normalizeLoadedState` (superseded by #20 anyway) |
| 20 | `refreshKnownCivilizations(state, civId)` per civ | **derived** | `normalizeLoadedState` |
| 21 | `reconstructLastSeenFromMap(state, civId)` per civ | **derived** | `normalizeLoadedState` |
| 22 | `clearStaleSoloPendingEvents(state)` | **derived** | `normalizeLoadedState` |
| 23 | `settings.councilTalkLevel ??= persistedSettings?.councilTalkLevel ?? 'normal'` | **runtime settings** | stays at the call site — see below |

**Why #19–22 are not versioned:** they recompute state derivable from the map and civ roster. A versioned migration runs once, at one version boundary; these must run on *every* load, because a save written by a build with a since-fixed visibility bug still needs its `lastSeen` rebuilt. `normalizeLoadedState` is exactly the right home and already hosts functions of this shape (`normalizeThreatPressureDefaults`, `normalizeMinorCivQuestState`).

**Why #23 cannot move:** `persistedSettings` is loaded from IndexedDB by `loadSettings()`, not from the save. A migration signature is `(state: GameState) => GameState`; smuggling a module-global read into `save-migrations.ts` would make migrations non-deterministic and untestable. Keep it in the entry path, but name it honestly — extract it to a tiny exported helper so it reads as a settings merge and not as a migration:

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

**TypeScript note.** `migrateLegacySave` uses `(x as any)` twenty times because it operates on data whose type is a *lie* — it is typed `GameState` but is actually an older shape. Do not carry the `as any`s across. `save-migrations.ts` already has the right convention; extend it with one narrowing helper rather than casting:

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

- [ ] **Step 1: Write the failing round-trip test for migration 12**

Create `tests/storage/save-migrations-v12.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { migrateSaveToCurrent, CURRENT_SAVE_SCHEMA_VERSION } from '@/storage/save-migrations';
import { createNewGame } from '@/core/game-state';

function asV11(state: unknown): Record<string, unknown> {
  return { ...(state as Record<string, unknown>), saveSchemaVersion: 11 };
}

describe('save migration 12 — absorbed main.ts legacy fixups', () => {
  it('backfills civType, diplomacy, and lastCombatTurnByLandmass on a v11 save', () => {
    const base = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 7 });
    const raw = asV11(base);
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
    const base = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 7 });
    const raw = asV11(base);
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
    const base = createNewGame({ civType: 'generic', mapSize: 'small', opponentCount: 1, gameTitle: 't', seed: 7 });
    const raw = asV11(base);
    delete raw.beasts;

    const migrated = migrateSaveToCurrent(raw);

    expect(migrated.beasts.migrationPending).toBe(true);
    expect(migrated.beasts.lairs).toEqual({});
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

```bash
bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations-v12.test.ts
```
Expected: FAIL — `civType` is `undefined`, route has no `id`, `beasts.migrationPending` is `undefined`.

- [ ] **Step 3: Add migration 12**

In `src/storage/save-migrations.ts`: add `migrateLegacyMainFixups` implementing rows 1–18 of the table above (port the bodies verbatim from `src/main.ts:5146-5269`, replacing each `(x as any)` with the `withDefault` helper or a direct object spread), register it as `SAVE_MIGRATIONS[12]`, and set `CURRENT_SAVE_SCHEMA_VERSION = 12`.

Two ordering requirements carried over from `main.ts`, both of which must be preserved and commented:
- the `legendaryWonderHistory.discoveredSites` backfill reads `wonderDiscoverers`, so row 8 must run before row 9;
- the trade-route reshape reads `marketplace`, so row 15 must run before row 16.

- [ ] **Step 4: Run the test — expect PASS**

```bash
bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations-v12.test.ts
```

- [ ] **Step 5: Move the derived rebuilds into `normalizeLoadedState`**

In `src/storage/save-manager.ts`, add to the composition inside `normalizeLoadedState` (rows 19–22): `refreshKnownCivilizations` and `reconstructLastSeenFromMap` for every civ, then `clearStaleSoloPendingEvents`. Order matters — `reconstructLastSeenFromMap` must run after known-civ refresh, matching `main.ts:5233-5241`.

- [ ] **Step 6: Write the new-game completeness test**

This is the test that proves route 3 was redundant for new games. Create `tests/storage/new-game-completeness.test.ts`:

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

If either assertion fails, **stop and read the diff** — it is telling you that `createNewGame`/`createHotSeatGame` produces incomplete state, which is a real bug worth its own issue. Do not "fix" it by loosening the assertion. (Adjust the `createHotSeatGame` config literal to match the real `HotSeatConfig` type; the shape above is illustrative.)

- [ ] **Step 7: Delete `migrateLegacySave` and rewire `enterCampaign`**

Delete `src/main.ts:5146-5269`. In `enterCampaign`, replace `migrateLegacySave();` with:

```ts
gameState = applyPersistedUserSettings(state, persistedSettings);
```

(replacing the existing `gameState = state;`). Add the `src/storage/settings-merge.ts` file shown above plus a two-case unit test for it.

- [ ] **Step 8: Update the source-grep tests this phase breaks**

`tests/main.integration.test.ts` — no assertion currently names `migrateLegacySave`, so this phase should not break it. Run it explicitly to confirm rather than assuming:

```bash
bash scripts/run-with-mise.sh yarn test tests/main.integration.test.ts
```

- [ ] **Step 9: Close the phase** (full `yarn test`, `yarn build`, commit, PR)

```bash
git add src/storage src/main.ts tests/storage && git commit -m "refactor(save): fold main.ts legacy fixups into the versioned migration pipeline"
```

---

### Phase 2 — `GameSession`: one owner for game state

**Files:**
- Create: `src/app/ports.ts`, `src/app/game-session.ts`
- Test: `tests/app/game-session.test.ts`
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

That last case matters: today a throw inside `updateHUD()` would abort the statement sequence and skip `renderLoop.setGameState`. Isolating subscribers is a genuine robustness improvement and is behavior-compatible (nothing currently depends on the throw propagating).

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

Replace `let gameState: GameState;` with a module-scope `session` created in `enterCampaign`/`startGame`, plus a compatibility accessor so the 93 sites can be converted in reviewable batches:

```ts
let session: GameSession;
const gameStateOf = (): GameState => session.getState();
```

Register the two subscribers once, where `renderLoop` and the HUD are known:

```ts
session.subscribe(next => renderLoop.setGameState(next));
session.subscribe(() => updateHUD());
```

Then convert call sites. Two mechanical rules, applied literally:

- `gameState = X;` followed (within the same synchronous block, before any `await` or `return`) by `renderLoop.setGameState(gameState)` and/or `updateHUD()` → `session.commit(X);` and **delete** the manual refresh lines.
- `gameState = X;` with no refresh in the same block → `session.setStateWithoutRefresh(X);` and add `// TODO(composition-root): verify refresh` above it.

Do **not** exercise judgment about which unrefreshed sites "should" refresh — that is a behavior change and belongs in Phase 10. Convert 93 sites in ~6 commits of ~15 each so the diff stays reviewable.

- [ ] **Step 6: Guard the TODO count**

Add to `tests/app/game-session.test.ts`:

```ts
it('tracks how many state writes still bypass the refresh path', () => {
  const main = readFileSync(resolve(__dirname, '../../src/main.ts'), 'utf8');
  const bypasses = main.match(/setStateWithoutRefresh\(/g)?.length ?? 0;
  // Ratchet only. Lower this number when you eliminate a bypass; never raise it.
  expect(bypasses).toBeLessThanOrEqual(46);
});
```

This is the one source-grep assertion this plan *adds*, and it is legitimate: it measures a debt counter and can only move one direction. Phase 10 drives it to 0 and deletes the test.

- [ ] **Step 7: Close the phase**

---

### Phase 3 — `SelectionStore` and `PendingMapIntent`

**Files:**
- Create: `src/app/selection-store.ts`; extend `src/app/ports.ts`
- Test: `tests/app/selection-store.test.ts`
- Modify: `src/main.ts` (10 module `let`s), `src/ui/transport-ui-state.ts` (folded in)

**Interfaces:**
- Consumes: `GameSession` (Phase 2).
- Produces:

```ts
export interface SelectionStore {
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
  setPendingIntent(intent: PendingMapIntent): void;
  clear(): void;
}
```

- [ ] **Step 1: Write the failing test** — cover, at minimum, that `setPendingIntent` replaces rather than merges:

```ts
import { describe, it, expect } from 'vitest';
import { createSelectionStore } from '@/app/selection-store';

describe('createSelectionStore pending intent', () => {
  it('replaces the pending intent instead of accumulating independent flags', () => {
    const store = createSelectionStore();
    store.setPendingIntent({ kind: 'air-mission', unitId: 'u1', mission: 'strike' });
    store.setPendingIntent({ kind: 'journey', unitId: 'u2' });

    expect(store.getPendingIntent()).toEqual({ kind: 'journey', unitId: 'u2' });
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

- [ ] **Step 3: Implement** `createSelectionStore(): SelectionStore` — plain closure over the ten values, `PendingMapIntent` defaulting to `{ kind: 'none' }`, `clear()` resetting all of them.

- [ ] **Step 4: Run — expect PASS.**

- [ ] **Step 5: Adopt.** Delete the ten `let`s from `main.ts`. Fold `src/ui/transport-ui-state.ts`'s `getPendingUnload` / `setPendingUnload` / `clearPendingUnload` into the `unload` intent variant and delete that file. Update `clearUnloadState()` accordingly.

At this point `handleHexTap`'s intent checks are still `if` chains — do not restructure them yet, that is Phase 7. Only the storage changes here.

- [ ] **Step 6: Close the phase**

---

### Phase 4 — `NotificationCenter`

Moves `src/main.ts:711-965` and `4185-4229` (~290 lines) into a testable module.

**Files:**
- Create: `src/ui/notification-center.ts`
- Test: `tests/ui/notification-center.test.ts`
- Modify: `src/main.ts` (delete `notificationQueue`, `isShowingNotification`, `currentDismissTimer`, `enqueueToast`, `showNotification`, `displayNextNotification`, `createPersistentChoiceNotification`)

**Interfaces:**
- Consumes: `PanelHost` (`layer` only), `createNotificationDelivery` (existing, unchanged).
- Produces: `createNotificationCenter(deps: NotificationCenterDeps): Notifier`, where deps are exactly `{ layer: HTMLElement; getState: () => GameState; isSuppressed: () => boolean; playCue?: (cue: string) => void }` — four fields, not fifteen. That is the ISP payoff made concrete.

- [ ] **Step 1: Write the failing tests** — the queue behaviors that currently have no coverage at all:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createNotificationCenter } from '@/ui/notification-center';
import type { GameState } from '@/core/types';

const state = { turn: 3, currentPlayer: 'player', civilizations: {}, hotSeat: undefined } as unknown as GameState;

describe('notification center queue', () => {
  let layer: HTMLElement;

  beforeEach(() => {
    vi.useFakeTimers();
    layer = document.createElement('div');
    document.body.appendChild(layer);
  });
  afterEach(() => {
    vi.useRealTimers();
    layer.remove();
  });

  it('shows one toast at a time and drains the queue in order', () => {
    const center = createNotificationCenter({ layer, getState: () => state, isSuppressed: () => false });

    center.toast('first', 'info');
    center.toast('second', 'info');

    expect(layer.textContent).toContain('first');
    expect(layer.textContent).not.toContain('second');

    vi.runOnlyPendingTimers();

    expect(layer.textContent).toContain('second');
  });

  it('renders message text via textContent, never innerHTML', () => {
    const center = createNotificationCenter({ layer, getState: () => state, isSuppressed: () => false });

    center.toast('<img src=x onerror=alert(1)>', 'warning');

    expect(layer.querySelector('img')).toBeNull();
    expect(layer.textContent).toContain('<img src=x onerror=alert(1)>');
  });

  it('a choice notification stays until an action is chosen, then applies exactly one outcome', () => {
    const center = createNotificationCenter({ layer, getState: () => state, isSuppressed: () => false });
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

Add `// @vitest-environment jsdom` at the top of the file — the repo's vitest default environment is `node`.

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement** by moving the existing bodies verbatim into the factory closure; the only change is that module-scope `let`s become closure `let`s and `uiLayer` becomes `deps.layer`.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Adopt.** In `main.ts`, construct the center and keep local `const showNotification = notifier.toast` aliases so the 153 call sites do not all change in this PR.
- [ ] **Step 6: Close the phase**

---

### Phase 5 — `PanelRouter` and the panel registry

Replaces `togglePanel`'s 288-line `else if` chain (`src/main.ts:1589-1877`) and the eight `open*Panel` helpers.

**Files:**
- Create: `src/app/panel-host.ts`, `src/app/panel-registry.ts`, `src/app/panel-router.ts`
- Test: `tests/app/panel-router.test.ts`
- Modify: `src/main.ts`; delete `src/ui/ui-interaction-state.ts` (absorbed by `PanelHost`)

**Interfaces:**
- Consumes: `GameSession`, `Notifier`, `PanelHost`.
- Produces:

```ts
export type PanelId =
  | 'council' | 'tech' | 'city' | 'espionage' | 'diplomacy' | 'marketplace'
  | 'network' | 'wonder' | 'wonder-atlas' | 'bestiary' | 'pirate-waters'
  | 'notification-log' | 'city-overview' | 'territory-inspection';

export interface PanelDescriptor {
  /** The DOM id the panel factory assigns to its root element. */
  readonly domId: string;
  /** Panels in the same group close each other. */
  readonly exclusiveGroup?: 'main';
  readonly open: (ctx: PanelContext) => void;
}

export interface PanelRouter {
  toggle(panel: PanelId): void;
  open(panel: PanelId): void;
  close(panel: PanelId): void;
  closeGroup(group: 'main'): void;
  isOpen(panel: PanelId): boolean;
}
```

The `stringly-typed` `togglePanel(panel: string)` becomes a closed union, and `toggle` dispatches through the registry instead of an `if` chain. Adding a panel is a registry entry — Open/Closed satisfied.

- [ ] **Step 1: Write the failing test.**

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { createPanelRouter } from '@/app/panel-router';
import { createPanelHost } from '@/app/panel-host';

describe('panel router', () => {
  it('opening a main-group panel closes the previously open one', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const openTech = vi.fn(() => { layer.appendChild(Object.assign(document.createElement('div'), { id: 'tech-panel' })); });
    const openCouncil = vi.fn(() => { layer.appendChild(Object.assign(document.createElement('div'), { id: 'council-panel' })); });

    const router = createPanelRouter({
      host,
      registry: {
        tech: { domId: 'tech-panel', exclusiveGroup: 'main', open: openTech },
        council: { domId: 'council-panel', exclusiveGroup: 'main', open: openCouncil },
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

  it('toggle closes an already-open panel instead of reopening it', () => {
    const layer = document.createElement('div');
    const host = createPanelHost(layer);
    const open = vi.fn(() => { layer.appendChild(Object.assign(document.createElement('div'), { id: 'tech-panel' })); });
    const router = createPanelRouter({
      host,
      registry: { tech: { domId: 'tech-panel', exclusiveGroup: 'main', open } },
      context: {} as never,
    });

    router.toggle('tech');
    router.toggle('tech');

    expect(layer.querySelector('#tech-panel')).toBeNull();
    expect(open).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement.** `toggle` = `isOpen(id) ? close(id) : open(id)`; `open` closes the exclusive group first. Keep the registry typed with `satisfies Readonly<Record<PanelId, PanelDescriptor>>` so key coverage is checked without widening the value type.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Migrate the real panels.** Move each `else if` branch of `togglePanel` into its registry entry's `open`. The `councilPanelOpen` boolean is deleted — `isOpen('council')` derives it from the DOM, which removes a second source of truth. Keyboard shortcuts and `createGameShell` callbacks now call `router.toggle('council')` etc.
- [ ] **Step 6: Close the phase**

---

### Phase 6 — Presentation registrars

Replaces the 72 module-scope `bus.on(...)` registrations (`src/main.ts:4377-4961`) with ~12 domain modules. This is the phase that makes importing `main.ts` in a test *possible*, because it removes the largest block of import-time side effects.

**Files:**
- Create: `src/presentation/register-*.ts` (~12 files, per the structure in Part II) and `src/presentation/register-all.ts`
- Test: `tests/presentation/register-*.test.ts` (one per registrar)
- Modify: `src/main.ts` (delete the 72 handlers)

**Interfaces:**
- Consumes: `EventBus`, `GameSession`, `Notifier`, `PanelRouter`.
- Produces:

```ts
export interface PresentationContext {
  readonly session: GameSession;
  readonly notifier: Notifier;
  readonly router: PanelRouter;
}

/** Returns a disposer that removes every subscription this registrar added. */
export type PresentationRegistrar = (bus: EventBus, ctx: PresentationContext) => () => void;
```

Returning a disposer is not speculative generality: `EventBus.on` already returns an unsubscribe function, hot-seat handoff already needs to tear panels down, and without it these registrars would leak subscriptions across a "new game from the pause menu" transition — a latent bug in the current code, since `main.ts` registers once at import and can never unregister.

- [ ] **Step 1: Write the failing test for the first registrar** (do diplomacy first — it is small and self-contained, `src/main.ts:4533-4561`):

```ts
import { describe, it, expect, vi } from 'vitest';
import { EventBus } from '@/core/event-bus';
import { registerDiplomacyPresentation } from '@/presentation/register-diplomacy-presentation';

describe('diplomacy presentation', () => {
  it('announces a war declaration to the log once', () => {
    const bus = new EventBus();
    const deliver = vi.fn();
    const ctx = makeContext({ deliver });

    registerDiplomacyPresentation(bus, ctx);
    bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player' });

    expect(deliver).toHaveBeenCalledTimes(1);
    expect(deliver.mock.calls[0][1]).toContain('war');
  });

  it('disposing removes the subscription', () => {
    const bus = new EventBus();
    const deliver = vi.fn();
    const dispose = registerDiplomacyPresentation(bus, makeContext({ deliver }));

    dispose();
    bus.emit('diplomacy:war-declared', { attackerId: 'ai-1', defenderId: 'player' });

    expect(deliver).not.toHaveBeenCalled();
  });
});
```

Write `makeContext` once in `tests/helpers/presentation-context.ts` and reuse it across all twelve registrar suites — it is the fake-ports harness the whole plan pays for.

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `registerDiplomacyPresentation`** by moving the four `bus.on` bodies verbatim, collecting the returned unsubscribers, and returning a disposer that calls them all.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Repeat for the remaining eleven registrars,** one commit each, in this order (smallest and least entangled first): era, trade, religion, faction-crisis, network, wonder, city, espionage, beast, raider (barbarian + pirate), combat.

`combat` goes last: its handler already delegates to `handleCombatResolvedEvent` in `src/ui/combat-resolved-presentation.ts` but also touches selection state, so it is the only registrar that needs `SelectionStore` — and by Phase 6 that port exists.

- [ ] **Step 6: Add `register-all.ts`** composing all twelve and returning a single disposer, and call it once from `main.ts`.
- [ ] **Step 7: Convert the affected source-grep assertions.** `tests/main.integration.test.ts`'s `era:advanced notification` block (4 assertions, lines 265-311) tests behavior that now lives in `register-era-presentation.ts`. Rewrite those four as real tests against the registrar and delete them from the grep file.
- [ ] **Step 8: Close the phase**

---

### Phase 7 — `SelectionController` and `MapInteractionController`

The biggest phase: `selectUnit` (456 lines), `handleHexTap` (624), `handleHexLongPress` (37), plus the movement/animation helpers.

**Files:**
- Create: `src/app/controllers/selection-controller.ts`, `src/app/controllers/map-interaction-controller.ts`, `src/input/map-tap-intent.ts`
- Test: `tests/app/controllers/selection-controller.test.ts`, `tests/app/controllers/map-interaction-controller.test.ts`, `tests/input/map-tap-intent.test.ts`
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `GameSession`, `SelectionStore`, `Notifier`, `PanelRouter`.
- Produces:

```ts
export type MapTapIntent =
  | { readonly kind: 'ignore' }
  | { readonly kind: 'select-unit'; readonly unitId: string }
  | { readonly kind: 'open-stack-picker'; readonly coord: HexCoord; readonly unitIds: readonly string[] }
  | { readonly kind: 'move'; readonly unitId: string; readonly to: HexCoord }
  | { readonly kind: 'attack'; readonly attackerId: string; readonly targetKey: string }
  | { readonly kind: 'open-city'; readonly cityId: string }
  | { readonly kind: 'resolve-pending'; readonly intent: PendingMapIntent; readonly coord: HexCoord }
  | { readonly kind: 'blocked'; readonly reason: MovementBlockerReason };

export function resolveMapTapIntent(
  state: GameState,
  selection: SelectionSnapshot,
  coord: HexCoord,
): MapTapIntent;
```

`resolveMapTapIntent` is **pure** — no DOM, no mutation, no `bus`. That is what makes the eight-case Interaction Replay Checklist in Part III cheap to test. The controller's `handleHexTap` becomes an exhaustive `switch (intent.kind)` with:

```ts
default: {
  const _exhaustive: never = intent;
  throw new Error(`Unhandled map tap intent: ${JSON.stringify(_exhaustive)}`);
}
```

- [ ] **Step 1: Write failing tests for `resolveMapTapIntent`** — one per row of the Interaction Replay Checklist in Part III. These are pure-function tests over a fixture state; use `tests/fixtures/` for the state builder if one already fits, otherwise add one.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `resolveMapTapIntent`** by reading `src/main.ts:3144-3768` top to bottom and translating each early-return branch into a union member. Do not change precedence — the existing order *is* the specification. Where the existing code checks the four pending flags in sequence, translate to a single `switch (selection.pendingIntent.kind)` that preserves the same outcomes.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Extract `SelectionController`** (`selectUnit`, `deselectUnit`, `selectNextUnit`, `refreshSelectedUnitAfterCombat`, `animateMovedUnit`, `executeAnimatedUnitMove`, `startAutoExplore`, `cancelAutoExplore`, `cancelJourney`, `openUnitContextMenu`, `isUnitAnimationLocked`) with tests for: selecting sets ranges; deselecting clears both ranges and highlights; `selectNextUnit` skips units that have acted; a second `selectUnit` on an animating unit is a no-op.
- [ ] **Step 6: Extract `MapInteractionController`** — the executor half plus `handleHexLongPress`.
- [ ] **Step 7: Convert the affected source-grep assertions.** `tests/main.integration.test.ts` blocks `player combat wiring` (3), `land-unit water recovery wiring` (1), `shared city founding wiring` (1), `shared unit upgrade wiring` (1), `shared city assault wiring` (4) — 10 assertions total — all describe behavior now in these two controllers. Rewrite as real tests; delete from the grep file.
- [ ] **Step 8: Close the phase**

---

### Phase 8 — `TurnFlowController`

**Files:**
- Create: `src/app/controllers/turn-flow-controller.ts`
- Test: `tests/app/controllers/turn-flow-controller.test.ts`
- Modify: `src/main.ts`

**Moves:** `endTurn`, `beginHotSeatHandoff`, `releaseHandoffToViewer`, `closeNetworkPanelsForHandoff`, `beginNetworkPlansForCurrentViewer`, `runCurrentCompletedRound`, `captureAIMoves`, `replayAIMoves`, `handleVictoryIfNeeded`, `centerOnCurrentPlayer`, `emitCurrentPlayerAudioSnapshot`, `maybeShowCouncilInterrupt`, `showRequiredChoicesIfNeeded`, `showReligionBoonIfNeeded`, `refreshRequiredChoicesAfterAction`, `closeRequiredChoicePanel`.

**Interfaces:**
- Consumes: all four ports, plus narrow function refs for the genuinely concrete collaborators: `{ autoSave, advisorCheck, setMasterVolume, roundGate }`.
- Produces: `createTurnFlowController(deps): TurnFlowController` with `{ endTurn(options?): Promise<void>; enterViewerTurn(): void }`.

- [ ] **Step 1: Write failing tests** for the four ordering guarantees currently protected only by regex:
  - solo `endTurn` runs the completed round, replays AI moves, *then* refreshes, *then* opens required choices;
  - `endTurn` is a no-op when `state.gameOver`;
  - a pending religion boon blocks `endTurn` and toasts, without advancing the turn;
  - hot-seat `endTurn` suppresses the presentation gate, mutes audio, and autosaves before the handoff overlay resolves.
- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement** by moving bodies verbatim; substitute port calls for the direct `renderLoop` / `updateHUD` / `showNotification` references.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Convert the affected source-grep assertions.** `completed-round AI wiring` (4 assertions) and `campaign entry wiring`'s "opens required research choices" (1) — 5 total. Rewrite; delete from the grep file.
- [ ] **Step 6: Close the phase**

---

### Phase 9 — `CampaignEntryController`, `GameSessionController`, and the composition root

**Files:**
- Create: `src/app/controllers/campaign-entry-controller.ts`, `src/app/controllers/game-session-controller.ts`, `src/app/bootstrap.ts`
- Test: `tests/app/controllers/campaign-entry-controller.test.ts`, `tests/app/bootstrap.test.ts`
- Modify: `src/main.ts` → final form

**Moves:** `init`, `showStartSavePanel`, `showGameModeSelection`, `enterCampaign`, `enterCampaignForE2E`, `startGame`, `createUI`, `getPersistedSettingsOverrides`, `mergePersistedSettings`, `refreshPersistedSettings`, `updateHUD`, `setMapViewportBottomInset`, `prefersReducedMotion`.

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

`main.ts`'s final form is approximately:

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

- [ ] **Step 1: Write the failing bootstrap test** — the payoff test, the one that was impossible before this plan:

```ts
// @vitest-environment jsdom
import { describe, it, expect, vi } from 'vitest';
import { bootstrap } from '@/app/bootstrap';

describe('bootstrap', () => {
  it('wires a session, registers presentation, and shows the save panel without touching AudioContext', async () => {
    document.body.innerHTML = '<canvas id="game-canvas"></canvas><div id="ui-layer"></div>';
    const services = makeFakeServices();

    await bootstrap(services);

    expect(document.getElementById('save-panel')).not.toBeNull();
    expect(services.audio.start).not.toHaveBeenCalled(); // audio starts on campaign entry, not bootstrap
  });
});
```

- [ ] **Step 2: Run, confirm failure.**
- [ ] **Step 3: Implement `bootstrap`** as: construct ports → construct controllers → `registerAllPresentation` → `campaignEntry.showStartSavePanel()`, preserving the existing e2e branch (`import.meta.env.MODE === 'e2e'`) exactly.
- [ ] **Step 4: Run — expect PASS.**
- [ ] **Step 5: Convert the remaining source-grep assertions.** `campaign entry wiring` (3 remaining) and `air-defense overlay button placement` (2) — 5 total. `tests/main.integration.test.ts` should now be **empty and deleted**.
- [ ] **Step 6: Close the phase**

---

### Phase 10 — Ratchet down and lock the boundary

**Files:**
- Create: `tests/app/architecture-boundaries.test.ts`
- Modify: whichever `setStateWithoutRefresh` sites survive

- [ ] **Step 1: Audit every remaining `setStateWithoutRefresh` call.** For each, determine whether the player could observe stale data. Convert to `commit` where they could — **each conversion is a bug fix and needs its own test and its own line in the PR body**, since these are the only intentional behavior changes in the whole plan.
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
  });

  it('only main.ts constructs concrete platform services', () => {
    // Every other module receives them through ports.
    expect(main).toContain('new AudioContext()');
    expect(main).toContain('new RenderLoop(');
  });
});
```

- [ ] **Step 3: Write the port-purity test** — controllers must not import concrete platform types:

```ts
import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

it('controllers depend on ports, not on RenderLoop/AudioSystem/document', () => {
  const dir = resolve(__dirname, '../../src/app/controllers');
  for (const file of readdirSync(dir)) {
    const source = readFileSync(resolve(dir, file), 'utf8');
    expect(source, file).not.toMatch(/from '@\/renderer\/render-loop'/);
    expect(source, file).not.toMatch(/from '@\/audio\/audio-system'/);
    expect(source, file).not.toMatch(/\bdocument\.getElementById\(/);
  }
});
```

`document.getElementById` is banned in controllers specifically because it is the ambient-global escape hatch that would let a controller reach around `PanelHost` and silently reintroduce the coupling this plan removes. Panels get their root from `PanelHost.layer`.

- [ ] **Step 4: Delete the `setStateWithoutRefresh` ratchet test from Phase 2** (or, if some bypasses are genuinely correct, lower its bound to that number and document each in a comment).
- [ ] **Step 5: Update `CLAUDE.md`** — add to the Architecture section: "`src/main.ts` is a composition root only. New app behavior goes in `src/app/controllers/` (depends on `src/app/ports.ts`) or `src/presentation/` registrars. Enforced by `tests/app/architecture-boundaries.test.ts`."
- [ ] **Step 6: Close the phase**

---

## Part V — Test Design Requirements

Per `docs/superpowers/plans/README.md` §5, and because the current coverage of this file is 21 regex assertions.

**Every phase must add:**
- at least one test that performs the interaction and inspects the resulting DOM or state, not just the internal call;
- at least one negative test for any derived semantic helper introduced (`isOpen`, `resolveMapTapIntent`'s `blocked` variant, `PendingMapIntent` precedence);
- for Phase 5, a test proving every registry-declared panel is still reachable from the shell/keyboard after the router replaces `togglePanel`.

**Running count of source-grep assertions retired** (must reach zero):

| Phase | Block retired | Assertions |
|---|---|---|
| 6 | `era:advanced notification` | 4 |
| 7 | combat / water-recovery / city-founding / upgrade / assault wiring | 10 |
| 8 | `completed-round AI wiring` + required-choices | 5 |
| 9 | `campaign entry wiring` + air-defense placement | 5 |
| — | **Total** | **24** |

(24 rather than 21 because three `it` blocks carry multiple `readFileSync` assertions; count from the file, not from this table, when checking off.)

---

## Part VI — Risks

| Risk | Why it is real here | Mitigation |
|---|---|---|
| A phase silently changes refresh timing and the HUD goes stale | 46 sites currently do not refresh; it is not knowable from the code which are intentional | Phase 2 preserves every site exactly via `setStateWithoutRefresh`; changes are deferred to Phase 10 where each gets a test |
| `handleHexTap` precedence changes | Four independent pending flags whose ordering is emergent, not specified | Phase 7 extracts a pure resolver **first** and tests all eight replay rows before any behavior moves |
| Hot-seat handoff regressions | Most stateful, least covered flow; involves audio muting, overlays, autosave, and the presentation gate | Phase 8 tests the four ordering guarantees; e2e `web-smoke.spec.ts` must pass before merge |
| Losing a fixup during the save consolidation | 23 fixups, 20 `as any` casts, no existing tests | The classification table is a checklist; the new-game completeness test proves the new-game path; keep a v10 and a v11 golden fixture save in `tests/fixtures/` |
| Merge conflicts against feature work | `main.ts` is touched by nearly every feature PR | Ten small PRs merged promptly, not one large branch. Coordinate: no other `main.ts`-touching PR should sit open across a phase merge |
| Scope creep into "while I'm here" fixes | Guaranteed to be tempting across 5,462 lines | Behavior-preserving is a Global Constraint; file issues instead. Phase 10 is the only phase permitted to change behavior |

---

## Part VII — Self-Review Notes

- **Spec coverage:** all six controllers from the source list are assigned (`GameSessionController` → Phase 9, `TurnFlowController` → 8, `SelectionController` → 7, `PanelRouter` → 5, `CampaignEntryController` → 9, `PresentationCoordinator` → 6 as twelve registrars). The save-normalization requirement is Phase 1. `MapInteractionController` is added with justification in Part II.
- **Placeholder scan:** no TBD/TODO in the plan itself. The one `// TODO(composition-root)` comment introduced in Phase 2 Step 5 is a deliberate, counted, ratcheted debt marker retired in Phase 10.
- **Type consistency:** `GameSession.commit` / `update` / `setStateWithoutRefresh` / `subscribe` are used with those exact names in Phases 2, 7, 8, and 10. `PendingMapIntent` (Phase 3) is consumed by `MapTapIntent`'s `resolve-pending` variant (Phase 7). `PresentationRegistrar` returns `() => void` in both its definition and its Phase 6 disposal test. `PanelId` is defined in Phase 5 and referenced by `PanelHost.close` in Part II.
- **Known soft spot:** the exact `createHotSeatGame` config literal in Phase 1 Step 6 is illustrative and must be matched to the real `HotSeatConfig` type when writing the test.
