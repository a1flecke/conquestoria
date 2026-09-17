# #1066 — Auto-Explore Recency-Penalty Cyclic Trap (Design)

**Status:** design, not yet implemented.
**Base SHA:** `ed0131d89b7b2e958b4dfd7ca8fed2598b475a4a` (main, post-#1119).

## 0. The issue title is stale; this is the current live scope

#1066 was filed as "AI: Era-9 civ unit count runs away (30-80 units on one city)". That
`unit-count-runaway` detector stopped reproducing after #1064 and was deleted from
`known-campaign-gaps.ts`. The issue was kept open because the SAME civs it flagged also
showed `activePlanCount: 0` for the whole campaign — that symptom was re-labelled
`expansion-frozen` and has outlived three separate historical explanations under this one
issue number:

1. **#1105/#1109** — no amphibious objective routing (fixed; `findRegionCrossings` now
   composes land→embark→sail→disembark→land travel estimates).
2. **#1107** — `isCityCoastal` (strict, own-tile-plus-ring only, per #386) rejecting a
   stuck civ's only city (fixed; coastal-access recovery, sticky targets, switching
   hysteresis).
3. **This design** — a THIRD, previously undiagnosed cause, found fresh on `main`
   post-#1116/#1119: `lh-veteran-medium`'s `ai-3`.

None of the prior three explanations apply to this reproduction. `ai-3` sits on a
**1412-tile shared continent** with all four other civs — not water-locked, not
coastal-rejected. This is a different bug that happens to produce the same
`activePlanCount: 0` / `expansion-frozen` symptom.

## 0.1. This exact civ/scenario has failed this way before — #1110

`known-campaign-gaps.ts`'s file header (F7/F8) documents a near-identical, PRIOR
finding on this SAME scenario and SAME civ, tracked as **#1110** ("AI: a civ's
exploration never reveals a legal expand site despite abundant nearby land"),
**closed** after #1107's Task 7 fixes made it stop reproducing:

> "Root cause: `getKnownExpansionSites`... returns ZERO candidates for this civ
> throughout the entire campaign... This points at #1064's own idle-unit
> auto-explore/exploration-coverage machinery" (F7)

#1110's own closing comment is explicit that this was never actually root-caused:

> "this fix was inferred from correlated timing, not a direct root-cause trace back
> to the exploration-coverage code itself... If this ever reproduces again under a
> different scenario/civ, please reopen with a fresh repro."

It reproduced again under the **identical** scenario and civ (`lh-veteran-medium`,
`ai-3`), re-surfaced by #1094's trajectory shift and re-tracked under #1066 rather
than reopening #1110. This design is the direct-root-cause trace #1110's own closing
comment asked for: the auto-explore recency-penalty cyclic trap fully explains both
the original #1110 occurrence and its current #1066 recurrence, and explains *why*
#1107's unrelated fixes only fixed it by accident that first time (more
uninterrupted movement time let that particular run's warrior wander far enough,
by luck of the local terrain, before hitting its own version of this trap) rather
than actually closing the underlying gap.

## 1. Current reproduction

`yarn test:ai-long` (full 9-scenario matrix, run fresh against `ed0131d8`):
`lh-veteran-medium`, `ai-3` (personality: **expansionist** — the least plausible
personality for a permanent "never expands" outcome, ruling out personality as cause):

```
expansion-frozen: city count never rose above 1 across 400 living rounds (round 0-399)
gold-hoard: ai-3, rounds 131-208 (downstream)
production-idle: ai-3, rounds 126-399 (downstream)
```

