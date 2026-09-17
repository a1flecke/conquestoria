# #1066 — Auto-Explore Recency-Penalty Cyclic Trap — Terra Implementation Plan

**Spec:** `docs/superpowers/specs/2026-09-17-issue-1066-auto-explore-recency-trap-design.md`
— read that first. This plan implements it exactly; if anything here contradicts that
spec, the spec wins and this plan has a bug.

**Goal:** an auto-exploring unit must never fall into a permanent position cycle inside a
small pocket of already-visited tiles when genuinely new, reachable territory exists just
beyond that pocket.

## Global constraints

- No new `Math.random()` — deterministic only.
- No new persisted `GameState`/`Unit` field. `unit.automation.lastTargets` already exists
  as `string[]`; if its representation changes internally (e.g. capped FIFO instead of a
  fixed slice), it must still serialize as a plain `string[]` (POJO, `GameState` must stay
  JSON-serializable per `.claude/rules/game-systems.md`'s Deterministic Simulation
  Contract). No save migration.
- Difficulty-invariant, personality-invariant — do not add any `OpponentChallenge` or
  `PersonalityTraits` parameter to anything in `auto-explore-system.ts`.
- Perception-safe — do not read anything beyond `state.civilizations[unit.owner]
  .visibility` and the unit's own `getMovementRange`. No new state read.
- Bounded memory only — no unbounded per-unit array growth over a 400+-round campaign.

## File structure

- **Edit** `src/systems/auto-explore-system.ts`:
  - Add a new, internal, bounded BFS helper (e.g. `findNearestUnexploredTile`) that walks
    only already-known (`fog`/`visible`), terrain-passable tiles outward from the unit's
    current position, returning the first tile whose visibility is `unexplored`, or `null`
    if none is found within a fixed bounded radius. Ignores movement points (this is a
    "what do I know about the map" search, not a "where can I go this turn" search) and
    ignores hostile-occupancy (safety is still enforced by the existing per-candidate
    checks in `rankCandidate`, which run regardless of this new term).
  - Call it once per `chooseAutoExploreMove` invocation; thread the result into
    `rankCandidate` as a new parameter.
  - In `rankCandidate`, add a scoring term rewarding a candidate for being closer (by hex
    distance) to that target when one exists; `0` contribution when no target was found
    (falls through to the existing scoring unchanged).
  - `unit.automation.lastTargets`/`recencyPenalty` stay as they are — this is now a
    secondary tie-breaker among otherwise-similar candidates, not the primary
    anti-cycling mechanism. Do not remove it; the wrapped-seam regression still needs it.
- **Edit** `tests/systems/auto-explore-system.test.ts` — new regression(s) for the cyclic
  trap; keep all 5 existing tests green, unmodified in behavior.
- **Edit, if needed** `tests/systems/helpers/auto-explore-fixture.ts` — extend
  `AutoExploreFixtureOptions` with whatever the new regression fixture needs (a larger
  grid with an obstacle shape that defeats the static tie-breaker, plus a genuinely
  unexplored tile beyond it). Prefer adding an option over a parallel fixture builder.
- **No changes** to `ai-prepared-turn.ts`, `ai-expansion-sites.ts`,
  `ai-amphibious-routing.ts`, `ai-round-scheduler.ts`, `ai-production.ts`,
  `ai-domination.ts`, `city-work-system.ts`. If investigation during implementation finds
  any of these genuinely need a change, STOP and escalate (Design Escalation Required)
  rather than silently expanding scope.

### Deviation from the original scope boundary above: `basic-ai.ts` and `turn-manager.ts` DID need changes

The bounded-BFS fix, run in isolation against the full suite before finalizing, broke a
previously-passing test (`tests/simulation/domination-ai-campaign.test.ts`) — a real,
demonstrated regression, not a hypothetical one. Root cause and full analysis:
`docs/superpowers/specs/2026-09-17-issue-1066-auto-explore-recency-trap-design.md`
§7.4. Fixing it required:

