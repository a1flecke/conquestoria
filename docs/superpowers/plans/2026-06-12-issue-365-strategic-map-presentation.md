# Issue 365 Strategic Map Presentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace overlapping strategic-map building sprites and inconsistent unit render paths with one bounded city diorama, one consistently sized stack presentation, and terrain-integrated improvements.

**Architecture:** Pure presentation helpers derive viewer-safe city and unit models from canonical gameplay state. Canvas remains authoritative for terrain, cities, moving units, fog, and fallbacks; the DOM overlay may render only high-zoom static unit stacks using the exact same layout metrics. Gameplay-era and capital semantics move to shared helpers so renderer and systems cannot disagree.

**Tech Stack:** TypeScript, Canvas 2D, DOM sprite overlay, Vitest, Playwright, Vite.

---

## File Structure

- Create `src/renderer/unit-map-presentation.ts`: shared unit layout metrics, visible stack grouping, deterministic lead selection, and overlay entity conversion.
- Create `src/renderer/city-map-presentation.ts`: architecture era, population tier, specializations, capital/breakaway/wonder selection, and visual-family catalog.
- Create `src/systems/capital-system.ts`: exact `civilization.cities[0]` capital lookup with ownership validation.
- Modify `src/systems/tech-definitions.ts`: canonical contiguous civilization-era resolver.
- Modify `src/systems/minor-civ-system.ts`: delegate global advancement checks to the canonical resolver.
- Modify `src/renderer/render-loop.ts`: prepare viewer-safe unit stacks, suppress occupied terrain labels, remove building entities, and pass selected unit context.
- Modify `src/renderer/sprite-overlay.ts`: unit-only sizing from shared metrics and truthful active-member ownership.
- Modify `src/renderer/unit-renderer.ts`: render prepared stacks at one invariant lead size.
- Modify `src/renderer/unit-movement-animation.ts`: expose/test invariant movement layout inputs without changing gameplay paths.
- Modify `src/renderer/city-renderer.ts` and `src/renderer/city-render-passes.ts`: render the bounded city composition and one wonder slot.
- Modify `src/renderer/hex-renderer.ts`: accept viewer-safe label-suppression coordinates and draw low-profile improvement treatments.
- Modify capital-sensitive callers in `src/main.ts`, `src/ai/basic-ai.ts`, and `src/systems/faction-system.ts` to use the shared helper.
- Add mirrored unit, city, system, overlay, terrain, integration, and browser regressions.

## Player Truth Table

| Before | Action | Internal change | Immediate visible result | Must remain reachable |
|---|---|---|---|---|
| Idle unit uses DOM overlay | Move unit | Unit state moves to destination and animation begins | Same-size Canvas piece travels below fog; no origin/destination duplicate | Unit inspection after completion |
| Several friendly units share a hex | Select another member | Selected unit ID changes | Selected member becomes normal-size lead; count and bounds remain stable | Every member through stack picker |
| City completes a building | Finish production | Building ID joins `city.buildings` | Existing city silhouette gains/re-ranks an integrated accent; no new object or label | Full building list in city panel |
| City completes another legendary wonder | Wonder completion recorded | Viewer-safe wonder entries change | One deterministic wonder slot updates and `+N` changes | Every wonder in city panel/Codex/inspection |
| Worker completes farm | Improvement changes on tile | Tile improvement state changes | Field rows appear as worked terrain, below entities | Tile inspection and worker actions |
| Vision leaves a city | Visibility becomes last-seen | Snapshot remains | Generic population/owner city remains without live production/status/building intel | Last-seen tile inspection |

## Misleading UI Risks

- A selected friendly stack lead must be selected only when it is actually in that visible stack; stale selected IDs use readiness ordering.
- Hostile lead must match `selectDefenderForAttack`, not arbitrary ID or sprite order.
- Architecture may advance only after the same 60-percent contiguous threshold as gameplay; one advanced technology is insufficient.
- A missing/foreign first city ID means no capital; the renderer must not silently promote the second city.
- Known-rival wonders never reveal active construction; overflow counts only viewer-visible completed entries.
- Terrain-label suppression must use presented live/last-seen data and must not reveal hidden units or resources.

