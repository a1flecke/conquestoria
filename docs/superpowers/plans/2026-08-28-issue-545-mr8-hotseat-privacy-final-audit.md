# #545 MR8 — Hot-Seat Privacy Pass, Save/Migration Verification, Final Balance Audit Implementation Plan

> **Status: ✅ executed — this is the final MR of the #545 arc.** All 5 tasks completed inline; full test suite (9202 tests) and `yarn build` pass clean. Task 1 found and fixed the one real bug the design review predicted: `turn-flow-controller.ts`'s hot-seat handoff cleanup was missing `closeStrategicLaunchFlow`/`renderLoop.setStrategicLaunchPreview(null)`, both now added alongside the existing `closePirateWatersPanels`/`setSelectedPirateFactionId(null)` precedent. Tasks 2–4 confirmed (with direct regression tests, not just re-reading code) that the other 4 hot-seat-privacy claims, every optional save field, and the arc's cumulative balance/pacing impact were all already correct — no additional bugs found. One build-only type error (vitest doesn't type-check; `yarn build` does) was caught and fixed in Task 3's test before the final verification.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. **Do not use superpowers:subagent-driven-development or any other multi-agent workflow — this repository's CLAUDE.md forbids subagents/parallel agents for all work; execute every task inline in the current session.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix the one confirmed hot-seat privacy leak (strategic-launch flow surviving a turn handoff), add the one genuinely-missing regression test from §15's 5 claims (the other 4 already have adequate coverage — verified directly, see the design doc), add explicit save/migration regression coverage for every optional field this arc introduced, and record a final balance/pacing audit confirmation.

**Architecture:** No new gameplay systems. Task 1 extends `turn-flow-controller.ts`'s existing hot-seat handoff cleanup block (`closePirateWatersPanels`, `closeNetworkPanelsForHandoff`, `renderLoop.setSelectedPirateFactionId(null)`) with the same treatment for the strategic-launch flow, following that block's own precedent exactly. Everything else is test-only.

## Global Constraints

- Never use `Math.random()` — not applicable here.
- Never hardcode `'player'` — not applicable here (no new ownership checks).
- Immutable state updates only where state mutation is involved — not applicable here (no state-mutating code changes, only UI-cleanup wiring).
- Full suite (`yarn test`) and `yarn build` must pass clean before the final commit.

---

### Task 1: Close the strategic-launch flow on hot-seat handoff

