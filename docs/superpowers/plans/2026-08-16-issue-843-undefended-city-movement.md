# Issue 843 Root-Cause Fix Plan: Undefended Enemy Cities Aren't Movement Obstacles

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the movement-range preview (highlights, tap-intent resolution, AI/auto-explore
destination selection) agree with `validateUnitMove`'s actual rule that a foreign, non-allied
city can never be entered by ordinary movement — regardless of whether it currently has a
garrison. Today that agreement only holds by accident, for defended cities.

**Architecture:** The single shared BFS in `src/systems/unit-system.ts`
(`getMovementRange`/`getMovementRangeDetails`) becomes the one place that knows "a foreign,
unallied city tile blocks movement the same way a hostile unit does." Every consumer
(highlights, tap-intent, AI tactics, auto-explore) inherits the fix for free instead of
re-deriving or re-patching the rule locally.

**Tech Stack:** TypeScript, Vitest.

---

## Root cause (confirmed via reproduction)

`validateUnitMove` (`src/systems/unit-movement-system.ts`) already forbids entering or pathing
through a foreign, non-allied city via ordinary movement — that's the `'foreign-city'` reason,
tested in `tests/systems/unit-movement-system.test.ts`. But that check only runs at the moment a
move actually **executes**.

The movement-range *preview* functions that drive the UI highlight, the tap-intent resolver, and
AI/auto-explore destination scoring — `getMovementRange` and `getMovementRangeDetails` in
`src/systems/unit-system.ts` — have **zero awareness of `state.cities`**. They only consider:

1. Terrain passability (`isPassableForUnitInContext`)
2. Unit occupancy (hostile / neutral / friendly, via `unitPositions`/`unitOwners`)
3. Zone of Control (`getZoneOfControlAt`, itself purely unit-sourced — see
   `src/systems/zone-of-control-system.ts`, which never reads `state.cities`)

For a **defended** enemy city, the garrison unit standing on the city tile happens to trigger
the existing hostile-occupant/ZOC logic, which incidentally makes that tile terminal (BFS won't
walk past it) and only reachable when actually adjacent. That's why defended cities "work" today
— by coincidence, not by design.

For an **undefended** enemy city, there is no unit on the tile and it radiates no ZOC (ZOC is
unit-sourced only). The BFS treats the city hex as completely ordinary, freely walkable terrain:
it gets added to `reachable`/`movementRange` from arbitrarily far away (as long as movement
points allow), and the BFS keeps walking straight through it into tiles beyond, as if the city
weren't there at all.