## Interaction Replay Checklist

- Move a single unit, interrupt movement, complete movement, reload, and repeat at low/high zoom.
- Enter and leave stacks; select each friendly member; attack a hostile stack and compare the visible lead with the combat defender.
- Complete buildings in three categories, grow population tiers, capture the city, and fog/unfog it.
- Complete multiple wonders and verify one map slot plus full panel/Codex access.
- Complete each improvement type and verify label suppression, wrapping, mobile viewport, and reduced motion.

### Task 1: Canonical Era And Capital Truth

**Files:**
- Create: `src/systems/capital-system.ts`
- Modify: `src/systems/tech-definitions.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/systems/faction-system.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/main.ts`
- Test: `tests/systems/capital-system.test.ts`
- Test: `tests/systems/tech-definitions.test.ts`
- Test: `tests/systems/minor-civ-system.test.ts`

- [ ] Write failing tests for exact first-city capital semantics, invalid ownership, contiguous era advancement, the 60-percent threshold, and excluded technologies.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/capital-system.test.ts tests/systems/tech-definitions.test.ts tests/systems/minor-civ-system.test.ts` and confirm the new assertions fail for missing helpers.
- [ ] Implement `getCapitalCityId`, `getCapitalCity`, and `resolveCivilizationEra`, then delegate the current advancement and capital-sensitive callers without changing game outcomes.
- [ ] Re-run targeted tests and source-rule checks for every changed source file.
- [ ] Commit as `refactor(map): centralize capital and era presentation truth`.

### Task 2: Invariant Unit Layout And Static Stack Presentation

**Files:**
- Create: `src/renderer/unit-map-presentation.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `src/renderer/sprite-overlay.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/main.ts`
- Test: `tests/renderer/unit-map-presentation.test.ts`
- Test: `tests/renderer/unit-renderer.test.ts`
- Test: `tests/renderer/sprite-overlay.test.ts`
- Test: `tests/renderer/unit-renderer-overlay.test.ts`

- [ ] Write failing tests proving `displaySize === 0.9 * hexSize`, stack count never shrinks the lead, selected/readiness/combat-defender lead rules, transported/moving exclusion, and all-member overlay ownership.
- [ ] Write failing overlay tests for reduced-motion/LOD active-ID clearing, missing sprites, hidden pinch state, and unit wrapper bounds matching shared metrics.
- [ ] Run the four targeted renderer tests and confirm failures match the missing presentation contract.
- [ ] Implement shared layout metrics and stack preparation; pass selected unit ID from the live caller; make DOM static stacks and Canvas fallback consume the same prepared model.
- [ ] Remove building/improvement kinds from live overlay usage while preserving compatible internals only where tests or non-map consumers require them.
- [ ] Re-run targeted tests and source-rule checks.
- [ ] Commit as `fix(map): keep unit stacks at one canonical size`.

### Task 3: Fog-Safe Movement And Renderer Handoffs

**Files:**
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/unit-movement-animation.ts`
- Modify: `src/renderer/unit-renderer.ts`
- Test: `tests/renderer/unit-movement-animation.test.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`
- Test: `tests/renderer/unit-renderer-overlay.test.ts`

- [ ] Write failing regressions proving moving IDs are excluded from static origin/destination stacks, movement uses shared bounds, wrap interpolation is continuous, and completion/interruption/loading/unloading restore one authoritative piece.
- [ ] Run the targeted movement tests and observe the size/handoff failures.
- [ ] Route moving-unit drawing through the shared layout and visual resolver below fog; ensure no moving unit enters the DOM overlay.
- [ ] Re-run targeted tests and source-rule checks.
- [ ] Commit as `fix(map): preserve unit scale through movement`.

### Task 4: Bounded City Presentation And Wonder Slot

**Files:**
- Create: `src/renderer/city-map-presentation.ts`
- Modify: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/city-render-passes.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/city-map-presentation.test.ts`
- Test: `tests/renderer/city-renderer.test.ts`
- Test: `tests/renderer/city-renderer-overlay.test.ts`
- Test: `tests/systems/legendary-wonder-map-presentation.test.ts`

