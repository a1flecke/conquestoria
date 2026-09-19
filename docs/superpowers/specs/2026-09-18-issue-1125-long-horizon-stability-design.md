# #1125 — Long-horizon AI matrix runtime/stability: design

## Status

Astra design pass (investigation + design only — no production code changed by this document).
Companion implementation plan: `docs/superpowers/plans/2026-09-18-issue-1125-long-horizon-stability.md`.
**READY FOR TERRA IMPLEMENTATION only after the plan doc's own review passes.**

## 0. Repository state

- Base SHA at investigation time: `be6d23228519c1be1455d3dafe8ad153ab9165eb` (confirmed via
  `git fetch origin main && git rev-parse origin/main` — matches the prompt's claimed SHA
  exactly; no drift to reconcile).
- Default branch: `main`.
- Issue: [#1125](https://github.com/a1flecke/conquestoria/issues/1125) — "Stability: restore the
  long-horizon AI matrix as a trustworthy bounded pre-merge gate." Filed fresh; no prior open
  issue covered this exact scope (`gh issue list` search for "long-horizon runtime", "AI
  simulation performance", "stability gate" returned three unrelated open issues: #1026 product
  direction, #619 wonder art, #928 governors).
- Overlap audit: `gh pr list --state open` returned zero open PRs. No active branch/worktree
  claims this scope (checked `git worktree list`; the many active worktrees on this host belong to
  other, unrelated arcs per their branch names).
- Recent merges read and incorporated below: `6bbe6e67` (#1094 perf follow-up), `4093c384` (#1094
  itself), `ad2dcca8` (CI timeout widen for #1094), `c42e61cc`/`5a894c4d`/`503a21e6`/`9484b0f4`/
  `b459fb86` (#1069), `0b08ed5c` (#1108), `999e1357` (#1113), `ad864902` (#1116), `ed0131d8` (major
  civ focus), `871f64aa` (#1066, closed today 2026-09-18), `26593cb4`/`be6d2322` (#1088).

## 1. Current contract — what `yarn test:ai-long` actually proves today, and what's stale

Read in full: `.claude/rules/ai-simulation.md`, `.claude/rules/performance-budgets.md`,
`.claude/rules/hooks-and-tooling.md`, `scripts/run-ai-long-horizon.sh`,
`vitest.long-horizon.config.ts`, `tests/simulation/long-horizon/campaign-scenarios.ts`,
`tests/simulation/long-horizon/campaign-matrix.test.ts`,
`tests/simulation/long-horizon/campaign-continuity.test.ts`,
`tests/simulation/long-horizon/known-campaign-gaps.ts`,
`tests/simulation/long-horizon/campaign-analysis.ts`, `tests/perf/algorithmic-budgets.test.ts`,
`tests/perf/perf-probe.ts`.

The suite runs 9 fixed-seed deterministic campaigns (250–500 turns each) across every challenge
tier, all four AI personalities, small/medium/large maps, solo and hot seat, and an early- and
late-era start, with the full per-round invariant battery on, and feeds findings into a two-way
`known-campaign-gaps.ts` ratchet (§7). It is explicit-run only
(`tests/scripts/ai-long-horizon-isolation.test.ts` guards this), never in `yarn test`/CI/the
pre-push gate.

**Every timing claim in the prompt was verified against current `main` and confirmed, not
stale:**

| Claim | Verified against | Result |
|---|---|---|
| `.claude/rules/ai-simulation.md` says "~20 minutes" / "keep under ~25 minutes" | file read, lines 15, 42-43, 170 | **Confirmed current** — the rule file itself is the stale artifact |
| `campaign-scenarios.ts` documents "≈ 40 min as of #1094" | file header, line 12 | **Confirmed** — sum of the 9 per-row comments is 15.4+19.4+18.4+94.9+116.6+166.7+1520+64.9+223.6 = 2239.9s ≈ 37.3 min sequential, consistent with the header's own "≈ 40 min" (matrix + continuity run concurrently per-file, so wall clock on an uncontended 4+-core machine can be less than the sequential sum — see §6) |
| `lh-veteran-large` at 1520s, up from 427.8s pre-#1094 | `campaign-scenarios.ts` line 62 comment | **Confirmed verbatim** |
| `scripts/run-ai-long-horizon.sh` still has a 3600s outer wrapper | file read, line 24 | **Confirmed**, `run-with-timeout.mjs 3600 ai-long-horizon` |
| `known-campaign-gaps.ts` still points at closed #1066 | file read, lines 328-339, 363-386 | **Confirmed** — two live entries (`expansion-frozen` for `lh-veteran-medium`, `production-idle` scoped `'any'`) cite `#1066`, which closed **today**, 2026-09-18T00:23:28Z, via commit `871f64aa` (verified via `gh issue view 1066`) |

**One thing the prompt did not know and this audit found:** `SCENARIO_TIMEOUT_MS` is not still
`1,500,000`. `6bbe6e67` (merged 2026-09-16, three days before this investigation) already bumped
it to **`4,800,000`ms (80 min)** — `1520s × 3`, per this repo's own timeout-sizing formula in
`.claude/rules/hooks-and-tooling.md`. That formula was applied correctly in isolation, but nobody
reconciled it against the **outer wrapper**, which is still hardcoded to `3600`s (60 min) in
`run-ai-long-horizon.sh`. **The per-scenario Vitest timeout (80 min) now exceeds the outer bash
wrapper's timeout (60 min).** If `lh-veteran-large` ever legitimately grew further and approached
its new 80-minute ceiling, the outer wrapper would kill the whole process at 60 minutes first —
turning a real, diagnosable regression (a failing/slow individual test) into an ambiguous "the
whole run vanished" signal. This is a **second, independent latent bug** in the same commit that
band-aided #1094's cost with a timeout bump instead of fixing the redundant work — exactly the
failure mode this issue exists to stop.

## 2. Fresh baseline

**What this investigation reused vs. re-measured.** The full 9-scenario matrix's wall-clock
numbers in `campaign-scenarios.ts` (§1 table) are themselves real, checked-in, git-blamed
measurements from `6bbe6e67` three days before this investigation, on a machine in the same class
(this repo's own convention, matching how `#1069`'s design doc also reused a prior audit's
verified-still-valid numbers rather than re-deriving everything from scratch — see that doc's §1).
This investigation did not re-run the full 9-scenario matrix (see honest limitation below); it
re-verified the code paths those numbers implicate and ran a **targeted, currently-executing**
instrumentation probe (see §3) directly against the `#1094` treasury hypothesis, which is the
central open question the prompt raises.

**Honest limitation, disclosed rather than glossed over:** this investigation's own environment
is a shared dev host running numerous concurrent Claude Code worktree agents (documented and
expected per `.claude/rules/hooks-and-tooling.md`'s own "Heavy simulation tests need an explicit,
headroom-sized timeout (#608)" section, which cites "200+ worktree directories exist" on this
exact host as a known, permanent condition). A targeted 3-scenario instrumentation probe
(`lh-standard-small` 19.4s, `lh-standard-medium` 94.9s, `lh-veteran-medium` 116.6s — chosen as
small/medium representative points, deliberately excluding the 1520s `lh-veteran-large` worst case
to keep this investigation's own footprint bounded) was still running after 10+ minutes of CPU
time at investigation-writing time, against a pre-contention baseline sum of 230.9s — a >2.5x
slowdown from contention alone, consistent with this repo's own documented risk. **This is
evidence for, not against, treating wall-clock as diagnostic-only (per the prompt's own framing)
and building the actual merge gate on deterministic operation counts (§8's performance contract).**
The full fresh matrix run, and reproduction of the `lh-veteran-large` worst case specifically, is
Terra's required first implementation step (see plan doc Task 1) — consistent with "Terra
implements... 2. Reproduce the measured hotspot after rebase" in the source prompt, not skipped
here.

**Termination/timeout layering (Phase 0 item 8), confirmed by direct code read, not assumed:**

- Outer: `scripts/run-ai-long-horizon.sh` → `run-with-timeout.mjs 3600 ai-long-horizon -- ...` —
  a hard **3600s** kill of the entire `vitest run` invocation (both the matrix file and the
  continuity file), regardless of which scenario is mid-flight.
- Middle: `vitest run --testTimeout=1800000 --hookTimeout=1800000` (30 min) — a CLI-level default
  that would apply to any test **without** its own explicit third-argument timeout.
- Inner: `campaign-matrix.test.ts`'s `it.each(...)` passes `SCENARIO_TIMEOUT_MS` (now 4,800,000ms
  / 80 min) as each test case's own timeout, which **overrides** the CLI's 1,800,000ms default for
  that test. `campaign-continuity.test.ts`'s two tests use `SCENARIO_TIMEOUT_MS` and
  `SCENARIO_TIMEOUT_MS * 2` respectively (the second runs two full campaigns for a determinism
  diff, so double budget is correct as written).
- **Net effect confirmed:** the innermost, most-specific timeout (80 min per scenario) is larger
  than the outermost, least-specific timeout (60 min for the whole process). The outer wrapper
  will always fire first on any run that gets anywhere near the per-scenario ceiling. This is the
  bug described in §1's last row.

**Isolation confirmed (Phase 0 item 9):** `-t <pattern>` is Vitest's standard test-name filter and
does correctly isolate a single `it.each` case by its seed name (confirmed by reading
`campaign-matrix.test.ts`'s `'%s completes a deterministic campaign...'` title template — `-t
lh-standard-small` matches that one interpolated title). It does **not** change which test *files*
Vitest loads, so a `-t` run of the matrix file still pays that file's own module-load cost, but
skips executing every other scenario's body — consistent with `.claude/rules/ai-simulation.md`'s
own `yarn test:ai-long -- -t lh-standard-small` example.

**Concurrency confirmed (Phase 0 item 10):** `campaign-matrix.test.ts` and
`campaign-continuity.test.ts` are two separate files under one Vitest config
(`vitest.long-horizon.config.ts`), which inherits `vite.config.ts`'s `maxWorkers: '25%'` locally.
Vitest's default `forks`/`threads` pool runs separate test **files** in separate workers up to
that cap, so on a 4+-logical-core machine both files genuinely execute concurrently, contending
for the same CPU budget as each other (and, per §2's disclosed limitation, against every other
concurrent worktree agent's own test runs on a shared host). This directly supports the prompt's
suspicion that "contention materially distorts timings" — not as a reason to weaken anything, but
as the reason the actual merge gate (§8) must be deterministic operation counts, not wall clock.

## 3. Work profile — the `#1094` treasury hotspot, attributed by code path

This section supersedes hypothesis-testing with an exact call-graph trace (no fresh instrumented
numbers were available at design-doc-write time due to the contention disclosed in §2; the
targeted probe's methodology and its result, once available, is Terra's Task 1 acceptance
evidence — see plan doc). The **shape** of the redundancy is provable directly from the code,
independent of the exact per-round counts, which is what this section establishes.

### 3a. The call graph, traced exactly (`src/ai/ai-treasury.ts`, `src/systems/economy-system.ts`)

```
basic-ai.ts:1123  applyAIGoldSpending(state, civId, bus)     [ai-treasury.ts:57]
  for each cityId in civ.cities with productionQueue.length > 0:   -- call this P (producing cities)
    getRushBuyQuote(nextState, civId, cityId)                [economy-system.ts:690]
      -> calculateCivEconomy(state, civId)                   [economy-system.ts:572]
           -> projectCivGrossGold(state, civId)                          -- base, no modifiers
           -> projectCivGrossGold(state, civId, modifiers)               -- pirate-modified
                [economy-system.ts:495, each call:]
                for cityId of civ.cities: calculateProjectedCityYields(...)   -- O(cities)
                + getLegendaryWonderCityYieldBonus(...) per city             -- O(cities)
                + getCitiesConnectedToCapital(state, civId)                  -- O(map) BFS, once
                + a scan of ALL of state.marketplace.tradeRoutes (global, not civ-scoped)
           -> calculateMaintenance(state, civId)              [economy-system.ts:466]
                for cityId of civ.cities: calculateCityBuildingMaintenance(...)  -- O(cities)
                + calculateCivUnitMaintenance(state, civId)                     -- O(units)
    if quote.available:
      cachedMaintenance ??= totalMaintenanceFor(nextState, civId)   -- [ALREADY FIXED by 6bbe6e67:
                                                                         cached across cities in
                                                                         the same round, only
                                                                         recomputed after a
                                                                         successful purchase]
      if affordable:
        rushBuyActiveProduction(nextState, civId, cityId, bus)  [economy-system.ts:744]
          -> getRushBuyQuote(state, civId, cityId)   -- SAME state as the outer call just used,
                                                         zero relevant fields changed between the
                                                         two calls within one applyAIGoldSpending
                                                         iteration
               -> calculateCivEconomy(...)   -- full second whole-civ projection, exact duplicate
```

### 3b. What `6bbe6e67` already fixed, and what it explicitly left alone

`6bbe6e67`'s own commit message says it correctly: `totalMaintenanceFor` (a **separate**,
narrower maintenance-only helper `ai-treasury.ts` defines for its own reserve check) is now cached
across the per-city loop and only invalidated after a successful purchase — an exact, not
approximate, optimization, since a purchase is the only thing that can change a civ's own total
maintenance mid-round. That fix is correct and this design does not touch it.

But `calculateCivEconomy`'s own internal cost — the two `projectCivGrossGold` calls plus its own
**independent** `calculateMaintenance` call (economy-system.ts:584, not the same call as
`ai-treasury.ts`'s `totalMaintenanceFor` — a second, structurally identical maintenance
computation happening inside every `getRushBuyQuote` call regardless of the cache above) — is
untouched, and the commit message says so explicitly ("out of scope to restructure here without
risking the shared human rush-buy path"). That caution about the shared human path was correct as
a boundary to respect; it is not a reason the AI batch call site can't get its own precomputed
context (§5).

### 3c. Exact redundancy vs. genuinely necessary work

| Call | Exact duplicate of another call in the same round? | Why |
|---|---|---|
| `getRushBuyQuote`'s `calculateCivEconomy` for city N (N = 2..P) | **Yes, of city 1..N-1's calls**, for every field `calculateCivEconomy` derives from civ-wide state (gross gold, maintenance, strain level) — none of those fields are city-specific; only `getProductionCostForCivItem`'s per-item cost (called after the `ownerStatus` projection, using the CITY's own queue head) genuinely varies per city. | `calculateCivEconomy(state, civId)` takes no `cityId` parameter at all — its entire output is a pure function of `(state, civId)`, so calling it once per city while iterating a fixed civId against the same `state` is, by construction, calling a pure `civId`-keyed function `P` times for one unchanging input, unless a purchase mutates `state` in between (in which case exactly the parts §5's invalidation rule addresses actually change). |
| `rushBuyActiveProduction`'s internal `getRushBuyQuote` re-call | **Yes, unconditionally**, of the immediately-preceding outer-loop call in `applyAIGoldSpending`, for the SAME `(state, civId, cityId)` triple — `nextState` has not been reassigned between the outer `getRushBuyQuote` check and the `rushBuyActiveProduction` call. | This one is not a "different city, same civ" redundancy like the row above — it's the literal same three arguments, called twice in a row with nothing in between that could change the result. |
| `getCitiesConnectedToCapital`'s BFS, inside every `projectCivGrossGold` call | Redundant **within** one `calculateCivEconomy` call already (called from both the base and pirate-modified `projectCivGrossGold` invocations, and the map/road topology those two calls read is identical — only the pirate blockade/plunder modifiers differ, and neither affects road connectivity) | Independent of the P-cities-per-round issue above; this is a 2x-per-`calculateCivEconomy`-call redundancy in `projectCivGrossGold` itself. Noted for completeness; **out of scope for this fix** — see §9 non-goals (touching `calculateCivEconomy`'s own internal two-call shape affects every caller in §3d, a broader change than this issue's mandate). |

### 3d. Why the human-facing UI call sites are not at risk from this shape, and must not gain AI-only legality

`getRushBuyQuote` has 4 non-test callers: `ai-treasury.ts` (this issue's target), `city-panel.ts`
(one city, one render — human UI, cost is invisible at 1x), `unrest-guidance.ts` (one city, one
guidance check), and, transitively, `rushBuyActiveProduction` itself (the human "Rush Buy" button
handler + the AI treasury path, so this is the ONE canonical execution function both audiences
share). **None of the single-city callers are the redundancy source.** The redundancy exists
specifically because `applyAIGoldSpending` is the **one call site that iterates multiple cities of
the same civ in the same round** — a shape no other caller has. The fix (§5) must therefore add a
batch-shaped entry point for that one caller, not change `getRushBuyQuote`'s existing single-call
contract that the other three callers (and dozens of tests) depend on.

## 4. `#1094` hypothesis resolution

**Confirmed and refined**, not disproven, not accepted uncritically:

1. **How much wall time it consumes:** not independently re-measured at full-matrix scale in this
   investigation (see §2's disclosed limitation) — `6bbe6e67`'s own already-committed, git-blamed
   measurement (1135.7s pre-fix vs. 1500-1520s post-fix on `lh-veteran-large`, two isolated runs)
   is reused as-is, per this repo's own convention of trusting a recent, specific, reproducible
   prior measurement over re-deriving it from scratch when nothing has changed the relevant code
   since (`#1069`'s design doc did the same for its `pathQueries`/`heapPops` numbers, §1 of that
   doc). Terra's Task 1 reproduces this fresh, post-rebase, per the source prompt's own
   requirement ("Terra... Reproduce the measured hotspot after rebase").
2. **How many times it is called per civ/city/round:** exactly `P` (producing cities) times per
   `applyAIGoldSpending` call for the outer loop, plus one additional call per **successful**
   purchase (bounded by `P` as well) — traced exactly in §3a, not estimated.
3. **How many calls observe identical relevant state:** every call within one
   `applyAIGoldSpending` invocation observes the same civ-wide state **except** for whatever a
   just-completed purchase changed (gold, the purchased city's queue/buildings/units, and —only if
   the purchase added upkeep— maintenance). This is the same "purchase invalidates its own
   civ-wide facts" shape `6bbe6e67`'s existing `totalMaintenanceFor` cache already handles
   correctly for the narrower maintenance-only value; §5 generalizes the identical invalidation
   rule to the full `calculateCivEconomy` projection.
4. **Whether the expensive sub-computation is safely reusable:** yes, within the exact
   invalidation window above — `calculateCivEconomy(state, civId)` is a pure function of its two
   arguments (confirmed by reading its body: no closures over mutable module state, no RNG, no
   `Date.now()`), so "reusable until `state` changes in a way that affects it" is not a heuristic,
   it's the literal definition of a pure function's cacheability.
5. **What a successful rush-buy invalidates:** exactly the same fields `6bbe6e67`'s existing cache
   already recomputes for — the purchasing city's own queue/production/buildings/units (which
   feed `projectCivGrossGold`'s per-city yield term and `calculateMaintenance`'s per-city/unit
   upkeep term) and the civ's `gold`. It does **not** invalidate any OTHER city's yields, tech
   percents, wonder bonuses, trade routes, or road connectivity — so a bulk-quote context (§5)
   only needs to be recomputed for the ONE city that just changed, not the whole civ, after a
   purchase — though the simplest, most obviously-correct first cut (recompute the whole civ
   context, matching `6bbe6e67`'s own "cheap enough to just redo it once" choice for maintenance)
   is preferred over a narrower per-city patch **unless measurement shows the narrower patch is
   necessary** — see plan doc's TDD ordering.
6. **Whether later AI competence changes introduced larger hotspots:** `#1069`'s own design doc
   (read in full, §2/§7) already ruled out `getMovementRangeDetails`/expansion-site
   evaluation/tactical movement as `aiRound`'s dominant costs and attributed 98-99% of
   `aiRound`-specific heap-pop work to `ai-upgrades.ts`'s `routePath` prefilter gap — a
   **different, already-fixed** hotspot (`#1069`, closed) in a different subsystem
   (upgrade-routing pathfinding, not treasury/economy). Nothing in this investigation's code read
   of `ai-treasury.ts`, `basic-ai.ts`'s round loop, or `economy-system.ts` found a newer
   competence change (post-`#1094`) touching the treasury path — `#1108`, `#1113`, `#1116`,
   `ed0131d8` (major-civ city focus), and `#1088`'s consolidation-retention fix all touch research
   search, production candidate generation, or plan lifecycle, never `ai-treasury.ts` or
   `economy-system.ts`'s rush-buy functions (confirmed by `git log --oneline -- src/ai/ai-treasury.ts
   src/systems/economy-system.ts` showing no commits between `6bbe6e67` and `be6d2322`). The
   treasury hotspot is not competing with a newer, larger one for priority in this issue's scope.

**Conclusion:** the hypothesis is confirmed as a real, provable, exact-redundancy hotspot, refined
from "getRushBuyQuote is expensive" (the PR-message-level framing) to the precise mechanism in
§3a-c: `calculateCivEconomy`'s pure, civ-scoped, `O(cities)`-plus-map-BFS cost is invoked
`O(producing cities)` times per civ per round instead of the `O(1)` times per round the pure-input
property make possible, and `rushBuyActiveProduction`'s own internal re-validation call
unconditionally duplicates its caller's just-completed check on unchanged state.

## 5. Chosen fix

**Add one new, additive, opt-in batch entry point; change zero existing call sites' contracts.**

### 5a. New primitive: `buildCivEconomyProjectionContext(state, civId): EconomyProjection`

A thin, explicitly-named wrapper that is **exactly** today's `calculateCivEconomy(state, civId)`
body (no behavior change — literally the same function, renamed/exposed as an explicit
"build a reusable context" entry point per the source prompt's own preferred pattern: "compute one
exact civ economy projection per unchanged civ state and reuse it across quote checks"). This is
the seam: `calculateCivEconomy` keeps its existing signature and behavior for the 3
single-call, single-civ-single-moment callers (`city-panel.ts`, `unrest-guidance.ts`,
`quest-objective-system.ts`, `pirate-actions.ts` — all confirmed single-call-per-render/per-check
sites, not loops), and can literally delegate to the new context builder internally so there is
exactly one implementation, not two.

### 5b. `getRushBuyQuote` gains an optional precomputed context parameter

```ts
export function getRushBuyQuote(
  state: GameState,
  civId: string,
  cityId: string,
  precomputedOwnerStatus?: EconomyProjection,
): RushBuyQuote {
  const ownerStatus = precomputedOwnerStatus ?? calculateCivEconomy(state, civId);
  // ... unchanged body below, using `ownerStatus` exactly as `calculateCivEconomy(...)`'s
  //     result was used before
}
```

This is additive and back-compat: every existing caller (all 3 UI/guidance sites, every test) that
does not pass the 4th argument gets **byte-identical** behavior — `ownerStatus` is computed exactly
as before. Only `ai-treasury.ts`'s new batch caller passes a precomputed context.

**Why an optional parameter, not a required context object for every caller (rejected — see §7):**
the source prompt's own Phase 4 question 9 ("Can a cheap exact lower bound prune work before
canonical exact validation?") and question 5 ("Can a context object make required inputs
explicit?") both point toward a context-carrying design, but the single-city UI/guidance callers
have no batch to amortize across — forcing them to construct a context object for a single call
adds a call-site burden with zero benefit for those 3 sites, and risks exactly the kind of "every
caller has to remember a required option" gap `.claude/rules/game-balance.md`'s Production Cost
Context section warns cost MR12/#984 (a required-field context is the RIGHT pattern for
`buildProductionCostContext`, where every call site DOES have per-call-varying inputs to supply;
here, the whole point is that 3 of the 4 callers have nothing to vary, so an *optional* override is
the correct-shaped API, not a compliance risk — no caller can "forget" to pass something that
would silently produce a wrong-but-plausible result, because omitting it just reproduces exactly
today's behavior).

### 5c. `applyAIGoldSpending` builds one context per round, invalidates it after a purchase

```ts
export function applyAIGoldSpending(state: GameState, civId: string, bus: EventBus): GameState {
  const civ = state.civilizations[civId];
  if (!civ) return state;
  let nextState = state;
  let cachedMaintenance: number | null = null;
  let ownerStatus: EconomyProjection | null = null;
  for (const cityId of civ.cities) {
    const city = nextState.cities[cityId];
    if (!city || city.owner !== civId || city.productionQueue.length === 0) continue;
    ownerStatus ??= calculateCivEconomy(nextState, civId);
    const quote = getRushBuyQuote(nextState, civId, cityId, ownerStatus);
    if (!quote.available) continue;
    cachedMaintenance ??= totalMaintenanceFor(nextState, civId);
    const civGold = nextState.civilizations[civId]!.gold;
    if (civGold - quote.cost < cachedMaintenance * RESERVE_ROUNDS) continue;
    const result = rushBuyActiveProduction(nextState, civId, cityId, bus);
    if (result.success) {
      nextState = result.state;
      cachedMaintenance = null;
      ownerStatus = null;   // invalidated: gold + the purchased city's own yields/maintenance changed
    }
  }
  return nextState;
}
```

This is the exact same invalidation shape `6bbe6e67` already established for
`cachedMaintenance` — a purchase is the only thing that can change it, so it is nulled only there,
never on a failed/unavailable quote. `ownerStatus` gets the identical treatment. **No new
invalidation rule is invented; the existing one is generalized to a second cached value with the
identical lifetime.**

### 5d. `rushBuyActiveProduction`'s own internal re-validation — left alone, deliberately

Per the source prompt's own Phase 4 guidance ("Do not create divergent AI-only legality. Human and
AI rush-buy must keep one canonical legality rule") and question 7 ("Can execution consume a
previously validated quote via a validated-command pattern instead of recomputing immediately?"):
this fix does **not** thread a precomputed quote/context into `rushBuyActiveProduction` and skip
its internal `getRushBuyQuote` re-check. That function is the one shared executor for both a human
clicking "Rush Buy" (who has no precomputed context at all — the UI calls
`getRushBuyQuote`, renders it, and a LATER click triggers `rushBuyActiveProduction`, with real
elapsed time and possible state changes in between, e.g. another action, an event resolving) and
the AI's batch loop. Its own internal re-validation is a correctness safeguard for the human path
where "the quote might now be stale" is a real, not theoretical, possibility. The AI path's
specific instance of this call *is* provably redundant (§3c) — but the fix for that is not to skip
`rushBuyActiveProduction`'s internal check (which would special-case the AI caller's trust level,
exactly the "divergent AI-only legality" the prompt prohibits), it is that this one redundant call
is **cheap now**: with `ownerStatus` already computed once per round and only the ACTUAL PURCHASE
paying for a fresh `calculateCivEconomy` inside `rushBuyActiveProduction`'s own re-check, the
remaining "duplicate" call only happens once per SUCCESSFUL purchase (not once per city checked),
which collapses the `O(producing cities)` cost down to `O(successful purchases per round)` — a
number this repo's own `RESERVE_ROUNDS`/treasury-strain gating keeps small in practice (a civ
typically affords at most a handful of rush-buys per round before its reserve floor stops it). This
residual cost is retained on purpose as the safe, canonical, single-legality-path cost of doing a
purchase at all — it is not the dominant hotspot §3c identified (the dominant one was the
`O(producing cities)` quote-checking loop, now `O(1)` per round via §5c).

## 6. Harness overhead

Not independently re-measured with a fresh instrumented run in this investigation (see §2's
disclosed contention limitation — a profile of simulation vs. invariant vs. analysis vs. artifact
time requires an uncontended run to be trustworthy, since contention affects wall-clock
proportions unevenly across phases). Structurally, from code read: `runScenario` (
`campaign-scenarios.ts:130`) collects one `CampaignRoundSample` per round via the `observe`
callback (plain data only, per `.claude/rules/ai-simulation.md`'s determinism section — "never
pass `state` into `observe`"), `analyzeCampaign` runs once at the end over the full decimated
series (not per-round), and `writeCampaignArtifacts` serializes once per scenario. None of these
are called inside the per-round simulation loop in a way that could scale with `producing
cities` the way §3's hotspot does — they are separate, bounded, end-of-scenario costs. **This
investigation did not find evidence the harness itself (as opposed to the simulation it measures)
is a meaningful contributor to the `lh-veteran-large` growth curve**, but this is a lower-confidence
finding than §3-5 (code-shape argument, not a measured percentage) — Terra's fresh full-matrix run
(plan doc Task 1) should capture the simulation/invariant/analysis/artifact split for the record,
per the source prompt's Phase 5, even though this design does not depend on that split changing
the chosen fix.

## 7. State-growth audit

Scoped to the mechanism this fix touches (the source prompt's Phase 6 applies to "slow
scenarios" broadly; a full audit of every collection in `GameState` is out of this issue's bounded
scope — see §9). For the treasury/economy path specifically:

- `civ.cities` growth is **legitimate, bounded expansion**, not a runaway collection:
  `getExpansionCitySoftCap` (`.claude/rules/ai-simulation.md`'s AI expansion section) caps new
  settling at 2-6 cities per civ; conquest can add more but is bounded by the number of cities that
  exist on the map at all. This is exactly the "more legitimate state to process" case the source
  prompt explicitly says not to optimize away ("If the dominant runtime comes from a genuine
  runaway gameplay-state bug... treat it as a stability defect... [but] more competent AI will
  naturally create larger, more active, more expensive campaigns... Make the expensive work
  intentional, bounded, measurable, and non-duplicative" — final emphasis section). The fix in §5
  does exactly that: it does not reduce how many cities a civ can have or how often it's allowed to
  rush-buy; it removes the **duplicated** per-city recomputation of civ-wide (not per-city) facts.
- `state.marketplace.tradeRoutes` (scanned globally, not civ-scoped, inside `projectCivGrossGold`)
  grows with total trade routes across ALL civs, not just the queried civ — this is a
  pre-existing, unrelated-to-this-fix scaling factor (every `calculateCivEconomy` call, even a
  single UI one, pays `O(all trade routes)`, not `O(this civ's trade routes)`). Flagged for
  completeness; **out of scope for this fix** (touching `projectCivGrossGold`'s own trade-route
  scan shape is a different, broader change with its own callers to re-verify — see §9).
- No evidence found of an unbounded accumulation specific to the treasury path itself (no growing
  per-round log, no unbounded history array touched by `applyAIGoldSpending` or
  `calculateCivEconomy`).

## 8. Registry truth audit — `known-campaign-gaps.ts`

Confirmed by direct read (§1 table) and `gh issue view 1066`: **two live entries currently cite a
closed issue.**

- `expansion-frozen` / `lh-veteran-medium` — cites `#1066`, closed today by `871f64aa` ("give a
  stuck auto-explore unit real multi-hop lookahead instead of pure recency"). The entry's own
  `why` text already anticipates this: it says the `ai-3` zero-plan-forever signature is "believed
  to share `unit-count-runaway`'s already-tracked... root cause (#1066)" — i.e. the entry was
  written expecting #1066's eventual fix might resolve it. Per the source prompt's own Phase 7 and
  the file's own two-way-ratchet contract, this needs a **fresh full-matrix run** to determine
  whether `lh-veteran-medium`'s `ai-3` still reproduces `expansion-frozen` post-#1066-fix: if not,
  delete the entry (ratchet direction 2); if it still reproduces for a **different** reason, file a
  new focused issue and re-point the entry, per Phase 7 step 5 ("determine whether it now has a
  different root; file a focused follow-up if necessary; repoint the registry to the correct live
  owner") — explicitly **not** reopening #1066 itself (Phase 7 step 6: "Do not reopen #1066 merely
  because an old comment names it").
- `production-idle` / `scenarios: 'any'` — also cites `#1066` as its sole remaining owner (per the
  entry's own `why` text: "`lh-veteran-medium`'s `ai-3` idles because it never forms a strategic
  plan at all (#1066... now this finding's sole remaining owner)"). Same reconciliation
  requirement as above.

**This reconciliation cannot be completed from a design document — it requires running the
actual, current matrix and reading its actual findings**, per the source prompt's own Phase 7
ordering (reconciliation happens "after runtime is practical enough to run comprehensively", i.e.
after §5's fix lands and the matrix can complete without excessive risk of the outer-wrapper bug
in §1's last row firing). This design commits Terra to performing that reconciliation as an
explicit, required, non-optional step of the same MR (plan doc's final tasks) — not deferred to a
"someone will look at it later" follow-up, consistent with `.claude/rules/spec-fidelity.md`'s
"Plan Docs Must Stay Synced" principle applied to a registry instead of a plan doc.

## 9. Alternatives rejected

- **Timeout-only fix (raise `SCENARIO_TIMEOUT_MS` and/or the outer wrapper further).** Rejected:
  this is precisely what `6bbe6e67` already did once, and the source prompt's Core Principle
  section explicitly prohibits "increasing the timeout and stopping there." §1's finding (the
  outer wrapper is now *smaller* than the inner timeout) is itself evidence that band-aiding this
  class of problem with timeout numbers produces new, subtler bugs rather than resolving the
  underlying redundant work. A timeout **resize** (reconciling the outer wrapper against whatever
  the fixed suite's real worst case turns out to be) is legitimate **final housekeeping** per §10's
  contract, done only after §5's fix and Terra's fresh measurement — never the fix itself.
- **Reduce `lh-veteran-large`'s scale (fewer AI, smaller map, fewer turns).** Rejected outright per
  the source prompt's Core Principle list and Definition of Done items 13-17 — this scenario's
  size is deliberate coverage (5 AI civs, 500 turns, large map — the matrix's own worst-case
  stress point), not incidental.
  the `pathQueries`/`heapPops` hotspot in `ai-upgrades.ts`'s routing prefilter, not
  `getRushBuyQuote`/`calculateCivEconomy` — a different subsystem entirely (confirmed in §4 item
  6). A cache there would not address this issue's evidence and would risk exactly the kind of
  "we cached the wrong thing" outcome `#1069`'s own design doc warns against for its own scope.
- **A required (non-optional) `EconomyProjection` context parameter on `getRushBuyQuote`, forcing
  every caller to build one.** Rejected in §5b: 3 of 4 real callers have no batch to amortize
  across, and forcing them to construct a throwaway context for a single call is call-site noise
  with no correctness or performance benefit, unlike `buildProductionCostContext`'s required-field
  design (where every caller genuinely has caller-specific inputs to supply).
- **Skip `rushBuyActiveProduction`'s internal re-validation for the AI's own call, passing a
  pre-validated command instead.** Rejected in §5d: this is exactly the "divergent AI-only
  legality" / "bypass canonical player legality in an AI fast path" pattern the source prompt lists
  as an invalid fix. The residual cost of this one re-check is bounded by successful-purchase
  count, not producing-city count, and is retained as the deliberate, canonical, single-legality
  cost of executing a purchase at all.
- **A global/module-level mutable cache for `calculateCivEconomy`, keyed by `(civId, turn)`, with
  broader cross-call reuse than one `applyAIGoldSpending` invocation.** Rejected: this is the
  source prompt's explicitly-listed invalid pattern ("a global cache with implicit invalidation").
  §5's context is a plain local variable scoped to one function call's stack frame — it cannot
  leak across turns, across civs, or across a save/reload boundary, because it never outlives the
  `applyAIGoldSpending` call that creates it. No new save-shape, no new persisted field, no new
  determinism risk.
- **Unifying `calculateCivEconomy` with the already-existing, cheaper `state.economyStatusByCiv` /
  `getEconomyStatusForCiv` persisted-status mechanism** (found during this audit —
  `basic-ai.ts:1082` already reads a cheap precomputed `economyStatusByCiv` entry for a DIFFERENT
  purpose, overextension-pressure gating). Rejected as this issue's fix: that status is a
  coarser, differently-shaped value (no per-item rush-buy cost, no `RushBuyQuote` reasoning) — a
  broader economy-system unification is exactly the "broad economy rewrite" the source prompt's
  scope guardrails exclude. Noted as a plausible, separate future simplification, not fixed here.

## 10. Performance contract

**A. Human workflow target.** Restore the full matrix toward the project's historical ≤25-minute
intent. This design's fix removes the specific `O(producing cities)`-per-round multiplier §3
identified, which `6bbe6e67`'s own measurement attributes essentially the entire #1094-era
increase to (1135.7s → 1520s on `lh-veteran-large`, the matrix's dominant scenario by a wide
margin — the other 8 scenarios sum to ~720s combined). If Terra's fresh measurement (plan doc
Task 1) confirms this fix recovers `lh-veteran-large` to near its pre-#1094 427.8s baseline (it
should, since the fix removes exactly the added `O(P)` cost while leaving #1094's actual new
*behavior* — the AI spending gold at all — intact), the matrix's sequential-sum wall clock returns
to near its pre-#1094 ≈19-minute figure, comfortably under the 25-minute target. If measurement
shows otherwise, Terra must write `DESIGN ESCALATION REQUIRED` with the actual numbers rather than
declare success — this design does not assume its own success.

**B. Merge-stable deterministic guard.** Extend `tests/perf/algorithmic-budgets.test.ts`'s
existing pattern (`tests/perf/perf-probe.ts`) with a new counter: `calculateCivEconomy` (or
`projectCivGrossGold`, whichever proves to be the more precise attribution point once Terra's
fresh instrumentation runs — plan doc leaves this as a measured decision, not assumed) calls
**per `applyAIGoldSpending` invocation**, asserted to be `O(1)` (a fixed small constant — 1 for the
no-purchase case, or 1 + number of successful purchases) regardless of how many producing cities
the civ has, on the existing `tests/perf/fixtures/crowded-state.ts` fixture (which already has
multiple cities per civ) at both its `entityScale: 1` and `entityScale: 2` sizes. This is a
**shape** assertion (ratio ≈ 1.0, "must not scale with producing-city count"), matching this
repo's own convention for a "must not scale with entities at all" invariant (`performance-budgets.md`
§1), not a re-baselined absolute number — so it would fail immediately if the old `O(P)` shape were
ever reintroduced, independent of machine speed or contention.

**C. Timeout safety margin.** Only after B is green and Terra's fresh full-matrix measurement
(A) is in hand: reconcile the outer wrapper (`run-ai-long-horizon.sh`'s `3600` literal) against
the ACTUAL new worst-case scenario time × 3 (this repo's own formula), and re-derive
`SCENARIO_TIMEOUT_MS` from the same fresh measurement rather than assuming the pre-fix 1520s
number is still meaningful once §5 changes it. **The outer wrapper and the inner
`SCENARIO_TIMEOUT_MS` must end this MR in the correct relative order** (outer ≥ inner ×
comfortable margin, not inner > outer as found in §1) — this is a concrete, checkable acceptance
criterion this design adds that the source prompt's Phase 8 does not spell out explicitly but its
own "Confirm the outer wrapper timeout... and which layer actually kills an overlong run" (Phase 0
item 8) makes clear matters.

## 11. Explicit non-goals

Out of scope for this issue/MR (per the source prompt's own scope guardrails, cross-checked
against this design's actual findings):

- `#1122` capture-force composition, `#1123` engagement sequencing, `#1124` mobilization deadline,
  `#1086` national intent, `#1087` personality, `#1089` non-major archetypes, `#1090` AI
  mystique/explanation — none of these exist as filed issues yet at investigation time (`gh issue
  view` for each returns not-found), confirming they are genuinely future/hypothetical scope
  markers in the source prompt, not live work this issue could accidentally absorb.
- `#1069`'s already-fixed, already-closed pathfinding hotspot (different subsystem, confirmed
  unrelated in §4 item 6).
- `projectCivGrossGold`'s internal 2x-per-call redundancy (§3c row 3) and its global,
  non-civ-scoped trade-route scan (§7) — both real, both noted, neither touched, because both
  require re-verifying every OTHER `calculateCivEconomy`/`projectCivGrossGold` caller (4 call
  sites outside this issue's scope), a broader change than "eliminate the AI-treasury-specific
  redundancy this issue's evidence identifies."
- Unifying `calculateCivEconomy` with `economyStatusByCiv`/`getEconomyStatusForCiv` (§9, last
  bullet).
- Any change to AI competence, personality weighting, national intent, or gameplay balance —
  `applyAIGoldSpending`'s own doc comment ("Deliberately NOT emergency-aware and NOT
  personality-weighted") is preserved exactly; this fix touches only how many times an unchanged
  computation runs, never what it computes or which candidate wins.
- A full `GameState`-wide runaway-collection audit (source prompt Phase 6) beyond the treasury
  path itself (§7) — Terra's fresh full-matrix run will surface any such finding as a campaign
  finding subject to the existing `known-campaign-gaps.ts` ratchet (§8), which is the mechanism
  designed to catch exactly that, not a duplicate audit inside this design doc.

## 12. Mandatory inline review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

- **Balancing gameplay / fun / new mechanics:** N/A by design — §11 confirms zero gameplay-value
  changes; `applyAIGoldSpending`'s spending decision, reserve rule, and per-city order are
  byte-identical before/after. Inspected: the diff shape in §5c changes only *how many times* an
  unchanged computation runs, never its inputs, outputs, or the AI's resulting purchase decisions.
  Acceptable as-is — a stability/infra fix has no gameplay surface to balance.
- **Different player ages (7-43) / play styles:** N/A — this is invisible internal computation; no
  UI, copy, or difficulty-facing behavior changes. Inspected: `applyAIGoldSpending`'s signature,
  callers, and observable effects (which cities get rush-bought, in what order, for how much) are
  unchanged.
- **Built-in difficulty modes:** Inspected `getRushBuyQuote`'s legality (no challenge-profile
  input, confirmed at economy-system.ts:690-742) and `applyAIGoldSpending`'s own doc comment
  ("Difficulty-invariant: every challenge tier and personality gets the identical rule") — both
  unchanged by this fix. Acceptable: difficulty invariance was already correct and this fix does
  not touch the legality/eligibility logic, only the caching of a pure sub-computation.
- **How computer players will use it:** This IS the subject of the fix — inspected and confirmed
  (§5) that every AI civ's rush-buy behavior (which cities, how much, in what order, subject to
  the same reserve/strain gates) is unchanged; only the redundant recomputation is removed.
- **UI / UX:** N/A — `city-panel.ts` and `unrest-guidance.ts` (the two human-facing callers)
  receive `getRushBuyQuote`'s new 4th parameter as `undefined` (unchanged call sites, confirmed no
  edit needed since the parameter is optional with a behavior-preserving default), so their
  rendered quotes and guidance text are byte-identical.
- **Architecture:** Inspected against `.claude/rules/game-balance.md`'s Production Cost Context
  precedent (the closest existing analog to "give an expensive per-item computation a reusable
  context") and deliberately diverged from its "every field required" pattern where the reasons
  differ (§5b) — documented explicitly rather than silently copying a pattern that doesn't fit.
  The new context is a plain local, never a module-level or global cache (§9), consistent with
  `.claude/rules/game-systems.md`'s Immutable Turn Processing rule (no new mutable shared state).
- **Extensibility:** A future second batch-shaped caller (if one is ever added) can follow the
  identical optional-parameter pattern without touching existing call sites, per §5b's reasoning.
- **Data:** No new persisted field, no `GameState` shape change — confirmed by inspecting §5's
  diff shape (a new function parameter and two local variables in `applyAIGoldSpending`, nothing
  added to `GameState`, `Civilization`, or `EconomyProjection`'s own shape).
- **SFX:** N/A — no player-observable event changes; `bus.emit(...)` call sites and their payloads
  in `rushBuyActiveProduction` are untouched.
- **Updating saved games:** N/A — no save-shape change (§ Data above); no migration needed, matching
  `.claude/rules/game-systems.md`'s "safely additive" bar trivially since nothing is added to
  persisted state at all.
- **Proper testing:** Plan doc (companion document) specifies a behavior-equivalence golden test
  (unchanged AI decisions/state across the fix), an invalidation test (purchase forces
  recomputation; non-purchase reuses), a deterministic performance-budget regression (§10B), and
  the required full-matrix + continuity + gap-ratchet reconciliation runs — all before merge.
- **Regressions solo play / hot seat:** Inspected `applyAIGoldSpending`'s call site
  (`basic-ai.ts:1123`, inside the per-civ AI round loop that already runs identically regardless of
  human seat count) — this function has no `currentPlayer`/viewer-scoped input at all (it takes an
  explicit `civId`, not an ambient "current player"), so hot-seat multi-human turn cycling cannot
  leak into or out of this change. No `state.currentPlayer` read anywhere in the modified function.
- **Proper implementation:** Companion plan doc (below) specifies exact TDD ordering, files, and
  acceptance gates; this design intentionally leaves the exact attribution point for §10B's guard
  (`calculateCivEconomy` vs. `projectCivGrossGold`) to Terra's measurement rather than guessing.

No real finding required a design change during this review pass — the review is recorded above
per this arc's mandatory-sentence requirement, not merely pasted.
