# MR4 — Derive the movement tap-explainer from the canonical resolver

**Issue:** #1025 (movement family follow-up). Related: #1002 (viewer-safe presentation), #998
(previews must remain executable), #1010 (one legality implementation).
**Base:** `69f69bdf`. Every claim below verified against that commit.

## Problem

`getMovementBlockerReason` (`src/systems/unit-movement-queries.ts`) is the player-facing
"why can't I move there?" explainer. It hand-reimplements a **subset** of `validateUnitMove`'s
legality rules. Three consequences:

### 1. Duplicate legality implementation

#1010's acceptance criterion is "one module owns movement legality; `rg` shows no second
implementation of a blocking check." The explainer is that second implementation. Divergence
today:

| Rule | Explainer | Resolver (`validateUnitMove`) |
|---|---|---|
| unit is cargo aboard a transport | **absent** | `occupied` / "Loaded units cannot move until they unload." |
| hostile occupant on the destination | **absent** | `occupied` / "An enemy unit is blocking the way." |
| path crosses a hostile occupant | **absent** | `occupied` / "An enemy unit is blocking the way." |
| path crosses a blocking entity | **absent** (destination only) | typed reason + `BLOCKING_MAP_ENTITY_MESSAGES` |
| path crosses unexplored (player move) | **absent** | `unexplored` / "Move one step at a time into unexplored territory." |
| naval unit onto land | `impassable-terrain` / "Naval units cannot move on land." | `impassable-terrain` / "This terrain cannot be entered." — **worse copy** |
| destination unexplored to the viewer | `unexplored` / "Too far away to spot." (redaction) | **absent — omniscient by design** |

### 2. Live bug: a tap can silently deselect the player's unit

The explainer ignores Zone of Control (`findPath` has no ZoC awareness); the movement-range BFS
applies it (`getMovementRangeDetails` marks a ZoC tile terminal and never enqueues it, so tiles
*past* it are unreachable).

So for a tile beyond an enemy ZoC chokepoint but within the unit's movement points:
`canMove` is `false` → `resolveMapTapIntent` consults the explainer → the explainer finds a
path, cost fits, and returns `null` → control falls past every branch to
`return { kind: 'deselect' }`.

**The player taps a tile, gets no message, and loses their unit selection.** This violates
`end-to-end-wiring.md` ("Every user action needs visible feedback") and is exactly the
preview/executor drift #1025 exists to eliminate.

### 3. The redaction guard is applied inconsistently

`selected-unit-movement-feedback.ts` passes `visibilityState`, so an unexplored destination is
redacted to the generic "Too far away to spot." `map-tap-intent.ts` **passes no
`visibilityState` at all**, so the same tap on an unexplored tile returns the specific reason
(e.g. `impassable-water` — leaking that the unexplored tile is water).

## The constraint that rules out "just delete it"

#1025's own text:

> Information-safe query APIs stay distinct from omniscient internal validation. Validation may
> legitimately see the whole state; the *preview shown to a player* must be viewer-scoped.
> Collapsing the two would turn every preview into an information leak.

