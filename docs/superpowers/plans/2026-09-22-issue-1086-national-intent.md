# #1086 — Persistent National Intent / Strategic Posture (Implementation Plan)

See design doc: `docs/superpowers/specs/2026-09-22-issue-1086-national-intent-design.md`.

**Base SHA:** `d5870a04ef14ed5be263d61cfb28e920629bc42a`.

## Files touched

- `src/core/types.ts` — `NationalIntent`, `NationalIntentReason`, `NationalIntentState`
  types; `OpponentAIState.nationalIntentByCiv`; `AIDecisionTrace.decision` gains
  `'intent'`.
- `src/core/opponent-ai-state.ts` — `createEmptyOpponentAIState` defaults
  `nationalIntentByCiv: {}`; `normalizeOpponentAIState` gains a normalization loop
  mirroring the `majorCivs` loop; a `normalizeNationalIntentState` helper.
- `src/ai/ai-national-intent.ts` (new) — `resolveNationalIntent`, `scoreIntents`,
  `isShocked`, `NATIONAL_INTENT_POSTURE`, `initialIntentState`, constants from design §3.
- `src/ai/ai-prepared-turn.ts` — `prepareMajorCivStrategicPlan` calls
  `resolveNationalIntent`; threads `posture` into `objectiveCandidates`;
  `PreparedMajorCivPlan` gains `nationalIntent: NationalIntentState`; the intent trace is
  appended to `traces`.
- `src/ai/ai-personality.ts` — `weightProductionRoles` gains a `posture` parameter.
- `src/ai/ai-round-scheduler.ts` — `writePreparedPortfolios` (or a sibling write-back)
  commits `nationalIntentByCiv[civId]`.
- `tests/ai/ai-national-intent.test.ts` (new) — the evaluator's own unit tests.
- `tests/core/opponent-ai-state.test.ts` — normalization tests for the new field.
- `tests/ai/ai-prepared-turn.test.ts` — integration tests (candidate bonus, trace,
  posture threading).
- `tests/ai/ai-personality.test.ts` — `weightProductionRoles` posture-weighting tests.
- `tests/simulation/long-horizon/campaign-sample.ts` — add `nationalIntent` (current
  civ's intent) to `CampaignCivSample` for observability (design §12 non-goal list does
  not defer this — the acceptance criteria explicitly require it).
- `tests/storage/save-manager.test.ts` or `new-game-completeness.test.ts` — predates-the-
  field save/reload proof.

## TDD order

1. **State/normalization RED tests first** — `nationalIntentByCiv` round-trips through
   `normalizeOpponentAIState`, defaults for a pre-#1086 save, rejects malformed entries
   (unknown `current` value, non-finite turns), scopes to AI-only living majors exactly
   like `majorCivs`.
2. **Evaluator unit tests** (`ai-national-intent.test.ts`), against the not-yet-written
   `resolveNationalIntent` — hysteresis boundary, shock entry/continuation/exit,
   personality bias without override, Domination non-duplication, hidden-information
   invariance, determinism, save/reload.
3. Implement `ai-national-intent.ts` until (2) is green.
4. **Integration RED tests** — `objectiveCandidates` posture bonus applied/not-double-
   counted with `doctrine.captureValueBonus`; `weightProductionRoles` posture weighting;
   `prepareMajorCivStrategicPlan` writes `nationalIntent` into the prepared result and an
   `'intent'` trace; `ai-round-scheduler.ts` commits it into
   `state.opponentAI.nationalIntentByCiv`.
5. Wire `ai-prepared-turn.ts`/`ai-personality.ts`/`ai-round-scheduler.ts` until (4) is
   green.
6. Long-horizon observability: add `nationalIntent` to `CampaignCivSample`; no new
   detector unless the long-horizon run below surfaces a genuine new gap (design
   non-goal: do not invent a detector without evidence).

## Test cases (minimum)

**State/normalization**
1. New game / fresh `createEmptyOpponentAIState()` has `nationalIntentByCiv: {}`.
2. A pre-#1086 save (no `nationalIntentByCiv` key at all) normalizes to `{}` without
   error; one processed round populates every living AI major's entry.
3. A malformed entry (`current: 'invalid-intent'`, non-finite `selectedTurn`) normalizes
   away (civ gets a fresh initial state, not a crash).
4. A human civ's id is never present in `nationalIntentByCiv`, mirroring `majorCivs`.
5. An eliminated civ's entry is scrubbed on the next normalization pass (extend
   `ELIMINATED_CIV_AREAS`/`assertEliminatedCivHasNoLiveEntities` coverage — this is a new
   `GameState`-reachable field, so `tests/helpers/eliminated-civ-areas.ts`'s exhaustive
   `Record<keyof GameState, EliminatedCivArea>` pattern requires classifying
   `nationalIntentByCiv`... note: it lives on `OpponentAIState`, not top-level
   `GameState`, so check whether that compile-enforced map is keyed by top-level
   `GameState` fields only (in which case `opponentAI`'s own existing classification
   already covers it structurally) or whether `OpponentAIState`'s own sub-fields need
   separate coverage (matching how `pressureByCiv`/`majorCivs` are already handled) —
   resolve this against the actual file before writing the test, not by assumption.