End state: `ai-3` — 1 city, 2 units (1 warrior-lineage unit + 1 worker), 20 population,
6870 unspent gold, `civEra: 1`, `maxPlanNoProgressRounds: 0` (never wedged — simply never
active). Workers ARE present (#1116 working correctly); the civ's single city correctly
switches focus only when under attack (#1119, never triggered here since nothing ever
attacks a civ nobody can see).

## 2. Healthy control civs (same scenario, same run)

`ai-1` (aggressive) and `ai-2` (diplomatic) both reach 4 cities with normal tech/gold
progression. `ai-4` (trader) partially escapes (2 cities) but is not the cleanest control.
`ai-1` is used below.

## 3. First causal break

Instrumented `prepareMajorCivStrategicPlan`'s own `AIDecisionTrace` for `ai-3` at 12
representative rounds (1,2,3,5,10,20,40,80,150,250,350,399) across the full campaign:

```
turn=1   candidates(0)=[]   knownCities=0 knownResources=4
turn=399 candidates(0)=[]   knownCities=0 knownResources=39
```

**`objectiveCandidates()` returns the empty array at every single sampled round for the
entire 400-round game** — not "candidates exist but score `-MAX_VALUE`" (category D in the
task's own taxonomy), but category **A: no candidates are ever generated at all.**

- `capture`: needs `perception.knownCities` — stays `0` the whole game. Zero possible.
- `secure-resource`: needs a known resource with `owner === null` or an at-war owner.
  `knownResources` does grow (4→39) via passive city vision / culture-radius creep, but
  never yields a candidate — consistent with every discovered resource sitting inside
  already-claimed, not-at-war territory (this civ is at peace with everyone the whole
  game, per `warDeclarationsInvolvingCiv: 0`).
- `expand`: gated on `getKnownExpansionSites(knownMap, knownCityPositions,
  operationalAnchors, EXPANSION_SITE_SHORTLIST, ...)`. This reads only already-KNOWN map
  tiles within `EXPANSION_SEARCH_RADIUS` (8) of the city — it never returns anything
  because nothing beyond the city's own passive vision (radius 2) / culture radius (caps
  at 3) is ever known. `MIN_CITY_CENTER_DISTANCE` is 4, strictly greater than passive
  vision ever reaches, so a legal site can only ever become "known" through **active
  exploration** — which is where the actual defect lives.

**The first causal break is upstream of all objective-candidate logic: exploration itself
never makes net progress**, so `knownMap` never grows a legal expansion site into view, so
`objectiveCandidates()` is permanently empty, so `choosePrimaryObjective` always returns
`selected: null`, so `primaryPlan` stays `null` forever.

## 4. Exploration audit — the actual defect

Instrumented `processTurn` (spied from a different module than `turn-manager.ts`, so no
production code touched) to dump `ai-3`'s and `ai-1`'s unit position/automation state every
round for turns 1-40, then sparsely to turn 399.

**`ai-3`'s only combat-capable unit (`unit-8`, warrior→spearman→pikeman via normal tech
upgrades) enters a perfect period-5 position cycle starting turn 5 and never leaves it for
the rest of the 400-round game** (confirmed unchanged at turns 10, 15, 20, 30, 50, 80, 120,
200, 300 — 295 rounds with zero net displacement — before finally breaking out around
turn ~370-399, too late to matter):

```
turn 1: (47,34)   turn 6:  (47,34)   turn 11: (47,34)   ... (period 5, forever)
turn 2: (47,33)   turn 7:  (47,33)   turn 12: (47,33)
turn 3: (46,34)   turn 8:  (46,34)   turn 13: (46,34)
turn 4: (46,35)   turn 9:  (46,35)   turn 14: (46,35)   [= the city tile]
turn 5: (48,34)   turn 10: (48,34)   turn 15: (48,34)
```

`unit.automation.mode` stays `'auto-explore'` throughout (never stripped — the unit is not
stuck-and-idle, it is actively, continuously "exploring" and finding nothing).
`movementPointsLeft: 0` at every single-round sample (it spends its full movement budget
every turn, producing zero net progress).

**Root mechanism** (`src/systems/auto-explore-system.ts`):

```ts
const recencyPenalty = unit.automation?.mode === 'auto-explore'
  && unit.automation.lastTargets.includes(hexKey(coord)) ? 500 : 0;
...
lastTargets: [...unit.automation.lastTargets, hexKey(order.to)].slice(-4),
```

`lastTargets` is a **fixed 4-slot** most-recently-visited window. A cycle of period
**5** is exactly one longer than that window: by the time a tile comes back up for
re-selection, it has *just* rotated out of the 4-slot memory, so its `recencyPenalty`
reads `0` again and it becomes attractive — perpetuating the identical 5-tile loop
forever. This is not a coincidence; it is a structural property of a `sliceN` window
against a cycle of length `N+1`.

**This mechanism already had one known failure mode** — `tests/systems/
auto-explore-system.test.ts`'s "supports wrapped maps without oscillating between seam
columns" test, which the 4-slot window was sized to fix (likely a period-2 flip across a
map seam). The window was never proven against a *longer* period; #1066 is that proof
failing.

### Control-civ comparison confirms this is universal, not `ai-3`-specific

