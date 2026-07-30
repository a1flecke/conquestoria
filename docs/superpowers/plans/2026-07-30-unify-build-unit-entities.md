# Unify buildUnitEntities Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Do NOT use subagent-driven-development or spawn any subagents — this project's CLAUDE.md forbids subagents/parallel agents; execute every task inline in the current session.

**Goal:** Close issue #760 by making `buildUnitEntities()` (currently dead code, tested by 3 files
as if it were live) byte-for-byte match the real render loop's inline entity-construction logic,
then replace the real render loop's inline block with a call to it — eliminating the duplicate and
turning the 3 existing test files into real regression coverage.

**Architecture:** `buildUnitEntities` gains two new required parameters — `pirateSpriteState:
PirateSpriteStateController` and `nowMs: number` — and its `.map()` callback is extended to match
the real inline block's logic exactly (civId, pirate visual-state resolution, combat-transient
state). The render loop's own inline block is then deleted and replaced with a single call.

**Tech Stack:** TypeScript, vitest, no new dependencies.

**Design doc:** `docs/superpowers/specs/2026-07-30-unify-build-unit-entities-design.md` — full
rationale, including why a state-based signature was chosen over passing pre-computed
presentations, and the documented mutation side effect of `pirateSpriteState.resolve()`.

## Global Constraints

- `buildUnitEntities` is **not a pure function** once `pirateSpriteState` is threaded through —
  `pirateSpriteState.resolve()` mutates the controller's internal transients map on expiry. Call it
  exactly once per frame in production code; document this on the function itself.
- This is a **behavior-preserving refactor** — the live game's rendered output must not change.
  Every line moved from the inline block into `buildUnitEntities` must be copied verbatim (only
  `this.state`/`this.pirateSpriteState` become the function's own `state`/`pirateSpriteState`
  parameters).
- `selectedUnitId` keeps its existing `string | null = null` default — do not remove it. Every
  existing call site currently omits it (relying on the default); when those call sites are edited
  to add the 2 new trailing parameters, pass `null` explicitly for `selectedUnitId` at that time
  (JS/TS positional args can't skip a parameter to reach a later one).
- Do not touch `buildUnitMapPresentations`, `SpriteOverlay`, `getUnitSpriteV2`, or anything from
  #755 — this is scoped to which function constructs the `SpriteEntity[]` array.

---

## Task 1: Update `buildUnitEntities` — civId, pirate visual state, combat-transient state

**Files:**
- Modify: `src/renderer/render-loop.ts:75-106` (`buildUnitEntities` function)
- Modify: `tests/renderer/damage-tier.test.ts` (12 call sites gain 3 new trailing args)
- Modify: `tests/renderer/unit-renderer-overlay.test.ts` (8 call sites gain 3 new trailing args, plus 3 new tests)
- Modify: `tests/renderer/city-renderer-overlay.test.ts` (1 call site gains 3 new trailing args)

**Interfaces:**
- Produces: `export function buildUnitEntities(state: GameState, viewerId: string, viewerVisibility: VisibilityMap, movingUnitIds: ReadonlySet<string>, selectedUnitId: string | null, pirateSpriteState: PirateSpriteStateController, nowMs: number): SpriteEntity[]` — Task 2 calls this exact signature.
- Consumes: `PirateSpriteStateController` (class, `resolve(entityId, persistent, nowMs)` and `resolveTransientState(entityId, nowMs)` methods) from `./pirate-sprite-state` (relative from `render-loop.ts`) / `@/renderer/pirate-sprite-state` (from test files).

### Step 1: Update the failing call sites — mechanical argument additions

All existing call sites currently call `buildUnitEntities(state, viewerId, visibility,
movingSet)` — 4 positional args, relying on `selectedUnitId`'s default. Every one needs `, null,
new PirateSpriteStateController(), 0` appended (explicit `null` for the now-reached
`selectedUnitId`, a fresh controller instance, and an arbitrary `nowMs` — `0` works since nothing
populates the transients map in these existing tests).

**`tests/renderer/damage-tier.test.ts`** — add the import, then fix all 12 identical call sites in
one pass:

```typescript
// add near the top, after the existing `import { buildUnitEntities } from '@/renderer/render-loop';`
import { PirateSpriteStateController } from '@/renderer/pirate-sprite-state';
```

Then replace every occurrence (all 12 are byte-identical) of:

```typescript
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set());
```

with:

```typescript
    const entities = buildUnitEntities(state, 'player', visMap as any, new Set(), null, new PirateSpriteStateController(), 0);
