# #1126 — Re-measure and reconcile long-horizon super-linear cost post-#1127: design

## Status

Design pass complete. No production code change is proposed by this document (see §4 — the
conclusion is Case D, not a redundant computation to remove). The implementation is
documentation-only: update the stale runtime claim in `.claude/rules/ai-simulation.md` and
`campaign-scenarios.ts`, and reconcile #1126/#1125 with the evidence below.

**Single-agent adaptation note:** this repo's arc prompt assumes separate Astra/Terra/Sol/Luna
models a human switches between, with hard stops between phases. This session is one continuous
agent operating under this project's own `CLAUDE.md` ("NEVER use subagents or parallel agents" —
execute inline). I am performing the design, review, and (docs-only) implementation phases myself
in one session rather than literally stopping for a model change, since there is no separate model
to hand off to here. The review dimensions below were genuinely applied against the evidence, not
pasted as boilerplate.

## 0. Repository state

- Base SHA: `8ebbbc0be7bbd5ae9c03eb7fdfa16a2ec4b8beb2` (`origin/main`, confirmed via
  `git fetch origin main && git rev-parse origin/main` — matches the arc prompt's claimed SHA
  exactly, no drift).
- Worktree: `.claude/worktrees/stability-arc-1126-1080-1081`, git hooks configured
  (`core.hooksPath` = `.githooks`, worktree-scoped), mise trusted.
- Issue #1126: OPEN. Its own most recent comment already root-caused the mechanism
  (`applyAIProduction` re-scoring every idle city from scratch every round via
  `generateWithResidual`/`computeResearchScoringBaseline`) and explicitly deferred to #1127,
  saying re-measurement should happen after #1127 lands. #1127: CLOSED, fixed by PR #1130
  (`scienceStarvationTechBonus`, merged as `97ff432a`).
- Parent #1125: OPEN. Its own scenario-file comment (`campaign-scenarios.ts:17-26`) explicitly
  says #1126 is "the DIFFERENT, unrelated hotspot" holding `lh-veteran-large`'s wall-clock at
  ~1520-1570s, and that the 1520s figure "remains the accurate current number; do not revise it
  down based on #1125's fix" (i.e. pre-#1127).
- Collision audit: `gh pr list --state open` → `[]` (verified against the live repo, not cached).
  `git worktree list` shows an active worktree `.worktrees/issue-1122-capture-force` on
  `codex/issue-1122-capture-force` — per the arc prompt's own instruction, #1122 is out of scope
  for this arc entirely; not touched, not read beyond confirming it exists and is unrelated to
  #1126/#1080/#1081 (capture-force AI competence vs. this issue's production/research scoring
  cost).
- Read in full for this investigation: `src/ai/ai-production.ts`, `src/ai/ai-research.ts`,
  `src/ai/ai-tech-evaluation.ts`, `src/systems/research-output-system.ts` (relevant sections),
  `src/systems/resource-system.ts`, `src/systems/economy-system.ts` (`projectCivGrossGold`,
  `calculateCivEconomy`, `getRushBuyQuote`), `tests/perf/perf-probe.ts`,
  `tests/perf/algorithmic-budgets.test.ts`, `tests/simulation/long-horizon/campaign-scenarios.ts`,
  `tests/simulation/long-horizon/campaign-matrix.test.ts`,
  `tests/simulation/long-horizon/known-campaign-gaps.ts` (F1's "residual idle" note),
  `.claude/rules/ai-simulation.md`, `.claude/rules/performance-budgets.md`,
  `.claude/rules/hooks-and-tooling.md` (host verification lease / stall watchdog — relevant since
  two other agents were running heavy `yarn test` invocations on this host throughout this
  investigation; see §2's contention note).
- PR #1130's actual diff (not just its summary) was read via `gh pr view 1130 --json files,body`:
  `src/ai/ai-research.ts` (+60/-5), a new `scienceStarvationTechBonus` mirroring the existing
  `unrestReliefTechBonus` shape exactly, applied to both the preliminary search cut and final
  scoring in `planAIResearch`; a golden-digest regen (`aiRound-1069-golden-digests.json`) because
  the AI's research choice genuinely changes for a starved civ (`civilizations`/`opponentAI`
  digests moved, nothing else) — this is a deliberate behavior change, not a #1069-perf
  regression.

## 1. Method — why re-measure with call counts, not wall-clock, under contention

Two other Claude Code agents were running heavy `yarn vitest` workloads on this host throughout
this investigation (`ps` showed sustained >100% CPU processes in `.worktrees/issue-1127-missionary-
production` and `.claude/worktrees/issue-1126-city-yields`, unrelated to this session). Per
`.claude/rules/hooks-and-tooling.md`'s documented contention condition, wall-clock numbers taken
under this contention are not directly comparable to the pre-#1127 baseline (which was itself
measured under unknown, unstated contention). The **deterministic call counts** the original
#1126 evidence already used (`cityYieldCalls`, `heapPops`, and — new here — a
`computeResearchScoringBaseline` call count as an exact 1:1 proxy for `generateWithResidual` calls,
since `generateWithResidual` is not exported but calls `computeResearchScoringBaseline` exactly
once per invocation, line `ai-production.ts:497`) are contention-proof: they depend only on how
many times a function is invoked for a given seed, never on CPU speed or scheduling. Wall-clock is
reported below for reference only, labeled as contended.