**Player-visible effect:** the city tile — and tiles behind it — get a blue "move" highlight
implying they're legally reachable. Tapping the (falsely) highlighted city tile while not yet
adjacent routes through `resolveSelectedUnitTapIntent` → `{kind:'move'}` (because
`canReachCityAssault`'s `distance <= 1` check correctly fails) → ordinary move execution →
`validateUnitMove`'s `'foreign-city'` rejection → the *"Move adjacent, then use the city assault
action."* toast — even though the unit visibly has movement points left and the tile was shown
as reachable. This exactly matches the reported screenshot: a Scout with 3/3 moves, 2 hexes from
Sparta, with the "reachable" highlight leading it into a rejected move.

**Reproduced directly** against `getMovementRangeDetails`: a unit 2 tiles from an undefended
enemy city with 3 movement points not only sees the city tile marked reachable, the BFS walks
straight past it to a 3rd tile beyond — the city is a complete no-op to the algorithm.

**Confirmed by contrast:** an actual enemy *unit* 3 hexes away does **not** reproduce either
symptom, because the Zone of Control it radiates (`getZoneOfControlAt` checks neighbors of every
BFS destination for adjacent hostile combat units) correctly terminates the BFS one hex short,
regardless of the enemy's own tile-occupant logic. Cities have no equivalent projection — this
is the precise, complete gap.

## Evidence this pattern already bit other code paths ("these bugs live together")

- `src/ai/ai-tactics.ts` already has a hand-rolled `isForeignCityDestination()` helper applied at
  **4 separate call sites** (movement-target filtering, ~lines 290, 652, 702, 732) whose purpose is
  to strip a foreign city's own coordinate back out of `movementRange()`'s output before the AI
  picks an ordinary-move destination — necessary because that coordinate is deliberately kept
  reachable (for adjacent tap-to-assault purposes) even after the Task 1 fix below, the same way a
  hostile-occupied tile is. **Correction after implementation:** this filter only ever protected
  against the city's own coordinate, never against tiles *beyond* it — the "walk straight through
  and keep going" half of this bug was live and unprotected for AI movement decisions until Task 1
  fixed the shared BFS at its source. The filter itself is not dead code and was not removed; see
  Task 3 for the verified AI-behavior regression this produced.
- `src/systems/auto-explore-system.ts`'s `chooseAutoExploreMove()` has **no such filter**: an
  auto-exploring scout can nominate an undefended enemy city as its "best" destination, and
  `applyAutoExploreOrder()`'s `executeUnitMove()` call will then silently fail with
  `'foreign-city'`, wasting that unit's turn with no player-visible explanation.
- `src/input/selected-unit-tap-intent.ts`'s own internal `getMovementRange()` fallback (used
  whenever a caller doesn't pass `movementRangeOverride`) inherits the same gap independently of
  the highlight path.
- The bug applies identically to **minor-civ (`mc-`) cities**, not just major-civ cities —
  `resolveSelectedUnitTapIntent`'s `cityAtTarget` lookup is generic across `state.cities`
  regardless of owner kind.
- Companion (non-bug) finding: `buildSelectedUnitHighlights()` in
  `src/input/selected-unit-highlights.ts` deliberately excludes `'city'` targets from
  `attackTargets` for non-naval (land) units (naval city-bombardment was added in the Aug-14
  Battery commit, `6c30c71c`). That's intentional — land-unit city assaults route through a
  separate assault-preview/confirm-war-city UI flow, not the unit-vs-unit combat-preview panel —
  so it's not a bug on its own, but it means the *only* thing currently stopping a blue
  "move"-highlighted undefended city from producing a broken tap is that the unit happens to
  already be adjacent. No change needed here once the range fix lands.
- `MovementBlockerReason['code']` (`getMovementBlockerReason`, used by the `'blocked-movement'`
  tap-intent branch) has no `'foreign-city'` variant, even though `UnitMoveValidationResult`'s
  reason type does. Today this is masked because `canMove` is wrongly `true` for these tiles, so
  `getMovementBlockerReason` is never consulted for them — but it will start being consulted
  once Task 1 correctly excludes far-away city tiles from `movementRange`.
- `unit-movement-system.ts`'s local `hasAlliance()` and `selected-unit-tap-intent.ts`'s local
  `hasTreaty(..., 'alliance')` are near-duplicate reimplementations of the same "are these two
  civs allied" check. The Task 1 fix needs a third copy of this exact check — this is the moment
  to consolidate instead of adding a third divergent implementation.

## Inline review (balance, fun, ages 7–43, play styles, difficulty/AI, UI/UX, architecture, extensibility, data, SFX, saves, testing, hot-seat)

- **Balance / fun:** purely a correctness fix. Right now the bug makes conquering an undefended
  city *harder* than intended (a legitimate "snipe the weak city before it's garrisoned" play is
  silently blocked) — a net loss of fun, not a balance risk to guard against. The fix restores
  existing, already-tuned city-siege math (`city-siege-system.ts`'s intrinsic defense/counter-fire)
  unchanged; it adds no new numeric bonus, so no rebalancing follow-up is needed.
- **New mechanics:** none introduced.
- **Ages 7–43 / play styles:** younger and less-experienced players are the most likely to trust a
  highlighted "reachable" tile at face value and get confused by a rejection with movement points
  visibly remaining — this is exactly the reported failure. Aggressive/warmonger play (sniping
  undefended cities before the owner can garrison them) is currently non-functional beyond
  point-blank adjacency; the fix directly restores that play style for all ages/styles.
- **Difficulty modes / AI:** `ai-tactics.ts` already defensively filters a city's own coordinate
  out of its movement-target candidates (`isForeignCityDestination`), so AI approach behavior for
  *that* coordinate is unaffected by Task 1. What the existing filter never covered — tiles
  *beyond* an undefended city, reachable only by illegally walking through it — was a live,
  untested AI defect until Task 1 fixed the shared BFS. Task 3 verifies both halves: existing AI
  behavior around the city tile itself is unchanged, and the walk-through case is now correctly
  blocked for AI move selection too, with a regression proving it.
- **UI/UX:** once fixed, a non-adjacent enemy city stops being highlighted entirely (correctly —
  it's not a legal move target), which removes the only cue a new player currently has that "this
  is a reachable-soon war objective." Worth naming even though it's out of scope here: a distinct
  "known objective" marker independent of movement range could be a good future, separate
  enhancement. Not adding it in this bug-fix plan to avoid scope creep.
- **Architecture:** the original Task 1 draft asked the BFS to "mirror" `validateUnitMove`'s
  condition — mirroring in two places is exactly the failure pattern that caused this bug (the
  rule was added to the executor and never propagated to the preview layer). Task 1 is revised
  below to require **one shared predicate**, imported by both, so the two layers cannot drift
  again. Confirmed safe to place in `unit-system.ts`: `unit-movement-system.ts` already imports
  from it (`findPath`, `UNIT_DEFINITIONS`, …), so no new dependency cycle is introduced.
- **Extensibility:** the companion #845 plan needs to extend this exact mechanism to
  `state.barbarianCamps`. Task 1 is revised to build the blocking-tile check as a small, generic
  "blocking map entity" lookup (coordinate → blocking reason) rather than a one-off city-only
  branch, so #845 can add a camp entry to the same lookup instead of re-deriving BFS termination.
- **Data / save migrations:** no `GameState` schema change and no new persisted field —
  `movementRange`/`attackTargets` are always recomputed live, never saved. **No save migration
  required** (checked against `save-migrations.ts`'s numbered-migration convention).
- **SFX:** no new sound needed; the existing "blocked move" toast path is reused via Task 5's new
  `getMovementBlockerReason` case, not replaced.
- **Testing / hot-seat regressions:** the blocking predicate must key off the *acting unit's*
  `unit.owner`, never `state.currentPlayer` — CLAUDE.md's Hot Seat rule calls this exact class of
  bug out explicitly. The original draft used `unit.owner` in prose but had no test proving it.
  Task 6 below now includes an explicit hot-seat regression: two human-controlled civs, switching
  the active seat, confirming blocking recalculates for whichever civ's unit is currently
  selected — not "whichever civ went first."
- **Solo play:** already covered by Tasks 1 and 6's positive/negative cases (human vs AI civ).

---

### Task 1 — Teach the shared movement-range BFS about foreign, non-allied cities

**Files:**
- Modify: `src/systems/unit-system.ts` (`getMovementRange`, `getMovementRangeDetails`),
  `src/systems/unit-movement-system.ts` (`validateUnitMove`)
- Test: `tests/systems/unit-system.test.ts`, `tests/systems/unit-movement-system.test.ts`

- [ ] Write failing tests for both range functions proving: (a) an undefended, non-allied enemy
      city tile appears in `reachable` only when the mover can reach a tile adjacent to it — same
      as a hostile unit — never from 2+ hexes away over open terrain; (b) the BFS never walks
      through the city tile to hexes beyond it; (c) an **allied** foreign city (existing
      `'alliance'` treaty) is unaffected and remains freely passable, matching
      `validateUnitMove`'s existing exception.
- [ ] Run `bash scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts`;
      confirm the new assertions fail.
- [ ] **Do not re-derive the blocking condition a second time inside the BFS.** Extract ONE
      exported predicate in `unit-system.ts` — e.g. `getBlockingMapEntityAt(state, unit, coord):
      { reason: 'foreign-city'; entityId: string } | null` — that returns the blocking reason for
      a coordinate, currently checking only `state.cities` (`owner !== unit.owner` and no alliance
      treaty, via Task 2's shared helper). Design it as a small lookup keyed by coordinate rather
      than a city-specific branch, so the companion #845 plan can add a `state.barbarianCamps`
      case to the *same* function instead of duplicating the BFS-termination wiring. Import this
      predicate into BOTH `getMovementRangeDetails`'s BFS AND `validateUnitMove`'s `foreignCity`
      check (replacing that check's inline logic) — this is the fix for the actual root cause:
      the rule must live in exactly one place, not be mirrored across two. `unit-movement-system.ts`
      already imports from `unit-system.ts` (`findPath`, `UNIT_DEFINITIONS`, …) so this introduces
      no new dependency cycle.
- [ ] In `getMovementRangeDetails`, treat a `getBlockingMapEntityAt` match exactly like a
      hostile-occupied tile: add to `reachable` (so the already-adjacent tap-to-assault flow keeps
      working) but mark `terminal = true` — never enqueue past it.
- [ ] `getMovementRange` does not take `GameState` (only `unit`, `map`, occupancy dicts,
      `hostileOwners`, `options`). Add this as an **additive, optional** parameter — e.g. an
      optional `blockingKeys?: ReadonlySet<string>` — rather than threading `GameState` through, so
      the 6 existing test files that call `getMovementRange(...)` directly keep compiling
      unchanged. Export a small helper that the two live call sites (`selected-unit-tap-intent.ts`'s
      fallback, `auto-explore-system.ts`) use to compute that set from `state` via
      `getBlockingMapEntityAt` before calling `getMovementRange`.
- [x] Re-ran the focused suite; new positive/negative/allied-exception cases pass and no existing
      test regressed.

**Critical correction found mid-implementation (this is why the checklist above is `[x]`, not the
literal first draft):** the first implementation of `getBlockingMapEntityAt` added a blocking
city's own tile to `reachable` whenever the BFS *visited* it, with no gate on hop count from the
mover's actual position — matching only half of "behaves like a hostile unit," namely "don't walk
through it." It did **not** match the other half: for a hostile *unit*, Zone of Control
additionally makes every tile *adjacent* to that unit terminal too, which is what actually prevents
the unit's own tile from ever being reached except from direct adjacency (any multi-hop approach
must first cross a ZOC-limited tile one hex short). Cities radiate no such field, so without an
explicit equivalent, the first draft still let a mover 2+ hexes away with enough movement points
see the city highlighted "reachable" and still get the `'foreign-city'` rejection on tap — the
exact original bug, just with the "walks past it" half fixed and the "reachable from far away"
half untouched. A dedicated test (`'marks an already-adjacent undefended enemy city reachable...'`
vs. `'does NOT mark a 2+-hexes-away undefended city reachable...'` in `unit-system.test.ts`)
caught this by asserting the 2+-hexes-away case explicitly, which the first draft failed. **Fix:**
both `getMovementRangeDetails` and `getMovementRange` now only add a blocking entity's tile to
`reachable` when `fromStart`/`isFromStartPosition` is true (i.e. the neighbor is a literal 1-hop
neighbor of the unit's actual starting position) — matching hostile-unit ZOC parity exactly, not
just partially. See the extensive comment on this check in `unit-system.ts` and the corrected
test suite in `tests/systems/unit-system.test.ts` for the full before/after contrast.

### Task 2 — Share one alliance-check helper instead of adding a 3rd copy

**Files:**
- Modify: `src/systems/diplomacy-system.ts`, `src/systems/unit-movement-system.ts`,
  `src/input/selected-unit-tap-intent.ts`, `src/systems/unit-system.ts`
- Test: `tests/systems/diplomacy-system.test.ts`

- [ ] Write a failing test for a new exported `hasAllianceTreaty(state, civA, civB)` in
      `diplomacy-system.ts` (symmetric, matches the existing treaty-matching logic already
      duplicated in `unit-movement-system.ts`'s local `hasAlliance()` and
      `selected-unit-tap-intent.ts`'s local `hasTreaty(..., 'alliance')`).
- [ ] Implement it once, then replace both existing local implementations with calls to the
      shared helper, and use it inside Task 1's `getBlockingMapEntityAt` predicate and its
      `blockingKeys` helper.
- [ ] Re-run `unit-movement-system.test.ts` and `selected-unit-tap-intent`-covering suites to
      confirm behavior is unchanged after de-duplication.

### Task 3 — Verify AI is unaffected/improved by Task 1 (plan correction, see below)

**Correction found during implementation:** this task originally assumed `isForeignCityDestination()`
would become dead code once Task 1 landed. That assumption was **wrong** and has been verified
wrong empirically, not just reasoned about: Task 1's fix still *includes* an undefended city's own
coordinate in `getMovementRangeDetails`'s `reachable` set (deliberately — the same tile must stay
reachable for the adjacent tap-to-assault highlighting to keep working, exactly mirroring how a
hostile-occupied tile is handled). What Task 1 removes is the BFS walking *through* the city to
tiles beyond it. `isForeignCityDestination()` only ever filtered the city's *own* coordinate out of
AI move candidates — never tiles beyond it — so it is still load-bearing and was **not deleted**.
Proof: the pre-existing test `'does not move into a peaceful foreign city outside capture
legality'` in `tests/ai/ai-tactics.test.ts` asserts exactly the coordinate `isForeignCityDestination`
guards, and continues to require that filter after the Task 1 fix.

**Files:**
- Test: `tests/ai/ai-tactics.test.ts` (no `src/ai/ai-tactics.ts` change)

- [x] Added a new regression, `'does not path an AI unit through an undefended enemy city toward
      a target beyond it (#843)'`, proving the genuinely new behavior Task 1 provides for AI: with
      movement points sized to exactly the cost of the only shortest path between the mover and a
      tile beyond the city (isolating "walked through" from "took a legal detour around"), the AI
      never proposes a destination on the far side of an undefended city. This is the AI-facing
      analogue of the player-facing highlight fix, and did not exist before this task.
- [x] Confirmed via the full existing `ai-tactics.test.ts` suite (48 tests, including the
      pre-existing peaceful-city test above) that no AI targeting behavior changed or regressed.

### Task 4 — Auto-explore should not stall on an undefended enemy city

**Correction found during implementation:** unlike `ai-tactics.ts`, `auto-explore-system.ts` had
**no** filter excluding a blocking entity's own coordinate from its candidate destinations. Task 1
deliberately keeps that coordinate in `getMovementRange`'s reachable set (see Task 3's correction),
so this was not automatically fixed by Task 1 alone — confirmed by writing the regression test
first, watching it fail, then fixing it. `chooseAutoExploreMove` could nominate the undefended
city's own tile as its "best" destination (often the *highest*-scoring one, since it's typically
adjacent to unexplored fog), which `executeUnitMove` then silently rejects, stalling the unit.

**Files:**
- Modify: `src/systems/auto-explore-system.ts` (`chooseAutoExploreMove`)
- Test: `tests/systems/auto-explore-system.test.ts`

- [x] Added a regression test proving an auto-exploring scout does not nominate an undefended
      enemy city (placed at the coordinate the existing fixture already proves is otherwise the
      clear best pick) as its destination. Confirmed it fails without the fix (reverted the source
      change, reran, watched it fail with the exact predicted assertion) before restoring the fix.
- [x] Fixed `chooseAutoExploreMove` to filter `getBlockingMapEntityKeys(state, unit)` out of its
      candidate coordinates before scoring, mirroring `ai-tactics.ts`'s `isForeignCityDestination`
      pattern but reusing the Task 1 shared helper instead of a parallel reimplementation.

### Task 5 — Close the matching gap in `getMovementBlockerReason`

**Files:**
- Modify: `src/systems/unit-system.ts`
- Test: `tests/systems/unit-system.test.ts`

- [x] Added `'foreign-city'` to `MovementBlockerReason`'s code union and an optional
      `blockingEntity?: BlockingMapEntity | null` option (caller-supplied, matching the
      function's existing decoupled-from-`GameState` signature style) that takes priority over
      terrain checks. Both call sites (`map-tap-intent.ts`, `selected-unit-movement-feedback.ts`)
      now pass `getBlockingMapEntityAt(state, unit, target)`.
- [x] Re-ran the focused suite: positive (`blockingEntity` wins over an otherwise-adjacent-passable
      tile), negative (`null`/omitted falls through to normal terrain logic), and exact-message
      cases all pass.

### Task 6 — UI regression coverage at the highlight and tap-intent layers

**Files:**
- Test: `tests/input/selected-unit-highlights.test.ts`, `tests/input/map-tap-intent.test.ts`

- [x] Added two regressions to `selected-unit-highlights.test.ts`: a land unit 2+ hexes from an
      undefended enemy city (enough movement to otherwise cover the distance) has neither the city
      hex nor anything beyond it in `movementRange`/`highlights`; a unit already adjacent to one
      still has it in `movementRange`.
- [x] Added a regression to `map-tap-intent.test.ts`: tapping a non-adjacent, undefended enemy city
      resolves to `{kind:'blocked-movement', unitId, reason:{code:'foreign-city', message:'Move
      adjacent, then use the city assault action.'}}` (post Task 5), not a silent `move`/`deselect`
      that would fail downstream.
- [x] The **adjacent** case was already covered by a pre-existing passing test
      (`'previews a city assault when resolveSelectedUnitTapIntent returns assault-city'`), which
      continued to pass unchanged — no new positive test needed.
- [x] Added a **hot-seat regression** in `unit-system.test.ts` (`'#843 hot-seat: blocking follows
      the acting unit's owner, not state.currentPlayer'`): two human-controlled civs sharing a
      device, asserting `getBlockingMapEntityAt`/`getMovementRangeDetails` give byte-identical
      results for the same civ-A unit regardless of which civ's seat is currently active —
      matching CLAUDE.md's "never hardcode ownership checks, always use the acting unit's owner"
      rule.

### Task 7 — Cross-cutting verification

**Files:** all changed source and test files.

- [x] Ran `scripts/check-src-rule-violations.sh` against every changed `src/` path — clean.
- [x] Ran the full suite: `bash scripts/run-with-mise.sh yarn test` — 487/487 test files,
      8017/8020 tests passing (3 pre-existing skips), zero regressions.
- [x] Ran `bash scripts/run-with-mise.sh yarn build` — clean, no type errors.
- [x] Confirmed no save-schema change is needed: `movementRange`/`attackTargets`/the new blocking
      predicate are all derived at render/decision time and never persisted, so
      `save-migrations.ts` needs no new numbered migration for this fix.
- [ ] **Manual browser verification: attempted, inconclusive — noting honestly rather than
      claiming success.** Started the dev server and a solo game; the running app exposes no
      debug hook or accessible in-memory game-state reference (`Object.keys(window)` has nothing
      game-related), and no save exists yet in IndexedDB (`saves` object store empty, `localStorage`
      empty) to hand-edit into an exact "undefended enemy city 2+ hexes away" scenario. Engineering
      that exact map layout through normal procedural-generation play would take an unbounded
      number of turns with no guarantee of ever landing the precise geometry needed. Given the
      automated coverage already includes a verified reproduction-and-fix cycle (new tests
      confirmed to fail against a `git stash`-reverted version of the fix, then pass against the
      real fix, for both the highlight layer and the tap-intent layer) across solo and hot-seat
      configurations, this is being logged as a known gap rather than a false completion claim.
      If a fast way to load a hand-built save into a running game exists, this item should be
      revisited with it.

## Final review pass (before PR)

Re-reviewed the *actual implementation* (not just this plan) across gameplay balance, fun, new
mechanics, player ages 7–43, play styles, difficulty/AI, UI/UX, architecture, extensibility, data,
SFX, save compatibility, testing, and solo/hot-seat regressions. One real gap found and closed:

- **Testing gap:** the root-cause writeup asserted "the bug applies identically to minor-civ
  (`mc-`) cities," but no automated test proved that claim — only major-civ cities had direct
  coverage. Added `'blocks an undefended minor-civ (city-state) city the same as a major-civ
  one'` to `unit-system.test.ts`'s `getBlockingMapEntityAt` suite, confirming the fix's
  ownership-generic design (`state.cities` regardless of owner-id shape) actually holds.

Everything else checked out against the established codebase conventions on direct inspection
(hot-seat `currentPlayer` usage, SFX choice, notification routing, button styling scope, movement
action-point gating, architecture-boundary tests) — see the #845 plan's final review section for
two additional findings that came from the same pass but apply to that plan's changes.
