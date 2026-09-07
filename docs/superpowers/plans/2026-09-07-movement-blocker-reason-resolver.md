# MR4 — Derive the movement tap-explainer from the canonical resolver

> **For agentic workers:** execute this plan **inline** with
> `superpowers:executing-plans`. `CLAUDE.md` forbids subagents in this repository —
> do NOT use `subagent-driven-development`. Steps use `- [ ]` checkboxes.

**Goal:** Make `getMovementBlockerReason` a viewer-scoped projection of
`resolveUnitMoveIntent` instead of a second hand-rolled implementation of movement legality,
and close the live "tap past an enemy zone of control silently deselects your unit" bug.

**Architecture:** *Derive, then redact.* One omniscient legality source
(`resolveUnitMoveIntent`), one named viewer-scoping rule
(`redactMovementRejectionForViewer`), one explainer that composes them. Extracting
`unit-movement-validation.ts` is required to keep the import graph acyclic.

**Tech Stack:** TypeScript, Vitest, Vite. No new dependencies.

**Design doc:** `docs/superpowers/specs/2026-09-07-movement-blocker-reason-resolver-design.md`
(read it first — it carries the reasoning and the 10 reviewed findings).

## Global Constraints

- Base commit `69f69bdf`. Fresh worktree `movement-blocker-reason-resolver-mr4`.
- **No gameplay rule, movement cost, unit stat, or ZoC rule change.** Difficulty-invariant.
- **No `GameState` shape change** ⇒ no save migration, no `SAVE_VERSION` bump.
- Player-facing copy must avoid the term "zone of control" — match the existing voice at
  `src/ui/selected-unit-info.ts:624` (`'⚠ Enemy nearby — entering ends movement.'`).
  The exact new string is `'An enemy nearby would stop your unit before it reaches that tile.'`
- Never use `state.currentPlayer` for movement legality or visibility — always `unit.owner`.
- Commands: `bash scripts/run-with-mise.sh yarn <cmd>` (never `eval "$(mise activate bash)"`).
- Bash tool timeouts: `git commit` → 30000 ms; `git push` / `gh pr create` / `gh pr merge` →
  240000 ms.
- Run `bash scripts/check-src-rule-violations.sh <changed src files>` before each commit.

## Player-visible behaviour changes (review fix P5)

This MR is **not** behaviour-preserving at the UI layer. Every change below is intentional —
each one converges the preview onto what the executor would actually do. All three must be
named in the PR body.

1. **Tapping a tile past an enemy zone of control** used to silently deselect the unit. It now
   shows *"An enemy nearby would stop your unit before it reaches that tile."* (**bug fix**)
2. **Tapping an unexplored tile** in the map-tap path used to leak a specific reason (e.g.
   "Land units cannot cross water yet.", revealing the terrain). It now shows the generic
   *"Too far away to spot."* — the redaction the feedback helper already applied. (**leak fix**)
3. **Tapping a tile whose route crosses unexplored territory** now reports *"Move one step at a
   time into unexplored territory."* The explainer previously had no path-visibility rule at
   all, so this message reaches the tap surface for the first time. It is the resolver's
   existing player-move rule — the message the executor would have produced anyway — so the
   preview and the executor now agree instead of diverging. (**new message on this surface**)

Change 3 is the one most likely to look like a regression in review. It is not: it is the
`isPlayerControlledMove` branch of `validateUnitMove`, unchanged, finally surfacing.

## Deviation from this plan — runtime import cycle (discovered at Task 8)

The plan below keeps `getMovementBlockerReason` in `unit-movement-queries.ts`. The full
`yarn test` run at Task 8 surfaced a **load-order** circular import the design's static
review missed: `unit-movement-queries` (on the `unit-system` barrel) → `unit-movement-validation`
→ `unit-occupancy` → `air-operations-system` → back into the `unit-system` barrel
mid-initialisation, leaving `TRAINABLE_UNITS` / `BUILDINGS` undefined for ~65 downstream test
files. Resolution (shipped, commit `3c728d6a`):

- `getMovementBlockerReason`, `redactMovementRejectionForViewer` and `findZoneOfControlStop`
  moved into a **new `src/systems/unit-movement-explainer.ts`** that is **not** re-exported
  through the `unit-system` barrel. `MovementBlockerReason` (a pure type) stays in
  `unit-movement-queries.ts` as the shared vocabulary.
- `src/input/map-tap-intent.ts` and `src/input/selected-unit-movement-feedback.ts` import
  `getMovementBlockerReason` from `@/systems/unit-movement-explainer` directly.
- The test file the plan calls `unit-movement-queries-redaction.test.ts` shipped (and was then
  renamed) as **`tests/systems/unit-movement-explainer.test.ts`**.
- `architecture-boundaries.test.ts` gained an `explainer → validation`-only assertion plus a
  "not on the barrel" assertion; `.claude/rules/movement-actions.md` and
  `.claude/rules/game-systems.md` document the module and the cycle reason.

Where a task below says "`unit-movement-queries.ts`" for the explainer/redaction functions,
read "`unit-movement-explainer.ts`".

## File Structure

| File | Responsibility | Change |
|---|---|---|
| `src/systems/fog-of-war.ts` | fog | modify import only |
| `src/systems/unit-occupancy.ts` | occupancy | modify import only |
| `src/systems/unit-movement-validation.ts` | **NEW** — the one legality+cost answer | create |
| `src/systems/unit-movement-system.ts` | execution + re-export of validation | modify |
| `src/systems/unit-movement-queries.ts` | viewer-scoped explainer + redaction | modify |
| `src/input/map-tap-intent.ts` | tap intent | modify call site |
| `src/input/selected-unit-movement-feedback.ts` | tap feedback | modify call site |
| `tests/systems/helpers/movement-explainer-fixture.ts` | **NEW** — wraps `Unit`+`GameMap` in a minimal `GameState` | create |
| `tests/app/architecture-boundaries.test.ts` | layering guards | modify |
| `tests/systems/unit-movement-resolver-parity.test.ts` | parity guard | modify |
| `.claude/rules/movement-actions.md` | movement contract rule | modify |

---