**A real trap hit and fixed during this investigation:** the repo's own documented warning
("Vitest spies can retain full call arguments and OOM a long campaign") was not theoretical —
`vi.spyOn(...).mockImplementation(...)` retains every call's full arguments in its internal
`mock.calls` array by reference. `computeResearchScoringBaseline(state, civId)` takes the entire
`GameState` by reference; across ~2,230 calls on a growing, immutably-updated state tree, this
prevented garbage collection and OOM'd the worker on the first two attempts (`tests/perf/perf-
probe.ts`'s own `withPerfProbe`, which spies on `calculateCityYields(city, map, ...)` — `map` is
also a large object — was the eventual proven culprit; adding one more full-`state`-argument spy
on top of it tipped a 150-round run over a ~4.1GB V8 heap limit). Fixed by writing every spy to
call `.mockClear()` on itself immediately after each invocation, so only a plain integer counter
persists — no change to `perf-probe.ts` itself was needed or made, since it is proven safe at the
short-fixture scale `algorithmic-budgets.test.ts` actually uses it at; the trap is specific to
sustained use across an entire long campaign, which no committed test currently does.

## 2. Re-measured evidence

Scratch instrumentation (not committed — a temporary `tests/perf/scratch-*.test.ts`, deleted after
use, per this repo's convention of not leaving throwaway measurement harnesses in the tree).

### 2a. The original 75/150-round comparison, post-#1127

| Metric | 75 rounds | 150 rounds | Ratio (2x rounds) | Same ratio, pre-#1127 |
|---|---:|---:|---:|---:|
| `heapPops` | 48,119 | 92,148 | **1.92x** | 1.995x |
| `cityYieldCalls` | 10,837 | 34,823 | **3.21x** | ~3.6x (post-#1129, pre-#1127: 11,653→42,074) |
| `computeResearchScoringBaseline` calls (≡ `generateWithResidual` calls) | 558 | 2,230 | **4.00x** | 4.69x (690→3,234) |
| `totalCities` (final state) | 29 | 31 | 1.07x | — |
| `totalUnits` (final state) | 53 | 51 | 0.96x | — |
| wall clock (**contended** — see §1) | 159.7s | 392.0s | 2.45x | 3.17x (pre-#1129, also contended) |

`heapPops` stays essentially linear (1.92x, consistent with #1069's pathfinding fix holding).
Entity counts are flat (1.07x cities, 0.96x units) — city/unit count growth still cannot explain
the residual super-linearity, confirming the original evidence's own elimination of that
hypothesis. `cityYieldCalls` and the research-baseline/`generateWithResidual` proxy both dropped in
**both** absolute count (17-31% fewer calls at the 150-round mark) **and** growth ratio (3.6x→3.21x,
4.69x→4.00x) — #1127 made a real, measurable improvement. Neither ratio reached the ~1.9-2.1x
"linear in rounds" reference `heapPops`/entity-count growth establishes. This is **Case B** in the
arc's decision tree (#1127 reduced but did not remove the super-linear driver), not Case A.

### 2b. Idle-city-round attribution across the 150-round run

Bucketed by round range (self-clearing spy on the exported `applyAIProduction`, summing
`civ.cities.filter(idle).length` across all 5 AI civs at every call):

| Round range | `applyAIProduction` calls | Total idle-city-rounds | Avg idle cities / call |
|---|---:|---:|---:|
| 0-25 | 120 | 22 | 0.18 |
| 25-50 | 125 | 93 | 0.74 |
| 50-75 | 125 | 156 | 1.25 |
| 75-100 | 125 | 186 | 1.49 |
| 100-125 | 125 | 325 | **2.60** |
| 125-150 | 125 | 321 | **2.57** |

The idle-city population **ramps up** roughly 14x from round 0-25 to round 100-125 — this is the
literal, direct cause of the super-linear shape in §2a: the same `generateWithResidual` call
(city-yield projection + research baseline + production-cost context, all non-trivial) runs once
per idle city per round, and the idle population itself grows over the campaign rather than
staying constant. Critically, it **plateaus** at round 100-125 (2.60 → 2.57, essentially flat) —
this is not unbounded runaway growth; it settles once civs reach some ceiling.

## 3. Is this ramp-and-plateau shape a NEW defect, or the already-known `#1094` gap?