- **Edit** `src/ai/basic-ai.ts` (`processAITurnInternal`): clear `automation.mode:
  'auto-explore'` for any unit `preparedForTurn.assignments.assignmentsByPlanId` claims
  this round, before tactical dispatch runs. Also passes the new leash (below) into the
  idle-explorer loop's own `applyAutoExploreOrder` call.
- **Add** `src/ai/ai-exploration.ts`: `computeAdministrativeExploreLeash(state, unitId)`,
  returning `{ anchor: nearestOwnedCityPosition, maxDistance: EXPANSION_SEARCH_RADIUS }`
  for an AI-owned unit, `null` for a human-owned one.
- **Edit** `src/systems/auto-explore-system.ts`: new exported `AutoExploreLeash`
  interface; `findNearestUnexploredTile`, `chooseAutoExploreMove`, and
  `applyAutoExploreOrder` all take it as a new *optional* parameter, defaulting to
  unleashed (unchanged) behavior when omitted — the player's own auto-explore button
  never passes one.
- **Edit** `src/core/turn-manager.ts`: the per-civ turn-start automation-continuation loop
  now computes and passes the same leash for an `auto-explore` unit's every subsequent
  round, not just the round it was first tagged.

This is escalated here rather than silently expanded: per the task's own instruction to
review the design for soundness before finishing implementation, this was found and fixed
in the same change rather than deferred, matching this session's established pattern (the
#1116 arc's own flagged-gap follow-up) of fixing a discovered true root cause immediately
rather than shipping a known regression. Both fixes are demonstrated by
`tests/simulation/domination-ai-campaign.test.ts` passing again (faster than the
pre-#1066 baseline) and the full `test:regular` + `test:intensive-simulations` selections
staying green.

### Second deviation: `turn-manager.ts` needed one more change, unrelated to exploration at all

Running the mandatory `yarn test:ai-long` acceptance gate (below) after the above landed
surfaced a third, fully independent failure: `campaign-continuity.test.ts`'s save/reload
determinism check. Full root-cause analysis:
`docs/superpowers/specs/2026-09-17-issue-1066-auto-explore-recency-trap-design.md` §7.5.

- **Edit** `src/core/turn-manager.ts`: moved the `syncCivilizationContactsFromVisibility`
  call (and its `civilization:first-contact` emission) from immediately after a civ's
  `updateVisibility` pass to the end of that civ's per-round vision block — after mass
  surveillance, satellite surveillance, minor-civ shared vision, and ally telegraph vision
  have all applied. A contact only discoverable through one of those later sources could
  never be caught by live per-round play (the next round's `updateVisibility` resets it to
  `'fog'` before sync runs again), so it only ever surfaced via a save/reload's unconditional
  full resync — a genuine Deterministic Simulation Contract violation, pre-existing and
  completely unrelated to #1066's exploration or leash logic (neither
  `auto-explore-system.ts` nor `ai-exploration.ts` touches discovery/visibility/diplomacy).
- Pure reordering, no logic change, no new field, no migration. Verified: the full
  `campaign-continuity.test.ts` (all 3 tests, full 400-round scenario, both save points)
  passes; `yarn test:regular` (634 files) and `yarn test:intensive-simulations` (17 files)
  stay green; the `#1069` golden digest is unaffected.

## TDD order

### Step 1 — reproduce the exact failure mode as a focused unit test (RED)

In `tests/systems/auto-explore-system.test.ts`, construct the smallest fixture that
reproduces an indefinite cycle under CURRENT (unfixed) code, mirroring the real `ai-3`
shape: a uniform "fog" disk around the start position (no local frontier/visibility
signal anywhere inside it) bounded on one side by an obstacle (ocean/mountain) that
defeats the scoring's static positional tie-breaker, with genuinely `unexplored` tiles
only reachable by walking multiple consistent steps around/past that obstacle.

