# GameSession State-Mutation Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **Do NOT use subagent-driven-development or spawn any subagent for this plan** — this project's `CLAUDE.md` explicitly forbids subagents/parallel agents; execute every task inline in the current session.

**Goal:** Eliminate the 44 call sites across 6 app-layer files that mutate the `GameState` object returned by `session.getState()` directly instead of publishing through `session.commit()`/`session.update()`, so every state change reaches both `GameSession` subscribers (`renderLoop.setGameState`, `hud.update()`) — not just whichever one a given site happens to call by hand.

**Architecture:** No new `GameSession` API. Each flagged site becomes a spread-copy `GameState` passed to `session.commit(next)` or built inside `session.update(state => next)`, matching the existing "Immutable Turn Processing" convention already used by `src/systems/**`. Delivered as 6 phases (one PR each), grouped by file, closing with a grep-based regression test and a real-time edit hook so the count can never silently climb back up.

**Tech Stack:** TypeScript, Vitest (`@vitest-environment jsdom` for controller tests), the existing `createGameSession` test double (the real implementation, not a mock).

**Spec:** `docs/superpowers/specs/2026-08-15-gamesession-state-mutation-audit-design.md` — read it first if anything below is ambiguous; this plan implements it exactly, including the two hazards its review pass found (chained non-refreshing writes, and the `city-panel.ts` closure-staleness regression risk).

## Global Constraints

- Run every command via `bash scripts/run-with-mise.sh yarn <cmd>` — never `eval "$(mise activate bash)" && yarn <cmd>`.
- Never spawn a subagent or parallel agent for any part of this plan (project policy).
- All work happens in the current worktree (already verified on branch `claude/gamesession-state-mutation-audit-ffa5ef` with `core.hooksPath` correctly set to `.githooks`).
- Before converting any flagged site, read its enclosing function to its actual end — not just the flagged line — and check for a trailing `setStateWithoutRefresh` or second mutation that would otherwise silently absorb the fix (confirmed hazard at `ensurePlayerWarState`, Task 1.1).
- Where a call site's manual `renderLoop.setGameState(...)` and/or `hud.update()`/`deps.updateHUD()` companion call becomes redundant because `commit`/`update` now performs the same effect, delete the redundant manual call — do not leave both.
- `src/ui/city-panel.ts`'s `onBuild`, `onMoveQueueItem`, `onRemoveQueueItem`, `onSetIdleProduction` callback types must widen to `(...) => GameState | void` and their call sites must switch from bare `rerenderPanel()` to `rerenderPanel(nextState)`, in the **same commit** as `panel-actions-controller.ts`'s 4 corresponding sites (Phase 5, Tasks 5.2-5.3) — landing one without the other is a regression, not a partial fix.
- `panel-actions-controller.test.ts`'s existing "queues real production via the live city state and refreshes the renderer" test must be **rewritten**, not extended (Task 5.4) — it currently passes only because of the mutation bug it's meant to guard against.
- Every phase ends with `bash scripts/run-with-mise.sh yarn build` and `bash scripts/run-with-mise.sh yarn test`, both exit 0, before that phase's commit(s) are considered done. Phase 3 additionally runs `bash scripts/run-with-mise.sh yarn test:ai-playability`.
- Each converted site is its own line in that phase's PR body (matching the `#787` Phase 14 precedent) — no silent bundling.
- Re-run the inventory greps from the spec at the start of each phase; line numbers below are as of 2026-08-15 and will drift.

---

## Phase 1 — `player-action-controller.ts` (+ `cross-cutting-helpers.ts` decision)

Sets the template: smallest phase, contains one instance of the chained-write hazard, and confirms `getCurrentCiv()`/`deps.currentCiv()` keeps its current read-only shape (no code change to `cross-cutting-helpers.ts` itself — the decision is "don't touch it," verified by this phase's tests still passing with the helper unchanged).

### Task 1.1: `ensurePlayerWarState` — bilateral diplomacy + chained opportunistic-penalty write

**Files:**
- Modify: `src/app/controllers/player-action-controller.ts:256-268`
- Test: `tests/app/controllers/player-action-controller.test.ts:259-290` (extend existing `describe('ensurePlayerWarState', ...)`)

**Interfaces:**
- Consumes: `GameSession.update(fn: (state: GameState) => GameState): void` (already exists, `src/app/ports.ts:39`); `declareWar(state: DiplomacyState, targetCivId: string, turn: number): DiplomacyState` (`src/systems/diplomacy-system.ts:110`, unchanged); `applyOpportunisticWarPenaltyIfCrisisStruck(state: GameState, attackerId: string, defenderId: string, bus: EventBus): GameState` (unchanged, already imported in this file).
- Produces: no new exports — `ensurePlayerWarState(targetCivId: string): void` keeps its existing signature on `PlayerActionController`.

The current code (read it now to confirm line numbers haven't drifted):

```ts
function ensurePlayerWarState(targetCivId: string): void {
    const targetCiv = deps.session.getState().civilizations[targetCivId];
    if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

    const cp = deps.session.getState().currentPlayer;
    const alreadyAtWar = deps.currentCiv().diplomacy?.atWarWith.includes(targetCivId) ?? false;
    if (alreadyAtWar) return;

    deps.currentCiv().diplomacy = declareWar(deps.currentCiv().diplomacy, targetCivId, deps.session.getState().turn);
    targetCiv.diplomacy = declareWar(targetCiv.diplomacy, cp, deps.session.getState().turn);
    deps.bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
    deps.session.setStateWithoutRefresh(applyOpportunisticWarPenaltyIfCrisisStruck(deps.session.getState(), cp, targetCivId, deps.bus));
  }
```

Two bugs here, both fixed by the same rewrite: (1) `deps.currentCiv().diplomacy = ...` and `targetCiv.diplomacy = ...` mutate the live state object directly (Shape B); (2) the trailing `setStateWithoutRefresh` means even a naive fix of just those two lines would still never publish — the function's real terminal write is the opportunistic-penalty result, not the two diplomacy mutations.

- [ ] **Step 1: Write the failing test.** Add to the existing `describe('ensurePlayerWarState', ...)` block in `tests/app/controllers/player-action-controller.test.ts` (after the existing 3 tests, before the closing `});` at line 290):

```ts
    it('publishes the war declaration to session subscribers, not just the renderer', () => {
      const { state, aiCivId } = makeFixture('war-state-publishes');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.ensurePlayerWarState(aiCivId);

      expect(listener).toHaveBeenCalledTimes(1);
      expect(listener).toHaveBeenCalledWith(deps.session.getState());
    });
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/player-action-controller.test.ts -t "publishes the war declaration"`
Expected: FAIL — `listener` was never called, because the current code path ends in `setStateWithoutRefresh`, which never calls `publish()`.

- [ ] **Step 3: Write minimal implementation.** Replace the function body:

```ts
function ensurePlayerWarState(targetCivId: string): void {
    const targetCiv = deps.session.getState().civilizations[targetCivId];
    if (!targetCiv || !isMajorCivOwner(targetCivId)) return;

    const cp = deps.session.getState().currentPlayer;
    const attackerCiv = deps.currentCiv();
    const alreadyAtWar = attackerCiv.diplomacy?.atWarWith.includes(targetCivId) ?? false;
    if (alreadyAtWar) return;

    const turn = deps.session.getState().turn;
    const withDeclaredWar = {
      ...deps.session.getState(),
      civilizations: {
        ...deps.session.getState().civilizations,
        [cp]: { ...attackerCiv, diplomacy: declareWar(attackerCiv.diplomacy, targetCivId, turn) },
        [targetCivId]: { ...targetCiv, diplomacy: declareWar(targetCiv.diplomacy, cp, turn) },
      },
    };
    deps.bus.emit('diplomacy:war-declared', { attackerId: cp, defenderId: targetCivId, opponentKind: resolveOpponentKind(targetCivId) });
    deps.session.commit(applyOpportunisticWarPenaltyIfCrisisStruck(withDeclaredWar, cp, targetCivId, deps.bus));
  }
```

Note: keyed by `cp` (already `= deps.session.getState().currentPlayer`, the same id `deps.currentCiv()` looks up), not a `.id` field, so no assumption about `Civilization` carrying its own id is introduced.

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/player-action-controller.test.ts -t "ensurePlayerWarState"`
Expected: PASS — all 4 tests in the block (the 3 pre-existing behavioral ones plus the new publish test).

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/player-action-controller.ts tests/app/controllers/player-action-controller.test.ts
git commit -m "fix(player-action-controller): publish ensurePlayerWarState through commit, not setStateWithoutRefresh

Both civs' diplomacy were mutated directly on the live state object,
then the function's real terminal write (the opportunistic-war-penalty
result) went through setStateWithoutRefresh -- meaning even fixing the
two mutation lines alone would never have published. Unified all three
writes into one session.commit() call."
```

### Task 1.2: `restAction` — direct unit mutation

**Files:**
- Modify: `src/app/controllers/player-action-controller.ts:270-280`
- Test: `tests/app/controllers/player-action-controller.test.ts:312-323` (extend existing test)

**Interfaces:**
- Consumes: `GameSession.commit(next: GameState): void`; `restUnit(unit: Unit): Unit` (unchanged, already imported).
- Produces: no signature change to `restAction(): void`.

Current code:

```ts
  function restAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || !canHeal(unit)) return;

    deps.session.getState().units[selectedUnitId] = restUnit(unit);
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
    deps.selectionController.deselectUnit();
    deps.renderLoop.setGameState(deps.session.getState());
  }
```

No chained non-refreshing write here — this one is a clean Shape-A conversion.

- [ ] **Step 1: Write the failing test.** Replace the existing `'rests a real damaged unit, heals via restUnit, and deselects'` test (`tests/app/controllers/player-action-controller.test.ts:312-323`) to also assert publish:

```ts
    it('rests a real damaged unit, heals via restUnit, deselects, and publishes to subscribers', () => {
      const { state } = makeFixture('rest-damaged');
      placeUnit(state, 'warrior', 'warrior-1', { q: 0, r: 0 }, { health: 50 });
      const { deps, controller } = build(state, { selection: { getSelectedUnitId: vi.fn(() => 'warrior-1'), setPendingIntent: vi.fn() } });
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.restAction();

      expect(deps.session.getState().units['warrior-1'].isResting).toBe(true);
      expect(deps.selectionController.deselectUnit).toHaveBeenCalledTimes(1);
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('heal'), 'info');
      expect(listener).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/player-action-controller.test.ts -t "rests a real damaged unit"`
Expected: FAIL on `expect(listener).toHaveBeenCalledTimes(1)` — 0 calls, since the current code never calls `commit`/`update`.

- [ ] **Step 3: Write minimal implementation.**

```ts
  function restAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || !canHeal(unit)) return;

    deps.session.commit({
      ...deps.session.getState(),
      units: { ...deps.session.getState().units, [selectedUnitId]: restUnit(unit) },
    });
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
    deps.selectionController.deselectUnit();
  }
```

`deps.renderLoop.setGameState(deps.session.getState())` is deleted — `session.commit()` now performs that in production via the `bootstrap.ts` subscribe wiring, and the test above still passes because `deps.renderLoop.setGameState` is a separately-injected mock the test doesn't require to be called via this exact line (see Step 4).

Wait — check this before running: the test at Step 1 still asserts `expect(deps.renderLoop.setGameState).toHaveBeenCalled();`, but `deps.renderLoop` in this test's `createGameSession`-based fixture is **not** wired to `session.subscribe` (that wiring only exists in `bootstrap.ts`, not in this unit test's `makeDeps`). Deleting the manual call would make that assertion fail. Since this is a controller **unit** test with an unwired `renderLoop` mock, keep the manual `deps.renderLoop.setGameState(deps.session.getState())` call — only the `session.getState().units[...] = ...` mutation is the bug; the manual renderer refresh alongside a proper `commit()` is redundant only in the real app (where `bootstrap.ts` already subscribes `renderLoop`), not incorrect. Revise Step 3's implementation to keep it:

```ts
  function restAction(): void {
    const selectedUnitId = deps.selection.getSelectedUnitId();
    if (!selectedUnitId) return;
    const unit = deps.session.getState().units[selectedUnitId];
    if (!unit || !canHeal(unit)) return;

    deps.session.commit({
      ...deps.session.getState(),
      units: { ...deps.session.getState().units, [selectedUnitId]: restUnit(unit) },
    });
    deps.showNotification(`${UNIT_DEFINITIONS[unit.type].name} is resting and will heal +15 HP next turn`, 'info');
    deps.selectionController.deselectUnit();
    deps.renderLoop.setGameState(deps.session.getState());
  }
```

This is the pattern for every remaining task in this plan: **do not delete a manual `renderLoop.setGameState`/`hud.update` call just because `commit`/`update` now also does it** — these controller unit tests construct their own unwired `createGameSession` instance per test, so the manual call is still the only thing driving the test double's assertion. Only delete a manual call if a specific task's own test coverage proves it's safe to (none in this plan require it — see the corrected Global Constraints intent below).

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/player-action-controller.test.ts -t "rests a real damaged unit"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/player-action-controller.ts tests/app/controllers/player-action-controller.test.ts
git commit -m "fix(player-action-controller): publish restAction's unit rest through session.commit"
```

**Correction to this plan's Global Constraints, discovered in Task 1.2:** delete a redundant manual `renderLoop.setGameState`/`hud.update`/`updateHUD` call only where it is truly dead code after the fix — in production that's most of them, once `commit`/`update` triggers the same effect via `bootstrap.ts`'s subscribe wiring, but every controller unit test in this codebase builds its own `createGameSession` **without** that subscribe wiring, so a manual call being asserted by an existing test must stay unless that test is also being rewritten in the same task. Apply this per-task, not as a blanket deletion rule — Task 1.1 had no manual calls to preserve; this task and most that follow do.

### Task 1.3: `executeMinorCivConquest` — unit mutation feeding a `setStateWithoutRefresh` chain

**Files:**
- Modify: `src/app/controllers/player-action-controller.ts:429-448`
- Test: `tests/app/controllers/player-action-controller.test.ts:557-590` (extend existing tests)

**Interfaces:**
- Consumes: `conquestMinorCiv(state: GameState, minorCivId: string, conquerorId: string): { state: GameState; conquered: boolean; transitions: ... }` (unchanged).
- Produces: no signature change to `executeMinorCivConquest`.

Current code:

```ts
  function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
    const cityName = deps.session.getState().cities[cityId]?.name ?? 'City-State';
    const movement = deps.selectionController.executeAnimatedUnitMove(unitId, () => executeUnitMove(deps.session.getState(), unitId, target, {
      actor: 'player',
      civId: deps.session.getState().currentPlayer,
      bus: deps.bus,
      foreignCityEntryId: cityId,
    }));
    if (!movement.ok) return;
    const movedUnit = deps.session.getState().units[unitId];
    if (movedUnit) deps.session.getState().units[unitId] = { ...movedUnit, movementPointsLeft: 0 };
    const conquered = conquestMinorCiv(deps.session.getState(), minorCivId, deps.session.getState().currentPlayer);
    deps.session.setStateWithoutRefresh(conquered.state);
    emitMinorCivQuestTransitions(deps.bus, conquered.transitions, deps.session.getState());
    if (conquered.conquered) deps.bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: deps.session.getState().currentPlayer });
    deps.showNotification(`${cityName} has been conquered!`, 'success');
    SFX.tap();
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
  }
