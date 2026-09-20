# #1127 — Science-Starvation Research Bonus: Implementation Plan

Design: `docs/superpowers/specs/2026-09-19-issue-1127-science-starvation-tech-bonus.md`

## Files touched

- `src/ai/ai-research.ts` — the bonus function, context field, threading, scoring.
- `src/ai/ai-tech-evaluation.ts` — no change (reusing existing `buildingYieldValue`).
- `tests/ai/ai-research.test.ts` — new tests mirroring the existing `#919 MR2` block.
- `tests/simulation/_tmp_1127_scoring.test.ts`, `_tmp_1127_writing_score.test.ts` —
  delete (scratch diagnostics, not committed).

## Step-by-step (TDD: failing tests first)

1. **Write failing unit tests** in `tests/ai/ai-research.test.ts`, adjacent to the
   `#919 MR2` block (~line 208), covering:
   - Gate: `scienceDeficientCityCount: 0` → `scienceStarvationTechBonus` is 0, a
     plain non-science-building tech wins the tie (mirrors `relief(0)`/`relief(1)`
     pattern above, but gate is 1 here, so only need to test 0 vs 1).
   - At gate (`scienceDeficientCityCount: 1`): bonus > 0 and the
     library-unlocking tech wins over an equal-unlock-breadth non-science tie.
   - Scaling: bonus at `scienceDeficientCityCount: 8` > bonus at `1`; caps at 18
     (test `100` clamps to the same value as `12`, matching the unrest test's
     clamp-proof pattern).
   - `reasonCodes` contains `'science-starvation'` when the bonus is nonzero, and
     does not when `scienceDeficientCityCount: 0`.
   - A tech with **no** science-yielding building unlock gets 0 bonus regardless of
     `scienceDeficientCityCount` (proves the gate checks `buildingYieldValue.science`,
     not just city count) — use two techs, one unlocking `library`-equivalent
     (`unlocksBuildings: ['library']`), one unlocking a non-science building
     (`unlocksBuildings: ['monument']`), assert only the science one gets the bonus.
   - Preliminary-cut survival: reproduce the actual bug shape — a
     `descendantsWithinLimit` search with 24+ unit-unlocking sibling techs plus one
     `writing`-shaped tech unlocking only a science building; assert the science
     tech is **absent** from `trace.candidates` with `scienceDeficientCityCount: 0`
     and **present** with it set high enough — this is the direct regression test
     for the root cause (preliminary-cut elimination), not just final-score
     ordering. Reuse the "bounds search to four edges and twenty-four downstream
     targets" test's tech-generation pattern (~line 368) as the base, but give the
     `node-N` siblings a unit unlock (so they have nonzero preliminary via
     `militaryPowerSpike`/`roleCount`) and add one more sibling tech unlocking only
     a science building.
2. **Run the new tests — confirm they fail** (the context field doesn't exist yet,
   `TypeError` or compile error is expected/acceptable as the "red" state).
