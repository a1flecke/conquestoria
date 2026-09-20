# #1127 — Science-Starvation Research Bonus: Design

## Root cause (measured, not assumed)

In `lh-veteran-medium` at round 130, all 4 AI civs are stuck at Era 1 with 6-10 of 30
era-1 techs completed, zero science buildings anywhere, and 1 science/city/turn
(`ai-2`: 4 science/turn across 4 cities). `writing` (prerequisite `fire`, unlocks
`library`: +3 science) is the obvious fix and is never researched by 3 of 4 civs in
130 rounds.

Called `planAIResearch` directly with each civ's real round-130 state (script:
`tests/simulation/_tmp_1127_scoring.test.ts`, scratch, not committed): `writing`
does not appear anywhere in the top-12 scored candidates for **any** civ.

Computed `writing`'s exact scores directly (script:
`tests/simulation/_tmp_1127_writing_score.test.ts`, scratch, not committed), using
`ai-2`'s real completed-tech set and `sciencePerTurn=4`:

| Quantity | Value |
|---|---|
| `fire.cost` + `writing.cost` (path cost) | 20 + 55 = 75 |
| `estimatedResearchTurns` (`ceil(75/4)`) | 19 |
| `economicSupport` (library's science=3, weighted ×1.25) | 3.75 |
| **preliminary score** (`militaryPowerSpike + economicSupport + eraProgress + roleCount`) | **4.75** |
| **final score** (`economicSupport×2 + personalityWeight + eraProgress + unlockBreadth − turns×0.75`) | **≈ −3.75** (identical across all 4 personality traits tested — `writing`'s track carries no personality weight for any of them) |

The observed round-130 trace showed `ai-2`'s 12th-place (last shown) final score at
**−48.5**. `writing`'s computed final score (−3.75) is *far above* that — if it had
reached final scoring, it would have placed comfortably inside the top 12. It didn't,
which pins the failure to a specific stage: **`writing` is being eliminated at the
preliminary top-24 search cut, before final scoring ever runs on it.**

`planAIResearch` computes two independent candidate lists — `descendantsWithinLimit`
(per-frontier BFS) and `convergentTargets` (multi-prerequisite convergence) — sorts
their union by a cheap `preliminary` score, and slices to the top 24 before spending
the full scoring formula on any of them. `preliminary` has no research-time penalty
and no personality/unlock-breadth term, so a tech unlocking even one mediocre unit
(`militaryPowerSpike` + `roleCount` both contribute) trivially outscores `writing`'s
4.75. With dozens of era-1 unit-unlocking techs across the frontier, `writing`
never survives to be scored at all.

## Existing precedent: `unrestReliefTechBonus` (#919 MR2)

`ai-research.ts` already solves the identical structural problem for a different
resource: a tech that relieves empire unrest can lose the preliminary cut the same
way, so `unrestReliefTechBonus` is added at **three** points — `descendantsWithinLimit`,
`convergentTargets`, and the final score — gated on `pressuredReliefCityCount >= 2`,
scaling `+1.5`/city, capped at 18. No equivalent exists for science (or gold,
or production) starvation. This is the shape to mirror.

## Design: `scienceStarvationTechBonus`

**Signature:** `scienceStarvationTechBonus(capabilities: AITechCapabilities, scienceDeficientCityCount: number): number`

Unlike `unrestReliefTechBonus`, this does **not** need to re-derive which buildings a
tech unlocks — `evaluateAITechCapabilities` already aggregates `buildingYieldValue.science`
across every building the tech newly enables (including via
`evaluateProductionPrerequisites`-style multi-tech gating), and `capabilities` is
already in scope at both preliminary-cut call sites and in final scoring. Reusing it
means the bonus automatically covers any *future* tech that unlocks a science
building (university, observatory, …) with zero extra wiring — it is not keyed to
`writing`/`library` specifically.

```ts
const SCIENCE_STARVATION_TECH_AI_BASE_BONUS = 6;
const SCIENCE_STARVATION_TECH_AI_PER_CITY = 1.5;
const SCIENCE_STARVATION_TECH_AI_BONUS_CAP = 18;
const SCIENCE_STARVATION_CITY_GATE = 1;

function scienceStarvationTechBonus(
  capabilities: AITechCapabilities,
  scienceDeficientCityCount: number,
): number {
  if ((capabilities.buildingYieldValue.science ?? 0) <= 0) return 0;
  if (scienceDeficientCityCount < SCIENCE_STARVATION_CITY_GATE) return 0;
  return Math.min(
    SCIENCE_STARVATION_TECH_AI_BONUS_CAP,
    SCIENCE_STARVATION_TECH_AI_BASE_BONUS
      + SCIENCE_STARVATION_TECH_AI_PER_CITY * scienceDeficientCityCount,
  );
}
```

**Magnitude:** identical constants to `unrestReliefTechBonus` (BASE 6, PER_CITY 1.5,
CAP 18) — deliberately not invented fresh. Applying it to `writing` for a civ with,
say, 4 science-deficient cities: preliminary 4.75 → 16.75, final −3.75 → 8.25. That's
a large jump from "never scored" to "comfortably competitive," using a magnitude
already reviewed and balance-accepted for the same two-stage-cut problem. Sizing is
verified empirically after implementation (Stage 5), not just asserted here — if the
real round-130 replay still doesn't pick a science tech, the constants get revisited
with the new evidence, not guessed again.

**Gate = 1 city, not 2 (deliberately different from unrest's gate):** unrest's gate
of 2 exists because a single mildly-pressured city is normal background noise in a
multi-city empire. Science starvation is different — a 1-city civ (common in early
game, and exactly the stuck civs observed) can *only ever* have "1 or more"
science-deficient cities; a gate of 2 would never fire for it. Using 1 also matches
the observed bug precisely: the failure is total absence of science infrastructure,
not a gradual pressure that only matters once it's widespread.

**Detection — `scienceDeficientCityCount`:** number of the civ's cities with zero
buildings whose `yields.science > 0`. Building-presence (not live yield) is the
signal, matching the existing unrest convention of keying off structural
building/tech state rather than a fluctuating derived number. Computed once in
`applyAIResearch` (the real caller) from live `state.cities`/`BUILDINGS`, passed
through the context exactly like `pressuredReliefCityIdsByBuildingId`:

```ts
const scienceDeficientCityCount = civ.cities.filter(cityId => {
  const city = state.cities[cityId];
  return !!city && !city.buildings.some(id => (BUILDINGS[id]?.yields.science ?? 0) > 0);
}).length;
```

**Threading:** add `scienceDeficientCityCount?: number` to `AIResearchPlanningContext`
(default 0, mirroring `pressuredReliefCityCount?`); add the same parameter to
`descendantsWithinLimit` and `convergentTargets`; add
`scienceStarvationTechBonus: number` to `AIResearchScoreComponents`; add it to the
final score sum; add `'science-starvation'` to `reasonCodes` when nonzero — all
following `unrestReliefTechBonus`'s exact wiring pattern line-for-line.

## Non-goals

- **Not generalizing to gold/production starvation in this change.** No evidence has
  been gathered for those (this investigation only measured science). A generic
  `yieldStarvationTechBonus` is a plausible future refactor once a second concrete
  case is measured, not before — inventing it now would be sizing three magnitudes
  off one measured data point.
- **Not touching `ai-production.ts`.** The original issue framing (before root-causing)
  assumed a production-candidate bug; the actual defect is entirely in research
  scoring. Production candidate generation is untouched.
- **Not adding a wonder/policy science-yield check.** Only buildings are checked, per
  `evaluateAITechCapabilities`'s existing `buildingYieldValue` scope — consistent
  with what the rest of that function already measures.

## Design Review (Stage 2 — self-critique)

1. **Could this cause AI civs to over-prioritize science over defense?** No —
   `activePlanFit`/`modernizationFit` (weighted ×3/×4) still dominate for any tech
   that fills an active force demand; this bonus only ever nudges a
   science-building-unlocking tech, and only while cities genuinely lack one. It
   decays to 0 automatically as libraries get built — no persistent skew.
2. **Difficulty/personality parity?** The detection reads only `city.buildings`,
   with no challenge-profile input — automatically difficulty-invariant, matching
   `.claude/rules/game-balance.md`'s "Difficulty policy" convention (tiers tune
   quantities/timing, never eligibility). Personality still applies its own
   `personalityTrackWeight` on top, unchanged.
3. **Determinism?** Pure function of already-live `GameState` (city buildings,
   completed techs) — no RNG, no ordering dependency. Safe.
2. **Save compatibility?** No new persisted field — `scienceDeficientCityCount` is
   computed fresh inside `applyAIResearch` every time a new research target is
   chosen (which itself only happens when `!currentResearch`) and never written
   back to `GameState`. No migration, no `SAVE_VERSION` bump, matching
   `great-general-content.md`'s "adding X requires no save migration" pattern for
   the same reason: pure derived signal, not new state.
5. **Interaction with `unrestReliefTechBonus` on the same tech?** Additive, same as
   every other independent scoring term already stacking in the formula (a tech
   that happens to satisfy both conditions gets both bonuses) — no special-casing
   needed, no double-counting risk since the two gates measure unrelated things.
6. **Could the flat CAP=18 be insufficient for a wide empire with many
   science-deficient cities?** No — capped identically to the reviewed unrest
   precedent regardless of city count, so it cannot run away.
7. **Why not gate on live science *yield* instead of building presence?** Yield is
   noisier (affected by unrest, trade routes, etc. in later eras) and building
   presence is what the existing `UNREST_RELIEF_SOURCES` convention already keys
   on — kept consistent rather than introducing a second detection style.
8. **Residual risk accepted:** the exact BASE/PER_CITY/CAP magnitude is carried over
   from a bonus solving a structurally similar but not identical problem. This is a
   deliberate, documented choice (reuse a reviewed magnitude vs. invent a new one
   from a single measurement), verified empirically post-implementation rather than
   trusted blindly — see the plan doc's verification step.