6. Save/reload round trip: run N rounds, save, load, run M more rounds; result matches an
   uninterrupted N+M run via `assertSimulationEquivalent`.

**Hysteresis**
7. Small score fluctuation within the hold window does not switch intent (construct two
   turns where naive re-scoring would flip, assert retention).
8. A sustained, large enough evidence change past `reconsiderAfterTurn` does switch,
   crossing `NATIONAL_INTENT_SWITCH_MARGIN` exactly (boundary test: margin - 1 retains,
   margin + 1 switches).
9. No oscillation over a short deterministic multi-round sequence with noisy-but-not-
   decisive perception changes.

**Shock**
10. Normal ambition (e.g. `expand`) → sudden `perception.ownCities.length === 0` (still
    alive via settler) → `recover`, `shockActive: true`, bypasses hysteresis even mid-hold.
11. Sudden last-city `captureRisk >= SHOCK_CAPTURE_RISK_THRESHOLD` → `recover`.
12. Recovery persists while danger persists (`shockFreeStreak` resets on any shocked
    round).
13. Exit back to ordinary reselection only after `NATIONAL_INTENT_RECOVERY_STABLE_TURNS`
    consecutive shock-free rounds — one shock-free round alone does not exit.
14. Personality cannot suppress shock entry (an aggressive/`dominate`-committed civ still
    enters `recover` on a genuine shock).

**Personality minimum**
15. Same perceived world, two different personalities can select different intents
    (aggressive favors `dominate` when `doctrine.pursuit` is true and margins allow;
    trader favors `develop`).
16. Personality does not override world evidence: a strongly-evidenced `expand` (large
    soft-cap headroom) still wins for a `trader` personality despite no trader-specific
    `expand` bonus, proving the bias is additive, not scripted.

**Domination integration**
17. `dominate` intent only reachable when `doctrine.pursuit` is true (or scores far
    below other intents otherwise); `captureValueBonus` and posture's `captureBias` both
    appear in a capture candidate's `strategicValue` exactly once each — assert the exact
    numeric sum, not just "greater than baseline," to catch accidental double-counting.
18. Domination counterplay (`getDominationCounterplay`) remains reachable/unaffected by
    intent — a `develop`-intent civ under domination threat still gets its counterplay
    force demand (that path does not route through intent at all, confirm it still fires).

**Hidden information**
19. Two states identical from the actor's perspective but differing in unseen enemy
    production/troop composition produce byte-identical `NationalIntentState`.

**Plan interaction**
20. Intent never appears as a unit-commanding action — `resolveNationalIntent`'s return
    type has no unit/action field; a grep-level assertion or type-level proof suffices
    alongside the functional tests.
21. Active emergency defense (a `defend` `MajorCivPlanPortfolio` entry) is unaffected by
    intent — `assignUnitsToPortfolio`'s existing defense-first ordering is untouched;
    confirm via an existing-suite regression, not a new mechanism.

**Long-horizon**
22. Run the full 9-scenario matrix (or the individual-scenario fallback if the wrapper
    stalls, per `.claude/rules/hooks-and-tooling.md`'s documented precedent) — zero new
    `known-campaign-gaps.ts` findings, no intent thrashing (bounded transition count per
    scenario, mirroring `assertNoRunaway`'s own posture-change-rate pattern from the
    minor-civ economy suite), `nationalIntent` visibly populated and varying across civs
    in the artifact.

## Verification commands

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/core/opponent-ai-state.ts src/ai/ai-national-intent.ts src/ai/ai-prepared-turn.ts src/ai/ai-personality.ts src/ai/ai-round-scheduler.ts
bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-national-intent.test.ts tests/core/opponent-ai-state.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-personality.test.ts tests/ai/ai-domination.test.ts tests/ai/ai-round-scheduler.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/simulation/ai-playability.test.ts
bash scripts/run-with-mise.sh yarn test --run tests/perf/algorithmic-budgets.test.ts
bash scripts/run-with-mise.sh yarn build
bash scripts/run-with-mise.sh yarn test:ai-playability:durable
bash scripts/run-with-mise.sh yarn test:ai-playability:durable:status
bash scripts/run-with-mise.sh yarn test:ai-long:durable
bash scripts/run-with-mise.sh yarn test:ai-long:durable:status
bash scripts/run-with-mise.sh yarn test:durable
bash scripts/run-with-mise.sh yarn test:durable:status
```

## MR slicing

Single MR, evidence-permitting: every piece (state, evaluator, both consumer seams,
traces, long-horizon observability) is required for the acceptance criteria to be
meaningfully testable at all — a state-only slice with no live evaluator, or an evaluator
with no live consumer, would both be exactly the "scaffolding the live game does not use"
pattern the arc prompt forbids. If implementation reveals a genuinely safe internal
split (e.g. state+evaluator+traces in one PR, the two consumer seams in a second), only
split if each resulting PR independently satisfies "every intent has an observable
downstream behavioral effect" — otherwise keep it as one PR.

## MR boundaries

Out of scope (design doc §12): diplomacy integration, `weightTechChoice`/research
integration, `trade`/`influence` intents, any player-facing UI, #1087's deeper
personality work, #1089/#1090/#1133.
