# Era 13 MR5: Complete Technology and Content Launch Implementation Plan

> **Art deviation (2026-07-19):** the launch catalog uses explicit temporary
> Era-13 mappings while bespoke, distinguishable SVG art is completed in
> [#652](https://github.com/a1flecke/conquestoria/issues/652). The mappings are
> deliberately catalog-driven and renderer-safe; #652 is the removal condition,
> including palette, motion, accessibility, and visual-QA coverage.

> **For agentic workers:** Execute inline, task-by-task, with checkbox tracking. Do not delegate.

**Goal:** Deliver the complete, player-visible Era 13 technology, building, project, and unit roster for #515 without creating a dead-end unlock, duplicate MR4 network contract, or hot-seat privacy leak.

**Architecture:** Era 13 is data-driven through the existing tech, city, unit, national-project, resource, AI, sprite, audio, storage, and MR4 NetworkPlan seams. Each vertical slice starts with a failing behavior test and only exposes content after its system effect, production path, AI use, viewer-safe presentation, and regression coverage are live. New persistence is added only if project choices or unit state cannot be represented in the existing serializable state.

**Tech Stack:** TypeScript, Vitest, Canvas/SVG sprite pipeline, DOM UI, existing SFX router, serialized GameState migrations.

---

## Verified drift record

- **Base:** `origin/main` at `22e176e067986ea9ec5f79fb9c3938d48553014b` (fetched 2026-07-19). The original local `main` was ahead and is intentionally not the base.
- **Prerequisites:** #512's merged MR2 history ends at `d5061e3e`; #514 is merged at the base through `22e176e0`. MR4's canonical `NetworkPlan`, `previewNetworkPlan`, validation, Capacity/Load selectors, posture/Surge lifecycle, canonical effect resolvers, AI planner, and network panel are present.
- **Schema:** base `CURRENT_SAVE_SCHEMA_VERSION` was 6. MR5 now owns ordered schema 7 for Circular Manufacturing material choices; it filters malformed/unbuilt choices and is idempotent on a second load.
- **Catalog at base:** 369 total technologies; Era 13 has one emerging science node (`quantum-computing`) across 15 tracks; no Era-13 building, national-project, or requested unit is currently present. Target is 30 Era-13 technologies, 12 buildings, 3 projects, and the five named units.
- **Measured pacing:** Era-13 production profile is 28/turn; research profile is 236/turn (maximal reference). After the live MR5 effects, the diagnostic five-city representative profile is 1220 science and 775 production total, or 243.9/155 per city. The Era-13 snapshot changed intentionally because all thirty techs and the new city effects now enter the actual yield seams; it is not a test-only adjustment. Core civilian/defensive items use 196 production (7 turns at the 28/turn profile), while marquee assets remain longer. Bounded/maximal science references are 114/236.
- **Overlap:** GitHub open-PR search and local branch/worktree/content-name search found no #515/MR5 roster overlap. Existing `issue-514-autonomy-network` is MR4 only.
- **Stale assumptions:** schema 3/5 in older prose is stale (additive implementation drift); the supplied base SHA is correct for `origin/main` but not the local checkout (harmless checkout drift); the local pre-worktree checkout lacked MR4 documents (harmless path/base drift). No contract-changing difference found.

## Cross-cutting implementation review

Every task must meet these review decisions:

- **Balance and fun:** drones are coordination tools, not raw-stat supremacy; Combat Drone and Autonomous Frigate movement never exceed 7; Exosuit remains below Tank strength; each advantage has an efficient non-network counter; mixed forces beat equal-production drone-only forces.
- **Ages and play styles:** default copy states outcome and counter in plain language; details can expose formulas. Build, Research, Trade, Defend, Influence, Explore, and Conquer each retain a useful, optional route. Ignoring Network/Hold remains valid.
- **Difficulty and AI:** Explorer/Standard/Veteran share content, effects, resources, Capacity, and visibility. Only bounded deterministic candidate quality changes. AI must invoke the same eligibility, project-choice, plan-preview, production, and tactical evaluators as a human.
- **UI/UX/accessibility:** all actor/viewer state derives from `currentPlayer`; open panels refresh immediately; full actionable catalogs remain reachable; touch targets, keyboard use, reduced motion, non-color status, and outcome-first labels are tested.
- **Architecture/extensibility:** use typed definition metadata and shared helpers, never ID/substr matching. No UI-only legality/effect calculation and no parallel NetworkPlan or viewer-intel lifecycle.
- **SFX/assets:** catalog-routed, viewer-authorized, muted/reduced-motion safe feedback only; authored assets require provenance and precache updates. Unit silhouettes are unique, palette-driven, and catalog-complete.
- **Saves/solo/hot seat:** choices remain human-owned and persist across save/load/hand-off; malformed legacy state normalizes deterministically; second load equals first; no hidden assignment, source, target, focus, overlay, or sound leaks between viewers.

## File map

- `src/systems/tech-definitions-eras13.ts`, `src/systems/tech-definitions.ts`, `src/systems/tech-yield-system.ts`: Era-13 graph, unlock data, mechanics.
- `src/core/types.ts`, `src/systems/city-system.ts`, `src/systems/unit-system.ts`, `src/systems/unit-*-system.ts`: content records, production, chains, combat/specialist behavior.
- `src/systems/national-project-*.ts`, `src/storage/save-migrations.ts`: projects, choices, persistence only if needed.
- `src/systems/resource-*.ts`, `src/ai/ai-*.ts`: substitutions, generic production/research/tactics/project choices.
- `src/systems/network-*.ts`, `src/ui/network-panel.ts`: MR4 formation/specialist activation through existing contracts.
- `src/renderer/sprites/{units.tsx,sprite-catalog.ts}`, `src/audio/**`, `public/**`: catalog-driven presentation and authorized sound routing.
- Mirrored `tests/{systems,ai,ui,renderer,storage}/**`: exact effects, negative boundaries, regressions, interaction replay, privacy, and catalogs.

## Tasks

### Task 1: Establish catalog and pacing contracts

- [ ] Write RED tests for exact Era-13 `30/15`, building/project `12/3`, and requested-unit `5` counts; each prerequisite exists; graph is acyclic; each unlock points to a live effect or eligible production record.
- [ ] Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts tests/systems/tech-unlocks-consistency.test.ts`; expected RED: counts/unlocks missing.
- [ ] Add only the typed catalog scaffolding and derived-count tests; calculate each cost with the Era-13 research/production profiles and document each intentional pacing snapshot change.
- [ ] Run the focused catalog/pacing tests; expected PASS.
- [ ] Commit: `test(era13-mr5): define catalog and pacing launch contracts`.

### Task 2: Ship technologies with real effects in vertical slices

- [ ] For each track pair, write one positive test for each advertised effect and one boundary negative (including half-negatives for conjunctive requirements), then verify RED.
- [ ] Add the complete 30-node graph, `historicalStatus`, prerequisite metadata, and only honest `unlocks`, `unlocksUnits`, and `unlocksBuildings` entries.
- [ ] Wire each effect at its canonical system seam and surface it in the tech/Codex UI; use the shared eligibility helper for recommendations.
- [ ] Run tech, yield, resource, city, and tech-panel regressions; inspect player-visible effect text.
- [ ] Commit each coherent two-track slice with `feat(era13): launch <tracks> technologies`.

### Task 3: Buildings, materials, and national projects

- [x] Write RED availability/effect/reservation tests for the launch catalog, the Circular Manufacturing resource-substitution positive/negative path, and the city-panel current-player affordance.
- [ ] Implement typed building/project metadata and canonical yield, Capacity, counter, and resource-advantage effects. Reuse `getReservedNationalProjectKeys`, lifecycle/fade helpers, and shared production eligibility.
- [x] Implement the Circular Manufacturing choice through one shared evaluator: human choice is explicit and current-player scoped; the AI invokes the same canonical mutation after completion.
- [x] Add schema 7 with malformed normalization and second-load equality. Future-version rejection remains covered by the existing migration contract.
- [ ] Run production, resource, national-project, city-panel, AI, save, solo, and multi-human handoff regressions.
- [ ] Commit: `feat(era13): add buildings and national projects`.

### Task 4: Combat Drone and Autonomous Frigate

- [ ] Write RED production, explicit upgrade/obsolescence, max-movement, resource, AI-role, tactical-use, counterplay, sprite, SFX, and hot-seat presentation tests.
- [ ] Add data records and existing production/city-aware eligibility, AI candidate, tactical, renderer motion, palette sprite, SFX routing, Codex, and save paths. Ensure old successors explicitly point to the new units.
- [ ] Add mixed-force fixtures proving drone-only equal-production armies do not dominate and non-network counters remain useful.
- [ ] Run exact tests plus unit-chain, combat, AI, sprites, audio, UI, and save suites.
- [ ] Commit: `feat(era13): launch autonomous combat units`.

### Task 5: Exosuit Infantry, Propagandist, and Drone Controller

- [ ] Write RED tests for Exosuit-below-Tank, specialist outcomes/counters, Controller plan eligibility, preview/result parity, AI use, and player-visible outcome/counter copy. (Controller validator, panel, selected-unit launcher, and AI candidate RED/GREEN coverage now complete; balance and Propagandist slices remain.)
- [ ] Implement each as a complete production-to-presentation vertical slice, with explicit chain metadata and no inferred behavior.
- [x] Make MR4 Guardian Screen/Swarm Strike actionable solely through the existing `NetworkPlan` definition/validator/preview/assignment/cleanup/effect path once Controller exists; do not expose any other untrainable plan.
- [ ] Run combat, network, AI, selected-unit/network panel, hot-seat audio/overlay, and accessibility tests.
- [ ] Commit: `feat(era13): launch coordinated specialist units`.

### Task 6: Catalog completeness, privacy, and release gates

- [ ] Add final RED regressions for all counts, exact effect coverage, graph, pacing, sprite uniqueness/catalog records, SFX route/precache, malformed saves, solo recommendations, and 2–4 human handoff privacy.
- [ ] Review all player truth tables: tech selection, building/unit/project selection, human project choice, plan assignment/counter, save/load, reopen/rerender, and handoff.
- [ ] Run source-rule checks for all changed `src` files, focused suites for every task, pacing suites, `test:ai-playability`, build, full test, and `verify:push`.
- [ ] Inspect `git diff --check`, status, and both committed/uncommitted diffs from `origin/main`; record manual sprite/SFX checks and any intentional deviations in the PR description.
- [ ] Commit: `test(era13): complete launch regression coverage`.

## Validation matrix

| Dimension | Evidence |
|---|---|
| Balance/fun/counterplay | Era-13 pacing, combat mixed-force, counter, and maximum-stat tests |
| Ages/play styles/UI/UX | outcome/counter copy, all-catalog reachability, rendered post-action and accessibility tests |
| Difficulty/AI | same evaluator parity and Explorer/Standard/Veteran candidate-quality regressions |
| Architecture/data | typed catalog, graph, unlock, chain, canonical-seam and no-duplicate-network tests |
| Art/SFX | full sprite record/catalog uniqueness, motion/reduced-motion, SFX route/mute/viewer/precache tests |
| Saves/solo/hot seat | migration/idempotency/malformed/future rejection plus current-player handoff/privacy tests |
| Final gate | `build`, `test`, `verify:push`, source-rule check, diff review |
