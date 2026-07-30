# Unify buildUnitEntities With The Live Render Path

> Fixes issue #760.

## Problem

`buildUnitEntities()` (exported from `src/renderer/render-loop.ts`) has zero production callers.
The real live render loop builds its own `unitEntities` array inline (`render-loop.ts`, inside the
`if (viewerVisibility)` block), with logic that has drifted from `buildUnitEntities` in three
confirmed ways:

1. **`civId` is never set** in `buildUnitEntities`'s output. The real path sets
   `civId: presentation.leadUnit.owner`.
2. **No pirate visual-state resolution.** The real path resolves
   `this.pirateSpriteState.resolve(...)` for pirate-owned units to compute persistent
   `mode`/`tier`/`stage` and an overridden `damage`. `buildUnitEntities` has none of this.
3. **No combat-transient state.** The real path resolves `combatState` (attack/hurt/death, via
   `pirateSpriteState.resolveTransientState()`) for *every* unit's `state` field, pirate or not.
   `buildUnitEntities` hardcodes `state: 'idle'`.

Three test files (`damage-tier.test.ts`, `unit-renderer-overlay.test.ts`,
`city-renderer-overlay.test.ts`) exercise `buildUnitEntities` directly, as if it were live.

## What's actually shared vs. divergent (found during investigation, not in the original issue)

Both the real inline path and `buildUnitEntities` call the exact same `buildUnitMapPresentations()`
— confirmed by reading both call sites (`render-loop.ts`'s `unitPresentations` assignment and
`buildUnitEntities`'s own body) side by side. That function does all the real work: visibility
filtering, unit stacking/grouping, faction resolution (`civTypeToFaction`), and the base
health→damage-tier computation. **The three existing test files are validating this real, shared
logic correctly** — they are not testing fake behavior, they're testing real behavior through a
currently-unused entry point. Only the final `presentation → SpriteEntity` field-mapping step
diverges (the three items above).

This matters for scope: the fix is a narrow, mechanical unification of one `.map()` callback, not
a rewrite of well-tested shared logic.

## Architecture decision: fully unify, state-based signature

`buildUnitEntities` gains two new required parameters — `pirateSpriteState:
PirateSpriteStateController` and `nowMs: number` — and its `.map()` callback becomes byte-identical
to the real inline block. The real render loop's ~40-line inline block is deleted and replaced with
a single call to `buildUnitEntities`.

**Why a state-based signature (recomputing `buildUnitMapPresentations` internally) rather than
accepting pre-computed presentations as a parameter** (the alternative considered): the render loop
already has its own separately-computed `unitPresentations` (needed independently for terrain-label
suppression and a canvas-drawing pass, at two other call sites), so a presentations-parameter
signature would eliminate one redundant, pure, deterministic function call per frame. Rejected
anyway, weighed against complexity/bugs/testability/regression-risk rather than raw performance:

- **Bugs**: a presentations-parameter signature creates a silent invariant — "the presentations you
  pass in must have been computed with the same viewerId/visibility/movingUnitIds you intend" —
  enforced by nothing at the type level. The state-based signature has no such surface: the
  function computes its own presentations from its own inputs, internally consistent by
  construction.
- **Testability**: state-based keeps every test a single call (matching all three existing test
  files' current pattern almost exactly — just two new arguments, no restructuring).
- **Regression risk**: state-based means the smallest possible diff to the three existing test
  files.
- **Performance**: the rejected alternative wins here, but `buildUnitMapPresentations` only
  iterates already-visibility-filtered units, and the render loop does far heavier work every frame
  (canvas drawing, hex map rendering, sprite DOM diffing) — no evidence this specific redundant
  call is a measurable cost. Not worth the added bug surface on unmeasured suspicion; a real
  profiling-backed follow-up remains trivial later if it ever matters.

## Implementation

New `buildUnitEntities` (replacing the current one in `render-loop.ts`):

```ts
export function buildUnitEntities(
  state: GameState,
  viewerId: string,
  viewerVisibility: VisibilityMap,
  movingUnitIds: ReadonlySet<string>,
  selectedUnitId: string | null,
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

This is a **byte-for-byte extraction** of the real inline block's callback (`presentation => {...}`
body), with `this.state`/`this.pirateSpriteState` rewritten to the function's own `state`/
`pirateSpriteState` parameters. No new logic, no behavior change to the live game — purely moving
existing, already-correct code into the currently-stale exported function.

Real render loop call site (replacing the ~40-line inline block):

```ts
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

`PirateSpriteStateController` is already imported in `render-loop.ts` (`import {
PirateSpriteStateController } from './pirate-sprite-state';`) — `buildUnitEntities` needs the same
import added since it's defined in the same file, no new cross-module dependency.

## Test migration

All three existing test files call `buildUnitEntities(state, viewerId, viewerVisibility,
movingUnitIds, selectedUnitId)` with 5 positional arguments. Each call site gains two more:
`new PirateSpriteStateController()` (a fresh instance — no pirate/combat events applied, so
`resolve`/`resolveTransientState` both return the harmless `'idle'` default, preserving every
existing assertion unchanged) and a `nowMs` value (e.g. `0` or `Date.now()` — value doesn't matter
since nothing populates the transients map in these tests).

New tests added (this is what makes the fix actually verified, not just "compiles and old tests
still pass"):

- **`civId` is now set**: a test asserting `buildUnitEntities(...)[0].civId` equals the unit's
  owner — this is the exact assertion that would have failed before this fix and is central to
  #755's civColor threading actually working when accessed through this function.
- **Pirate visual-state resolution**: a test giving a pirate-owned unit a `state.pirates.factions`
  entry with a `behavior` (e.g. `'raiding'`) and asserting the returned entity has `mode: 'raid'`,
  `tier: 2`, and the expected `stage`.
- **Combat-transient state for non-pirate units**: a test that calls `pirateSpriteState.apply({type:
  'attack', entityId: ...}, nowMs)` before calling `buildUnitEntities`, then asserts the returned
  entity's `state` is `'attack'` — this is the "every other unit gets only the transient combat
  pulse" behavior documented in `pirate-sprite-state.ts`'s class comment, which `buildUnitEntities`
  couldn't exercise at all before this fix.

## Non-goals

- Not touching `buildUnitMapPresentations` — it's correct and already shared.
- Not touching `SpriteOverlay`, `getUnitSpriteV2`, or anything from #755 — this is purely about
  which function constructs the `SpriteEntity[]` array before it reaches `sync()`.
- Not adding new production behavior — the live game's rendered output is unchanged; this is a
  refactor (extract + rewire), not a feature.

## Self-review

- **Scope check**: single-function unification, matching #760's actual title/scope.
- **Placeholder scan**: no TBD/TODO; the implementation is a verbatim extraction, not a sketch.
- **Behavior-preservation check**: the new `buildUnitEntities` body was compared line-by-line
  against the current real inline block during investigation — identical apart from `this.` →
  parameter-name rewrites. No live-game behavior change expected.
- **Regression risk**: the render loop change is a pure extract-and-call refactor; the three
  existing test files need only additive argument changes, not restructuring, minimizing edit risk
  to already-passing assertions.