`validateUnitMove` is deliberately omniscient. The explainer's `visibilityState === 'unexplored'`
early return is the redaction guard that keeps a tap from revealing what sits on an unexplored
tile. Deleting the explainer and surfacing the resolver's rejection directly would ship an
information leak (#1002).

**So the explainer is not a duplicate to remove — it is the viewer-scoped projection of the
resolver, and today it is built by re-deriving legality instead of by projecting.**

## Design: derive, then redact

Two responsibilities, each with exactly one implementation:

```
resolveUnitMoveIntent(state, unitId, to, opts)      ← the ONE legality+cost source (omniscient)
        │  MoveResolution: { ok:true, command } | { ok:false, reason, message }
        ▼
redactMovementRejectionForViewer(rejection, visibilityState)   ← the ONE redaction rule
        │  generic reason when the destination is unexplored to the viewer
        ▼
getMovementBlockerReason(state, unitId, to, opts)   ← viewer-scoped explainer (no legality of its own)
```

### `getMovementBlockerReason` — new shape

```ts
export function getMovementBlockerReason(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options?: { visibilityState?: VisibilityState },
): MovementBlockerReason | null
```

Behaviour:

1. Resolve with `resolveUnitMoveIntent(state, unitId, to, { actor: 'player', civId: unit.owner })`.
   `actor: 'player'` is correct for a preview — it enables the player-only unexplored-path rule.
   `civId: unit.owner` (never `state.currentPlayer`) keeps it owner-scoped for hot seat.
2. `ok: false` → project the typed rejection to `{ code, message }`, then redact.
3. `ok: true` **and the executor would stop the unit short of `to`** → return the new
   `zone-of-control` reason (below), then redact.
4. `ok: true` and the unit would arrive → `null`.

The function no longer takes `completedTechs` or `blockingEntity` — the resolver derives both
from `state` itself, which removes two ways for a caller to feed the explainer inputs that
disagree with the executor.

### The `zone-of-control` reason

`moveUnitWithZoneOfControl` stops a unit after it enters a tile where
`getZoneOfControlAt(state, mover, tile).limited`. That predicate reads only the mover's
type/owner and the destination's neighbours — **not the mover's position** (verified) — so the
explainer can evaluate it for each path tile with the unmoved unit and get the same answer the
executor will.

Walk `command.path.slice(1)`; if the first ZoC-limited tile is not the destination, the executor
will stop short:

```ts
{ code: 'zone-of-control',
  message: 'An enemy nearby would stop your unit before it reaches that tile.' }
```

**Copy voice (review fix D2).** The codebase deliberately avoids the term "zone of control" in
player-facing text — the existing ZoC warning in `src/ui/selected-unit-info.ts:624` reads
`'⚠ Enemy nearby — entering ends movement.'`. The message above matches that voice and is
readable by the 7-year-old end of the audience; the *code* keeps the precise name for
developers. Do not reintroduce the jargon in the string.

This is a **derivation from the executor's own predicate**, not a reimplementation — the same
"precomputation derived from the canonical rule" pattern `getBlockingMapEntityKeys` already uses.
It surfaces an existing mechanic; no rule, cost, or stat changes.

`'zone-of-control'` is added to `MovementBlockerReason['code']` only. It is **not** added to
`UnitMovementBlockerCode` (the executor's rejection union) — the executor does not reject a
ZoC move, it performs a partial one. Keeping the unions distinct is deliberate.

### The redaction step

```ts
// unit-movement-queries.ts, pure, exported for its own test
function redactMovementRejectionForViewer(
  reason: MovementBlockerReason,
  visibilityState: VisibilityState | undefined,
): MovementBlockerReason
```

Rule: `visibilityState === 'unexplored'` → `{ code: 'unexplored', message: 'Too far away to spot.' }`.
Otherwise pass through unchanged. This is today's behaviour, lifted into one named, tested place.

**Both call sites will now pass `visibilityState`**, closing gap 3. For `map-tap-intent.ts` this
is a deliberate behaviour change: an unexplored tile now reports "Too far away to spot." instead
of leaking the specific terrain/blocker reason.

**Documented limitation (not fixed here):** redaction keys off the *destination* only. If the
destination is explored but a *path* tile is not, the resolver's reason can still describe that
unexplored tile (e.g. "An enemy unit is blocking the way."). That is a pre-existing leak that
also exists in today's `selected-unit-movement-feedback.ts` path; making redaction path-aware is
**#1002's** job. MR4 must not widen it, and the design note above says so explicitly rather than
leaving it silent.

### Copy fix rolled in

Move the naval-onto-land branch into `getImpassableReason` (`unit-movement-system.ts`) so the
**resolver** produces "Naval units cannot move on land." Both the executor's rejection and the
explainer then carry the better message; nothing regresses.

### Hot-seat fix rolled in

`selected-unit-movement-feedback.ts` currently derives `visibilityState` from
`state.civilizations[state.currentPlayer]` but `completedTechs` from `unit.owner`. Both become
`unit.owner`-scoped. Harmless today (you can only select your own units) but inconsistent, and
the new signature makes owner-scoping the single rule.

## Components

| Unit | Purpose | Depends on |
|---|---|---|
| `validateUnitMove` / `resolveUnitMoveIntent` (**moved** to `unit-movement-validation.ts`) | the one legality+cost answer, omniscient | cost, legality, pathfinding, definitions, unit-occupancy, fog-of-war, hex-utils |
| `redactMovementRejectionForViewer` (new, pure) | the one viewer-scoping rule | nothing |
| `getMovementBlockerReason` (rewritten, stays in `unit-movement-queries.ts`) | viewer-scoped explainer = resolve → project → redact | validation + `getZoneOfControlAt` |
| `getImpassableReason` (**moved** with `validateUnitMove`, one branch added) | terrain-rejection copy | definitions |
| `executeValidatedUnitMove` / `executeUnitMove` (stay in `unit-movement-system.ts`) | execution | validation + `unit-system` (`moveUnitWithZoneOfControl`) |

## Layering — the cycle, and why the obvious fix fails (review fix D1)

The naive shape (`queries` imports `unit-movement-system` for the resolver) is **cyclic**:

```
queries → unit-movement-system → unit-system (barrel) → queries
```

`unit-movement-system.ts` imports 12 symbols from the `unit-system` barrel today (verified at
`unit-movement-system.ts:9-21`), and the barrel re-exports `unit-movement-queries`
(`unit-system.ts:41`). **Pointing those 12 imports at the specific modules does not break the
loop**, because one of them — `moveUnitWithZoneOfControl` — genuinely lives in `unit-system.ts`
itself (MR3 deliberately kept the low-level movers there so the #1025 source-rule allowlist stays
valid). So the `movement-system → unit-system` edge is unavoidable.

**Resolution: extract validation into its own module.** `validateUnitMove` does **not** use
anything owned by `unit-system.ts` (verified: it needs `getBlockingMapEntityAt`,
`BLOCKING_MAP_ENTITY_MESSAGES`, `getMovementCostForUnitInContext`, `getMovementStepCost`,
`canHullEnterOcean`, `findPath`, `UNIT_DEFINITIONS`, `buildUnitOccupancy`/`getUnitIdsAtCoord`,
`getVisibility`, hex-utils — none from `unit-system.ts`). Only `executeValidatedUnitMove` needs
`moveUnitWithZoneOfControl`.

New `src/systems/unit-movement-validation.ts` owns: `ValidatedUnitMove`, `MoveResolution`,
`UnitMoveValidationResult`, `validateUnitMove`, `resolveUnitMoveIntent`, `getImpassableReason`,
`normalizeDestination`, `movementFailure`, `getOwnerCompletedTechs`.

Resulting graph is acyclic:

```
definitions ← cost ← pathfinding ←┐
            ← legality ←──────────┤
                                  ├← validation ← queries ← unit-system(barrel)
                                                                   ↑
                              unit-movement-system ────────────────┘
                              (execution; → validation + unit-system)
```

`unit-movement-system.ts` **re-exports** `validateUnitMove`, `resolveUnitMoveIntent`,
`executeValidatedUnitMove`, `ValidatedUnitMove` and `MoveResolution` so its ~20 existing
importers are unchanged. `tests/app/architecture-boundaries.test.ts` adds
`unit-movement-validation` to the acyclicity check and asserts validation never imports
`unit-system`, `unit-movement-system`, or `unit-movement-queries`.

This is the #1010 "validation" layer the original decomposition lens named but MR3 left inside
the execution module; extracting it here is the minimum needed to make the explainer derive
from the resolver without a cycle.

### The second cycle the extraction exposes (review fix D10)

`validateUnitMove` also needs `getVisibility` (`fog-of-war.ts`) and
`buildUnitOccupancy`/`getUnitIdsAtCoord` (`unit-occupancy.ts`). Both of those import
`UNIT_DEFINITIONS` **from the `unit-system` barrel** (`fog-of-war.ts:3`,
`unit-occupancy.ts:3`), so once `validation` depends on them:

```
validation → fog-of-war   → unit-system(barrel) → queries → validation   ✗
validation → unit-occupancy → unit-system(barrel) → queries → validation ✗
```

This is latent today (nothing the barrel re-exports reaches fog-of-war or unit-occupancy) and
only becomes a cycle because of this change.

**Fix:** repoint both files' `UNIT_DEFINITIONS` import at the `unit-definitions` leaf — the
identical one-line change MR3 applied to `zone-of-control-system.ts`. Audited: those two are the
**only** modules transitively reachable from `unit-movement-queries` that import the barrel
(`owner-hostility`, `diplomacy-system`, `river-system`, `hex-utils`, `unit-movement-*`,
`unit-definitions` were all checked and import nothing from `unit-system`).

## Error handling

- Unknown `unitId` → `null` (both call sites already guard `state.units[unitId]`).
- Resolver returns `missing-unit` → `null` (not a player-facing tap reason).
- A foreign-city destination still resolves to `foreign-city` + `BLOCKING_MAP_ENTITY_MESSAGES`,
  exactly as today. In `map-tap-intent` a hostile city is handled by the city-action preview
  earlier, so the explainer normally never sees one; the feedback helper can, and its behaviour
  is unchanged.
- `MovementBlockerReason['code']` keeps every existing code, so no consumer `switch` breaks.
  `missing-unit` is deliberately **not** added to it.

## Cross-cutting properties (review fixes D4–D6, D8)

- **Data / saved games.** `MovementBlockerReason` is transient presentation data. It reaches the
  UI through `MapTapIntent`, which is never persisted — `pendingIntent` lives in the
  selection-store's module-local memory (`src/app/selection-store.ts:24`), not in `GameState`.
  **No save migration, no `SAVE_VERSION` bump.**
- **SFX.** `handleSelectedUnitMovementBlocker` maps every code except `unexplored` /
  `unknown-tile` to `type: 'warning'`, which plays `SFX.error` and reselects the unit. The new
  `zone-of-control` code therefore buzzes like any other refusal — correct (the move is being
  refused), and it replaces today's *silent deselect*. Must be covered by a test.
- **Difficulty modes.** Verified: `src/systems/zone-of-control-system.ts` takes no
  challenge-profile input, so the new reason is difficulty-invariant, like the rest of movement.
- **Extensibility.** Territorial access (#870/#871) still lands in `unit-movement-legality.ts`;
  the extracted validation module consumes it automatically, so both the executor and the
  explainer pick it up with no further wiring — one seam, two surfaces.

## Testing

- **Migrate** the three existing explainer test files to the new signature (26 call sites across
  `unit-system.test.ts`, `naval-water-class.test.ts`, `unit-movement.test.ts`). Their fixtures
  build a bare `Unit` + `GameMap` and must gain a minimal `GameState`.
  **Expectations will not all survive unchanged** (review fix D3): the resolver applies checks
  the explainer lacked (cargo aboard, hostile occupant on the destination, path crossing a
  hostile occupant or blocking entity, player unexplored-path), so a case that previously
  returned `null` or one code may now return a different one. Every changed expectation must be
  individually justified in the PR body as an intended convergence onto the executor's answer —
  a bulk "updated to match" is not acceptable.
- **New:** ZoC dead-end regression — a tile past an enemy ZoC chokepoint within movement range
  yields a non-null `zone-of-control` reason, and `resolveMapTapIntent` returns
  `blocked-movement` instead of `deselect`.
- **New:** redaction unit tests (unexplored → generic; explored → pass-through), plus
  `map-tap-intent` now redacting an unexplored destination.
- **New:** parity — every `resolveUnitMoveIntent` rejection for an explored destination yields a
  non-null explainer reason with the **same** `code`. Replaces the `.todo` in
  `unit-movement-resolver-parity.test.ts`.
- **New:** naval-onto-land copy asserted on **both** the resolver and the explainer.
- **New:** `zone-of-control` produces `type: 'warning'` + `SFX.error` through
  `handleSelectedUnitMovementBlocker`.
- **New:** boundary — `unit-movement-validation` is in the acyclicity check and imports none of
  `unit-system` / `unit-movement-system` / `unit-movement-queries`; `unit-movement-system` still
  re-exports the validation API (barrel-compat ratchet).
- Regression suites that must stay green: `unit-system`, `unit-movement*`, `naval-water-class`,
  `movement-resolver`, `unit-movement-characterization`, `unit-movement-resolver-parity`,
  `zone-of-control-system`, `architecture-boundaries`, `tests/app/controllers/**`, `tests/ai/**`,
  `tests/input/**`, plus the slow tier (determinism + save-compat).

## Non-goals

Path-aware redaction (#1002). Changing ZoC rules, movement costs, unit stats, or the range BFS.
Converting other #1025 action families. Migrating the ~200 `unit-system` importers — the only
module that moves is `validateUnitMove`'s cluster into `unit-movement-validation.ts`, and
`unit-movement-system.ts` re-exports it so its own importers are untouched. No `findPath`
performance work (that is the separately-tracked MR5). No save-schema change.

## Multi-dimensional design review — findings and resolutions

| # | Dimension | Finding | Sev | Resolution |
|---|---|---|---:|---|
| D1 | Architecture | The first draft's cycle fix (repoint `unit-movement-system`'s barrel imports at specific modules) **does not work** — `moveUnitWithZoneOfControl` genuinely lives in `unit-system.ts`, so `queries → movement-system → unit-system → queries` persists. | **High** | Extract `unit-movement-validation.ts`; verified `validateUnitMove` needs nothing from `unit-system.ts`. Graph redrawn above. |
| D2 | UI / UX / Ages 7–43 | Proposed copy used the jargon "zone of control"; the codebase's own player voice for this mechanic is `'⚠ Enemy nearby — entering ends movement.'` | Medium | Copy changed to "An enemy nearby would stop your unit before it reaches that tile."; jargon kept in the code identifier only. |
| D3 | Testing | Draft claimed the 26 migrated call sites keep "same expectations" — false, since the resolver adds checks the explainer lacked. | Medium | Testing section now requires each changed expectation to be individually justified; bulk "updated to match" disallowed. |
| D4 | Data / saved games | Draft never established that the new reason code is unpersisted. | Low | Verified `pendingIntent` is selection-store memory, not `GameState`. No migration. Stated. |
| D5 | SFX | Draft did not cover the audio consequence of a new code. | Low | `zone-of-control` → `warning` → `SFX.error`; stated and given a test. |
| D6 | Difficulty modes | Draft did not assert difficulty-invariance. | Low | Verified: `zone-of-control-system.ts` has no challenge-profile input. Stated. |
| D7 | Architecture / scope | Draft understated the blast radius of the cycle fix. | Medium | Barrel-compat re-export requirement + boundary ratchet added. |
| D8 | Extensibility | Territorial-access consequence of the new layer unstated. | Low | Stated: #870/#871 lands in legality; validation consumes it for both surfaces. |
| D9 | UX | Foreign-city and `missing-unit` behaviour unspecified. | Low | Both spelled out under Error handling. |
| D10 | Architecture | Extracting validation exposes a **second** cycle: `validateUnitMove` needs `fog-of-war` and `unit-occupancy`, both of which import `UNIT_DEFINITIONS` from the `unit-system` barrel. | **High** | Repoint both at the `unit-definitions` leaf (same one-line fix MR3 made to `zone-of-control-system`). Full reachability audit done — those two are the only offenders. |
| — | Balancing / fun / new mechanics | No rule, cost, stat or unit-definition change. The ZoC reason surfaces an existing mechanic the player currently experiences as an unexplained deselect. | none | — |
| — | Play styles | Affects any style that manoeuvres near enemy units; symmetric, no bias toward tall/wide/aggressive/turtle. | none | — |
| — | Computer players | AI never calls the explainer (verified: only `src/input/**`). The resolver it now shares is the one the AI already executes through, so preview and AI converge rather than diverge. | none | — |
| — | Solo / hot-seat regressions | Owner-scoped throughout: `civId: unit.owner`, and the feedback helper's `visibilityState` moves from `state.currentPlayer` to `unit.owner`. No viewer-dependent legality. | none (fix) | — |
| — | Proper implementation | Derive-then-redact keeps one legality implementation and one redaction rule, each independently testable; the ZoC check reuses the executor's own `getZoneOfControlAt` predicate rather than re-deriving it. | none | — |