This exact shape was empirically validated in the design investigation (see the design
doc's Section 7.1) to reproduce a real, indefinite cycle under the current code at
*every* tested memory-window size (4, 8, 12) — confirming the fixture reproduces the
actual bug class, not an artifact of one specific magic number. Drive
`chooseAutoExploreMove` in a loop (30+ calls, manually advancing `unit.position` and
`unit.automation.lastTargets`/visibility between calls the same way
`applyAutoExploreOrder` would) and assert: **under current code, the unit never reaches
a genuinely unexplored tile within some generous turn budget** (the RED assertion — this
must fail before the fix and pass after).

This is the "first causal failure" regression the task requires — not a 400-round
campaign assertion. Do not skip to a broad integration test as the only regression.

### Step 2 — implement the fix (GREEN)

Implement the bounded-BFS-toward-nearest-unexplored-tile approach from the design doc's
Section 7.2:

- New internal helper, bounded search radius (pick a concrete constant with the same
  "comfortable margin over any realistic locally-enclosed pocket" reasoning the design
  doc uses, and name it clearly, e.g. `EXPLORE_TARGET_SEARCH_RADIUS`).
- New scoring term in `rankCandidate`, weighted to dominate `recencyPenalty` and the
  existing `tieBreaker` when a target exists, and contribute `0` when it doesn't.
- Re-run Step 1's fixture: the unit must now make continuous new-tile progress instead of
  cycling.

Re-run Step 1's fixture: the unit must now reach the previously-unreachable `unexplored`
tile within the same call budget.

### Step 3 — healthy-control negative case

Add a fixture/test proving a unit exploring genuinely open territory (no pocket, or a
pocket smaller than any plausible new cap) is **unaffected** — it should never be
penalized for revisiting a tile it hasn't actually been near recently just because the
memory is now larger. Use the existing "prefers unexplored safe tiles" test as the
baseline shape; add an assertion that a sequence of moves across clearly-distinct
unexplored territory never gets spuriously penalized.

### Step 4 — existing regression preservation

Re-run the full existing `auto-explore-system.test.ts` file unmodified in intent:

- "prefers unexplored safe tiles and avoids visible hostile attack range" — must still
  pick the correct tile.
- "does not nominate an undefended enemy city" (#843) — must still be excluded regardless
  of memory size.
- "does not nominate an undefended barbarian camp" (#845) — same.
- **"supports wrapped maps without oscillating between seam columns"** — this is the
  ORIGINAL oscillation fix the 4-slot window was sized for (likely period-2). Confirm the
  widened memory still prevents this specific case; if the fixture's seeded
  `lastTargets = ['3,1']` value needs adjusting for the new memory shape, update it with a
  comment explaining why, not silently.
- "clears auto-explore when the player is trapped and no safe path remains" — must still
  correctly strip `automation` when genuinely zero legal moves exist (a real dead end,
  category O — this behavior must NOT be weakened; the fix targets "cycles among already-
  explored tiles" specifically, not "there is nowhere at all to go").

### Step 5 — integration-level confirmation (`ai-3`'s actual shape)

Focused `lh-veteran-medium` run (not the full matrix yet): confirm `ai-3`'s warrior no
longer enters the period-5 loop at the SAME map seed, and ideally confirm it goes on to
discover at least one other civ's city or a legal expansion site within some reasonable
round budget. Use the same spy-based diagnostic pattern from the design investigation
(`vi.spyOn` on `processTurn`/`prepareMajorCivStrategicPlan` from a different module) —
scratch-only, delete before the PR unless it becomes a durable regression (see Step 6).

### Step 6 — decide if a long-horizon-level regression belongs in the permanent suite

If a compact, fast (non-400-round) integration test can pin "a unit with this exact
terrain shape escapes and the civ eventually forms a plan" without the cost of a full
campaign, consider adding it as a permanent regression near
`tests/simulation/ai-playability.test.ts` or `tests/ai/ai-prepared-turn.test.ts`. Do not
add a new 400-round test to the regular suite — that tier is `yarn test:ai-long`
(explicit-run only) by design; this must not change.

## Required regression matrix

- Positive: fixture reproduces the period-N cycle pre-fix, resolves post-fix (Step 1+2).
- Negative: unaffected exploration of genuinely open territory (Step 3).
- Existing regressions preserved: all 5 current `auto-explore-system.test.ts` tests,
  including the wrapped-seam oscillation case (Step 4).
- Healthy control: `ai-1`/`ai-2`-shaped exploration (long, uninterrupted early walk) must
  remain unaffected in kind — if anything, their own later-game oscillation (observed
  starting ~turn 13 in the design investigation) should also improve, which is a bonus,
  not a required assertion.
- Known-vs-hidden information: no test should require the unit or the AI to know
  anything beyond its own `visibility`/`automation` state — assert this by construction
  (the fixture only ever sets `visibility`/`automation`, never a raw map/city oracle).
- Difficulty/personality invariance: not applicable to add new tests for (the module has
  no such parameter); confirm via code review that none was added.
- Determinism: same-seed campaign digest may legitimately move (a real decision changes);
  confirm via `tests/app/simulation-determinism.test.ts`/`determinism-guard.test.ts`
  passing unmodified (they assert *equivalence given the same commands*, not that any
  particular AI decision stays fixed).
- Worker demand survives / stale plan demand pruned (#1116 contract): unaffected by this
  change; confirm `tests/ai/ai-round-scheduler.test.ts`'s #1116 tests still pass
  unmodified — do not touch `ai-round-scheduler.ts` in this MR.
- Emergency defense still works (#1119 contract): unaffected; confirm
  `tests/ai/ai-round-scheduler.test.ts`'s #1119 test still passes unmodified — do not
  touch `basic-ai.ts`'s focus-assignment block in this MR.

## Difficulty / personality

No code in `auto-explore-system.ts` may read `OpponentChallenge` or `PersonalityTraits`
after this change, matching before. Verify with a grep, not just by not adding an import.

## Save / determinism

- `grep -rn "lastTargets" src tests` before and after to confirm the field's type/shape
  contract at the `GameState`/`Unit` level is unchanged (`string[]`), even if its
  construction logic inside `auto-explore-system.ts` changes.
- Run `tests/app/simulation-determinism.test.ts`, `determinism-guard.test.ts`,
  `simulation-rng*.test.ts` (intensive-simulations tier) — must stay green.
- No `SAVE_MIGRATIONS` entry, no `CURRENT_SAVE_SCHEMA_VERSION` bump.

## Performance

- `tests/perf/algorithmic-budgets.test.ts` — must stay green with no baseline changes
  (this fix does not add a new full-map scan or new per-round cost class; only the
  recency-memory's constant-size bookkeeping changes).
- `tests/perf/aiRound-1069-equivalence.test.ts` — very likely needs
  `UPDATE_1069_REFERENCE=1` regeneration (a real, intended AI decision-path change on the
  crowded perf fixture, matching the same sanctioned pattern #1108/#1116/#1119 each used).
  Inspect the actual state divergence before regenerating — confirm it's attributable to
  a unit choosing a different (correct) exploration destination, not an unrelated
  regression.
- `yarn perf:report` — run once, eyeball `.verification/perf/report.json` for any
  unexpected shift outside AI exploration/round counts.

## Source searches (run before editing, to confirm scope)

```
grep -rn "lastTargets" src tests
grep -rn "auto-explore" src/ai src/systems --include="*.ts" -l
grep -rn "chooseAutoExploreMove\|applyAutoExploreOrder" src tests
```

Confirm no other caller assumes the exact `.slice(-4)` size or the specific 4-entry
capacity (e.g. a UI hint, a display of "recently visited tiles", or another system reading
`unit.automation.lastTargets.length`).

## Commands

```
bash scripts/run-with-mise.sh yarn vitest run tests/systems/auto-explore-system.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/ai/
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-round-scheduler.test.ts
bash scripts/run-with-mise.sh yarn vitest run tests/simulation/ai-playability.test.ts
bash scripts/run-with-mise.sh yarn test:regular
bash scripts/run-with-mise.sh yarn vitest run tests/perf/algorithmic-budgets.test.ts
UPDATE_1069_REFERENCE=1 bash scripts/run-with-mise.sh yarn vitest run tests/perf/aiRound-1069-equivalence.test.ts   # only if divergence is confirmed intended
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:ai-long -- -t lh-veteran-medium   # focused; the -t filter has previously not reliably isolated a single scenario in this repo's vitest setup -- if it runs the full matrix instead, that's acceptable, just budget the time
bash scripts/run-with-mise.sh yarn test:ai-long   # full matrix before Sol handoff
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
git diff --check
```

## MR boundary — decisions Terra may NOT silently redesign

- The fix lives in `auto-explore-system.ts` only (plus its tests/fixtures). If evidence
  during implementation shows the anti-oscillation window genuinely cannot be bounded
  safely (e.g. a constructed fixture shows an even the widened cap still cycles), STOP and
  escalate — do not silently switch to the "farthest-tile escape" alternative or invent a
  third approach without stating the invalidated assumption and evidence.
- Do not touch `objectiveCandidates`, `getKnownExpansionSites`, `resolveObjectiveTravelCandidates`,
  `findRegionCrossings`, `revalidatePreparedPlan`, `ai-production.ts`, or
  `basic-ai.ts`'s city-focus block. If any of these turns out to ALSO need a change, that
  is new evidence requiring a fresh escalation, not silent scope growth.
- Do not add a fallback/consolidate plan type.
- Do not change `MIN_CITY_CENTER_DISTANCE`, `EXPANSION_SEARCH_RADIUS`, city vision radius,
  or culture-radius constants.
- Do not close #1066 unless the CURRENT tracked scope (expansion-frozen on
  `lh-veteran-medium`/`ai-3`, and production-idle's #1066 attribution) is actually
  resolved by long-horizon evidence — closing it because the original stale title's
  `unit-count-runaway` symptom is gone (already true before this MR) is not sufficient.

## Mandatory inline review (plan-level)

The design doc's Section 14 covers the conceptual review. At the plan level, the
per-dimension coverage is:

- **Proper testing / regressions solo play / hot seat**: the "Required regression matrix"
  section above plus the command list (`test:regular`, `ai-playability.test.ts`,
  `ai-round-scheduler.test.ts`, full `test:ai-long` matrix including
  `lh-hotseat-medium`) together give concrete, executable coverage for every dimension
  the design doc identifies as relevant. No dimension is asserted "acceptable" without a
  command or test step that actually exercises it.
- **Architecture / extensibility**: enforced procedurally via the "MR boundary" section's
  explicit list of files this plan may not touch, plus the source-search step that must
  run before editing.
- **Updating saved games**: enforced via the explicit `grep -rn "lastTargets"` step and
  the save/determinism command list; Terra must not skip this even though no migration is
  needed, since the design doc flags a real self-healing property to preserve.
- **Performance**: enforced via the explicit perf command list and the requirement to
  inspect (not blindly regenerate) the #1069 golden digest divergence.
- All other dimensions from the design doc's Section 14 (balancing, fun, UI, UX, data,
  SFX, difficulty, personality) require no additional plan-level verification beyond what
  Section 14 already states, since this plan introduces no new surface in those areas.

## Long-horizon acceptance gate (before Sol handoff)

Full `yarn test:ai-long`. Required:
- `expansion-frozen` reassessed honestly (resolved, or a freshly-diagnosed remaining gap
  — not assumed).
- `production-idle`'s #1066 attribution reassessed (if `ai-3` is no longer idle, either
  remove the entry or repoint its `why` to whatever genuinely remains).
- `gold-hoard` downstream reassessed.
- Zero unknown findings, zero stale registered findings (ratchet both directions).
- No new `tech-frozen`, no unit-count-runaway regression, no new save/reload divergence.
- Any NEW trajectory-shift-exposed finding in a different scenario/civ: register it and
  file a focused follow-up issue. Do not fix it in this MR.
