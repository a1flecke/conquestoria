# Tech Research Pacing Design

**Date:** 2026-05-13
**Status:** Proposed
**Issue:** #133 - Pacing Issue - Tech still takes too long
**Depends on:** Current `main` as of 2026-05-13
**Goal:** Make early research feel active and fun by applying the existing production-style pacing model to tech costs, so first real unlocks complete in 8-12 baseline turns and 5-7 turns with early science investment.

---

## 1. Intent

Issue #133 is still reproducible because early research costs are not aligned with early science output. A one-city baseline game produces 1 science per turn, while Bronze Working costs 50 research. That creates a 50-turn wait for an early, player-visible unlock.

The root fix is not a one-off Bronze Working discount. The game already has the shape of a better balancing system for production: pacing bands, expected output profiles, actual costs, and metadata that describes complexity, payoff, and scope. Research should use the same approach.

This design makes tech cost recommendations explicit, auditable, and tied to fun turn windows. The actual `Tech.cost` values remain plain data, but they must be justified against a deterministic research pacing model.

## 2. Player Experience

The opening should give the player meaningful research payoffs at a steady clip.

Baseline target:

- A plain early one-city empire should complete the first real unlock tier in 8-12 turns.
- Bronze Working should complete in 9-11 turns in that baseline.
- Starter prerequisite techs should complete in 2-5 turns in the same baseline.

Science-investment target:

- If the player deliberately invests in early science, the same first real unlock tier should fall to 5-7 turns.
- Science investment can come from science buildings, science focus, idle production converted to science, civilization bonuses, or other existing systems.
- The target is not to make science mandatory for fun pacing. It should make an already acceptable baseline feel sharper.

Texture target:

- Broad first unlocks should be fast enough to be fun.
- Stronger, broader, or more snowballing techs may cost more than simpler peers.
- Niche or situational techs may cost less so they are not dead picks.
- No early first-unlock tech should take dozens of turns in baseline play.

Definition:

- A `starter prerequisite tech` is an Era 1 tech with no prerequisites whose explicit or resolved pacing band is `starter`.
- A `first real unlock` is an Era 1 or Era 2 tech with exactly one prerequisite, where that prerequisite is a starter prerequisite tech. Bronze Working qualifies because it requires Stone Weapons.
- The first-real-unlock audit set must be structural. Do not inspect unlock prose to decide whether a tech counts.

## 3. Architecture

### 3.1 Pacing Model

Extend `src/systems/pacing-model.ts` with research-specific helpers:

- `getResearchOutputProfileForEra(era)`
- `getResearchOutputProfileForTech(tech)`
- `getMetadataComplexityMultiplier(metadata, options?)`
- `getRecommendedTechCost(tech)`
- `getRecommendedTechTurnWindow(tech)`

The production helpers remain intact. Research gets its own output profile because empire science does not scale like one city's production. `getResearchOutputProfileForEra` is the general era fallback. `getResearchOutputProfileForTech` is the helper the tech audit and tech cost recommendations must call, because opening first-unlock techs need an availability-aware profile instead of a raw era profile.

### 3.2 Existing Metadata Becomes Real

`PacingMetadata` already includes:

- `band`
- `role`
- `impact`
- `scope`
- `snowball`
- `urgency`
- `situationality`
- `unlockBreadth`

These fields must affect recommended tech cost. They should no longer be treated as labels used only for grouping.

### 3.3 Tech Definitions Stay Data-Driven

`src/systems/tech-definitions.ts` remains the source of actual tech costs. The implementation should retune costs in that file after adding the recommendation helper.

The pacing model recommends costs; it does not dynamically override `Tech.cost` during gameplay.

### 3.4 Pacing Audit

Update `src/systems/pacing-audit.ts` so tech rows use the research pacing model:

- expected research output comes from `getResearchOutputProfileForTech`
- recommended tech cost comes from `getRecommendedTechCost`
- slow-outlier detection compares actual `Tech.cost` against the recommended turn window using the same profile
- tech rows expose enough information to distinguish `recommendedCost`, audit-profile ETA, and live one-city baseline ETA for opening techs

The audit must flag early techs like the current Bronze Working state as slow outliers.

## 4. Research Cost Model

The recommended cost formula is:

```text
recommendedCost =
  expectedResearchPerTurnForTech
  * targetTurns
  * metadataComplexityMultiplier
```

Where:

- `expectedResearchPerTurnForTech` comes from the availability-aware research output profile for the tech.
- `targetTurns` comes from `getRecommendedTechTurnWindow(tech)`, which uses availability tier before era for opening techs.
- `metadataComplexityMultiplier` adjusts the band target for payoff and complexity.

### 4.1 Research Output Profile

