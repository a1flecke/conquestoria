# Regional Capital Administration Rung Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Deliver only #927’s Era-4–5 Regional Capital rung: a one-per-civ non-capital project with bounded nearest-seat distance relief.

**Architecture:** Regional Capital is a milestone national project. Its verified existing project record locates its city; UNREST_RELIEF_SOURCES owns one named relief row and source metadata for administrative seats and AI site value. Capture removes completed project records/buildings from a city before ownership changes, preventing foreign inheritance.

**Tech Stack:** TypeScript, Vitest, Vite, GitHub CLI.

---

## File map

- src/core/types.ts: typed non-capital capability.
- src/systems/city-system.ts: definition, icon, and shared availability gate.
- src/systems/planning-system.ts, src/ai/ai-resource-marketplace.ts, src/ai/basic-ai.ts, src/systems/minor-civ-economy-system.ts, src/systems/unrest-guidance.ts, and src/ui/city-panel.ts: pass canonical capital context to every live availability caller.
- src/systems/tech-definitions-eras1-4.ts: existing-tech unlock.
- src/systems/national-project-system.ts: validated completed-project city lookup.
- src/systems/city-capture-system.ts: generic project cleanup on capture/raze.
- src/systems/faction-system.ts: administrative-seat lookup and capped row.
- src/ai/ai-production.ts and src/ai/ai-research.ts: generic source metadata consumption.
- src/systems/unrest-guidance.ts and src/ui/unrest-guidance-copy.ts: typed guidance and copy.
- .claude/rules/game-balance.md: exact lasting balance contract.

### Task 1: Repair tracking before code

**Files:**
- Modify: GitHub issue #927

- [ ] **Step 1: Verify upstream state**

Run: git fetch origin --prune; gh issue view 927 --repo a1flecke/conquestoria --json number,state,body,url; gh pr view 955 --repo a1flecke/conquestoria --json number,state,mergedAt,closingIssuesReferences.

Expected: #955 is merged and #927 is closed only by its Closes #927 reference.

- [ ] **Step 2: Reopen and update the umbrella**

Run: gh issue reopen 927 --repo a1flecke/conquestoria. Use gh issue edit 927 --repo a1flecke/conquestoria --body-file /private/tmp/issue-927-regional-capital.md.

The replacement body retains the administration-ladder context; checks Courthouse/#923 and Road & Post/#955 as complete; makes Regional Capital the active Era-4–5 rung; and leaves bureaucracy/free-city allowance, telegraph/rail administration, and federalism/autonomy unchecked. Do not close #927.

- [ ] **Step 3: Confirm the repair**

Run: gh issue view 927 --repo a1flecke/conquestoria --json state,body,url.

Expected: OPEN, truthful completed rungs, and exactly three later rungs still open.

### Task 2: Define project, unlock, and central placement legality

**Files:**
- Modify: src/core/types.ts
- Modify: src/systems/city-system.ts
- Modify: src/systems/tech-definitions-eras1-4.ts
- Modify: src/systems/planning-system.ts
- Modify: src/ai/ai-production.ts
- Modify: src/ai/ai-resource-marketplace.ts
- Modify: src/ai/basic-ai.ts
- Modify: src/systems/minor-civ-economy-system.ts
- Modify: src/systems/unrest-guidance.ts
- Modify: src/ui/city-panel.ts
- Test: tests/systems/city-system.test.ts
- Test: tests/systems/tech-unlocks-consistency.test.ts
- Test: tests/systems/national-project-balance.test.ts
- Test: tests/systems/pacing-model.test.ts

- [ ] **Step 1: Write failing catalog and legality tests**

Assert the building has name Regional Capital, cost 160, tech political-philosophy, zero yield bonus, uniquePerEmpire true, nationalProject homeEra 4 with milestone true, and cannotBuildInCapital true. Assert its icon is 🏛️; political-philosophy unlocks it and says Unlock Regional Capital national project; a capital omits it while an owned non-capital includes it before reservation.

- [ ] **Step 2: Confirm tests fail**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/national-project-balance.test.ts tests/systems/pacing-model.test.ts.

Expected: absent definition, icon, unlock, and central capital gate fail.

- [ ] **Step 3: Implement the generic capability**

Add cannotBuildInCapital?: true to Building. Extend getAvailableBuildings with a final optional capitalCityId argument and reject a matching city only when the caller supplies that canonical ID. Resolve it through getCapitalCityId at every live call site: planning-system, ai-production, ai-resource-marketplace, basic-ai, minor-civ-economy-system, unrest-guidance, and both city-panel availability calls. Keep low-level isolated tests without a GameState on the old no-capital-context behavior; add targeted tests for the populated context. This prevents the project from leaking into one AI or UI surface while avoiding a broad state parameter across the existing API. Define the exact culture-category, zero-yield project; register 🏛️; add unlock metadata; revise any exact Era-4 project count.

