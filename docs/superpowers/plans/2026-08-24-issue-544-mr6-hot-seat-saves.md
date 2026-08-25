# #544 MR6 — Hot-seat + Save Validation Implementation Plan

Contract §"AI / hot-seat / saves" acceptance items 85-89:

85. Viewer-safe overlay.
86. Viewer-safe candidate selection.
87. Pending intents cleared on handoff.
88. Same-turn save/load exactness.
89. Legacy save compatibility.

## Scope decision

Unlike MR1-MR5, MR6 adds **no new gameplay mechanic**. Items 85, 86, 87, and 89
are regression tests proving already-correct behavior (verified by reading the
real source before writing this plan — see "Drift check" section below). Item
88 needs a small amount of genuine investigation plus a new test convention.
Item 86 needs one small, behavior-preserving extraction (see Task 3) so its
filtering logic is directly unit-testable — mirroring the codebase's own
`*ForViewer` presentation-helper convention rather than adding a new pattern.

No manual-verification scenario file is added for this MR: every item is a
headless system/controller/store-level regression, not a new interactive
surface a scenario would exercise.

## Drift check (verified against current code before writing this plan)

- **Item 85**: `RenderLoop.toggleSupplyOverlay()` (`src/renderer/render-loop.ts:335`)
  derives `viewerId` from `this.state.currentPlayer` locally — never a stale
  parameter. `setGameState()` (`src/renderer/render-loop.ts:511`) also
  recomputes `supplyOverlayPresentation` from `state.currentPlayer` on every
  authoritative commit, gated by `isSupplyOverlayEnabled(state.currentPlayer)`
  — i.e. it checks the *current* viewer's toggle state, not a stale previous
  viewer's. No bug. `tests/renderer/render-loop-wrap.test.ts:171` already has
  an equivalent hot-seat-handoff regression for the air-defense overlay
  (`airDefenseOverlayProviders`) — Task 1 adds the supply-overlay sibling.
- **Item 86**: `maybeShowPendingGeneralChoice` (`src/app/bootstrap.ts:172`)
  correctly filters `pending.civId === session.getState().currentPlayer`
  before ever opening `createGeneralCandidatePanel`. No bug. But this filter
  is inline in a closure inside `createAppComposition` with no direct unit-test
  seam (its only two real callers, `GameSessionController.init()` and
  `TurnFlowController.endTurn()`, are both heavy async flows unsuitable for a
  targeted regression test — confirmed by checking both call sites). Task 3
  extracts the filter+lookup into `getPendingGeneralChoiceForViewer(state,
  viewerId)` in `great-general-system.ts` (same file that already owns
  `pendingGeneralCandidateChoices` writes), with zero behavior change, and
  wires `bootstrap.ts` to call it.
- **Item 87**: `endTurn()` (`src/app/controllers/turn-flow-controller.ts:696`)
  calls `deps.deselectUnit()` unconditionally before the hot-seat-handoff
  branch. The real `deselectUnit` (`src/app/controllers/selection-controller.ts:763`)
  calls `selection.clear()`, whose contract excepts only `'city-capture'` —
  `'last-stand-target'` (added in MR4) is not excepted, so it clears too. No
  bug. But `tests/app/selection-store.test.ts`'s existing `clear()` coverage
  (lines 67 and 83) only exercises `'journey'` and `'city-capture'`, never
  `'last-stand-target'` specifically, and `tests/app/controllers/turn-flow-controller.test.ts`'s
  `baseDeps()` always mocks `deselectUnit` as a bare `vi.fn()`, so no existing
  test proves the *real* `deselectUnit` → `selection.clear()` wiring actually
  runs before a hot-seat handoff completes. Task 4 adds both: a
  `'last-stand-target'`-specific `SelectionStore.clear()` test, and a
  `TurnFlowController.endTurn()` hot-seat test with the real `deselectUnit`
  wired to `selection.clear()`.