### Task 1: Close the latent fog-of-war / unit-occupancy barrel cycle

**Files:**
- Modify: `src/systems/fog-of-war.ts:3`
- Modify: `src/systems/unit-occupancy.ts:3`
- Test: `tests/app/architecture-boundaries.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `fog-of-war` and `unit-occupancy` no longer import the `unit-system` barrel, so
  Task 2's new validation module can depend on them without a cycle.

- [ ] **Step 1: Write the failing boundary test**

Add inside the existing `describe('#1010 — unit-system movement decomposition boundaries', …)`
block in `tests/app/architecture-boundaries.test.ts`:

```ts
  it('fog-of-war and unit-occupancy import the catalog leaf, not the unit-system barrel', () => {
    // #1025 MR4: unit-movement-validation depends on both. If they reach UNIT_DEFINITIONS
    // through the barrel (which re-exports unit-movement-queries, which imports validation),
    // that closes a cycle. Point them at the leaf instead — same fix MR3 made for
    // zone-of-control-system.
    for (const file of ['fog-of-war.ts', 'unit-occupancy.ts']) {
      expect(importsOf(file), file).not.toContain('unit-system');
      expect(importsOf(file), file).toContain('unit-definitions');
    }
  });
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts -t "catalog leaf"`
Expected: FAIL — `expected [ …, 'unit-system', … ] not to contain 'unit-system'`

- [ ] **Step 3: Repoint both imports**

`src/systems/fog-of-war.ts` line 3, replace:

```ts
import { UNIT_DEFINITIONS } from './unit-system';
```

with:

```ts
// #1025 MR4: import from the catalog leaf, not the unit-system barrel — the barrel
// re-exports unit-movement-queries, which imports unit-movement-validation, which
// imports this module. Going through the leaf keeps that graph acyclic.
import { UNIT_DEFINITIONS } from './unit-definitions';
```

`src/systems/unit-occupancy.ts` line 3, replace:

```ts
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
```

with:

```ts
// #1025 MR4: catalog leaf, not the barrel — see fog-of-war.ts for why.
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
```

- [ ] **Step 4: Run the test and the affected suites**

Run:
```
bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts tests/systems/fog-of-war.test.ts tests/systems/unit-occupancy.test.ts
```
Expected: PASS, all files.

- [ ] **Step 5: Build and source-rule check**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: `✓ built`

Run: `bash scripts/check-src-rule-violations.sh src/systems/fog-of-war.ts src/systems/unit-occupancy.ts`
Expected: no output, exit 0.

- [ ] **Step 6: Commit**

```bash
git add src/systems/fog-of-war.ts src/systems/unit-occupancy.ts tests/app/architecture-boundaries.test.ts
git commit -m "refactor(systems): import UNIT_DEFINITIONS from the catalog leaf in fog-of-war and unit-occupancy (#1025)"
```

---

### Task 2: Extract `unit-movement-validation.ts` (verbatim move)

**Files:**
- Create: `src/systems/unit-movement-validation.ts`
- Modify: `src/systems/unit-movement-system.ts`
- Test: `tests/app/architecture-boundaries.test.ts`

**Interfaces:**
- Consumes: Task 1's acyclic `fog-of-war` / `unit-occupancy`.
- Produces:
  - `unit-movement-validation.ts` exports `ExecuteUnitMoveOptions`, **`MovementRejection`**,
    `ValidatedUnitMove`, `MoveResolution`, `UnitMoveValidationResult`,
    `validateUnitMove(state, unitId, to, options)`,
    `resolveUnitMoveIntent(state, unitId, to, options)`, `getImpassableReason(unitType, terrain)`,
    `getOwnerCompletedTechs(state, owner)`, `movementFailure(...)`, `normalizeDestination(...)`.
  - `unit-movement-system.ts` keeps `WonderDiscoveryResult` and `ExecuteUnitMoveResult`, and
    re-exports the validation API so its ~20 importers are unchanged.

This is a **behaviour-preserving move**. Move the code verbatim; do not edit any function body.

**Type ownership (review fix P1).** `WonderDiscoveryResult` and the `{ ok: true }` arm of
`ExecuteUnitMoveResult` are *execution* outputs and must **not** move into the validation
module. Split the union instead: validation owns the rejection shape, execution composes it.

In `src/systems/unit-movement-validation.ts`:

```ts
/** The typed rejection shared by validation and execution. */
export type MovementRejection = {
  ok: false;
  from: HexCoord;
  to: HexCoord;
  path: HexCoord[];
  reason: UnitMovementBlockerCode | 'missing-unit';
  message: string;
  revealedTiles: [];
  discoveredWonders: [];
};

export type UnitMoveValidationResult =
  | { ok: true; from: HexCoord; to: HexCoord; path: HexCoord[]; cost: number }
  | MovementRejection;

export type MoveResolution =
  | { ok: true; command: ValidatedUnitMove }
  | MovementRejection;
```

and in `src/systems/unit-movement-system.ts` keep:

```ts
export interface WonderDiscoveryResult { /* unchanged */ }

export type ExecuteUnitMoveResult =
  | { ok: true; from: HexCoord; to: HexCoord; path: HexCoord[]; revealedTiles: HexCoord[];
      discoveredWonders: WonderDiscoveryResult[];
      villageOutcome?: { outcome: VillageOutcomeType; message: string; position: HexCoord };
      stopReason?: 'zone-of-control' }
  | MovementRejection;
```

- [ ] **Step 1: Create the new module with the moved code**

Create `src/systems/unit-movement-validation.ts`. Move, **verbatim**, from
`src/systems/unit-movement-system.ts`: the `ExecuteUnitMoveOptions` type, the
`declare const validatedUnitMoveBrand` line, `ValidatedUnitMove`, `movementFailure`,
`getOwnerCompletedTechs`, `getImpassableReason`, `normalizeDestination`, `validateUnitMove`,
`resolveUnitMoveIntent` — plus the three type declarations written out above.

Header:

```ts
import type { GameState, HexCoord, UnitType, VillageOutcomeType } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { getVisibility } from '@/systems/fog-of-war';
import { hexKey, wrappedHexDistance, hexDistance } from '@/systems/hex-utils';
import { buildUnitOccupancy, getUnitIdsAtCoord } from '@/systems/unit-occupancy';
import { UNIT_DEFINITIONS } from '@/systems/unit-definitions';
import { canHullEnterOcean, getMovementCostForUnitInContext, getMovementStepCost } from '@/systems/unit-movement-cost';
import { getBlockingMapEntityAt, BLOCKING_MAP_ENTITY_MESSAGES, type UnitMovementBlockerCode, type BlockingMapEntity } from '@/systems/unit-movement-legality';
import { findPath } from '@/systems/unit-pathfinding';

