---
paths:
  - "src/systems/unit-movement-system.ts"
  - "src/systems/unit-movement-validation.ts"
  - "src/systems/unit-movement-explainer.ts"
  - "src/systems/unit-system.ts"
  - "src/systems/unit-movement-cost.ts"
  - "src/systems/unit-movement-legality.ts"
  - "src/systems/unit-pathfinding.ts"
  - "src/systems/unit-movement-queries.ts"
  - "src/systems/unit-definitions.ts"
  - "src/systems/airborne-system.ts"
  - "src/systems/transport-system.ts"
  - "src/systems/pirate-system.ts"
  - "src/systems/pirate-behavior.ts"
  - "src/ai/**"
  - "src/app/controllers/**"
  - "tests/systems/movement-resolver.test.ts"
---

# Movement Action Contract (#1025)

The generalisation of `game-balance.md`'s `resolveCityInteraction` convention to the
**movement action family**. Grew out of #1025, after the movement legality rule had to be
re-established for a different executor four separate times (#843, #845, #965, #970).

## The one resolver, the one executor

Ordinary unit movement has exactly one legality+cost check and one executor, both in
`src/systems/unit-movement-system.ts`:

| Step | Function | Contract |
|---|---|---|
| Resolve | `resolveUnitMoveIntent(state, unitId, to, options)` | Returns `MoveResolution`: either `{ ok: true, command: ValidatedUnitMove }` or a typed rejection `{ ok: false, reason, message, … }` carrying player-facing copy. Wraps `validateUnitMove` (kept internal/back-compat). |
| Execute | `executeValidatedUnitMove(state, command)` | Accepts **only** a `ValidatedUnitMove`. `validatedUnitMoveBrand` is an un-nameable `unique symbol`, so no other module can construct that shape — the bypass is a compile error, not a review comment. |
| Convenience | `executeUnitMove(state, unitId, to, options)` | `resolveUnitMoveIntent` → `executeValidatedUnitMove`. The ~20 existing call sites use this and are unchanged. |

**Previews, AI and executors all consult `resolveUnitMoveIntent`** (directly, or via
`executeUnitMove`). Nothing recomputes movement legality or movement-point cost on its own.
The movement-range BFS (`getMovementRangeDetails`) is a performance-motivated precomputation
**derived from the same primitives** (`getMovementStepCost`, `getBlockingMapEntityAt`) — never
a parallel reimplementation; a regression test pins that its reachable set agrees with the
resolver.

**Where these live (#1010 / #1025):** the movement subsystem is decomposed into
`unit-movement-cost.ts` (the step-cost model — pure map+mover, never reads `GameState`),
`unit-movement-legality.ts` (the single source of truth for map-entity blockers —
`getBlockingMapEntityAt` / `getBlockingMapEntityKeys` / `BLOCKING_MAP_ENTITY_MESSAGES`),
`unit-pathfinding.ts` (cost-aware A* — imports cost only; its open set is a deterministic
`BinaryHeap` from `src/systems/binary-heap.ts` — a lazy-deletion A* min-heap keyed
`(f asc, g desc, hexKey asc)`; route output is byte-identical to the pre-#1042-MR5 linear
scan, pinned by `referenceFindPath` in `tests/systems/unit-pathfinding-cost.test.ts`),
`unit-movement-validation.ts`
(the omniscient `validateUnitMove` / `resolveUnitMoveIntent` — extracted from
`unit-movement-system.ts` in #1025 MR4 so the explainer can derive from it without a cycle;
`unit-movement-system.ts` re-exports the API), `unit-movement-queries.ts`
(read-only derived answers: `getMovementRange*`), and `unit-movement-explainer.ts`
(`getMovementBlockerReason` — see below). `unit-system.ts` re-exports the first four and keeps
unit lifecycle + healing + `UNIT_DESCRIPTIONS`. Layering is guarded by
`tests/app/architecture-boundaries.test.ts`: pathfinding→cost,
validation→cost+legality+pathfinding, explainer→validation, legality→nothing in the subsystem,
no cycles.

`getMovementBlockerReason` (`unit-movement-explainer.ts`) is the **viewer-scoped projection** of
the resolver, not a second legality implementation (#1025 MR4). It resolves through
`resolveUnitMoveIntent`; when that refuses (or would stop the unit short on Zone of Control) it
hands off to exactly one redaction rule, `presentMovementRejectionForViewer` (path-aware since
#1002):

1. destination unexplored → "Too far away to spot.";
2. otherwise **re-run the same canonical resolver** over `projectMovementKnowledgeForViewer`
   (the owner's knowledge: foreign units only on currently *visible* tiles and not concealed;
   cities / camps / pirate enclaves only on *explored* tiles, i.e. remembered structures stay;
   terrain untouched) and explain only from that answer — a still-refused move gets its
   viewer-knowable reason, a ZoC stop the viewer can see gets the ZoC copy, anything else is
   `hidden-obstacle`: "Something out of sight is in the way."

The viewer is always `unit.owner`, read from that civ's own visibility (no caller-supplied
visibility option; a civ with no visibility map knows nothing). Validation is deliberately
omniscient; the explanation is deliberately viewer-scoped. **Never surface a resolver
rejection's `message` to a player** — the tap explainer and the executor-failure toast
(`executeAnimatedUnitMove` → `explainMovementFailureForViewer`) both go through the rule above,
and `tests/helpers/viewer-safety-boundaries.ts` (`raw-movement-resolver`) rejects a new
player-facing import of `resolveUnitMoveIntent` / `validateUnitMove`. The knowledge projection is
**explanation-only** — never feed it to legality, the executor or the AI.

Documented residue (legality necessarily reveals *that* a move is refused; never *what/where*):
the movement-range highlight is canonical legality and reflects hidden blockers (hiding legal
moves or offering illegal ones is worse, #998); `unreachable` answers terrain connectivity,
which the knowledge projection leaves untouched. Parity is pinned by
`tests/systems/unit-movement-resolver-parity.test.ts`; the viewer rule by the differential
cases in `tests/systems/unit-movement-explainer.test.ts`.

The explainer lives in its own module (**not** re-exported through the `unit-system` barrel):
`unit-movement-validation` → `unit-occupancy` → `air-operations-system` → the `unit-system`
barrel, so re-exporting the explainer there closes an import cycle that leaves
`TRAINABLE_UNITS` / `BUILDINGS` undefined at load time. `src/input` and its tests import
`getMovementBlockerReason` from `@/systems/unit-movement-explainer` directly.

## The sibling movement actions

Paradrop, air assault and transport unload are *different actions* with the same shape —
a typed `can*` predicate plus an `execute*`, both already sharing `getBlockingMapEntityAt`
(post-#970) and a reason→copy map (`PARADROP_FAILURE_MESSAGES`, `BLOCKING_MAP_ENTITY_MESSAGES`):

| Action | Resolver | Executor | File |
|---|---|---|---|
| Paradrop | `canParadrop` | `executeParadrop` | `airborne-system.ts` |
| Air assault | `canAirAssault` | `executeAirAssault` | `airborne-system.ts` |
| Transport unload | `canUnloadUnitFromTransport` | `unloadUnitFromTransport` | `transport-system.ts` |

They are not folded into `resolveUnitMoveIntent` (a paradrop is not a walk), but they follow
the same rule: **anything a `can*` offers must be executable, anything it withholds comes back
as a typed reason with player-facing copy, and the executor never re-derives legality.**

### World-actor step/spawn placement (#994)

Beast and barbarian raider AI (`beast-system.ts`'s `processBeasts`, `barbarian-system.ts`'s
`processPurposefulBarbarians`) choose their own next step / spawn tile with a hand-rolled
candidate filter (leash radius, terrain passability, an `occupied`-units set) — not a full
`resolveUnitMoveIntent` walk, and not a call to `moveUnitWithZoneOfControl`/`moveUnit` either
(`turn-manager.ts` applies the resulting order with a raw `unit.position = …` spread), so neither
the `Unit`-taking blocking predicates nor the low-level-mover source rule ever saw them. An
AI-playability run caught a beast standing on a foreign city tile as a direct result (#994) —
`getBlockingMapEntitiesByHex`/`getBlockingMapEntityKeys` require a live `Unit`, which a
not-yet-spawned beast or raider doesn't have.

`getBlockingMapEntitiesByOwner` / `getBlockingMapEntityKeysForOwner` (`unit-movement-legality.ts`)
are the same single source of truth keyed by `ownerId: string` instead of a `Unit` — every
`Unit`-taking predicate above delegates to them internally. Both `processBeasts` and
`processPurposefulBarbarians` now filter their own candidate tiles through
`getBlockingMapEntityKeysForOwner(state, BEAST_OWNER | 'barbarian')`, computed once per turn
(owner-keyed, not per-instance) by the caller. This is the correct shape for this family: not a
`resolveUnitMoveIntent` walk (no player-chosen destination, no movement-point path cost — a beast
spends a flat one point per step), and not a `moveUnitWithZoneOfControl` call either (nothing
world-actor here calls it), so it does not fit the `movement-contract-exempt` annotation literally
— but it is the same principle as that annotation: a world-actor mover that consults the canonical
blocking rule directly rather than re-deriving it, documented here instead of at an unmatched call
site.

**Any future world-actor system that places a unit without going through `executeUnitMove`/
`moveUnitWithZoneOfControl` (a new crisis force, a new spawn system) must consult
`getBlockingMapEntityKeysForOwner` (or a live-`Unit` predicate above) for its own candidate
filtering — never re-derive foreign-city/barbarian-camp/pirate-enclave blocking from scratch, and
never assume "no blockers reachable" without checking, the mistake this file's own pirate exemption
comment already earns its keep by stating explicitly.**

## Enforcement

`scripts/check-src-rule-violations.sh` and its `.claude/hooks/check-src-edit.sh` mirror flag any
call to the low-level position movers (`moveUnitWithZoneOfControl(`, `moveUnit(`) **outside**
`unit-system.ts` (defines them) and `unit-movement-system.ts` (the canonical executor). A
genuinely special world-actor path marks the call line:

```ts
moveUnitWithZoneOfControl(state, unit, coord, cost); // movement-contract-exempt: <reason>
```

Current exemptions (world actors, ocean/coast-only, no `getBlockingMapEntityAt` entity
reachable): `pirate-system.ts` raider step, `pirate-behavior.ts` armada placement.
`tests/hooks/check-src-edit.test.sh` covers the pass/block/exempt/sanctioned cases;
`tests/app/architecture-boundaries.test.ts` asserts no new movement executor appears.

## Rule

Any new way to move a unit — an ability, a world actor, an automation mode, territorial-access
gating (#870/#871) — goes through `resolveUnitMoveIntent` / `executeValidatedUnitMove`, OR adds
a sibling `can*`/`execute*` pair to this table with a typed reason channel, OR marks a
world-actor call `movement-contract-exempt: <reason>` and adds a row above. Never a fifth
ad-hoc `moveUnitWithZoneOfControl` caller.