- [ ] Write failing presentation tests for five population tiers, independent era, deterministic top-two specializations, civilization-family coverage, capital/breakaway priority, one primary wonder, `+N`, and last-seen privacy.
- [ ] Write failing rendering tests for the 75-percent footprint, fixed badge regions, long-name truncation, production/idle exclusivity, and absence of building overlay entities/labels.
- [ ] Run targeted city and wonder tests and confirm failures.
- [ ] Implement the pure city model and compositional Canvas passes using deterministic primitives and existing wonder art.
- [ ] Replace the multi-wonder map ring with one slot while retaining all non-map detail surfaces.
- [ ] Re-run targeted tests, `./scripts/run-wonder-regressions.sh`, and source-rule checks.
- [ ] Commit as `feat(map): render cities as bounded evolving dioramas`.

### Task 5: Terrain-Integrated Improvements And Label Hierarchy

**Files:**
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/improvements/*.ts`
- Test: `tests/renderer/hex-renderer.test.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`

- [ ] Write failing tests for label suppression over live/last-seen cities, visible stacks, improvements, visible resources, natural wonders, villages, and lairs, plus an empty control tile and hidden-object negative cases.
- [ ] Write failing tests that every improvement uses a low-profile treatment below entities and that farms are visually distinct from tree markers.
- [ ] Run targeted terrain tests and confirm failures.
- [ ] Add the viewer-safe suppression set and low-profile deterministic Canvas treatments without changing tile inspection or gameplay state.
- [ ] Re-run targeted tests and source-rule checks.
- [ ] Commit as `fix(map): integrate improvements and suppress crowded labels`.

### Task 6: Saved-Game Browser Regression And Visual QA

**Files:**
- Create: `tests/fixtures/issue-365-crowded-map-save.json`
- Create or modify: `tests/e2e/issue-365-map-presentation.spec.ts`
- Modify: `playwright.config.ts` only if deterministic screenshot configuration is not already available.

- [ ] Add a migration-valid deterministic autosave fixture containing a crowded city, multi-wonder overflow, nearby stack, completed building, and worked tiles.
- [ ] Add a Playwright test that seeds `conquestoria-autosave`, continues the game, verifies no building overlay children/labels, captures desktop/mobile screenshots, exercises movement, and repeats fallback checks under reduced motion.
- [ ] Run `./scripts/run-with-mise.sh yarn test:web-smoke` and the focused Playwright spec; review screenshots rather than accepting them blindly.
- [ ] Fix any visual overlap, touch-size, privacy, or deterministic timing issue found during replay.
- [ ] Commit as `test(map): cover issue 365 crowded-map regressions`.

### Task 7: Inline Completeness And Code Review

**Files:** all branch changes.

- [ ] Compare every design acceptance criterion with a concrete code path and regression; add any missing negative test before changing production code.
- [ ] Review `git diff origin/main...HEAD` for correctness, gameplay parity, privacy, serialization, performance, mobile UX, accessibility, renderer ordering, wrapping, and stale overlay state.
- [ ] Run all mirrored targeted tests and `scripts/check-src-rule-violations.sh` for all changed source files.
- [ ] Run `./scripts/run-wonder-regressions.sh`, `./scripts/run-with-mise.sh yarn test:web-smoke`, `./scripts/run-with-mise.sh yarn build`, and `./scripts/run-with-mise.sh yarn test`.
- [ ] Fix every Critical, Important, or justified Minor review finding test-first, then repeat the complete verification.
- [ ] Commit review fixes as `fix(map): address issue 365 implementation review` when needed.

### Task 8: Publish Pull Request

- [ ] Confirm the worktree is clean and inspect `git diff --stat origin/main...HEAD` plus the full diff.
- [ ] Push `codex/issue-365-map-presentation-design`.
- [ ] Open a draft pull request linked to issue 365 with gameplay impact, screenshots, test evidence, and explicit note that the strategic-map six-slot wonder ring is intentionally replaced while all detail surfaces remain.