/**
 * Movement validation (#1025 / #1010) — the ONE legality + cost answer for ordinary
 * unit movement. Deliberately **omniscient**: it sees the whole `GameState`, because it
 * is what the executor trusts. The viewer-scoped projection of these rejections lives in
 * `unit-movement-queries.ts` (`getMovementBlockerReason`), never here — see #1002.
 *
 * Extracted from `unit-movement-system.ts` so the explainer can depend on it without the
 * cycle `queries → unit-movement-system → unit-system(barrel) → queries`
 * (`moveUnitWithZoneOfControl` genuinely lives in `unit-system.ts`, so that edge cannot go).
 * `unit-movement-system.ts` re-exports everything here for its existing importers.
 */
```

Export every moved symbol (`movementFailure`, `getOwnerCompletedTechs`, `getImpassableReason`,
`normalizeDestination` were file-local — export them now; `unit-movement-system.ts` still needs
`getOwnerCompletedTechs`).

- [ ] **Step 2: Delete the moved code from `unit-movement-system.ts` and re-export**

Remove those declarations from `src/systems/unit-movement-system.ts`. Add near the top:

```ts
import {
  getOwnerCompletedTechs,
  resolveUnitMoveIntent,
  type ExecuteUnitMoveOptions,
  type MovementRejection,
  type ValidatedUnitMove,
} from '@/systems/unit-movement-validation';