The opening profile must match real opening output, not an aspirational science economy. This matters because the actual tech panel and turn loop use live science per turn. If the model recommends Bronze Working from a 5 science/turn assumption while the baseline city produces 1 science/turn, the player still sees a long wait.

The implementation must use two related profiles:

| Profile | Research per turn | Used for | Intent |
|---|---:|---|
| `opening-baseline` | 1 | Starter prerequisites and first real unlocks | Plain one-city game with no special science investment |
| `opening-science-invested` | 2 | Verification only | Same opening with explicit early science investment |
| `era-2-established` | 4 | Era 2 techs outside the first-real-unlock tier | Early expansion and first science choices begin to matter |
| `era-3-established` | 7 | Era 3 general audit fallback | Mature early empire research |
| `era-4-established` | 10 | Era 4 general audit fallback | Mid-late empire research |
| `era-5-established` | 13 | Era 5 general audit fallback | Late-era research without runaway costs |

These are balancing assumptions for recommended costs and audit, not forced yields.

Rules:

- `getResearchOutputProfileForTech` must return `opening-baseline` for starter prerequisite techs and first real unlocks.
- `getResearchOutputProfileForEra` may return established-era profiles, but it must not be used directly for first real unlock tech recommendations.
- The science-invested profile is not used to set costs. It is used to verify that explicit science investment makes the same costs complete in 5-7 turns.
- Era 1 no-prerequisite techs whose pacing band is not `starter` do not automatically get the opening-baseline target. This preserves deliberate pacing for specialized root systems such as espionage if their metadata or resolved band marks them as more complex.

### 4.2 Band Windows

The current pacing bands remain valid, but research should interpret them with tech-specific expectations.

For this issue:

- `starter`: very quick prerequisites and onboarding techs
- `core`: ordinary first unlocks
- `specialist`: narrower or synergy-driven techs
- `infrastructure`: economic, city, or empire setup techs
- `power-spike`: strong capability jumps or broad unlock hubs
- `marquee`: capstones and late foundations

Era 1 first real unlocks should usually resolve to `core`, `specialist`, or low `power-spike` recommendations that still land inside the 8-12 baseline target unless metadata strongly justifies a longer wait.

Opening first real unlocks that are technically `era: 2`, such as Bronze Working, still use the opening first-unlock target for this issue. Their era value may still matter for tree structure and era progression, but it must not force them into an established Era 2 cost profile.

Opening turn windows:

| Availability tier | Target window |
|---|---:|
| Starter prerequisite tech | 2-5 turns |
| First real unlock | 8-12 turns |
| Bronze Working | 9-11 turns |

These opening windows override the generic era/band window when `getRecommendedTechTurnWindow(tech)` evaluates starter prerequisite techs or first real unlocks.

### 4.3 Complexity Multiplier

The multiplier should be bounded and legible. It should reward fun pacing more than simulated difficulty.

Required influences:

- `impact` above 1 raises cost; below 1 lowers it.
- `snowball` above 1 raises cost for accelerants.
- `unlockBreadth` above 1 raises cost for broad unlock hubs.
- `scope: empire` raises cost slightly compared with city or military scope.
- `urgency` above 1 lowers cost slightly because urgent basics should arrive sooner.
- `situationality` above 1 lowers cost slightly because niche techs should remain tempting.

The implementation must clamp the final multiplier to `0.75` through `1.35` so metadata combinations cannot create extreme costs.

If a tech has no explicit `pacing` metadata, the helper must use:

- `resolveTechPacingBand(tech)` for the band
- neutral metadata values of `1` for numeric factors
- `scope: empire` only when the tech unlocks empire-wide effects; otherwise default to `scope: military` for unit unlocks and `scope: city` for building unlocks when that can be inferred

If the implementation cannot infer scope confidently, it must use `scope: empire` as the conservative default. Missing metadata must never bypass the cost audit.

### 4.4 Human-Friendly Costs

Recommended costs should be rounded to readable values.

Rules:

- Costs below 20 should round to whole numbers.
- Costs from 20 through 49 should round to the nearest 5.
- Costs 50 and above should round to the nearest 5.
- Rounding must not push first-unlock techs outside the target turn window unless metadata justifies the exception.
- Actual `Tech.cost` values for opening baseline techs must be checked against live ETA, not only against rounded recommended cost.

## 5. Retuning Scope

The first implementation should retune tech costs enough to fix #133 broadly, without trying to solve the entire campaign in one pass.

Must retune:

- Era 1 starter prerequisite techs
- Era 1 first real unlocks after starter prerequisites
- Era 2 first unlocks that are reachable from one starter prerequisite, including Bronze Working

Must audit, but not necessarily retune in the first slice:

- deeper Era 2 cross-track techs
- Era 3-5 techs
- late-era scaffolding nodes
- espionage late-stage techs

Do not change:

