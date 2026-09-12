# AI Viability → Sanity → Scalability Arc — Design

Issues: **#1064** (AI never expands / builds no units) → **#1066** (late-era unit-count
runaway) → **#1069** (AI-round work is super-linear in unit count).

Baseline: `origin/main` @ `71fc0993`.

Strict sequencing: **make the AI play credibly → make sure late-game AI stays sane →
make the credible AI scale.** #1066 and #1069 are evaluated *against post-#1064
behaviour*, because #1064 currently distorts both the long-horizon workload and the
late-game state shape. One issue per MR.

---

## 1. #1064 — exact current root cause

### 1.1 Two structural gaps, not one

**Gap A — a settler is structurally unbuildable.**

`generateWithResidual` (`src/ai/ai-production.ts:523`) drops every trainable-unit
candidate that matches no `AIForceDemand`:

```ts
const fulfilled = matchingDemand(roles, demands);
if (!fulfilled) continue;
```

`AIForceDemand`s have exactly two sources, both in
`prepareMajorCivStrategicPlan` (`src/ai/ai-prepared-turn.ts:450`):

1. `assignUnitsToPortfolio(...).forceDemands` — derived **only** from
   `plan.requiredRoles` of the plans in the portfolio
   (`src/ai/ai-unit-assignment.ts:246`).
2. `mergePreparedForceDemands`'s additional seeds — `choice.demands`
   (`objective-readiness`), the domination counterplay demand,
   `defense-overflow:<cityId>`, `observedArmorDemand`, `observedAirDefenseDemand`.

Every `requiredRoles` literal in the tree is military or expeditionary:
`{ frontline: 1, capture: 1 }` and `{ 'resource-expedition': 1 }`
(`ai-prepared-turn.ts:288,314`), `{ frontline: 1, ranged: 1 }`
(`ai-plan-portfolio.ts:208`), `{ frontline | naval-combat: 1 }`
(`ai-prepared-turn.ts:399`), plus `{ frontline: 1 }` in `barbarian-system.ts:270`
and `minor-civ-system.ts:276`. **No code path anywhere emits `settlement` or
`worker`.** Verified by `grep -rn "settlement" src`.

Consequently dead: `weightProductionRoles`'s `settlement` term
(`ai-personality.ts:75`, `expansionDrive * 24`) and `chooseProduction`'s
`settler && cityCount >= 4` de-prioritisation (`ai-strategy.ts:37`) — the latter
is reachable only from `chooseLegendaryWonderFallback`, which passes
`availableBuildings` and never a unit. `evaluateExpansionTarget`
(`ai-strategy.ts:50`) has **no production caller at all**.

A secondary amplifier: `choosePrimaryObjective`'s `missingRoles`
(`ai-objective-scoring.ts:199`) makes a candidate `baseEligible` only when the civ
**already owns** every required role. That is a catch-22 — you need the unit to get
the plan, and the plan to get the demand to build the unit. It is only *partially*
mitigated, by design: `choice.demands` collects those missing roles from **every**
analysed candidate regardless of eligibility, and they are merged back as
`objective-readiness` seeds at priority 90. That bootstrap is the mechanism this
design leans on (§2.2).

**Gap B — even a produced settler can never found a city.**

- `MIN_CITY_CENTER_DISTANCE` is `4` (`city-territory-system.ts:5`), so a settler
  trained in a city fails `canFoundCityAt` where it spawns.
- `processAIResettlement` (`ai-resettlement.ts:53`) — the only code that *moves* an
  AI settler — returns immediately unless
  `getCivilizationLiveness(state, civId).reason === 'settler'`, i.e. only for a
  **cityless** civ.
- The administrative settlement block in `basic-ai.ts:631` only calls
  `foundCityInState` where the settler already stands.