`ai-1`'s warrior walks a clean, monotonic, ~2-tiles-per-turn line for 12 straight turns —
(16,40)→(16,38)→...→(18,18) — discovering large amounts of genuinely new territory, before
**it too** starts a local oscillation around turn 13 (`(17,18)→(15,19)→(16,19)→(17,19)→
(18,18)→...`), in a cluster of similar size to `ai-3`'s trap. **The bug fires for every
civ eventually** — the difference is purely how much real ground each civ's unit covers
*before* first hitting a local pocket shaped like this, which is a function of raw starting
position/local terrain, not personality, not difficulty, not scenario configuration.
`ai-1` had already discovered enough (multiple cities, resources) during its 12-turn
productive walk to form real plans before its own trap began; `ai-3`'s local terrain traps
it within 4-5 turns, before it has explored past its own starting city's passive vision.

### Terrain audit rules out a genuine geographic dead end

`initializeScenario` (no simulation needed — pure map generation) for this exact seed
shows `ai-3`'s city at `(46,35)` sits in `regionKey: continent-0`, a **1412-tile landmass
shared by all five civs** (player, ai-1..ai-4), running the tile range `(0,0)`-`(49,49)`.
The map dump shows ordinary passable grassland/forest tiles immediately adjacent to the
5-tile trap — `(47,35)`, `(48,35)`, `(46,36)`, `(47,36)` — that are never visited. There is
no mountain/ocean wall; #1109's amphibious routing and #1107's coastal-access logic are
both irrelevant here (no water crossing is needed at any point). This is a pure
scoring/memory defect in `chooseAutoExploreMove`, not a reachability or legality gap.

## 5. Failure taxonomy (per the requested categories)

- **K (no expand candidate)**: confirmed, direct consequence of exploration failure.
- **A (no candidates of any objective type)**: confirmed at the `objectiveCandidates()`
  level for the entire game.
- **Underlying, upstream of K/A**: a NEW category — exploration execution loops
  indefinitely inside a small already-visited pocket instead of making forward progress,
  because the anti-oscillation memory is shorter than the pocket's cycle length.

Categories B, C, E, F, G, H, I, J, L, M, N, O do not apply — there is no plan to lose
(never formed), no demand to survive/drop (worker-infrastructure is the only demand and it
survives correctly per #1116), no production/assignment failure (nothing is ever assigned
because nothing is ever eligible), and the civ's state is **not** healthy (O is
disproven by the terrain audit above — real expansion opportunity exists and is
undiscoverable only because of this bug).

## 6. Rejected hypotheses

