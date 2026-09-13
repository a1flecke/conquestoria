# Issue 1065 Save/Reload Equivalence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make save normalization preserve genuine minor-civ notification history so save/reload remains simulation-equivalent and cannot suppress a first relationship-status notice.

**Architecture:** Keep load repair in `normalizeMinorCivQuestState`: it may initialize the map, reject malformed values, and remove keys for non-live civilizations, but it must never synthesize a status for an absent key. The existing minor-civ turn emitter remains the sole writer of notification history; tests cover the JSON transfer boundary, IndexedDB-style save path, deterministic long campaign, eliminated-civ teardown, and both seats of a hot-seat game.

**Tech Stack:** TypeScript, Vitest, Vite, Yarn 4, IndexedDB save-manager mocks.

---

## File map

| File | Responsibility |
| --- | --- |
| `src/storage/save-manager.ts` | Repair malformed or impossible persisted minor-civ notification history without inventing history. |
| `tests/storage/save-persistence.test.ts` | Pin normalizer, JSON-transfer, and `saveGame`/`loadGame` preservation behavior. |
| `tests/systems/minor-civ-system.test.ts` | Prove an absent hot-seat participant history still produces the first post-reload threshold event. |
| `tests/ui/minor-civ-notification-listeners.test.ts` | Prove the emitted threshold event is queued only for its affected hot-seat recipient. |
| `tests/helpers/eliminated-civ-areas.ts` | Make stale notification history for an eliminated civ a teardown invariant failure. |
| `tests/systems/eliminated-civ-invariant.test.ts` | Exercise that invariant through the existing real elimination and round-trip scenario. |
| `tests/simulation/long-horizon/campaign-continuity.test.ts` | Turn the temporary F2 tolerance into strict final-state equivalence. |
| `tests/simulation/long-horizon/known-campaign-gaps.ts` | Remove the #1065-only F2 tolerance exports and stale commentary. |

### Task 1: Add failing save-history and teardown regressions

**Files:**
- Modify: `tests/storage/save-persistence.test.ts:15,236-250`
- Modify: `tests/systems/minor-civ-system.test.ts:1-21`
- Modify: `tests/ui/minor-civ-notification-listeners.test.ts:1-150`
- Modify: `tests/helpers/eliminated-civ-areas.ts:321-340`
- Modify: `tests/systems/eliminated-civ-invariant.test.ts:205-238`

- [ ] **Step 1: Add normalizer and transfer-boundary tests that demand exact history preservation.**

  Add `serializeSaveFile` and `parseSaveFile` imports from `@/storage/save-file-transfer`, and the `MinorCivRelationshipStatus` type import from `@/core/types`, to the save-persistence test. Replace the legacy synthesized-status expectation with these cases beside it:

  ```ts
  const histories: Array<[string, Record<string, MinorCivRelationshipStatus>]> = [
    ['empty', {}],
    ['one entry', { player: 'friendly' }],
    ['multiple entries', { player: 'friendly', 'ai-1': 'hostile' }],
  ];

  it.each(histories)('preserves %s minor-civ notification history without synthesis', (_label, history) => {
    const state = createNewGame(undefined, `minor-civ-history-${_label}`, 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    minorCiv.lastNotifiedStatusByCiv = { ...history };

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.minorCivs[minorCiv.id]!.lastNotifiedStatusByCiv).toEqual(history);

    const parsed = parseSaveFile(serializeSaveFile(state));
    if (parsed.status !== 'success') throw new Error(parsed.message);
    const reloaded = normalizeLoadedStateForTest(parsed.state);
    expect(reloaded.minorCivs[minorCiv.id]!.lastNotifiedStatusByCiv).toEqual(history);
  });

  it('repairs malformed and eliminated-civ notification-history keys without synthesizing a replacement', () => {
    const state = createNewGame(undefined, 'minor-civ-history-repair', 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    const eliminatedCivId = Object.keys(state.civilizations).find(id => id !== 'player')!;
    state.civilizations[eliminatedCivId]!.isEliminated = true;
    minorCiv.lastNotifiedStatusByCiv = {
      player: 'friendly',
      [eliminatedCivId]: 'hostile',
      missing: 'neutral',
      malformed: 'not-a-status' as never,
    };

    const normalized = normalizeLoadedStateForTest(state);
    expect(normalized.minorCivs[minorCiv.id]!.lastNotifiedStatusByCiv).toEqual({ player: 'friendly' });
  });
  ```