- `rankCivilianAndTransportActions` (`ai-tactics.ts:751`) offers `found-city`
  **only** at the settler's current tile and otherwise returns `[]`; and a settler
  never reaches tactics at all, because no plan declares `settlement`, so it is
  never in `assignedUnitIds`.

**Fixing A without B converts `expansion-frozen` into a settler pile** — a fresh
`unit-count-runaway`, which is the #1066 symptom. Both halves land in MR1.

### 1.2 Evidence, re-derived (not taken from the issue)

- `KNOWN_CAMPAIGN_GAPS` registers `expansion-frozen`, `gold-hoard` and
  `production-idle` against #1064 with `scenarios: 'any'` — i.e. reproducing on
  every scenario, every tier, every map size, solo and hot seat.
- The register is a **two-way ratchet** (`campaign-matrix.test.ts`): a fixed gap
  whose entry is not deleted fails the run.

---

## 2. Chosen behaviour contract

### 2.1 Shape decision: a real `expand` plan objective

The plan objective route was chosen over an administrative settler loop. Tracing it
showed the type surface **already anticipates it** — nothing new enters the type
system:

| Piece | Already exists |
|---|---|
| `AIStrategicObjective` `'expand'` | `core/types.ts:1920`; used today by `executionPlan` (`ai-major-turn.ts:792`) as a rally-movement rewrite |
| `AITarget` `{ kind: 'region'; id; anchor }` | `core/types.ts:1959` |
| `settlement` in role assignment order | `ai-unit-assignment.ts:64` |
| `found-city` tactical action + executor | `ai-tactics.ts:95`, `ai-major-turn.ts:472` |
| `region` handled in `targetStillValid`, `hasSufficientTargetConfidence` | `ai-major-turn.ts:611,678` |
| `region` accepted by the fixture's `targetWasPerceived` | `ai-playability-fixture.ts:205` |
| `expand` is **not** in `OFFENSIVE_OBJECTIVES` | `ai-objective-scoring.ts:62` — so `exactTargetKnown` is true for a region target, and `preparingOffense` is false, so a settle plan dispatches in every phase |

So the core change is **one missing candidate generator**, not a planner rewrite.
This satisfies #1064's stated non-goal ("not a rework of the strategic planner or
the `AIForceDemand` model beyond what is needed to let expansion happen").

### 2.2 The bootstrap, end to end

```
turn N   : expandCandidates() emits an `expand` candidate, requiredRoles {settlement:1}
           civ owns 0 settlers  -> missingRoles -> baseEligible=false -> NOT a plan
           but choice.demands gains 'settlement'
           -> mergePreparedForceDemands seeds {role:'settlement', priority:90}
           -> generateWithResidual: matchingDemand() now returns for 'settler'
           -> applyAIProduction enqueues a settler in an idle city
turn N+k : settler completes; availableRoleCounts has settlement:1
           -> the expand candidate is baseEligible
           -> selectPrimaryPlan may adopt it as primaryPlan
           -> assignUnitsToPortfolio fills the settlement slot with the settler
           -> processMajorCivStrategicTurn dispatches it tactically
           -> rankCivilianAndTransportActions moves it toward the region anchor
           -> on arrival, `found-city`
```

`ai-production.ts` is **not modified** for the expansion path. The settler becomes
buildable because it legitimately matches a demand — the existing contract, not a
bypass.

### 2.3 Expansion rules

Site selection is **fog-bounded**. Candidate sites are drawn from
`buildKnownPathMap(state, civId)` (`ai-prepared-turn.ts:185`) — visible tiles plus
`isTrustedObservedLastSeenTile` snapshots — the same map the objective travel
resolver already uses. A site qualifies when:

- its terrain is a legal city centre (not `ocean` / `coast` / `mountain`);
- no **known** city centre lies within `MIN_CITY_CENTER_DISTANCE`;
- it is reachable on land from an operational anchor (`findPath` via the known map); and
- the civ is below its expansion soft cap (below).