- **Amphibious routing gap (#1066's own prior explanation)**: disproven — single shared
  continent, no water crossing needed anywhere near `ai-3`.
- **Coastal legality (#1107's prior explanation)**: disproven — not applicable, `ai-3`'s
  situation has nothing to do with `isCityCoastal`.
- **Worker/force-demand starvation (#1116)**: disproven — worker-infrastructure demand is
  generated and survives correctly; `ai-3` has exactly 1 worker, matching its 1-city cap.
- **Personality causing permanent incompetence**: disproven — `ai-3` is `expansionist`,
  the personality with the *highest* `expansionDrive`; personality only affects scoring
  weight and the expansion soft-cap, never exploration or discovery, and the control civ
  comparison shows the trap is terrain-triggered, not personality-triggered.
- **Difficulty-specific scoring threshold**: disproven — nothing in `objectiveCandidates`,
  `chooseAutoExploreMove`, or `rankCandidate` reads `OpponentChallenge`; the mechanism is
  fully difficulty-invariant by construction (never touches challenge-tier code at all).
- **Genuine geographic dead end (category O — civ is healthy, detector is wrong)**:
  disproven by the terrain audit (1412-tile shared continent, ordinary passable land
  immediately adjacent to the trap).
- **Production/demand/revalidation defect**: disproven — the entire chain from
  `objectiveCandidates` downward never runs meaningfully because it's starved of
  exploration input; there's nothing wrong in `ai-production.ts` or
  `revalidatePreparedPlan` to find here.

## 7. Chosen fix direction — empirically validated, not merely proposed

**This section documents a real design correction made during implementation, per this
task's own "if fresh evidence disproves the chosen architecture" escalation clause.**

### 7.1. The originally-proposed fix ("widen the recency window") is disproven

Before writing any production code, the original recommendation from this design's first
draft — widen `lastTargets` from a fixed 4-slot FIFO to a larger bounded cap — was tested
empirically in a scratch harness against a hand-built fixture that reproduces the exact
`ai-3` failure shape (a uniform "fog" disk with no local frontier signal, bounded by an
obstacle that defeats the static tie-breaker's monotonic gradient — concretely, ocean
walls forming a corner, closely mirroring a coastline). The harness drove the REAL
`chooseAutoExploreMove` for 40+ simulated turns at cap sizes 4, 8, and 12:

```
cap=4:  ...(0,1)(0,2)(1,2)(2,1)(1,1)(0,1)(0,2)...              period 5, forever
cap=8:  ...(0,1)(0,2)(1,2)(2,2)(3,2)(4,1)(3,1)(2,1)(1,1)(0,1)... period 9, forever
cap=12: ...(4,2)(4,1)(3,1)(2,1)(1,1)(0,1)(0,2)...(3,3)(4,2)...   period ~17, forever
```

**Widening the cap does not eliminate the bug — it only produces a proportionally larger
cycle**, because a purely memory-based fix still only ever compares a candidate against
its OWN recent-visit history; it has no way to prefer a direction that leads toward
genuinely new territory over a direction that merely hasn't been visited *recently*. This
disproves the original assumption that a "sufficiently large bounded window" is a complete
fix — no finite cap can be safe in general, since the disk of already-explored,
zero-frontier-signal territory around a stuck unit can always be at least as large as
whatever cap is chosen.

**A second candidate ("flee to the tile farthest from a stuck-streak anchor once a stall
is detected") was also tested and also disproven** — on the same fixture, it made
initial progress but then settled into a stable period-2 flee-loop between two corner
tiles, because "farthest from where I got stuck" has no actual knowledge of *where*
unexplored territory lies and can bounce between two local extremes indefinitely.

### 7.2. Actual fix: bounded BFS toward the nearest known-unexplored tile

**Give `chooseAutoExploreMove` genuine multi-hop lookahead**, instead of trying to patch
the single-hop greedy scoring with more memory. Once per call:

1. Run a bounded BFS from the unit's current position, over already-known
   (`fog`/`visible`) **passable** terrain only, to find the nearest tile whose visibility
   is `unexplored`. Bounded search depth (a fixed radius comfortably larger than any
   locally-enclosed already-explored pocket a hex map can realistically produce — the
   same class of margin reasoning as the disproven window-size approach, but here it
   only needs to be "big enough to find *a* real target," not "big enough to prevent
   *any* cycle," which is a categorically easier and more robust property).
2. If a target is found, **add a scoring term to the existing `rankCandidate` formula**
   that rewards a candidate for reducing hex-distance to that target — large enough to
   dominate the existing `recencyPenalty` and any local visibility/frontier noise, small
   enough to never override the existing hard safety exclusions (hostile-threat check,
   blocking-entity exclusion, terrain-cost/legality check all still run first and can
   still return `null` for a candidate, unaffected).
3. If no target is found within the bound (a genuinely small, fully-explored, disconnected
   pocket — the true "nowhere left to go" case), fall back to the existing scoring
   unchanged, preserving the existing "clears auto-explore when trapped" behavior exactly.

Re-run the same disproving fixture with this approach: the unit makes **genuine,
continuous new-tile discovery every single turn** until the small test map is fully
exhausted (22 consecutive newly-discovered tiles before the bounded test map's edges are
reached), with zero cycling at any point. This is validated as robust *by construction*
(a multi-hop shortest-path signal cannot be defeated by any finite local recency pattern,
because it does not depend on recency at all) rather than by picking a value empirically
large enough — the earlier two approaches' failure mode.

**Cost**: one bounded BFS per unit per `chooseAutoExploreMove` call (only cities/units
actually calling this path pay it — not a general per-round cost across the whole
simulation). Bounded by a fixed radius, so worst-case tile count is a small constant
(`O(radius^2)`), not a full-map scan. This is the same class of cost `getMovementRange`
already pays every call; adding one more bounded BFS of comparable size is not a new
order-of-magnitude cost class. Must still be confirmed against
`tests/perf/algorithmic-budgets.test.ts` during implementation.

### 7.3. Other rejected alternatives (unchanged from the original draft)

**Fallback/consolidate plan**: explicitly forbidden by the task's own scope guardrails,
and would not be honest — the civ does NOT have "no strategic objective," it has an
undiscovered one. A fallback plan would paper over the real defect.

**Touching `objectiveCandidates`/`getKnownExpansionSites` directly**: these are working
correctly given their inputs; the defect is entirely upstream, in what becomes "known" in
the first place.

### 7.4. Second-order regression found during pre-implementation review: administrative exploration can strand an AI's own combat force

Requested full review, before finalizing the fix: does 7.2's bounded-BFS approach have any
side effect the disproven 7.1 approach didn't? Yes — found via
`tests/simulation/domination-ai-campaign.test.ts`, a pre-existing passing test that started
failing once the BFS fix (with no further changes) was applied in isolation.

**Mechanism.** `basic-ai.ts`'s idle-explorer administrative loop (#1064) tags any genuinely
idle combat-capable unit `automation.mode: 'auto-explore'` and reuses this same
player-facing mechanism. Before this fix, the old recency-only chooser reliably ran itself
into a dead end within a few rounds (a local cycle, or every reachable tile
threat-blocked) — `applyAutoExploreOrder` clears `automation` whenever
`chooseAutoExploreMove` returns null, so a wandering combat unit was routinely handed back
to AI control on its own, still near home. Two problems, found in sequence:

1. **Nothing ever explicitly reclaimed an exploring unit once a plan needed it.**
   `assignUnitsToPortfolio` (`ai-unit-assignment.ts`) never checked `unit.automation` at
   all, so a unit could be "assigned" to a plan while `turn-manager.ts`'s per-civ
   turn-start loop kept re-issuing its exploration move every round regardless —
   consuming its movement before the civ's own tactical dispatch
   (`processMajorCivStrategicTurn`) ever ran that round. Reproduced directly: in the
   campaign fixture, all 4 tanks stayed tagged `auto-explore` and never moved under
   tactical control for the full 200-round budget, even after a `capture` plan had
   supposedly claimed them.
2. **Once reclaimed, a scattered force can never move at all.** `ai-tactics.ts`'s
   `supportRemainsCohesive` — a deliberate combat rule: a unit will not advance toward an
   objective unless another assigned combat unit is within one turn's move of the
   candidate destination — cannot be satisfied for a unit that wandered far enough from
   its formerly-adjacent squadmates. The 7.2 fix's real multi-hop lookahead lets four
   tanks that start on the same tile scatter across the map within ~15 rounds (each
   running its own independent BFS from its own position, with no coordination), compared
   to the old algorithm's local-pocket cycling, which incidentally kept a scattered force
   within reunion distance. Once scattered past that threshold, `rankMoves` produces zero
   candidate destinations for every assigned unit, forever — confirmed directly: fixing
   only problem 1 (below) still left 2 of 4 tanks frozen with full movement and
   `hasActed: false` for 190 straight rounds, doing nothing.

**Fix, two parts, both required:**

- **Reclaim on assignment** (`basic-ai.ts`, `processAITurnInternal`): any unit present in
  `preparedForTurn.assignments.assignmentsByPlanId` this round has its
  `automation.mode: 'auto-explore'` cleared immediately, before tactical dispatch runs.
  This alone fixes problem 1 but not problem 2.
- **Leash the administrative case only** (`ai-exploration.ts`'s new
  `computeAdministrativeExploreLeash`, consumed by `auto-explore-system.ts`'s new optional
  `AutoExploreLeash` parameter on `findNearestUnexploredTile` / `chooseAutoExploreMove` /
  `applyAutoExploreOrder`): bounds an AI-owned unit's BFS target to
  `EXPANSION_SEARCH_RADIUS` (8 — the same horizon `ai-expansion-sites.ts` already uses to
  decide how far this civ can usefully see for settling, since discovering a legal
  expansion site is this administrative mechanism's actual reason to exist per #1064) of
  the owning civ's nearest city. Returns `null` (no leash) for a human-owned unit, so the
  **player's own auto-explore button is completely unaffected** — full unbounded #1066
  behavior, exactly as shipped in 7.2. Once the leashed area is fully explored,
  `findNearestUnexploredTile` returns null, the algorithm falls back to the old local-only
  scoring (bounded, so it exhausts quickly), and the unit is released back to AI control —
  restoring the same "trapped → reclaimed" safety valve the old algorithm provided by
  accident, but confined to a radius small enough that a reclaimed unit is always within
  realistic marching (and cohesion) distance of home.

**Verified fix**: re-ran `domination-ai-campaign.test.ts` after both parts — the AI wins
the scripted domination victory again, materially *faster* than the pre-#1066 baseline
(both rival capitals fall by round ~14 instead of drifting for the full 200-round budget),
because passive city vision inside the leashed radius now reliably reveals a legal
expansion/attack path instead of relying on luck. This also required re-deriving
`tests/app/simulation-determinism.test.ts`'s `#1064 expansion determinism` MIDPOINT
constant (the leash changed exactly how fast the belief layer reveals an expansion site) —
see that file's own comment for the re-measured windows.

**Boundary check against this same section's own list below**: the leash lives entirely in
`ai-exploration.ts` (an AI-layer module) and is passed as an explicit, optional parameter
into the systems-layer `auto-explore-system.ts` — it does not add an `OpponentChallenge` or
`PersonalityTraits` dependency (§10 stays intact), does not change what information is read
(§9 stays intact — the leash anchor is the civ's own already-known city position), and does
not touch `ai-tactics.ts`'s cohesion rule at all, which stays exactly as designed.

### 7.5. Third-order finding: a pre-existing, unrelated save/reload determinism gap in contact discovery

Running `tests/simulation/long-horizon/campaign-continuity.test.ts` (part of the mandatory
`yarn test:ai-long` acceptance gate, §13) after 7.4's fix landed surfaced a second, completely
unrelated failure: `lh-standard-medium`'s save/reload determinism check found
`civilizations.ai-2.knownCivilizations.length` diverging between an uninterrupted 400-round run
and one with saves/reloads at rounds 150 and 300 — a real violation of the Deterministic
Simulation Contract's save/reload-continuity clause (`.claude/rules/game-systems.md`).

**This has nothing to do with #1066's exploration fix or the administrative leash in §7.4.**
Neither `auto-explore-system.ts` nor `ai-exploration.ts` touches discovery, visibility, or
diplomacy code. It is the same "newly exposed, not caused" pattern this exact file
(`campaign-continuity.test.ts`) has hit three times before — #1092, #1098, #1099 — where an
unrelated AI trajectory shift reaches a scenario shape (here: two AI civs whose territories
border closely enough for one to see tiles the other owns, without ever seeing that civ's
actual cities or units) that a pre-existing gap had never been exercised against before.

**Root cause, confirmed empirically** (bisected to a single round boundary; diffed tile
ownership, both civs' fog-of-war visibility, war status, treaties, and breakaway records —
all byte-identical between the diverging runs; then confirmed by re-running the discovery
sync directly on the captured state with no save/reload involved at all, which *also*
found the "missing" contact instantly): `turn-manager.ts`'s per-civ round-processing block
called `syncCivilizationContactsFromVisibility` immediately after the civ's own
`updateVisibility` pass, but *before* several other vision-granting side effects later in the
same block — mass surveillance, satellite surveillance, minor-civ shared vision, and ally
electric-telegraph vision sharing. Any contact only discoverable *through* one of those later
sources could never be caught live: the next round's `updateVisibility` recomputes fog-of-war
from scratch (degrading an untouched-by-the-civ's-own-units tile back to `'fog'`) before that
round's sync point runs again, and the later sources only re-promote it to `'visible'` *after*
sync already ran — missing it every round, forever, regardless of round count.
`normalizeLoadedState`'s unconditional `refreshKnownCivilizations` sweep on every load has no
such ordering constraint (it just calls the same sync for every civ, once, against whatever
visibility currently exists), so a save/reload could "discover" a contact live play could
never reach on its own.

**Fix**: moved the `syncCivilizationContactsFromVisibility` call (and its
`civilization:first-contact` event emission) to the end of the per-civ vision block in
`turn-manager.ts`, after mass surveillance, satellite surveillance, minor-civ shared vision,
and ally telegraph vision have all applied for that civ's round. Pure reordering — no logic
change, no new field, no save migration. Verified: the bisected round-150 repro now shows the
live run discovering the contact identically to the reload path (zero divergence); the full
`campaign-continuity.test.ts` (all 3 tests, full 400-round scenario with both save points)
passes; `yarn test:regular` (634 files) and `yarn test:intensive-simulations` (17 files) stay
green; the `#1069` golden digest is unaffected (that fixture's scenario doesn't exercise any
of the four late vision sources this reordering affects).

**Boundary check**: this touches only event-emission timing within an already-existing
per-civ loop iteration — no new persisted field, no change to what `hasMetCivilizationByCurrentEvidence`
evaluates, no change to `auto-explore-system.ts`/`ai-exploration.ts` at all. `tests/integration/save-load-mass-discovery.test.ts`
(the #435 regression it sits next to conceptually) has no ordering dependency on this block and
was re-verified passing as part of the full `test:regular` run.

## 8. Boundary contracts this fix must not touch

- **#1109 amphibious routing** (`findRegionCrossings`, `resolveObjectiveTravelCandidates`):
  untouched. Not implicated; this scenario needs no water crossing.
- **#1107 coastal-access / #386 `isCityCoastal`**: untouched. Not implicated.
- **#1116 plan-agnostic demand taxonomy** (`PLAN_AGNOSTIC_DEMAND_SOURCE_IDS` /
  `revalidatePreparedPlan`): untouched. Worker-infrastructure demand already survives
  correctly; this fix does not add, remove, or reclassify any demand source.
- **#1119 defensive city focus**: untouched. Not implicated (never triggers — nothing ever
  attacks a civ nobody can see).
- **Movement Action Contract (#1025)**: `applyAutoExploreOrder` already goes through
  `executeUnitMove`/`resolveUnitMoveIntent`; the fix changes *which* destination
  `chooseAutoExploreMove` proposes, never how a proposed move is validated or executed.

## 9. Perception safety

No change to what information is read. `chooseAutoExploreMove` already reads only
`state.civilizations[unit.owner].visibility` (the unit owner's own fog-of-war) and
`getMovementRange` (the unit's own reachable set) — both already belief-bounded. The fix
widens *memory of the unit's own past moves* (data the unit already possesses about
itself), never grants access to new information about the world. No omniscient shortcut.

## 10. Difficulty / personality

Fully invariant by construction — `auto-explore-system.ts` has no `OpponentChallenge` or
`PersonalityTraits` parameter today and this fix adds none. Confirmed via the healthy-civ
comparison that the trap is terrain-triggered, independent of personality.

## 11. Save / determinism

`unit.automation.lastTargets` already exists as a small string array; changing its
tracked size/shape is a value-level behavior change to an already-persisted field, not a
schema change (the field's *presence* and *type* — `string[]` — are unchanged, only how
many entries and possibly the shape convention such as ordering/uniqueness may change; if
Terra changes representation e.g. list to a capped-`Set`, it must still (de)serialize as a
plain `string[]` for `GameState`'s POJO contract). No new field, no migration. A same-seed
determinism run before/after is still required since this changes a real AI decision path
(exploration destinations) — expected and legitimate, matching the same "digest may move
if a decision legitimately changes" pattern #1108/#1116 already established for
`aiRound-1069-equivalence.test.ts`.

## 12. Performance

O(1)-ish extra memory per exploring unit (a small capped list/set, not a full-map scan).
No new per-round computation shape — `rankCandidate` already iterates `getMovementRange`'s
already-bounded reachable set; only the recency lookup's underlying structure changes.
Must re-run `tests/perf/algorithmic-budgets.test.ts` and `aiRound-1069-equivalence.test.ts`
(the latter's golden digest will very likely need the sanctioned regeneration, since this
is a genuine AI decision-path change, exactly like #1108/#1116/#1119 each required).

## 13. Long-horizon acceptance

Before/after `yarn test:ai-long`, full 9-scenario matrix (this design's baseline run is
already captured against `ed0131d8` for the "before" side). Required after the fix:

- `expansion-frozen`/#1066 (`lh-veteran-medium`, `ai-3`) reassessed: expect it to stop
  reproducing (the civ should now discover its huge home continent and expand normally,
  matching `ai-1`/`ai-2`'s behavior) — if it does not fully resolve, at minimum
  `knownCities`/`knownResources` growth and exploration distance-covered must
  demonstrably improve, and the remaining gap must be freshly re-diagnosed, not assumed.
- `production-idle`/#1066 (currently the "sole remaining owner" entry after #1116):
  reassess honestly — if `ai-3` starts a real plan and produces normally, this instance's
  attribution to #1066 should be removed/updated.
- `gold-hoard` downstream of the above: reassess honestly, expect it to resolve once
  production has something useful to spend on.
- Zero new unregistered findings; zero stale registered findings (two-way ratchet).
- No new `tech-frozen`. No unit-count-runaway regression.
- **Watch for trajectory-shift exposure of a DIFFERENT latent gap** in another
  scenario/civ, matching the established F7/F8/F9/F11 pattern from prior MRs (#1094,
  #1108, #1116 all exposed a new instance elsewhere once a real behavior change let an
  AI civ progress further). If found, register it and file a focused follow-up — do not
  absorb it into this MR.

## 14. Mandatory inline review

- **Balancing gameplay**: no combat/yield/cost numbers change. This restores intended
  behavior for an AI civ that was unfairly disadvantaged by a bug, not a new balance
  lever. Acceptable as-is.
- **Fun**: a permanently-frozen AI civ is a dead, uninteresting opponent for the rest of a
  400-round game. Fixing this makes every game more competitive/alive. No negative found.
- **New mechanics**: none introduced — pure bug fix to an existing mechanic. Confirmed via
  the non-goals below.
- **Different player ages (7-43)**: `chooseAutoExploreMove`/`applyAutoExploreOrder` is the
  SAME function the human player's own auto-explore button drives (confirmed via
  `.claude/rules/ai-simulation.md`'s own note). **This fix also fixes the identical bug for
  human players** — a young player relying on auto-explore for their own scout would hit
  the exact same cyclic trap and see their scout "doing nothing" for no visible reason,
  which is confusing without any error message. This is a genuine, previously-uncredited
  benefit worth stating explicitly, not just an AI-only fix.
- **Different play styles**: players who lean on auto-explore benefit directly; players
  who scout manually are unaffected either way.
- **Built-in difficulty modes**: difficulty-invariant by construction (verified: no
  `OpponentChallenge` read anywhere in `auto-explore-system.ts`, before or after).
- **How computer players will use it**: the central subject of this whole investigation —
  AI civs can now actually complete exploration and discover real strategic
  opportunities on their own already-generated map.
- **UI**: no new UI surface. Existing auto-explore visual affordances (if any) are
  unaffected by a change to internal scoring memory.
- **UX**: auto-explore should feel more reliable (a scout covers materially more new
  ground before needing manual redirection) for both AI and human use. No negative UX
  identified.
- **Architecture**: fix is fully contained inside one already-isolated module
  (`auto-explore-system.ts`) plus its own tests/fixtures. No cross-system boundary
  touched; confirmed via the source-search step in the Terra plan.
- **Extensibility**: a capped-memory structure generalizes better than a hardcoded
  `slice(-4)` — a future explorer type (e.g. a naval auto-explore mode, if ever added)
  reuses the same mechanism with no further change needed.
- **Data**: no content changes (no unit/building/tech additions).
- **SFX**: not applicable — exploration movement has no dedicated SFX beyond ordinary
  movement, which this change does not touch.
- **Updating saved games**: no schema change (Section 11). A genuinely valuable property
  to preserve during implementation: an EXISTING player save with an AI civ already stuck
  in this exact trap should self-heal automatically the next time that unit's
  auto-explore is evaluated post-fix, since `lastTargets` is read/written fresh each move
  with no versioned migration needed. Terra must verify the new memory construction
  tolerates loading an old, short (≤4-entry) `lastTargets` array without any special-case
  code — it should simply become the initial state of the new (larger-capacity)
  structure.
- **Proper testing**: TDD order specified in the Terra plan (RED reproduction, GREEN fix,
  negative case, full existing-regression preservation including the wrapped-seam case,
  integration confirmation, long-horizon gate).
- **Regressions solo play**: covered via `ai-playability.test.ts` and the full regular
  suite in the Terra plan's command list.
- **Hot seat play**: `auto-explore-system.ts` has no `currentPlayer`/hot-seat-specific
  branching — it operates per-unit regardless of whose seat is active, so no
  hot-seat-specific regression is structurally possible here. `lh-hotseat-medium` is
  already part of the long-horizon matrix the Terra plan requires re-running, giving
  concrete coverage on top of the structural argument.
- **Proper implementation**: minimal, TDD-driven, respects every named boundary contract
  (Section 8).

## 15. Non-goals (explicit)

- Does not implement amphibious *exploration* (crossing water to explore, as opposed to
  #1109's amphibious *objective routing* to an already-known target). No evidence this
  scenario needs it; the continent audit rules it out for THIS reproduction. If a future,
  genuinely water-locked civ (with real evidence, not inference) needs this, it is a
  separate, larger feature deserving its own design review.
- Does not touch `objectiveCandidates`, `getKnownExpansionSites`,
  `resolveObjectiveTravelCandidates`, `revalidatePreparedPlan`, or any production/demand
  code.
- Does not add a fallback/consolidate plan type.
- Does not add any new AI heuristic (food-focus, science-focus, national-intent,
  multi-phase operations, personality overhaul) — explicitly excluded by the task's scope
  guardrails and unnecessary given the proven root cause.
- Does not change map generation, `regionKey` tagging, or landmass structure.
- Does not widen `isCityCoastal` or touch #386.