- tech IDs
- prerequisites
- unlock behavior
- tech tree shape
- save format
- research queue semantics
- actual per-turn science generation rules unless the user explicitly approves a separate design that changes science yields

The first implementation must also preserve the existing player-visible ETA path. `src/ui/tech-panel.ts` and `src/systems/tech-progression.ts` should continue to calculate ETA from actual current science per turn and actual `Tech.cost`. The model and audit may recommend costs, but the UI must not display model-profile ETAs as if they were live game ETAs.

## 6. Acceptance Criteria

The design is satisfied when:

- A baseline one-city Bronze Working simulation completes in 9-11 turns.
- The same scenario with early science investment completes in 5-7 turns.
- Starter prerequisite techs complete in 2-5 turns in the baseline opening fixture.
- First real unlocks broadly avoid slow early outliers in the pacing audit.
- Every tech in the structural first-real-unlock audit set either completes in 8-12 baseline turns or has explicit pacing metadata and a test explaining why it is allowed outside that window.
- Stronger or broader unlocks remain slightly more expensive through metadata, not one-off exceptions.
- `pacing-audit` uses `getRecommendedTechCost` for tech recommended costs.
- Tech panel ETA remains based on live science per turn and shows the retuned Bronze Working ETA in the accepted baseline range.
- Tests prove the issue cannot regress by silently returning Bronze Working to a 50-turn baseline.

## 7. Testing Contract

Add or update tests in:

- `tests/systems/pacing-model.test.ts`
- `tests/systems/pacing-audit.test.ts`
- `tests/integration/pacing-simulation.test.ts`
- `tests/systems/tech-definitions.test.ts` if cost invariants are added there

Required coverage:

- `getResearchOutputProfileForEra` returns stable, clamped era profiles.
- `getResearchOutputProfileForTech` returns the opening baseline profile for starter prerequisite techs and first real unlocks, including Bronze Working.
- `getRecommendedTechTurnWindow` returns 2-5 for starter prerequisite techs, 8-12 for first real unlocks, and 9-11 for Bronze Working.
- `getMetadataComplexityMultiplier` raises cost for high impact, high snowball, and broad unlocks.
- `getMetadataComplexityMultiplier` lowers cost for urgent or situational techs.
- `getRecommendedTechCost` returns a readable cost inside the expected turn target.
- Bronze Working baseline one-city simulation completes in the accepted 9-11 turn range.
- A science-investment variant completes Bronze Working in the accepted 5-7 turn range.
- Early first-unlock tech audit rows have no slow outliers.
- The structural first-real-unlock helper includes spot checks such as Archery, Bronze Working, Writing, Wheel, Pottery, Animal Husbandry, Code of Laws, Cartography, Sailing, Domestication, Bone Setting, Mythology, Storytelling, Fishing, Smelting, Thatching, Smoke Signals, and Burial Rites.
- The structural first-real-unlock helper excludes deeper follow-ups such as Early Empire, because their prerequisite is not a starter prerequisite tech.
- The structural first-real-unlock helper excludes specialized roots and their children when the root is not `starter`, such as Lookouts if Espionage Scouting remains a non-starter root.
- A deliberately high-complexity tech can remain above the basic first-unlock target without failing the broad audit, as long as metadata explains it.
- Tech panel visible ETA for Bronze Working in the baseline fixture shows 9-11 turns.

The Bronze Working integration tests must use a fixed fixture rather than relying on map seed luck:

- one city owned by the player
- current research set to Bronze Working
- Stone Weapons already completed
- baseline fixture produces exactly 1 live science per turn
- science-invested fixture produces exactly 2 live science per turn through an existing mechanic such as idle production converted to science

If future yield changes alter those live science values, the tests must update the fixture to preserve the meaning of baseline and science-invested, not loosen the accepted turn ranges.

## 8. Implementation Boundaries

This is a balance-model and data-retune change. It should not redesign UI layout, change turn processing, or add hidden research multipliers.

Allowed:

- add pacing-model helpers
- update pacing-audit tech calculations
- retune selected tech costs
- add tech pacing metadata where missing
- add focused regression tests

Not allowed:

- multiply science during `processTurn`
- special-case Bronze Working in research processing
- hide real cost or ETA math from the UI
- display audit-profile ETAs in player-facing UI
- change tech prerequisites to make costs appear faster
- delete techs or collapse tracks

## 9. Implementation Notes

The implementation plan will pick exact numeric values for the first retune by running the new audit after the helper exists. Those values must still satisfy the acceptance criteria above.

The design-approved targets are:

- baseline first real unlocks: 8-12 turns
- Bronze Working baseline: 9-11 turns
- science-invested first real unlocks: 5-7 turns

If exact audit output suggests a small exception, the exception must be encoded through metadata and covered by a test.
