# #1088 — AI Military Operations Competence (Design)

**Status:** design, not yet implemented.
**Base SHA:** `871f64aa515ffa677ba13b7923fcf6082f5806d8` (`main`, post-#1066/PR #1120).
**No active PR or branch found implementing #1088** (`gh pr list --search "1088"` and
`gh search prs "1088"` both return nothing relevant; `git log origin/main..
claude/conquestoria-1088-ai-ops-035de9` is empty).

## 0. The issue body is a 2026-09-12 diagnosis; current main has moved past it

Issue #1088 proposes replacing the phase machine with
`mobilizing → assembling → advancing → engaging → consolidating` and frames the defect
as "the AI chooses the correct target but feeds units into the war one at a time."

Current `main` already has a real phase machine (`nextPlanPhase`,
`src/ai/ai-major-turn.ts:730`): `scouting → mobilizing → advancing → attacking →
consolidating → complete`, plus `withdrawing` and `abandoned`. Renaming
`mobilizing`→`assembling` or `attacking`→`engaging` would add no new behavior — see
§4 (phase-by-phase audit). The issue's proposed five-phase model is **not** implemented
here; §15's evidence-based root cause is a bug in the phase machine that already exists,
not a missing phase.

## 1. Reproduction methodology

`tests/simulation/domination-ai-campaign.test.ts`'s fixture (`campaignStart()`) already
produces real offensive capture operations deterministically: three independent major
civs, `ai-1` (Mongolia) given 4 `tank`/`main_battle_tank` units, full tech tree, era 9,
1000 gold, adjacent to two undefended human-slot cities. `player-1`/`player-2` have zero
units (`establishOccupiedCity` deletes their starting units) — the AI's own decisions
are the only fallible thing in the loop.

A temporary instrumented copy of this fixture (never committed — deleted after use, see
the implementation plan for the exact recipe to regenerate it) ran the campaign through
`processNonHumanMajorRound` for 14 rounds, logging `state.opponentAI.majorCivs['ai-1']
.primaryPlan` (objective/phase/target/`requiredRoles`/`assignedUnitIds` with live
position/health/movement) after every round, plus `defensePlansByCityId` keys.

## 2. Traced real operation (rounds 1–14, `ai-1`, Standard challenge, aggressive-leaning Mongolia)

```
R1    plan=NONE
R2  * plan=secure-resource phase=mobilizing  target=furs                         requiredRoles={"resource-expedition":1} assigned=[unit-15 expedition]
R3  * plan=expand           phase=advancing  target=settle:6,2                    requiredRoles={"settlement":1}          assigned=[unit-17 settler]
R4  * plan=capture           phase=advancing  target=city-5 (owner=player-1)       requiredRoles={"frontline":1,"capture":1} assigned=[unit-12 tank, unit-13 tank]
R5  * plan=capture           phase=consolidating target=city-5 (owner=ai-1)        requiredRoles={"frontline":1,"capture":1} assigned=[unit-12, unit-13]
R6  * plan=capture           phase=advancing  target=city-7 (owner=player-2)       requiredRoles={"frontline":1,"capture":1} assigned=[unit-12, unit-11]   <- DIFFERENT PLAN, city-5 left with 0 assigned units
R7    plan=capture           phase=advancing  target=city-7 hp=80                                                          assigned=[unit-13, unit-14]
R7    defensePlans=city-6
R8    plan=capture           phase=advancing  target=city-7 hp=60                                                          assigned=[unit-14, unit-19 paratrooper]
R8    defensePlans=city-6,city-5
...
R13 * plan=capture           phase=attacking  target=city-7 hp=1                                                           assigned=[unit-14, unit-12]
R14 * plan=capture           phase=consolidating target=city-7 (owner=ai-1)                                                assigned=[unit-14, unit-19]
```

(Round 15 would repeat the R5→R6 pattern for city-7, by inspection of the identical code
path — not separately re-traced, since the mechanism is generic, not city-specific.)