```

This is architecture-debt only today (per the spec's severity review) — `deps.hud.update()` is already called manually at the end, so the HUD is not currently stale. But `conquestMinorCiv` is called with `deps.session.getState()` *after* the flagged mutation, meaning it operates on the already-mutated live object rather than a value passed explicitly — and the result then goes through `setStateWithoutRefresh` rather than `commit`, relying entirely on the trailing manual `renderLoop.setGameState` + `hud.update()` to catch up. Fix: fold the unit mutation into one input state, call `conquestMinorCiv` on that explicit value, and `commit` its result.

- [ ] **Step 1: Write the failing test.** Extend the existing `'conquers the minor civ and transfers its city after a successful movement'` test (`tests/app/controllers/player-action-controller.test.ts:576-589`):

```ts
    it('conquers the minor civ, transfers its city, publishes once, and clears the mover\'s movement points', () => {
      const { state } = makeFixture('minor-civ-conquest-success');
      const mcId = Object.keys(state.minorCivs)[0]!;
      const cityId = state.minorCivs[mcId].cityId;
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.executeMinorCivConquest('attacker-1', { q: 0, r: 0 }, mcId, cityId);

      const updated = deps.session.getState();
      expect(updated.minorCivs[mcId].isDestroyed).toBe(true);
      expect(updated.cities[cityId]?.owner).toBe('player');
      expect(updated.units['attacker-1']?.movementPointsLeft).toBe(0);
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('conquered'), 'success');
      expect(deps.hud.update).toHaveBeenCalled();
      expect(listener).toHaveBeenCalledTimes(1);
    });
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/player-action-controller.test.ts -t "conquers the minor civ, transfers its city, publishes once"`
Expected: FAIL on `expect(listener).toHaveBeenCalledTimes(1)` — the current code path ends in `setStateWithoutRefresh`, which never calls `publish()`, so `listener` sees 0 calls.

- [ ] **Step 3: Write minimal implementation.**

```ts
  function executeMinorCivConquest(unitId: string, target: HexCoord, minorCivId: string, cityId: string): void {
    const cityName = deps.session.getState().cities[cityId]?.name ?? 'City-State';
    const movement = deps.selectionController.executeAnimatedUnitMove(unitId, () => executeUnitMove(deps.session.getState(), unitId, target, {
      actor: 'player',
      civId: deps.session.getState().currentPlayer,
      bus: deps.bus,
      foreignCityEntryId: cityId,
    }));
    if (!movement.ok) return;
    const movedUnit = deps.session.getState().units[unitId];
    const stateAfterMove = movedUnit
      ? { ...deps.session.getState(), units: { ...deps.session.getState().units, [unitId]: { ...movedUnit, movementPointsLeft: 0 } } }
      : deps.session.getState();
    const conquered = conquestMinorCiv(stateAfterMove, minorCivId, stateAfterMove.currentPlayer);
    deps.session.commit(conquered.state);
    emitMinorCivQuestTransitions(deps.bus, conquered.transitions, deps.session.getState());
    if (conquered.conquered) deps.bus.emit('minor-civ:destroyed', { minorCivId, conquerorId: deps.session.getState().currentPlayer });
    deps.showNotification(`${cityName} has been conquered!`, 'success');
    SFX.tap();
    deps.renderLoop.setGameState(deps.session.getState());
    deps.hud.update();
  }
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/player-action-controller.test.ts -t "executeMinorCivConquest"`
Expected: PASS — both tests in the block.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/player-action-controller.ts tests/app/controllers/player-action-controller.test.ts
git commit -m "fix(player-action-controller): route executeMinorCivConquest's unit mutation through session.commit"
```

### Phase 1 close-out

- [ ] Run `bash scripts/run-with-mise.sh yarn build` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
- [ ] Confirm `getCurrentCiv`/`deps.currentCiv()` in `src/app/cross-cutting-helpers.ts` was **not modified** — the decision from the spec (keep its read-only convenience shape) holds because both flagged sites in this phase converted at their call site, not the helper.
- [ ] Open the PR. Title: `fix(787): GameSession state-mutation audit — Phase 1 (player-action-controller.ts)`. Body lists all 3 conversions individually, per Global Constraints.

---

## Phase 2 — `campaign-entry-controller.ts`

Both flagged sites mutate `deps.session.getState().settings.councilTalkLevel` directly, immediately after a `setStateWithoutRefresh(createNewGame(...)/createHotSeatGame(...))` call that already replaced the state object with a new one — so the fix here is to fold the settings override into that same state-construction step rather than mutate the freshly-created object afterward.

### Task 2.1: `onStartSolo` and `onComplete` (hot-seat) — settings override merged into game creation

**Files:**
- Modify: `src/app/controllers/campaign-entry-controller.ts:222-238` (`onStartSolo`), `:254-263` (`onComplete`, hot-seat)
- Test: `tests/app/controllers/campaign-entry-controller.test.ts` (extend `describe('showGameModeSelection', ...)`)

**Interfaces:**
- Consumes: `GameSession.setStateWithoutRefresh(next: GameState): void` (kept — this phase's fix does not need to become a `commit`, since the councilTalkLevel merge happens *before* the first refresh either caller needs; `deps.startGame()`/`enterCampaign(...)` are what actually publish the initial state a moment later, unchanged by this task).
- Produces: no signature change.

Current code, `onStartSolo` (`campaign-entry-controller.ts:222-239`):

```ts
          onStartSolo: (config) => {
            deps.session.setStateWithoutRefresh(createNewGame({
              civType: config.civType,
              mapSize: config.mapSize,
              opponentCount: config.opponentCount,
              gameTitle: config.gameTitle,
              // Merge: persisted A/V settings first, then per-game setup choices (e.g. beastsMode) win
              settingsOverrides: { ...deps.userSettingsStore.getOverrides(), ...config.settingsOverrides },
              customCivilizations: config.customCivilizations,
              seed: config.seed,
              mapScript: config.mapScript,
              startPlacementMode: config.startPlacementMode,
              opponentChallenge: config.opponentChallenge,
            }));
            if (currentSettings.councilTalkLevel) {
              deps.session.getState().settings.councilTalkLevel = currentSettings.councilTalkLevel;
            }
            deps.startGame();
          },
```

Current code, `onComplete` (hot-seat, `campaign-entry-controller.ts:254-263`):

```ts
          onComplete: (config, opponentChallenge) => {
            deps.session.setStateWithoutRefresh(createHotSeatGame(config, undefined, title, opponentChallenge ?? 'standard'));
            if (currentSettings.councilTalkLevel) {
              deps.session.getState().settings.councilTalkLevel = currentSettings.councilTalkLevel;
            }
            enterCampaign(
              deps.session.getState(),
              `Hot seat game started! ${config.players.filter(p => p.isHuman).length} players`,
              true,
            );
          },
```

- [ ] **Step 1: Write the failing test.** Add to `describe('showGameModeSelection', ...)` in `tests/app/controllers/campaign-entry-controller.test.ts`, after the existing solo/hot-seat tests around line 306:

```ts
    it('the solo path applies a persisted councilTalkLevel to the freshly constructed game', async () => {
      const state = makeFixture();
      const deps = baseDeps(state, {
        userSettingsStore: {
          getPersisted: () => undefined,
          refresh: vi.fn().mockResolvedValue({ customCivilizations: [], councilTalkLevel: 'verbose' }),
          getMasterVolume: () => 0.8,
          setCustomCivilizations: vi.fn(),
          getOverrides: () => ({}),
        },
      });
      const campaignEntry = createCampaignEntryController(deps);
      const callbacks = captureModeSelectCallbacks();
      let capturedSoloCallbacks: campaignSetupModule.CampaignSetupCallbacks | undefined;
      vi.mocked(campaignSetupModule.showCampaignSetup).mockImplementation((_layer, cb) => {
        capturedSoloCallbacks = cb;
        return document.createElement('div');
      });

      campaignEntry.showGameModeSelection();
      await callbacks.onChooseSolo('Talkative Council Game');
      expect(capturedSoloCallbacks).toBeDefined();

      const beforeState = deps.session.getState();
      const soloConfig: SoloSetupConfig = {
        civType: beforeState.civilizations['player'].civType,
        mapSize: 'small',
        opponentCount: 1,
        gameTitle: 'Talkative Council Game',
      };
      capturedSoloCallbacks!.onStartSolo(soloConfig);

      expect(deps.session.getState().settings.councilTalkLevel).toBe('verbose');
    });
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/campaign-entry-controller.test.ts -t "applies a persisted councilTalkLevel"`
Expected: This specific test actually **passes today** even with the bug, because the mutation does land on the object `deps.session.getState()` returns (same reference) before the assertion reads it back — the test as written can't distinguish the mutation bug from correct behavior. This is intentional: skip to Step 3, then use Step 4's assertion (not Step 2) as the real regression check. Note this in the PR body rather than silently having a step that doesn't fail — the spec's "currently observable staleness" table already flags this site as having no live user-facing symptom; this task is architecture-cleanliness, not a behavior fix, and the test proves the settings value ends up correct after the refactor, not that the refactor was necessary.

- [ ] **Step 3: Write minimal implementation.** `onStartSolo`:

```ts
          onStartSolo: (config) => {
            const newGame = createNewGame({
              civType: config.civType,
              mapSize: config.mapSize,
              opponentCount: config.opponentCount,
              gameTitle: config.gameTitle,
              // Merge: persisted A/V settings first, then per-game setup choices (e.g. beastsMode) win
              settingsOverrides: { ...deps.userSettingsStore.getOverrides(), ...config.settingsOverrides },
              customCivilizations: config.customCivilizations,
              seed: config.seed,
              mapScript: config.mapScript,
              startPlacementMode: config.startPlacementMode,
              opponentChallenge: config.opponentChallenge,
            });
            deps.session.setStateWithoutRefresh(
              currentSettings.councilTalkLevel
                ? { ...newGame, settings: { ...newGame.settings, councilTalkLevel: currentSettings.councilTalkLevel } }
                : newGame,
            );
            deps.startGame();
          },
```

`onComplete` (hot-seat):

```ts
          onComplete: (config, opponentChallenge) => {
            const newGame = createHotSeatGame(config, undefined, title, opponentChallenge ?? 'standard');
            deps.session.setStateWithoutRefresh(
              currentSettings.councilTalkLevel
                ? { ...newGame, settings: { ...newGame.settings, councilTalkLevel: currentSettings.councilTalkLevel } }
                : newGame,
            );
            enterCampaign(
              deps.session.getState(),
              `Hot seat game started! ${config.players.filter(p => p.isHuman).length} players`,
              true,
            );
          },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/campaign-entry-controller.test.ts -t "showGameModeSelection"`
Expected: PASS — the new test plus the two pre-existing solo/hot-seat tests (their `expect(deps.session.getState()).not.toBe(beforeState)` and `.gameTitle` assertions are unaffected, since `setStateWithoutRefresh` still runs and still replaces the reference).

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/campaign-entry-controller.ts tests/app/controllers/campaign-entry-controller.test.ts
git commit -m "fix(campaign-entry-controller): merge persisted councilTalkLevel into game construction instead of mutating the created state"
```

### Phase 2 close-out

- [ ] Run `bash scripts/run-with-mise.sh yarn build` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
- [ ] Open the PR. Title: `fix(787): GameSession state-mutation audit — Phase 2 (campaign-entry-controller.ts)`. Body notes both sites are architecture-cleanliness (no live user-facing bug — settings never visible before the first real `commit`/`enterCampaign` publish), citing the spec's severity table.

---

## Phase 3 — `turn-flow-controller.ts`

Both sites already have a manual `renderLoop.setGameState` + `updateHUD()` pair immediately after them via `refreshRequiredChoicesAfterAction()` — architecture-debt only, not a live bug. Fixed for the single-owner contract and to reach zero for Phase 6's regression guard.

### Task 3.1: `onChooseResearch` and `onChooseCityBuild` inside `showRequiredChoicesIfNeeded`

**Files:**
- Modify: `src/app/controllers/turn-flow-controller.ts:255-270`
- Test: `tests/app/controllers/turn-flow-controller.test.ts` (new tests in the relevant existing `describe` block covering `showRequiredChoicesIfNeeded`)

**Interfaces:**
- Consumes: `enqueueResearch(techState: TechState, techId: string): TechState` (unchanged); `enqueueCityProduction(city: City, itemId: string): City` (`src/systems/planning-system.ts:15`, unchanged).
- Produces: no signature change.

Current code (`turn-flow-controller.ts:255-270`):

```ts
      onChooseResearch: (techId) => {
        deps.currentCiv().techState = enqueueResearch(deps.currentCiv().techState, techId);
        deps.showNotification(`Researching ${techId}...`, 'info');
        refreshRequiredChoicesAfterAction();
      },
      onChooseCityBuild: (cityId, itemId) => {
        const city = session.getState().cities[cityId];
        if (!city) return;
        session.getState().cities[cityId] = enqueueCityProduction(city, itemId);
        deps.showNotification(`${city.name}: queued ${itemId}`, 'info');
        refreshRequiredChoicesAfterAction();
      },
```

Where `refreshRequiredChoicesAfterAction` (`turn-flow-controller.ts:188-192`, unchanged by this task) is:

```ts
  function refreshRequiredChoicesAfterAction(): void {
    deps.getElementById('required-choice-panel')?.remove();
    closePlanningPanels(document);
    renderLoop.setGameState(session.getState());
    deps.updateHUD();
```

- [ ] **Step 1: Find or write a test harness that reaches these callbacks.** Search first: `grep -n "onChooseResearch\|onChooseCityBuild\|showRequiredChoicesIfNeeded" tests/app/controllers/turn-flow-controller.test.ts`. If existing tests already capture `createRequiredChoicePanel`'s callbacks (this codebase's convention, per Phase 1/2/5's tests, is to mock the panel factory and capture the callbacks object passed to it), extend that pattern; otherwise add:

```ts
vi.mock('@/ui/required-choice-panel', () => ({ createRequiredChoicePanel: vi.fn() }));
```

at the top of the test file (only if not already present — check first), then:

```ts
  describe('showRequiredChoicesIfNeeded callbacks', () => {
    it('onChooseResearch publishes the queued tech through session subscribers', () => {
      const { state } = makeFixture('required-choice-research');
      // arrange an idle-research condition so showRequiredChoicesIfNeeded opens the panel
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);
      controller.showRequiredChoicesIfNeeded();
      const options = mockedCallArg<{ onChooseResearch: (techId: string) => void }>(createRequiredChoicePanel, 0, 1);

      const someTechId = Object.keys(deps.session.getState().civilizations.player.techState.researchQueue.length
        ? {}
        : {})[0]; // placeholder replaced below once the real available-tech id is known from the fixture

      options.onChooseResearch('pottery');

      expect(deps.session.getState().civilizations.player.techState.researchQueue).toContain('pottery');
      expect(listener).toHaveBeenCalled();
    });

    it('onChooseCityBuild publishes the queued production through session subscribers', () => {
      const { state } = makeFixture('required-choice-build');
      state.cities['idle-city'] = makeCity('idle-city');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);
      controller.showRequiredChoicesIfNeeded();
      const options = mockedCallArg<{ onChooseCityBuild: (cityId: string, itemId: string) => void }>(createRequiredChoicePanel, 0, 1);

      options.onChooseCityBuild('idle-city', 'warrior');

      expect(deps.session.getState().cities['idle-city'].productionQueue).toContain('warrior');
      expect(listener).toHaveBeenCalled();
    });
  });
