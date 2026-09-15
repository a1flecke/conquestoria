# #1069 — AI-round pathfinding / city-yield super-linearity: design

## Status

Astra design pass. Re-measures current `main` (not the stale issue body), attributes the
super-linear work to exact call sites, and proposes two narrowly-scoped, provably-exact
optimizations plus one perf-infrastructure gap fix. **Do not implement from this doc directly —
see the companion plan at `docs/superpowers/plans/2026-09-15-issue-1069-ai-round-perf.md`.**

## 1. The issue body is stale — re-measurement first

The issue (#1069) cites `pathQueries` 118→408, `heapPops` 114,774→387,872,
`calculateCityYields` ~14,664→~61,873, and proposes "build per-round shared caches (blocking-
entity key set, per-civ reachable-tile maps, a city-yield cache)". None of that survives contact
with current `main`.

**Re-measured on `main` @ `ca7392c1`** (the exact commit merged for #1107, HEAD of this worktree
at investigation time), via `yarn vitest run tests/perf/algorithmic-budgets.test.ts` (all 16
assertions pass against the checked-in budgets) and the checked-in
`tests/perf/baselines/algorithmic-baseline.json`:

| metric | e1 | e2 | ratio | vs. issue body |
|---|---:|---:|---:|---|
| `aiRound.pathQueries` | 251 | 572 | 2.28× (raw), guard uses 2.96×-slack | issue said 118→408 (3.46×) — different absolute numbers, same shape |
| `aiRound.heapPops` | 116,596 | 386,884 | 3.32× | issue said 114,774→387,872 (3.38×) — coincidentally almost identical absolute numbers (the crowded fixture is stable across the intervening work) |
| `aiRound.blockingEntityAtCalls` | 261 | 509 | 1.95× — **linear**, not super-linear | not cited in the issue at all |
| `aiRound.cityYieldCalls` | **not tracked** | **not tracked** | — | issue said ~14,664→~61,873; see §4 |