**Files:**
- Modify: `src/ui/strategic-launch-flow.ts`
- Modify: `src/renderer/render-loop.ts` (confirm `setStrategicLaunchPreview` is already public — it is, per the design doc's citation; no change expected here beyond re-verifying, this is a read-only confirmation step)
- Modify: `src/app/controllers/turn-flow-controller.ts`
- Test: `tests/ui/strategic-launch-flow.test.ts`
- Test: `tests/app/controllers/turn-flow-controller.test.ts`

**Interfaces:**
- Produces: `closeStrategicLaunchFlow(container?: ParentNode): void`, matching `closePirateWatersPanels`'s exact signature (`src/ui/pirate-waters-panel.ts:24`). Consumed by `turn-flow-controller.ts`'s `beginHotSeatHandoff`.

- [x] **Step 1: Write the failing tests**

Add to `tests/ui/strategic-launch-flow.test.ts` (verify the exact existing `describe`/import block first — this file already has a `makeState` helper and `createStrategicLaunchFlow` import from MR4/MR7 work):

```ts
  it('closeStrategicLaunchFlow removes the panel (#545 MR8 hot-seat handoff)', () => {
    const container = document.createElement('div');
    createStrategicLaunchFlow(container, makeState(), 'p1', { onSetPreview: vi.fn(), onConfirmLaunch: vi.fn(), onClose: vi.fn() });
    expect(container.querySelector('#strategic-launch-flow')).not.toBeNull();
    closeStrategicLaunchFlow(container);
    expect(container.querySelector('#strategic-launch-flow')).toBeNull();
  });
```

Add the import: `import { createStrategicLaunchFlow, closeStrategicLaunchFlow } from '@/ui/strategic-launch-flow';` — merge with this file's existing import line for `createStrategicLaunchFlow` rather than duplicating it.

Add to `tests/app/controllers/turn-flow-controller.test.ts`'s `describe('endTurn — hot-seat mode', ...)` block, right after its existing `'suppresses the presentation gate, mutes audio, autosaves...'` test:

```ts
    it('closes the strategic-launch flow panel and clears its map preview on handoff (#545 MR8)', async () => {
      const state = makeHotSeatFixture();
      const setStrategicLaunchPreview = vi.fn();
      const testUiLayer = document.createElement('div');
      const launchPanel = document.createElement('div');
      launchPanel.id = 'strategic-launch-flow';
      testUiLayer.appendChild(launchPanel);
      const deps = baseDeps(state, {
        uiLayer: testUiLayer,
        renderLoop: fakeRenderer({ setStrategicLaunchPreview }),
      });
      const turnFlow = createTurnFlowController(deps);

      await turnFlow.endTurn();

      expect(testUiLayer.querySelector('#strategic-launch-flow')).toBeNull();
      expect(setStrategicLaunchPreview).toHaveBeenCalledWith(null);
    });
```

Before writing this, confirm `makeHotSeatFixture`'s exact name/signature and `baseDeps`'s exact `uiLayer`/`renderLoop` override shape by reading the file directly (`grep -n "function makeHotSeatFixture\|function baseDeps\|function fakeRenderer" tests/app/controllers/turn-flow-controller.test.ts`) — match them verbatim rather than guessing.

- [x] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/strategic-launch-flow.test.ts tests/app/controllers/turn-flow-controller.test.ts`
Expected: FAIL — `closeStrategicLaunchFlow` doesn't exist (TypeScript/import error) and the handoff test finds the panel/preview untouched.

- [x] **Step 3: Implement**

In `src/ui/strategic-launch-flow.ts`, add a new export near `createStrategicLaunchFlow` (after it, matching `pirate-waters-panel.ts`'s ordering where `closePirateWatersPanels` precedes `createPirateWatersPanel` — either ordering is fine, prefer appending after `createStrategicLaunchFlow` to avoid an unrelated diff to existing lines):

```ts
/** #545 MR8: hot-seat handoff must not carry a previous player's in-progress
 * strike-targeting UI onto the next player's screen — mirrors
 * closePirateWatersPanels's exact shape. */
export function closeStrategicLaunchFlow(container: ParentNode = document): void {
  container.querySelector('#strategic-launch-flow')?.remove();
}
```

In `src/app/controllers/turn-flow-controller.ts`, extend the `TurnFlowRenderer` type — find:

```ts
export type TurnFlowRenderer = Pick<RenderLoop, 'setGameState' | 'animateUnitMove' | 'setSelectedPirateFactionId'> & {
```

Change to:

```ts
export type TurnFlowRenderer = Pick<RenderLoop, 'setGameState' | 'animateUnitMove' | 'setSelectedPirateFactionId' | 'setStrategicLaunchPreview'> & {
```

Add the import:

```ts
import { closeStrategicLaunchFlow } from '@/ui/strategic-launch-flow';
```

Find the handoff cleanup block:

```ts
    closePirateWatersPanels(uiLayer);
    closeNetworkPanelsForHandoff();
    // A discovery ceremony queued (or deferred by an in-flight move animation) at the
    // instant a player ends their turn must not survive to play on the next player's
    // screen once enterViewerTurn's setBlockingOverlay(null) pumps the queues.
    ceremonies.clearForHandoff();
    renderLoop.setSelectedPirateFactionId(null);
```

Change to:

```ts
    closePirateWatersPanels(uiLayer);
    closeNetworkPanelsForHandoff();
    // A discovery ceremony queued (or deferred by an in-flight move animation) at the
    // instant a player ends their turn must not survive to play on the next player's
    // screen once enterViewerTurn's setBlockingOverlay(null) pumps the queues.
    ceremonies.clearForHandoff();
    renderLoop.setSelectedPirateFactionId(null);
    // #545 MR8: the strike-target picker (panel + blast-radius map overlay)
    // is exactly the same class of "player-owned surface that may contain
    // strategic targets" the comment above already warns about -- it was
    // missing from this list.
    closeStrategicLaunchFlow(uiLayer);
    renderLoop.setStrategicLaunchPreview(null);
```

- [x] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/strategic-launch-flow.test.ts tests/app/controllers/turn-flow-controller.test.ts`
Expected: PASS

- [x] **Step 5: Run the full suite and build**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — `fakeRenderer()`'s default mock object in `turn-flow-controller.test.ts` needs `setStrategicLaunchPreview: vi.fn()` added to its defaults (mirroring `setSelectedPirateFactionId: vi.fn()` immediately above it in that function), or every *other* pre-existing test in this file that doesn't override `renderLoop` will fail once `TurnFlowRenderer` requires this method. Add it there if the run reveals this.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS clean.

- [x] **Step 6: Commit**

```bash
git add src/ui/strategic-launch-flow.ts src/app/controllers/turn-flow-controller.ts tests/ui/strategic-launch-flow.test.ts tests/app/controllers/turn-flow-controller.test.ts
git commit -m "fix(#545): close strategic-launch flow + clear its preview on hot-seat handoff (MR8 Task 1)"
```

---

### Task 2: Strategic Arsenal panel civ-scoping regression test

**Files:**
- Test: `tests/systems/strategic-arsenal-summary-presentation.test.ts`

**Interfaces:**
- Consumes: `getStrategicArsenalSummaryPresentation` (existing, MR4/MR6/MR7).

**This file's `makeState()` helper has no `settings` field at all — `resolveSuperweaponsFlag(undefined)` resolves to `'off'`, so `platforms` (gated via `getEligibleStrategicLaunchPlatforms`, MR7) would be `[]` regardless of real building state unless the test explicitly sets `settings: { superweapons: 'on' }`. None of this file's pre-existing tests are affected (none have real platforms to begin with), but this new test does, so it must set this explicitly.**

- [x] **Step 1: Write the failing test**

Add to `tests/systems/strategic-arsenal-summary-presentation.test.ts`'s existing `describe` block, after its last test:

```ts
  it('civ A\'s presentation is unaffected by civ B\'s arsenal/platform state, even in the same multi-civ state (#545 MR8 hot-seat privacy)', () => {
    const state = makeState({
      settings: { superweapons: 'on' } as any,
      civilizations: {
        p1: {
          id: 'p1', cities: ['c1'], units: [], strategicArsenal: 1,
          diplomacy: { strategicStrikesReceivedFrom: [], treaties: [] },
        } as any,
        p2: {
          id: 'p2', cities: ['c2'], units: [], strategicArsenal: 5,
          diplomacy: { strategicStrikesReceivedFrom: [], treaties: [] },
        } as any,
      },
      cities: {
        c1: { id: 'c1', name: 'C1', owner: 'p1', position: { q: 0, r: 0 }, buildings: ['missile_silo'] } as any,
        c2: { id: 'c2', name: 'C2', owner: 'p2', position: { q: 5, r: 5 }, buildings: ['missile_silo', 'nuclear_arsenal'] } as any,
      },
      builtNationalProjects: {
        'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } as any,
        'p2:manhattan_project': { civId: 'p2', cityId: 'c2', eraBuilt: 10 } as any,
      },
    });

    const p1View = getStrategicArsenalSummaryPresentation(state, 'p1');
    expect(p1View.arsenalCount).toBe(1);
    expect(p1View.arsenalCapacity).toBe(2); // base 1 + missile_silo 1
    expect(p1View.platforms).toHaveLength(1);

    const p2View = getStrategicArsenalSummaryPresentation(state, 'p2');
    expect(p2View.arsenalCount).toBe(5);
    expect(p2View.arsenalCapacity).toBe(4); // base 1 + missile_silo 1 + nuclear_arsenal 2
    expect(p2View.platforms).toHaveLength(1);

    // The critical assertion: p1's own view never reflects p2's numbers.
    expect(p1View.arsenalCount).not.toBe(p2View.arsenalCount);
    expect(p1View.arsenalCapacity).not.toBe(p2View.arsenalCapacity);
  });
```

- [x] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-summary-presentation.test.ts -t "hot-seat privacy"`
Expected: This test should actually PASS immediately if the underlying function is already correct (per the design doc's finding that this property already holds) — the point of this step is to confirm the assertions are meaningful, not to find a bug. If it fails, investigate whether the fixture itself is wrong (e.g., an arithmetic mistake in the expected capacity numbers) before assuming the production code is broken — re-derive `arsenalCapacity` from `ARSENAL_CAPACITY_SOURCES` in `strategic-arsenal-system.ts` (base 1 + `missile_silo` 1 + `nuclear_arsenal` 2) rather than guessing.

- [x] **Step 3: Run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-summary-presentation.test.ts`
Expected: PASS — all tests in this file, both new and pre-existing.

- [x] **Step 4: Commit**

```bash
git add tests/systems/strategic-arsenal-summary-presentation.test.ts
git commit -m "test(#545): Strategic Arsenal panel hot-seat civ-scoping regression (MR8 Task 2)"
```

---

### Task 3: Save/migration verification for every arc-added optional field

**Files:**
- Test: `tests/storage/save-migrations.test.ts`

**Interfaces:**
- Consumes: `migrateSaveToCurrent`, `CURRENT_SAVE_SCHEMA_VERSION` (existing).

**This task adds no new migration code — per the design doc, every field is already optional with a correct fallback. The point is a regression test proving a save missing all of them still loads and behaves correctly, so a future change can't silently break this without a test noticing.**

- [x] **Step 1: Write the failing test**

First, confirm the current exact value of `CURRENT_SAVE_SCHEMA_VERSION` (it has changed across recent MRs, including an unrelated #547 change already on `main`): `grep -n "CURRENT_SAVE_SCHEMA_VERSION = " src/storage/save-migrations.ts`.

Add to `tests/storage/save-migrations.test.ts`, following this file's own established pattern (`createNewGame`, mutate to simulate a legacy shape, `migrateSaveToCurrent`, assert, then idempotency check):

```ts
  it('#545 legacy save with no strategic-deterrence fields at all loads and behaves correctly', () => {
    const save = createNewGame('rome', 'strategic-deterrence-legacy-migration', 'small');
    save.saveSchemaVersion = 1; // predates every #545 MR
    // Simulate a save from before #545 MR1 shipped -- delete every optional
    // field this arc introduced, even though createNewGame already sets
    // some of them (superweapons: 'on') for a brand-new game.
    delete (save.settings as Record<string, unknown>).superweapons;
    const civId = Object.keys(save.civilizations)[0]!;
    delete (save.civilizations[civId] as Record<string, unknown>).strategicArsenal;
    delete (save as Record<string, unknown>).builtNationalProjects;
    // Treaty.arsenalCap's optionality is already covered directly by MR6's
    // own 'arsenalCap is set only for arms_control_pact...' test
    // (diplomacy-system.test.ts) -- not re-tested here, since a freshly
    // created game has zero treaties to begin with (nothing to delete the
    // field from) and inventing one would test signTreaty, not migration.

    const migrated = migrateSaveToCurrent(save);

    expect(migrated.saveSchemaVersion).toBe(CURRENT_SAVE_SCHEMA_VERSION);
    // Legacy defaults: arsenal reads 0, capacity/platforms/capability all
    // resolve to their "nothing" answer, superweapons resolves 'off'.
    expect(getStrategicArsenal(migrated.civilizations[civId]!)).toBe(0);
    expect(getStrategicArsenalCapacity(migrated, civId)).toBe(0);
    expect(isSuperweaponsEnabled(migrated)).toBe(false);
    expect(getEligibleStrategicLaunchPlatforms(migrated, civId)).toEqual([]);
    expect(hasArmsControlTreaty(migrated, civId)).toBe(false);
    expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
  });
```

Add the imports:

```ts
import { getStrategicArsenal, getStrategicArsenalCapacity } from '@/systems/strategic-arsenal-system';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import { getEligibleStrategicLaunchPlatforms } from '@/systems/strategic-launch-system';
import { hasArmsControlTreaty } from '@/systems/diplomacy-system';
```

Merge with this file's existing import lines where a module is already partially imported (e.g. if `@/systems/strategic-arsenal-system` or `@/systems/diplomacy-system` already appear) rather than adding a duplicate import statement — check first.

- [x] **Step 2: Run test to verify it fails or passes meaningfully**

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts -t "no strategic-deterrence fields"`
Expected: PASS, since no migration code needs to change (the design doc's claim is that this already works by construction) — same "confirm the assertions are meaningful, don't assume a failure means broken code" caveat as Task 2. If any assertion fails, investigate whether it's the fixture or a genuine gap before changing production code.

- [x] **Step 3: Run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts`
Expected: PASS — all tests, both new and pre-existing.

- [x] **Step 4: Commit**

```bash
git add tests/storage/save-migrations.test.ts
git commit -m "test(#545): legacy-save regression for every strategic-deterrence optional field (MR8 Task 3)"
```

---

### Task 4: Balance/pacing re-audit confirmation

**Files:** none (verification + a plan-doc note only)

**No new test code — the design doc already confirmed via a baseline run that `pacing-audit.test.ts`, `pacing-reference-economy.test.ts`, `national-project-balance.test.ts`, and `wonder-definitions.test.ts` all pass (323/323) with the whole arc's changes in place. This task re-confirms that hasn't regressed since, as the very last check before the final full-suite task.**

- [x] **Step 1: Re-run the balance/pacing audit suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/pacing-audit.test.ts tests/systems/pacing-reference-economy.test.ts tests/systems/national-project-balance.test.ts tests/systems/wonder-definitions.test.ts`
Expected: PASS, matching the design doc's baseline. If anything fails, STOP and report — this plan does not include a balance retune; a failure here means something outside this plan's scope changed and needs a human decision, not a fix folded into this task.

- [x] **Step 2: Commit a plan-doc note recording the confirmation**

(This step's "commit" is folded into Task 5's final plan-doc-status commit — no separate commit needed here. Proceed directly to Task 5.)

---

### Task 5: Full-suite verification

**Files:** none (verification only)

- [x] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — full suite.

- [x] **Step 2: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS clean, zero TypeScript errors.

- [x] **Step 3: Tick every checkbox in this plan document**

Go back through every task above and mark its checkboxes complete.

- [x] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-08-28-issue-545-mr8-hotseat-privacy-final-audit.md
git commit -m "docs(#545): mark MR8 plan doc executed, tick all task/DoD checkboxes"
```

At this point the branch is ready for the standard finishing-a-development-branch flow (push, open PR with "Part of #545" — never "Closes #545" — watch CI, request review). This is also the arc's final MR: the PR body should note that once merged, issue #545 itself can be closed (a human decision, not something this plan performs automatically).