Scoring reuses the currently-unused `evaluateExpansionTarget` (`ai-strategy.ts:50`)
over the site's known neighbourhood, fed into `AIObjectiveCandidate.strategicValue`,
with the existing `scoreObjectiveCandidate` distance/supply penalties doing the
rest. Ties break on `hexKey` ascending.

**Bounded by two independent limits, neither of which is the candidate cap.**

1. *Width* — no expand candidate is produced once
   `ownCityCount >= EXPANSION_CITY_SOFT_CAP_BASE + Math.round(expansionDrive * 4)`.
   With `EXPANSION_CITY_SOFT_CAP_BASE = 2` and `expansionDrive` in `[0, 1]`, that is a
   2-to-6 city soft cap. This is the **only** place `expansionDrive` gates *whether*
   the AI expands; everywhere else it only weights *how much*. It is a soft cap on new
   *settling*, not a cap on empire size — conquest is unaffected.
2. *Rate* — at most one `settlement` demand is outstanding at a time (§2.4), and
   `residualDemands` additionally discounts an already-queued settler, so a civ can
   never queue a second settler before the first is spent.

`EXPAND_CANDIDATE_LIMIT` (§2.7) caps how many **sites** are considered per turn. It is
a decision-trace ceiling constraint, not an expansion bound — do not conflate them.

### 2.4 The demand-accounting fix (required, not optional)

`choice.demands` seeds are merged with `desired: 1, assigned: 0` **every turn**
(`ai-prepared-turn.ts:584`), unlike `observedArmorDemand` / `observedAirDefenseDemand`,
which both pass a real `assigned`. `residualDemands` only decrements against units
**already queued**, never against units that **exist**. So a persistent readiness
demand produces one unit per turn, forever.

Left alone, adding an `expand` candidate yields one settler per turn indefinitely —
precisely #1064's "do not create arbitrary unit spam" prohibition, and precisely the
#1066 signature.

**Contract:** an `objective-readiness` seed means *"I own zero units of role R, so I
cannot even consider this objective."* It is satisfied by owning one. Therefore:

```ts
assigned: Math.min(1, availableRoles[role] ?? 0)
```

using the `availableRoleCounts(perception)` value already computed for
`choosePrimaryObjective`. `AIObjectiveChoice`'s shape is unchanged, so the decision-trace
contract is untouched.

**This is the highest-regression-risk edit in the arc.** It also damps standing
`frontline` / `capture` / `resource-expedition` readiness demands. Plan-derived demands
(which count `assigned` correctly, per plan slot) remain the primary military driver,
but `tests/ai/ai-prepared-turn.test.ts`, the Domination AI tests, and
`tests/simulation/ai-playability.test.ts` must all be re-run deliberately and read,
not merely observed to pass.

### 2.5 Plan-phase behaviour

`nextPlanPhase` (`ai-major-turn.ts:752`) gates `mobilizing → advancing` on
`hasCaptureOrFrontline(assignedUnitIds)`. A settler is neither, so a settle plan
would sit in `mobilizing` for its whole life.

Not fatal — `preparingOffense` is false for `expand`, so the settler is still
dispatched every turn — but it permanently distorts `plan-stuck` and
`maxNoProgressRounds`, which are exactly the long-horizon signals this arc is judged
on. The gate becomes objective-aware: a non-offensive plan advances on
`hasRequiredRoles` (which already exists, `ai-major-turn.ts:586`) or the mobilization
deadline, without the capture/frontline requirement.

A settle plan that keeps moving stays alive: a `move` action satisfies
`actionAdvancesPlan` (`ai-major-turn.ts:778`), so `lastProgressTurn` advances
(`ai-major-turn.ts:976`) and `currentPlanIsValid`'s stall check
(`ai-plan-portfolio.ts:146`) does not fire. `expiresAfterTurn` is `createdTurn + 12`;
a walk longer than that simply re-plans, which is correct.

### 2.6 Settler tactics

