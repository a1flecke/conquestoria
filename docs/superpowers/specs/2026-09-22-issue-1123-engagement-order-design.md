# #1123 — Engagement Order / Support-Before-Capture (Design)

**Status:** design, ready for implementation.
**Base SHA:** `3667930f4acafaa77bc91a392443fe35ab2a7cdb` (`origin/main`, post-#1124 merge).
#1123 is open, no comments, no open PR or branch collision (re-checked at design time).

## 1. The issue's premise, and where it turned out to be stale

#1123 hypothesized that `rankCapture` scores a legal capture purely by `winProbability *
600` with no "wait for support" gate, so a lone capture-capable unit would **expose
itself too eagerly** — attempting a risky assault before a genuinely useful siege/ranged
teammate could soften the target first.

Per `.claude/rules/spec-fidelity.md`'s "Specs Can Be Stale About Current Code": before
implementing that literal hypothesis, I traced the real mixed-force pipeline
(perception → #1122 counted force → assignment → tactical ranking) with an actual siege
unit assigned alongside a capture unit, against a contested target (`#1122`'s own
shape: `{frontline:2, capture:1}`, or here the minimal reproduction, one capture-capable
unit at moderate — well under 70% — odds). **The literal hypothesis does not reproduce.**
What reproduces instead is the *opposite* failure, and it is more severe:

**A capture-capable unit's own `rankAttacks` city-target branch already offers it a
non-capturing `bombard-city` alternative against the exact city it could otherwise
capture — and `rankBombardment`'s no-follow-up baseline score (`380 + hpLoss*2`, here
measured at 416) can exceed that same unit's own `capture-city` score (`winProbability *
600`, here measured at 224 for ~37% odds) even when literally no other unit benefits from
the chip damage.** The unit never exposes itself early; it never captures at all. It
"attacks" the city — dealing damage, ending its turn, capturing nothing — turn after
turn, for as long as its own capture odds stay below roughly 69% (`416/600`), regardless
of whether a real support unit exists anywhere in the force.

## 2. Reproduction

`tests/ai/ai-tactics.test.ts`'s pre-fix scratch trace (reused as the permanent regression
below), reduced to the minimal case — **no siege unit needed at all**:

```
makeState('veteran')
+ swordsman ('captor') adjacent to a hostile, ungarrisoned, population-20 city
  (the #1122 "contested" shape — moderate odds, no defending unit needed to produce it)
+ plan.objective = 'capture', plan.target = that city, assignedUnitIds = ['captor']
```

`rankUnitTacticalActions(context, 'captor')` on unmodified `main`:

| Candidate | Score |
|---|---:|
| `bombard-city` | **416** |
| `capture-city` | 224 |
| `hold` | 0 |

`chooseUnitTacticalAction` picks `bombard-city`. The legal, adjacent, fully-eligible
capture is never attempted — not "delayed until support arrives," simply never chosen,
because nothing in the scoring distinguishes "this chip damage helps a *different*
follow-up unit" (the case `rankBombardment`'s doc comment describes and #974 tuned for)
from "this chip damage helps nobody, including myself, since I could just capture
outright instead."

Adding a genuine siege unit (`catapult`, in range, not itself capture-capable) to the
same fixture does not change this: the capture unit's own bombard-vs-capture
self-competition is independent of whether real support exists. This is the sharper,
more general form of the bug — #1122's counted contested/hardened requirement made
sub-70%-odds captures common for the first time (previously, per #1088's own trace,
`{frontline:1,capture:1}` was only ever demonstrated against undefended, near-certain
targets), and every one of them hits this self-competition once a capture-capable unit's
own odds drop below the bombard baseline.

## 3. Root cause, stated precisely

`rankAttacks`'s city-target branch (`ai-tactics.ts`) offers `bombard-city` to **any** unit
that can attack a city as a target — with no check for whether that same unit could
instead legally capture that same city right now. `rankBombardment`'s baseline value
(computed when `bestGain === 0`, i.e. no other capture-capable unit benefits) exists to
give a genuine siege/ranged/naval hull — one that structurally **cannot** capture — a
non-zero standalone attrition value (per its own doc comment: "a fleet with no landing
force is exactly the case the pre-#974 naval-only scoring already served"). That baseline
was never intended to compete against the *same* unit's own capture option, because before
#1122 a capture-capable unit's own win probability was essentially always high enough
(near-undefended targets only) that this never mattered in practice.

**First causal layer:** `rankAttacks` and `rankCapture` independently rank the same
(unit, city) pair with no shared "can this unit capture this city right now" predicate —
so a unit's own bombard-city and capture-city candidates compete on scores calibrated for
two different populations (genuine non-capturing support vs. the capturer itself), and
nothing prevents the former from winning for the latter.

## 4. Chosen fix

Factor the exact legality `rankCapture` already checks (role, `hasActed`,
`movementPointsLeft`, visibility, adjacency, an unoccupied city tile, movement
reachability) into a shared predicate, `canCaptureCityNow(context, unit, city)`. Use it
in two places:

1. **`rankCapture`** calls it before scoring (behavior-preserving refactor — the exact
   same conditions, same order, same early-return shape, now shared instead of
   duplicated).
2. **`rankAttacks`**'s city-target branch skips `rankBombardment` (does not push a
   `bombard-city` candidate at all) for a `(unit, city)` pair where
   `canCaptureCityNow(context, unit, city)` is true. A city this unit cannot (yet)
   capture — not adjacent, garrisoned, `hasActed`, or simply a *different* hostile city
   than the one it can reach — is completely unaffected; that unit keeps its full
   bombard-city candidate for that target exactly as before.

This is the smallest change at the earliest seam: it does not add a new mechanism, a new
phase, a new field, or any explicit "wait" logic. It removes exactly the one candidate
that was never a real choice for a unit that could simply capture instead, and lets the
existing greedy `chooseTacticalSequence` loop (already fully able to interleave a
bombardment and a same-turn follow-up capture — see §5) do the rest.

**Rejected alternative 1 — inflate `rankCapture`'s score instead.** Would have to
guess a magic offset large enough to beat `rankBombardment`'s baseline in every case,
duplicating `rankBombardment`'s own formula's magnitude reasoning in a second place and
risking making an unfavorable capture look more attractive than it is (a real safety
regression — `.claude/rules/game-balance.md`'s "no magic thresholds without documented
semantic meaning" concern). The chosen fix needs no such number: it removes a candidate
rather than reweighting one.

**Rejected alternative 2 — an explicit "wait for support" phase/gate.** Investigated and
rejected: it would need new state (what counts as "support," a readiness/timeout window,
a deadlock guard for dead/absent support — exactly the risks the arc prompt's Failure
Taxonomy F warns about) to solve a problem that, once the real mixed-force pipeline was
traced, turned out not to require any waiting at all. `chooseTacticalSequence`'s existing
greedy per-iteration re-ranking (§5) already produces bombard-then-capture in the same
turn whenever a genuine support unit's bombard score is highest; nothing needs to
explicitly wait for anything.

**Rejected alternative 3 — restrict `rankBombardment`'s follow-up search instead.** The
`bestGain` calculation (finding another unit that benefits) was already correct and is
untouched; the bug is that the *baseline* (used when no such unit exists) still competes
against the bombarding unit's own capture option, which `bestGain`'s exclusion of
`candidate.id === unit.id` does not address — that exclusion only ever stopped double-
counting the *bonus*, not the base value. Fixing this inside `rankBombardment` would
require it to know about `rankCapture`'s legality, inverting the natural dependency;
gating at the call site (`rankAttacks`) is cleaner.

## 5. Why no explicit "wait for support" logic was needed

`chooseTacticalSequence` (unchanged by this fix) already:

1. Computes every remaining assigned unit's best-ranked action against the **current**
   scratch state (not the turn's starting snapshot).
2. Picks the single globally-highest-scoring action across **all** remaining units this
   iteration (mandatory first, then score, then a deterministic id tie-break).
3. Applies it to the scratch state (`applyPredictedAction` — a real, if predicted,
   state transition, not a simulation shortcut) and repeats.

So when a genuine siege unit's `bombard-city` score (correctly boosted by `bestGain` from
a real capture-capable teammate) exceeds that teammate's own (still-legal, still-offered)
`capture-city` score, the siege unit's action is picked **first** in the greedy loop —
purely because it scores higher, not because of any new gate. The next iteration then
re-ranks the capture unit against the **post-bombardment** scratch state, where its
`capture-city` score has risen (verified directly in the regression below, by comparing
against the real output of `resolveUnitCityBombardment`, not an approximated HP delta).
This is exactly the "bombard then successful same-turn capture" outcome the arc prompt
asks whether the architecture can represent — it already could; the missing piece was
only that the capture unit's own turn was being hijacked by a phantom self-directed
bombard option before it ever got a fair comparison.

## 6. Same-turn sequencing questions, answered with evidence

1. **Can support bombard then capture in the same AI turn today?** Yes — `chooseTacticalSequence`
   already supports this structurally (§5); confirmed directly in the mixed-force
   regression test.
2. **Does unit iteration order decide whether this happens?** No — there is no fixed
   iteration order; the loop is globally greedy by score each round. Order is an emergent
   property of the scores, not a separate mechanism to fix.
3. **Does capture see fresh post-bombard state when processed later?** Yes, confirmed —
   the regression compares the actual `capture-city` score against the state before and
   after a real `resolveUnitCityBombardment` call, proving the improvement is real, not
   assumed.
4. **Can support be deterministically processed after capture today?** Only when its own
   score is genuinely lower than the capture's — e.g. the "already-favorable capture"
   control, where a near-certain capture correctly executes without waiting for an
   unnecessary bombardment. This is correct, not a bug: per the arc's own guidance, "if
   immediate capture is already clearly safe, fast conquest can be healthy."
5. **Is action ranking global or independently per unit?** Global-greedy across all
   remaining assigned units each iteration (unchanged, pre-existing).
6. **Is there an existing seam to prioritize support against the operation target?** Yes —
   the existing score comparison itself, once the phantom option is removed.
7. **Would support-first ordering interfere with emergency defense/mandatory actions?**
   No — `rankWithdrawals`' mandatory actions are computed and sorted ahead of everything
   else in `chooseRankedAction`/`sortRanked` (`mandatory` always wins), untouched by this
   fix.
8. **Can bombardment improve odds but still leave capture unsafe?** Yes, and this fix does
   not force a capture in that case — `rankCapture`'s own low-odds-still-offered
   convention (#522) is untouched; a still-bad capture simply stays a low-scoring
   candidate exactly as before, and other actions (rest, retreat, hold) can still win on
   their own merits.
9. **Can bombardment remove the final blocker and make immediate capture correct?** Yes —
   this is exactly the mixed-force regression's outcome.
10. **Does an exposed city still get captured without pointless waiting?** Yes — the
    "already-favorable capture" control proves a near-certain capture is never deferred.

## 7. Support-readiness definition

Not needed. This fix introduces no concept of "support readiness," no timeout, and no
waiting — so none of the failure modes that concept would need to guard against (dead,
distant, illegal, diverted, or never-built support blocking a capture) can occur, because
nothing ever blocks. A capture-capable unit's own `capture-city` candidate is present on
every round it is legal, exactly as before; the only change is that a phantom, self-
defeating alternative no longer outranks it when nothing else is around to benefit.

## 8. Difficulty behavior

`canCaptureCityNow` and the `rankAttacks` gate it feeds read no challenge-profile value —
difficulty-invariant by construction. Confirmed by a regression running the identical
fixture across Explorer/Standard/Veteran and asserting identical suppression.

## 9. Emergency-defense interaction

Untouched. `assignUnitsToPortfolio`'s prioritization of `defensePlansByCityId` over
`primaryPlan` (`.claude/rules/game-balance.md`'s domain, `ai-unit-assignment.ts`) happens
upstream of tactical ranking and is not read or modified by this fix.

## 10. Save/determinism implications

`canCaptureCityNow`, the modified `rankAttacks`/`rankCapture`, and `chooseTacticalSequence`
remain pure functions of already-persisted state — no new `AIStrategicPlan` field, no
save migration, no RNG draw. Pinned by a save/reload round-trip regression and a
repeated-call determinism regression.

## 11. Performance implications

`canCaptureCityNow` duplicates the same cost `rankCapture` already paid on every call
(`getAttackTargets`, `buildUnitOccupancy`, `movementRange`) — no new algorithmic class,
only an additional call at the `rankAttacks` city-target branch, bounded by the (typically
very small, usually 0 or 1) number of "city" entries in that unit's own `getAttackTargets`
result. `tests/perf/algorithmic-budgets.test.ts`'s 17 assertions pass unchanged.

## 12. Explicit non-goals

- No #1122 force-sizing/production change.
- No #1124 readiness/deadline change (already merged — this MR is entirely downstream of
  it, no interaction).
- No new phase, no new `AIStrategicPlan` field.
- No combat-odds/`calculateCityAssaultStrengths` rewrite.
- No change to human-executed combat/city-interaction paths (`resolveCityInteraction`
  and its player-facing legality are untouched; this fix lives entirely in AI tactical
  ranking).
- No GOAP/HTN, no generic planner, no combinatorial attack search.
- No change to `rankBombardment`'s `bestGain` calculation for a genuine support unit.
- No #1133 tooling change.

## Mandatory inline review

**perform an INLINE review across these dimensions about balancing gameplay, fun, new
mechanics, different player ages (7-43), different play styles, the built in difficulty
modes, how computer players will use it, ui, ux, architecture, extensibility, data, sfx,
updating saved games, proper testing, regressions solo play, and hot seat plays, and
proper implementation.**

- **Balance/gameplay/fun:** the AI now actually attempts contested/hardened captures it
  was previously structurally avoiding in favor of endless chip-damage attacks — this
  makes the AI meaningfully *more* competent/threatening at conquest once it has
  moderate-odds forces, which is squarely #1088's own goal ("military operations
  competence"), not a new mechanic or a yield/cost change. No `.claude/rules/game-balance.md`
  ceiling is implicated.
- **New mechanics:** none — removes one erroneous candidate; adds no new action kind, no
  new `AITacticalAction` variant, no new scoring formula.
- **Ages 7-43 / play styles:** the AI actually finishing sieges it starts (rather than
  looping "attack" forever) is a legibility improvement for every age — a player watching
  an AI army sit outside their city indefinitely, attacking without ever capturing, reads
  as broken regardless of age.
- **Difficulty modes:** covered in §8 — difficulty-invariant.
- **AI usage:** this *is* the AI change; covered throughout.
- **UI/UX:** no player-facing surface changes. No new `AITacticalAction` kind, so no
  renderer/notification wiring is needed.
- **Architecture:** stays inside `ai-tactics.ts`; `canCaptureCityNow` is a pure
  refactor-and-share of `rankCapture`'s existing legality, not a new cross-module
  dependency.
- **Extensibility:** `canCaptureCityNow` is written generically (any unit, any city
  pair), so any future action that also needs "can this unit capture this city right
  now" can reuse it instead of re-deriving the legality a third time.
- **Data:** no content/catalog change.
- **SFX:** none.
- **Updating saved games:** covered in §10 — no migration, no new field.
- **Proper testing:** 8 new regression tests (RED reproduction, healthy-opportunistic-
  capture control, mixed-force bombard-then-capture with a real post-bombard odds check,
  genuine-siege-unaffected control, different-city-unaffected control, difficulty
  invariance, determinism, save/reload).
- **Regressions solo/hot seat:** no `hotSeat`-dependent branch existed before or is added
  now — `ai-tactics.ts` has no viewer-scoped behavior beyond what already existed
  (visibility checks, unchanged).
- **Proper implementation:** no dead return fields, no direct state mutation (the
  functions are already pure/spread-based via `structuredClone` in
  `chooseTacticalSequence`, unchanged), no `Math.random()`, no new hand-rolled RNG.
  Verified by reading every real caller of `rankCapture`/`rankAttacks`/
  `chooseTacticalSequence` before proposing the change.

No real finding surfaced by this review is left unaddressed; none required a design
change beyond §4.