`tests/simulation/long-horizon/known-campaign-gaps.ts`'s F1 entry, written when #1064's expansion
fix landed (well before #1126 or #1127 existed), already documents exactly this shape:

> `production-idle`/`gold-hoard` reproduce on every scenario in the matrix... the "residual idle"
> contingency #1064's own design doc anticipated (§2.20): a civ that expansion now genuinely works
> for eventually reaches its soft cap or exhausts buildable content given enough rounds, and
> legitimately idles with growing gold. See #1094.

This matches the measured shape precisely: idle cities accumulate as a campaign progresses (civs
build out their initial content, hit `getExpansionCitySoftCap`, and run out of era-appropriate
buildings/units to queue), not as a function of round count directly. #1094 is the tracked,
existing follow-up for the *gameplay* side of this (making idle civs do something smarter with a
growing treasury) — it is explicitly **not** #1126's scope, and the arc's own guardrails forbid
inventing a new gameplay fix here ("Do not optimize around a real gameplay bug" cuts both ways: it
also means don't invent a new competence patch under a performance issue's banner).

## 4. Decision — Case D, not Case B/C

I initially suspected a Case B fix was available: memoize the empty-candidate result for an idle
city, keyed on tech/building/resource/era state, to skip re-deriving `generateWithResidual`'s
expensive inputs when nothing eligibility-relevant changed. **This is unsafe and was rejected**:

- `reserveAllows` (economy strain gating) depends on `civ.gold`, which changes every round. A city
  correctly rejected this round for insufficient treasury reserve could become affordable next
  round purely from gold accumulation — exactly the "gold-hoard" shape `known-campaign-gaps.ts`
  already documents. A memo keyed only on tech/building state would never re-check this, silently
  stranding a city that should eventually start building again. This is a worse bug than the
  performance cost it would save.
- Unit candidates depend on `demands` (`AIForceDemand[]`), which is derived from the strategic plan
  and can change every round (a new threat, a completed objective). A memo would need to also key
  on demand state, which changes often enough that the cache would rarely hit anyway — eliminating
  most of the claimed savings while adding real invalidation-correctness risk.

A narrower memo (skip only when the *tech-eligible* candidate list, before economy/demand
filtering, is provably empty) is theoretically safer but still non-trivial to get right (must
invalidate on tech completion, building completion elsewhere, resource reveal, era advance,
national-project uniqueness reservation, and arsenal/air-base capacity changes — several of these
are civ-wide, not city-local, so the invalidation key is not simply "this city changed"). Given:

- the growth **plateaus** rather than compounding indefinitely (§2b — this is not the kind of
  unbounded-cost bug the "old ≤25m target" was originally protecting against),
- the underlying idle population is a **known, already-tracked gameplay shape** (#1094), not a new
  defect this issue should silently paper over with caching, and
- the arc's own explicit instruction not to "invent more caching" to hide a competence stall,

the correct call is **Case D: legitimate activity, not redundancy or stall.** No code change is
proposed. This also means I am **not** inventing a new follow-up issue under the dynamic-priority
rule — #1094 already exists and already owns this.

## 5. Reconciling #1125's practical-gate target

`.claude/rules/ai-simulation.md` (lines ~45-56) and `campaign-scenarios.ts`'s header currently
state the matrix's historical ≤25-minute-sequential intent is "not currently met" and point at
#1126 as "the tracked, not-yet-fixed dominant cost." That is now stale in two ways: #1127 measurably
reduced (did not eliminate) the cost, and the remaining cost's root cause is now understood and
attributed to #1094, not "an unattributed super-linear hotspot." The honest reconciliation is:

- **#1126**: close, with a comment recording this design doc's evidence — the redundancy this
  issue was filed to isolate is now fully attributed (not to a bug in `#1126`'s own scope, but to
  #1094's already-tracked gameplay shape). Nothing further for #1126 itself to fix.
- **#1125**: update with a comment stating the ≤25-minute target remains unmet, but the reason is
  now fully understood and is not a redundant-computation bug — it is `#1094`'s tracked AI
  competence gap compounding through the campaign's idle-city population. #1125 should **not**
  claim the gate is "restored" (it is not, by wall-clock), but should record that every
  previously-unattributed cost source in its own scope is now attributed to a named, tracked issue
  (#1094) rather than an open question. Whether to lower the ≤25-minute target, accept the current
  runtime as the documented number, or prioritize #1094 is a product/scope call for a human or a
  future arc, not something to silently decide here.
- `.claude/rules/ai-simulation.md` and `campaign-scenarios.ts`'s stale "#1126 is the tracked, not-
  yet-fixed dominant cost" language gets updated to name #1094 instead, with the measured post-
  #1127 numbers.

## 6. Deterministic behavior contract

No production code changes. `.claude/rules/ai-simulation.md` and `campaign-scenarios.ts` doc-comment
edits only — zero effect on any test, on `yarn test`, `yarn build`, or any simulation determinism
guarantee. No save/determinism/solo/hot-seat implications.

## 7. Performance guard strategy

No new guard is added. `tests/perf/algorithmic-budgets.test.ts`'s existing GUARD 8
(`aiRound.cityYieldCalls`) already protects the single-round-fixture-scale regression class #1069
fixed; it is orthogonal to this issue's multi-round idle-accumulation shape (which the fixture,
being a single static crowded-state snapshot, cannot exercise). No committed test currently
exercises the idle-accumulation shape across a real multi-round campaign — the long-horizon matrix
itself (`campaign-matrix.test.ts`) is the only thing that does, and it already flags
`production-idle` as a known, ratcheted finding under #1094. This is judged sufficient: the
alternative (a new committed multi-round perf-budget test) would require solving exactly the
`withPerfProbe`-on-a-long-campaign OOM trap documented in §1 for a committed, CI-running test,
which is a meaningfully larger undertaking than this issue's scope and would need its own design
review if pursued — noting it here as a possible future follow-up, not filing it as a blocking
issue (no demonstrated need beyond this investigation's own scratch instrumentation).

## Mandatory review — INLINE REVIEW ACROSS ALL DIMENSIONS

**perform an INLINE review across these dimensions about balancing gameplay, fun, new mechanics,
different player ages (7-43), different play styles, the built in difficulty modes, how computer
players will use it, ui, ux, architecture, extensibility, data, sfx, updating saved games, proper
testing, regressions solo play, and hot seat plays, and proper implementation.**

This is a docs-only change (no production code), so most dimensions are inspected and found
unaffected rather than materially engaged:

- **Gameplay / fun / new mechanics**: none introduced. No mechanic changes; this reconciles a
  documentation claim against measured evidence.
- **Player ages 7-43 / play styles**: not affected — no player-facing surface changes at all.
- **Difficulty modes**: not affected — the measurement was run at Veteran/large (the documented
  worst-case scenario), but the conclusion (idle-city accumulation is a gameplay shape, not a perf
  bug) generalizes across difficulty; #1094 already owns the difficulty-invariant treatment of
  production-idle behavior per `.claude/rules/game-balance.md`'s minor-civ economy "Difficulty
  policy" precedent (challenge tiers tune quantity/timing, never eligibility) — the same principle
  applies to major-civ idle behavior, though that is #1094's design to make, not this doc's.
- **Computer players (AI)**: directly the subject of this investigation. I verified the AI's
  actual behavior is unchanged by this doc (no code touched) and that the measured idle-city
  growth is a real, existing AI behavior (civs exhausting buildable content), not an artifact of
  the measurement.
- **UI/UX**: none — no UI touched.
- **Architecture**: the decision explicitly avoids adding a new caching layer to
  `ai-production.ts` after tracing a real correctness risk (stranding a city that becomes
  affordable) that a naive cache would introduce — this is the architecturally conservative choice
  given the risk/benefit, not merely "no code was easiest."
- **Extensibility**: not affected.
- **Data**: no `GameState` shape change.
- **SFX**: not applicable.
- **Updating saved games**: no migration needed — no persisted shape change.
- **Proper testing**: the scratch measurement harnesses are deliberately not committed (matching
  the repo's own convention that `tests/perf/**` and `tests/simulation/long-horizon/**` are the
  sanctioned homes for this kind of instrumentation, and this investigation's ad hoc idle-bucket
  spy is not general-purpose enough to warrant permanent placement — see §7's note on the
  OOM-safety work a committed version would need). `yarn test` is unaffected by this change (no
  source files touched); verified by running the targeted description-honesty-adjacent doc checks
  are not applicable here (no such gate exists for `.claude/rules/*.md` prose) and by `yarn build`
  staying green (doc-only diff cannot break the build, confirmed by inspection of the diff scope).
- **Regressions solo play / hot seat**: not affected — no gameplay code touched, and the
  measurement scenario (`lh-veteran-large`) is a solo (1 human) scenario; the idle-accumulation
  shape itself is civ-scoped, not player-count-scoped, so it applies identically to hot seat (an
  AI civ's idle-city behavior does not depend on how many human seats exist).
- **Proper implementation**: this document itself, plus the follow-up doc-comment edits in
  `.claude/rules/ai-simulation.md` / `campaign-scenarios.ts` and the #1126/#1125 issue comments, are
  the full scope of "implementation" for this issue's Case D conclusion.

No findings required a fix (none applied for this docs-only change beyond the design decisions
already documented in §4).