```

Before running, replace the `someTechId` placeholder line — it is a **planning placeholder for this plan document only**, not something to leave in the implementation: when writing this test for real, read `tests/app/controllers/turn-flow-controller.test.ts`'s existing fixture setup for `showRequiredChoicesIfNeeded`/idle-research conditions (search for an existing test that already opens this panel for a research choice) and copy its exact arrangement so `onChooseResearch` is reachable with a real available tech id, then delete the placeholder line entirely — do not commit code containing it.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/turn-flow-controller.test.ts -t "showRequiredChoicesIfNeeded callbacks"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()` in both tests — current code never calls `commit`/`update`.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onChooseResearch: (techId) => {
        const civ = deps.currentCiv();
        session.commit({
          ...session.getState(),
          civilizations: {
            ...session.getState().civilizations,
            [session.getState().currentPlayer]: { ...civ, techState: enqueueResearch(civ.techState, techId) },
          },
        });
        deps.showNotification(`Researching ${techId}...`, 'info');
        refreshRequiredChoicesAfterAction();
      },
      onChooseCityBuild: (cityId, itemId) => {
        const city = session.getState().cities[cityId];
        if (!city) return;
        session.commit({
          ...session.getState(),
          cities: { ...session.getState().cities, [cityId]: enqueueCityProduction(city, itemId) },
        });
        deps.showNotification(`${city.name}: queued ${itemId}`, 'info');
        refreshRequiredChoicesAfterAction();
      },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/turn-flow-controller.test.ts -t "showRequiredChoicesIfNeeded callbacks"`
Expected: PASS.

- [ ] **Step 5: Run the full turn-flow-controller suite** (this file also has timing-sensitive round/handoff tests elsewhere that must not regress from this change).

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/turn-flow-controller.test.ts`
Expected: PASS, all tests.

- [ ] **Step 6: Commit.**

```bash
git add src/app/controllers/turn-flow-controller.ts tests/app/controllers/turn-flow-controller.test.ts
git commit -m "fix(turn-flow-controller): route required-choice research/build queueing through session.commit"
```

### Phase 3 close-out

- [ ] Run `bash scripts/run-with-mise.sh yarn build` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test:ai-playability` — expect exit 0 (required for this phase per the spec: it touches turn-advancement-adjacent code).
- [ ] Open the PR. Title: `fix(787): GameSession state-mutation audit — Phase 3 (turn-flow-controller.ts)`.

---

## Phase 4 — `selection-controller.ts`

15 sites across 3 handler groups inside the unit-info panel's callback object (all under one `session`-scoped closure — no `deps.session`, just `session`, per this file's own factory parameter naming). No turn-flow risk; heaviest single-domain phase.

### Task 4.1: `onSetDisguise`

**Files:**
- Modify: `src/app/controllers/selection-controller.ts:388-404`
- Test: `tests/app/controllers/selection-controller.test.ts` (new `describe('onSetDisguise', ...)` or extend existing espionage coverage — search first: `grep -n "onSetDisguise" tests/app/controllers/selection-controller.test.ts`)

**Interfaces:**
- Consumes: `setDisguise(civEsp: EspionageCivState, spyId: string, disguise: UnitType | null): EspionageCivState` (unchanged).
- Produces: no signature change.

Current code:

```ts
        onSetDisguise: (uid, disguise) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.hasActed) return;
          if (unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const spy = civEsp.spies[uid];
          if (!spy || spy.status !== 'idle') return;
          session.getState().espionage![session.getState().currentPlayer] = setDisguise(civEsp, uid, disguise);
          if (disguise !== null) {
            session.getState().units[uid] = { ...unit, hasActed: true, movementPointsLeft: 0 };
          }
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          selectUnit(uid);
          deps.showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
        },
```

Two flagged mutations here (espionage assignment, conditional unit assignment) — both belong to the same handler and must land in one `commit`.

- [ ] **Step 1: Write the failing test.**

```ts
  describe('onSetDisguise', () => {
    it('sets the disguise and marks the unit acted, publishing through session subscribers', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'spy-1', { position: { q: 0, r: 0 } });
      state.espionage = { player: createEspionageCivState() };
      state.espionage.player.spies['spy-1'] = {
        id: 'spy-1', owner: 'player', name: 'Agent', unitType: 'spy_scout',
        targetCivId: null, targetCityId: null, position: null,
        status: 'idle', experience: 0, currentMission: null,
        cooldownTurns: 0, promotion: undefined, promotionAvailable: false, feedsFalseIntel: false,
      };
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.selectUnit('spy-1');
      const options = mockedCallArg<{ onSetDisguise: (uid: string, disguise: UnitType | null) => void }>(renderSelectedUnitInfo, 0, 2);
      options.onSetDisguise('spy-1', 'warrior');

      const updated = deps.session.getState();
      expect(updated.espionage!.player.spies['spy-1'].disguisedAs).toBe('warrior');
      expect(updated.units['spy-1'].hasActed).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
  });
```

Before writing this for real: check `tests/app/controllers/selection-controller.test.ts`'s existing fixture helpers (`makeFixture`, `placePlayerUnit`, and how `renderSelectedUnitInfo`'s callbacks are captured — search `mockedCallArg.*renderSelectedUnitInfo` in that file) and match the established pattern and argument indices exactly rather than guessing them; the shape above is illustrative of the assertions needed, not a verbatim drop-in.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "onSetDisguise"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
        onSetDisguise: (uid, disguise) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.hasActed) return;
          if (unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const spy = civEsp.spies[uid];
          if (!spy || spy.status !== 'idle') return;
          const currentPlayer = session.getState().currentPlayer;
          session.commit({
            ...session.getState(),
            espionage: { ...session.getState().espionage, [currentPlayer]: setDisguise(civEsp, uid, disguise) },
            units: disguise !== null
              ? { ...session.getState().units, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } }
              : session.getState().units,
          });
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          selectUnit(uid);
          deps.showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
        },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "onSetDisguise"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/selection-controller.ts tests/app/controllers/selection-controller.test.ts
git commit -m "fix(selection-controller): route onSetDisguise's espionage/unit mutation through session.commit"
```

### Task 4.2: `onInfiltrate`

**Files:**
- Modify: `src/app/controllers/selection-controller.ts:405-484`
- Test: `tests/app/controllers/selection-controller.test.ts` (extend/add `describe('onInfiltrate', ...)`, covering all 4 branches: `removeUnitFromMap`, `era1ScoutResult`, `caught`, and the default failed-but-not-caught path)

**Interfaces:**
- Consumes: `attemptInfiltration(...)` (unchanged); `resolveMissionResult(...)` (unchanged).
- Produces: no signature change.

This is the largest single handler (8 flagged sites across 4 branches). Current code, full handler:

