# #1070 World-turn pathfinding scalability

## Goal

Find and remove the proven source of super-linear `BinaryHeap.pop` work in one
`processTurn` on the deterministic #1007 crowded fixtures, without changing
authoritative turn results, difficulty behavior, save data, or player-facing
world-actor behavior.

## Current evidence, verified after #1068

The fresh post-#1068 report still measures 5,572 turn heap pops at e1 and
23,131 at e2: a 4.15x increase for the fixture's roughly 1.8x entity increase.
Whole-state clones remain 2 and visibility passes remain 8 at both scales.
The #1068 movement lookup now records zero direct blocker scans and exactly one
blocker-map build per detailed query, so it did not resolve this turn-level
pathfinding shape.

The issue's world-phase diagnosis remains a hypothesis. Current source has
direct `findPath` calls reachable from a turn in the journey-automation branch,
route-runner advancement, pirate purposeful movement/intent selection, and
rogue-elephant host movement. The barbarian and beast turn helpers do not make a
direct `findPath` call in their current implementations. No optimization may be
chosen until the deterministic fixture attributes the measured heap work to the
actual caller family.

## Chosen design: test-only attributable perf probe first

Extend the existing `tests/perf/perf-probe.ts` instrumentation, rather than
adding production diagnostics or persisting counters. The probe will retain the
existing aggregate counters and add an optional, explicitly enabled attribution
record keyed by stable turn-operation names. A phase wrapper entered by a
spied, exported turn helper will charge all nested `findPath`, heap push, and
heap pop work to that key; work not entered through a wrapper is charged to an
explicit `unattributed-turn-pathfinding` key.

The initial attribution boundary is intentionally narrow and based on verified
current call sites:

- `turn:pirates` for `processPiratesForCompletedRound`;
- `turn:rogue-elephant-host` for each `processRogueElephantHostTurn` call;
- `turn:route-runners` for `advanceRouteRunners`;
- `turn:unattributed-turn-pathfinding` for the remaining direct turn-manager
  journey path or any newly discovered call site.

The attribution result must reconcile exactly with the aggregate path-query and
heap counters. The test must run e1 and e2 repeatedly and prove the full
attribution record is bit-stable. It is test-only data: it has no import from
`src/`, no event, no save field, no UI, and no audio behavior.

## Root-cause decision gate

Only after that attribution is green and measured on e1/e2 will the production
scope be selected.

1. If one operation family contributes the material e2/e1 increase, optimize
   only that family and preserve its exact output state, events, target choice,
   and movement route.
2. If several families repeat the same equivalent query against an unchanged
   turn-state slice, introduce the smallest deterministic, transient helper at
   their shared existing seam. It must have deterministic keys, never persist,
   and invalidate at the existing mutation boundary.
3. If `unattributed-turn-pathfinding` dominates, trace that remaining real call
   site before choosing any production change.
4. If the post-#1068 result becomes near-linear on a verified rerun, tighten the
   guard and close #1070 with evidence rather than creating artificial code
   churn.

Replacing A* with greedy movement, reducing a world actor's range, suppressing
actors, changing target ranking, changing difficulty scaling, or adding a
global/AI-round cache is out of scope. Any root cause that requires one of
those changes is a design escalation, not an optimization shortcut.

## Behavioral and data contract

- Identical state and command inputs produce equivalent authoritative state,
  event traces, chosen targets, and movement paths.
- World-actor behavior remains actor-owned and independent of `currentPlayer`,
  so solo and hot-seat seats observe the same authoritative result.
- Explorer, Standard, and Veteran preserve their existing pressure behavior;
  no difficulty table or spawn/target rule changes.
- No save schema, migration, normalization, UI, renderer, SFX, audio-event, or
  persistent-state change is permitted. Any transient derived data is rebuilt
  within the synchronous turn operation.

## Required regression evidence after a root cause is proven

- The attribution test proves aggregate reconciliation and repeat stability.
- The optimized subsystem has an exact-state/event/path regression against the
  pre-optimization behavior on a controlled fixture.
- A deterministic turn or save/reload continuity regression proves the cache or
  reuse cannot change the simulation trajectory.
- The #1007 e2/e1 turn heap-pop shape materially improves; the baseline is
  regenerated only after inspecting every changed number and documenting the
  causal reduction.
- A controlled sabotage reintroduces the proven repeated path pattern and makes
  the exact new guard fail.
- Relevant world-actor, AI-playability, long-horizon, solo, and hot-seat tests
  remain green.

## Pre-PR inline review scope

perform an INLINE review across these dimensions about balancing gameplay, fun,
new mechanics, different player ages (7-43), different play styles, the built
in difficulty modes, how computer players will use it, ui, ux, architecture,
extensibility, data, sfx, updating saved games, proper testing, regressions solo
play, and hot seat plays, and proper implementation.

At design review, the inspected evidence is the post-#1068 deterministic perf
report, the current turn-manager call sites, the world subsystem call sites,
and the #1007 probe/budget tests. No gameplay, UI, SFX, save, difficulty, or
hot-seat defect is introduced by the test-only attribution design. The main
risk is optimizing an unproven phase; the reconciliation and decision gate
prevent that scope error.
