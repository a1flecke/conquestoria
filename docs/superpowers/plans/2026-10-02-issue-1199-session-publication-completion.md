# #1199 — Finish GameSession Publication: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Controllers change application state only through `GameSession` (`commit`/`update`/`batch`) and never mutate a state-owned object in place or hand-push the renderer/HUD.

**Architecture:** Convert the two in-place mutation boundaries that controllers currently rely on — unit movement (`executeValidatedUnitMove`) and visibility (`updateAndRefreshVisibility`/`updateVisibility`/`applyReconReveals`) — from in-place mutators into pure transitions that return a new `GameState`. Every controller then commits the returned state and lets `bootstrap`'s single session subscription publish it. Delete all `renderLoop.setGameState(...)`/`hud.update()`/`updateHUD()` push glue in `src/app/controllers` except the two documented `presentation-deferred` lines in `turn-flow-controller.ts`.

**Tech Stack:** TypeScript, Vitest (jsdom for controller tests), Yarn PnP via `./scripts/run-with-mise.sh`.

**Base:** `origin/main` at plan time (rebased before PR per repo policy).

**Closes:** #1199. **Related:** #1015 (session publication), #1014 (caller discipline), `.claude/rules/session-publication.md`.

---

## Audit findings (why this plan exists)

Fresh audit at the plan base:

1. **24 `renderLoop.setGameState(` sites** across `src/app/controllers` (panel-actions 15, selection 7, map-interaction 5, player-action 2, turn-flow 2, game-session-controller 0 after `startGame`), plus many `hud.update()`/`updateHUD()`.
2. **Two genuinely silent in-place mutations** (real bugs, no publication):
   - `src/app/controllers/game-session-controller.ts:207` — `(deps.session.getState().settings as unknown as Record<string, number | boolean>)[key] = value;`
   - `src/app/controllers/turn-flow-controller.ts:351` — `capturingCiv.gold += 30;` (Viking spoils). It is inside a `session.batch(...)` so the *final* state is published today, but the write is still in-place.
3. **The remaining pushes are load-bearing, not redundant.** `src/systems/unit-movement-system.ts:124` `executeValidatedUnitMove` mutates the passed `GameState` in place (`state.units = { ... }`, `state.autonomyByCiv = ...`) and returns the same object. Controllers never commit that result; the manual `renderLoop.setGameState(session.getState())` is the only publication. This is a documented contract (`tests/integration/transport-cargo-lifecycle.test.ts:87`: "`executeUnitMove` mutates the passed state in place and returns move metadata"). `updateAndRefreshVisibility(state, civId): void` and `updateVisibility(vis, ...): void` are the same shape for visibility.
4. **Controller tests cannot catch a missing publication.** They build a real `createGameSession(state)` but wire a bare `vi.fn()` renderer/`updateHUD` and never `session.subscribe(...)` them, so deleting a push leaves every test green (e.g. `tests/app/controllers/selection-controller.test.ts:126-160`).

### Blast radius of the boundary change

- `executeUnitMove`/`executeValidatedUnitMove` callers (must commit/thread the returned state): `map-interaction-controller.ts:770`, `player-action-controller.ts:446`, `core/turn-manager.ts:650,951`, `systems/auto-explore-system.ts:205`, `systems/rogue-elephant-host-system.ts:341,360`, `systems/stampede-system.ts:362`, `systems/pirate-system.ts:502`, `systems/minor-civ-system.ts:501`, `systems/city-capture-system.ts:380`, `ai/ai-upgrades.ts:220,326`, `ai/ai-resettlement.ts:86`, `ai/ai-major-turn.ts:314,441`, `ai/basic-ai.ts:328,753,800,875,1575`, `input/worker-movement-flow.ts:21`.
- `updateAndRefreshVisibility` callers: `selection-controller.ts:955`, `player-action-controller.ts:507`, `ai/basic-ai.ts:1194,1823`.

### Player Truth Table (publication must be visible)

| Surface | Action | Must visibly change immediately |
|---|---|---|
| Map canvas + HUD | Move a unit (tap destination) | Unit at new tile; move points; journey path cleared; HUD refresh — without a controller push |
| Info panel | Cancel journey / auto-explore | Panel + highlights reflect automation cleared |
| Pause menu | Change a non-volume setting | Persisted setting visible to subscribers on next render |
| City capture panel | Occupy with `naval_raiding` | Gold total updates in HUD/treasury without a manual push |
| Espionage panel | Assign/recall/verify/start mission | Panel rerenders from the committed state |