- [ ] **Step 2: Add the persistent-store path regression.**

  Use the test file's existing `beforeEach` database mock and add:

  ```ts
  it('does not add minor-civ notification history while saving and loading', async () => {
    const state = createNewGame(undefined, 'minor-civ-history-store-round-trip', 'small');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    minorCiv.lastNotifiedStatusByCiv = {};

    await saveGame('minor-civ-history-store', 'Minor civ history', state);
    const loaded = await loadGame('minor-civ-history-store');

    expect(loaded?.minorCivs[minorCiv.id]!.lastNotifiedStatusByCiv).toEqual({});
  });
  ```

- [ ] **Step 3: Add a failing hot-seat event regression before changing production code.**

  Extend the minor-civ-system test imports with `createHotSeatGame`, `normalizeLoadedStateForTest`, `serializeSaveFile`, and `parseSaveFile`. Add the test below near the other turn-processing tests:

  ```ts
  it('emits the first status notice for a non-viewing hot-seat civ after save/reload', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'minor-civ-history-hot-seat');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    minorCiv.lastNotifiedStatusByCiv = { 'player-1': 'neutral' };
    minorCiv.diplomacy.relationships['player-2'] = 35;

    const parsed = parseSaveFile(serializeSaveFile(state));
    if (parsed.status !== 'success') throw new Error(parsed.message);
    const loaded = normalizeLoadedStateForTest(parsed.state);
    const events: Array<{ majorCivId: string; minorCivId: string; newStatus: string }> = [];
    const bus = new EventBus();
    bus.on('minor-civ:relationship-threshold', event => events.push(event));

    const next = processMinorCivTurn(loaded, bus);

    expect(next.minorCivs[minorCiv.id]!.lastNotifiedStatusByCiv).toMatchObject({
      'player-1': 'neutral',
      'player-2': 'friendly',
    });
    expect(events.filter(event => event.majorCivId === 'player-2')).toEqual([
      { majorCivId: 'player-2', minorCivId: minorCiv.id, newStatus: 'friendly' },
    ]);
  });
  ```

- [ ] **Step 4: Pin hot-seat notification delivery.**

  Add this delivery regression to `tests/ui/minor-civ-notification-listeners.test.ts`. It pairs with the preceding system test: that test proves save/reload emits the event, and this test proves the unchanged live listener delivers it to the correct hot-seat inbox rather than the currently viewed seat.

  ```ts
  it('queues a relationship-threshold notice only for its affected non-current hot-seat civ', () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mc-threshold-listener-hot-seat');
    state.currentPlayer = 'player-1';
    state.pendingEvents = {};
    const minorCivId = getFirstMinorCivId(state);
    discoverMinorCiv(state, 'player-2', minorCivId);
    const bus = new EventBus();
    registerMinorCivNotificationListeners(bus, () => state, { appendToCivLog: vi.fn() });

    bus.emit('minor-civ:relationship-threshold', {
      majorCivId: 'player-2',
      minorCivId,
      newStatus: 'friendly',
      state,
    });

    expect(state.pendingEvents?.['player-2']).toEqual([
      expect.objectContaining({ type: 'minor-civ:status', turn: state.turn }),
    ]);
    expect(state.pendingEvents?.['player-1']).toBeUndefined();
  });
  ```

- [ ] **Step 5: Make notification history part of the eliminated-civ invariant.**

  In `tests/helpers/eliminated-civ-areas.ts`, replace the exemption comment with this check inside the existing `for (const deadId ...)` loop:

  ```ts
  if (has(mc.lastNotifiedStatusByCiv, deadId)) {
    problems.push(`minor civ "${mcId}" still holds notification history for eliminated civ "${deadId}"`);
  }
  ```

  Add a focused invariant test that initially fails because the map is exempt:

  ```ts
  it('flags notification history retained for an eliminated civilization', () => {
    let state = eliminate(withCities(newGame('elim-stale-notification')), 'ai-1');
    const minorCiv = Object.values(state.minorCivs)[0]!;
    minorCiv.lastNotifiedStatusByCiv['ai-1'] = 'neutral';

    expect(() => assertEliminatedCivHasNoLiveEntities(state))
      .toThrow('still holds notification history for eliminated civ "ai-1"');
  });
  ```

  Retain the existing `assertEliminatedCivHasNoLiveEntities` calls after real
  elimination and after `parseSaveFile(serializeSaveFile(state))`; they prove
  the canonical teardown and the loader leave no stale history in a valid save.