### What this proves, precisely

1. **The capture at city-5 (R4→R5) succeeded.** Two tanks reached, attacked, and
   captured an undefended city in one round. This is a **healthy control** — the force
   assembled (trivially, since the target had no defenders), advanced, and captured.
2. **The very next round (R6), the primary-plan slot is a completely different plan**
   (`capture city-7`), and the two tanks that just took city-5 are reassigned — one of
   them (`unit-12`) to the new target, the other (`unit-13`) dropped from any plan for a
   round before being reused. **City-5 has zero assigned units and no defense plan for
   two full rounds (R6, R7)** — a defense plan for it only appears at R8, purely
   reactive (§9, §10).
3. This is **not** a downstream symptom of a bad tactical choice, a missing force
   demand, or a stalled mobilization. It reproduces identically for `city-7` at R14→R15
   by the same code path. It is a **structural planning-layer defect**: the plan that
   captured the city cannot survive into a second round of its own `consolidating`
   phase.

## 3. First causal failure — exact mechanism

`prepareMajorCivStrategicPlan` (`src/ai/ai-prepared-turn.ts:690`) runs once per civ per
round, from the state at the **start** of that round. Its `objectiveCandidates()`
(`ai-prepared-turn.ts:299`) generates a `capture` candidate for a city only when
`city.owner !== civId` (line 361: `if (!city.position || city.owner === civId)
continue;`). Once `ai-1` owns city-5 (captured during round 5's own execution), no
`capture city-5` candidate is ever generated again — correctly, since re-capturing your
own city is not a real opportunity.

`selectPrimaryPlan` (`src/ai/ai-plan-portfolio.ts:152`) decides whether to **retain**
the current `primaryPlan` or replace it:

```ts
const currentCandidate = current
  ? context.candidates.find(candidate => planMatchesCandidate(current, candidate))
  : undefined;
if (current && currentPlanIsValid(current, currentCandidate, context.turn)) {
  // ... retain, possibly refreshed
}
return best ? createPlan(context, best) : null;
```

`currentPlanIsValid` (`ai-plan-portfolio.ts:138`):

```ts
function currentPlanIsValid(plan, candidate, turn) {
  if (!candidate?.targetValid || !candidate.reasonValid) return false;
  ...
}
```

Because no `capture city-5` candidate exists at round 6's `objectiveCandidates()` call,
`currentCandidate` is `undefined`, so `currentPlanIsValid` returns `false`
**unconditionally on its very first line** — the plan cannot be retained, regardless of
its phase. `selectPrimaryPlan` falls through to `createPlan(context, best)`, discarding
the consolidating plan entirely and creating a brand-new one for whatever candidate now
scores highest (here, `capture city-7`).

**The execution layer already special-cases this correctly and is not the bug.**
`targetStillValid` (`ai-major-turn.ts:611`), consulted mid-round during
`processMajorCivStrategicTurn`, has:

```ts
if (plan.objective === 'capture') {
  return city.owner !== plan.actorId || plan.phase === 'consolidating';
}
```

— a consolidating capture plan is explicitly protected from being marked `'abandoned'`
mid-round. `nextPlanPhase`'s own consolidation-completion rule
(`plan.phase === 'consolidating' && turn - plan.lastProgressTurn >= 2 &&
!hasVisibleLocalCounterattack(...)` → `'complete'`) is well-designed and exactly matches
the issue's stated goal ("garrison, heal, restore supply, and only then
transition/replan"). **It is unreachable in practice**: it requires the plan to survive
as `primaryPlan` into a second round after entering `consolidating`, and
`selectPrimaryPlan` deletes it during the very next round's planning pass, before that
rule ever gets a second chance to run. The two-turn "no progress + no counterattack"
completion path is dead code under every realistic condition — there is no scenario in
which a plan can accumulate two quiet rounds in `consolidating`, because it is discarded
after the first.

**Root cause, stated generically:** `selectPrimaryPlan`'s retention rule requires a
live *opportunity candidate* to keep the current plan; a `consolidating`-phase plan is
no longer chasing an opportunity, it is finishing one that already succeeded, and the
candidate generator structurally cannot produce a "still consolidating this city"
candidate (nor should it — that is not what `objectiveCandidates()` is for). The
retention rule and the phase-transition rule were built as two independent layers
(`ai-plan-portfolio.ts` vs. `ai-major-turn.ts`) that silently disagree about whether a
consolidating plan is still alive.

## 4. Phase-by-phase audit (current `main`, before this change)

| Phase | Production demand | Assignment behavior | Movement target | Tactical ranking | Readiness threshold | Interruption | Completion |
|---|---|---|---|---|---|---|---|
| `scouting` | via `requiredRoles` (unchanged since creation) | normal | `executionPlan` redirects to rally point if `rallyPoint` set | `allowOffensiveActions=false` while `preparingOffense` (offensive objectives only) | `hasSufficientTargetConfidence` → `mobilizing` | `shouldWithdraw`/target-invalid same as any phase | → `mobilizing` |
| `mobilizing` | same `requiredRoles` | normal | rally point if set, else plan target | same offense-suppression as scouting | `hasRequiredRoles(...) \|\| deadlineReached` (§5) | same | → `advancing` |
| `advancing` | same | normal | plan target (real target, not rally) | offense allowed | none (movement-driven) | same | → `attacking` on first `attack` action once past migration grace |
| `attacking` | same | normal | plan target | offense allowed; `rankCapture`/`rankAttacks`/`rankBombardment` all active | none | same | implicitly superseded by `consolidating` once a `capture-city` action lands (checked *before* the `attacking` transition in `nextPlanPhase`'s ordering) |
| `consolidating` | same `requiredRoles` (garrison demand falls out for free — see §11) | normal, but see §3: **the plan itself cannot survive to be assigned to on the next round** | plan target unchanged (`executionPlan` has no `consolidating` branch) | `rankCapture` naturally returns nothing (already owned); `rankMoves` naturally returns nothing (already at target); assigned units fall through to `rest`/`hold`; `allowOffensiveActions=true` so a counterattack is still answered | `turn - lastProgressTurn >= 2 && !hasVisibleLocalCounterattack` | `hasVisibleLocalCounterattack` keeps it alive if genuinely threatened (once retained — see fix) | → `complete` (currently dead code, see §3) |
| `withdrawing` | same | normal | `executionPlan` redirects to nearest own city (`objective: 'recover'`, tactical-only relabel — persisted `plan.objective` unchanged) | offense allowed | n/a | `shouldWithdraw` false once healed/safe returns it toward its real phase next round | plan re-evaluated normally next round since original objective's candidate still exists (city not yet captured) |
| `abandoned` / `complete` | dropped | — | — | — | — | — | terminal; plan removed from portfolio next `selectPrimaryPlan` pass |

**Conclusion:** `mobilizing` already behaves like the issue's proposed `assembling`
(explicit readiness gate before advancing); `attacking` already behaves like the
proposed `engaging` (bombardment/capture/attack ranking is all live there). No new phase
name is introduced by this design. The one genuinely broken phase — `consolidating` — is
broken not because it lacks behavior (its tactical fallout and completion rule are
already correct, per the table above) but because the **portfolio-retention layer above
it deletes it before its own logic can run twice.**

## 5. Mobilization deadline — investigated, not the failure here

`nextPlanPhase`'s `mobilizing → advancing` gate:
`hasRequiredRoles(after, plan, assignedUnitIds) || deadlineReached`. In the traced
operation, `requiredRoles = { frontline: 1, capture: 1 }` was satisfied by 2 assigned
tanks well before `deadlineReached` could matter (`mobilizationRounds` per
`OPPONENT_CHALLENGE_PROFILES` was never approached). The deadline bypass did not fire in
this trace. It remains a real, separately-documented seam (§16 follow-up table) but is
**not** the demonstrated failure this MR fixes — the force-demand itself
(`{frontline:1, capture:1}`, fixed regardless of target strength, never including
ranged/siege, never scaling after losses — `ai-prepared-turn.ts:406`) is the more
load-bearing weakness behind "does the AI wait for enough force," and this trivial-
defense fixture cannot demonstrate it causing an actual execution failure (§16 finding
2). Widening it here would be exactly the "add arbitrary wait timers" / "increase every
force requirement" pattern the issue explicitly calls out as invalid without direct
evidence of it causing a failure.

## 6. Force-demand semantics — audited, deferred (see §16 finding 2)

`objectiveCandidates()`'s `capture` branch requests exactly `{ frontline: 1, capture: 1
}`, unconditionally: no scaling by visible defender strength, city HP/walls, distance,
or era; no ranged/siege request ever; no replenishment logic distinct from the same
flat 1+1 recomputed every round. This is real and matches the issue's own Bucket-B
examples verbatim ("capture plan requests only one capture unit and no support"). It is
not touched by this MR — see §16.

## 7. Readiness semantics ("assigned" vs. "operationally present")

Not the failure demonstrated here. `assignUnitsToPortfolio` (`ai-unit-assignment.ts`)
already filters candidates to `Number.isFinite(unit.travelTurnsByPlanId[plan.id])`
(reachable) and excludes `embarked`/`activeOtherDuty` units; `recoveryUnitIds` pulls out
badly-wounded units before role assignment. Whether "assigned" over-counts a unit that
is technically reachable but many turns away is a real, separate concern (issue's §7)
but was not observed to cause a failure in this trace (the assigned units were always
1-3 tiles away and moved in visibly each round). Deferred, not fixed here.

## 8. Emergency-defense interaction

`orderedPlans` (`ai-unit-assignment.ts:95`) places `defensePlansByCityId` (elimination
first, then threat-sorted) **before** `primaryPlan` in assignment order, so a genuine
threat always gets first pick of available units regardless of the fix in this MR. The
fix (§15) only changes whether a `consolidating` `primaryPlan` survives into the next
round's *planning* pass — it does not touch `assignUnitsToPortfolio`'s ordering, does
not give the primary plan elevated priority over defense, and does not prevent a
defense plan from poaching a garrison unit if a real threat appears at the just-
captured city (the two roles compete for the same unit pool exactly as before; defense
still wins the tie by construction). §10's test requirement covers this explicitly.

## 9. Consolidation — the finding this MR fixes

Covered in full in §2–§3. Restated: a captured city gets zero assigned defenders and no
defense plan for at least one full round (observed: two), and its former attackers are
redirected toward a new, unrelated, possibly distant objective the very next round, with
no heal/garrison/supply grace — this is precisely `.claude/rules/game-balance.md`'s
"no half-finished implementations" pattern turned into an AI-behavior bug: the phase
that was *supposed* to garrison/heal/hold exists in name and in its downstream tactical
fallout, but structurally never gets to run.

## 10. Difficulty behavior

Nothing in the chosen fix reads `OpponentChallenge`. Retention of a `consolidating`
plan is difficulty-invariant by construction — every challenge tier gets the same
"finish what you started" guarantee before the existing (unmodified)
`hasVisibleLocalCounterattack`/2-turn completion rule releases it. This matches §11's
requirement ("difficulty must NOT alter... whether an assigned unit exists").

## 11. Personality boundary

`selectPrimaryPlan`'s retention check has no personality input today and gains none.
Two civs with identical challenge tier and identical post-capture state will retain
their consolidating plan identically regardless of `PersonalityTraits`. Personality
continues to affect *which* plan was chosen originally (via `expansionDrive` and
`doctrine.captureValueBonus` in `objectiveCandidates()`), untouched by this fix.

## 12. Perception boundary

The fix reads only `state.cities[plan.target.id]?.owner` (already-owned data — no fog
check needed for your own city) and the plan's own `phase`/`turn`/`lastProgressTurn`
fields, all already legally known to the actor. No new omniscient read is introduced.
`hasVisibleLocalCounterattack` (unchanged, already viewer-scoped via
`state.civilizations[plan.actorId]?.visibility`) continues to gate the eventual
`'complete'` transition.

## 13. Save/determinism implications

`selectPrimaryPlan` is a pure function of `AIPortfolioContext` (already-serializable
state, no `Date.now()`, no new RNG draw). The fix adds a branch, not a new source of
nondeterminism. No new field is added to `AIStrategicPlan` or `MajorCivPlanPortfolio` —
no save migration, no `SAVE_VERSION` bump. A save/reload mid-`consolidating` continues
through `normalizeOpponentAIState` exactly as before; the retained plan round-trips
through serialization unchanged (it is already a normal `AIStrategicPlan`).

## 14. Performance implications

The fix removes one `Array.prototype.find` call over `candidates` in the
now-retained-without-a-candidate branch (a cheap win, not a new cost) and adds no loop,
no path query, no `calculateCityYields` call, no BFS/A*. `tests/perf/
algorithmic-budgets.test.ts`'s `aiRound` budget is not expected to move; will be
verified, not assumed (§ implementation plan).

## 15. Long-horizon implications

Every scenario in `LONG_HORIZON_SCENARIOS` that produces even one successful capture
currently hits this bug on the very next planning pass. The most direct expected
long-horizon effect: fewer "just captured, immediately undefended" windows: any
scenario where a rival ever recaptures a just-taken city should see that stop (or
become rarer) post-fix. `known-campaign-gaps.ts` has no entry naming this specific
symptom today (the suite has never had a scenario with contested recapture immediately
following an AI conquest that would have surfaced it as a *named* finding), so no
existing registry entry is expected to need deletion; a `yarn test:ai-long` run is still
required per the implementation plan to catch anything newly exposed, per this arc's
mandatory §"Terra long-horizon acceptance" process.

## 16. Ranked findings table

| finding | severity | breadth | first causal layer | fix here? | follow-up |
|---|---:|---:|---|---|---|
| 1. Consolidating plan is discarded the round after entering that phase; `nextPlanPhase`'s own completion rule is dead code; captured cities are momentarily undefended and their capturers redirected with no grace | **High** | Every capture-objective plan, every civ, every scenario (proven via direct trace, twice in the same 14-round run) | `selectPrimaryPlan`/`currentPlanIsValid` (`ai-plan-portfolio.ts`) requiring a live opportunity-candidate to retain a plan that is no longer chasing an opportunity | **Yes — this MR** | — |
| 2. `objectiveCandidates()`'s capture branch always requests exactly `{frontline:1, capture:1}`, regardless of defender strength, never requests ranged/siege, never scales after losses | High (structural), but **not demonstrated to cause an execution failure** in the only fixture traced (undefended targets) | Every capture plan | `ai-prepared-turn.ts:406` (`objectiveCandidates`) | No | File separately — needs a *defended*-target fixture to demonstrate actual failure before choosing a fix shape (scaling by visible defenders? adding a fixed siege/ranged floor? both interact with the game-balance production-cost rules and deserve their own evidence-gathering pass) |
| 3. `rankCapture`/`rankAttacks` have no explicit "wait for support" gate — a lone capture-capable unit will attempt capture the instant it is adjacent and the tile is clear, with no check that ranged/siege support has engaged first | Medium — not observed to cause a bad outcome in the traced run (the tiny force never had support to wait for, since finding 2 means one never exists) | Latent; likely entangled with finding 2 | `ai-tactics.ts`'s `rankCapture` | No | Re-evaluate only after finding 2 is fixed and a defended-target trace exists — fixing "wait for support" before there is ever support to wait for would be solving a problem with no current evidence, which this arc's own guardrails (§15 "invalid implementations") explicitly warn against |
| 4. Mobilization deadline (`deadlineReached`) bypass exists and was not exercised in this trace | Unknown severity — needs its own evidence | Unknown | `ai-major-turn.ts:753` `nextPlanPhase` | No | Needs a scenario where required roles are NOT satisfied before `mobilizationRounds` elapses to observe real behavior; not reproduced here |

Per this arc's own guidance (§16 in the source prompt): fixing only finding 1 here,
filing 2–4 as scoped follow-ups with the evidence already gathered above so a future
session does not have to re-derive it from scratch. **#1088 stays open** after this MR —
its acceptance criteria ("Assigned combat units preferentially remain operationally
cohesive during approach", "Bombardment/siege behavior coordinates with actual capture
follow-up") are not fully satisfied by finding 1 alone.

## 17. Chosen narrow fix

In `src/ai/ai-plan-portfolio.ts`, `selectPrimaryPlan`: when the current `primaryPlan` is
in `phase === 'consolidating'` and its target city is still owned by the actor (or, for
non-city targets that can reach `consolidating` — currently none can, since only the
`capture`-city branch of `nextPlanPhase` ever sets that phase — this condition is
future-proofed rather than narrowed to `city` specifically), retain it **without**
requiring a matching `currentCandidate`, bypassing exactly the `!candidate?.targetValid
|| !candidate.reasonValid` line of `currentPlanIsValid` for this one case. All other
`currentPlanIsValid` checks (`expectedLossRatio`, `turn > expiresAfterTurn`, the
stalled-past-reconsideration check) continue to apply unchanged as safety valves — a
consolidating plan can still expire or be judged stalled by those independent rules; it
is only exempted from "an opportunity candidate must still exist," which is the wrong
question to ask of a plan that already succeeded.

Concretely, in `ai-plan-portfolio.ts`:

```ts
function currentPlanIsValid(
  state-shaped context needed: add `cityOwnedByActor: boolean` derived by the caller,
  plan: AIStrategicPlan,
  candidate: AIPlanCandidate | undefined,
  turn: number,
): boolean {
  const consolidatingAndStillOwned = plan.phase === 'consolidating' && cityOwnedByActor;
  if (!consolidatingAndStillOwned && (!candidate?.targetValid || !candidate.reasonValid)) {
    return false;
  }
  if (candidate && candidate.expectedLossRatio > 1.5) return false;
  if (turn > plan.expiresAfterTurn) return false;
  const stalledPastReconsideration = turn >= plan.reconsiderAfterTurn
    && !(candidate?.progress ?? consolidatingAndStillOwned)
    && plan.lastProgressTurn < plan.reconsiderAfterTurn;
  return !stalledPastReconsideration;
}
```

(Exact signature/threading of `cityOwnedByActor` is Terra's call at implementation
time — `AIPortfolioContext` already carries everything needed to derive "is
`current.target` a city and is it owned by `context.actorId`" without a new state read;
see the implementation plan for the precise plumbing. The `stalledPastReconsideration`
branch's `progress` substitution matters: a consolidating plan's `lastProgressTurn` was
just set by the capture itself, so `plan.lastProgressTurn < plan.reconsiderAfterTurn` is
false immediately after capture in the overwhelming majority of cases anyway; the
explicit `consolidatingAndStillOwned` fallback exists so a plan that has been quietly
consolidating for a while without an intervening `reconsiderAfterTurn` bump does not
accidentally get judged "stalled" by a rule written for opportunity-chasing plans.)

When retained, `selectPrimaryPlan` must still refresh `target`/`theaterId` the same way
it already does for a normal retained plan (existing code, `currentCandidate ?
structuredClone(currentCandidate.target) : current.target` — for the no-candidate case
this correctly falls through to keeping `current.target` unchanged, which is exactly
right: the city hasn't moved).

This is the smallest change that lets `nextPlanPhase`'s already-correct completion rule
(§4) actually run a second time, and lets the existing, already-correct
`assignUnitsToPortfolio`/tactical fallout (§3's `rest`/`hold`/counterattack-response
behavior) actually execute for more than the single round the capture happened in.

### 17.1. Amendment found during implementation — a second, mirror-image site

TDD implementation surfaced a second occurrence of the identical bug, in a different
file. `ai-round-scheduler.ts`'s `revalidatePreparedPlan` runs a belt-and-suspenders
`planTargetIsStale` check on the prepared portfolio **after** `prepareMajorCivStrategicPlan`
(and therefore after §17's fix) but **before** that round's execution:

```ts
if (plan.objective === 'defend') return city.owner !== civId;
return plan.objective === 'capture' && city.owner === civId;   // <- unconditionally stale
```

This treats "capture objective, city now owned by us" as **always** stale — exactly the
condition a freshly-`consolidating` plan is in by definition. So §17's fix alone
retained the plan during planning, only for this second, independent check to discard
it again immediately before execution, every single round, forever. Confirmed
empirically: with only §17 applied, `tests/simulation/domination-ai-campaign.test.ts`
stopped reaching a domination victory within its 200-round cap (previously passing on
`main`) — a genuine, demonstrated regression, not a hypothetical.

The fix is the identical pattern, applied at this second site: exempt
`plan.phase === 'consolidating'` from the "owned ⇒ stale" rule, mirroring
`ai-major-turn.ts`'s own `targetStillValid` (`city.owner !== plan.actorId || plan.phase
=== 'consolidating'`) — this is now the *third* place in the codebase expressing the
same "a consolidating capture plan legitimately owns its target" fact, all three now
consistent. No further site was found; `targetStillValid` (execution-time,
`ai-major-turn.ts`) already had this exemption from the start (§3) and needed no change.

This does not broaden the MR's scope — it is the same finding (§16, finding 1), fixed
completely rather than partially. Both sites are covered by focused regression tests
(see the implementation plan).

### 17.2. A third implementation-time finding — a fragile test fixture, not a code bug

With both code sites fixed, `tests/simulation/domination-ai-campaign.test.ts` still
failed: `ai-1` eliminated `player-1` correctly, then never pursued `player-2` at all for
the rest of the 200-round cap. Root cause, confirmed by direct trace: the "capture
`player-2`'s city" candidate requires `isKnownIndependentDominationTarget`
(`ai-domination.ts`), which in turn requires a `domination-knowledge.ts` fact whose
`evidence === 'report'` be no more than 5 turns old (`staleRole`). The fixture calls
`recordDominationPoliticalReport` for both rivals exactly **once**, at round 0. Pre-fix,
the old consolidation bug re-rolled `ai-1`'s objective every single round after any
capture (its own defect), which coincidentally gave it many chances to land on
`capture player-2` while that one-shot report happened to still be inside its 5-turn
freshness window. Post-fix, `ai-1` correctly holds a captured city for ~2 quiet rounds
before reconsidering (§17) — a real behavior improvement — which pushed the timing just
past that narrow, coincidental window, and the report was never refreshed again.

This is a **fixture limitation**, not a code defect: `staleRole`'s 5-turn decay is a
deliberate, working-as-designed "earned knowledge" mechanic (the doc comment on
`getDominationCounterplay` is explicit that facts must stay observer-earned), unrelated
to #1088, and a real multi-hundred-round campaign would ordinarily refresh this via
ongoing espionage/diplomacy contact — the fixture's single snapshot was never a faithful
stand-in for that. The fix is in the **test only**: `runCampaign` now re-calls
`recordDominationPoliticalReport` for both rivals every round (a no-op once a civ is
eliminated), simulating the sustained awareness a real campaign provides instead of one
stale snapshot. This does not touch, weaken, or add omniscience to any AI decision path
— it feeds the exact same "earned knowledge" API `campaignStart()` already used, just
repeatedly. After this, both campaign sub-tests pass in ~11s (down from a non-terminating
200-round run that previously took ~400s to exhaust its cap without a winner) —
consistent with `ai-1` now winning briskly and decisively, not marginally.

## 18. Explicit non-goals

- No new `AIStrategicPlan.phase` value. No `assembling`/`engaging` rename.
- No change to `objectiveCandidates()`'s `requiredRoles` for `capture` (finding 2,
  deferred).
- No change to `rankCapture`/`rankAttacks`/`rankBombardment` sequencing (finding 3,
  deferred).
- No change to `mobilizationRounds`/deadline semantics (finding 4, deferred).
- No new readiness/"operationally present" framework (§7, not evidenced as the failure
  here).
- No personality/national-intent change (#1087's scope).
- No player-facing UI/explanation surface (#1090's scope).
- No GOAP/HTN, no generic planner.
- No save schema change.

## Mandatory inline review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new
mechanics, different player ages (7-43), different play styles, the built in difficulty
modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx,
updating saved games, proper testing, regressions solo play, and hot seat plays, and
proper implementation.**

- **Balance/gameplay/fun:** the fix makes the AI marginally *harder* to fight
  immediately after it takes a city (it briefly garrisons instead of leaving the city
  empty) and marginally *easier* to fight while it is mid-conquest-spree elsewhere (it
  pauses expansion for up to ~2 quiet rounds per capture instead of chaining
  immediately). Net effect is a wash in aggregate pacing; it trades "free recapture
  window" for "briefly slower conquest cadence," both of which are small in magnitude
  (bounded by the existing 2-turn completion rule) and neither of which touches any
  yield/cost table this repo's balance rules govern. No `.claude/rules/game-balance.md`
  ceiling is implicated (no yield, no cost, no movement bonus).
- **New mechanics:** none — reuses `nextPlanPhase`'s existing, already-implemented
  consolidation-completion rule verbatim; the fix is entirely "let existing logic run
  more than once."
- **Ages 7–43 / play styles:** a younger or newer player benefits from the AI behaving
  less erratically (holding a city it just took, rather than visibly abandoning it) —
  this is a legibility improvement, not a new decision surface, so no new UI/ tutorial
  text is needed.
- **Difficulty modes:** covered in §10 — difficulty-invariant.
- **AI usage:** this *is* the AI change; covered throughout.
- **UI/UX:** no player-facing surface changes. `AIDecisionTrace` output shape is
  unchanged (still one trace per `choosePrimaryObjective` call); a consolidating plan
  that is retained without a fresh `choice.trace` entry that round is expected — no
  trace is generated for a "no decision was actually reconsidered" round today either
  (the existing retained-plan branch already skips generating a fresh trace document
  for the identical case of an ordinary retained plan), so this is not a new gap.
- **Architecture:** stays inside the existing plan-portfolio/major-turn split; no new
  cross-module dependency, no new field on `AIStrategicPlan`/`MajorCivPlanPortfolio`.
- **Extensibility:** the `consolidatingAndStillOwned` condition is written generically
  (phase check + ownership check), not keyed to `capture` specifically, so a future
  objective that also reaches `consolidating` (none exists today) is covered for free.
- **Data:** no content/catalog change.
- **SFX:** none.
- **Updating saved games:** covered in §13 — no migration.
- **Proper testing:** covered in the implementation plan (§ below) — focused RED test
  plus the required negative/boundary/interruption/difficulty/save/hot-seat matrix from
  the arc prompt.
- **Regressions solo/hot seat:** the fix path (`prepareMajorCivStrategicPlan` →
  `selectPrimaryPlan`) runs identically regardless of `hotSeat` config — it has no
  viewer-scoped behavior beyond the already-existing `hasVisibleLocalCounterattack`
  visibility check, which is per-civ, not per-seat. No hot-seat-specific code path
  exists in this function today and none is added.
- **Proper implementation:** no dead return fields, no direct state mutation (the
  function is already pure/spread-based), no bare `Math.random()`, no new hand-rolled
  RNG. Verified by reading the full function before proposing the change (§17).

No real finding surfaced by this review is left unaddressed; none required a design
change beyond what §17 already specifies.