### Misleading UI risk

None new. This change must not alter fog/visibility semantics: `updateVisibility` keeps the same downgrade-then-reveal order and `applyReconReveals`/`refreshLastSeenPresentationsForCiv` keep the same effect; only the state object identity changes.

### Test design requirements

- Controller tests subscribe a recording renderer and HUD to the **same** session (`tests/helpers/session-subscribers.ts`) and assert `setGameState`/`hud.update` were called by the publication — never by a controller push.
- One visible-behavior test per converted interaction (move, cancel journey, settings, spoils).
- The architecture pin must fail if a new `renderLoop.setGameState(` appears anywhere in `src/app/controllers` outside the pinned `presentation-deferred` lines.

---

## File structure

- Create: `tests/helpers/session-subscribers.ts` — recording renderer/HUD subscribers.
- Modify: `src/systems/fog-of-war.ts` — `updateVisibility`/`applyReconReveals` return new state.
- Modify: `src/systems/last-seen-presentation.ts` — `updateAndRefreshVisibility` returns new state.
- Modify: `src/systems/unit-movement-system.ts` — `executeValidatedUnitMove` returns a new state.
- Modify (callers): the controller/AI/world files listed above.
- Modify: `src/app/controllers/game-session-controller.ts`, `turn-flow-controller.ts` (mutations + pushes).
- Modify: `tests/app/architecture-boundaries.test.ts` (pin), controller tests, movement/visibility tests.
- Modify: `.claude/rules/session-publication.md` (remove the "Tracked as a follow-up" note).

---

## Task 0: Make controller tests able to fail on a missing publication

**Files:**
- Create: `tests/helpers/session-subscribers.ts`
- Modify: `tests/app/controllers/selection-controller.test.ts` (and the other controller test files in later tasks)
- Test: `tests/app/controllers/selection-controller.test.ts`

- [ ] **Step 1: Write the helper**

```ts
// tests/helpers/session-subscribers.ts
import { vi } from 'vitest';
import type { GameState } from '@/core/types';

/** Subscribes a recording renderer + HUD to a session exactly as bootstrap.ts does. */
export function subscribeRecordingViews(session: {
  subscribe: (l: (s: GameState) => void) => () => void;
}) {
  const renderer = { setGameState: vi.fn() };
  const hud = { update: vi.fn() };
  const off1 = session.subscribe(next => renderer.setGameState(next));
  const off2 = session.subscribe(() => hud.update());
  return { renderer, hud, unsubscribe: () => { off1(); off2(); } };
}
```

- [ ] **Step 2: Wire it into `selection-controller.test.ts` and prove the harness bites**

Add a test that deliberately checks a commit publishes through the subscription (not a controller push):

```ts
it('a state write publishes through the session subscription, not a controller push', () => {
  const state = makeFixture();
  placePlayerUnit(state, 'u1');
  document.body.innerHTML = '<div id="info-panel"></div>';
  const deps = baseDeps(state);
  const views = subscribeRecordingViews(deps.session);   // subscribe BEFORE the action
  const controller = createSelectionController(deps);
  const before = views.renderer.setGameState.mock.calls.length;

  controller.selectUnit('u1');
  deps.session.commit({ ...deps.session.getState() });   // a real write

  expect(views.renderer.setGameState.mock.calls.length).toBeGreaterThan(before);
});
```