3. **Implement in `src/ai/ai-research.ts`:**
   - Add `scienceDeficientCityCount?: number` to `AIResearchPlanningContext`
     (JSDoc comment matching `pressuredReliefCityCount?`'s style).
   - Add `scienceStarvationTechBonus: number` to `AIResearchScoreComponents`.
   - Add the four constants and the `scienceStarvationTechBonus` function
     (exact code in the design doc), placed directly after
     `unrestReliefTechBonus`, with a comment explaining the preliminary+final
     dual-application rationale (same as unrest's existing comment, adapted).
   - Import `BUILDINGS` from `@/systems/city-system` (already imports
     `TRAINABLE_UNITS, civHasCoastalCity` from there).
   - `descendantsWithinLimit` and `convergentTargets`: add a
     `scienceDeficientCityCount: number` parameter each; add
     `+ scienceStarvationTechBonus(capabilities, scienceDeficientCityCount)` to
     each function's `preliminary` computation (capabilities is already computed
     in both call sites).
   - `planAIResearch`: read `context.scienceDeficientCityCount ?? 0` once near
     where `reliefCityIdsByBuildingId` is resolved; pass it into both
     `descendantsWithinLimit` and `convergentTargets` calls; compute
     `scienceStarvationTechBonus(capabilities, scienceDeficientCityCount)` in the
     `evaluated` map alongside `unrestReliefTechBonus`; add it to
     `scoreComponents`; add it to the final `score` sum; add `'science-starvation'`
     to `reasonCodes` when `> 0`.
   - `applyAIResearch`: compute `scienceDeficientCityCount` from live
     `civ.cities`/`state.cities`/`BUILDINGS` (code in design doc) right next to the
     existing `pressuredReliefCityIdsByBuildingId` computation; pass it into the
     `planAIResearch(...)` call.
4. **Run the new tests — confirm they pass** ("green").
5. **Empirical verification against the real regression** — re-run (temporarily,
   not committed) `tests/simulation/_tmp_1127_scoring.test.ts` against
   `lh-veteran-medium` round 130 to confirm at least one previously-stuck civ now
   selects `writing` (or another science-building tech) as `downstreamTargetTechId`,
   or that `writing` at minimum now appears in `trace.candidates`. If it still
   doesn't, this is the checkpoint to revisit BASE/PER_CITY/CAP with the new
   evidence — not to ship unverified.
6. **Regression suite:**
   - `bash scripts/run-with-mise.sh yarn test` (full local suite incl. hook smoke
     tests).
   - `bash scripts/run-with-mise.sh yarn build` (type-check).
   - Spot check `tests/ai/ai-research.test.ts` fully green, including the
     pre-existing `#919`/`#926`/`#927` blocks (proves the new parameter threading
     didn't shift unrest's own behavior — every existing call to
     `descendantsWithinLimit`/`convergentTargets` gains a new required parameter,
     so a missed call site is a compile error, not a silent behavior change).
   - Do **not** run `yarn test:ai-long` for this change per its own documented
     scope (`.claude/rules/ai-simulation.md`) — it materially affects AI research
     planning, so this is one of the changes that **should** get a long-horizon
     run before declaring complete. Run it in the background given its ~60-90 min
     wall-clock, and check `.verification/ai-long-horizon/lh-veteran-medium.json`
     for the `tech-frozen`/`production-idle` findings specifically.
7. **Clean up scratch files:** delete both `_tmp_1127_*.test.ts` diagnostic files.
8. **Update `known-campaign-gaps.ts`:** if the long-horizon run confirms
   `production-idle`'s `#1127` entry no longer reproduces on any scenario, remove
   the entry (per the two-way ratchet rule). If it still reproduces on some
   scenarios but is measurably reduced, leave the entry with an updated comment —
   do not silently loosen the detector.
9. **Update memory** (`project_issue_1127_production_idle.md`): mark the fix
   implemented, with the actual PR number once opened.
10. **Commit, push, open PR**, following this repo's established pattern (worktree
    policy already satisfied — working in `issue-1126-city-yields` worktree on a
    fresh branch; rebase-merge-with-admin-bypass per prior approved convention) —
    ask before merging.

## Plan Review (Stage 4 — self-critique)

1. **Is the "preliminary-cut survival" test (step 1, 5th bullet) actually
   necessary given the other tests?** Yes — every other test in the existing
   `#919` block only proves the bonus affects *final* ranking via `frontierTechId`.
   The actual #1127 bug is specifically a *preliminary*-cut elimination (per the
   measured data: final score would already have won without any bonus). A test
   suite that only checks final-score behavior could pass while leaving the real
   bug (preliminary elimination) unfixed if the implementation only added the term
   to the final score and forgot one of the two preliminary functions. This test
   is the one that would catch that specific mistake — keeping it is required, not
   optional.
2. **Risk: forgetting to thread the new parameter into one of the two preliminary
   functions.** Mitigated structurally — adding a required parameter to
   `descendantsWithinLimit`/`convergentTargets` makes every call site (both
   inside `ai-research.ts` and any test that calls them directly, though tests
   only call `planAIResearch`) a compile error until updated. `yarn build` (step 6)
   catches this even if a test doesn't.
3. **Is reusing `capabilities.buildingYieldValue.science` instead of re-deriving
   from `tech.unlocksBuildings` (like `unrestReliefTechBonus` does) a hidden
   behavioral gap?** Checked: `capabilities` already reflects buildings unlocked
   via multi-tech prerequisite chains (not just this tech's own
   `unlocksBuildings` array), which is *more* correct than unrest's simpler
   `tech.unlocksBuildings` check, not less. No gap — an improvement folded in for
   free by not re-deriving.
4. **Test 5 (preliminary-cut survival) reuses the "bounds search" test's
   tech-generation shape — is 24+ synthetic sibling techs going to be slow or
   flaky?** No — `planAIResearch` runs in-memory on a synthetic `Tech[]`, no
   scenario/simulation involved; the existing "bounds search" test with the same
   shape already runs near-instantly. Not a performance concern.
5. **Should step 5's empirical check block the PR if `writing` still isn't
   selected?** Yes, explicitly stated as a checkpoint — do not ship an unverified
   magnitude. If evidence at that step says the constants need adjusting, adjust
   and re-verify before moving to step 6, not after.
6. **Are steps 8/9 (known-gaps ratchet, memory update) essential to the fix, or
   scope creep?** Required by the codebase's own established rules
   (`ai-simulation.md`'s two-way ratchet is enforced by a test:
   `campaign-matrix.test.ts` fails if a gap that no longer reproduces isn't
   removed) — not optional cleanup, a correctness requirement of this specific
   codebase's conventions.
7. **Does this plan touch anything in the "no dead computed data" family (e.g.
   adding `scienceDeficientCityCount` without it being read)?** No — it's read in
   the same function it's computed in (`applyAIResearch` computes and passes it
   in the same statement block), same pattern as
   `pressuredReliefCityIdsByBuildingId`.
