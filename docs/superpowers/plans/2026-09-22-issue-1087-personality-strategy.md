# #1087 — Personality Shapes Strategic Choices (Implementation Plan)

See design doc: `docs/superpowers/specs/2026-09-22-issue-1087-personality-strategy-design.md`.

**Status: implemented as one MR, all 9 TDD steps complete.** Two real bugs were caught and
fixed during the mandatory review pass beyond what this plan anticipated: a sign error in
`evaluateVassalage`'s threshold formula (subtracted instead of added the bias, inverting the
intended "recover civs vassalize more readily" behavior) and a directional bug in
`evaluateEmbargoResponse` (applied the same sign as `evaluateLeagueResponse`, but the two
functions have opposite relationships between diplomatic openness and their threshold — see
design doc §3's corrected entries). Both are covered by new regressions in
`tests/ai/ai-diplomacy.test.ts`.

## Files touched

- `src/ai/ai-national-intent.ts` — add 4 fields to `NationalIntentPosture` + 4 columns to
  `NATIONAL_INTENT_POSTURE`.
- `src/ai/ai-personality.ts` — `weightTechChoice` and `shouldDeclareWar` each gain a required
  `posture: NationalIntentPosture` parameter.
- `src/ai/ai-research.ts` — thread `posture` into its `weightTechChoice` call site (mirrors
  `ai-production.ts`'s existing `weightProductionRoles` wiring); `EvaluateResearchCandidateContext`
  (or whatever holds `personality`) gains `posture`.
- `src/ai/ai-diplomacy.ts` — `evaluateDiplomacy`, `evaluateMinorCivDiplomacy`,
  `evaluateEmbargoResponse`, `evaluateLeagueResponse`, `evaluateVassalage` each gain a required
  `posture: NationalIntentPosture` parameter; `evaluateVassalage`'s existing-but-unused `personality`
  parameter is removed (replaced by `posture`, which is what the function actually needs).
- `src/ai/basic-ai.ts` — every call site of the 5 functions above threads `posture` (computed once per
  civ turn from `newState.opponentAI?.nationalIntentByCiv[civId]?.current ?? 'develop'`, the same
  lookup pattern `ai-production.ts` already uses); `chooseAiMission` reads national intent to pick
  among the three existing preference-order arrays instead of a raw trait check.
- No `src/core/types.ts` change, no `src/storage/**` change — confirmed by design §4 (no persisted
  state added).

## TDD order (RED before implementation, one surface at a time)

1. **`NationalIntentPosture` new fields** — extend the type + table first (compiles, all-zero
   temporarily is not an option since TS requires every field on every row; write the real values
   from design §2 directly). Add a `tests/ai/ai-national-intent.test.ts` case asserting all 5 rows
   have the new fields with the documented values (guards against a future accidental edit going
   unnoticed, same convention as the existing table's own shape test).
2. **`weightTechChoice` + posture (research)** — RED: a test in `tests/ai/ai-personality.test.ts`
   calling `weightTechChoice(personality, tech, NATIONAL_INTENT_POSTURE.dominate)` for a military-track
   tech, asserting the result differs from `NATIONAL_INTENT_POSTURE.develop`'s result by exactly the
   `researchMilitaryTrackWeight` ratio applied only to the military-track component. Fails (function
   doesn't accept a 3rd param yet) → implement → green. Then update `ai-research.ts`'s call site +
   its own test fixtures (posture argument, recomputed expected `personalityTrackWeight`/final score).
3. **`shouldDeclareWar` + posture** — RED: a test asserting two calls, identical personality/relationship/
   advantage/turn, differing only in posture (`dominate` vs `develop`), produce different boolean
   outcomes at a war-score value chosen to sit exactly between the two effective thresholds. Implement
   → green. Update `ai-diplomacy.ts`'s `evaluateDiplomacy` call site + its tests.
4. **`evaluateDiplomacy`/`evaluateMinorCivDiplomacy`/`evaluateEmbargoResponse`/`evaluateLeagueResponse`
   + posture** — RED per function: personality held at exactly `diplomacyFocus = 0.4` (or the relevant
   trait threshold boundary), asserting the decision flips between `develop` posture (opens) and
   `dominate` posture (closes) at that exact boundary value — the sharpest possible proof the bias is
   live, not just present. Implement → green. Update `basic-ai.ts` call sites + existing tests.
5. **`evaluateVassalage` + posture (dead-parameter fix)** — RED: a test asserting vassalage is offered
   at `selfStrength.midpoint = 0.55 * bestStrength` under `recover` posture (bias makes 0.4→0.65
   threshold) but not under `develop` posture (still 0.4) — the same strength ratio, two different
   outcomes. This is a genuine new behavior (the parameter was previously dead), so it needs a fresh
   positive test, not just an updated existing one. Implement → green.
6. **`chooseAiMission` intent-aware selection** — RED: same personality (e.g. `traits: ['trader']`,
   which today always gets the diplomatic/economic order) under a `dominate` national intent selects
   the aggressive preference order instead; the same personality under `develop` intent keeps today's
   trait-based order unchanged (regression proving #4/#5's fixes did not silently change this surface
   too). Implement → green.
7. **Tactical-parity regression** — RED written first as a currently-passing assertion (it already
   holds; this step adds the pin, not a fix): two `basic-ai.ts` turns, same map/units/plan/challenge,
   differing only in civ personality (two different `civType`s with different `PersonalityTraits`),
   produce byte-identical `chooseTacticalSequence` output. Belongs in
   `tests/ai/ai-tactics.test.ts` or a new `tests/ai/ai-personality-tactical-parity.test.ts`.
8. **Recovery-competence regression** — reuse/extend #1086's own `recover`-intent fixture (a
   last-city-under-imminent-capture scenario) from `tests/ai/ai-national-intent.test.ts`; assert that
   running it through the reconciled `shouldDeclareWar`/`evaluateDiplomacy`/`evaluateVassalage`/
   `weightTechChoice` call sites never produces a *worse* outcome than the `develop`-posture baseline
   (never refuses a legal peace it would otherwise accept, never lowers military-tech weight, always
   at least as willing to vassalize).
9. **Save/determinism sanity** — run `tests/storage/save-persisted-shape-ratchet.test.ts` and
   `tests/app/simulation-determinism.test.ts` unmodified; expect both green with zero new entries
   (confirms design §4's "no persisted state" claim empirically, not just by inspection).

## Test cases (minimum, beyond the TDD list above)

- Every existing test file that calls one of the 6 reconciled functions directly gets its call site
  updated with an explicit posture argument (`NATIONAL_INTENT_POSTURE.develop` unless the test is
  specifically about posture) and its expected value recomputed per the design doc's corrected
  "Proper implementation" note (no silent old-value carryover).
- `basic-ai.test.ts` — at least one test per reconciled call site proving `basic-ai.ts` actually looks
  up the acting civ's current national intent (not a hardcoded `'develop'`) before calling the
  reconciled function — catches a wiring bug where the posture *type* is threaded correctly but the
  *value* is a hardcoded stand-in.
- Hidden-information regression: `NationalIntentPosture` values are derived only from
  `NationalIntentState.current`, itself derived from perception-safe input (#1086, unchanged) — no new
  test needed here since no new state is read, but confirm by re-running
  `tests/ai/ai-national-intent.test.ts`'s existing hidden-info-invariance case unmodified.

## Verification commands

```
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn vitest run tests/ai/ai-personality.test.ts tests/ai/ai-diplomacy.test.ts tests/ai/ai-national-intent.test.ts tests/ai/ai-research.test.ts tests/ai/basic-ai.test.ts
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:ai-playability:durable
```

Long-horizon (expect the wrapper's documented host-contention stall; fall back to the established
per-scenario playbook used 3x already this session if it stalls):

```
bash scripts/run-with-mise.sh yarn test:ai-long
# fallback, once, if the above stalls:
bash scripts/run-with-mise.sh yarn vitest run --config vitest.long-horizon.config.ts -t <seed>
# … for each of the 9 LONG_HORIZON_SCENARIOS seeds
```

Read every long-horizon `.verification/ai-long-horizon/<seed>.json` diff against `main`'s committed
values (if any are tracked) or at minimum confirm no new `known-campaign-gaps.ts`-worthy finding
appears, per `.claude/rules/ai-simulation.md`'s two-way ratchet.

## MR slicing

This is small and mechanically uniform enough (6 pure-function signature changes + 1 table extension +
1 selection-logic change, all additive, no new persisted state, no new UI) to ship as **one MR**,
unlike #1086 which had genuine phase boundaries (new module → integration → trace → verification). If
implementation reveals the tactical-parity or recovery-competence regressions (steps 7-8) require more
than pinning/reusing existing fixtures — i.e. if either invariant is found to be *violated* and needs
a real fix beyond this plan's scope — stop, do not silently expand scope, and re-plan a second MR for
the fix with its own RED reproduction, per the arc's TDD-before-any-fix requirement.

## MR boundaries

- In scope: the 7 reconciled surfaces (design §0/§3), the posture table extension, `chooseAiMission`'s
  intent-aware selector, and the 2 required regressions (tactical-parity, recovery-competence).
- Out of scope, explicitly: `chooseTech` dead-code removal (#4 in inventory — file a follow-up issue
  if not already tracked), `weightProductionChoice`/`chooseProduction`'s narrow fallback path (#3),
  `evaluateTreatyConsent`'s pure-leaf boundary (#12), any new player-facing UI (#1090), any new
  personality trait or national intent value, any GOAP/planner work, any new content.