`rankCivilianAndTransportActions` gains a move branch: when a settler cannot found
where it stands, step one tile along `findPath(unit.position, targetPosition(plan), …)`
and emit a `move` action ranked just below `found-city`. Founding on arrival is the
existing `found-city` branch. No new action kind, no new executor.

### 2.7 The 12-candidate trace ceiling

`assertLegalChoices` throws at `trace.candidates.length > 12`
(`ai-playability-fixture.ts:266`). `resolveObjectiveTravelCandidates` slices to 8 per
objective and 24 overall (`ai-objective-scoring.ts:156,166`), so today's two classes can
in principle reach 16 — they do not in practice, which is why the ceiling holds. A
third class can breach it.

`EXPAND_CANDIDATE_LIMIT` caps expand sites **before** they enter
`resolveObjectiveTravelCandidates`, and a regression pins the analysed-candidate
count. The long-horizon matrix is the real proof; the limit starts at **3** and is
only raised on measured evidence.

### 2.8 Negative-score production selection

`applyAIProduction` takes `candidates[0]` regardless of sign. **This stays.** The
score is a *ranking*, not a *veto*: a one-city AI with low production legitimately has
all-negative candidates (every term is dominated by `- productionTurns * 1.5`), and
idling is strictly worse than the least-bad build — idling is the `production-idle`
finding this arc exists to remove. `reserveAllows` (`ai-production.ts:263`) is the
real affordability gate and already runs per candidate.

The actual defect in that function is different and is fixed: `idleCities.sort()`'s
comparator calls `generateWithResidual` **twice per comparison**, i.e.
`O(n log n)` full candidate generations per civ per round, each of which calls
`calculateProjectedCityYields`. Hoisting to a map computed once per city is
**provably order-identical** — the comparator already reads `state`, never
`nextState`. MR1 does this because MR1 adds a candidate class and would otherwise
multiply the cost; MR3 owns measuring it.

### 2.9 Challenge-profile behaviour

Explorer / Standard / Veteran **do not change core legality**. No challenge input
gates whether an expand candidate exists, whether a site is legal, whether a settler
is trainable, or what anything costs. Existing tuning is untouched:
`maxPrimaryForce` still caps assignment slots, `mobilizationRounds` still paces the
phase deadline, `retreatHealthPercent` still drives recovery. This follows the
established `.claude/rules/game-balance.md` difficulty split (tune scores and
timing, never legality).

### 2.10 Personality behaviour

`expansionDrive` shapes **how wide**, never **whether**. It enters through
`weightProductionRoles`'s existing `settlement` term (`expansionDrive * 24`), which
this design finally makes reachable, and through the expand candidate's
`strategicValue`. Personalities must not converge: `expansionist` and `trader` should
settle meaningfully more than `aggressive` and `diplomatic` over a campaign, and a
test pins the ordering rather than an absolute count.

### 2.11 Worker behaviour

Out of scope for the `expand` objective, and deliberately so. Workers already have a
working administrative execution path (`basic-ai.ts:700`, the road/improvement loop),
so they have Gap A but **not** Gap B. MR1 does **not** add a `worker` demand: doing
so without measured evidence risks a second unbounded producer, and #1064's acceptance
criteria are about expansion and idle cities. If post-#1064 evidence shows workers are
the residual `production-idle` cause, it gets its own follow-up issue.

### 2.12 Determinism

- No new randomness. No `Math.random()`, no new `createSimulationRng` stream — site
  selection is a pure function of known tiles with a total order (`hexKey` ascending).
- Iteration order over `Object.values(map.tiles)` is insertion order and already
  relied on elsewhere; every consumer re-sorts explicitly.
- `traces` ordering is unchanged: expand candidates enter the same `ranked` array
  through the same `candidateId` scheme.
- Contract clauses 1–4 of `.claude/rules/game-systems.md` all apply; clause 3
  (deterministic AI, in-process **and** across a save/reload boundary) is the binding one.

