# #1124 — Mobilization Deadline Semantics (Design)

**Status:** design, ready for implementation.
**Base SHA:** `7ba691d59761315d085b4ec1331cda2123cf661e` (`origin/main`). #1124 is open,
no comments, no open PR or branch collision (re-checked at design time).

## 1. The question

`nextPlanPhase`'s `mobilizing → advancing` gate (`src/ai/ai-major-turn.ts:768`):

```ts
&& (hasRequiredRoles(after, plan, assignedUnitIds) || deadlineReached)
```

where `deadlineReached = after.turn - plan.createdTurn >= profile.mobilizationRounds`
(`OPPONENT_CHALLENGE_PROFILES[resolveOpponentChallenge(after)]`).

Per #1088 §5/§16 finding 4, this branch was flagged unexercised — the only traced
fixture had `requiredRoles` satisfied immediately, so `deadlineReached` never fired. #1122
subsequently made `requiredRoles` a real counted capability contract (contested/hardened
capture targets can require `{ frontline: 2, capture: 1 }`, i.e. two distinct units, not
one). The question this MR answers: **is `deadlineReached` a bounded "stop waiting for
perfection" rule, or does it (for some or all challenge tiers) collapse into "ignore your
own force requirements entirely"?**

## 2. Reproduction — reading `OPPONENT_CHALLENGE_PROFILES`

```
explorer: mobilizationRounds: 2
standard: mobilizationRounds: 1
veteran:  mobilizationRounds: 0
```

`mobilizationRounds` has exactly one consumer in the whole codebase: this one
`deadlineReached` computation (`grep -rn mobilizationRounds src/` — confirmed, no other
call site). Nothing else reads it.

`createPlan` (`ai-plan-portfolio.ts:123-148`) sets `phase: 'mobilizing'` and
`createdTurn: context.turn` **directly** — every plan is born already in `mobilizing`,
with `createdTurn` equal to the current round. Assignment
(`assignUnitsToPortfolio`/`ai-round-scheduler.ts`) runs earlier in the same round's
pipeline, before `processMajorCivStrategicTurn` executes actions and calls
`nextPlanPhase(after, ...)`. So the very first time `nextPlanPhase` evaluates a
newly-created plan, `after.turn - plan.createdTurn === 0` — the plan has had **zero**
elapsed rounds to assemble a force, not one.

For **veteran** (`mobilizationRounds: 0`): `deadlineReached = 0 >= 0` = **true on that
very first check**. Every subsequent round it stays true (turn only advances). So for
veteran, `hasRequiredRoles(...) || deadlineReached` is `true` unconditionally, from the
moment a plan exists, on every round, for every objective. `hasRequiredRoles` becomes
**dead code for veteran, permanently** — not "eventually bypassed after some wait," but
never a live gate in the first place.

For **explorer** (`2`) and **standard** (`1`): on the creation round,
`0 >= 2` and `0 >= 1` are both false. The deadline only fires after 2 (explorer) or 1
(standard) full rounds have genuinely elapsed since the plan was created — a real,
bounded grace window, exactly the healthy "wait a little, then proceed with best-available
force" shape.

### Confirmed via `nextPlanPhase` unit tests (see implementation plan)