```

**`tests/renderer/unit-renderer-overlay.test.ts`** — update the existing import line and fix the
7 identical call sites, then the 1 different one separately:

```typescript
// change:
import { buildUnitEntities, CIVTYPE_TO_FACTION, civTypeToFaction } from '@/renderer/render-loop';
// to:
import { buildUnitEntities, CIVTYPE_TO_FACTION, civTypeToFaction } from '@/renderer/render-loop';
import { PirateSpriteStateController } from '@/renderer/pirate-sprite-state';
```

Replace every occurrence (7 of the 8 are byte-identical) of:

```typescript
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set());
```

with:

```typescript
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(), null, new PirateSpriteStateController(), 0);
```

Then separately fix the 1 remaining call site (the "excludes moving units" test, which passes
`new Set(['u1'])` instead of `new Set()`):

```typescript
// change:
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(['u1']));
// to:
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(['u1']), null, new PirateSpriteStateController(), 0);
```

**`tests/renderer/city-renderer-overlay.test.ts`** — add the import and fix the 1 call site:

```typescript
// change:
import { buildUnitEntities } from '@/renderer/render-loop';
// to:
import { buildUnitEntities } from '@/renderer/render-loop';
import { PirateSpriteStateController } from '@/renderer/pirate-sprite-state';
```

```typescript
// change:
    const entities = buildUnitEntities(state, 'player1', visibility, new Set());
// to:
    const entities = buildUnitEntities(state, 'player1', visibility, new Set(), null, new PirateSpriteStateController(), 0);
```

- [ ] Make all of the above edits now.

### Step 2: Write the new failing tests

Append to `tests/renderer/unit-renderer-overlay.test.ts`, inside the existing `describe('buildUnitEntities', ...)` block (add as a new test alongside the existing ones, e.g. after the `'returns kind=unit and correct subtype'` test):

```typescript
  it('sets civId from the unit owner (#760)', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player2' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(), null, new PirateSpriteStateController(), 0);
    const entity = entities.find(e => e.id === 'u1');
    expect(entity?.civId).toBe('player2');
  });
```

Then append these two new `describe` blocks at the end of the same file (after the existing
`describe('civTypeToFaction', ...)` block):

```typescript
// ── pirate visual state (#760) ────────────────────────────────────────────────

describe('buildUnitEntities — pirate visual state (#760)', () => {
  it('resolves persistent mode/tier/stage for a pirate-owned unit', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'pirate-1', type: 'pirate_corsair' });
    const baseState = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const state = {
      ...baseState,
      pirates: { factions: { 'pirate-1': { behavior: 'raiding', maritimeStage: 2 } } },
    } as unknown as GameState;

    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(), null, new PirateSpriteStateController(), 0);

    const entity = entities.find(e => e.id === 'u1');
    expect(entity?.mode).toBe('raid');
    expect(entity?.tier).toBe(2);
    expect(entity?.stage).toBe(2);
  });
});

// ── combat-transient state (#760) ─────────────────────────────────────────────