### 2.13 Save / reload continuity

**No `SAVE_VERSION` bump and no migration.** `AIStrategicPlan`, `AITarget` and
`MajorCivPlanPortfolio` are unchanged; `'expand'` and `kind: 'region'` are already
legal persisted values and already normalized (`core/opponent-ai-state.ts:24`,
`:124`). A pre-arc save simply has no expand plan and acquires one on its next
planning round.

Note that `#1065` (an unrelated open bug) makes `save/reload continuity` diverge on
`minorCivs.*.lastNotifiedStatusByCiv`; `isKnownSaveReloadDivergence` tolerates exactly
that path. This arc must not add a second tolerated path.

### 2.14 Hot seat

No behaviour may key off `state.currentPlayer`. Expansion is authoritative simulation:
it reads `civId`-scoped perception, `civId`-scoped visibility, and `civId`-scoped
portfolio state only. `lh-hotseat-medium` is in the acceptance matrix.

### 2.15 Viewer-information boundaries

The AI must not use hidden global facts to decide expansion. Enforced by construction:
sites come from `buildKnownPathMap`, which deletes every tile that is neither
`visible` nor a trusted `lastSeen` snapshot; known cities come from
`perception.knownCities`. A negative test proves an unexplored but objectively
excellent site is never targeted.

### 2.16 AI trace expectations

`decision: 'objective'` traces gain expand candidate ids of the form
`expand:region:settle:<q>,<r>`. Trace **shape** is unchanged. The ≤12 ceiling (§2.7)
is the binding constraint.

### 2.17 Long-horizon acceptance for #1064

- `expansion-frozen`, `gold-hoard`, `production-idle` stop reproducing across the
  matrix, and their three `KNOWN_CAMPAIGN_GAPS` entries are **deleted in the same PR**
  (the ratchet fails until they are).
- No detector is weakened and no threshold widened to get there.
- Any **new** finding the suite surfaces is either fixed or registered against a new
  follow-up issue — never hidden.

---

## 3. Post-#1064 re-evaluation plan for #1066

**#1066's root cause is explicitly not triaged. No fix is pre-committed.**

One prediction is recorded **to be falsified, not assumed**: the unbounded
`objective-readiness` accounting in §2.4 produces exactly the reported signature —
`+1 unit/civ/round`, one city, gold still rising (gold rises because production, not
gold, buys the unit). If §2.4 removes it, that is Outcome A below, and #1066 closes
with evidence and **no second code change**.

MR2 begins by re-running `lh-late-era-medium` on refreshed post-#1064 `main`:

**A — symptom disappears.** Prove it with repeated deterministic runs (byte-identical
artifact). Determine *why* #1064 removed it. Keep `unit-count-runaway` as a live
guard, delete only the `KNOWN_CAMPAIGN_GAPS` registration, document why no further
production fix is warranted, close #1066 with evidence.

**B — shape changes materially.** Re-derive from current evidence. Instrument
*before* touching production logic.

**C — persists substantially unchanged.** Instrument the ramp, identify the real
creation path, write a regression reproducing that exact path, only then design.

For B and C, instrument rounds around the ramp and capture, per created unit: type,
owner, creation function/path, triggering system, gold/production cost, source
city/base, and which mechanism created it (production queue, spawn, carrier/air,
crisis/world actor, fixture setup, special mechanic). Candidate suspects — Era-9
fixture posture (`ai-playability-fixture.ts:413`: `gold = 1000`, warrior→`tank`, one
injected `wwii_fighter`), late-game economy/mobilization, carrier/air basing, a
mis-attributed world-threat force — **none may be called root cause until traced.**

Instrumentation must obey `tests/scripts/perf-isolation.test.ts`: no vitest import,
no `vi.*`, no `tests/perf` reference under `src/**`. Use spies from the test side.