Directly calling `nextPlanPhase` with `plan.phase = 'mobilizing'`,
`requiredRoles: { frontline: 2, capture: 1 }` (the #1122 contested/hardened shape),
exactly one frontline/capture-capable unit assigned (`hasCaptureOrFrontline` true,
`hasRequiredRoles` false — `frontline` available is 1, desired is 2), and
`createdTurn === turn` (0 elapsed rounds):

| Challenge | `deadlineReached` at 0 elapsed rounds | Result on current `main` |
|---|---|---|
| explorer | `0 >= 2` = false | stays `mobilizing` (correct: real wait) |
| standard | `0 >= 1` = false | stays `mobilizing` (correct: real wait) |
| veteran  | `0 >= 0` = **true** | **advances to `advancing`** — same round the plan was created, with half the demanded frontline force |

This is deterministic and reproduces on every run, every objective that reaches
`mobilizing` (the formula is objective-agnostic), every scenario. It is the sharpest
possible version of "ignore your own force requirements": veteran never gets even the one
round Standard gets.

## 3. Root cause, stated precisely

`mobilizationRounds: 0` for veteran is not obviously wrong in isolation — it follows the
same pattern as every other "eagerness/delay" knob on `OpponentChallengeProfile`
(`crisisResponseDelayTurns: 0`, `seededSuboptimalChance: 0`, `tacticalTopK: 1`, all
monotonically most-decisive-at-veteran). Read as "veteran's AI doesn't dawdle," `0` looks
intentional and consistent.

The defect is arithmetic, not a balance-table typo: `after.turn - plan.createdTurn >=
profile.mobilizationRounds` treats "0 rounds of grace" as "the deadline is satisfied with
zero elapsed time," which makes the deadline provide **no bound at all** — a deadline that
is always-already-reached is not a deadline, it is an unconditional override switch. Before
#1122, this was mostly inert: `requiredRoles` was always `{ frontline: 1, capture: 1 }`,
trivially satisfied by the single generic combat unit `hasCaptureOrFrontline` already
requires as a floor, so `hasRequiredRoles` and the post-bypass floor produced the same
outcome almost always. #1122 introduced the first case where they diverge
(`{ frontline: 2, capture: 1 }` for contested/hardened targets, requiring **two** distinct
units) — exactly the change the arc prompt names as "unlocking" this question.

**First causal layer:** the deadline comparison's boundary condition, applied to a
challenge tier whose configured grace period is exactly zero, degenerates into "no grace
period exists," collapsing the intended two-branch OR into a permanent, unconditional
`true` for that tier.

## 4. Failure classification

Per the arc's own taxonomy: veteran's behavior is an **unhealthy bypass**, not a healthy
relaxation. It is not "advances with no capture capability" (the unaffected
`hasCaptureOrFrontline` floor still requires at least one real combat unit) — it is closer
to "no meaningful discipline is ever applied to counted, multi-unit critical requirements,"
which the arc's own difficulty guidance explicitly rejects: *"Veteran may wait for stronger
readiness"* is the intended axis, and current behavior is its exact inverse — veteran is
structurally the **least** disciplined tier for any plan whose `requiredRoles` needs more
than one distinct unit in a single role, on every round, unconditionally.

Explorer and standard are **healthy**: once their real (2- or 1-round) grace period
elapses, the plan is allowed to proceed with whatever `hasCaptureOrFrontline`-qualifying
force it has assembled — one meaningful combat unit is not "essentially zero force," and
this matches the "imperfect but still viable" standard. This MR does not change what the
deadline relaxes *to* (§6) — only that a genuine, non-zero wait must occur first, for every
tier, before it can apply.

## 5. Impossible-role / permanent-wait guard — unaffected, verified unaffected

This MR does not touch: `hasCaptureOrFrontline` (the always-required floor), #1122's
incomplete-plan retention logic (`ai-plan-portfolio.ts`'s owned-city-trainability check,
which already declines to retain a plan whose missing critical role can never be produced
anywhere the civ owns), or any upstream production/replenishment demand. A role that is
genuinely impossible to produce is already handled upstream of this gate by #1122's
retention contract — a plan that can never assemble a legal force is discarded (or never
created) before it would sit waiting at this deadline check at all. Nothing here changes
that; the fix below cannot introduce a new permanent-wait failure because it only *removes*
a same-round bypass, never adds a new blocking condition.

## 6. Chosen fix

Change the boundary condition so that a deadline requires **strictly more than**
`mobilizationRounds` full rounds to have elapsed, not `>=`:

```ts
const deadlineReached = after.turn - plan.createdTurn > profile.mobilizationRounds;
```

This is a one-line change to the comparison operator, not a change to any value in
`OPPONENT_CHALLENGE_PROFILES`. It is explicitly **not** "lengthen `mobilizationRounds`" (the
arc's own listed invalid pattern) — no balance number changes, and the fix is not scoped to
veteran or to capture plans; it corrects what "N rounds of grace" means for every tier and
every objective that reaches `mobilizing`, uniformly. Effect:

| Challenge | Old effective grace (rounds before override possible) | New effective grace |
|---|---:|---:|
| explorer | 2 | 3 |
| standard | 1 | 2 |
| veteran  | 0 (none — immediate) | 1 |

Explorer and standard each gain exactly one additional round of genuine grace (a bounded,
uniform shift — not a difficulty-specific tuning decision); veteran gains its **first ever**
real grace round. Relative ordering (explorer waits longest, veteran shortest) is
unchanged — veteran remains the most decisive tier, it simply is no longer the *zero*-th
percentile of "no deadline at all."

**Rejected alternative 1 — bump `veteran.mobilizationRounds` from 0 to 1.** Produces an
identical practical effect for veteran, but is exactly the pattern the arc's non-goals
explicitly reject ("lengthen `mobilizationRounds` and call that the fix") and treats a
correctness defect (an inclusive boundary that degenerates at zero) as if it were a balance
retune. It also does nothing for the underlying `>=`-at-zero class of bug should a future
profile or difficulty knob reuse the same pattern.

**Rejected alternative 2 — relax `hasRequiredRoles` to a fractional "minimum viable force"
instead of the full `hasCaptureOrFrontline` floor.** Investigated and rejected: for every
shape #1122 currently produces (`{capture:1}`, `{frontline:2,capture:1}`, plus an optional
support role), a proportional reduction (e.g. "at least half of each required count,
floored at 1") arithmetically collapses to the *same* floor `hasCaptureOrFrontline` already
enforces (`ceil(2/2)=1`), so it would change nothing for the demonstrated failure while
adding real complexity (a second counted-role predicate) with no evidenced benefit. It also
risks *weakening* the single-count case (`capture:1` reduced by any formula that isn't
floor-1-exactly would satisfy nothing), which is a strictly worse floor than what exists
today. Not pursued.

**Rejected alternative 3 — challenge-specific readiness floors (a separate "minimum force"
table per tier).** No evidence in this trace justifies a new data table; the one-line
operator fix fully resolves the demonstrated defect without new state or new balance
surface area. Available for a future MR if a *different* evidenced gap needs it.

## 7. Difficulty behavior after the fix

- Explorer: still advances soonest of the three tiers relative to the others, at a
  genuinely bounded, non-zero wait (3 rounds instead of 2 — see table above).
- Standard: moderate, 2 rounds instead of 1.
- Veteran: now has an actual, if short (1 round), grace window before the deadline can
  override counted requirements — no tier is ever cheated of at least one real round to
  assemble before the deadline can be invoked. No tier gets different legality/combat
  rules; no tier reads hidden information; the fix touches only the elapsed-round
  comparison.
- `hasCaptureOrFrontline`'s always-on floor is untouched for every tier: no plan for any
  objective can ever advance out of `mobilizing` with zero real combat/capture capability,
  regardless of the deadline.

## 8. Affected objective types

`deadlineReached` and the comparison it feeds are objective-agnostic in current code (the
`mobilizing → advancing` gate applies to every objective that reaches that phase; only the
`hasCaptureOrFrontline` term is conditionally skipped for `expand`). The fix is applied at
the single shared computation site, so every objective that can be `mobilizing`
(`capture`, `defend`, `repel`, `secure-resource`, `support-ally`, `expand`, `raid`) is
covered identically — no objective-specific branch is added or needed.

## 9. Plan lifecycle interactions

- **`createdTurn`**: read, unchanged — still the plan-creation round.
- **`lastProgressTurn`**: unrelated to this gate; governs the separate
  `consolidating → complete` transition and `currentPlanIsValid`'s stalled check.
  Untouched.
- **`reconsiderAfterTurn` / `expiresAfterTurn`**: independent safety valves in
  `currentPlanIsValid` (`ai-plan-portfolio.ts`) — a plan stuck waiting past this MR's
  slightly-longer grace window is still bounded by those, unchanged. A plan that never
  gets required roles and never reaches `expiresAfterTurn` will simply advance one round
  later than before at each tier; it cannot wait "forever" as a result of this change,
  since the underlying expiry/reconsideration machinery is untouched.
- **`mobilizationRounds`**: unchanged values; only how the elapsed-round comparison reads
  them changes.
- **Save normalization**: `AIStrategicPlan.createdTurn` and `.requiredRoles` are already
  persisted, unchanged shape — no new field, no migration, no `SAVE_VERSION` bump.
- **Long-horizon plan-stuck detectors**: `known-campaign-gaps.ts`'s wedged-plan detection
  operates on `lastProgressTurn`/posture-change cadence, not on this specific comparison;
  a plan advancing one round later than before cannot itself register as a new "stuck"
  finding (it still progresses, just slightly later) — verified by running the AI-long
  suite (see implementation plan).

## 10. Save/determinism implications

`nextPlanPhase` is a pure function of already-serializable state
(`after.turn`, `plan.createdTurn`, the challenge profile lookup) — no new field, no RNG
draw, no `Date.now()`. A save/reload exactly at the (now one-round-later) deadline boundary
continues through unchanged normalization and re-evaluates identically, since the function
is stateless per call and reads only persisted fields.

## 11. Performance implications

Comparison-operator change only (`>=` to `>`); no new loop, allocation, or lookup. No
measurable effect on `tests/perf/algorithmic-budgets.test.ts`'s `aiRound` budget expected;
will be confirmed by running it, not assumed.

## 12. Explicit non-goals

- No change to any `OPPONENT_CHALLENGE_PROFILES` value.
- No change to `hasRequiredRoles`, `hasCaptureOrFrontline`, or the counted-role helper
  (`countAIStrategicRoleCapabilities`/`canUnitFulfillAIStrategicRole`) — #1122's contract
  is untouched.
- No change to `supportRoles` semantics — remains optional, never readiness-critical.
- `#1123` tactical engagement-order sequencing — untouched, unblocked by this MR per the
  arc's own ordering requirement (solve readiness/deadline first).
- No new `AIStrategicPlan` field, no save migration.
- No change to `rankCapture`/`rankAttacks`/combat odds.
- No change to `#1133`'s verification/orchestration tooling.
- No objective-specific branch — the fix is generic across every objective that reaches
  `mobilizing`.

## Mandatory inline review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new
mechanics, different player ages (7-43), different play styles, the built in difficulty
modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx,
updating saved games, proper testing, regressions solo play, and hot seat plays, and
proper implementation.**

- **Balance/gameplay/fun:** veteran AI now waits one genuine round before committing an
  under-strength force to a contested/hardened capture target, instead of zero. This makes
  veteran's offense marginally more disciplined (a small increase in perceived competence,
  not a nerf to its aggression cadence — it still remains the fastest-to-commit tier of the
  three). Explorer/standard shift by the same uniform +1 round, preserving relative
  ordering. No yield, cost, or movement-bonus table is touched, so no
  `.claude/rules/game-balance.md` ceiling is implicated.
- **New mechanics:** none — a boundary-condition fix to existing, already-shipped logic.
- **Ages 7-43 / play styles:** a veteran opponent that no longer commits half-strength
  attacks with zero hesitation reads as slightly more "thoughtful," which benefits
  legibility for all ages; no new UI/tutorial surface is needed since the change is not
  player-facing text or a new control.
- **Difficulty modes:** covered in §7 — bounded, uniform, ordering-preserving.
- **AI usage:** this *is* the AI change; covered throughout.
- **UI/UX:** no player-facing surface changes. No new trace shape;
  `AIDecisionTrace`/`choosePrimaryObjective` output is unaffected — this fix lives entirely
  inside `nextPlanPhase`, downstream of any trace generation.
- **Architecture:** stays inside `ai-major-turn.ts`'s existing `nextPlanPhase`; no new
  cross-module dependency, no new field on `AIStrategicPlan`/`MajorCivPlanPortfolio`, no new
  helper.
- **Extensibility:** the fix corrects the comparison for every current and future
  `OpponentChallengeProfile` value, including a value of `0` for any future difficulty
  tier or knob reusing this pattern — it does not special-case veteran.
- **Data:** no content/catalog change.
- **SFX:** none.
- **Updating saved games:** covered in §10 — no migration, no new field.
- **Proper testing:** covered in the implementation plan — RED reproduction (veteran,
  0 elapsed rounds, under-strength force, currently advances; after the fix, stays
  `mobilizing`), controls for explorer/standard at their now-shifted boundaries, a
  fully-ready-force control (advances immediately regardless of tier), an
  impossible/zero-capability control (never advances regardless of deadline), and a
  save/reload round-trip determinism check.
- **Regressions solo/hot seat:** `nextPlanPhase` has no `hotSeat`-dependent branch today
  and gains none — the fix does not add or remove any viewer-scoped read.
- **Proper implementation:** no dead return fields, no direct state mutation (function is
  already pure), no new RNG, no hidden-information read. Verified by reading the full
  function and every real caller before proposing the change.

No real finding surfaced by this review is left unaddressed; none required a design change
beyond §6.