- [ ] **Step 6: Run the new tests and confirm the new data-path regressions fail for the intended reasons.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/systems/minor-civ-system.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/systems/eliminated-civ-invariant.test.ts
  ```

  Expected: the empty-map, store, and hot-seat system tests fail because the loader inserts `neutral` or `friendly` entries; the malformed/eliminated-key and invariant assertions fail because current normalization and the helper preserve/exempt those keys. The listener-only routing regression already passes, confirming the visible delivery contract that the production change must preserve.

### Task 2: Preserve history in the canonical normalizer

**Files:**
- Modify: `src/storage/save-manager.ts:119-127,682-690`
- Modify: `tests/helpers/eliminated-civ-areas.ts:321-340`
- Test: `tests/storage/save-persistence.test.ts`
- Test: `tests/systems/minor-civ-system.test.ts`
- Test: `tests/ui/minor-civ-notification-listeners.test.ts`
- Test: `tests/systems/eliminated-civ-invariant.test.ts`

- [ ] **Step 1: Remove the history-synthesizing helper and retain only conservative repair.**

  Delete `effectiveLoadedMinorCivStatus`. Replace the current history-map block in `normalizeMinorCivQuestState` with:

  ```ts
  minorCiv.lastNotifiedStatusByCiv ??= {};
  const validStatuses = new Set(['at-war', 'hostile', 'neutral', 'friendly', 'allied']);
  for (const [majorCivId, status] of Object.entries(minorCiv.lastNotifiedStatusByCiv)) {
    const civilization = nextState.civilizations[majorCivId];
    if (!civilization || civilization.isEliminated || !validStatuses.has(status)) {
      delete minorCiv.lastNotifiedStatusByCiv[majorCivId];
    }
  }
  ```

  Do not add a replacement lookup, migration, schema bump, `currentPlayer`
  condition, or change to `emitRelationshipThresholds`; its existing
  `?? 'neutral'` behavior is the intentional meaning of an absent key.

- [ ] **Step 2: Update the eliminated-civ helper’s rationale.**

  Change the `minorCivs.why` text so it says notification history is cleared
  along with relationships and quest state. Delete the obsolete claim that the
  normalizer seeds every major and that the map “drives nothing.”

- [ ] **Step 3: Run the focused regression set and confirm it passes.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/storage/save-manager.ts
  bash scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/systems/minor-civ-system.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/systems/eliminated-civ-invariant.test.ts
  ```

  Expected: PASS. The hot-seat event list has exactly one `friendly` event for
  `player-2`; history for `player-1` remains intact; no invalid or eliminated
  keys survive normalization.

- [ ] **Step 4: Inspect the source and test diff, then commit the implementation.**

  Run:

  ```bash
  git diff --check
  git diff -- src/storage/save-manager.ts tests/storage/save-persistence.test.ts tests/systems/minor-civ-system.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/helpers/eliminated-civ-areas.ts tests/systems/eliminated-civ-invariant.test.ts
  git add src/storage/save-manager.ts tests/storage/save-persistence.test.ts tests/systems/minor-civ-system.test.ts tests/ui/minor-civ-notification-listeners.test.ts tests/helpers/eliminated-civ-areas.ts tests/systems/eliminated-civ-invariant.test.ts
  git commit -m "fix(save): preserve minor-civ notification history"
  ```

  Expected: the diff removes only synthetic history behavior and the obsolete
  eliminated-civ exemption; the commit contains the failing-first regressions.

### Task 3: Replace the temporary long-horizon F2 tolerance

**Files:**
- Modify: `tests/simulation/long-horizon/campaign-continuity.test.ts:10,59-103`
- Modify: `tests/simulation/long-horizon/known-campaign-gaps.ts:95-110`

- [ ] **Step 1: Change the continuity test to demand no divergence.**

  Remove the `F2_SAVE_RELOAD_ISSUE` and `isKnownSaveReloadDivergence` import.
  Replace the two-way F2 assertions with:

  ```ts
  expect(
    firstSimulationDivergence(continued.finalState, uninterrupted.finalState),
    'save/reload must preserve the authoritative state exactly',
  ).toBeNull();
  ```

  Rename the test to `save/reload mid-campaign continues equivalently` and
  delete its stale F2 commentary.

- [ ] **Step 2: Delete only the #1065 tolerance exports.**

  Remove the `F2_SAVE_RELOAD_ISSUE` constant, `F2_DIVERGENCE_PATTERN`,
  `isKnownSaveReloadDivergence`, and their preceding comment from
  `known-campaign-gaps.ts`. Leave the unrelated F1 and F3 known campaign gaps
  unchanged.