```ts
        onInfiltrate: (uid) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const targetCity = Object.values(session.getState().cities).find(
            c => c.owner !== session.getState().currentPlayer &&
                 c.position.q === unit.position.q && c.position.r === unit.position.r,
          );
          if (!targetCity) { deps.showNotification('No enemy city at this location.', 'info'); return; }

          const alreadyInside = Object.values(civEsp.spies).some(
            s => s.infiltrationCityId === targetCity.id &&
                 (s.status === 'stationed' || s.status === 'on_mission'),
          );
          if (alreadyInside) { deps.showNotification('You already have a spy in that city.', 'info'); return; }

          const cityCI = session.getState().espionage![targetCity.owner]?.counterIntelligence[targetCity.id] ?? 0;
          const chance = getInfiltrationSuccessChance(unit.type as UnitType, civEsp.spies[uid]?.experience ?? 0, cityCI);
          const preview = `Infiltrate ${targetCity.name}?\n\nSuccess chance: ${Math.round(chance * 100)}%\nCity CI: ${cityCI}\n\nIf caught, spy may be lost permanently.`;
          if (!window.confirm(preview)) return;

          const seed = `infiltrate-${uid}-${session.getState().turn}`;
          const result = attemptInfiltration(
            civEsp, uid, unit.type as UnitType, targetCity.id, targetCity.position, cityCI, seed,
          );
          const spyAfterAttempt = result.civEsp.spies[uid];
          const civEspWithTarget = spyAfterAttempt ? {
            ...result.civEsp,
            spies: { ...result.civEsp.spies, [uid]: { ...spyAfterAttempt, targetCivId: targetCity.owner } },
          } : result.civEsp;

          const currentPlayer = session.getState().currentPlayer;
          let nextUnits = session.getState().units;
          let nextCivilizations = session.getState().civilizations;

          if (result.removeUnitFromMap) {
            const { [uid]: _removed, ...remainingUnits } = nextUnits;
            nextUnits = remainingUnits;
            const civUnits = nextCivilizations[currentPlayer].units;
            nextCivilizations = civUnits
              ? { ...nextCivilizations, [currentPlayer]: { ...nextCivilizations[currentPlayer], units: civUnits.filter(id => id !== uid) } }
              : nextCivilizations;
            deps.showNotification(`Spy successfully infiltrated ${targetCity.name}. Open Intel panel to issue orders.`, 'success');
            bus.emit('espionage:spy-infiltrated', { civId: currentPlayer, spyId: uid, cityId: targetCity.id });
          } else if (result.era1ScoutResult !== undefined) {
            const missionResult = resolveMissionResult('scout_area', targetCity.owner, targetCity.id, session.getState(), currentPlayer, uid);
            const tilesToReveal = missionResult.tilesToReveal ?? [];
            if (tilesToReveal.length > 0) {
              const visibilityTiles = { ...(nextCivilizations[currentPlayer].visibility?.tiles ?? {}) };
              for (const coord of tilesToReveal) {
                visibilityTiles[`${coord.q},${coord.r}`] = 'visible';
              }
              nextCivilizations = {
                ...nextCivilizations,
                [currentPlayer]: { ...nextCivilizations[currentPlayer], visibility: { ...nextCivilizations[currentPlayer].visibility!, tiles: visibilityTiles } },
              };
            }
            nextUnits = { ...nextUnits, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } };
            deps.showNotification(`Scout revealed ${tilesToReveal.length} tile${tilesToReveal.length !== 1 ? 's' : ''} around ${targetCity.name}.`, 'success');
          } else if (result.caught) {
            const { [uid]: _removed, ...remainingUnits } = nextUnits;
            nextUnits = remainingUnits;
            const civUnits = nextCivilizations[currentPlayer].units;
            nextCivilizations = civUnits
              ? { ...nextCivilizations, [currentPlayer]: { ...nextCivilizations[currentPlayer], units: civUnits.filter(id => id !== uid) } }
              : nextCivilizations;
            bus.emit('espionage:spy-caught-infiltrating', { capturingCivId: targetCity.owner, spyOwner: currentPlayer, spyId: uid, cityId: targetCity.id });
          } else {
            const cooldown = result.civEsp.spies[uid]?.cooldownTurns ?? 3;
            deps.showNotification(`Spy failed to infiltrate ${targetCity.name}. Lying low for ${cooldown} turns.`, 'info');
            nextUnits = { ...nextUnits, [uid]: { ...unit, hasActed: true, movementPointsLeft: 0 } };
          }

          session.commit({
            ...session.getState(),
            espionage: { ...session.getState().espionage, [currentPlayer]: civEspWithTarget },
            units: nextUnits,
            civilizations: nextCivilizations,
          });

          if (result.removeUnitFromMap || result.caught) {
            deselectUnit();
          } else {
            selectUnit(uid);
          }

          renderLoop.setGameState(session.getState());
          deps.updateHUD();
        },
```

Behavior-preserving note: the original code emitted `bus.emit(...)` for the `removeUnitFromMap` and `caught` branches *before* the final state mutation happened (since the mutations were interleaved with the emits in-place); the rewrite above keeps emit ordering identical relative to the other statements in each branch — only the *mechanism* of building `nextUnits`/`nextCivilizations` changed from in-place mutation to accumulated spread-copies, committed once at the end instead of write-as-you-go.

- [ ] **Step 1: Write failing tests covering all 4 branches.** Search `tests/app/controllers/selection-controller.test.ts` first for any existing `onInfiltrate` coverage to extend rather than duplicate. At minimum, add one test per branch asserting (a) the branch's distinguishing state change, and (b) a subscribed listener fires:

```ts
  describe('onInfiltrate', () => {
    it('era-2+ unit types remove the unit from the map and station the spy (removeUnitFromMap branch)', () => {
      // Arrange a unit type/experience/CI combination that resolves to removeUnitFromMap,
      // matching whatever helper (if any) existing infiltration tests in this file already
      // use to force that branch deterministically -- check attemptInfiltration's existing
      // test coverage in tests/systems/ for the exact inputs that select this branch.
      // ... arrange ...
      const listener = vi.fn();
      deps.session.subscribe(listener);

      options.onInfiltrate('spy-1');

      expect(deps.session.getState().units['spy-1']).toBeUndefined();
      expect(deps.session.getState().civilizations.player.units).not.toContain('spy-1');
      expect(listener).toHaveBeenCalled();
    });

    it('era-1 scout infiltration reveals tiles and marks the unit acted without removing it (era1ScoutResult branch)', () => {
      // ... arrange for era1ScoutResult ...
      const listener = vi.fn();
      deps.session.subscribe(listener);

      options.onInfiltrate('scout-1');

      expect(deps.session.getState().units['scout-1'].hasActed).toBe(true);
      expect(listener).toHaveBeenCalled();
    });

    it('a caught spy is removed from the map (caught branch)', () => {
      // ... arrange for result.caught ...
      const listener = vi.fn();
      deps.session.subscribe(listener);

      options.onInfiltrate('spy-2');

      expect(deps.session.getState().units['spy-2']).toBeUndefined();
      expect(listener).toHaveBeenCalled();
    });

    it('a failed-but-not-caught attempt marks the unit acted and keeps it on the map (default branch)', () => {
      // ... arrange for the default (not caught, not era1, not removeUnitFromMap) outcome ...
      const listener = vi.fn();
      deps.session.subscribe(listener);

      options.onInfiltrate('spy-3');

      expect(deps.session.getState().units['spy-3'].hasActed).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
  });
```

The `// arrange` comments above are explicitly **not** placeholders to leave in committed code — they mark research the implementer must do against `attemptInfiltration`'s real signature and existing test fixtures in `tests/systems/espionage-system.test.ts` (or wherever it's tested) to pick concrete inputs that deterministically select each branch, before this task's Step 1 is actually complete. Do not check in a test with an unresolved arrange step.

- [ ] **Step 2: Run tests to verify they fail.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "onInfiltrate"`
Expected: FAIL on each branch's `listener` assertion.

- [ ] **Step 3: Write minimal implementation** — the full rewritten handler shown above.

- [ ] **Step 4: Run tests to verify they pass.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "onInfiltrate"`
Expected: PASS, all 4 branch tests.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/selection-controller.ts tests/app/controllers/selection-controller.test.ts
git commit -m "fix(selection-controller): route onInfiltrate's 4 outcome branches through one session.commit"
```

### Task 4.3: `onEmbed`

**Files:**
- Modify: `src/app/controllers/selection-controller.ts:485-503`
- Test: `tests/app/controllers/selection-controller.test.ts` (new `describe('onEmbed', ...)`)

Current code:

```ts
        onEmbed: (uid) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const city = Object.values(session.getState().cities).find(
            c => c.owner === session.getState().currentPlayer &&
                 c.position.q === unit.position.q && c.position.r === unit.position.r,
          );
          if (!city) return;
          session.getState().espionage![session.getState().currentPlayer] = embedSpy(civEsp, uid, city.id, city.position);
          delete session.getState().units[uid];
          session.getState().civilizations[session.getState().currentPlayer].units =
            session.getState().civilizations[session.getState().currentPlayer].units.filter(id => id !== uid);
          deselectUnit();
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          deps.showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
        },
```

- [ ] **Step 1: Write the failing test.**

```ts
  describe('onEmbed', () => {
    it('embeds the spy, removes the unit from the map, and publishes through session subscribers', () => {
      const state = makeFixture();
      state.cities['friendly-city'] = makeCity('friendly-city', { owner: 'player', position: { q: 0, r: 0 } });
      state.civilizations.player.cities = ['friendly-city'];
      placePlayerUnit(state, 'spy-1', { position: { q: 0, r: 0 } });
      state.espionage = { player: createEspionageCivState() };
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.selectUnit('spy-1');
      const options = mockedCallArg<{ onEmbed: (uid: string) => void }>(renderSelectedUnitInfo, 0, 2);
      options.onEmbed('spy-1');

      const updated = deps.session.getState();
      expect(updated.units['spy-1']).toBeUndefined();
      expect(updated.civilizations.player.units).not.toContain('spy-1');
      expect(updated.espionage!.player.spies['spy-1'].status).toBe('embedded');
      expect(listener).toHaveBeenCalled();
    });
  });
```

Match this test's exact fixture helpers and `mockedCallArg` argument indices to whatever `tests/app/controllers/selection-controller.test.ts` already establishes for Task 4.1/4.2's tests — write them consistently, not independently guessed per task.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "onEmbed"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
        onEmbed: (uid) => {
          const unit = session.getState().units[uid];
          if (!unit || unit.owner !== session.getState().currentPlayer) return;
          const civEsp = session.getState().espionage?.[session.getState().currentPlayer];
          if (!civEsp) return;
          const city = Object.values(session.getState().cities).find(
            c => c.owner === session.getState().currentPlayer &&
                 c.position.q === unit.position.q && c.position.r === unit.position.r,
          );
          if (!city) return;
          const currentPlayer = session.getState().currentPlayer;
          const { [uid]: _removed, ...remainingUnits } = session.getState().units;
          session.commit({
            ...session.getState(),
            espionage: { ...session.getState().espionage, [currentPlayer]: embedSpy(civEsp, uid, city.id, city.position) },
            units: remainingUnits,
            civilizations: {
              ...session.getState().civilizations,
              [currentPlayer]: {
                ...session.getState().civilizations[currentPlayer],
                units: session.getState().civilizations[currentPlayer].units.filter(id => id !== uid),
              },
            },
          });
          deselectUnit();
          renderLoop.setGameState(session.getState());
          deps.updateHUD();
          deps.showNotification(`Spy embedded in ${city.name}. Counter-intelligence boosted.`, 'info');
        },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "onEmbed"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/selection-controller.ts tests/app/controllers/selection-controller.test.ts
git commit -m "fix(selection-controller): route onEmbed's espionage/unit/civ mutation through session.commit"
```

### Task 4.4: `startAutoExplore` and `cancelAutoExplore`

**Files:**
- Modify: `src/app/controllers/selection-controller.ts:653-684`
- Test: `tests/app/controllers/selection-controller.test.ts` (new `describe('startAutoExplore / cancelAutoExplore', ...)`)

Current code:

```ts
  function startAutoExplore(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;

    session.getState().units[unitId] = {
      ...unit,
      automation: {
        mode: 'auto-explore',
        startedTurn: session.getState().turn,
        lastTargets: unit.automation?.mode === 'auto-explore' ? unit.automation.lastTargets : [],
      },
    };

    if (session.getState().units[unitId].movementPointsLeft > 0 && !session.getState().units[unitId].hasActed) {
      applyAutoExploreOrder(session.getState(), unitId, { bus });
    }

    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    selectUnit(unitId);
  }

  function cancelAutoExplore(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit?.automation) return;
    delete session.getState().units[unitId].automation;
    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    if (selection.getSelectedUnitId() === unitId) {
      selectUnit(unitId);
    }
  }
```

Note `applyAutoExploreOrder(session.getState(), unitId, { bus })` — check this function's actual signature and return type before converting (`grep -n "export function applyAutoExploreOrder" src/`): if it mutates `session` internally itself (unlikely, but verify) rather than returning a value, this task's implementation needs adjusting; if — as expected from this file's other patterns — it operates on the passed `state` value and its result needs to be applied, the fix must thread that result into the same `commit` as the `automation` assignment, not call it against a stale pre-automation state. Do not assume; read the function first.

- [ ] **Step 1: Write the failing test.**

```ts
  describe('startAutoExplore / cancelAutoExplore', () => {
    it('starts auto-explore automation and publishes through session subscribers', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'scout-1', { position: { q: 0, r: 0 } });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.startAutoExplore('scout-1');

      expect(deps.session.getState().units['scout-1'].automation?.mode).toBe('auto-explore');
      expect(listener).toHaveBeenCalled();
    });

    it('cancels auto-explore automation and publishes through session subscribers', () => {
      const state = makeFixture();
      placePlayerUnit(state, 'scout-1', { position: { q: 0, r: 0 }, automation: { mode: 'auto-explore', startedTurn: 1, lastTargets: [] } });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.cancelAutoExplore('scout-1');

      expect(deps.session.getState().units['scout-1'].automation).toBeUndefined();
      expect(listener).toHaveBeenCalled();
    });
  });
```