Acceptance: spawn source identified and documented; a one-city late-era AI no longer
gains 25+ units over the campaign without a justified economic cause; the gap entry
deleted only once the detector stops reproducing; the detector retained as a guard;
determinism preserved; no regression to #1064's expansion fix; no save/reload
divergence; no solo or hot-seat regression.

---

## 4. Post-#1064 re-evaluation plan for #1069

**Re-baseline first.** The checked-in `aiRound` numbers
(`tests/perf/baselines/algorithmic-baseline.json`: `pathQueries` 118→408,
`heapPops` 114774→387872, `auditedCommit: 96fb08e9`) were measured against an AI that
**does not expand and barely builds units**. They are not a valid optimization target.
Post-#1064/#1066 `main` gets fresh e1/e2 measurements before any optimization.

Named hotspots, from tracing:

| Hotspot | Location | Shape |
|---|---|---|
| `applyAIProduction` sort comparator | `ai-production.ts:751` | `O(n log n)` full candidate generations per civ per round (addressed in MR1 §2.8) |
| `movementRange()` rebuilds occupancy | `ai-tactics.ts:232` | `buildUnitOccupancy(state.units)` on **every** call, and called repeatedly per unit per ranking pass |
| `calculateProjectedCityYields` per candidate | `ai-production.ts:492` | once per `generateWithResidual`, multiplied by the comparator above |
| `getMovementRangeDetails` blocker scan | `unit-movement-queries.ts` | **owned by #1068** — consume it, do not duplicate it |

Design target: share round-scoped derived data where behaviour is provably identical —
blocking-entity key sets, unit occupancy, per-civ reachable-tile maps, a city-yield
cache keyed by every input that affects the result.

Rules: transient and rebuilt from state; **never persisted**; never crossing a
mutation boundary with stale derived data; keys encode every result-affecting input;
no hidden-information widening; no changed tie-breaking, iteration order, or
`Map`/`Set` dependence that affects results.

A new `cityYieldCalls` metric is added to the `aiRound` perf area — the baseline
currently records it only for `turn`, which is why #1069 had to quote
`yarn perf:report` numbers instead.

Acceptance: materially lower AI-round work counts; tightened budgets justified by the
measured new baselines per `.claude/rules/performance-budgets.md`'s re-baseline rule;
identical AI decisions/traces/resulting state for equivalent inputs; `yarn test:ai-long`
shows no quality regression; `ai-playability.test.ts` green; save/reload continuity
preserved; solo and hot seat preserved; no new persistence.

**Falsification is mandatory.** Prove the new guard *would* fail if repeated
recomputation were reintroduced, and prove a deliberately dumbed-down AI is **not**
accepted merely because its work counts fell. A lower count is not automatically good.

---

## 5. MR boundaries

| MR | Issue | Scope | Explicitly out |
|---|---|---|---|
| 1 | #1064 | expand candidate generator; readiness-demand accounting; objective-aware phase gate; settler tactical move; candidate cap; production-sort hoist; 3 ratchet entries deleted | any #1066 production cap; any #1069 caching layer; a `worker` demand |
| 2 | #1066 | instrument → trace → (fix or close-with-evidence); `unit-count-runaway` entry deleted | any perf optimization; any change to #1064's expansion behaviour |
| 3 | #1069 | fresh baselines; round-scoped shared derived data; tightened budgets | any AI behaviour change; any new persistence |

MR3 is optional within this arc. If the session is long, stop after MR2 and hand
#1069 to a fresh design session.

---

## 6. Non-goals for the whole arc

- Not a strategic-planner rewrite. Not a redesign of the `AIForceDemand` model.
- Not an observability change — #1005 already added the detection.
- No `SAVE_VERSION` bump unless a real persisted-shape change becomes unavoidable.
  None is expected.
- No new player-facing UI. Players aged 7–43 should meet a **more credible** opponent,
  not a more complex interface.
- No detector weakening, threshold widening, or gap-entry retention to make a run green.