describe('buildUnitEntities — combat-transient state (#760)', () => {
  it('surfaces an attack transient for a non-pirate unit', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player1' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));
    const pirateSpriteState = new PirateSpriteStateController();
    pirateSpriteState.apply({ type: 'attack', entityId: 'u1' }, 0);

    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(), null, pirateSpriteState, 0);

    const entity = entities.find(e => e.id === 'u1');
    expect(entity?.state).toBe('attack');
  });

  it('defaults to idle when no transient exists', () => {
    const u = makeUnit({ position: { q: 2, r: 3 }, owner: 'player1' });
    const state = makeState([u], makeVisMap([{ q: 2, r: 3 }], 'visible'));

    const entities = buildUnitEntities(state, 'player1', state.civilizations['player1'].visibility, new Set(), null, new PirateSpriteStateController(), 0);

    const entity = entities.find(e => e.id === 'u1');
    expect(entity?.state).toBe('idle');
  });
});
```

- [ ] Write these now.

### Step 3: Run tests to verify they fail

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "buildUnitEntities|damage tier computation|strategic-map overlay"`

Expected: the 3 new tests fail on their assertions, not on a compile error. `yarn vitest` transpiles
via esbuild rather than type-checking (per CLAUDE.md: `yarn test` does not type-check — only `yarn
build` runs `tsc`), so calling the still-5-param `buildUnitEntities` with 7 arguments doesn't fail
at this step — the extra `pirateSpriteState`/`nowMs` arguments are silently dropped at runtime, the
function still returns its old shape, and the new tests fail because `civId`/`mode`/`tier`/`stage`
are `undefined` and `state` is hardcoded `'idle'` regardless of the transient set up in the test.
The mismatched arity would only surface via `yarn build`, which this step doesn't run. Confirm the
3 new tests fail with assertion
mismatches, not the pre-existing tests (which don't assert on the new fields and should still
pass even before Step 4's implementation).

### Step 4: Implement the updated `buildUnitEntities`

In `src/renderer/render-loop.ts`, add the import (near the top, alongside other renderer imports —
`PirateSpriteStateController` is already imported once in this file for the class's own
`pirateSpriteState` field, so no new import line is needed here; just confirm it's already in
scope).

Replace the current function (lines 75-106):

```typescript
export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
  selectedUnitId: string | null = null,
): SpriteEntity[] {
  return buildUnitMapPresentations(
    state,
    viewerId,
    viewerVisibility,
    movingUnitIds,
    selectedUnitId,
  ).map(presentation => {
      return {
        id: presentation.leadUnitId,
        memberIds: presentation.memberIds,
        kind: 'unit' as const,
        subtype: presentation.leadUnit.type,
        coord: presentation.coord,
        state: 'idle' as const,
        faction: presentation.faction,
        damage: presentation.damage,
        stackCount: presentation.stackCount,
        selected: presentation.isSelected,
        health: presentation.leadUnit.health,
        fortified: presentation.leadUnit.isFortified,
        roleMarker: presentation.roleMarker,
        anchorOffsetFactor: presentation.anchorOffsetFactor,
      };
    });
}
```

with:

```typescript
/**
 * Not a pure function: mutates `pirateSpriteState` as a side effect (clears expired combat/pirate
 * transients on read, inside PirateSpriteStateController.resolve()). Calling this twice with the
 * same arguments in the same frame can return different results for the second call — call it
 * exactly once per frame, matching the real render loop's usage.
 */
export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
  selectedUnitId: string | null = null,
  pirateSpriteState: PirateSpriteStateController,
  nowMs: number,
): SpriteEntity[] {
  return buildUnitMapPresentations(
    state,
    viewerId,
    viewerVisibility,
    movingUnitIds,
    selectedUnitId,
  ).map(presentation => {
    const faction = state.pirates?.factions[presentation.leadUnit.owner];
    // besieging shares blockading's sprite mode/tier (#522) -- the apex threat must
    // never render as indistinguishable from a harmless patrol.
    const persistentMode = faction?.behavior === 'besieging' || faction?.behavior === 'blockading'
      ? 'blockade' as const
      : faction?.behavior === 'raiding' ? 'raid' as const : 'patrol' as const;
    const visual = faction
      ? pirateSpriteState.resolve(presentation.leadUnitId, {
          mode: persistentMode,
          damage: presentation.damage as 0 | 1 | 2 | 3,
          tier: faction.behavior === 'besieging' || faction.behavior === 'blockading' ? 3 : faction.behavior === 'raiding' ? 2 : 1,
          stage: faction.maritimeStage,
        }, nowMs)
      : null;
    // Non-pirate units have no PirateSpriteVisualState (mode/tier/stage are pirate-only
    // concepts), but applyCombatVisual() records an attack/hurt/death transient for every
    // combat's attacker/defender unconditionally, pirate or not — this reads it back for
    // everyone else so the transient doesn't just expire unread.
    const combatState = visual?.state
      ?? pirateSpriteState.resolveTransientState(presentation.leadUnitId, nowMs);
    return {
      id: presentation.leadUnitId,
      memberIds: presentation.memberIds,
      kind: 'unit' as const,
      subtype: presentation.leadUnit.type,
      coord: presentation.coord,
      state: combatState,
      faction: presentation.faction,
      damage: visual?.damage ?? presentation.damage,
      stackCount: presentation.stackCount,
      selected: presentation.isSelected,
      health: presentation.leadUnit.health,
      fortified: presentation.leadUnit.isFortified,
      roleMarker: presentation.roleMarker,
      anchorOffsetFactor: presentation.anchorOffsetFactor,
      civId: presentation.leadUnit.owner,
      ...(visual ? { mode: visual.mode, tier: visual.tier, stage: visual.stage } : {}),
    };
  });
}
```

Note `selectedUnitId: string | null = null` keeps its default (per Global Constraints); the two
new parameters after it are required (no default), matching every call site now passing them
explicitly.

- [ ] Write this now.

### Step 5: Run tests to verify they pass

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "buildUnitEntities|damage tier computation|strategic-map overlay"`

Expected: all pass — the 21 pre-existing assertions (unchanged expectations) plus the 4 new ones
(civId, pirate mode/tier/stage, attack transient, idle default).

### Step 6: Commit

```bash
git add src/renderer/render-loop.ts tests/renderer/damage-tier.test.ts tests/renderer/unit-renderer-overlay.test.ts tests/renderer/city-renderer-overlay.test.ts
git commit -m "feat(renderer): bring buildUnitEntities up to date with the live render path (#760)"
```

---

## Task 2: Wire the real render loop to call `buildUnitEntities`

**Files:**
- Modify: `src/renderer/render-loop.ts:616-656` (the inline `unitEntities` construction block)

**Interfaces:**
- Consumes: `buildUnitEntities(state, viewerId, viewerVisibility, movingUnitIds, selectedUnitId, pirateSpriteState, nowMs): SpriteEntity[]` (Task 1).

This task is a **pure behavior-preserving refactor** — there is no new user-facing behavior to
write a failing test for. The verification strategy is: confirm the full relevant test suite
passes unchanged before and after, proving the extraction didn't alter live rendering.

### Step 1: Replace the inline block

In `src/renderer/render-loop.ts`, find the current inline construction (lines 616-656):

```typescript
      const unitEntities = unitPresentations.map(presentation => {
        const faction = this.state!.pirates?.factions[presentation.leadUnit.owner];
        // besieging shares blockading's sprite mode/tier (#522) -- the apex threat must
        // never render as indistinguishable from a harmless patrol.
        const persistentMode = faction?.behavior === 'besieging' || faction?.behavior === 'blockading'
          ? 'blockade' as const
          : faction?.behavior === 'raiding' ? 'raid' as const : 'patrol' as const;
        const visual = faction
          ? this.pirateSpriteState.resolve(presentation.leadUnitId, {
              mode: persistentMode,
              damage: presentation.damage as 0 | 1 | 2 | 3,
              tier: faction.behavior === 'besieging' || faction.behavior === 'blockading' ? 3 : faction.behavior === 'raiding' ? 2 : 1,
              stage: faction.maritimeStage,
            }, nowMs)
          : null;
        // Non-pirate units have no PirateSpriteVisualState (mode/tier/stage are pirate-only
        // concepts), but applyCombatVisual() records an attack/hurt/death transient for every
        // combat's attacker/defender unconditionally, pirate or not. Before this fix that
        // transient was only ever read back through the `faction ?` branch above, so it
        // silently expired unread for every non-pirate combat.
        const combatState = visual?.state
          ?? this.pirateSpriteState.resolveTransientState(presentation.leadUnitId, nowMs);
        return {
          id: presentation.leadUnitId,
          memberIds: presentation.memberIds,
          kind: 'unit' as const,
          subtype: presentation.leadUnit.type,
          coord: presentation.coord,
          state: combatState,
          faction: presentation.faction,
          damage: visual?.damage ?? presentation.damage,
          stackCount: presentation.stackCount,
          selected: presentation.isSelected,
          health: presentation.leadUnit.health,
          fortified: presentation.leadUnit.isFortified,
          roleMarker: presentation.roleMarker,
          anchorOffsetFactor: presentation.anchorOffsetFactor,
          civId: presentation.leadUnit.owner,
          ...(visual ? { mode: visual.mode, tier: visual.tier, stage: visual.stage } : {}),
        };
      });
```

Replace with:

```typescript
      const unitEntities = buildUnitEntities(
        this.state,
        viewerId,
        viewerVisibility,
        movingUnitIds,
        this.selectedUnitId,
        this.pirateSpriteState,
        nowMs,
      );
```

This is a straight substitution — `unitPresentations` (still needed separately for the
terrain-label-suppression call at line ~485 and the `drawUnitPresentations` call later in the same
method) is untouched; only this one block's construction changes from inline `.map()` to a
function call. `viewerId`, `viewerVisibility`, `movingUnitIds`, and `nowMs` are all already in
scope at this point in the method (unchanged variable names).

- [ ] Make this replacement now.

### Step 2: Run the full relevant test suite to confirm zero regression

Run: `bash scripts/run-with-mise.sh yarn vitest run -t "RenderLoop|render-loop|SpriteOverlay|sprite-overlay|buildUnitEntities|damage tier|strategic-map overlay|unit-renderer"`

Expected: all pass. If any render-loop-level integration test asserts on `unitEntities`'s exact
shape and fails, compare its expectation against this task's inline block being byte-identical to
Task 1's new `buildUnitEntities` body — a failure here would mean the extraction introduced a real
discrepancy and needs fixing before proceeding, not adjusting the test to match.

### Step 3: Run the full suite and build

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all files pass.

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: clean, no TypeScript errors.

### Step 4: Commit

```bash
git add src/renderer/render-loop.ts
git commit -m "refactor(renderer): wire the live render loop to buildUnitEntities, removing the duplicate"
```

---

## Self-Review Notes (completed during plan authoring)

- **Spec coverage**: civId, pirate visual-state resolution, and combat-transient state (the 3
  confirmed divergences) → Task 1's implementation + new tests. Removing the duplicate inline block
  → Task 2. The documented mutation side effect from the spec's second-pass review → Task 1 Step 4's
  doc comment.
- **Placeholder scan**: no TBD/TODO; every step has real, complete code.
- **Type consistency**: `buildUnitEntities`'s final signature —
  `(state, viewerId, viewerVisibility, movingUnitIds, selectedUnitId, pirateSpriteState, nowMs)` —
  is identical across Task 1's implementation, all 21 updated call sites, the 4 new tests, and
  Task 2's call site.
- **Existing-call-site audit**: confirmed via grep during design investigation that the only
  references to `buildUnitEntities`'s pre-existing 5-arg signature are the 3 test files this plan
  edits — no other production code depends on the signature being changed.