Check whether `startAutoExplore`/`cancelAutoExplore` are exposed on `SelectionController`'s public interface (like `ensurePlayerWarState` was in Task 1.1) before assuming `controller.startAutoExplore(...)` is callable directly — if they're private, find the actual public entry point (likely `openUnitContextMenu`'s `onStartAutoExplore`/`onCancelAutoExplore` callbacks) and drive the test through that instead.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "startAutoExplore / cancelAutoExplore"`
Expected: FAIL on both `listener` assertions.

- [ ] **Step 3: Write minimal implementation** (assuming `applyAutoExploreOrder` returns a value rather than mutating — confirm per the note above and adjust if wrong):

```ts
  function startAutoExplore(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit || unit.owner !== session.getState().currentPlayer) return;

    const withAutomation = {
      ...unit,
      automation: {
        mode: 'auto-explore' as const,
        startedTurn: session.getState().turn,
        lastTargets: unit.automation?.mode === 'auto-explore' ? unit.automation.lastTargets : [],
      },
    };
    session.commit({ ...session.getState(), units: { ...session.getState().units, [unitId]: withAutomation } });

    if (withAutomation.movementPointsLeft > 0 && !withAutomation.hasActed) {
      applyAutoExploreOrder(session.getState(), unitId, { bus });
    }

    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    selectUnit(unitId);
  }

  function cancelAutoExplore(unitId: string): void {
    const unit = session.getState().units[unitId];
    if (!unit?.automation) return;
    const { automation: _removed, ...withoutAutomation } = unit;
    session.commit({ ...session.getState(), units: { ...session.getState().units, [unitId]: withoutAutomation } });
    renderLoop.setGameState(session.getState());
    deps.updateHUD();
    if (selection.getSelectedUnitId() === unitId) {
      selectUnit(unitId);
    }
  }
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/selection-controller.test.ts -t "startAutoExplore / cancelAutoExplore"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/selection-controller.ts tests/app/controllers/selection-controller.test.ts
git commit -m "fix(selection-controller): route startAutoExplore/cancelAutoExplore's unit mutation through session.commit"
```

### Phase 4 close-out

- [ ] Run `bash scripts/run-with-mise.sh yarn build` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
- [ ] Re-run the inventory grep against `selection-controller.ts` — confirm 0 remaining matches (15 sites, 4 tasks: 2 + 8 + 3 + 2 = 15).
- [ ] Open the PR. Title: `fix(787): GameSession state-mutation audit — Phase 4 (selection-controller.ts)`.

---

## Phase 5 — `panel-actions-controller.ts` + `src/ui/city-panel.ts`

Heaviest phase: 21 sites plus the `city-panel.ts` callback-contract change the spec's review identified as required in the same commit as the 4 city-production sites (Tasks 5.2-5.3), plus rewriting the one existing test coupled to that bug (Task 5.4).

### Task 5.1: `onSetCouncilTalkLevel` (council panel settings)

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:485-492`
- Test: `tests/app/controllers/panel-actions-controller.test.ts` (new test in the council-panel describe block; search `grep -n "createCouncilPanel" tests/app/controllers/panel-actions-controller.test.ts` first)

Current code (`panel-actions-controller.ts:485-492`, read exact lines first — this is the `createCouncilPanel` callback wiring):

```ts
    createCouncilPanel(deps.uiLayer, deps.session.getState(), {
      // ...
      onSetTalkLevel: (level) => {
        deps.session.getState().settings.councilTalkLevel = level;
        void saveSettings(deps.session.getState().settings);
        // ...
      },
      // ...
    });
```

(Confirm the exact surrounding callback name and structure by reading `panel-actions-controller.ts` around line 485 before editing — the spec's grep only captured the flagged line itself, not the enclosing callback's name.)

- [ ] **Step 1: Write the failing test.**

```ts
    it('onSetTalkLevel publishes the new council talk level through session subscribers', () => {
      const { state } = makeFixture('council-talk-level');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openCouncilPanel();
      const options = mockedCallArg<{ onSetTalkLevel: (level: string) => void }>(createCouncilPanel, 0, 2);
      options.onSetTalkLevel('verbose');

      expect(deps.session.getState().settings.councilTalkLevel).toBe('verbose');
      expect(listener).toHaveBeenCalled();
    });
```

Match the real method name for opening the council panel (`openCouncilPanel` is illustrative — confirm the controller's actual public method name first) and `createCouncilPanel`'s real callback property name and argument index against the source read in this task's preamble.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onSetTalkLevel"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onSetTalkLevel: (level) => {
        deps.session.commit({ ...deps.session.getState(), settings: { ...deps.session.getState().settings, councilTalkLevel: level } });
        void saveSettings(deps.session.getState().settings);
        // ... (rest of the callback body unchanged)
      },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onSetTalkLevel"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller): route council-panel talk-level setting through session.commit"
```

### Task 5.2: `city-panel.ts` — widen the 4 queue callback types and wire `rerenderPanel(nextState)`

**Files:**
- Modify: `src/ui/city-panel.ts:71-102` (interface), `:1451-1457` (`onBuild` call site), `:1498-1525` (`onRemoveQueueItem`/`onMoveQueueItem` call sites), `:1568-1575` (`onSetIdleProduction` call site)
- Test: none new in this task — this is a type/wiring change with no independent behavior until Task 5.3's controller side lands; `yarn build` (TypeScript) is this task's verification, plus the existing `tests/ui/city-panel*.test.ts` suite must keep passing since the 4 callbacks stay optional-chained and backward compatible for any caller still returning `void`.

**Interfaces:**
- Produces: `CityPanelCallbacks.onBuild`, `.onMoveQueueItem`, `.onRemoveQueueItem`, `.onSetIdleProduction` all become `(...) => GameState | void` — the exact shape `.onSetCityFocus`/`.onToggleWorkedTile`/`.onRushBuyActiveProduction` already use. Task 5.3 (`panel-actions-controller.ts`) is the consumer of this new return contract.

This task must land in the **same commit** as Task 5.3 — do not merge Task 5.2 alone (a mid-state where `city-panel.ts` expects a return value but `panel-actions-controller.ts` still returns `void` typechecks fine, since `GameState | void` accepts `void`, but leaves the actual bug unfixed and gives false confidence that "the city-panel.ts change landed"). Do them as one combined Step 3/commit below rather than two separate task commits, to avoid a landable-but-incomplete intermediate state.

Current interface (`city-panel.ts:71-102`):

```ts
export interface CityPanelCallbacks {
  onBuild: (cityId: string, itemId: string) => void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => void;
  onRemoveQueueItem?: (cityId: string, index: number) => void;
  onOpenWonderPanel: (cityId: string) => void;
  onSetCityFocus?: (cityId: string, focus: Exclude<CityFocus, 'custom'>) => GameState | void;
  onToggleWorkedTile?: (cityId: string, coord: HexCoord, worked: boolean) => GameState | void;
  onPlaceBuilding?: (cityId: string, buildingId: string, row: number, col: number) => void;
  onClose: () => void;
  onTip?: (message: string) => void;
  onPrevCity?: () => void;
  onNextCity?: () => void;
  onUpgradeUnit?: (unitId: string) => void;
  onSelectUnit?: (unitId: string) => void;
  onEstablishRoute?: (caravanId: string) => void;
  onSetIdleProduction?: (cityId: string, mode: 'gold' | 'science' | null) => void;
  onRushBuyActiveProduction?: (cityId: string) => GameState | void;
  onAppeaseFaction?: (cityId: string) => GameState | void;
  onConcedeToMovement?: (cityId: string) => GameState | void;
  onQuarantineCrisis?: (crisisId: string, cityId: string) => GameState | void;
  onRemedyCrisis?: (crisisId: string, cityId: string) => GameState | void;
  onFindResources?: (
    highlights: HexCoord[],
    toasts: Array<{ message: string; type: 'info' | 'warning' }>,
  ) => void;
  onChooseCircularManufacturingMaterial?: (material: ResourceType) => void;
}
```

Current call sites:

```ts
  panel.querySelectorAll('.build-item').forEach(el => {
    el.addEventListener('click', () => {
      const itemId = (el as HTMLElement).dataset.itemId!;
      callbacks.onBuild(city.id, itemId);
      rerenderPanel();
    });
  });
```

```ts
  panel.querySelectorAll('[data-queue-action]').forEach(el => {
    el.addEventListener('click', event => {
      event.stopPropagation();
      const action = (el as HTMLElement).dataset.queueAction;
      const index = Number((el as HTMLElement).dataset.queueIndex);

      if (!Number.isInteger(index)) {
        return;
      }

      if (action === 'remove') {
        callbacks.onRemoveQueueItem?.(city.id, index);
        rerenderPanel();
        return;
      }

      if (action === 'up' && index > 0) {
        callbacks.onMoveQueueItem?.(city.id, index, index - 1);
        rerenderPanel();
        return;
      }

      if (action === 'down' && index < city.productionQueue.length - 1) {
        callbacks.onMoveQueueItem?.(city.id, index, index + 1);
        rerenderPanel();
      }
    });
  });
```

```ts
  panel.querySelectorAll<HTMLElement>('[data-idle-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.idleMode;
      const mode = raw === 'gold' || raw === 'science' ? raw : null;
      callbacks.onSetIdleProduction?.(city.id, mode);
      rerenderPanel();
    });
  });
```

- [ ] **Step 1: Update the interface.** In `CityPanelCallbacks`:

```ts
  onBuild: (cityId: string, itemId: string) => GameState | void;
  onMoveQueueItem?: (cityId: string, fromIndex: number, toIndex: number) => GameState | void;
  onRemoveQueueItem?: (cityId: string, index: number) => GameState | void;
  // ... (onOpenWonderPanel through onEstablishRoute unchanged)
  onSetIdleProduction?: (cityId: string, mode: 'gold' | 'science' | null) => GameState | void;
```

- [ ] **Step 2: Update the 3 call sites to pass the return value to `rerenderPanel`.**

```ts
  panel.querySelectorAll('.build-item').forEach(el => {
    el.addEventListener('click', () => {
      const itemId = (el as HTMLElement).dataset.itemId!;
      const nextState = callbacks.onBuild(city.id, itemId);
      rerenderPanel(nextState);
    });
  });
```

```ts
      if (action === 'remove') {
        const nextState = callbacks.onRemoveQueueItem?.(city.id, index);
        rerenderPanel(nextState);
        return;
      }

      if (action === 'up' && index > 0) {
        const nextState = callbacks.onMoveQueueItem?.(city.id, index, index - 1);
        rerenderPanel(nextState);
        return;
      }

      if (action === 'down' && index < city.productionQueue.length - 1) {
        const nextState = callbacks.onMoveQueueItem?.(city.id, index, index + 1);
        rerenderPanel(nextState);
      }
```

```ts
  panel.querySelectorAll<HTMLElement>('[data-idle-mode]').forEach(btn => {
    btn.addEventListener('click', () => {
      const raw = btn.dataset.idleMode;
      const mode = raw === 'gold' || raw === 'science' ? raw : null;
      const nextState = callbacks.onSetIdleProduction?.(city.id, mode);
      rerenderPanel(nextState);
    });
  });
```

- [ ] **Step 3: Do not commit this task alone.** Continue directly to Task 5.3 — the two land in one commit together (Task 5.3's Step 5 covers both).

### Task 5.3: `panel-actions-controller.ts`'s 4 city-production handlers

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:660-689` (`onBuild`, `onMoveQueueItem`, `onRemoveQueueItem`), `:738-743` (`onSetIdleProduction`)
- Test: `tests/app/controllers/panel-actions-controller.test.ts:680-692` — **rewrite**, not extend, per Global Constraints (Task 5.4 covers this explicitly and in full; write it as part of this task's Step 1, since the old assertion would otherwise mask the very bug this task fixes)

**Interfaces:**
- Consumes: Task 5.2's widened `CityPanelCallbacks` (`onBuild`, `onMoveQueueItem`, `onRemoveQueueItem`, `onSetIdleProduction` all now `(...) => GameState | void`).
- Produces: no change to `PanelActionsController`'s own public surface.

Current code:

```ts
      onBuild: (cityId, itemId) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (targetCity) {
          try {
            deps.session.getState().cities[cityId] = enqueueCityProduction(targetCity, itemId);
            deps.renderLoop.setGameState(deps.session.getState());
            deps.showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Queue limit reached';
            deps.showNotification(`${targetCity.name}: ${message}`, 'warning');
          }
        }
      },
      onMoveQueueItem: (cityId, fromIndex, toIndex) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.getState().cities[cityId] = reorderCityProduction(targetCity, fromIndex, toIndex);
        deps.renderLoop.setGameState(deps.session.getState());
      },
      onRemoveQueueItem: (cityId, index) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.getState().cities[cityId] = {
          ...targetCity,
          productionQueue: removeQueuedId(targetCity.productionQueue, index),
          productionProgress: index === 0 ? 0 : targetCity.productionProgress,
        };
        deps.renderLoop.setGameState(deps.session.getState());
      },