// #1025 MR4: validation moved to its own module so the viewer-scoped explainer can derive
// from it without an import cycle. Re-exported so every existing importer is unchanged.
export {
  validateUnitMove,
  resolveUnitMoveIntent,
  getImpassableReason,
  type ValidatedUnitMove,
  type MoveResolution,
  type MovementRejection,
  type ExecuteUnitMoveOptions,
} from '@/systems/unit-movement-validation';
```

Prune any now-unused imports from `unit-movement-system.ts` (`getVisibility`,
`buildUnitOccupancy`, `getUnitIdsAtCoord`, `wrappedHexDistance`, `hexDistance`,
`getMovementCostForUnitInContext`, `canHullEnterOcean`, `findPath`, `BLOCKING_MAP_ENTITY_MESSAGES`,
`getBlockingMapEntityAt`, `BlockingMapEntity`, `UnitMovementBlockerCode`) — `yarn build` will
name every one that is still needed.

- [ ] **Step 3: Build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: `✓ built`. Fix any unused-import errors it names, then re-run until clean.

- [ ] **Step 4: Add the boundary asserts**

In `tests/app/architecture-boundaries.test.ts`, add `'unit-movement-validation'` to the
`MOVEMENT_MODULES` array, and add:

```ts
  it('validation is leaf-ward: it imports no execution, barrel, or query module', () => {
    const validation = importsOf('unit-movement-validation.ts');
    for (const forbidden of ['unit-system', 'unit-movement-system', 'unit-movement-queries']) {
      expect(validation, `validation must not import ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('unit-movement-system still re-exports the validation API (barrel compat)', async () => {
    const mod = await import('@/systems/unit-movement-system');
    for (const name of ['validateUnitMove', 'resolveUnitMoveIntent', 'executeValidatedUnitMove', 'executeUnitMove']) {
      expect(mod, `unit-movement-system must export ${name}`).toHaveProperty(name);
    }
  });
```

- [ ] **Step 5: Run the movement + boundary suites**

Run:
```
bash scripts/run-with-mise.sh yarn vitest run tests/app/architecture-boundaries.test.ts tests/systems/movement-resolver.test.ts tests/systems/unit-movement-system.test.ts tests/systems/unit-movement-characterization.test.ts tests/systems/unit-movement-resolver-parity.test.ts
```
Expected: all PASS (1 todo in the parity file).

- [ ] **Step 6: Commit**

```bash
git add src/systems/unit-movement-validation.ts src/systems/unit-movement-system.ts tests/app/architecture-boundaries.test.ts
git commit -m "refactor(movement): extract validateUnitMove/resolveUnitMoveIntent into unit-movement-validation.ts (#1025)"
```

---

### Task 3: Give the resolver the naval-onto-land message

**Files:**
- Modify: `src/systems/unit-movement-validation.ts` (`getImpassableReason`)
- Test: `tests/systems/movement-resolver.test.ts`

**Interfaces:**
- Consumes: Task 2's `getImpassableReason`.
- Produces: `getImpassableReason(unitType, terrain)` returns
  `{ reason: 'impassable-terrain', message: 'Naval units cannot move on land.' }` for a naval
  unit on a land tile.

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/movement-resolver.test.ts`:

```ts
describe('#1025 MR4 — impassable-terrain copy', () => {
  it('a naval unit onto land gets the naval-specific message, not the generic one', () => {
    const map = grasslandMap(4, 3);
    map.tiles[hexKey({ q: 0, r: 0 })]!.terrain = 'coast';
    const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
    const galley = createUnit('galley', 'player', { q: 0, r: 0 }, c);
    const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible' as const])) };
    const state = {
      turn: 1, era: 1, gameId: 'naval-copy', currentPlayer: 'player', gameOver: false, winner: null, map,
      units: { [galley.id]: galley }, cities: {}, barbarianCamps: {}, tribalVillages: {},
      civilizations: {
        player: {
          id: 'player', name: 'Player', color: '#4a90d9', isHuman: true, civType: 'generic',
          cities: [], units: [galley.id],
          techState: { completed: [], currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {} },
          gold: 0, visibility, knownCivilizations: [], score: 0,
          diplomacy: createDiplomacyState(['player'], 'player'),
        },
      },
    } as unknown as GameState;

    const res = resolveUnitMoveIntent(state, galley.id, { q: 1, r: 0 }, asPlayer);
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.reason).toBe('impassable-terrain');
    expect(res.message).toBe('Naval units cannot move on land.');
  });
});
```

**Exact imports to add (review fix P4).** `tests/systems/movement-resolver.test.ts` already
imports `hexKey`, `createDiplomacyState`, and its local `grasslandMap` / `asPlayer` helpers.
It does **not** import `createUnit`. Add exactly one line:

```ts
import { createUnit } from '@/systems/unit-system';
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/movement-resolver.test.ts -t "naval-specific message"`
Expected: FAIL — `expected 'This terrain cannot be entered.' to be 'Naval units cannot move on land.'`

- [ ] **Step 3: Add the branch**

In `src/systems/unit-movement-validation.ts`, inside `getImpassableReason`, insert **after** the
`requires-ocean-hull` branch and **before** the `ocean || coast` branch:

```ts
  // #1025 MR4: a naval unit tapping land gets the specific message the tap explainer
  // already used, so the executor and the preview cannot disagree on copy.
  if (domain === 'naval') {
    return { reason: 'impassable-terrain', message: 'Naval units cannot move on land.' };
  }
```

- [ ] **Step 4: Run the test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/movement-resolver.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-movement-validation.ts tests/systems/movement-resolver.test.ts
git commit -m "fix(movement): resolver reports the naval-onto-land message (#1025)"
```

---

### Task 4: Add the viewer redaction rule

**Files:**
- Modify: `src/systems/unit-movement-queries.ts`
- Test: `tests/systems/unit-movement-queries-redaction.test.ts` (create)

**Interfaces:**
- Produces:
  `export function redactMovementRejectionForViewer(reason: MovementBlockerReason, visibilityState: VisibilityState | undefined): MovementBlockerReason`

- [ ] **Step 1: Write the failing test**

Create `tests/systems/unit-movement-queries-redaction.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { redactMovementRejectionForViewer } from '@/systems/unit-movement-queries';

describe('#1025 MR4 — viewer redaction', () => {
  const specific = { code: 'impassable-water' as const, message: 'Land units cannot cross water yet.' };

  it('redacts any reason to the generic one when the destination is unexplored', () => {
    expect(redactMovementRejectionForViewer(specific, 'unexplored'))
      .toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });

  it('passes the reason through unchanged when the destination is explored', () => {
    // VisibilityState is 'unexplored' | 'fog' | 'visible' (src/core/types.ts:431) —
    // there is no 'fogged'.
    expect(redactMovementRejectionForViewer(specific, 'visible')).toEqual(specific);
    expect(redactMovementRejectionForViewer(specific, 'fog')).toEqual(specific);
  });

  it('passes through when the viewer supplied no visibility', () => {
    expect(redactMovementRejectionForViewer(specific, undefined)).toEqual(specific);
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-queries-redaction.test.ts`
Expected: FAIL — `redactMovementRejectionForViewer is not a function`

- [ ] **Step 3: Implement it**

Add to `src/systems/unit-movement-queries.ts`:

```ts
/**
 * The ONE viewer-scoping rule for movement rejections (#1025 MR4 / #1002).
 * `resolveUnitMoveIntent` is deliberately omniscient — it sees units, blockers and terrain the
 * viewer has not discovered. Surfacing its reason verbatim would leak that. When the
 * destination is unexplored to the viewer, every reason collapses to the generic one.
 *
 * Known limitation (owned by #1002): this keys off the DESTINATION only. If the destination is
 * explored but a path tile is not, the reason can still describe that unexplored tile. Making
 * redaction path-aware is out of scope here — do not widen the leak, do not silently fix it.
 */
export function redactMovementRejectionForViewer(
  reason: MovementBlockerReason,
  visibilityState: VisibilityState | undefined,
): MovementBlockerReason {
  if (visibilityState === 'unexplored') {
    return { code: 'unexplored', message: 'Too far away to spot.' };
  }
  return reason;
}
```

- [ ] **Step 4: Run the test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-queries-redaction.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/systems/unit-movement-queries.ts tests/systems/unit-movement-queries-redaction.test.ts
git commit -m "feat(movement): add the single viewer-redaction rule for movement rejections (#1025)"
```

---

### Task 5: Add the `zone-of-control` reason and its detector

**Files:**
- Modify: `src/systems/unit-movement-queries.ts`
- Test: `tests/systems/unit-movement-queries-redaction.test.ts`

**Interfaces:**
- Produces:
  - `MovementBlockerReason['code']` gains `'zone-of-control'`.
  - `export function findZoneOfControlStop(state: GameState, unit: Unit, path: HexCoord[]): HexCoord | null`
    — the first path tile (excluding the start) whose entry is ZoC-limited, or `null`.

- [ ] **Step 1: Write the failing test**

Append to `tests/systems/unit-movement-queries-redaction.test.ts`:

```ts
import { findZoneOfControlStop } from '@/systems/unit-movement-queries';
import { createUnit } from '@/systems/unit-system';
import { createDiplomacyState } from '@/systems/diplomacy-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameMap, GameState } from '@/core/types';

function zocState(): { state: GameState; mover: ReturnType<typeof createUnit> } {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 6; q++) for (let r = 0; r < 3; r++) {
    tiles[hexKey({ q, r })] = {
      coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  const map: GameMap = { width: 6, height: 3, wrapsHorizontally: false, tiles, rivers: [] };
  const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const mover = createUnit('warrior', 'civ-a', { q: 0, r: 0 }, c);
  mover.movementPointsLeft = 4;
  // Enemy at (2,1) exerts ZoC over its neighbours, which includes (2,0).
  const enemy = createUnit('warrior', 'civ-b', { q: 2, r: 1 }, c);
  const state = {
    turn: 1, era: 1, gameId: 'zoc', currentPlayer: 'civ-a', gameOver: false, winner: null, map,
    units: { [mover.id]: mover, [enemy.id]: enemy }, cities: {}, barbarianCamps: {}, tribalVillages: {},
    civilizations: {
      'civ-a': { id: 'civ-a', units: [mover.id], techState: { completed: [] }, diplomacy: createDiplomacyState(['civ-a', 'civ-b'], 'civ-a') },
      'civ-b': { id: 'civ-b', units: [enemy.id], techState: { completed: [] }, diplomacy: createDiplomacyState(['civ-a', 'civ-b'], 'civ-b') },
    },
  } as unknown as GameState;
  return { state, mover };
}

describe('#1025 MR4 — zone-of-control stop detection', () => {
  it('reports the first ZoC-limited tile on the path', () => {
    const { state, mover } = zocState();
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }];
    expect(findZoneOfControlStop(state, mover, path)).toEqual({ q: 2, r: 0 });
  });

  it('returns null when no path tile is ZoC-limited', () => {
    const { state, mover } = zocState();
    const path = [{ q: 0, r: 0 }, { q: 1, r: 0 }];
    expect(findZoneOfControlStop(state, mover, path)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-queries-redaction.test.ts -t "zone-of-control stop"`
Expected: FAIL — `findZoneOfControlStop is not a function`

- [ ] **Step 3: Implement the detector and widen the code union**

In `src/systems/unit-movement-queries.ts`, add `| 'zone-of-control'` to the
`MovementBlockerReason['code']` union (after `'insufficient-movement'`), and add:

```ts
/**
 * The first tile on `path` (excluding the start) whose *entry* is Zone-of-Control limited,
 * or `null`. `moveUnitWithZoneOfControl` stops a unit immediately after entering such a tile,
 * so if this is not the destination the executor will stop the unit short.
 *
 * Derived from the executor's own predicate (`getZoneOfControlAt`) rather than re-deriving the
 * rule — the same "precomputation derived from the canonical rule" pattern
 * `getBlockingMapEntityKeys` uses. `getZoneOfControlAt` reads only the mover's type/owner and
 * the destination's neighbours, never the mover's position, so passing the unmoved unit for
 * every step gives the executor's answer.
 */
export function findZoneOfControlStop(
  state: GameState,
  unit: Unit,
  path: HexCoord[],
): HexCoord | null {
  for (const step of path.slice(1)) {
    if (getZoneOfControlAt(state, unit, step).limited) return step;
  }
  return null;
}
```

- [ ] **Step 4: Run the test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-queries-redaction.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Build and commit**

Run: `bash scripts/run-with-mise.sh yarn build` → `✓ built`

```bash
git add src/systems/unit-movement-queries.ts tests/systems/unit-movement-queries-redaction.test.ts
git commit -m "feat(movement): detect an executor zone-of-control stop for the tap explainer (#1025)"
```

---

### Task 6: Rewrite `getMovementBlockerReason` as resolve → project → redact

**Files:**
- Modify: `src/systems/unit-movement-queries.ts`
- Create: `tests/systems/helpers/movement-explainer-fixture.ts`
- Modify: `tests/systems/unit-system.test.ts`, `tests/systems/naval-water-class.test.ts`,
  `tests/systems/unit-movement.test.ts` (26 call sites)

**Interfaces:**
- Consumes: `resolveUnitMoveIntent` (Task 2), `redactMovementRejectionForViewer` (Task 4),
  `findZoneOfControlStop` (Task 5).
- Produces:
  `getMovementBlockerReason(state: GameState, unitId: string, to: HexCoord, options?: { visibilityState?: VisibilityState }): MovementBlockerReason | null`

- [ ] **Step 1: Write the failing dead-end regression test**

Append to `tests/systems/unit-movement-queries-redaction.test.ts`:

```ts
import { getMovementBlockerReason } from '@/systems/unit-system';

describe('#1025 MR4 — the ZoC tap dead-end', () => {
  it('a tile the executor would stop short of returns a reason instead of null', () => {
    const { state, mover } = zocState();
    const reason = getMovementBlockerReason(state, mover.id, { q: 3, r: 0 });
    expect(reason).not.toBeNull();
    expect(reason!.code).toBe('zone-of-control');
    expect(reason!.message).toBe('An enemy nearby would stop your unit before it reaches that tile.');
  });

  it('redacts that reason when the destination is unexplored to the viewer', () => {
    const { state, mover } = zocState();
    const reason = getMovementBlockerReason(state, mover.id, { q: 3, r: 0 }, { visibilityState: 'unexplored' });
    expect(reason).toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });
});
```

- [ ] **Step 2: Run it and verify it fails**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-queries-redaction.test.ts -t "ZoC tap dead-end"`
Expected: FAIL — the old signature makes `state` the `unit` argument, so this errors or returns
`null`.

- [ ] **Step 3: Rewrite the function**

Replace the whole body of `getMovementBlockerReason` in
`src/systems/unit-movement-queries.ts` with:

```ts
/**
 * Why can this unit not move to `to` — the **viewer-scoped** answer (#1025 MR4).
 *
 * This owns NO legality of its own. It resolves through `resolveUnitMoveIntent` (the one
 * omniscient legality+cost source), projects that typed rejection, and then applies the one
 * redaction rule. `getZoneOfControlAt` is consulted only to describe an outcome the executor
 * would produce (a partial move), which the resolver reports as `ok: true`.
 *
 * Owner-scoped, never viewer-scoped, for legality: `civId` is always `unit.owner`, so hot-seat
 * viewing cannot change what a unit may do.
 */
export function getMovementBlockerReason(
  state: GameState,
  unitId: string,
  to: HexCoord,
  options: { visibilityState?: VisibilityState } = {},
): MovementBlockerReason | null {
  const unit = state.units[unitId];
  if (!unit) return null;

  const resolution = resolveUnitMoveIntent(state, unitId, to, {
    actor: 'player',
    civId: unit.owner,
  });

  if (!resolution.ok) {
    if (resolution.reason === 'missing-unit') return null;
    return redactMovementRejectionForViewer(
      { code: resolution.reason, message: resolution.message },
      options.visibilityState,
    );
  }

  const stop = findZoneOfControlStop(state, unit, resolution.command.path);
  const destination = resolution.command.to;
  if (stop && hexKey(stop) !== hexKey(destination)) {
    return redactMovementRejectionForViewer(
      {
        code: 'zone-of-control',
        message: 'An enemy nearby would stop your unit before it reaches that tile.',
      },
      options.visibilityState,
    );
  }

  return null;
}
```

Add the imports it needs at the top of the file:

```ts
import { resolveUnitMoveIntent } from './unit-movement-validation';
```

Remove the now-unused imports the old body used (`isPassableForUnitInContext`,
`canHullEnterOcean`, `getMovementStepCost`, `findPath`, `wrapHexCoord`, `UNIT_DEFINITIONS`,
`BLOCKING_MAP_ENTITY_MESSAGES`, `BlockingMapEntity`) **only if nothing else in the file still
uses them** — `getMovementRange` / `getMovementRangeDetails` still use several. Let
`yarn build` name the genuinely unused ones.

- [ ] **Step 4: Run the new test**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-queries-redaction.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Create the migration fixture helper**

Create `tests/systems/helpers/movement-explainer-fixture.ts`:

```ts
import type { GameMap, GameState, Unit } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';
import { createDiplomacyState } from '@/systems/diplomacy-system';

/**
 * Wraps a bare `Unit` + `GameMap` in the minimal `GameState` that
 * `getMovementBlockerReason` needs after #1025 MR4 changed its signature. Every tile is
 * `visible` to the unit's owner unless `visibility` overrides it, so migrated tests keep
 * their original (unredacted) expectations.
 */
export function explainerState(
  unit: Unit,
  map: GameMap,
  options: { completedTechs?: string[]; extraUnits?: Unit[] } = {},
): GameState {
  const units: Record<string, Unit> = { [unit.id]: unit };
  for (const extra of options.extraUnits ?? []) units[extra.id] = extra;
  const owners = Array.from(new Set(Object.values(units).map(u => u.owner)));
  const visibility = { tiles: Object.fromEntries(Object.keys(map.tiles).map(k => [k, 'visible' as const])) };
  return {
    turn: 1, era: 1, gameId: 'explainer-fixture', currentPlayer: unit.owner,
    gameOver: false, winner: null, map, units, cities: {}, barbarianCamps: {}, tribalVillages: {},
    civilizations: Object.fromEntries(owners.map(owner => [owner, {
      id: owner, name: owner, color: '#4a90d9', isHuman: owner === unit.owner, civType: 'generic',
      cities: [], units: Object.values(units).filter(u => u.owner === owner).map(u => u.id),
      techState: {
        completed: owner === unit.owner ? (options.completedTechs ?? []) : [],
        currentResearch: null, researchProgress: 0, researchQueue: [], trackPriorities: {},
      },
      gold: 0, visibility, knownCivilizations: [], score: 0,
      diplomacy: createDiplomacyState(owners, owner),
    }])),
  } as unknown as GameState;
}
```

- [ ] **Step 6: Migrate the 26 existing call sites**

In `tests/systems/unit-system.test.ts`, `tests/systems/naval-water-class.test.ts` and
`tests/systems/unit-movement.test.ts`, replace every

```ts
getMovementBlockerReason(someUnit, coord, someMap, { completedTechs, blockingEntity, visibilityState })
```

with

```ts
getMovementBlockerReason(explainerState(someUnit, someMap, { completedTechs }), someUnit.id, coord, { visibilityState })
```

(dropping `blockingEntity` — the resolver now derives it; add `extraUnits` where a test needs a
city/camp/enemy, and put the city/camp on the returned state before calling).

**Do not bulk-update expectations.** Run the suites after the mechanical rewrite and treat every
failure individually: the resolver applies checks the old explainer lacked, so some cases
legitimately return a different code now. Record each changed expectation and its justification
— they go in the PR body.

- [ ] **Step 7: Update the two `src/` call sites — required for the build (review fix P2)**

The signature change breaks both callers, so they must move in **this** task; `yarn build`
cannot pass otherwise.

`src/input/map-tap-intent.ts`, replace lines 155-158:

```ts
      const reason = getMovementBlockerReason(state, selectedUnitId, coord, {
        // #1025 MR4: redact against the UNIT OWNER's fog, never state.currentPlayer —
        // legality and its explanation are owner-scoped for hot seat.
        visibilityState: state.civilizations[selectedUnit.owner]?.visibility
          ? getVisibility(state.civilizations[selectedUnit.owner]!.visibility, coord)
          : undefined,
      });
```

Add `import { getVisibility } from '@/systems/fog-of-war';`; drop the `getBlockingMapEntityAt`
import if nothing else in the file uses it.

`src/input/selected-unit-movement-feedback.ts`, replace lines 22-34:

```ts
  const unit = state.units[unitId];
  if (!unit) return false;
  // #1025 MR4: owner-scoped, not state.currentPlayer — previously visibilityState came from
  // currentPlayer while completedTechs came from unit.owner, which disagreed in hot seat.
  const ownerVisibility = state.civilizations[unit.owner]?.visibility;
  const visibilityState = ownerVisibility ? getVisibility(ownerVisibility, target) : undefined;
  const reason = getMovementBlockerReason(state, unitId, target, { visibilityState });
  if (!reason) return false;
```

Drop its now-unused `getBlockingMapEntityAt` import.

- [ ] **Step 8: Run the migrated suites**

Run:
```
bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts tests/systems/naval-water-class.test.ts tests/systems/unit-movement.test.ts tests/systems/unit-movement-queries-redaction.test.ts tests/input/ tests/app/controllers/
```
Expected: PASS. For each expectation you changed, write one line of justification for the PR.

- [ ] **Step 9: Build and commit**

Run: `bash scripts/run-with-mise.sh yarn build` → `✓ built`
Run: `bash scripts/check-src-rule-violations.sh src/systems/unit-movement-queries.ts src/input/map-tap-intent.ts src/input/selected-unit-movement-feedback.ts` → exit 0

```bash
git add src/systems/unit-movement-queries.ts src/input/map-tap-intent.ts src/input/selected-unit-movement-feedback.ts tests/systems/helpers/movement-explainer-fixture.ts tests/systems/unit-system.test.ts tests/systems/naval-water-class.test.ts tests/systems/unit-movement.test.ts tests/systems/unit-movement-queries-redaction.test.ts
git commit -m "refactor(movement): derive the tap explainer from the canonical resolver (#1025)"
```

---

### Task 7: Input-layer regressions for the dead-end, redaction and SFX

**Files:**
- Test: `tests/input/map-tap-intent.test.ts`

**Interfaces:**
- Consumes: Task 6's rewritten explainer and its two updated call sites.
- Produces: nothing — this task is regressions only.

- [ ] **Step 1: Add the shared fixture to the test file**

Append to `tests/input/map-tap-intent.test.ts`:

```ts
import { explainerState } from '../systems/helpers/movement-explainer-fixture';
import { handleSelectedUnitMovementBlocker } from '@/input/selected-unit-movement-feedback';
import { createUnit } from '@/systems/unit-system';
import { hexKey } from '@/systems/hex-utils';
import type { GameMap, GameState } from '@/core/types';

function zocTapFixture(): { state: GameState; moverId: string } {
  const tiles: GameMap['tiles'] = {};
  for (let q = 0; q < 6; q++) for (let r = 0; r < 3; r++) {
    tiles[hexKey({ q, r })] = {
      coord: { q, r }, terrain: 'grassland', elevation: 'lowland', resource: null,
      improvement: 'none', owner: null, improvementTurnsLeft: 0, hasRiver: false, hasRoad: false, wonder: null,
    };
  }
  const map: GameMap = { width: 6, height: 3, wrapsHorizontally: false, tiles, rivers: [] };
  const c = { nextUnitId: 1, nextCityId: 1, nextCampId: 1, nextQuestId: 1 };
  const mover = createUnit('warrior', 'civ-a', { q: 0, r: 0 }, c);
  mover.movementPointsLeft = 4;
  const enemy = createUnit('warrior', 'civ-b', { q: 2, r: 1 }, c);
  return { state: explainerState(mover, map, { extraUnits: [enemy] }), moverId: mover.id };
}

// SelectionSnapshot requires pendingIntent and waterRecovery (src/app/ports.ts:86-92).
function snapshotFor(moverId: string) {
  return {
    selectedUnitId: moverId,
    movementRange: [],
    attackRange: [],
    pendingIntent: { kind: 'none' },
    waterRecovery: { kind: 'none' },
  } as never;
}
```

- [ ] **Step 2: Write the failing regressions**

```ts
  it('#1025 MR4: a tap past an enemy zone of control explains instead of deselecting', () => {
    const { state, moverId } = zocTapFixture();
    const intent = resolveMapTapIntent(state, snapshotFor(moverId), { q: 3, r: 0 }, false);
    expect(intent.kind).toBe('blocked-movement');
    if (intent.kind !== 'blocked-movement') return;
    expect(intent.reason.code).toBe('zone-of-control');
  });

  it('#1025 MR4: an unexplored destination is redacted in the tap path', () => {
    const { state, moverId } = zocTapFixture();
    state.civilizations['civ-a']!.visibility.tiles = {};
    const intent = resolveMapTapIntent(state, snapshotFor(moverId), { q: 3, r: 0 }, false);
    expect(intent.kind).toBe('blocked-movement');
    if (intent.kind !== 'blocked-movement') return;
    expect(intent.reason).toEqual({ code: 'unexplored', message: 'Too far away to spot.' });
  });

  it('#1025 MR4: a zone-of-control refusal warns and plays the error cue', () => {
    const { state, moverId } = zocTapFixture();
    const messages: Array<{ message: string; type: string }> = [];
    let errors = 0;
    const handled = handleSelectedUnitMovementBlocker(
      state, moverId, { q: 3, r: 0 }, { kind: 'none' } as never,
      {
        showNotification: (message, type) => messages.push({ message, type }),
        reselectUnit: () => {},
        playError: () => { errors += 1; },
      },
    );
    expect(handled).toBe(true);
    expect(messages[0]!.type).toBe('warning');
    expect(errors).toBe(1);
  });
```

- [ ] **Step 3: Run them**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/input/map-tap-intent.test.ts -t "#1025 MR4"`
Expected: PASS (Task 6 already shipped the behaviour; these lock it in). If the first fails with
`deselect`, Task 6 Step 7's `map-tap-intent.ts` edit was not applied.

- [ ] **Step 4: Run the whole input + controller surface**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/input/ tests/app/controllers/`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tests/input/map-tap-intent.test.ts
git commit -m "test(input): lock in the zone-of-control tap explanation, redaction and error cue (#1025)"
```

---

### Task 8: Flip the parity guard, update the rules doc, full verification

**Files:**
- Modify: `tests/systems/unit-movement-resolver-parity.test.ts`
- Modify: `.claude/rules/movement-actions.md`

**Interfaces:**
- Consumes: everything above.

- [ ] **Step 1: Replace the `.todo` with a real assertion**

In `tests/systems/unit-movement-resolver-parity.test.ts`, delete the
`it.todo('explainer reproduces the resolver\'s hostile-occupant rejection (#1025 follow-up)')`
line and replace the first test's body with:

```ts
  it('every resolver rejection for an explored destination yields the same explainer code', () => {
    const { state, moverId } = fixture();
    const mismatches: string[] = [];
    for (const key of Object.keys(state.map.tiles)) {
      const [q, r] = key.split(',').map(Number) as [number, number];
      if (hexKey(state.units[moverId]!.position) === key) continue;
      const res = resolveUnitMoveIntent(state, moverId, { q, r }, { actor: 'player', civId: 'civ-a' });
      if (res.ok || res.reason === 'missing-unit') continue;
      const reason = getMovementBlockerReason(state, moverId, { q, r });
      if (reason?.code !== res.reason) {
        mismatches.push(`${key}: resolver=${res.reason} explainer=${reason?.code ?? 'null'}`);
      }
    }
    expect(mismatches, mismatches.join('\n')).toEqual([]);
  });
```

- [ ] **Step 2: Run it**

Run: `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-movement-resolver-parity.test.ts`
Expected: PASS, 0 todo.

- [ ] **Step 3: Update the movement-actions rule**

In `.claude/rules/movement-actions.md`, add `- "src/systems/unit-movement-validation.ts"` to the
frontmatter `paths:` list, and replace the paragraph that begins
"`getMovementBlockerReason` is a second (latent) legality derivation kept verbatim by #1010"
with:

```markdown
`getMovementBlockerReason` (`unit-movement-queries.ts`) is the **viewer-scoped projection** of
the resolver, not a second legality implementation (#1025 MR4). It resolves through
`resolveUnitMoveIntent`, then applies exactly one redaction rule
(`redactMovementRejectionForViewer`): when the destination is unexplored to the viewer every
reason collapses to "Too far away to spot." Validation is deliberately omniscient and lives in
`unit-movement-validation.ts`; the preview is deliberately viewer-scoped. **Never surface a
resolver rejection to a player without passing it through the redaction rule** — that is the
information leak #1002 tracks. Redaction is destination-only today; path-aware redaction is
#1002's scope.
```

- [ ] **Step 4: Full verification**

Run each and confirm:
```
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
git diff --check
```
Expected: build `✓ built`; `yarn test` exit 0; durable status "passed for <HEAD>"; diff clean.

- [ ] **Step 5: Commit**

```bash
git add tests/systems/unit-movement-resolver-parity.test.ts .claude/rules/movement-actions.md
git commit -m "test(movement): assert resolver/explainer parity and document the redaction rule (#1025)"
```

---

## Before the PR

- Perform the mandatory 17-dimension inline review (balancing gameplay, fun, new mechanics,
  ages 7–43, play styles, difficulty modes, computer players, UI, UX, architecture,
  extensibility, data, SFX, saved games, testing, solo regressions, hot-seat regressions,
  proper implementation). Fix every real in-scope finding before opening the PR.
- PR body must list **every migrated test expectation that changed** with its justification
  (Task 6 Step 6), all three "Player-visible behaviour changes" above, the new player-facing
  string, and the #1002 destination-only redaction limitation.
- PR footer: `Refs #1025`.
- Merge with `gh pr merge <N> --rebase --admin` after CI is green.

## Multi-dimensional plan review — findings and resolutions

| # | Dimension | Finding | Sev | Resolution |
|---|---|---|---:|---|
| P1 | Architecture / SRP | Draft moved `WonderDiscoveryResult` and the whole `ExecuteUnitMoveResult` union into the *validation* module — both are execution outputs. | Medium | Split the union: validation owns `MovementRejection`; `unit-movement-system.ts` keeps `WonderDiscoveryResult` and composes `ExecuteUnitMoveResult`. Task 2 rewritten. |
| P2 | Proper implementation | Task 6 ran `yarn build` while the two `src/input/` callers still used the old signature — **the build would fail**. | **High** | The call-site edits folded into Task 6 (Step 7); Task 7 became regressions-only. |
| P3 | Testing | Task 4's test used `'fogged'`; the real union is `'unexplored' \| 'fog' \| 'visible'` (`src/core/types.ts:431`) — a type error. | Medium | Corrected to `'fog'`, with the source line cited inline. |
| P4 | Testing | Task 3 said "add imports if not already present" — a placeholder. | Low | Verified `movement-resolver.test.ts` lacks only `createUnit`; the exact line is now given. |
| P5 | UI / UX | Plan never disclosed that routing through `actor: 'player'` surfaces the resolver's unexplored-path message on the tap path for the first time. | Medium | New "Player-visible behaviour changes" section; all three are now PR-body requirements. |
| P6 | Testing | Task 7's `SelectionSnapshot` literal omitted `pendingIntent` (read at `map-tap-intent.ts:88`) and `waterRecovery`. | Low | `snapshotFor()` helper now supplies the full shape, citing `src/app/ports.ts:86-92`. |
| — | Balancing / fun / new mechanics | No rule, cost, stat, or ZoC-mechanic change; the new reason describes an outcome the executor already produces. Fun improves — a silent deselect becomes an explanation. | none | — |
| — | Ages 7–43 | New copy avoids the "zone of control" term, matching `selected-unit-info.ts:624`'s existing voice; constraint pinned in Global Constraints. | none | — |
| — | Play styles / Difficulty | Symmetric across styles; ZoC takes no challenge-profile input (verified). | none | — |
| — | Computer players | The AI never calls the explainer (only `src/input/**`); the AI already executes through the same resolver, so preview and AI converge. | none | — |
| — | Data / saved games | No `GameState` field touched. `MovementBlockerReason` reaches the UI via `MapTapIntent`, which is selection-store memory, not persisted. No migration, no `SAVE_VERSION` bump. | none | — |
| — | SFX | New code maps to `warning` → `SFX.error`; asserted in Task 7 Step 2. | none | — |
| — | Solo / hot-seat regressions | `civId: unit.owner` everywhere; the feedback helper's `visibilityState` moves off `state.currentPlayer` (Task 6 Step 7). Full input + controller surface run in Task 6 Step 8 and Task 7 Step 4. | none (fix) | — |
| — | Extensibility | Territorial access (#870/#871) still lands in `unit-movement-legality.ts`; validation consumes it, so the executor and the explainer both pick it up with no extra wiring. | none | — |

## Self-Review

**Spec coverage:** derive-then-redact → Tasks 4/6; ZoC reason → Task 5/6; naval copy → Task 3;
hot-seat fix → Task 7; redaction at both call sites → Task 7; validation extraction (D1) →
Task 2; fog-of-war/unit-occupancy cycle (D10) → Task 1; boundary asserts (D7) → Tasks 1/2;
parity guard (D3) → Task 8; rules doc → Task 8. No spec section is unimplemented.

**Placeholders:** none — every code step carries the literal code.

**Type consistency:** `getMovementBlockerReason(state, unitId, to, options)` is used with that
exact shape in Tasks 6, 7 and 8. `findZoneOfControlStop(state, unit, path)` and
`redactMovementRejectionForViewer(reason, visibilityState)` match their definitions at every
call site. `MovementBlockerReason['code']` gains `'zone-of-control'` in Task 5 before Task 6
returns it.