- [ ] **Step 4: Verify and commit**

Run source checks for src/core/types.ts, src/systems/city-system.ts, src/systems/tech-definitions-eras1-4.ts, src/systems/planning-system.ts, src/ai/ai-production.ts, src/ai/ai-resource-marketplace.ts, src/ai/basic-ai.ts, src/systems/minor-civ-economy-system.ts, src/systems/unrest-guidance.ts, and src/ui/city-panel.ts, then repeat Step 2 tests. Expected: pass. Commit these files with feat(unrest): add regional capital project.

### Task 3: Correct national-project host loss generically

**Files:**
- Modify: src/systems/city-capture-system.ts
- Test: tests/systems/city-capture-system.test.ts
- Test: tests/systems/national-project-system.test.ts

- [ ] **Step 1: Write failing capture tests**

Create p1:regional_capital at province, whose buildings contain regional_capital. For major occupy, raze, and transferCapturedCityOwnership, assert the former record and host building disappear, no p2 record appears, and p1 no longer reserves the ID. Add a control project in another former-owner city that stays intact.

- [ ] **Step 2: Confirm failure**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/city-capture-system.test.ts tests/systems/national-project-system.test.ts.

Expected: current paths retain the record/building.

- [ ] **Step 3: Implement one normalizer**

Create an internal helper that finds completed project records whose cityId matches the lost city, deletes each key, and filters each matching building from that city. Thread it through occupy, raze, direct-transfer, and breakaway/reconquest ownership-change paths. Do not transfer the record/civ ID or alter legendary-wonder transfer behavior.

- [ ] **Step 4: Verify and commit**

Run source checks plus Step 2 tests. Expected: pass. Commit with fix: clear national projects from captured cities.

### Task 4: Add canonical seats and exact unrest relief

**Files:**
- Modify: src/systems/national-project-system.ts
- Modify: src/systems/faction-system.ts
- Test: tests/systems/faction-system.test.ts
- Test: tests/systems/national-project-system.test.ts
- Test: tests/systems/road-network.test.ts

- [ ] **Step 1: Write failing deterministic fixture tests**

Test no seat; a valid owned seat; capital/capital-nearer city zero relief; remote-cluster relief; foreign, malformed, and captured records inactive; and an unchanged positive Distance from capital row. Cover compact three-city, linear six-city, wide ten-city, two-cluster, island-separated, near-capital-seat, and remote-seat layouts. For seat-only, Courthouse-only, Road-only, all pairs, and all three, assert named rows and D + O + courthouse + road + regional is at least 2. Assert War weariness and Recent conquest rows remain unchanged.

- [ ] **Step 2: Confirm failures**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts tests/systems/national-project-system.test.ts tests/systems/road-network.test.ts.

Expected: no validated project-city resolver or Regional Capital row.

- [ ] **Step 3: Implement location and source metadata**

Add getCompletedNationalProjectCity(state, civId, buildingId), returning a city only if record civ, record city, current owner, and host building agree. Add administrativeSeat?: true plus optional source-level location scoring metadata to UnrestReliefSource, then getActiveAdministrativeSeatCities derived only from marked sources.

Add Regional Capital after Road & Post. Use canonical hex distance and the existing base-distance pressure helper, never pathfinding or positive-row mutation. Use: rawSeatRelief = distancePressure - nearestSeatPressure; relief = min(rawSeatRelief, 10, max(0, distancePressure + overextension - 2 - courthouseRelief - roadPostRelief)). Preserve order Courthouse → Road & Post → Regional Capital.

- [ ] **Step 4: Verify and commit**

Run source checks plus Step 2 suites. Expected: all #955 road and new fixture assertions pass. Commit with feat(unrest): add regional capital relief.

### Task 5: Add AI location value and truthful guidance

**Files:**
- Modify: src/ai/ai-production.ts
- Modify: src/ai/ai-research.ts
- Modify: src/systems/unrest-guidance.ts
- Modify: src/ui/unrest-guidance-copy.ts
- Test: tests/ai/ai-production.test.ts
- Test: tests/ai/ai-research.test.ts
- Test: tests/systems/unrest-guidance.test.ts
- Test: tests/ui/unrest-guidance-copy.test.ts

- [ ] **Step 1: Write failing AI/guidance tests**