The `pathQueries`/`heapPops` absolute numbers are close to what the issue originally reported
despite #1064/#1066/#1068/#1070/#1092/#1098/#1099/#1107 all landing since — because none of that
work touches the two functions that actually dominate (§2). The **auditedCommit is stale**
(`96fb08e9`, from the #1064 merge) but the *numbers* it pins happen to still be current-ish. This
is coincidence, not evidence the issue's caching proposal is still right — the attribution below
shows the proposal targets the wrong functions entirely.

## 2. Attribution: what actually produces the growth

Investigated with a temporary (deleted, never committed) stack-trace-bucketing instrumentation
layered on top of `tests/perf/perf-probe.ts`'s existing spies — zero production instrumentation
added, consistent with `tests/scripts/perf-isolation.test.ts`. Full methodology and raw output are
reproduced in §8 for anyone who wants to re-derive this.

### 2a. `heapPops` / `pathQueries` — attributed by call site

| call site | e1 queries | e1 heapPops | e2 queries | e2 heapPops | share of e2 heapPops |
|---|---:|---:|---:|---:|---:|
| `routePath` @ `ai-upgrades.ts:162` (upgrade-routing destination search) | 80 | 114,512 | 280 | 382,856 | **98.96%** |
| `<anon>` @ `ai-prepared-turn.ts:740` (`travelTurnsByPlanId`, unit↔plan assignment scoring) | 44 | 981 | 84 | 2,901 | 0.75% |
| `validateUnitMove` @ `unit-movement-validation.ts:179` (real per-unit movement execution) | 90 | 313 | 176 | 581 | 0.15% |
| `pathLength` @ `ai-objective-scoring.ts:189` (objective-candidate distance scoring) | 38 | 810 | 32 | 546 | 0.14% (**shrank** at e2) |

**`routePath` in `ai-upgrades.ts` is 98–99% of all `aiRound` heap-pop work, at both scales.** Its
query count growth (80→280, 3.5×) for a ~1.9× entity-count increase is the entire story behind
the issue's headline ratio. The other three call sites grow near-linearly with entity count
(`ai-prepared-turn.ts:740` and `validateUnitMove` both ≈1.9–2×, matching the fixture's own
entity-scale factor) or don't grow at all (`ai-objective-scoring.ts:189` shrinks) — **none of
them are the super-linear driver**, and none is touched by this MR.

### 2b. Why `routePath` is O(units × cities), not O(units)

`processAIUpgrades` (`ai-upgrades.ts:171`) is called exactly once per AI civ per round
(`ai-major-turn.ts:911`, confirmed by grep — no other caller). Inside it, for every unit that
is upgrade-eligible, not already routed, not urgently assigned, and not the civ's sole combat
unit under threat, `ai-upgrades.ts:285-306` does:

```ts
const destinations = Object.values(working.cities)
  .filter(cityCandidate =>
    safeCity(working, civId, cityCandidate, prepared)
    && getCanonicalUpgradeTarget(current, civ.techState.completed, cityCandidate.buildings, availableResources))
  .flatMap(cityCandidate => {
    const path = routePath(working, current, cityCandidate, civ.techState.completed); // <-- full A*
    if (!path) return [];
    const rounds = Math.ceil(Math.max(0, path.length - 1) / Math.max(1, UNIT_DEFINITIONS[current.type].movementPoints));
    return rounds <= 6 ? [{ city: cityCandidate, path, rounds }] : [];   // <-- discarded AFTER paying for the search
  })
```

It calls `findPath` **once per (eligible unit) × (safe, upgrade-capable city)** — every single
one of the civ's own cities that has the right building, regardless of distance — then throws
away every result whose `rounds > 6`. On the crowded fixture (80×80 map, cities deliberately
strided "across the whole map" — see `tests/perf/fixtures/crowded-state.ts`'s own doc comment),
most of a civ's own cities are far apart, so most of these searches are long, expensive, and
guaranteed-discarded before they're even computed. As entity count doubles, **both** the eligible-
unit count and the own-city count roughly double, so total `routePath` calls scale ≈
`unitsEligible × citiesPerCiv` ≈ O(n²) — exactly the observed 3.5× growth for ~1.9× entities
(1.9² ≈ 3.61, matching).

The existing-route call site (`ai-upgrades.ts:212`, for a unit that already has a committed
`upgradeRoutesByUnitId` entry) is O(1) per routed unit — a single fixed target, nothing to prune.
It is untouched by this fix.

### 2c. Rejected hypothesis: `getMovementRangeDetails` / expansion-site evaluation / tactical movement

None of the top four call sites are movement-range BFS (`#1068` already fixed that;
`moveRange@e1`/`moveRange@e2`'s `blockingEntityAtCalls` are pinned at 0 by GUARD 1, confirmed
still true), expansion-site evaluation (`ai-expansion-sites.ts` never calls `findPath` at all —
it's deliberately `GameState`-free per #1064's belief/legality split), or amphibious/transport
routing (`#1109`'s reachability checks use region-crossing feasibility, not per-candidate A*).
The original issue's "movement ranges... re-derived per actor while scoring" hypothesis is
**not what's happening** — confirmed false by direct attribution, not assumed.

## 3. Cache validity / mutation analysis for the `routePath` fix

**Proposed fix:** before calling `routePath` for a destination candidate, compute
`maxHexSteps = 6 * Math.max(1, UNIT_DEFINITIONS[current.type].movementPoints)` (the exact same
cap the existing post-hoc check already uses) and skip the `routePath` call entirely when
`distance(working, current.position, cityCandidate.position) > maxHexSteps` — using the file's
own existing wrap-aware `distance()` helper (`ai-upgrades.ts:47-55`, already used by `safeCity`).

This is **not a cache** — it's a provably-exact prune, so most of the ten cache-validity
questions don't apply, but answered anyway for completeness:

1. **What exact inputs define the result?** `current.position`, `cityCandidate.position`,
   `UNIT_DEFINITIONS[current.type].movementPoints`, `working.map.wrapsHorizontally`/`width`. All
   read fresh on every call — nothing is memoized across calls.
2. **Which inputs can mutate during the round?** None of these mutate within
   `processAIUpgrades`'s single synchronous pass over `candidates` for one civ — `working` is
   reassigned only by successful upgrades/moves earlier in the loop, but a unit's own `.position`
   doesn't change until `executeUnitMove` actually runs (after the destination is already chosen),
   and `UNIT_DEFINITIONS` is a static catalog.
3. **Who mutates them?** N/A — no caching, recomputed every call from current `working`.
4. **Phase boundaries?** N/A.
5. **Cache scope?** N/A — this is a per-call arithmetic guard, not a cache.
6. **Invalidation?** N/A.
7. **Can it change AI decisions?** No. The proof: hex distance is a strict lower bound on
   `findPath`'s returned hex-step count (`path.length - 1`) for any domain, because the returned
   path is a sequence of hex-adjacent steps and no adjacency-respecting route can be shorter than
   the graph-theoretic (wrap-aware) hex distance between its endpoints; terrain cost and obstacles
   can only make a real path *longer* or *impossible*, never shorter. So if
   `distance > 6 * movementPoints`, then `path.length - 1 >= distance > 6 * movementPoints`, hence
   `Math.ceil((path.length - 1) / movementPoints) > 6` — the candidate was **always** going to be
   discarded by the existing `rounds <= 6` filter. Skipping the `routePath` call for it changes
   nothing about which candidate wins; it only skips computing results that were thrown away
   anyway. For every candidate that passes the distance filter, `routePath` still runs exactly as
   today, on the exact same inputs, producing the exact same path/`rounds`/ranking.
8. **Can it expose non-perceived information?** No new information is read — `distance()` between
   two of the ACTING CIV'S OWN city/unit positions (both already fully known to that civ; no fog
   involved) using data the loop already reads unconditionally.
9. **Can ordering differences change ties?** No — the `.flatMap` preserves the exact same
   iteration order over `Object.values(working.cities)`; the prune only removes doomed entries
   before the (unchanged) final `.sort(...)` by `rounds`, then `path.length`, then `city.id`.
10. **Can stale data survive a mutation?** N/A — nothing is stored across calls.

## 4. City-yield investigation (§ mandated by the assignment)

**Answer: (D) — a different function now dominates equivalent economy-scoring work,** and
**(C) — the probe/report infrastructure measures `cityYieldCalls` but the `aiRound` perf area
silently drops it.** Confirmed by reading `tests/perf/perf-probe.ts` (captures `cityYieldCalls` in
every `withPerfProbe` call, including the one wrapping `processNonHumanMajorRound`) against
`tests/perf/perf-areas.ts`'s `measurePerfArea` (`aiRound@e1`/`aiRound@e2` case, lines 98-115):
the returned `AreaSample` only forwards `pathQueries`, `heapPops`, `structuredCloneWholeState`,
`blockingEntityAtCalls` — `cityYieldCalls` is computed by the probe and then thrown away. So the
`aiRound` budget in `algorithmic-budgets.test.ts` has **never** gated it, which is why nobody
noticed it growing.

### 4a. Attribution

| call site | e1 calls | e2 calls | share |
|---|---:|---:|---:|
| `getProjectedCityScience` @ `research-output-system.ts:94` (per-city yield inside research-output projection) | 9,616 | 31,164 | 99.1% |
| `calculateProjectedCityYields` @ `city-work-system.ts:215` (via `ai-production.ts:492`'s `productionPerTurn`, once per `generateWithResidual` call) | 192 | 272 | 0.9% (near-linear, not the driver) |

Growth: 9,616 → 31,164 = **3.24×** for ~1.9× entities (1.9² ≈ 3.61 — same super-linear signature
as the pathfinding side). The `networkGovernanceBonus` pre-pass (`research-output-system.ts:63`,
a *second*, separate O(cities) `calculateCityYields` scan gated behind a lowest-city-science tech
bonus) contributes **zero** calls in this fixture — confirmed by the absence of a distinct
`:63` call-site bucket in the attribution — because the fixture's tech list
(`MID_TECH_IDS = TECH_TREE.filter(t => t.era <= 5)`) doesn't include whatever era-6+ tech grants
`getLowestCityScienceBonus > 0` (`tech-yield-system.ts:347`). This matters for scoping the fix
(§5b).

### 4b. Root cause: `getMarginalCivResearchGain` recomputes the whole empire from scratch per candidate

`getMarginalCivResearchGain(state, civId, cityId, buildingId)` (`research-output-system.ts:196`)
has exactly one call site: `ai-production.ts:664`, inside `generateWithResidual`'s
`for (const building of getAvailableBuildings(...))` loop — i.e. **once per (idle city ×
available building) candidate**, for every idle city an AI civ scores production for, every
round. Its body:

```ts
const before = calculateCivResearchOutput(state, civId).finalScience;      // full O(cities) rescan
// ...build a hypothetical projectedState with buildingId added to city.buildings...
return Math.max(0, calculateCivResearchOutput(projectedState, civId).finalScience - before); // ANOTHER full O(cities) rescan
```

Both calls to `calculateCivResearchOutput` (with no `authoritativeCityScience` override) fall
through to `getProjectedCityScience(state, civId)`, which loops `civ.cities` and calls
`calculateCityYields` once per city. So **every single building candidate for every single city**
triggers `2 × citiesPerCiv` yield calls — and `before` is **identical on every single call within
one `generateWithResidual` invocation**, because `state` is the function's fixed input parameter
(never mutated inside it — confirmed by reading the whole function, `ai-production.ts:477-721`:
it only ever reads `state`/derives `working` values, never reassigns or mutates `state` itself).
Net observed cost: O(cities² × buildingsPerCity) for work that needs, at most,
O(cities + cities × buildings).

This file already carries a comment (`ai-production.ts:750-754`) documenting a *prior* partial
fix to an adjacent redundancy (`applyAIProduction`'s comparator used to call `generateWithResidual`
twice per comparison — now precomputed once via `bestByCityId`). That prior fix did **not** touch
the redundancy inside `generateWithResidual`'s own building loop, which is what this MR closes.

## 5. Cache validity / mutation analysis for the city-yield fix

Two fixes, layered:

### 5a. Fix A — hoist `before` to be computed once per `generateWithResidual` call (safe, unconditional)

`generateWithResidual(state, civId, cityId, demands, personality)` is a pure read of a **single**,
fixed `state` snapshot — confirmed by reading the entire function body: it never reassigns
`state`, never calls anything that could mutate it (all local derivations —
`getCivAvailableResources`, `resolveCivilizationEra`, `getReservedNationalProjectKeys`,
`buildProductionCostContext`, etc. — are pure reads). So `calculateCivResearchOutput(state,
civId).finalScience` (today's "before") is **provably identical across every building candidate
evaluated within one call**. Computing it once at the top of the function and passing it into
every `getMarginalCivResearchGain`-equivalent call, instead of recomputing it once per building,
is a pure duplicate-elimination — mutation-scope answer: the scope is "one synchronous function
call, zero mutation," the tightest possible safe window. Roughly halves the redundant work on its
own (removes the *duplicate* "before" computation; "after" is still O(cities) per candidate until
§5b).

**Not extended across the two separate `generateWithResidual` call sites in `applyAIProduction`**
(the `bestByCityId` precompute pass, and the sequential enqueue loop) — deliberately. Those two
passes use different state snapshots (`state` vs. an incrementally-mutating `nextState`), and
within the sequential loop, an **earlier** city's newly non-empty `productionQueue` legitimately
changes that city's own `idleScienceBonus` contribution to total civ science
(`research-output-system.ts:128-130`: `city.productionQueue.length === 0 && city.idleProduction
=== 'science'`) — so the "before" baseline for a **later** city in the same loop is genuinely
different from the "before" baseline for an earlier one, and from the `bestByCityId` pass's
baseline. Caching across those boundaries would be a real behavior change, not a safe dedup. This
MR does not touch that structure.

### 5b. Fix B — incremental `after`: patch one city's science instead of rescanning the civ

**Scope-limited to `networkGovernanceBonus === 0`** (i.e. `getLowestCityScienceBonus(civ.techState
.completed) === 0` — the pre-era-6 case, which is what the measured fixture exercises and what
dominates the bulk of any campaign's turn count). When `> 0`, the fix **falls back to today's
exact, unmodified full-rescan code** — zero behavior-change risk for that branch, because it's
literally the same code path as `main`.

**Why the scope line is drawn there:** `networkGovernanceBonus > 0` makes
`getProjectedCityScience` run a *second*, separate O(cities) pre-pass
(`research-output-system.ts:56-76`) to find `lowestScienceCityId` — the city with the lowest raw
(pre-bonus, pre-multiplier) science — and grants it a bonus. Patching only the modified city's
*final* science number is not enough in that branch: the modified city's *raw* science could
change which city is lowest, which changes which city gets the flat bonus, which changes a
*different* city's final number too. Correctly incrementalizing that would require also caching
and re-deriving the raw per-city science array (not just the final numbers already exposed by
`getProjectedCityScience`) — real, but separable, additional complexity for a code path this
fixture doesn't exercise and that isn't where the measured super-linearity lives. Falling back
here is an honest, documented scope boundary, not a shortcut around correctness.

**Answers to the ten cache-validity questions, for the in-scope (`networkGovernanceBonus === 0`)
branch:**

1. **Inputs:** the cached "before" per-city science record (`Record<cityId, number>`, one number
   per `civ.cities` entry) from `getProjectedCityScience(state, civId)`; civ-level values that
   feed each per-city computation (`resourceYieldBonus`, `empireTechPercents`,
   `empireFlatTechYields`, `empireFlatTargetCityId`, `civDefinition?.bonusEffect`) — all derived
   once, outside the per-city loop, from `state`/`civId` alone (never from a per-building
   candidate).
2. **What can mutate them during the call?** Nothing — same "one synchronous, non-mutating
   function call" scope as §5a. `state` never changes within `generateWithResidual`.
3. **Who mutates them?** N/A within scope.
4. **Phase boundaries?** The cache is rebuilt from scratch on every `generateWithResidual` call
   (i.e. every city-scoring pass) — never carried across calls, civs, or rounds.
5. **Cache scope:** per `generateWithResidual` invocation (one city, one round, one civ). The
   narrowest scope that still eliminates the duplicate work.
6. **Invalidation:** none needed — never persists past the function call that built it.
7. **Can it change AI decisions?** No, subject to the proof below.
8. **Can it expose non-perceived information?** No — everything read is the acting civ's own
   `state.civilizations[civId]`/`state.cities[cityId]` data, exactly what the unmodified code
   already reads.
9. **Can ordering differences change ties?** No — `getAvailableBuildings`'s iteration order is
   unchanged; only the internal cost of scoring each candidate changes, not the order candidates
   are produced or compared in.
10. **Can stale data survive a mutation?** No — see proof below that "after" only ever differs
    from "before" in the one city that's actually being projected.

**Proof that patching one city's number is exact (for `networkGovernanceBonus === 0`):**
`getMarginalCivResearchGain`'s `projectedState` construction (`research-output-system.ts:209-223`,
unchanged by this fix) only ever touches two things: `cities[cityId].buildings` (append one
building id) and, if that building is a unique national project, `builtNationalProjects` (add one
entry). Grepped every caller of `calculateCityYields` in `src/systems/*.ts` — it has exactly two
call sites, both inside `getProjectedCityScience`, both reading only `city`
(`projectedState.cities[cityId]` for the ONE city being iterated), `projectedState.map`,
`civDefinition?.bonusEffect`, `civ.techState.completed`, and that city's own
`activeRouteCount`/`hostsCompletedLegendaryWonder` flags (each derived from `marketplace
.tradeRoutes`/`completedLegendaryWonders`, neither of which the projectedState construction
touches). None of these read any *other* city's `buildings`/state, so a different city's
`calculateCityYields` result is bit-for-bit unaffected by the one-city building addition — the
per-city loop body (`assignCityFocus`/`normalizeWorkedTilesForCity` included) never crosses city
boundaries within a single hypothetical snapshot with no `recalculateTerritory` call (which the
projectedState construction never invokes — territory/culture radius is unaffected by a
`buildings` array append that hasn't gone through the real production-completion path). The one
civ-level value the append *can* change is `getEmpireBonusScience` (via
`getNationalProjectCivYieldBonus`, if the appended building is itself a national project) — but
that's computed *outside* `getProjectedCityScience`, directly inside
`calculateCivResearchOutput(state, civId, options)` from whatever `state` is passed in. The fix
calls `calculateCivResearchOutput(projectedState, civId, { authoritativeCityScience: patched })`
for the "after" side, so `getEmpireBonusScience(projectedState, ...)` is still freshly recomputed
against the real post-append state — nothing here is stale. `calculateCoordinatedCityScience`
(the coordination-curve aggregation, `research-coordination-system.ts:45-75`) is a pure
sort/rank/weight function over the `Record<cityId, number>` array — no `calculateCityYields`
calls, so re-running it on the patched record is cheap and exact.

**Equivalence contract:** Terra must add a test that runs the production-scoring path with and
without the fast path (or compares against a hand-rolled unoptimized reimplementation) across
every `(city, building)` pair in a representative fixture and asserts byte-identical
`researchValueScore`/`economyScore`/final candidate ordering — not just "tests still pass." See
plan Task 4.

## 6. Behavior-equivalence contract (both fixes)

Both fixes are **provably exact** per §3 and §5b, not heuristic — so the strongest applicable
equivalence check is: for a fixed seed/state, the resulting `GameState`, AI `traces`, and every
downstream decision (upgrade-route assignment, production queue selection, research selection)
must be **byte-identical** before/after, using `firstSimulationDivergence` /
`assertSimulationEquivalent` (`tests/helpers/deterministic-state.ts`) — never a hand-rolled
`JSON.stringify` diff. Plan Task 5 wires this as an explicit before/after comparison over the
crowded fixture (both scales) plus at least one real long-horizon scenario snapshot.

No RNG, no ordering, no information-visibility change is introduced by either fix — both are
pure arithmetic prunes/reuses over already-computed, already-visible data.

## 7. Additional implications (mandated checklist)

Both touched call chains (`processAIUpgrades` via `ai-major-turn.ts:911`, `applyAIProduction`/
`generateWithResidual` via `basic-ai.ts:1063`, which is itself inside the major-civ per-civ turn
function — confirmed by its `PersonalityTraits`/`preparedForTurn` usage, which minor civs don't
have) are **major-civ-only**. Minor civs (city-states) run an entirely separate economy
(`minor-civ-economy-system.ts`, `.claude/rules/game-balance.md`'s "Minor-Civ Economy" section) —
neither fix touches it.

- **Deterministic behavior:** neither fix introduces `Math.random()`, `createSimulationRng`, or
  any new source of nondeterminism. Both are pure functions of already-passed-in `state`/`civId`
  values, evaluated in the exact same iteration order as before (§3 point 9, §5b point 9). Task 1
  and Task 4's equivalence tests are the empirical proof; `assertSimulationEquivalent`'s save/
  reload-continuity contract is unaffected because nothing here is persisted (next point).
- **Save implications:** none. `ResearchScoringBaseline` (and the distance-prefilter's local
  `maxHexSteps`/`distance()` values) are function-call-scoped locals — never assigned to any
  field of `GameState`, never serialized, never read back on load. No `SAVE_MIGRATIONS` entry, no
  `CURRENT_SAVE_SCHEMA_VERSION` bump, no `tests/storage/save-persisted-shape-ratchet.test.ts`
  impact — confirmed by construction: neither new symbol (`computeResearchScoringBaseline`,
  `ResearchScoringBaseline`, `projectOneCityScience`) is ever written to `state.opponentAI` or
  any other persisted field; both fixes only change *how* an existing, already-persisted decision
  (`portfolio.upgradeRoutesByUnitId`, `city.productionQueue`) is *computed*, not what gets
  written.
- **AI perception/privacy implications:** none. Every value both fixes read is the **acting
  civ's own** state (`working.cities` filtered to `city.owner === civId` in `ai-upgrades.ts`;
  `state.civilizations[civId]`/`state.cities[cityId]` for `cityId ∈ civ.cities` in
  `research-output-system.ts`) — no fog-of-war/perception boundary is crossed or narrowed by
  either fix; both already read exactly what the unmodified code read, just fewer times or via a
  cached intermediate.
- **Difficulty implications:** neither fix reads `resolveOpponentChallenge`,
  `OPPONENT_CHALLENGE_PROFILES`, or any challenge-tier value. `ai-upgrades.ts`'s existing
  `profile`/`remainingCap` logic (challenge-tier-gated) is untouched — the prefilter sits entirely
  inside the destination-candidate search, before any challenge-tier-gated cap check runs.
  Explorer/Standard/Veteran see identical upgrade-routing and production-scoring legality and
  results, just computed cheaper.
- **Personality implications:** neither fix reads `PersonalityTraits`/`weightProductionRoles`.
  `generateWithResidual`'s `personality` parameter flows into unit-role scoring untouched by this
  MR; the research-scoring baseline only accelerates `researchValueScore`'s *computation*, not its
  weighting or any personality-driven term that consumes it downstream. Different personalities
  still produce different final candidate rankings exactly as before (Task 4's equivalence test
  covers this indirectly: `researchValueScore` itself is asserted byte-identical, and it's the
  only value either fix touches).
- **Hot-seat implications:** neither fix reads `state.currentPlayer` or hardcodes `'player'`
  anywhere — both are `civId`-scoped exactly like the code they replace. The crowded perf
  fixture itself is hot-seat-shaped (`hotSeatConfig()` in `crowded-state.ts` mixes 4 human and 4
  AI slots via `createHotSeatGame`), so both `aiRound@e1`/`aiRound@e2` and Task 1's whole-round
  equivalence test already exercise `processNonHumanMajorRound` inside a hot-seat `GameState` —
  not a solo-only state — without needing a dedicated hot-seat variant.
- **Solo implications:** identical reasoning, and covered by the same fixture (a solo game is
  strictly fewer human slots than the hot-seat fixture already tests, not a different code path).
- **UI/UX:** no UI surface — neither fix is reachable from any panel, renderer, or player-facing
  copy; a player never directly observes `ai-upgrades.ts`/`ai-production.ts`'s internals. The one
  real UX effect is positive and indirect: less wall-clock time spent waiting on AI turns in a
  multi-major-civ game (the actual motivation for #1069) — not a claim this design doc needs to
  quantify (wall-clock is `yarn perf:report`'s job, never a merge gate per
  `.claude/rules/performance-budgets.md`), but worth stating plainly for the PR body.
- **SFX / age range / play styles / new mechanics / gameplay balance:** no surface at all — no
  audio, no new player-facing rule, no yield/cost/unit/building change, no age-appropriateness
  concern. Confirmed by the diff's own shape: every touched file is under `src/ai/` or
  `src/systems/research-output-system.ts`'s AI-scoring path, never `src/ui/`, `src/renderer/`,
  or `src/audio/`.

## 8. What this MR explicitly does not touch

- **#1108** (fully landlocked civs) — untouched. Neither fix changes site/target selection,
  legality, or naval capability; both only change *how cheaply* an unaffected decision is reached.
- **#1094** (production-sink content), **#1095** (Explorer tuning), **#1086–#1090** (national
  intent / personality redesign / multi-phase operations / non-major archetypes / AI legibility)
  — no code in this MR's scope touches any of these systems. No evidence surfaced during
  attribution implicates any of them.
- **`validateUnitMove`'s `blockingEntityAtCalls`** (261→509, ≈1.95×, linear) — investigated,
  confirmed near-linear (not super-linear), confirmed a *distinct* code path from `#1068`'s
  already-fixed `getMovementRangeDetails` BFS (GUARD 1 still passes: `moveRange@e2
  .blockingEntityAtCalls === 0`). Not reopening #1068; not in scope for #1069 either, since it
  isn't super-linear.
- **`ai-prepared-turn.ts:740`'s `travelTurnsByPlanId`** and **`ai-objective-scoring.ts:189`'s
  `pathLength`** — both investigated, both near-linear or shrinking, together <1% of `heapPops`.
  Not touched.
- **Difficulty tiers** — neither fix reads `resolveOpponentChallenge`/`OPPONENT_CHALLENGE_PROFILES`
  or any personality field. No legality, urgency, or priority change by tier.
- **The `#985`-sensitive note in `performance-budgets.md`** — this MR does not touch Domination AI;
  the `aiRound` budget's `#985`-sensitivity is unrelated to this change.

## 9. Reproducing the attribution (for reference, not part of the shipped diff)

A temporary test file (`tests/perf/zzz-investigate-1069.test.ts`, written, run, and deleted —
never committed) wrapped `vi.spyOn` around `findPath`, `BinaryHeap.prototype.pop`,
`calculateCityYields`, and `getBlockingMapEntityAt` (the same functions `perf-probe.ts` already
spies), and additionally captured `new Error().stack` on each call, bucketing by the first stack
frame outside the spied module itself. Run via
`bash scripts/run-with-mise.sh yarn vitest run tests/perf/zzz-investigate-1069.test.ts --reporter=verbose`
against `buildCrowdedGame({entityScale: 1})` and `{entityScale: 2})`, calling
`processNonHumanMajorRound` directly (same call the `aiRound@e1`/`aiRound@e2` perf areas make).
Zero production code was touched to produce this — pure test-side instrumentation, consistent with
`tests/scripts/perf-isolation.test.ts`'s guarantee. If this attribution needs to be re-derived
later (e.g. after a future AI change), the technique is: rebuild the same spy wrapper, run, delete
before committing.

## 10. Success criteria (evidence-based, not preselected)

- **`aiRound.heapPops`**: currently 116,596 (e1) → 386,884 (e2), ratio 3.32×. The `routePath` fix
  removes calls that are *guaranteed* to be discarded (too far to ever satisfy `rounds <= 6`); on
  this fixture's map (cities strided across an 80×80 map, most same-civ city pairs far apart
  relative to `6 × movementPoints ≈ 12–18` hexes), the large majority of the 80/280 measured
  `routePath` calls are expected to be prunable. Exact post-fix numbers come from re-running
  `UPDATE_PERF_BASELINE=1` after the fix lands (Terra), not preselected here.
- **Shape**: the `routePath` fix converts the per-unit destination search from O(own cities) to
  O(nearby own cities) — for a map where cities are spread roughly uniformly and the "nearby"
  radius is fixed (not scaling with map size or entity count), this should measurably flatten the
  ratio, not just cut a constant factor, though the exact residual ratio depends on how many
  same-civ cities land within radius at e2 vs e1 on this specific fixture.
- **`cityYieldCalls`**: newly tracked (§10 below) — expect roughly 9,616→~(citiesPerCiv + 1) ×
  callsPerCity instead of 9,616→31,164; i.e. the *shape* moves from
  O(cities² × buildings) to O(cities × buildings), which should visibly flatten the e1→e2 ratio
  once the metric exists to measure it.
- Both numbers, and the ratio guards, are regenerated via the canonical
  `UPDATE_PERF_BASELINE=1 yarn vitest run tests/perf/algorithmic-budgets.test.ts` process — Terra
  records the actual before/after/percent-change/ratio-change in the PR body per
  `.claude/rules/performance-budgets.md`, not here.

## 11. Guard/baseline strategy

1. Add `cityYieldCalls` to `AreaSample`'s returned fields for `aiRound@e1`/`aiRound@e2` in
   `measurePerfArea` (`tests/perf/perf-areas.ts`) — closes the "measured but silently dropped" gap
   (§4).
2. Add `aiRound.cityYieldCalls` to `budgets` in `computeBaseline` (`algorithmic-budgets.test.ts`),
   same `cap()` (measured × 1.5) convention as the other `aiRound` budget fields.
3. Add an `aiRoundCityYieldCalls` shape ratio to `ratios`, same `main-current-ratio × RATIO_SLACK
   (1.3)` "don't get worse" convention as `aiRoundHeapPops`/`aiRoundPathQueries`.
4. Add assertions for both to the existing "GUARD 3" test (or a new "GUARD 8" — Terra's call,
   document whichever is chosen) — the point is `cityYieldCalls` becomes a real, gated regression
   signal for the first time, not that it lands in a specific existing test block.
5. **Every new/tightened guard needs a sabotage proof** (Terra, before merge): temporarily
   reintroduce the pre-fix behavior (e.g. skip the distance prefilter, or force
   `getMarginalCivResearchGain` back to its original two-full-rescan body) and confirm the
   regenerated-but-not-yet-committed guard fails against the *old* (higher) measured numbers, then
   revert the sabotage and regenerate the real baseline. Document the observed red result in the
   PR body; never commit the sabotage.

## 12. Rollback / failure conditions

- If Terra's equivalence tests (§6) find even one candidate/decision divergence attributable to
  either fix, that fix is reverted to the exact original code for the affected function — do not
  patch around a divergence with a special case.
- If `yarn test:ai-long` shows a new finding not explainable as "AI got faster, not dumber" (i.e.
  a real behavior regression, not just a perf number moving), stop and escalate to Sol/Astra per
  the assignment's "intentional behavior drift" rule — this MR is perf-only, not a behavior MR.
- If the `routePath` distance prefilter's magnitude turns out to be much smaller than expected
  once measured (e.g. because the fixture's cities happen to cluster closer than assumed), that's
  still a valid, exact, zero-risk optimization — ship it regardless of the exact percentage; do
  not chase a preselected target by loosening the exactness guarantee.