- [ ] **Step 3: Run the long-horizon continuity test.**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test:ai-long -- -t "save/reload mid-campaign continues equivalently"
  ```

  Expected: PASS, with `firstSimulationDivergence` returning `null` after the
  two reload points.

- [ ] **Step 4: Commit the ratchet update.**

  Run:

  ```bash
  git add tests/simulation/long-horizon/campaign-continuity.test.ts tests/simulation/long-horizon/known-campaign-gaps.ts
  git commit -m "test(simulation): enforce save reload equivalence"
  ```

### Task 4: Perform final #1065 verification and review

**Files:**
- Modify: `docs/superpowers/specs/2026-09-13-issue-1065-save-equivalence-design.md` only if the review identifies a design correction.
- Test: `tests/storage/save-compat-matrix.test.ts`
- Test: `tests/simulation/ai-playability.test.ts`
- Test: `tests/simulation/long-horizon/campaign-continuity.test.ts`

- [ ] **Step 1: Run compatibility and simulation coverage.**

  Run separately:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/storage/save-compat-matrix.test.ts tests/simulation/ai-playability.test.ts
  bash scripts/run-with-mise.sh yarn test:ai-long -- -t "save/reload mid-campaign continues equivalently"
  ```

  Expected: PASS. Save compatibility accepts the unchanged schema, canonical
  invariants reject no valid state, and AI playability remains behaviorally
  unchanged.

- [ ] **Step 2: Run source checks, build, and durable verification.**

  Run each command separately:

  ```bash
  scripts/check-src-rule-violations.sh src/storage/save-manager.ts
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  git diff --check
  ```

  Expected: all commands exit 0; durable status identifies the current HEAD
  and working tree as passed.

- [ ] **Step 3: Perform and record the required inline review on the actual diff.**

  Inspect `git diff origin/main...HEAD` and `git diff`. Record concrete evidence
  for gameplay/fun/mechanics, age and play-style accessibility, difficulty,
  AI, UI/UX, architecture/extensibility, data/save compatibility, SFX,
  solo/hot-seat behavior, tests, and regressions in the PR description under
  `Pre-PR inline code review`. Fix every in-scope finding and rerun the
  affected command before opening a PR.

## Plan self-review

- **Spec coverage:** Tasks 1–2 cover no synthetic entries, preservation,
  malformed and dangling-key repair, first-notification semantics, save-store
  behavior, UI delivery, and eliminated-civ interactions. Task 3 removes the
  exact F2 tolerance and restores the continuity ratchet. Task 4 covers
  compatibility, deterministic long runs, AI, build, and durable evidence.
- **No placeholders:** Every production change, test fixture, command, and
  expected result is explicit; no deferred implementation or generic test step
  remains.
- **Type consistency:** `lastNotifiedStatusByCiv` stays a
  `Record<string, MinorCivRelationshipStatus>`, `normalizeLoadedStateForTest`
  remains the test entry point, and the only notification event remains
  `minor-civ:relationship-threshold`.

## Plan inline review

“perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics, different player ages (7-43), different play styles, the built in difficulty modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper testing, regressions solo play, and hot seat plays, and proper implementation.”

| Dimension | Review evidence and disposition |
| --- | --- |
| Gameplay, fun, mechanics, ages, play styles, difficulty | The plan changes no relationship threshold, reward, movement, combat, age-facing copy, or `resolveOpponentChallenge` decision. It preserves the expected first notice instead of introducing a mechanic. No design issue found. |
| Computer players | `processMinorCivTurn` is called by the canonical turn manager for every campaign and computes threshold history per relationship record. The plan leaves planning, orders, and difficulty thresholds unchanged; final AI-playability coverage confirms that contract. No design issue found. |
| UI, UX, SFX | The existing listener queues a typed hot-seat status event and appends a civ log entry. The original plan proved only emitter output, not delivery; this review fixed that by adding the focused listener test for a non-current recipient. No SFX path is affected. |
| Architecture and extensibility | Repair remains in the one load normalizer, history writing remains in the one emitter, and eliminated-civ cleanup remains canonical. No cache, migration, schema, or viewer-specific branch is proposed. No design issue found. |
| Data and saved games | The plan exercises normalization, actual JSON transfer, and `saveGame`/`loadGame`, which normalizes before persistence. It explicitly distinguishes valid history from malformed, missing-civ, and eliminated-civ records. No schema/version issue found. |
| Testing, solo, hot seat | Empty, single, and multiple history maps; malformed and dangling data; the long-horizon ratchet; eliminated-civ invariant; solo AI coverage; and a two-human-seat event plus listener test are all specified. The hot-seat listener coverage was the review finding and is now fixed. |
| Proper implementation | The plan is TDD-ordered, names exact files and commands, checks source rules and durable results, requires the final actual-diff inline review, and forbids known out-of-scope changes. No remaining in-scope plan finding. |