Assert a wide two-cluster AI scores a remote candidate above a capital-adjacent candidate; compact AI scores zero/low; and rival cities/projects cannot affect the score. Assert source metadata pulls materially pressured wide AI toward political-philosophy. Assert research-regional-capital before unlock, build-regional-capital only at a useful legal site after unlock, no duplicate after completion, and retained separate Courthouse/Road recommendations.

- [ ] **Step 2: Confirm failures**

Run: bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/systems/unrest-guidance.test.ts tests/ui/unrest-guidance-copy.test.ts.

Expected: source-level site value and typed recommendations are absent.

- [ ] **Step 3: Implement metadata-driven behavior**

Have unrestReliefScore ask the matching source for optional aggregate owner-city location value, memoized per planning pass; sources without it retain their current score. Research consumes researchUnlockTechId political-philosophy. Guidance recommends build only when shared availability permits it and location value is positive. Add plain UI copy: Establish a Regional Capital here to reduce distance pressure in nearby cities. Keep existing textContent rendering paths.

#### Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| Unresearched unlock | Open unrest guidance | Research recommendation, never an impossible build action. |
| Unlocked useful non-capital | Open guidance | Establish recommendation; normal production catalog stays reachable. |
| Completed project | Rerender or reopen | No duplicate recommendation; remote breakdown has named negative row. |

#### Misleading UI Risks

- Capitals, queued/already completed projects, unavailable tech, and zero-benefit sites are never recommended.
- Copy never implies war, conquest, or road-path relief.

#### Interaction Replay Checklist

- Research normally, reopen guidance, and observe research-to-build change.
- Queue project, rerender, and confirm reservation removes duplicate advice.
- Complete it, capture its city, reopen guidance, and confirm relief/advice refreshes.

- [ ] **Step 4: Verify and commit**

Run source checks plus Step 2 suites. Expected: pass. Commit with feat(ai): value regional capital sites.

### Task 6: Document balance, test saves/hot seat, and verify

**Files:**
- Modify: .claude/rules/game-balance.md
- Test: tests/storage/save-migrations.test.ts
- Test: tests/storage/save-persistence.test.ts
- Test: tests/ui/city-panel.test.ts
- Test: tests/ui/city-overview-panel.test.ts

- [ ] **Step 1: Write save/hot-seat regressions**

Round-trip a valid project and assert identical relief. Load legacy no-seat state and assert no schema increment/no row. Use two human civs with separate seats; changing currentPlayer may change guidance but never mechanic rows.

- [ ] **Step 2: Update balance inventory**

Document ID, unlock, scarcity, direct-hex nearest-seat calculation, min(raw, 10, remaining-budget) formula, two-point residual, stack order, capture/raze removal, generic AI parity, and difficulty invariance.

- [ ] **Step 3: Verify**

Run source checks for src/core/types.ts, src/systems/city-system.ts, src/systems/tech-definitions-eras1-4.ts, src/systems/planning-system.ts, src/systems/national-project-system.ts, src/systems/city-capture-system.ts, src/systems/faction-system.ts, src/ai/ai-production.ts, src/ai/ai-resource-marketplace.ts, src/ai/basic-ai.ts, src/ai/ai-research.ts, src/systems/minor-civ-economy-system.ts, src/systems/unrest-guidance.ts, src/ui/city-panel.ts, and src/ui/unrest-guidance-copy.ts. Run all Task 2–5 mirrored tests plus tests/storage/save-migrations.test.ts, tests/storage/save-persistence.test.ts, tests/ui/city-panel.test.ts, and tests/ui/city-overview-panel.test.ts. Then run separately: git diff --check; bash scripts/run-with-mise.sh yarn build; bash scripts/run-with-mise.sh yarn test:durable; bash scripts/run-with-mise.sh yarn test:durable:status.

Expected: every command exits zero and durable status belongs to this clean worktree.

- [ ] **Step 4: Real-diff review and commit**

Inspect git diff --stat origin/main...HEAD, git diff --stat, and the full source diff. Confirm no capital transfer, positive-row mutation, foreign inheritance, schema increment, duplicated road logic, currentPlayer mechanic use, or later-rung scope. Commit docs/tests with docs: record regional capital balance contract.

## Plan self-review

- Tasks 1–6 cover tracking, definition, scarcity, capture, nearest-seat math, residual floor, Courthouse/Road coexistence, AI, guidance, UI truth, audio reuse, saves, hot seat, and verification.
- The project ID, cost, unlock, icon, formula, floor, ordering, and capture rule are explicit; no later-rung work appears.
- cannotBuildInCapital, getCompletedNationalProjectCity, administrativeSeat, and source-level location scoring are introduced before consumers.