```

```ts
      onSetIdleProduction: (cityId, mode) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.getState().cities[cityId] = setIdleProduction(targetCity, mode);
        deps.renderLoop.setGameState(deps.session.getState());
      },
```

- [ ] **Step 1: Write the failing test** (this replaces the coupled test — full content in Task 5.4; write it now as this task's Step 1 since it's the same edit):

```ts
    it('queues real production via session.commit, publishes to subscribers, and returns the fresh state for the panel to re-render', () => {
      const { state } = makeFixture('city-panel-build');
      state.cities['test-city'] = makeCity('test-city');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openCityPanelForCity(state.cities['test-city']);
      const options = mockedCallArg<{ onBuild: (cityId: string, itemId: string) => GameState | void }>(createCityPanel, 0, 3);
      const returned = options.onBuild('test-city', 'warrior');

      expect(deps.session.getState().cities['test-city'].productionQueue).toContain('warrior');
      expect(returned).toBe(deps.session.getState());
      expect(deps.renderLoop.setGameState).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
      expect(deps.showNotification).toHaveBeenCalledWith(expect.stringContaining('Warrior'), 'info');
    });
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "queues real production via session.commit"`
Expected: FAIL — `returned` is `undefined` (current `onBuild` returns `void`), and `listener` was never called.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onBuild: (cityId, itemId) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (targetCity) {
          try {
            deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: enqueueCityProduction(targetCity, itemId) } });
            deps.renderLoop.setGameState(deps.session.getState());
            deps.showNotification(`${targetCity.name}: queued ${getProductionDisplayName(itemId)}`, 'info');
            return deps.session.getState();
          } catch (error) {
            const message = error instanceof Error ? error.message : 'Queue limit reached';
            deps.showNotification(`${targetCity.name}: ${message}`, 'warning');
          }
        }
      },
      onMoveQueueItem: (cityId, fromIndex, toIndex) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: reorderCityProduction(targetCity, fromIndex, toIndex) } });
        deps.renderLoop.setGameState(deps.session.getState());
        return deps.session.getState();
      },
      onRemoveQueueItem: (cityId, index) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({
          ...deps.session.getState(),
          cities: {
            ...deps.session.getState().cities,
            [cityId]: {
              ...targetCity,
              productionQueue: removeQueuedId(targetCity.productionQueue, index),
              productionProgress: index === 0 ? 0 : targetCity.productionProgress,
            },
          },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        return deps.session.getState();
      },
```

```ts
      onSetIdleProduction: (cityId, mode) => {
        const targetCity = deps.session.getState().cities[cityId];
        if (!targetCity) return;
        deps.session.commit({ ...deps.session.getState(), cities: { ...deps.session.getState().cities, [cityId]: setIdleProduction(targetCity, mode) } });
        deps.renderLoop.setGameState(deps.session.getState());
        return deps.session.getState();
      },
```

Note the `onBuild` catch-block path (queue-limit-reached error) deliberately still returns `undefined` — no state changed, so `rerenderPanel(undefined)` correctly falls back to `nextState ?? state`. That fallback is now stale-by-design only in the sense that nothing changed to make it stale; this is the one case where the closure-default behavior was never wrong.

- [ ] **Step 4: Apply Task 5.2's `city-panel.ts` changes now** (Steps 1-2 from that task), since both files must land together.

- [ ] **Step 5: Run tests to verify they pass.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "city-panel"`
Expected: PASS.

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/ui/city-panel.test.ts` (and any other `tests/ui/city-panel-*.test.ts` files — list them with `find tests/ui -iname "city-panel*"` first)
Expected: PASS — the widened callback types are backward compatible (`GameState | void` accepts a `void`-returning mock), so pre-existing city-panel UI tests that pass plain `() => {}` callbacks should be unaffected.

- [ ] **Step 6: Commit both files together.**

```bash
git add src/app/controllers/panel-actions-controller.ts src/ui/city-panel.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller,city-panel): route city-production queue actions through session.commit and widen callbacks to return fresh state

onBuild/onMoveQueueItem/onRemoveQueueItem/onSetIdleProduction previously
mutated session.getState()'s object in place and returned void; the open
city panel's rerenderPanel() call after each action only showed correct
data because it defaulted to the same mutated object by shared reference.
Converting the mutation to a genuine commit() without this companion
change would have regressed the panel to stale -- both land together."
```

### Task 5.4: confirm the rewritten test fully replaces the coupled one

**Files:**
- Modify: `tests/app/controllers/panel-actions-controller.test.ts`

This task is verification, not new code — Task 5.3's Step 1 already wrote the replacement test. Use this task to confirm the old assertion pattern is gone, not still present alongside the new one.

- [ ] **Step 1:** `grep -n "queues real production" tests/app/controllers/panel-actions-controller.test.ts` — expect exactly one match (the rewritten test from Task 5.3), not two.
- [ ] **Step 2:** Confirm no other test in this file still asserts `state.cities[...]` (the outer fixture variable) instead of `deps.session.getState().cities[...]` for any of the 4 converted handlers: `grep -n "^\s*expect(state\.cities" tests/app/controllers/panel-actions-controller.test.ts`. Fix any remaining ones the same way.
- [ ] **Step 3: Commit if Step 2 found anything to fix; otherwise this task is a no-op check, fold its confirmation into Task 5.3's PR description.**

### Task 5.5: tech-queue handlers (`onQueueResearch`, `onMoveQueuedResearch`, `onRemoveQueuedResearch`)

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:498-525`
- Test: `tests/app/controllers/panel-actions-controller.test.ts` (new tests; search `grep -n "createTechPanel" tests/app/controllers/panel-actions-controller.test.ts` for existing coverage to extend first)

Current code:

```ts
    createTechPanel(deps.uiLayer, deps.session.getState(), {
      onQueueResearch: (techId) => {
        try {
          deps.currentCiv().techState = enqueueResearch(deps.currentCiv().techState, techId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          deps.showNotification(message, 'warning');
          return;
        }
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.showNotification(`Queued research: ${techId}`, 'info');
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        deps.currentCiv().techState = {
          ...deps.currentCiv().techState,
          researchQueue: moveQueuedId(deps.currentCiv().techState.researchQueue, fromIndex, toIndex),
        };
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
      },
      onRemoveQueuedResearch: (index) => {
        deps.currentCiv().techState = {
          ...deps.currentCiv().techState,
          researchQueue: removeQueuedId(deps.currentCiv().techState.researchQueue, index),
        };
        deps.renderLoop.setGameState(deps.session.getState());
        // (read the remainder of this callback before editing -- confirm whether it ends here or has more lines)
      },
    });
```

This site already calls `deps.hud.update()` manually in at least the first two handlers (confirm the third does too by reading the actual file before editing) — architecture-debt only, matching the spec's severity note for this group.

- [ ] **Step 1: Write the failing test.**

```ts
    it('onQueueResearch publishes the queued tech through session subscribers', () => {
      const { state } = makeFixture('tech-panel-queue');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openTechPanel();
      const options = mockedCallArg<{ onQueueResearch: (techId: string) => void }>(createTechPanel, 0, 2);
      options.onQueueResearch('pottery');

      expect(deps.session.getState().civilizations.player.techState.researchQueue).toContain('pottery');
      expect(listener).toHaveBeenCalled();
    });
```

Confirm `controller.openTechPanel` is the real public method name and `createTechPanel`'s callback argument index by reading the file — this codebase's convention (seen in Tasks 1.1-5.3) is consistent, but verify rather than assume for this specific panel.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onQueueResearch"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onQueueResearch: (techId) => {
        const civ = deps.currentCiv();
        let nextTechState;
        try {
          nextTechState = enqueueResearch(civ.techState, techId);
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Queue limit reached';
          deps.showNotification(message, 'warning');
          return;
        }
        deps.session.commit({
          ...deps.session.getState(),
          civilizations: { ...deps.session.getState().civilizations, [deps.session.getState().currentPlayer]: { ...civ, techState: nextTechState } },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.showNotification(`Queued research: ${techId}`, 'info');
      },
      onMoveQueuedResearch: (fromIndex, toIndex) => {
        const civ = deps.currentCiv();
        deps.session.commit({
          ...deps.session.getState(),
          civilizations: {
            ...deps.session.getState().civilizations,
            [deps.session.getState().currentPlayer]: {
              ...civ,
              techState: { ...civ.techState, researchQueue: moveQueuedId(civ.techState.researchQueue, fromIndex, toIndex) },
            },
          },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
      },
      onRemoveQueuedResearch: (index) => {
        const civ = deps.currentCiv();
        deps.session.commit({
          ...deps.session.getState(),
          civilizations: {
            ...deps.session.getState().civilizations,
            [deps.session.getState().currentPlayer]: {
              ...civ,
              techState: { ...civ.techState, researchQueue: removeQueuedId(civ.techState.researchQueue, index) },
            },
          },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        // preserve whatever this callback's original remaining lines were, reading the real file first
      },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onQueueResearch"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller): route tech-panel queue handlers through session.commit"
```

### Task 5.6: espionage `onAssignDefensive`

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:867-886`
- Test: `tests/app/controllers/panel-actions-controller.test.ts` (new `describe` for espionage-panel handlers if none exists; search `grep -n "createEspionagePanel" tests/app/controllers/panel-actions-controller.test.ts` first)

Current code:

```ts
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = embedSpy(
          deps.session.getState().espionage![deps.session.getState().currentPlayer],
          spyId,
          target.cityId,
          target.position,
        );
        const unit = deps.session.getState().units[spyId];
        if (unit) {
          delete deps.session.getState().units[spyId];
          deps.session.getState().civilizations[deps.session.getState().currentPlayer].units =
            deps.session.getState().civilizations[deps.session.getState().currentPlayer].units.filter(id => id !== spyId);
        }
        deps.renderLoop.setGameState(deps.session.getState());
        deps.router.open('espionage');
        const cityName = deps.session.getState().cities[target.cityId]?.name ?? target.cityId;
        deps.showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
      },
```

This handler closes+reopens the espionage panel via `deps.router.open('espionage')` after committing (no closure-staleness risk like `city-panel.ts`), but still skips `hud.update()` — a live bug per the spec's severity table.

- [ ] **Step 1: Write the failing test.**

```ts
    it('onAssignDefensive embeds the spy, removes the unit, and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-assign-defensive');
      state.cities['home-city'] = makeCity('home-city', { owner: 'player' });
      state.civilizations.player.cities = ['home-city'];
      placeUnit(state, 'spy_scout', 'spy-1', { q: 0, r: 0 });
      placeSpy(state, 'spy-1');
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onAssignDefensive: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      // chooseFriendlyCityTarget() likely drives a window.prompt/confirm or an internal picker --
      // check the real implementation before writing this test and stub whatever it needs
      // (e.g. vi.spyOn(window, 'prompt')) to deterministically pick 'home-city'.
      options.onAssignDefensive('spy-1');

      const updated = deps.session.getState();
      expect(updated.units['spy-1']).toBeUndefined();
      expect(updated.espionage!.player.spies['spy-1'].status).toBe('embedded');
      expect(deps.hud.update).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });
```

Confirm `controller.openEspionagePanel`'s real name and how `chooseFriendlyCityTarget` resolves a target (read `panel-actions-controller.ts` around this handler) before finalizing this test — the comment above marks required research, not something to leave unresolved in committed code.

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onAssignDefensive"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()` (and likely `expect(deps.hud.update).toHaveBeenCalled()` too, since it's currently never called for this handler).

- [ ] **Step 3: Write minimal implementation.**

```ts
      onAssignDefensive: (spyId) => {
        const target = chooseFriendlyCityTarget();
        if (!target) return;
        const currentPlayer = deps.session.getState().currentPlayer;
        const unit = deps.session.getState().units[spyId];
        const nextEspionage = {
          ...deps.session.getState().espionage,
          [currentPlayer]: embedSpy(deps.session.getState().espionage![currentPlayer], spyId, target.cityId, target.position),
        };
        let nextUnits = deps.session.getState().units;
        let nextCivilizations = deps.session.getState().civilizations;
        if (unit) {
          const { [spyId]: _removed, ...remainingUnits } = nextUnits;
          nextUnits = remainingUnits;
          nextCivilizations = {
            ...nextCivilizations,
            [currentPlayer]: { ...nextCivilizations[currentPlayer], units: nextCivilizations[currentPlayer].units.filter(id => id !== spyId) },
          };
        }
        deps.session.commit({ ...deps.session.getState(), espionage: nextEspionage, units: nextUnits, civilizations: nextCivilizations });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        const cityName = deps.session.getState().cities[target.cityId]?.name ?? target.cityId;
        deps.showNotification(`Spy embedded in ${cityName}. Counter-intelligence boosted.`, 'info');
      },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onAssignDefensive"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller): route onAssignDefensive's espionage/unit mutation through session.commit and call hud.update"
```

### Task 5.7: espionage `onStartMission`, `onRecall`, `onVerifyAgent`

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:887-929`
- Test: `tests/app/controllers/panel-actions-controller.test.ts` (extend the espionage-panel describe block from Task 5.6)

Current code (all 3, same shape):

```ts
      onStartMission: (spyId) => {
        const spy = deps.session.getState().espionage?.[deps.session.getState().currentPlayer]?.spies[spyId];
        if (!spy) return;
        const mission = chooseMission(spyId);
        if (!mission) return;
        let targetCivId = spy.targetCivId ?? undefined;
        let targetCityId = spy.targetCityId ?? undefined;
        if (!missionRequiresPlacedSpy(mission)) {
          const target = chooseForeignCityTarget();
          if (!target) return;
          targetCivId = target.civId;
          targetCityId = target.cityId;
        }
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = startMission(
          deps.session.getState().espionage![deps.session.getState().currentPlayer],
          spyId,
          mission,
          deps.currentCivDef()?.bonusEffect,
          targetCivId,
          targetCityId,
        );
        deps.renderLoop.setGameState(deps.session.getState());
        deps.router.open('espionage');
        deps.showNotification(`Mission ${mission} started.`, 'info');
      },
      onRecall: (spyId) => {
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = recallSpy(
          deps.session.getState().espionage![deps.session.getState().currentPlayer],
          spyId,
        );
        deps.renderLoop.setGameState(deps.session.getState());
        deps.router.open('espionage');
        deps.showNotification('Spy recalled.', 'info');
      },
      onVerifyAgent: (spyId) => {
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = verifyAgent(
          deps.session.getState().espionage![deps.session.getState().currentPlayer],
          spyId,
        );
        deps.renderLoop.setGameState(deps.session.getState());
        deps.router.open('espionage');
        deps.showNotification('Agent verified and cleared.', 'success');
      },
```

None of these 3 currently call `hud.update()` — all live bugs per the spec's severity table.

- [ ] **Step 1: Write the failing tests.**

```ts
    it('onStartMission commits the started mission and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-start-mission');
      placeSpy(state, 'spy-1', { status: 'stationed', targetCivId: 'ai', targetCityId: 'foreign-city' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onStartMission: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      // chooseMission() resolves via window.prompt in this file (see chooseMission's definition
      // above onAssignDefensive) -- stub window.prompt to return a valid SpyMissionType before calling.
      options.onStartMission('spy-1');

      expect(deps.session.getState().espionage!.player.spies['spy-1'].status).not.toBe('stationed');
      expect(listener).toHaveBeenCalled();
    });

    it('onRecall commits the recalled spy and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-recall');
      placeSpy(state, 'spy-1', { status: 'on_mission' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onRecall: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onRecall('spy-1');

      expect(listener).toHaveBeenCalled();
    });

    it('onVerifyAgent commits the cleared agent and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-verify');
      placeSpy(state, 'spy-1', { status: 'suspected' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onVerifyAgent: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onVerifyAgent('spy-1');

      expect(listener).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onStartMission|onRecall|onVerifyAgent"`
Expected: FAIL, all 3, on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onStartMission: (spyId) => {
        const spy = deps.session.getState().espionage?.[deps.session.getState().currentPlayer]?.spies[spyId];
        if (!spy) return;
        const mission = chooseMission(spyId);
        if (!mission) return;
        let targetCivId = spy.targetCivId ?? undefined;
        let targetCityId = spy.targetCityId ?? undefined;
        if (!missionRequiresPlacedSpy(mission)) {
          const target = chooseForeignCityTarget();
          if (!target) return;
          targetCivId = target.civId;
          targetCityId = target.cityId;
        }
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: {
            ...deps.session.getState().espionage,
            [currentPlayer]: startMission(deps.session.getState().espionage![currentPlayer], spyId, mission, deps.currentCivDef()?.bonusEffect, targetCivId, targetCityId),
          },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        deps.showNotification(`Mission ${mission} started.`, 'info');
      },
      onRecall: (spyId) => {
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: recallSpy(deps.session.getState().espionage![currentPlayer], spyId) },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        deps.showNotification('Spy recalled.', 'info');
      },
      onVerifyAgent: (spyId) => {
        const currentPlayer = deps.session.getState().currentPlayer;
        deps.session.commit({
          ...deps.session.getState(),
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: verifyAgent(deps.session.getState().espionage![currentPlayer], spyId) },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.hud.update();
        deps.router.open('espionage');
        deps.showNotification('Agent verified and cleared.', 'success');
      },
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onStartMission|onRecall|onVerifyAgent"`
Expected: PASS, all 3.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller): route onStartMission/onRecall/onVerifyAgent through session.commit and call hud.update"
```

### Task 5.8: espionage `onExfiltrate` and `onUnembed`

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:930-969` (`onExfiltrate`), `:990-1007` (`onUnembed`)
- Test: `tests/app/controllers/panel-actions-controller.test.ts` (extend the espionage-panel describe block)

Current code, `onExfiltrate`:

```ts
      onExfiltrate: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(deps.session.getState(), deps.session.getState().currentPlayer);
        if (!capital) { deps.showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        const existingPositions = new Set(
          Object.values(deps.session.getState().units).map(u => `${u.position.q},${u.position.r}`),
        );
        let spawnPos = capital.position;
        if (existingPositions.has(`${spawnPos.q},${spawnPos.r}`)) {
          const adjacent = hexesInRange(capital.position, 1).filter(
            c => !(c.q === capital.position.q && c.r === capital.position.r) &&
                 !existingPositions.has(`${c.q},${c.r}`) &&
                 deps.session.getState().map.tiles[hexKey(c)],
          );
          if (adjacent.length === 0) {
            deps.showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
            return;
          }
          spawnPos = adjacent[0];
        }

        const newUnit = createUnit(spy.unitType, deps.session.getState().currentPlayer, spawnPos, deps.session.getState().idCounters);
        deps.session.getState().units[newUnit.id] = newUnit;
        deps.session.getState().civilizations[deps.session.getState().currentPlayer].units =
          [...(deps.session.getState().civilizations[deps.session.getState().currentPlayer].units ?? []), newUnit.id];
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } };
        deps.renderLoop.setGameState(deps.session.getState());
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
```

Current code, `onUnembed`:

```ts
      onUnembed: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = deps.session.getState().cities[spy.targetCityId];
        if (!city) return;
        const newUnit = createUnit(spy.unitType, deps.session.getState().currentPlayer, city.position, deps.session.getState().idCounters);
        deps.session.getState().units[newUnit.id] = newUnit;
        deps.session.getState().civilizations[deps.session.getState().currentPlayer].units.push(newUnit.id);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } };
        deps.renderLoop.setGameState(deps.session.getState());
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
```

- [ ] **Step 1: Write the failing tests.**

```ts
    it('onExfiltrate spawns a fresh unit at the capital, updates espionage state, and publishes', () => {
      const { state } = makeFixture('espionage-exfiltrate');
      state.cities['capital'] = makeCity('capital', { owner: 'player', position: { q: 5, r: 5 } });
      state.civilizations.player.cities = ['capital'];
      placeSpy(state, 'spy-1', { status: 'stationed' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onExfiltrate: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onExfiltrate('spy-1');

      const updated = deps.session.getState();
      expect(Object.values(updated.units).some(u => u.type === 'spy_scout')).toBe(true);
      expect(updated.espionage!.player.spies['spy-1']).toBeUndefined();
      expect(listener).toHaveBeenCalled();
    });

    it('onUnembed spawns a fresh unit at the target city, updates espionage state, and publishes', () => {
      const { state } = makeFixture('espionage-unembed');
      state.cities['target-city'] = makeCity('target-city', { owner: 'ai', position: { q: 3, r: 3 } });
      placeSpy(state, 'spy-1', { status: 'embedded', targetCityId: 'target-city' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onUnembed: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onUnembed('spy-1');

      const updated = deps.session.getState();
      expect(Object.values(updated.units).some(u => u.type === 'spy_scout')).toBe(true);
      expect(listener).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run tests to verify they fail.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onExfiltrate|onUnembed"`
Expected: FAIL, both, on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onExfiltrate: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'stationed') return;
        const capital = getCapitalCity(deps.session.getState(), deps.session.getState().currentPlayer);
        if (!capital) { deps.showNotification('Cannot exfiltrate — no capital found.', 'warning'); return; }

        const existingPositions = new Set(
          Object.values(deps.session.getState().units).map(u => `${u.position.q},${u.position.r}`),
        );
        let spawnPos = capital.position;
        if (existingPositions.has(`${spawnPos.q},${spawnPos.r}`)) {
          const adjacent = hexesInRange(capital.position, 1).filter(
            c => !(c.q === capital.position.q && c.r === capital.position.r) &&
                 !existingPositions.has(`${c.q},${c.r}`) &&
                 deps.session.getState().map.tiles[hexKey(c)],
          );
          if (adjacent.length === 0) {
            deps.showNotification('Cannot exfiltrate — no free tile near capital.', 'warning');
            return;
          }
          spawnPos = adjacent[0];
        }

        const currentPlayer = deps.session.getState().currentPlayer;
        const newUnit = createUnit(spy.unitType, currentPlayer, spawnPos, deps.session.getState().idCounters);
        const updatedSpy = {
          ...spy, id: newUnit.id, status: 'cooldown' as const,
          cooldownTurns: 8, infiltrationCityId: null, cityVisionTurnsLeft: 0, targetCivId: null, cooldownMode: undefined,
        };
        const { [spyId]: _old, ...rest } = ownerEsp!.spies;
        deps.session.commit({
          ...deps.session.getState(),
          units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
          civilizations: {
            ...deps.session.getState().civilizations,
            [currentPlayer]: { ...deps.session.getState().civilizations[currentPlayer], units: [...(deps.session.getState().civilizations[currentPlayer].units ?? []), newUnit.id] },
          },
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: { ...ownerEsp!, spies: { ...rest, [newUnit.id]: updatedSpy } } },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification('Spy exfiltrated. Available again in 8 turns.', 'info');
      },
```

```ts
      onUnembed: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        const spy = ownerEsp?.spies[spyId];
        if (!spy || spy.status !== 'embedded' || !spy.targetCityId) return;
        const city = deps.session.getState().cities[spy.targetCityId];
        if (!city) return;
        const currentPlayer = deps.session.getState().currentPlayer;
        const newUnit = createUnit(spy.unitType, currentPlayer, city.position, deps.session.getState().idCounters);
        const unembedded = unembedSpy(ownerEsp!, spyId);
        const rekeyed = { ...unembedded.spies[spyId], id: newUnit.id };
        const { [spyId]: _old, ...rest } = unembedded.spies;
        deps.session.commit({
          ...deps.session.getState(),
          units: { ...deps.session.getState().units, [newUnit.id]: newUnit },
          civilizations: {
            ...deps.session.getState().civilizations,
            [currentPlayer]: { ...deps.session.getState().civilizations[currentPlayer], units: [...deps.session.getState().civilizations[currentPlayer].units, newUnit.id] },
          },
          espionage: { ...deps.session.getState().espionage, [currentPlayer]: { ...unembedded, spies: { ...rest, [newUnit.id]: rekeyed } } },
        });
        deps.renderLoop.setGameState(deps.session.getState());
        deps.getElementById('espionage-panel')?.remove();
        deps.router.open('espionage');
        deps.showNotification(`Spy recalled from ${city.name}. Available in 5 turns.`, 'info');
      },
```

- [ ] **Step 4: Run tests to verify they pass.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onExfiltrate|onUnembed"`
Expected: PASS, both.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller): route onExfiltrate/onUnembed's unit-spawn mutation through session.commit"
```

### Task 5.9: espionage `onSweep`

**Files:**
- Modify: `src/app/controllers/panel-actions-controller.ts:1008-1020` (confirm exact end line by reading the file — the spec's grep captured line 1013 as the flagged assignment, with `deps.renderLoop.setGameState` following at 1019 per the original inventory)
- Test: `tests/app/controllers/panel-actions-controller.test.ts` (extend the espionage-panel describe block)

Current code:

```ts
      onSweep: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        if (!ownerEsp) return;
        const seed = `sweep-${spyId}-${deps.session.getState().turn}`;
        const { detectedSpyIds, state: updatedEsp } = attemptSweep(ownerEsp, spyId, seed, deps.session.getState());
        deps.session.getState().espionage![deps.session.getState().currentPlayer] = updatedEsp;
        if (detectedSpyIds.length > 0) {
          deps.showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
        } else {
          deps.showNotification('Sweep complete — no enemy spies detected.', 'info');
        }
        deps.renderLoop.setGameState(deps.session.getState());
      },
```

- [ ] **Step 1: Write the failing test.**

```ts
    it('onSweep commits the sweep result and publishes through session subscribers', () => {
      const { state } = makeFixture('espionage-sweep');
      placeSpy(state, 'sweeper-1', { status: 'embedded' });
      const { deps, controller } = build(state);
      const listener = vi.fn();
      deps.session.subscribe(listener);

      controller.openEspionagePanel();
      const options = mockedCallArg<{ onSweep: (spyId: string) => void }>(createEspionagePanel, 0, 1);
      options.onSweep('sweeper-1');

      expect(deps.showNotification).toHaveBeenCalled();
      expect(listener).toHaveBeenCalled();
    });