- [ ] **Step 3: Run and confirm the helper works**

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers/selection-controller.test.ts`
Expected: PASS. (This test proves the harness; the anti-regression bite arrives in Task 6.)

- [ ] **Step 4: Commit**

```bash
git add tests/helpers/session-subscribers.ts tests/app/controllers/selection-controller.test.ts
git commit -m "test(app): subscribe recording renderer/HUD to controller sessions (#1199)"
```

---

## Task 1: Fix the silent pause-menu settings write

**Files:**
- Modify: `src/app/controllers/game-session-controller.ts:206-207`
- Test: `tests/app/controllers/game-session-controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('#1199: a pause-menu setting change publishes to every subscriber', () => {
  const { deps, session } = baseDeps();
  const views = subscribeRecordingViews(session);
  const menu = openPauseMenu(deps);                         // existing test helper
  const before = views.renderer.setGameState.mock.calls.length;

  menu.onChangeSetting('musicVolume', 0.4);                 // existing callback name

  expect(session.getState().settings.musicVolume).toBe(0.4);
  expect(views.renderer.setGameState.mock.calls.length).toBeGreaterThan(before);
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers/game-session-controller.test.ts -t "publishes to every subscriber"`
Expected: FAIL — no publication (the write is in-place).

- [ ] **Step 3: Implement the returned-state write**

Replace the index write with a session `update`:

```ts
            // Persist all non-master settings to GameSettings (saved on next save).
            // #1199: publish through the session; an in-place settings write is not a write.
            deps.session.update(state => ({
              ...state,
              settings: { ...state.settings, [key]: value },
            }));
```

- [ ] **Step 4: Run — expect PASS**

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers/game-session-controller.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/controllers/game-session-controller.ts tests/app/controllers/game-session-controller.test.ts
git commit -m "fix(app): pause-menu settings write publishes through the session (#1199)"
```

---

## Task 2: Remove the Viking-spoils in-place mutation

**Files:**
- Modify: `src/app/controllers/turn-flow-controller.ts:348-353`
- Test: `tests/app/controllers/turn-flow-controller.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
it('#1199: naval-raiding capture spoils are a committed transition, not an in-place civ mutation', () => {
  const { session, deps } = captureFixtureWithNavalRaiding();
  const before = session.getState().civilizations.player.gold;
  const views = subscribeRecordingViews(session);

  deps.turnFlow.finalizePendingCityCaptureChoice('occupy', { type: 'naval_raiding' } as any);

  const after = session.getState().civilizations.player.gold;
  expect(after).toBe(before + 30);
  expect(views.renderer.setGameState).toHaveBeenCalled();   // batch published the final state
});
```

- [ ] **Step 2: Run it — expect it to FAIL once the harness asserts object identity**

Add an assertion that the gold change came from a *new* civilizations object (the current code mutates the live one):

```ts
  const civilizationsBefore = session.getState().civilizations;
  deps.turnFlow.finalizePendingCityCaptureChoice('occupy', { type: 'naval_raiding' } as any);
  expect(session.getState().civilizations).not.toBe(civilizationsBefore);
```

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers/turn-flow-controller.test.ts -t "naval-raiding capture spoils"`
Expected: FAIL — same `civilizations` reference.

- [ ] **Step 3: Implement the returned-state write**

Replace the in-place mutation inside the batch with a session `update`:

```ts
      if (result.outcome === 'occupied') {
        const capturingCiv = deps.currentCiv();
        if (capturingCiv && attackerBonus?.type === 'naval_raiding') {
          session.update(state => ({
            ...state,
            civilizations: {
              ...state.civilizations,
              [capturingCiv.id]: {
                ...state.civilizations[capturingCiv.id],
                gold: state.civilizations[capturingCiv.id].gold + 30,
              },
            },
          }));
          deps.showNotification('Viking raid spoils! +30 gold', 'success');
        }
        deps.showNotification(`We have captured ${cityName}!`, 'success');
      }
```

- [ ] **Step 4: Run — expect PASS**

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers/turn-flow-controller.test.ts`
Expected: PASS (batch still publishes exactly once).

- [ ] **Step 5: Commit**

```bash
git add src/app/controllers/turn-flow-controller.ts tests/app/controllers/turn-flow-controller.test.ts
git commit -m "fix(app): commit Viking capture spoils instead of mutating the live civ (#1199)"
```

---

## Task 3: Make the visibility boundary pure

**Files:**
- Modify: `src/systems/fog-of-war.ts:49-...` (`updateVisibility`), `:188-199` (`applyReconReveals`)
- Modify: `src/systems/last-seen-presentation.ts:175-187` (`updateAndRefreshVisibility`)
- Modify callers: `selection-controller.ts:946-956`, `player-action-controller.ts:507`, `ai/basic-ai.ts:1194,1823`
- Test: `tests/systems/fog-of-war.test.ts`, `tests/systems/last-seen-presentation.test.ts`, `tests/ai/ai-perception.test.ts`

- [ ] **Step 1: Write failing tests that assert a new state is returned and the input is untouched**

```ts
it('#1199: updateVisibility returns a new VisibilityMap and does not mutate its input', () => {
  const vis = { tiles: { '0,0': 'visible' } } as VisibilityMap;
  const frozen = structuredClone(vis);
  const next = updateVisibility(vis, [], map, []);
  expect(vis).toEqual(frozen);           // input untouched
  expect(next).not.toBe(vis);            // new object
});
```

```ts
it('#1199: updateAndRefreshVisibility returns a new GameState, leaving the input untouched', () => {
  const state = makeState();
  const before = structuredClone(state);
  const next = updateAndRefreshVisibility(state, 'player');
  expect(state).toEqual(before);
  expect(next).not.toBe(state);
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/fog-of-war.test.ts tests/systems/last-seen-presentation.test.ts`
Expected: FAIL — both currently return `void`/mutate.

- [ ] **Step 3: Implement pure transitions**

`updateVisibility` clones tiles and returns the new map plus newly revealed coords:

```ts
export function updateVisibility(
  vis: VisibilityMap,
  units: readonly Unit[],
  map: GameMap,
  cityPositions: HexCoord[] = [],
  getVisionBonus?: (unit: Unit) => number,
): { visibility: VisibilityMap; newlyRevealed: HexCoord[] } {
  const tiles: VisibilityMap['tiles'] = {};
  for (const [key, value] of Object.entries(vis.tiles)) tiles[key] = value === 'visible' ? 'fog' : value;
  const nextVis: VisibilityMap = { ...vis, tiles };
  // ... same reveal loops, writing into nextVis.tiles ...
  return { visibility: nextVis, newlyRevealed };
}
```

`applyReconReveals` and `updateAndRefreshVisibility` return a new `GameState` built with the new visibility (and a fresh `civilizations[civId]` object). `refreshLastSeenPresentationsForCiv` is made to return a new `GameState` the same way (its current in-place `civ.visibility.lastSeen[key] = ...` becomes a rebuilt object).

- [ ] **Step 4: Update callers to commit/thread the result**

- `selection-controller.refreshCurrentPlayerVisibility`:
  ```ts
  function refreshCurrentPlayerVisibility(): void {
    // ... existing guards ...
    const next = updateAndRefreshVisibility(session.getState(), session.getState().currentPlayer);
    session.commit(next);
  }
  ```
- `player-action-controller.ts:507`: `deps.session.commit(updateAndRefreshVisibility(deps.session.getState(), deps.session.getState().currentPlayer));`
- `ai/basic-ai.ts:1194,1823`: assign the result into the local `next`/`newState` the surrounding code already threads (`newState = updateAndRefreshVisibility(newState, civId)`).

- [ ] **Step 5: Run all affected suites — expect PASS**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/fog-of-war.test.ts tests/systems/last-seen-presentation.test.ts tests/ai/ai-perception.test.ts tests/app/controllers/selection-controller.test.ts tests/app/controllers/player-action-controller.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/fog-of-war.ts src/systems/last-seen-presentation.ts src/app/controllers/selection-controller.ts src/app/controllers/player-action-controller.ts src/ai/basic-ai.ts tests/systems/fog-of-war.test.ts tests/systems/last-seen-presentation.test.ts
git commit -m "refactor(fog): visibility refresh returns a new state (#1199)"
```

---

## Task 4: Make the movement boundary pure (split; every slice ships a playable game)

**Constraint (per review):** each sub-task below must build and run a playable game, and be easy to track. Because all ~22 callers rely on the current in-place contract, the executor keeps a **transitional in-place write-back** until Task 4d. Callers migrate group by group; the write-back is deleted last, once nothing relies on it.

**Files:**
- Modify: `src/systems/unit-movement-system.ts:124-...` (`executeValidatedUnitMove`, `executeUnitMove`)
- Modify callers (22, grouped below)
- Test: `tests/systems/unit-movement-system.test.ts`, `tests/integration/transport-cargo-lifecycle.test.ts`, `tests/systems/unit-movement-characterization.test.ts`

---

### Task 4a: Executor builds and returns a new state (transitional write-back kept)

- [ ] **Step 1: Write the contract test**

```ts
it('#1199 (4a): executeUnitMove returns a new state carrying the move', () => {
  const { state, mover } = makeMoverFixture();
  const result = executeUnitMove(state, mover.id, { q: 1, r: 0 }, { actor: 'player', civId: 'player' });
  expect(result.ok).toBe(true);
  expect(result.state).not.toBe(state);                         // new object
  expect(result.state.units[mover.id].position).toEqual({ q: 1, r: 0 });
  expect(state.units[mover.id].position).toEqual({ q: 1, r: 0 }); // transitional: in-place still true
});
```

- [ ] **Step 2: Run — expect FAIL** on `result.state` identity.

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts -t "4a"`

- [ ] **Step 3: Implement**

Build `nextState` locally as the plan's original Step 3 shows, then, immediately before returning, preserve today's behaviour by writing it back (`state.units = nextState.units; if (nextState.autonomyByCiv !== state.autonomyByCiv) state.autonomyByCiv = nextState.autonomyByCiv;`) and return `{ ...result, state: nextState }`. Add a `// #1199 TODO(4d): remove this write-back once all callers consume result.state` marker at the write-back.

- [ ] **Step 4: Run all movement suites — expect PASS** (behaviour unchanged; only `.state` identity changed).

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts tests/systems/unit-movement.test.ts tests/systems/unit-movement-resolver-parity.test.ts tests/systems/unit-movement-regression.test.ts tests/systems/unit-movement-characterization.test.ts tests/systems/movement-resolver.test.ts tests/integration/transport-cargo-lifecycle.test.ts`

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-movement-system.ts tests/systems/unit-movement-system.test.ts
git commit -m "refactor(movement): executor returns a new state; transitional write-back (#1199 4a)"
```

---

### Task 4b: Migrate player-facing callers to `result.state`

**Files:** `src/app/controllers/map-interaction-controller.ts:770`, `src/app/controllers/player-action-controller.ts:446`, `src/input/worker-movement-flow.ts:21`, `src/systems/auto-explore-system.ts:205`, `src/app/controllers/selection-controller.ts` (`executeAnimatedUnitMove` bracket).

- [ ] **Step 1: Commit the returned state at each player path** (the transitional write-back means this is a no-op behaviourally today, so the game stays playable):

```ts
// map-interaction-controller.ts case 'move'
selectionController.executeAnimatedUnitMove(intent.unitId, () => {
  const result = executeUnitMove(session.getState(), intent.unitId, intent.coord, { actor: 'player', civId: session.getState().currentPlayer, bus });
  if (result.ok) session.commit(result.state);
  return result;
});
```

`worker-movement-flow.ts:21` and `auto-explore-system.ts:205` return/thread `result.state` to their single controller caller; `player-action-controller.ts:446` commits the move result before the minor-civ conquest commit.

- [ ] **Step 2: Visible-behaviour test** — a moved unit shows at the new tile through the session subscription only (no manual push).

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers/map-interaction-controller.test.ts tests/app/controllers/player-action-controller.test.ts tests/systems/auto-explore-system.test.ts tests/input/worker-movement-flow.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/app/controllers/map-interaction-controller.ts src/app/controllers/player-action-controller.ts src/app/controllers/selection-controller.ts src/input/worker-movement-flow.ts src/systems/auto-explore-system.ts
git commit -m "refactor(app): player movement commits the executor's new state (#1199 4b)"
```

---

### Task 4c: Migrate AI, world actors, and turn-manager

**Files:** `src/core/turn-manager.ts:650,951`, `src/systems/rogue-elephant-host-system.ts:341,360`, `src/systems/stampede-system.ts:362`, `src/systems/pirate-system.ts:502`, `src/systems/minor-civ-system.ts:501`, `src/systems/city-capture-system.ts:380`, `src/ai/ai-upgrades.ts:220,326`, `src/ai/ai-resettlement.ts:86`, `src/ai/ai-major-turn.ts:314,441`, `src/ai/basic-ai.ts:328,753,800,875,1575`.

- [ ] **Step 1: Thread the returned state** into the local variable each caller already reassigns:

```ts
const movement = executeUnitMove(next, unit.id, coord, { actor: 'ai', civId, bus });
if (movement.ok) next = movement.state;   // was: relied on in-place mutation
```

- [ ] **Step 2: Run AI + world suites — expect PASS** (behaviour unchanged; write-back still present).

Run: `./scripts/run-with-mise.sh yarn test --run tests/ai tests/systems/rogue-elephant-host-system.test.ts tests/systems/stampede-system.test.ts tests/systems/pirate-system.test.ts tests/systems/minor-civ-system.test.ts tests/systems/city-capture-system.test.ts`

- [ ] **Step 3: Commit**

```bash
git add src/core/turn-manager.ts src/systems/rogue-elephant-host-system.ts src/systems/stampede-system.ts src/systems/pirate-system.ts src/systems/minor-civ-system.ts src/systems/city-capture-system.ts src/ai
git commit -m "refactor(ai): AI/world movement threads the executor's new state (#1199 4c)"
```

---

### Task 4d: Delete the transitional write-back and prove purity

- [ ] **Step 1: Write the frozen-input test** (will FAIL while the write-back exists):

```ts
it('#1199 (4d): executeUnitMove does not mutate the passed state', () => {
  const { state, mover } = makeMoverFixture();
  const before = structuredClone(state);
  const result = executeUnitMove(state, mover.id, { q: 1, r: 0 }, { actor: 'player', civId: 'player' });
  expect(result.ok).toBe(true);
  expect(state).toEqual(before);            // input untouched
  expect(result.state.units[mover.id].position).toEqual({ q: 1, r: 0 });
});
```

- [ ] **Step 2: Remove the write-back** at the `#1199 TODO(4d)` marker and make the helpers it calls pure (`moveUnitWithZoneOfControl`, `syncTransportCargoPositions`, `syncCarrierBasedAircraft`, `cancelInvalidNetworkPlans`) so none assigns into the passed `state`.

- [ ] **Step 3: Run the full movement + AI + controller suites — expect PASS**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-movement-system.test.ts tests/integration/transport-cargo-lifecycle.test.ts tests/integration/transport-cargo-lifecycle.test.ts tests/ai tests/app/controllers`
Then update `tests/integration/transport-cargo-lifecycle.test.ts:87`'s comment (it currently documents the in-place contract) and assert on `sailed.state`.

- [ ] **Step 4: Commit**

```bash
git add src/systems/unit-movement-system.ts tests
git commit -m "refactor(movement): remove transitional write-back; executor is pure (#1199 4d)"
```

---

## Task 5: Delete the controller pushes and publish through the session

**Files:**
- Modify: `selection-controller.ts`, `map-interaction-controller.ts`, `panel-actions-controller.ts`, `player-action-controller.ts`, `turn-flow-controller.ts`, `game-session-controller.ts`

- [ ] **Step 1: Delete every redundant pair/push**

For each site where the mutation is already committed (Tasks 1–4), delete `deps.renderLoop.setGameState(deps.session.getState());` and the adjacent `deps.hud.update();`/`deps.updateHUD();`. Keep `renderLoop` calls that are not publication (`setJourneyPath`, `setStrategicLaunchPreview`, `clearHighlights`, `animateUnitMove`, `hasMovingUnit`, `camera`).

- [ ] **Step 2: Keep only the two pinned deferred lines**

`turn-flow-controller.ts:765` (`renderLoop.setGameState` before `replayAIMoves`) and `:767` (`deps.updateHUD()` after replay) are the solo end-turn `presentation-deferred` publication; keep them and re-add the explanatory comment.

For `turn-flow-controller.ts:200-204` `refreshRequiredChoicesAfterAction`'s push: **delete it if unused, keep it if used.** Concretely — delete the `renderLoop.setGameState(session.getState()); deps.updateHUD();` pair and run `tests/app/controllers/turn-flow-controller.test.ts` plus `tests/app/bootstrap.test.ts`. If the panel-removal refresh is still needed by a real consumer, restore it as a session publication (`session.commit(session.getState())`) with a comment naming that consumer; if nothing fails without it, leave it deleted. No unconditional "keep".

- [ ] **Step 3: Run all controller suites — expect PASS**

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/controllers tests/app/game-session.test.ts tests/app/bootstrap.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/app/controllers tests/app/controllers
git commit -m "refactor(app): controllers publish only through GameSession (#1199)"
```

---

## Task 6: Structural enforcement

**Files:**
- Modify: `tests/app/architecture-boundaries.test.ts` (`#1015` describe)
- Modify: `.claude/rules/session-publication.md`

- [ ] **Step 1: Replace the narrow pair test with a location pin**

```ts
it('#1199: a controller never pushes renderer/HUD state by hand', () => {
  const PINNED_DEFERRED = new Set([
    'src/app/controllers/turn-flow-controller.ts',
  ]);
  const offenders = srcFiles
    .filter(file => file.includes('/src/app/controllers/'))
    .filter(file => {
      const code = stripComments(readFileSync(file, 'utf8'));
      const pushes = [...code.matchAll(/renderLoop\.setGameState\(/g)].length;
      const hud = [...code.matchAll(/\b(?:hud\.update|updateHUD)\(/g)].length;
      return pushes > 0 || hud > 0;
    })
    .filter(file => !(PINNED_DEFERRED.has(rel(file)) && countDeferredPairs(file) === 2))
    .map(rel);
  expect(offenders).toEqual([]);
});
```

where `countDeferredPairs` asserts turn-flow-controller has exactly the two documented deferred lines (pin by content, not just file). Also add a source rule to `scripts/check-src-rule-violations.sh` mirroring this for `src/app/controllers`.

- [ ] **Step 2: Prove the pin bites**

Add a fixture test that runs the same checker over a synthetic `src/app/controllers/foo.ts` containing `renderLoop.setGameState(x); hud.update();` and expects it to be reported.

- [ ] **Step 3: Update the rule doc**

In `.claude/rules/session-publication.md`, delete the final "Mutating a `GameState` object in place is not a write. (Tracked as a follow-up; see the #1014 audit.)" note and state that the transaction boundary is now pure.

- [ ] **Step 4: Run the architecture + source-rule suites**

Run: `./scripts/run-with-mise.sh yarn test --run tests/app/architecture-boundaries.test.ts tests/scripts/check-src-rule-violations.test.ts tests/app/determinism-contract-meta.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/app/architecture-boundaries.test.ts scripts/check-src-rule-violations.sh tests/scripts/check-src-rule-violations.test.ts .claude/rules/session-publication.md
git commit -m "test(app): pin controller publication to the session (#1199)"
```

---

## Task 7: Hot-seat, ordering, and fan-out verification

**Files:** tests only.

- [ ] **Step 1: Hot-seat handoff unchanged**

Add/extend a test proving the `viewer-not-yet-revealed` adopt path still does not publish the next player's fog before reveal (`turn-flow-controller.test.ts`, `campaign-entry-controller.test.ts`).

- [ ] **Step 2: Solo end-turn ordering unchanged**

Assert `renderer.setGameState` is called before `replayAIMoves` and the HUD after (existing `turn-flow-controller.test.ts` coverage — keep it green).

- [ ] **Step 3: Multi-subscriber agreement**

Add a test that commits once and asserts renderer and HUD received the *same* state object (no divergence).

- [ ] **Step 4: Full verification**

Run (separately, never chained):
```bash
./scripts/run-with-mise.sh yarn build
./scripts/run-with-mise.sh yarn verify:pr
./scripts/run-with-mise.sh yarn verify:pr:status
```

- [ ] **Step 5: Commit**

```bash
git add tests
git commit -m "test(app): hot-seat, ordering and subscriber-agreement coverage (#1199)"
```

---

## Self-review

- **Spec coverage:** In-place mutation → Tasks 1–4; redundant pushes → Task 5; structural enforcement + `presentation-deferred` re-audit → Task 6; hot-seat/animation ordering + test fixtures mirror production → Tasks 0, 7. All acceptance bullets are mapped.
- **No placeholders:** each task shows the code to write and the exact command + expected result.
- **Type consistency:** `updateVisibility` returns `{ visibility, newlyRevealed }`; `updateAndRefreshVisibility` returns `GameState` and all callers commit/thread it; `executeValidatedUnitMove` still returns `ExecuteUnitMoveResult` with `state` now a new object.

## Risks / rollback

- **Highest risk:** the movement boundary change (Task 4) touches AI and world actors. Mitigation: land Task 4 as its own commit immediately after Task 3, run the `tests/ai` + movement suites, and prefer `next = movement.state` threading so behavior is unchanged except object identity.
- **Determinism:** no RNG or event-order change is intended; the only ordering change is deleting pushes that were already covered by a commit. The two `presentation-deferred` lines are preserved verbatim.
- **Rollback:** each task is an independent commit; Task 4 can be reverted without disturbing Tasks 1–3.

## Out of scope

- #1013 (maintainability audit), #1135 (battle forecast), #1166 (scheduler).
- No gameplay, balance, save-schema, or AI-decision change.
