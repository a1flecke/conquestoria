# #545 MR7 — Superweapons Setting & Off-Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. **Do not use superpowers:subagent-driven-development or any other multi-agent workflow — this repository's CLAUDE.md forbids subagents/parallel agents for all work; execute every task inline in the current session.** Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `GameSettings.superweapons?: 'off' | 'on'`, gate every strategic-deterrence verb behind it at the functions whose own existing contract is already "is this available right now" (never the historical-fact functions), wire solo/hot-seat/mid-game setting resolution, and rewrite the 6 affected entity descriptions to stay honest when off.

**Architecture:** One new pure predicate (`isSuperweaponsEnabled`, backed by `resolveSuperweaponsFlag`, mirroring `world-pressure-flags.ts`'s exact shape) is the single source of truth. It is checked directly inside 4 existing functions whose documented contract already means "currently usable" (`getArsenalStatus`, `getEligibleStrategicLaunchPlatforms`, `hasArmsControlTreaty`, `hasKnownStrategicCapability`) — never inside the historical-fact functions (`hasManhattanProject`, `getStrategicArsenalCapacity`), which stay pure. Two additional direct-read call sites that bypass those chokepoints (`strategicArsenalValueScore`'s AI scoring, and the HUD/city-panel display paths that call `getStrategicArsenalCapacity` directly) get their own explicit checks. See the design doc for the full reasoning: `docs/superpowers/specs/2026-08-27-issue-545-mr7-superweapons-toggle-design.md`.