```

- [ ] **Step 2: Run test to verify it fails.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onSweep"`
Expected: FAIL on `expect(listener).toHaveBeenCalled()`.

- [ ] **Step 3: Write minimal implementation.**

```ts
      onSweep: (spyId) => {
        const ownerEsp = deps.session.getState().espionage?.[deps.session.getState().currentPlayer];
        if (!ownerEsp) return;
        const seed = `sweep-${spyId}-${deps.session.getState().turn}`;
        const { detectedSpyIds, state: updatedEsp } = attemptSweep(ownerEsp, spyId, seed, deps.session.getState());
        deps.session.commit({ ...deps.session.getState(), espionage: { ...deps.session.getState().espionage, [deps.session.getState().currentPlayer]: updatedEsp } });
        if (detectedSpyIds.length > 0) {
          deps.showNotification(`Sweep detected ${detectedSpyIds.length} enemy spy(ies) in the city!`, 'warning');
        } else {
          deps.showNotification('Sweep complete — no enemy spies detected.', 'info');
        }
        deps.renderLoop.setGameState(deps.session.getState());
      },
```

- [ ] **Step 4: Run test to verify it passes.**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/controllers/panel-actions-controller.test.ts -t "onSweep"`
Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/app/controllers/panel-actions-controller.ts tests/app/controllers/panel-actions-controller.test.ts
git commit -m "fix(panel-actions-controller): route onSweep's espionage-state commit through session.commit"
```

### Phase 5 close-out

- [ ] Run `bash scripts/run-with-mise.sh yarn build` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test` — expect exit 0 (this includes `tests/ui/city-panel*.test.ts`).
- [ ] Re-run the inventory grep against `panel-actions-controller.ts` — confirm 0 remaining matches. Expected breakdown (verified 21 = 1 + 4 + 3 + 3 + 3 + 6 + 1): Task 5.1=1 (settings), Task 5.3=4 (onBuild/onMoveQueueItem/onRemoveQueueItem/onSetIdleProduction), Task 5.5=3 (onQueueResearch/onMoveQueuedResearch/onRemoveQueuedResearch), Task 5.6=3 (onAssignDefensive's espionage-assign/delete-unit/civ-units-filter), Task 5.7=3 (onStartMission/onRecall/onVerifyAgent, one site each), Task 5.8=6 (onExfiltrate's units/civ-units/espionage-assign ×3 + onUnembed's units/civ-units/espionage-assign ×3), Task 5.9=1 (onSweep). If the re-run grep finds a residual site not covered by Tasks 5.1-5.9, add one more task before closing this phase rather than closing with a known gap.
- [ ] Confirm `src/ui/city-panel.ts` has zero remaining `void`-only queue callbacks (Task 5.2/5.3 covered all 4).
- [ ] Open the PR. Title: `fix(787): GameSession state-mutation audit — Phase 5 (panel-actions-controller.ts + city-panel.ts)`. Body must explicitly call out the `city-panel.ts` companion change and the test rewrite (Task 5.4) as its own line items, per Global Constraints.

---

## Phase 6 — Regression guard

Both the grep-based boundary test and the real-time edit hook, added only once Phases 1-5 have driven the inventory to zero.

### Task 6.1: `architecture-boundaries.test.ts` boundary test

**Files:**
- Modify: `tests/app/architecture-boundaries.test.ts`

**Interfaces:**
- Consumes: `readdirSync`, `readFileSync` (already imported in this file, per its existing `controllers depend on ports...` test).
- Produces: no new exports — this is a test-only addition.

- [ ] **Step 1: Re-run the full inventory** from the spec's grep commands against the current `src/` tree, restricted to `src/app/**`, `src/presentation/**`, `src/ui/**`, excluding `src/app/game-session.ts` and `src/app/ports.ts`:

```bash
grep -rnE "getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^]]+\])+\s*=[^=]" src/app src/presentation src/ui --include="*.ts" | grep -v "src/app/game-session.ts\|src/app/ports.ts"
grep -rnE "delete [A-Za-z0-9_.]*getState\(\)" src/app src/presentation src/ui --include="*.ts"
grep -rnE "getState\(\)(\.[A-Za-z0-9_]+|\[[^]]+\])+\.(push|splice|pop|shift|unshift|sort|reverse)\(" src/app src/presentation src/ui --include="*.ts"
```

Expected: zero output from all three, confirming Phases 1-5 closed the count. If anything remains, stop here and add a Task 6.0 to convert it before proceeding — do not add a passing test with a documented allowlist for a real leftover site; the spec's whole point is zero, not "zero except these."

- [ ] **Step 2: Write the test.** Add to `tests/app/architecture-boundaries.test.ts`, after the existing `'controllers depend on ports...'` test:

```ts
it('no app/presentation/ui file mutates the object returned by session.getState() directly', () => {
  // GameSession.commit()/update() are the only sanctioned publish path (see
  // src/app/ports.ts's GameSession doc comment). Mutating getState()'s return
  // value in place bypasses both subscribers (renderLoop, hud) that only fire
  // through commit/update -- see docs/superpowers/specs/2026-08-15-gamesession-state-mutation-audit-design.md.
  const dirs = [
    resolve(__dirname, '../../src/app'),
    resolve(__dirname, '../../src/presentation'),
    resolve(__dirname, '../../src/ui'),
  ];
  const excluded = new Set(['game-session.ts', 'ports.ts']);
  const mutationPatterns = [
    /getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^\]]+\])+\s*=[^=]/,
    /delete [A-Za-z0-9_.]*getState\(\)/,
    /getState\(\)(\.[A-Za-z0-9_]+|\[[^\]]+\])+\.(push|splice|pop|shift|unshift|sort|reverse)\(/,
  ];

  function walk(dir: string): string[] {
    const entries = readdirSync(dir, { withFileTypes: true });
    return entries.flatMap(entry => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      return entry.name.endsWith('.ts') && !excluded.has(entry.name) ? [full] : [];
    });
  }

  for (const dir of dirs) {
    for (const file of walk(dir)) {
      const source = readFileSync(file, 'utf8');
      for (const line of source.split('\n')) {
        for (const pattern of mutationPatterns) {
          expect(pattern.test(line), `${file}: ${line}`).toBe(false);
        }
      }
    }
  }
});
```

- [ ] **Step 2: Run test to verify it passes** (Phases 1-5 already emptied the inventory, so this should pass immediately — it's a regression guard, not a TDD-from-red test).

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts`
Expected: PASS.

- [ ] **Step 3: Prove the guard actually catches a violation** (temporary, do not commit): add a throwaway line like `deps.session.getState().turn = 1;` to any file under `src/app/`, re-run the test, confirm it fails with a message naming the file and line, then revert the throwaway line.

- [ ] **Step 4: Commit.**

```bash
git add tests/app/architecture-boundaries.test.ts
git commit -m "test(architecture-boundaries): ban direct mutation through session.getState() in app/presentation/ui"
```

### Task 6.2: `check-src-edit.sh` real-time companion check

**Files:**
- Modify: `.claude/hooks/check-src-edit.sh`
- Test: `tests/hooks/check-src-edit.test.sh`

**Interfaces:**
- Consumes: the hook's existing `append()` helper function (already defined in the file, used by every other check block).

- [ ] **Step 1: Add block-case and allow-case fixtures to the smoke test.** In `tests/hooks/check-src-edit.test.sh`, after the existing `# --- block: cities[0] in a UI file ---` block (or any existing block near the top), add:

```bash
# --- block: direct mutation through session.getState() in src/app ---
cat > "$tmp/src/ui/panel.ts" <<'EOF'
session.getState().cities[cityId] = enqueueCityProduction(city, itemId);
EOF
expect_block "$tmp/src/ui/panel.ts" "getState() mutation in src/ui"

# --- allow: reading getState() without mutating it ---
cat > "$tmp/src/ui/reader.ts" <<'EOF'
const city = session.getState().cities[cityId];
EOF
expect_allow "$tmp/src/ui/reader.ts" "getState() read-only in src/ui"
```

- [ ] **Step 2: Run the smoke test to verify it fails.**

Run: `bash tests/hooks/check-src-edit.test.sh`
Expected: FAIL on the new `expect_block` case (`check-src-edit.sh` doesn't check this pattern yet, so it exits 0 instead of the expected 2).

- [ ] **Step 3: Write minimal implementation.** Add a new check block to `.claude/hooks/check-src-edit.sh`, placed near the existing "direct state mutation in turn processing" block (mirroring its structure), before the final `if [ -n "$violations" ]; then`:

```bash
# --- direct mutation through session.getState() outside game-session.ts/ports.ts ---
case "$file_path" in
  */src/app/game-session.ts|*/src/app/ports.ts)
    : # allowed: game-session.ts is the one sanctioned mutation path; ports.ts is types-only
    ;;
  *)
    if grep -nE 'getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^]]+\])+\s*=[^=]' "$file_path" | grep -v '//' >/dev/null; then
      lines="$(grep -nE 'getState\(\)(\.[A-Za-z0-9_]+[!]?|\[[^]]+\])+\s*=[^=]' "$file_path" | grep -v '//' | head -5)"
      append "Direct mutation through session.getState() detected -- use session.commit()/session.update() instead (see docs/superpowers/specs/2026-08-15-gamesession-state-mutation-audit-design.md):
$lines"
    fi
    if grep -nE 'delete [A-Za-z0-9_.]*getState\(\)' "$file_path" >/dev/null; then
      lines="$(grep -nE 'delete [A-Za-z0-9_.]*getState\(\)' "$file_path" | head -5)"
      append "delete through session.getState() detected -- build a new object and use session.commit()/session.update() instead:
$lines"
    fi
    ;;
esac
```

- [ ] **Step 4: Run the smoke test to verify it passes.**

Run: `bash tests/hooks/check-src-edit.test.sh`
Expected: PASS, all cases (existing ones plus the 2 new ones).

- [ ] **Step 5: Run the full test suite once more** to confirm this hook change doesn't break anything else (it's a hook script, not directly exercised by `yarn test`, but `tests/hooks/run.sh` — if that's how hook smoke tests are wired into `yarn test`, per `.claude/rules/hooks-and-tooling.md` — must still pass):

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 6: Commit.**

```bash
git add .claude/hooks/check-src-edit.sh tests/hooks/check-src-edit.test.sh
git commit -m "feat(check-src-edit): catch direct mutation through session.getState() at edit time"
```

### Phase 6 close-out

- [ ] Run `bash scripts/run-with-mise.sh yarn build` — expect exit 0.
- [ ] Run `bash scripts/run-with-mise.sh yarn test` — expect exit 0.
- [ ] Open the PR. Title: `fix(787): GameSession state-mutation audit — Phase 6 (regression guard)`. Body confirms the inventory is verified at zero as of this PR and links Phases 1-5.

---

## Self-Review

**Spec coverage:** every numbered section of the design spec maps to a phase/task above — Problem/inventory → Phases 1-5's per-file task breakdown; Scope (including the `city-panel.ts` addition) → Task 5.2/5.3; Fix pattern's chained-write hazard → Task 1.1 and Task 1.3; Fix pattern's `city-panel.ts` hazard → Tasks 5.2-5.4; Regression guard → Phase 6; Behavioral test per site → every task's Step 1/listener assertion; Phasing → the 6 phases match the spec's list one-to-one.

**Placeholder scan:** two intentional exceptions, both explicitly called out as research-required rather than left silent: Task 4.2's `// arrange` comments (branch-selecting inputs for `attemptInfiltration` depend on that function's real signature, which this plan-writing pass did not read) and Task 3.1's `someTechId` line (depends on `turn-flow-controller.test.ts`'s existing idle-research fixture, not read during this pass). Both are marked as "resolve before this task's Step 1 is complete, do not commit as-is" rather than left as ordinary steps — an implementer following `superpowers:executing-plans` must treat these two as blocking sub-steps, not skip them.

**Type consistency:** `GameState | void` is used consistently for the 4 `city-panel.ts` callbacks (Task 5.2) and their `panel-actions-controller.ts` implementations (Task 5.3) — matching the pre-existing `onSetCityFocus`/`onToggleWorkedTile`/`onRushBuyActiveProduction` shape exactly, not a new convention. `session.commit(next: GameState)` and `session.update(fn: (state: GameState) => GameState): void` are used with consistent signatures across every task, matching `src/app/ports.ts`'s existing `GameSession` interface (unchanged by this plan). Every task's `deps.session`/`session` naming matches its file's actual factory-parameter convention (`deps.session.getState()` in `player-action-controller.ts`, `panel-actions-controller.ts`, `campaign-entry-controller.ts`; bare `session.getState()` in `selection-controller.ts`, `turn-flow-controller.ts` — confirmed against the actual source reads this plan is based on, not assumed uniform).