- **Item 88**: genuinely uninvestigated before this plan. `saveGame()`'s only
  real (non-test) call site is `src/app/controllers/game-session-controller.ts:159`,
  invoked from a manual "Save" action — nothing restricts it to turn
  boundaries. So a save can capture genuinely mid-turn, mid-round ephemeral
  state: General command charges used this round, a cooldown set but not yet
  expired, a queued-but-unresolved `pendingGeneralCandidateChoices` entry, and
  per-unit `landSupply` status (persisted on `Unit.landSupply`, written by
  `applyLandSupplyStatus` in `src/systems/supply-system.ts:44`, not
  recomputed live on load). `tests/storage/save-persistence.test.ts` already
  establishes the `saveGame`/`loadGame` round-trip convention via
  `structuredClone` before-snapshot + `toEqual` (see
  `tests/storage/save-migrations.test.ts:437-443`'s `rejects a newer save
  schema` test for the exact snapshot pattern), but has no test exercising
  General-command or supply state specifically, and none that snapshots a
  state mid-round (some hot-seat civs still to act) rather than at a clean
  turn boundary. Task 2 adds this.
- **Item 89**: `tests/storage/save-migrations.test.ts:953`'s `describe('#544
  MR4 — legacy save load with no General heroic-command fields', ...)` is the
  established precedent. `CURRENT_SAVE_SCHEMA_VERSION` is unchanged by MR5 —
  confirmed still the version MR4 shipped with (grep `src/storage/save-migrations.ts`
  before starting Task 5 to get the exact number, since it is not restated
  here to avoid this plan doc going stale if a later MR bumps it first). MR5's
  only save-shape-relevant change is *behavioral*: AI civs now populate
  `pendingGeneralCandidateChoices` and resolve them via `spawnGeneralForCiv`,
  which previously only ever happened for the human player. Task 5 extends the
  MR4 describe block's sibling with an "MR5 legacy save" case: an MR4-era save
  (schema version unchanged, no AI civ has ever had a
  `pendingGeneralCandidateChoices` entry) loads cleanly and an AI civ's
  General-acquisition path works normally from that point forward.

## Global Constraints

- No subagents (CLAUDE.md) — every task executed inline in this session.
- Work happens in this worktree (`.claude/worktrees/next-544-review-5dfa4c`,
  branch `claude/next-544-review-5dfa4c`), already verified at `origin/main`
  HEAD `483145e8` with correct worktree-scoped `core.hooksPath=.githooks` and
  `mise trust`ed.
- Difficulty must stay mechanically identical — N/A for this MR (no AI
  eligibility/mechanics code is touched).
- Run `bash scripts/run-with-mise.sh yarn test` and
  `bash scripts/run-with-mise.sh yarn build` after every task; both must exit
  0 before moving to the next task.
- ~~Known pre-existing flake, not ours to fix~~ — **fixed in this PR** at the
  user's explicit request: `tests/core/turn-manager-crisis.test.ts` → "emits
  one target-scoped Rogue Host warning from the scheduler transition" was
  intermittently failing in full-suite runs (MR4, MR5, and once here). Root
  cause: the test's candidate-search loop used
  `processRogueElephantHostScheduling` as its search predicate but
  `processTurn` (which runs strictly more systems, including ones that can
  independently trip `hasActiveTargetedWorldPressure` and suppress the
  warning) as its assertion — a predicate/assertion mismatch that surfaces
  because `state.gameId` embeds a real `Date.now()` component
  (`createGameId` in `src/core/game-state.ts`, added for autosave-slot
  uniqueness) and is reused as the base RNG seed for combat/AI/pirate/crisis
  systems throughout the codebase — so which candidate the search loop lands
  on, and whether some *other* `processTurn`-internal system also rolls true
  for that specific gameId+turn, varies with real time. Fixed by making the
  search predicate `processTurn` itself (see the in-file comment on the fix
  for the full explanation) — the deeper `gameId`/`Date.now()` non-
  determinism issue is confirmed real and wide-reaching (dozens of call
  sites depend on it, including all combat resolution via
  `deterministicCombatSeed`) but is a separate, carefully-scoped design
  question (splitting save-slot identity from RNG-seed identity) explicitly
  left out of this PR — see the PR body / final chat summary for the
  standalone finding.
- Inline review before *and* after implementing (balance, fun, accessibility,
  play styles, difficulty fairness, AI usage, UI/UX, architecture,
  extensibility, data, SFX, save-migration impact, test coverage, solo vs.
  hot-seat regressions). Both passes required even though this MR is
  test-heavy — "no new mechanic" does not mean "no review needed": Task 3's
  extraction and Task 5's AI-era legacy-save fixture both touch code that can
  hide a real bug.
- Do not merge or tick issue #544's MR6 checkbox without explicit user
  authorization. Present `finishing-a-development-branch` options and wait.
- Tick issue #544's MR6 checkbox and link the PR in the same PR.

## File Structure

```
docs/superpowers/plans/2026-08-24-issue-544-mr6-hot-seat-saves.md   (this file)
src/systems/great-general-system.ts               (Task 3: new exported helper)
src/app/bootstrap.ts                               (Task 3: use the new helper)
tests/storage/save-persistence.test.ts             (Task 2: item 88)
tests/storage/save-migrations.test.ts              (Task 5: item 89)
tests/renderer/render-loop-wrap.test.ts            (Task 1: item 85)
tests/systems/great-general-system.test.ts         (Task 3: item 86)
tests/app/selection-store.test.ts                  (Task 4a: item 87, store-level)
tests/app/controllers/turn-flow-controller.test.ts (Task 4b: item 87, integration-level)
docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md  (already
  updated in the pre-MR6 tidy-up commit, ec9feaf2)
```

---

### Task 1: Item 85 — supply-overlay viewer-safety regression on hot-seat handoff

Add a sibling to `render-loop-wrap.test.ts`'s existing "refreshes cached
overlay providers and toggle state for a hot-seat handoff" test (line 171),
proving the supply overlay is equally per-viewer-scoped: toggling it on for
`human-a`, then handing off to `human-b`, must not leak `human-a`'s sources
into `human-b`'s presentation, and `human-b`'s own toggle state starts
disabled (matching the existing `supplyOverlayEnabledByViewer` per-viewer map
convention, `render-loop.ts:332`).

**`tests/renderer/render-loop-wrap.test.ts`** — add after the existing
air-defense hot-seat-handoff test (after line 205):

```ts
  it('scopes the supply overlay to the current viewer across a hot-seat handoff (#544 MR6 item 85)', () => {
    const loop = new RenderLoop(createCanvas());
    const state = {
      turn: 1,
      currentPlayer: 'human-a',
      map: { width: 5, height: 3, wrapsHorizontally: false, tiles: {}, rivers: [] },
      tribalVillages: {}, minorCivs: {}, units: {},
      cities: {
        'human-a-city': {
          id: 'human-a-city', owner: 'human-a', position: { q: 1, r: 1 },
          buildings: [],
        },
        'human-b-city': {
          id: 'human-b-city', owner: 'human-b', position: { q: 3, r: 1 },
          buildings: [],
        },
      },
      civilizations: {
        'human-a': { color: '#4a90d9', visibility: { tiles: {} } },
        'human-b': { color: '#ef4444', visibility: { tiles: {} } },
      },
    } as unknown as GameState;

    loop.setGameState(state);
    expect(loop.toggleSupplyOverlay()).toBe(true);
    expect(loop.isSupplyOverlayEnabled('human-a')).toBe(true);
    // SupplyOverlaySource has no owner field (src/systems/supply-overlay-presentation.ts:16-18)
    // -- the presentation function itself already guarantees viewer-only sources
    // (tests/systems/supply-overlay-presentation.test.ts covers that). This
    // RenderLoop-level test's job is narrower: prove the *coordinate* set
    // reflects human-a's own city, not a stale/hardcoded viewer.
    const presentationForA = (loop as unknown as {
      supplyOverlayPresentation: { sources: Array<{ coord: { q: number; r: number } }> };
    }).supplyOverlayPresentation;
    expect(presentationForA.sources.some(s => s.coord.q === 1 && s.coord.r === 1)).toBe(true);
    expect(presentationForA.sources.some(s => s.coord.q === 3 && s.coord.r === 1)).toBe(false);

    loop.setGameState({ ...state, currentPlayer: 'human-b' });

    // human-b never toggled the overlay on -- their own per-viewer flag must
    // start disabled, not inherit human-a's enabled state.
    expect(loop.isSupplyOverlayEnabled('human-b')).toBe(false);
    // setGameState only recomputes supplyOverlayPresentation when the *current*
    // viewer has it enabled (render-loop.ts:521) -- human-b doesn't, so the
    // stale human-a presentation must not still be attached as human-b's view.
    expect(loop.toggleSupplyOverlay()).toBe(true);
    const presentationForB = (loop as unknown as {
      supplyOverlayPresentation: { sources: Array<{ coord: { q: number; r: number } }> };
    }).supplyOverlayPresentation;
    expect(presentationForB.sources.some(s => s.coord.q === 3 && s.coord.r === 1)).toBe(true);
    expect(presentationForB.sources.some(s => s.coord.q === 1 && s.coord.r === 1)).toBe(false);
  });
```

`civilizations['human-a']`/`'human-b'` above will need a real
`techState`/`diplomacy` shape if `getCivSupplySourceCandidates` reads more
than `visibility`/`color` — check that function's actual field reads (and
whatever `fog-of-war.ts:getVisibility` needs from `civilizations[x].visibility`)
against this minimal fixture before trusting it compiles and passes; extend
the fixture with whatever it turns out to need, following the pattern the
existing air-defense hot-seat test above already uses for its own minimal
fixture.

---

### Task 2: Item 88 — same-turn save/load exactness

**`tests/storage/save-persistence.test.ts`** — add a new describe block at the
end of the file (after line 869's closing test, before the final `});`):

```ts
describe('#544 MR6 item 88 — same-turn save/load exactness', () => {
  it('round-trips mid-round General-command and supply state exactly, not just at a clean turn boundary', async () => {
    const state = createHotSeatGame({
      playerCount: 2,
      mapSize: 'small',
      players: [
        { name: 'Alice', slotId: 'player-1', civType: 'egypt', isHuman: true },
        { name: 'Bob', slotId: 'player-2', civType: 'rome', isHuman: true },
      ],
    }, 'mr6-mid-round-save');
    state.currentPlayer = 'player-1';

    const civ1 = state.civilizations['player-1']!;
    // Hot-seat civs start with only a settler, no founded city -- found one
    // (see the existing "round-trips occupied city state" test above for the
    // same foundCity precedent).
    const capital = { ...foundCity('player-1', { q: 2, r: 2 }, state.map, mkC()), id: 'mr6-capital' };
    state.cities = { ...state.cities, [capital.id]: capital };
    civ1.cities = [capital.id];
    const general = {
      ...createUnit('great_general', 'player-1', capital.position, mkC()),
      id: 'mid-round-general',
      generalDefinitionId: 'gen_caesar',
      generalCommandChargesUsed: 1,
      generalCommandCooldownUntilTurn: state.turn + 2,
      rallyProtectedThisRound: true,
    };
    const strainedUnit = {
      ...createUnit('warrior', 'player-1', capital.position, mkC()),
      id: 'mid-round-strained',
      landSupply: { state: 'severe' as const, hostileUnsupportedTurns: 3, suppliedTurnsSinceRecovery: 0 },
    };
    state.units = { ...state.units, [general.id]: general, [strainedUnit.id]: strainedUnit };
    state.civilizations['player-1']!.units = [...civ1.units, general.id, strainedUnit.id];
    state.civilizations['player-1']!.generalHistory = [
      { unitId: general.id, generalDefinitionId: 'gen_caesar', spawnedTurn: state.turn },
    ];
    // player-2 hasn't acted yet this round -- exactly the "not a clean turn
    // boundary" shape a manual mid-round save can capture.
    state.pendingGeneralCandidateChoices = [
      { civId: 'player-2', candidateDefinitionIds: ['gen_hannibal', 'gen_boudica'], triggerEventLabel: 'city:captured' },
    ];

    const before = structuredClone(state);

    await saveGame('slot-mr6-mid-round', 'Mid Round Save', state);
    const loaded = await loadGame('slot-mr6-mid-round');

    expect(loaded?.units[general.id]).toEqual(before.units[general.id]);
    expect(loaded?.units[strainedUnit.id]?.landSupply).toEqual(before.units[strainedUnit.id]!.landSupply);
    expect(loaded?.pendingGeneralCandidateChoices).toEqual(before.pendingGeneralCandidateChoices);
    expect(loaded?.currentPlayer).toBe('player-1');
  });
});
```

This requires `createHotSeatGame` and `createUnit` imports already present at
the top of the file (`createUnit` is not currently imported — add it
alongside the existing `createHotSeatGame, createNewGame` import). Run this
test first before writing Tasks 3-5; if any field comes back mutated,
stripped, or defaulted, that is a real bug to fix in this task (in
`save-manager.ts`'s normalization path), not just a test to add — per the
handoff's explicit instruction for this item.

---

### Task 3: Item 86 — extract `getPendingGeneralChoiceForViewer` and regression-test it

**`src/systems/great-general-system.ts`** — add after
`checkAndQueueGeneralCandidateChoice` (after line 145), no behavior change,
just naming the existing inline filter so it has a direct test seam:

```ts
/**
 * #544 MR6: the read-side counterpart to checkAndQueueGeneralCandidateChoice
 * above -- extracted from bootstrap.ts's maybeShowPendingGeneralChoice so the
 * viewer-safety filter (an AI civ's or an inactive hot-seat player's pending
 * choice must never surface) has a direct unit-test seam, matching this
 * codebase's established *ForViewer presentation-helper convention. No
 * behavior change from the inline version it replaces.
 */
export function getPendingGeneralChoiceForViewer(
  state: GameState,
  viewerId: string,
): PendingGeneralCandidateChoice | undefined {
  return (state.pendingGeneralCandidateChoices ?? []).find(choice => choice.civId === viewerId);
}
```

**`src/app/bootstrap.ts`** — replace the inline filter in
`maybeShowPendingGeneralChoice` (lines 172-175):

```ts
  function maybeShowPendingGeneralChoice(): void {
    const pending = getPendingGeneralChoiceForViewer(session.getState(), session.getState().currentPlayer);
    if (!pending) return;
```

Add `getPendingGeneralChoiceForViewer` to the existing
`@/systems/great-general-system` import at the top of `bootstrap.ts`.

**`tests/systems/great-general-system.test.ts`** — add:

```ts
describe('getPendingGeneralChoiceForViewer (#544 MR6 item 86)', () => {
  it('returns the pending choice queued for the current viewer', () => {
    const state = createNewGame('rome', 'mr6-viewer-choice-match', 'small');
    state.pendingGeneralCandidateChoices = [
      { civId: 'player', candidateDefinitionIds: ['gen_caesar'], triggerEventLabel: 'city:captured' },
    ];

    const result = getPendingGeneralChoiceForViewer(state, 'player');

    expect(result?.civId).toBe('player');
  });

  it('returns undefined for a pending choice queued for a different civ (AI or inactive hot-seat player)', () => {
    const state = createNewGame('rome', 'mr6-viewer-choice-mismatch', 'small');
    state.pendingGeneralCandidateChoices = [
      { civId: 'ai-1', candidateDefinitionIds: ['gen_hannibal'], triggerEventLabel: 'city:captured' },
    ];

    expect(getPendingGeneralChoiceForViewer(state, 'player')).toBeUndefined();
  });

  it('returns undefined when nothing is pending', () => {
    const state = createNewGame('rome', 'mr6-viewer-choice-empty', 'small');

    expect(getPendingGeneralChoiceForViewer(state, 'player')).toBeUndefined();
  });
});
```

Check `tests/systems/great-general-system.test.ts`'s existing imports before
adding — `createNewGame` and `getPendingGeneralChoiceForViewer` (the latter
newly exported above) both need to be in scope.

---

### Task 4: Item 87 — pending intents cleared on handoff

**4a — store-level, `tests/app/selection-store.test.ts`**, add after the
existing "clear() preserves a pending city-capture choice" test (after line
92):

```ts
  it('clear() resets a pending last-stand-target intent, unlike the city-capture exception (#544 MR6 item 87)', () => {
    const store = createSelectionStore();
    store.setSelectedUnitId('general-1');
    store.setPendingIntent({ kind: 'last-stand-target', unitId: 'general-1', range: [{ q: 0, r: 0 }] });

    store.clear();

    expect(store.getPendingIntent()).toEqual({ kind: 'none' });
  });
```

**4b — integration-level, `tests/app/controllers/turn-flow-controller.test.ts`**,
add inside `describe('endTurn — hot-seat mode', ...)` (after the existing test
starting at line 258):

```ts
    it('clears a pending last-stand-target intent before the next hot-seat player can act (#544 MR6 item 87)', async () => {
      const state = makeHotSeatFixture();
      const selection = createSelectionStore();
      selection.setPendingIntent({ kind: 'last-stand-target', unitId: 'some-general', range: [] });
      const deps = baseDeps(state, {
        selection,
        // Wire the REAL deselectUnit -> selection.clear() contract instead of
        // baseDeps's default vi.fn() -- this test exists specifically to
        // prove that wiring runs before handoff, not just that some mock was
        // called.
        deselectUnit: () => selection.clear(),
      });
      const turnFlow = createTurnFlowController(deps);

      const endTurnPromise = turnFlow.endTurn();
      // deselectUnit() runs synchronously before the first await inside
      // endTurn (turn-flow-controller.ts:696, ahead of the awaited
      // beginHotSeatHandoff at :701) -- check this immediately, before the
      // handoff UI even appears, not just "eventually true" once the whole
      // promise settles. (Added in post-implementation review -- the
      // original draft only checked the end state, which would also pass if
      // clearing happened for an unrelated reason after handoff.)
      expect(selection.getPendingIntent()).toEqual({ kind: 'none' });

      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-confirm')?.click();
      await flushMicrotasks();
      document.querySelector<HTMLButtonElement>('#handoff-start')?.click();
      await flushMicrotasks();
      await endTurnPromise;

      expect(selection.getPendingIntent()).toEqual({ kind: 'none' });
    });
```

Confirm `createSelectionStore` is already imported in this file (it is, per
`baseDeps`'s own use at line 131) before adding.

---

### Task 5: Item 89 — extend legacy save compatibility for MR5's AI General acquisition

First, grep `CURRENT_SAVE_SCHEMA_VERSION`'s live value in
`src/storage/save-migrations.ts` and confirm MR5 did not bump it (per the
Drift Check section above) before writing this test — if it *did* change
since this plan was written, this task's premise is wrong and needs
re-deriving, not blindly copying the code below.

**`tests/storage/save-migrations.test.ts`** — extend the existing `describe('#544
MR4 — legacy save load with no General heroic-command fields', ...)` block
(starting at line 953) with a sibling case proving an MR4-era save (no AI civ
has ever queued/resolved a `pendingGeneralCandidateChoices` entry, since that
queueing was human-only before MR5) loads cleanly and AI General acquisition
works normally going forward:

```ts
  it('#544 MR5 — an MR4-era save with no AI-queued pendingGeneralCandidateChoices entry loads cleanly, and AI General acquisition works normally from that point on', () => {
    const save = createNewGame('rome', 'mr5-legacy-ai-general-save', 'small');
    save.saveSchemaVersion = CURRENT_SAVE_SCHEMA_VERSION;
    // Deliberately no pendingGeneralCandidateChoices entry for any AI civ --
    // exactly what an MR4-era save looks like, since AI civs never queued one
    // before MR5.
    delete (save as Partial<GameState>).pendingGeneralCandidateChoices;
    const aiCivId = Object.keys(save.civilizations).find(id => id !== 'player')!;
    save.civilizations[aiCivId] = {
      ...save.civilizations[aiCivId]!,
      generalProgress: { points: 999, generalsEarned: 0 },
    };

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.pendingGeneralCandidateChoices ?? []).toEqual([]);
    const afterCheck = checkAndQueueGeneralCandidateChoice(migrated, aiCivId, 'city:captured', 1);
    expect(afterCheck.pendingGeneralCandidateChoices?.some(c => c.civId === aiCivId)).toBe(true);
  });
```

(AI civ id is looked up dynamically rather than assumed to be `'ai-1'` — safer
against `createNewGame`'s AI-slot naming, and confirmed correct by the passing
test run.)

Add `checkAndQueueGeneralCandidateChoice` to this file's existing
`@/systems/great-general-system` import if not already present (check
adjacent imports for `getHeroicCommandEligibility`, which the MR4 describe
block already imports from the same module).

---

### Task 6: Wrap-up — issue checklist, full suite, build, PR

1. Run `bash scripts/run-with-mise.sh yarn test` and
   `bash scripts/run-with-mise.sh yarn build`; both must exit 0. Re-run
   `tests/core/turn-manager-crisis.test.ts` in isolation if the known flake
   fires.
2. Post-implementation review pass (see Global Constraints) — specifically
   re-check Task 3's extraction didn't change `maybeShowPendingGeneralChoice`'s
   observable behavior (compare against the pre-extraction inline version) and
   Task 5's fixture actually represents a realistic MR4-era save (no
   AI-specific fields MR5 didn't touch were accidentally added).
3. Tick issue #544's MR6 checkbox and link the PR, in the same PR.
4. Add a `✅ merged (#PR)` annotation to the MR6 line in
   `docs/superpowers/specs/2026-08-23-issue-544-supply-generals-design.md`'s
   §10 phasing table — same pattern as the pre-MR6 tidy-up commit did for MR5
   — but only after the user authorizes the merge (do this as part of the
   same PR body/commit, not a separate follow-up, per
   `.claude/rules/spec-fidelity.md`'s "Plan Docs Must Stay Synced" section).
5. Present `finishing-a-development-branch` options and wait for explicit
   user authorization before merging — do not merge or tick the checklist
   unilaterally.

## Post-implementation review (requested pass across all dimensions)

MR6 adds no gameplay mechanic, no new UI surface, no new SFX, and no data/save
schema change — most dimensions below are correctly "N/A," not overlooked.
One real gap was found and fixed during this pass.

- **Balance / fun / new mechanics / play styles / age accessibility (7-43) /
  difficulty modes**: N/A — no mechanic, yield, cost, UI text, or difficulty
  branch was added or changed. Difficulty-mechanical-identity constraint
  reconfirmed: neither the extraction (Task 3) nor any test touches
  `opponentChallenge`/`challenge`.
- **Computer players (AI)**: Task 5's test exercises the real
  `checkAndQueueGeneralCandidateChoice` (unmodified) against an AI civ to
  prove MR5's AI General-acquisition path still works from a migrated
  MR4-era save. No AI decision logic changed.
- **UI/UX**: Task 3's extraction is behaviorally identical to the code it
  replaces — verified line-by-line (both versions call `session.getState()`
  twice, filter by the same predicate, same short-circuit on no match).
- **Architecture / extensibility**: `getPendingGeneralChoiceForViewer` lives
  in `great-general-system.ts` next to the write-side
  `checkAndQueueGeneralCandidateChoice` it mirrors, matching this codebase's
  established `*ForViewer` presentation-helper convention rather than
  introducing a new one.
- **Data / save-schema**: `CURRENT_SAVE_SCHEMA_VERSION` unchanged (19); no
  migration added, none needed.
- **SFX**: N/A — no new SFX-triggering code path.
- **Updating saved games (items 88-89)**: both new tests pass; Task 2's
  mid-round exactness test found no bug (confirms, doesn't just assume).
  Testing-infrastructure note (not a regression, not fixed here): every
  `saveGame`/`loadGame` test in `save-persistence.test.ts`, including this
  MR's, round-trips through a mocked in-memory `Map` (`vi.mock('@/storage/db')`
  at the top of the file) rather than real IndexedDB structured-clone
  serialization, so a field that silently fails to survive real storage
  serialization (e.g. `undefined`, a class instance) wouldn't necessarily be
  caught by this convention. This is pre-existing across the whole file, not
  introduced by MR6, and fixing the mock's fidelity is out of scope here.
- **Proper testing / regressions, solo vs. hot-seat**: found one real gap in
  the first draft: Task 4b's item-87 test originally only asserted the
  pending intent was gone *after* `endTurn()`'s promise fully resolved, which
  would also pass if clearing happened for an unrelated reason after handoff
  rather than via the `deselectUnit()` call the test claims to prove. Fixed
  by asserting immediately after calling `endTurn()` (before any await),
  since `deselectUnit()` runs synchronously ahead of the awaited
  `beginHotSeatHandoff` call (`turn-flow-controller.ts:696` vs `:701`) — now
  proves the actual ordering claim, not just eventual truth. Solo mode is
  unaffected by any change in this MR (the extraction and all five new/
  extended tests are hot-seat- or save-path-specific).
- **Proper implementation**: full suite (8883 tests) and production build
  both green after the fix above; no `check-src-edit` hook feedback on any
  edited `src/` file.