**Task ordering is load-bearing, not incidental.** `resolveSuperweaponsFlag`'s legacy-save default is deliberately `'off'` — but the overwhelming majority of this codebase's existing tests build their `GameState` fixture either via `createNewGame`/`createHotSeatGame` (which route through `createDefaultSettings`) or via a raw hand-built object literal that never sets `settings.superweapons` at all. Task 2 (new games default to `'on'`) MUST land before any gating task (Tasks 4–8), or every `createNewGame`-based pre-MR7 test exercising a gated function silently starts asserting against `'off'` behavior it never anticipated. Even after Task 2, raw hand-built fixtures (which don't go through `createDefaultSettings`) still resolve to `'off'` and need their **one shared fixture helper** (not each individual test) fixed — each gating task's own steps include this as a required, not optional, sub-step, following the exact "fix the shared fixture once" precedent MR6 Task 11 established for a same-shaped problem (`getActiveArmsControlCap`'s `treaties` fallback).

## Global Constraints

- Never use `Math.random()` — not applicable here (no new randomness).
- Never hardcode `'player'` — not applicable here (no new per-player ownership checks beyond existing `state.currentPlayer` usage already in touched files).
- Every new `document.createElement('button')` needs `createGameButton()` or explicit style with `background`+`color`+`min-height:44px`.
- Immutable state updates only — spread-copy, never direct mutation.
- Full suite (`yarn test`) and `yarn build` must pass clean before the final commit.

---

### Task 1: Data model — `GameSettings.superweapons` field + `superweapons-flag.ts` resolver

**Files:**
- Modify: `src/core/types.ts`
- Create: `src/systems/superweapons-flag.ts`
- Test: `tests/systems/superweapons-flag.test.ts`

**Interfaces:**
- Produces: `resolveSuperweaponsFlag(settings: GameSettings | undefined): 'off' | 'on'`; `isSuperweaponsEnabled(state: GameState): boolean`. Consumed by Tasks 4–8, 11.

- [ ] **Step 1: Write the failing tests**

Create `tests/systems/superweapons-flag.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSuperweaponsFlag, isSuperweaponsEnabled } from '@/systems/superweapons-flag';
import type { GameSettings, GameState } from '@/core/types';

describe('resolveSuperweaponsFlag (#545 MR7)', () => {
  it('defaults to "off" for legacy saves (undefined field)', () => {
    expect(resolveSuperweaponsFlag({} as GameSettings)).toBe('off');
    expect(resolveSuperweaponsFlag(undefined)).toBe('off');
  });

  it('passes an explicit "on" through', () => {
    expect(resolveSuperweaponsFlag({ superweapons: 'on' } as GameSettings)).toBe('on');
  });

  it('passes an explicit "off" through', () => {
    expect(resolveSuperweaponsFlag({ superweapons: 'off' } as GameSettings)).toBe('off');
  });
});

describe('isSuperweaponsEnabled (#545 MR7)', () => {
  it('is true when settings.superweapons is "on"', () => {
    const state = { settings: { superweapons: 'on' } } as unknown as GameState;
    expect(isSuperweaponsEnabled(state)).toBe(true);
  });

  it('is false when settings.superweapons is undefined (legacy save)', () => {
    const state = { settings: {} } as unknown as GameState;
    expect(isSuperweaponsEnabled(state)).toBe(false);
  });

  it('is false when settings.superweapons is explicitly "off"', () => {
    const state = { settings: { superweapons: 'off' } } as unknown as GameState;
    expect(isSuperweaponsEnabled(state)).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/superweapons-flag.test.ts`
Expected: FAIL (module `@/systems/superweapons-flag` does not exist)

- [ ] **Step 3: Add the field to `GameSettings`**

In `src/core/types.ts`, find:

```ts
  aiCrisisInteractions?: 'off' | 'benign' | 'full';
```

Add immediately after it:

```ts
  // #545 MR7: superweapons (nukes) toggle. Optional: legacy saves resolve to
  // 'off' via resolveSuperweaponsFlag -- deliberately NOT the same
  // "undefined inherits the live default" convention beastsMode/aiPressure
  // use, since retroactively arming an existing save with no opt-in would
  // defeat the toggle's purpose. New games set this explicitly at creation
  // time (createDefaultSettings for solo, hot-seat setup's own card) --
  // never read this field directly, always go through
  // resolveSuperweaponsFlag/isSuperweaponsEnabled.
  superweapons?: 'off' | 'on';
```

- [ ] **Step 4: Implement the resolver**

Create `src/systems/superweapons-flag.ts`:

```ts
import type { GameSettings, GameState } from '@/core/types';

/**
 * #545 MR7 spec §13. Legacy saves (field undefined) resolve to 'off' --
 * deliberately different from world-pressure-flags.ts's "undefined inherits
 * the live default" convention. New games set the field explicitly at
 * creation time (see createDefaultSettings and the hot-seat setup card), so
 * 'off' here is reached only by a save that predates this feature.
 */
export function resolveSuperweaponsFlag(settings: GameSettings | undefined): 'off' | 'on' {
  return settings?.superweapons ?? 'off';
}

/**
 * Single source of truth for "is the superweapons mechanic currently active."
 * Checked directly inside the handful of functions whose own contract is
 * already "is this available right now" (getArsenalStatus,
 * getEligibleStrategicLaunchPlatforms, hasArmsControlTreaty,
 * hasKnownStrategicCapability) -- never inside historical-fact functions
 * like hasManhattanProject or getStrategicArsenalCapacity, which must stay
 * honest regardless of this setting. See the MR7 design doc's SRP table for
 * the full reasoning.
 */
export function isSuperweaponsEnabled(state: GameState): boolean {
  return resolveSuperweaponsFlag(state.settings) === 'on';
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/superweapons-flag.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/systems/superweapons-flag.ts tests/systems/superweapons-flag.test.ts
git commit -m "feat(#545): superweapons setting data model + resolver (MR7 Task 1)"
```

---

### Task 2: New solo games default `superweapons: 'on'`

**Files:**
- Modify: `src/core/game-state.ts`
- Test: `tests/core/game-state.test.ts` (grep `grep -rn "describe('createDefaultSettings'" tests/` to confirm the exact file first)

**Interfaces:**
- Produces: `createDefaultSettings(...)` now always includes `superweapons: 'on'` unless overridden.

**This task MUST land before Tasks 4–8 (see the plan-level ordering note above) — it is what keeps the large majority of this codebase's existing `createNewGame`-based tests passing unchanged once the gating tasks land.**

- [ ] **Step 1: Write the failing test**

Add to the test file covering `createDefaultSettings`:

```ts
  it('defaults superweapons to "on" for new games (#545 MR7)', () => {
    const settings = createDefaultSettings('small');
    expect(settings.superweapons).toBe('on');
  });

  it('respects an explicit override', () => {
    const settings = createDefaultSettings('small', { superweapons: 'off' });
    expect(settings.superweapons).toBe('off');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts -t "superweapons"`
Expected: FAIL (`settings.superweapons` is `undefined`)

- [ ] **Step 3: Implement**

In `src/core/game-state.ts`, find `createDefaultSettings`'s returned object (the one containing `beastsMode: 'wild'`) and add a new line directly after it:

```ts
    beastsMode: 'wild',
    superweapons: 'on',
```

(The `overrides` spread that follows later in the same function already lets any caller, including `settingsOverrides`, replace this default, matching `beastsMode`'s own override precedent.)

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/game-state.ts tests/core/game-state.test.ts
git commit -m "feat(#545): default new solo games to superweapons on (MR7 Task 2)"
```

---

### Task 3: Gate `getArsenalStatus` + `hasKnownStrategicCapability`

**Files:**
- Modify: `src/systems/strategic-arsenal-system.ts`
- Test: `tests/systems/strategic-arsenal-system.test.ts`

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1), relies on Task 2 having landed.

**This file's `makeState()` helper builds a raw `GameState` literal (`settings: {} as any`) that does NOT go through `createDefaultSettings` — it will resolve to `'off'` by default regardless of Task 2. Since the large majority of this file's ~40 existing tests call `hasKnownStrategicCapability`/`getArsenalStatus` and clearly intend on-mode behavior (none of them are testing the superweapons setting itself), Step 3 below fixes the ONE shared `makeState()` default rather than editing dozens of individual tests — same pattern MR6 Task 11 used for `strategic-arsenal-summary-presentation.test.ts`'s `treaties` fallback.**

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/strategic-arsenal-system.test.ts`, inside the existing `describe('getArsenalStatus (#545 MR6)', ...)` block (after its existing tests):

```ts
  it('atCapacity is true when superweapons is off, even with real physical capacity and zero arsenal (#545 MR7)', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'], strategicArsenal: 0 }) },
      builtNationalProjects: { 'p1:manhattan_project': { civId: 'p1', cityId: 'c1', eraBuilt: 10 } },
      cities: { c1: makeCity('c1', ['nuclear_arsenal']) },
      settings: { superweapons: 'off' } as any,
    });
    expect(getArsenalStatus(state, 'p1').atCapacity).toBe(true);
  });
```

Add a new `describe` block, after the existing `describe('hasKnownStrategicCapability (#545 MR5)', ...)` block:

```ts
describe('hasKnownStrategicCapability off-mode (#545 MR7)', () => {
  it('is false when superweapons is off, even with contact and a real Manhattan Project', () => {
    const state = makeState({
      civilizations: {
        viewer: makeCiv({ id: 'viewer', knownCivilizations: ['owner'] }),
        owner: makeCiv({ id: 'owner', knownCivilizations: ['viewer'] }),
      },
      builtNationalProjects: { 'owner:manhattan_project': { civId: 'owner', cityId: 'c1', eraBuilt: 10 } },
      settings: { superweapons: 'off' } as any,
    });
    expect(hasKnownStrategicCapability(state, 'viewer', 'owner')).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-system.test.ts`
Expected: FAIL (off-mode still returns the on-mode answer — the gate doesn't exist yet)

- [ ] **Step 3: Fix the shared `makeState()` default, then implement**

In `tests/systems/strategic-arsenal-system.test.ts`, find `makeState()`'s returned literal (`settings: {} as any,`) and change it to:

```ts
    settings: { superweapons: 'on' } as any,
```

This is required *before* Step 4's implementation, or every one of this file's ~40 pre-existing tests (which never anticipated this setting) will start failing once the gate below lands — they all implicitly assume on-mode behavior.

In `src/systems/strategic-arsenal-system.ts`, add the import:

```ts
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
```

Update `hasKnownStrategicCapability`:

```ts
export function hasKnownStrategicCapability(
  state: GameState,
  viewerCivId: string,
  ownerCivId: string,
): boolean {
  if (!isSuperweaponsEnabled(state)) return false;
  return hasMetCivilization(state, viewerCivId, ownerCivId)
    && hasManhattanProject(state, ownerCivId);
}
```

Update `getArsenalStatus`:

```ts
export function getArsenalStatus(state: GameState, civId: string): { hasManhattanProject: boolean; atCapacity: boolean } {
  if (!isSuperweaponsEnabled(state)) {
    return { hasManhattanProject: hasManhattanProject(state, civId), atCapacity: true };
  }
  const civ = state.civilizations[civId];
  const current = civ ? getStrategicArsenal(civ) : 0;
  const physicalCap = getStrategicArsenalCapacity(state, civId);
  const treatyCap = getActiveArmsControlCap(state, civId);
  const effectiveCap = treatyCap !== null ? Math.min(physicalCap, treatyCap) : physicalCap;
  return {
    hasManhattanProject: hasManhattanProject(state, civId),
    atCapacity: current >= effectiveCap,
  };
}
```

- [ ] **Step 4: Run the full file's tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-arsenal-system.test.ts`
Expected: PASS — all ~40+ tests, both new and pre-existing.

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. If any *other* file's pre-existing test now fails because it builds a raw `GameState`/`Civilization` fixture that reaches `hasKnownStrategicCapability` or `getArsenalStatus` without going through `createNewGame` and without setting `settings.superweapons`, apply the same fix there: find that file's ONE shared fixture helper and default it to `settings: { superweapons: 'on' } as any }`, not each individual test. Do not skip this full-suite run — Task 3's blast radius is not fully knowable from this file alone.

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-arsenal-system.ts tests/systems/strategic-arsenal-system.test.ts
git commit -m "feat(#545): gate getArsenalStatus + hasKnownStrategicCapability on superweapons setting (MR7 Task 3)"
```

(If Step 4's full-suite run required fixing another file's shared fixture, `git add` that file too and note it in the commit message.)

---

### Task 4: Gate `getEligibleStrategicLaunchPlatforms`

**Files:**
- Modify: `src/systems/strategic-launch-system.ts`
- Test: `tests/systems/strategic-launch-system.test.ts`

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1), relies on Task 2 having landed.

- [ ] **Step 1: Write the failing test**

First, read this file's existing `makeState`/`makeCiv`/`makeCity` (or equivalent) fixture helpers in full — grep `grep -n "^function make" tests/systems/strategic-launch-system.test.ts` — and confirm whether they build via `createNewGame` (already covered by Task 2) or a raw literal (needs the same `settings: { superweapons: 'on' } as any` default fix Task 3 applied, in its own shared helper here). Do not assume; this file may differ from `strategic-arsenal-system.test.ts`'s convention.

Add a new `describe` block using whatever pattern that grep confirms:

```ts
describe('getEligibleStrategicLaunchPlatforms off-mode (#545 MR7)', () => {
  it('returns empty when superweapons is off, even with a real missile_silo', () => {
    const state = makeState({
      civilizations: { p1: makeCiv({ cities: ['c1'] }) },
      cities: { c1: makeCity('c1', ['missile_silo']) },
      settings: { superweapons: 'off' } as any,
    });
    expect(getEligibleStrategicLaunchPlatforms(state, 'p1')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-launch-system.test.ts`
Expected: FAIL (off-mode still returns a real platform)

- [ ] **Step 3: Fix the shared fixture default if needed, then implement**

If Step 1 found a raw (non-`createNewGame`) fixture helper without a `settings.superweapons` default, fix it the same way Task 3 did, in this file, before proceeding.

In `src/systems/strategic-launch-system.ts`, add the import:

```ts
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
```

Update `getEligibleStrategicLaunchPlatforms`:

```ts
export function getEligibleStrategicLaunchPlatforms(state: GameState, civId: string): StrategicLaunchPlatform[] {
  if (!isSuperweaponsEnabled(state)) return [];

  const platforms: StrategicLaunchPlatform[] = [];
  // ...rest of the function body unchanged
```

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/strategic-launch-system.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — same reactive-fixture-fix caveat as Task 3 Step 4 applies here too (basic-ai.ts's cheap `if (getEligibleStrategicLaunchPlatforms(...).length > 0)` guard before calling AI launch doctrine is a likely place a pre-existing MR5 test could be affected if its fixture never set `settings.superweapons`).

- [ ] **Step 5: Commit**

```bash
git add src/systems/strategic-launch-system.ts tests/systems/strategic-launch-system.test.ts
git commit -m "feat(#545): gate getEligibleStrategicLaunchPlatforms on superweapons setting (MR7 Task 4)"
```

---

### Task 5: Gate `hasArmsControlTreaty`

**Files:**
- Modify: `src/systems/diplomacy-system.ts`
- Test: `tests/systems/diplomacy-system.test.ts`

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1), relies on Task 2 having landed.

**This file's tests predominantly use `createNewGame`/`createDiplomacyState`, already covered by Task 2 — verify with `grep -n "^function makeWarState\|createDiplomacyState(civIds" tests/systems/diplomacy-system.test.ts` before assuming no fixture fix is needed here.**

- [ ] **Step 1: Write the failing tests**

Add to `tests/systems/diplomacy-system.test.ts`'s existing `describe('hasArmsControlTreaty (#545 MR6)', ...)` block:

```ts
    it('is false when superweapons is off, even with the national project built (#545 MR7)', () => {
      const state = createNewGame(undefined, 'arms-control-np-test-off', 'small');
      state.builtNationalProjects = { 'player:arms_control_treaty': { civId: 'player', cityId: 'c1', eraBuilt: 11 } };
      state.settings.superweapons = 'off';
      expect(hasArmsControlTreaty(state, 'player')).toBe(false);
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: FAIL (off-mode still returns true)

- [ ] **Step 3: Implement**

In `src/systems/diplomacy-system.ts`, add the import:

```ts
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
```

Update `hasArmsControlTreaty`:

```ts
export function hasArmsControlTreaty(state: GameState, civId: string): boolean {
  if (!isSuperweaponsEnabled(state)) return false;
  return state.builtNationalProjects?.[`${civId}:arms_control_treaty`] !== undefined;
}
```

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/diplomacy-system.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS. `getAvailableActions`'s `arms_control_pact` gate, `evaluateDiplomacy`'s AI proposing branch, and `basic-ai.ts`'s execution case all consume this function's result indirectly through the `hasArmsControlTreaty: boolean` parameter already threaded by MR6 — none of their own tests call the real `hasArmsControlTreaty` function directly (they pass the boolean explicitly), so this gate should have zero blast radius beyond this file. If the full-suite run disagrees, investigate before assuming a fixture fix is the answer here.

- [ ] **Step 5: Commit**

```bash
git add src/systems/diplomacy-system.ts tests/systems/diplomacy-system.test.ts
git commit -m "feat(#545): gate hasArmsControlTreaty on superweapons setting (MR7 Task 5)"
```

---

### Task 6: ~~Gate `strategicArsenalValueScore` (AI scoring)~~ — SKIPPED, verified unreachable during execution

**Found during execution:** the original design review claimed `strategicArsenalValueScore` scores `nuclear_arsenal`/`missile_silo` by war count, creating a "phantom AI incentive" when off. Verified directly against `BUILDINGS` in `city-system.ts`: `arsenalCapacityGated: true` is set on `warhead` **only** — `nuclear_arsenal`/`missile_silo` never carry it, so `strategicArsenalValueScore` returns 0 for them unconditionally regardless of this setting (confirmed by this file's own pre-existing `'is 0 for a building with no arsenalCapacityGated capability, even at war'` test). Since `strategicArsenalValueScore` is only ever invoked on items already returned by `getAvailableBuildings`, and Task 3's `getArsenalStatus` gate already excludes `warhead` from that list whenever off (`atCapacity: true`), there is no reachable code path left for a phantom incentive to leak through `strategicArsenalValueScore` at all — the original design-review finding was factually wrong. No gate was added to `strategicArsenalValueScore`; a regression test instead confirms `warhead` never reaches the candidate list when off (added to `tests/ai/ai-production.test.ts`'s `describe('strategicArsenalValueScore (#545)', ...)` block), proving Task 3 alone is sufficient here.

~~**Files:**~~
~~- Modify: `src/ai/ai-production.ts`~~
~~- Test: `tests/ai/ai-production.test.ts`~~

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1), relies on Task 2 having landed.

**This file's `setupState()` helper is built on `createNewGame`, already covered by Task 2 — no separate fixture fix expected, but confirm with `grep -n "^function setupState" tests/ai/ai-production.test.ts` before assuming.**

- [ ] **Step 1: Write the failing test**

First, read this file's existing `strategicArsenalValueScore` test in full (grep `grep -n "describe('strategicArsenalValueScore" tests/ai/ai-production.test.ts`) to confirm the exact field name used to read the score off a candidate (`candidate.strategicArsenalValueScore`) and the exact fixture pattern (`setupState`, `grantResources`, `aggressive`) — match it verbatim.

Add to that `describe` block:

```ts
  it('scores 0 for an arsenalCapacityGated building when superweapons is off, regardless of war count (#545 MR7)', () => {
    const state = setupState(['nuclear-weapons']);
    state.settings.superweapons = 'off';
    state.civilizations['ai-1']!.diplomacy.atWarWith = ['player', 'ai-2', 'ai-3'];
    state.builtNationalProjects = {
      'ai-1:manhattan_project': { civId: 'ai-1', cityId: 'city-a', eraBuilt: 10 },
    };

    const candidates = generateAIProductionCandidates(state, 'ai-1', 'city-a', [], aggressive);
    const nuclearArsenal = candidates.find(c => c.itemId === 'nuclear_arsenal');
    expect(nuclearArsenal?.strategicArsenalValueScore ?? 0).toBe(0);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-production.test.ts -t "superweapons is off, regardless of war count"`
Expected: FAIL (score is still non-zero)

- [ ] **Step 3: Implement**

In `src/ai/ai-production.ts`, add the import:

```ts
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
```

Update `strategicArsenalValueScore`:

```ts
function strategicArsenalValueScore(state: GameState, civId: string, buildingId: string): number {
  const building = BUILDINGS[buildingId];
  if (!building?.arsenalCapacityGated) return 0;
  if (!isSuperweaponsEnabled(state)) return 0;
  const civ = state.civilizations[civId];
  const warCount = Math.min(civ?.diplomacy.atWarWith.length ?? 0, STRATEGIC_ARSENAL_VALUE_MAX_WARS);
  return warCount * STRATEGIC_ARSENAL_VALUE_PER_WAR;
}
```

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-production.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ai/ai-production.ts tests/ai/ai-production.test.ts
git commit -m "feat(#545): gate strategicArsenalValueScore AI signal on superweapons setting (MR7 Task 6)"
```

---

### Task 7: Gate HUD arsenal button

**Files:**
- Modify: `src/app/controllers/hud-controller.ts`
- Test: `tests/app/controllers/hud-controller.test.ts`

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1), relies on Task 2 having landed.

**`makeFixture()` in this test file is built on `createNewGame`, already covered by Task 2 — the existing `'shows the arsenal count/capacity and opens the strategic-arsenal panel on click'` test should keep passing unchanged once Task 2 has landed, since its fixture now resolves to `'on'` by default.**

- [ ] **Step 1: Write the failing test**

Add to the existing `describe('Strategic Arsenal button (#545 MR4)', ...)` block in `tests/app/controllers/hud-controller.test.ts`, using its own `makeFixture`/`withManhattanProject`/`baseDeps` helpers verbatim:

```ts
    it('is absent when superweapons is off, even with real physical capacity (#545 MR7)', () => {
      const state = makeFixture();
      withManhattanProject(state, 2);
      state.settings.superweapons = 'off';
      const deps = baseDeps(state);
      const hud = createHudController(deps);
      hud.update();
      expect(document.getElementById('hud')!.textContent).not.toContain('☢');
    });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/app/controllers/hud-controller.test.ts -t "superweapons is off"`
Expected: FAIL (button still renders)

- [ ] **Step 3: Implement**

In `src/app/controllers/hud-controller.ts`, add the import:

```ts
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
```

Find:

```ts
      if (getStrategicArsenalCapacity(state, civ.id) > 0) {
```

Change to:

```ts
      if (isSuperweaponsEnabled(state) && getStrategicArsenalCapacity(state, civ.id) > 0) {
```

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/app/controllers/hud-controller.test.ts`
Expected: PASS — both the new off-mode test and the pre-existing on-mode test (which now needs `makeFixture()`'s `createNewGame`-derived default `'on'` to still show the button; confirm it does).

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/app/controllers/hud-controller.ts tests/app/controllers/hud-controller.test.ts
git commit -m "feat(#545): gate arsenal HUD button on superweapons setting (MR7 Task 7)"
```

---

### Task 8: Gate `city-panel.ts`'s locked-item reason for warhead

**Files:**
- Modify: `src/ui/city-panel.ts`
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1), relies on Task 2 having landed and Task 3's `getArsenalStatus` gate.

**Note:** `getAvailableBuildings`'s own warhead-eligibility gate already inherits Task 3's fix automatically (it consumes `getArsenalStatus(state, city.owner)`, already gated) — no separate change needed there. `city-panel.ts`'s `arsenalStatusLine` function (the "always-visible Arsenal: N/M" line) only ever runs for items in the *available* list; once Task 3 forces `atCapacity: true`, `warhead` never appears there in off-mode, so that specific function needs no change. The one planned city-panel change is `getLockedItemReason`'s warhead branch, which *does* get reached once warhead is always in the locked list when off. `makeWonderPanelFixture()` in this test file is built on `createNewGame`, already covered by Task 2.

**Found during execution: a second, adjacent gap.** The "Prepare Strategic Launch" section (§14 stage 1, a separate block from the build queue) gates its own visibility purely on `city.buildings.includes('missile_silo')` — a raw building check that completely bypasses `getEligibleStrategicLaunchPlatforms` (Task 4's gate). When off, this left a real "Strategic Arsenal: N/M warheads" count and a clickable `Prepare Strategic Launch` button visible — a dead-end action per `.claude/rules/end-to-end-wiring.md`'s "every user action needs visible feedback" and `.claude/rules/incremental-mr-completion.md`'s "a button that does nothing is a bug" (the deeper `getStrategicLaunchLegality` check would still block an actual launch since it depends on the already-gated platform list, but the button and count themselves stayed misleadingly present). Fixed by adding `isSuperweaponsEnabled(state) &&` to this section's own visibility condition, with a matching regression test.

- [ ] **Step 1: Write the failing test**

Add to `tests/ui/city-panel.test.ts`'s `describe('city-panel warhead arsenal visibility (#545)', ...)` block:

```ts
  it('the locked-item reason for warhead reflects the setting, not a stale capacity number, when superweapons is off (#545 MR7)', () => {
    const { container, city, state } = makeWonderPanelFixture();
    const civId = state.currentPlayer;
    state.civilizations[civId].techState.completed.push('nuclear-weapons', 'nuclear-physics');
    state.marketplace = { ...createMarketplaceState(), purchasedResources: [
      { civId, resource: 'uranium', expiresOnTurn: state.turn + 1 },
    ] };
    city.buildings.push('nuclear_arsenal', 'missile_silo');
    state.builtNationalProjects = {
      [`${civId}:manhattan_project`]: { civId, cityId: city.id, eraBuilt: 10 },
    };
    state.civilizations[civId].strategicArsenal = 0;
    state.settings.superweapons = 'off';

    const panel = createCityPanel(container, city, state, {
      onBuild: () => {}, onOpenWonderPanel: () => {}, onClose: () => {},
    });

    expect(collectText(panel)).not.toContain('Arsenal at capacity');
    expect(collectText(panel)).not.toMatch(/Arsenal at \d+\/\d+/);
    expect(collectText(panel).toLowerCase()).toContain('superweapons');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts -t "superweapons is off"`
Expected: FAIL (falls through to the physical-capacity message, since `hasManhattanProject` is real-true and `getStrategicArsenalCapacity`/`getActiveArmsControlCap` are unaffected by this setting)

- [ ] **Step 3: Implement**

In `src/ui/city-panel.ts`, add the import:

```ts
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';
```

Update `getLockedItemReason`'s warhead branch — find:

```ts
  function getLockedItemReason(item: typeof lockedItems[number]): string {
    if (item.id === 'warhead') {
      if (!hasManhattanProject(state, city.owner)) {
```

Change to:

```ts
  function getLockedItemReason(item: typeof lockedItems[number]): string {
    if (item.id === 'warhead') {
      if (!isSuperweaponsEnabled(state)) {
        return 'Superweapons are turned off for this game. Enable them from the pause menu Settings to build this.';
      }
      if (!hasManhattanProject(state, city.owner)) {
```

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts`
Expected: PASS

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(#545): gate warhead locked-item reason on superweapons setting (MR7 Task 8)"
```

---

### Task 9: Fix `createHotSeatGame`'s dead `settingsOverrides` field + add the hot-seat setup card

**Files:**
- Modify: `src/core/game-state.ts`
- Modify: `src/ui/hotseat-setup.ts`
- Test: `tests/core/game-state.test.ts`
- Test: `tests/ui/hotseat-setup.test.ts`

**Interfaces:**
- Produces: `HotSeatConfig.settingsOverrides?: Partial<GameSettings>` (new field, mirroring `SoloSetupConfig`'s own field of the same name), consumed by `createHotSeatGame`.

**Correction found during execution: the plan's premise here was wrong.** Plan-writing research grepped `settingsOverrides` in `types.ts` and found it at what's now line 1699 — but that field belongs to `SoloSetupConfig`, a *different*, neighboring interface, not `HotSeatConfig`. `HotSeatConfig` never had this field at all; it wasn't a "dead field `createHotSeatGame` forgot to consume," it simply didn't exist yet. The actual Step 3 fix below is therefore two changes, not one: (1) add `settingsOverrides?: Partial<GameSettings>` to `HotSeatConfig` itself in `src/core/types.ts`, then (2) spread it into `createHotSeatGame`'s settings construction (an earlier, unrelated `hotSeatSettings = createDefaultSettings(config.mapSize)` call in the same function, used only for beast-lair placement, uses a *different*, un-overridden settings object entirely — do not confuse the two). Without both, the hot-seat setup card added below would fail to compile, not just silently do nothing.

**Second correction found during execution:** `review.config` (the object passed to `callbacks.onComplete`) is built once by `buildFinalConfig()` at the top of `showFinalReview()`, *before* the card below renders. A naive card that only updates a local `superweaponsSelected` variable would have its choice silently lost — the click handler must mutate `review.config.settingsOverrides` directly, not just the local variable, or a later click on Start would still send the value `review.config` was frozen with. See the click handler below.

- [ ] **Step 1: Write the failing test**

Add to `tests/core/game-state.test.ts`'s existing `describe('createHotSeatGame', ...)` block (which already has a shared `config: HotSeatConfig` fixture at the top of the block — reuse it via spread, do not redeclare):

```ts
  it('respects settingsOverrides (#545 MR7 -- pre-existing dead field, fixed here)', () => {
    const state = createHotSeatGame(
      { ...config, settingsOverrides: { superweapons: 'off' } },
      'hs-settings-overrides-test',
    );
    expect(state.settings.superweapons).toBe('off');
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts -t "settingsOverrides"`
Expected: FAIL (`state.settings.superweapons` is `'on'`, the plain default, not the override)

- [ ] **Step 3: Implement the `createHotSeatGame` fix**

In `src/core/game-state.ts`, find:

```ts
  const settings = createDefaultSettings(config.mapSize, {
    tutorialEnabled: false,
    customCivilizations: config.customCivilizations,
  });
```

Change to:

```ts
  const settings = createDefaultSettings(config.mapSize, {
    tutorialEnabled: false,
    ...config.settingsOverrides,
    customCivilizations: config.customCivilizations,
  });
```

(`customCivilizations` stays last so it always wins over anything accidentally present in `settingsOverrides`, matching the solo `createNewGame` path's own ordering.)

- [ ] **Step 4: Run tests to verify they pass, then add the UI card**

Run: `bash scripts/run-with-mise.sh yarn test tests/core/game-state.test.ts`
Expected: PASS

Now add the setup-time card. In `src/ui/hotseat-setup.ts`, add a module-level `let superweaponsSelected: 'off' | 'on' = 'on';` near the other `let selected...` state variables (find them via `grep -n "^  let selected" src/ui/hotseat-setup.ts`).

Confirm `createGameButton`/`VARIANT_STYLES` are already imported (`grep -n "^import.*ui-kit" src/ui/hotseat-setup.ts`); if not, add `import { createGameButton, VARIANT_STYLES } from '@/ui/ui-kit';` alongside the file's other imports.

In `showFinalReview()`, before the `panel.appendChild(start);` line, insert:

```ts
    const superweaponsSection = document.createElement('div');
    superweaponsSection.style.cssText = 'max-width:520px;width:100%;margin-top:12px;';
    const superweaponsLabel = document.createElement('p');
    superweaponsLabel.textContent = 'Superweapons (nukes)';
    superweaponsLabel.style.cssText = 'margin:0 0 6px;font-size:12px;opacity:0.7;';
    superweaponsSection.appendChild(superweaponsLabel);
    const superweaponsRow = document.createElement('div');
    superweaponsRow.style.cssText = 'display:flex;gap:6px;';
    const superweaponsOptions: Array<{ value: 'on' | 'off'; label: string }> = [
      { value: 'on', label: 'On' },
      { value: 'off', label: 'Off' },
    ];
    const superweaponsButtons = new Map<'on' | 'off', HTMLButtonElement>();
    const refreshSuperweaponsButtons = (): void => {
      for (const [value, button] of superweaponsButtons) {
        const style = value === superweaponsSelected ? VARIANT_STYLES.primary : VARIANT_STYLES.secondary;
        Object.assign(button.style, style);
        button.setAttribute('aria-pressed', String(value === superweaponsSelected));
      }
    };
    for (const option of superweaponsOptions) {
      const button = createGameButton(option.label, option.value === superweaponsSelected ? 'primary' : 'secondary');
      button.dataset.superweaponsOption = option.value;
      button.addEventListener('click', () => {
        superweaponsSelected = option.value;
        refreshSuperweaponsButtons();
      });
      superweaponsButtons.set(option.value, button);
      superweaponsRow.appendChild(button);
    }
    refreshSuperweaponsButtons();
    superweaponsSection.appendChild(superweaponsRow);
    panel.appendChild(superweaponsSection);

    panel.appendChild(start);
```

Wire the selection into `buildFinalConfig()`'s returned config — find:

```ts
    return {
      config: {
      playerCount: humanPlayers.length + aiPlayers.length,
      mapSize: selectedMapSize!,
      mapScript: selectedMapScript,
      startPlacementMode: selectedPlacementMode,
      players: [...humanPlayers, ...aiPlayers],
      customCivilizations,
      },
```

Add `settingsOverrides: { superweapons: superweaponsSelected },` to that inner object, directly after `customCivilizations,`.

- [ ] **Step 5: Write and run the hot-seat setup card test**

Add to `tests/ui/hotseat-setup.test.ts`, reusing the exact navigation sequence the existing `'chooses AI count independently and previews exactly that many roster-aware opponents'` test already uses to reach `#hs-review-start`:

```ts
  it('defaults superweapons to on and threads the choice into settingsOverrides (#545 MR7)', () => {
    const onComplete = vi.fn();
    showHotSeatSetup(document.body, { onComplete, onCancel: vi.fn() });

    click('[data-size="medium"]');
    advanceThroughMapType();
    click('[data-count="2"]');
    click('[data-ai-count="2"]');
    click('#hs-names-next');
    chooseCiv('england');
    click('#hs-civ-ready');
    click('.civ-card[data-civ-id="germany"]');
    click('#civ-start');
    click('#hs-personal-challenge-next');

    expect(document.querySelector('[data-superweapons-option="on"]')?.getAttribute('aria-pressed')).toBe('true');
    click('[data-superweapons-option="off"]');
    expect(document.querySelector('[data-superweapons-option="off"]')?.getAttribute('aria-pressed')).toBe('true');
    click('#hs-review-start');

    const config = onComplete.mock.calls[0]![0];
    expect(config.settingsOverrides).toEqual({ superweapons: 'off' });
  });
```

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/hotseat-setup.test.ts`
Expected: PASS

- [ ] **Step 6: Run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/core/game-state.ts src/ui/hotseat-setup.ts tests/core/game-state.test.ts tests/ui/hotseat-setup.test.ts
git commit -m "fix(#545): wire HotSeatConfig.settingsOverrides + add hot-seat superweapons setup card (MR7 Task 9)"
```

---

### Task 10: Mid-game pause-menu toggle

**Files:**
- Modify: `src/ui/pause-menu-panel.ts`
- Modify: `src/app/controllers/game-session-controller.ts`
- Test: `tests/ui/pause-menu-panel.test.ts`

**Interfaces:**
- Consumes: `GameSettings.superweapons` (Task 1).
- Produces: `PauseMenuCallbacks.superweaponsPreference: 'off' | 'on'`; `onChangeSuperweaponsPreference: (preference: 'off' | 'on') => void`.

**This is the concrete mechanism behind the design doc's "a settings screen lets the player explicitly opt in afterward" for legacy saves, and lets anyone (solo or hot-seat) change their mind mid-game. `PauseMenuCallbacks` gains two new required fields — `makeCallbacks()` in the test file MUST get matching defaults in the same step, or every pre-existing test in this file fails to type-check.**

- [ ] **Step 1: Write the failing tests**

Add to `tests/ui/pause-menu-panel.test.ts`'s `makeCallbacks()` helper (find it via `grep -n "^function makeCallbacks" tests/ui/pause-menu-panel.test.ts`), inside its returned object, directly after the existing `onChangeSupplyWarningPreference: vi.fn(),` line:

```ts
    superweaponsPreference: 'on',
    onChangeSuperweaponsPreference: vi.fn(),
```

Add a new `describe` block, mirroring the existing `describe('#544 MR2 — supply warning preference', ...)` block's exact structure:

```ts
describe('superweapons setting (#545 MR7)', () => {
  it('renders the On/Off control and calls onChangeSuperweaponsPreference on selection', () => {
    const callbacks = makeCallbacks({ superweaponsPreference: 'on' });
    showPauseMenu(document.body, callbacks);
    const offOption = document.querySelector<HTMLElement>('[data-superweapons-option="off"]');
    if (!offOption) throw new Error('Off option not found');
    offOption.click();
    expect(callbacks.onChangeSuperweaponsPreference).toHaveBeenCalledWith('off');
  });

  it('marks the currently active preference option', () => {
    showPauseMenu(document.body, makeCallbacks({ superweaponsPreference: 'off' }));
    const offOption = document.querySelector<HTMLElement>('[data-superweapons-option="off"]');
    const onOption = document.querySelector<HTMLElement>('[data-superweapons-option="on"]');
    expect(offOption?.getAttribute('aria-pressed')).toBe('true');
    expect(onOption?.getAttribute('aria-pressed')).toBe('false');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/pause-menu-panel.test.ts`
Expected: FAIL — either a TypeScript error (missing required `PauseMenuCallbacks` fields, if `makeCallbacks()` wasn't updated) or the new tests failing to find `[data-superweapons-option]` elements. Confirm `makeCallbacks()` was updated as instructed in Step 1 before proceeding.

- [ ] **Step 3: Implement**

In `src/ui/pause-menu-panel.ts`, add to `PauseMenuCallbacks`:

```ts
  // #545 MR7: superweapons (nukes) on/off, changeable mid-game -- the
  // concrete mechanism behind a legacy save's "opt in afterward."
  superweaponsPreference: 'off' | 'on';
  onChangeSuperweaponsPreference: (preference: 'off' | 'on') => void;
```

Add a new function, modeled exactly on `buildSupplyWarningSettings`:

```ts
/** #545 MR7: mid-game superweapons on/off toggle. */
function buildSuperweaponsSettings(callbacks: PauseMenuCallbacks): HTMLElement {
  const section = document.createElement('div');
  Object.assign(section.style, {
    borderTop: '1px solid rgba(255,255,255,0.1)',
    paddingTop: '12px',
    marginTop: '12px',
  });

  const heading = document.createElement('p');
  heading.textContent = 'Superweapons';
  Object.assign(heading.style, {
    margin: '0 0 8px',
    fontSize: '11px',
    textTransform: 'uppercase',
    letterSpacing: '0.08em',
    opacity: '0.5',
    color: '#fff',
  });
  section.appendChild(heading);

  const row = document.createElement('div');
  Object.assign(row.style, { display: 'flex', gap: '6px' });

  const options: Array<{ value: 'off' | 'on'; label: string }> = [
    { value: 'on', label: 'On' },
    { value: 'off', label: 'Off' },
  ];
  let selected = callbacks.superweaponsPreference;
  const buttons = new Map<'off' | 'on', HTMLButtonElement>();

  const refreshSelection = (): void => {
    for (const [value, button] of buttons) {
      const isActive = value === selected;
      const style = isActive ? VARIANT_STYLES.primary : VARIANT_STYLES.secondary;
      Object.assign(button.style, style);
      button.setAttribute('aria-pressed', String(isActive));
    }
  };

  for (const option of options) {
    const button = createGameButton(option.label, option.value === selected ? 'primary' : 'secondary');
    button.dataset.superweaponsOption = option.value;
    button.addEventListener('click', () => {
      selected = option.value;
      refreshSelection();
      callbacks.onChangeSuperweaponsPreference(option.value);
    });
    buttons.set(option.value, button);
    row.appendChild(button);
  }
  refreshSelection();
  section.appendChild(row);

  return section;
}
```

Find where `buildSupplyWarningSettings(callbacks)` is appended (`body.appendChild(buildSupplyWarningSettings(callbacks));`) and add immediately after:

```ts
  body.appendChild(buildSuperweaponsSettings(callbacks));
```

In `src/app/controllers/game-session-controller.ts`, add the import if not already present:

```ts
import { resolveSuperweaponsFlag } from '@/systems/superweapons-flag';
```

Find the existing `supplyWarningPreference`/`onChangeSupplyWarningPreference` block and add immediately after it:

```ts
          // #545 MR7: mid-game superweapons toggle
          superweaponsPreference: resolveSuperweaponsFlag(deps.session.getState().settings),
          onChangeSuperweaponsPreference: (preference) => {
            const state = deps.session.getState();
            deps.session.setStateWithoutRefresh({
              ...state,
              settings: { ...state.settings, superweapons: preference },
            });
          },
```

- [ ] **Step 4: Run tests to verify they pass, then run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/pause-menu-panel.test.ts`
Expected: PASS — both new tests and every pre-existing test in this file (now that `makeCallbacks()` supplies the two new required fields).

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/ui/pause-menu-panel.ts src/app/controllers/game-session-controller.ts tests/ui/pause-menu-panel.test.ts
git commit -m "feat(#545): mid-game pause-menu superweapons toggle (MR7 Task 10)"
```

---

### Task 11: Content-honesty pass — off-mode descriptions for the 6 entities

**Files:**
- Modify: `src/systems/city-system.ts` (building descriptions)
- Modify: `src/systems/unit-system.ts` (`missile_submarine` UNIT_DESCRIPTIONS entry)
- Modify: `src/systems/tech-definitions*.ts` (the 4 gating techs' `unlocks` text — find the exact file via `grep -rln "nuclear-weapons\|icbm-development\|nuclear-submarines\|arms-control-negotiations" src/systems/tech-definitions*.ts`)
- Create: `src/systems/superweapon-content-honesty.ts`
- Modify: whichever UI files actually read these entities' descriptions (find via `grep -rn "\.description" src/ui/city-panel.ts src/ui/tech-panel.ts` and similar — verify against the live tree, do not assume a call site exists without checking)
- Test: `tests/systems/description-honesty.test.ts` (extend), plus a new `tests/systems/superweapon-content-honesty.test.ts`

**Interfaces:**
- Consumes: `isSuperweaponsEnabled` (Task 1).

**This task is scoped by the design doc's explicit requirement, not the earlier tasks' gameplay-gating pattern: it is a text-substitution concern at UI read time, not a new gameplay chokepoint.**

**Findings from execution:**
- Of the 5 buildings, only `manhattan_project` and `missile_silo` made a false claim when off (a capacity/launch claim); `nuclear_arsenal`, `strategic_air_command`, and `arms_control_treaty` were already honest flat-yield text with no capacity/launch/deterrence claim beyond the real yield, per the plan's own "do not add an entry for text that's already honest" guidance — verified directly, not assumed.
- `missile_submarine` (the 1 unit) did make a false launch claim, fixed.
- The description resolver's real UI read sites turned out to be `city-panel.ts` (2 sites: currently-built buildings list, build-queue list) and, for the unit, `unit-stack-panel.ts` and `selected-unit-info.ts` (both render `UNIT_DESCRIPTIONS` for an already-selected/stacked unit) — `city-panel.ts` itself never reads `UNIT_DESCRIPTIONS` directly for trainable units (it uses `getUnitRolePresentation`'s role summary instead), so no fourth site existed there.
- **The 4 gating techs' `unlocks` text was deliberately NOT wired in.** `getUnlockLines` (tech-panel.ts) doesn't currently take a `GameState`/settings parameter — wiring it in would mean threading a new parameter through that function and its callers, a larger change than this task's actual text-substitution scope. The text itself ("Atomic deterrence reshapes grand strategy," etc.) is also genuinely vaguer flavor prose, not a specific falsifiable capacity/launch claim the way the buildings/unit's real text was. Deferred as a documented scope decision, not a silent omission.
- **Unrelated bug found and NOT fixed here (flagged as a separate task instead):** `arms-control-negotiations`'s `unlocks` text says "+2 gold empire-wide," but the real `arms_control_treaty` building it gates has `civYieldBonus: { gold: 5 }`. This is a plain number mismatch, unconditionally wrong regardless of the superweapons setting — out of scope for an on/off-mode honesty pass.
- **A third instance of Task 8's "Prepare Strategic Launch" gap, found while adding a direct UI regression test for the resolver:** `selected-unit-info.ts` has its own unit-based "Prepare Strategic Launch" action (for a selected `missile_submarine`, mirroring `city-panel.ts`'s building-based one from Task 8) gated purely on `unit.type === 'missile_submarine' && unit.owner === state.currentPlayer` — no `isSuperweaponsEnabled` check, same class of dead-end-button gap. Fixed with the same one-line `isSuperweaponsEnabled(state) &&` addition, plus regression tests for both the button's absence and the description text change.

- [ ] **Step 1: Capture the real current text (baseline) and confirm exact read sites**

Run and record the output:

```bash
grep -n "id: 'manhattan_project'\|id: 'nuclear_arsenal'\|id: 'missile_silo'\|id: 'strategic_air_command'\|id: 'arms_control_treaty'" -A6 src/systems/city-system.ts
grep -n "missile_submarine" -A2 src/systems/unit-system.ts
grep -rn "nuclear-weapons\|icbm-development\|nuclear-submarines\|arms-control-negotiations" src/systems/tech-definitions*.ts | grep "unlocks:"
```

Confirm each entity's exact current `description`/`unlocks` string matches what's quoted in the design doc's "Content honesty" section (they may have drifted since the design doc was written) — treat the design doc's quoted text as a starting point, not ground truth, per `.claude/rules/spec-fidelity.md`. Note which of the 6 actually make a launch/capacity/ICBM claim beyond a plain yield — only those need an off-mode variant.

- [ ] **Step 2: Write the failing test for the resolver itself**

Create `tests/systems/superweapon-content-honesty.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveSuperweaponContentDescription } from '@/systems/superweapon-content-honesty';
import type { GameState } from '@/core/types';

function makeState(superweapons: 'off' | 'on'): GameState {
  return { settings: { superweapons } } as unknown as GameState;
}

describe('resolveSuperweaponContentDescription (#545 MR7)', () => {
  it('returns the real description unchanged when superweapons is on', () => {
    const real = 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn, +1 arsenal capacity.';
    expect(resolveSuperweaponContentDescription('missile_silo', real, makeState('on'))).toBe(real);
  });

  it('returns an honest plain-yield fallback for a known entity when superweapons is off', () => {
    const real = 'Hardened underground silo housing intercontinental ballistic missiles. +4 production per turn, +1 arsenal capacity.';
    const result = resolveSuperweaponContentDescription('missile_silo', real, makeState('off'));
    expect(result).not.toMatch(/launch|capacity|ICBM|intercontinental/i);
    expect(result).toContain('production');
  });

  it('returns the real description unchanged for an entity with no off-mode entry, regardless of setting', () => {
    const real = 'A generic building with no strategic-weapons claim.';
    expect(resolveSuperweaponContentDescription('temple', real, makeState('off'))).toBe(real);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/superweapon-content-honesty.test.ts`
Expected: FAIL (module doesn't exist)

- [ ] **Step 4: Implement the resolver**

Create `src/systems/superweapon-content-honesty.ts`:

```ts
import type { GameState } from '@/core/types';
import { isSuperweaponsEnabled } from '@/systems/superweapons-flag';

/**
 * #545 MR7 spec: entities whose real description/unlocks text makes an
 * ICBM/launch/capacity claim that becomes false once superweapons is off.
 * Off-mode text keeps only the real, still-true yield claim. Populate this
 * from Task 11 Step 1's captured baseline -- only entities that step
 * confirms actually make a false claim when off belong here; do not add an
 * entry for text that's already honest as a flat yield description.
 */
const OFF_MODE_DESCRIPTIONS: Record<string, string> = {
  missile_silo: 'Hardened underground command bunker. +4 production per turn.',
  // manhattan_project, nuclear_arsenal, strategic_air_command,
  // arms_control_treaty, missile_submarine: add entries here per Step 1's
  // findings for each entity that makes a false claim when off.
};

/**
 * Resolve an entity's display description, substituting the honest off-mode
 * fallback when superweapons is off and this entity is in the affected set.
 * `realDescription` is always the caller's normal (already-resolved) text --
 * this function never invents new copy for entities outside
 * OFF_MODE_DESCRIPTIONS.
 */
export function resolveSuperweaponContentDescription(
  entityId: string,
  realDescription: string,
  state: GameState,
): string {
  if (isSuperweaponsEnabled(state)) return realDescription;
  return OFF_MODE_DESCRIPTIONS[entityId] ?? realDescription;
}
```

- [ ] **Step 5: Run test to verify it passes, then wire the resolver into real UI read sites**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/superweapon-content-honesty.test.ts`
Expected: PASS

Using Step 1's grep results, replace each direct `building.description` / `unit.description` / tech `unlocks` string read for these 6 entities with a call to `resolveSuperweaponContentDescription(entityId, realText, state)`. For each UI file touched, add a targeted test proving the off-mode text renders (extend `tests/systems/description-honesty.test.ts` with the same on/off pair pattern as Step 2's resolver test, but asserting against the actual rendered panel text, matching that file's existing conventions).

- [ ] **Step 6: Run the full suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/systems/superweapon-content-honesty.ts tests/systems/superweapon-content-honesty.test.ts tests/systems/description-honesty.test.ts
git add <every UI file touched in Step 5 -- list them explicitly in the actual commit>
git commit -m "feat(#545): off-mode content-honesty descriptions for superweapon entities (MR7 Task 11)"
```

---

### Task 12: Full-suite verification

**Files:** none (verification only)

- [ ] **Step 1: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: PASS — full suite. Pay particular attention to:
- `tests/systems/pacing-audit.test.ts` / `pacing-reference-economy.test.ts` (unaffected — no yield/economy value changed, only gameplay-verb availability)
- `tests/systems/national-project-balance.test.ts` (unaffected — Manhattan Project/Arms Control Treaty's `civYieldBonus`/milestone shape untouched)
- Every existing MR1–MR6 test for `hasManhattanProject`, `getStrategicArsenalCapacity`, `getStrategicArsenal`, `addWarheadToArsenal`, `spendStrategicArsenal`, `computeArmsControlCap`, `getActiveArmsControlCap` — these must all still pass **unchanged**, since none of them were touched; if any regress, a gate was added somewhere it shouldn't have been (an SRP violation this plan was specifically designed to avoid).

- [ ] **Step 2: Run the production build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: PASS clean, zero TypeScript errors.

- [ ] **Step 3: Tick every checkbox in this plan document**

Go back through every task above and mark its checkboxes complete.

- [ ] **Step 4: Final commit**

```bash
git add docs/superpowers/plans/2026-08-27-issue-545-mr7-superweapons-toggle.md
git commit -m "docs(#545): mark MR7 plan doc executed, tick all task/DoD checkboxes"
```

At this point the branch is ready for the standard finishing-a-development-branch flow (push, open PR with "Part of #545" — never "Closes #545" — watch CI, request review); that is a separate decision for the user to trigger, not part of this implementation plan.
