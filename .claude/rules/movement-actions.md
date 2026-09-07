---
paths:
  - "src/systems/unit-movement-system.ts"
  - "src/systems/unit-system.ts"
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
