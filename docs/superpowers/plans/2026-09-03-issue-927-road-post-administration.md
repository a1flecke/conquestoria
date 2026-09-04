# Road & Post Network Administration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate: repository policy requires inline work only.

**Goal:** Add the Era-4 Military Logistics administration rung: a continuous, owned road network to the capital emits a bounded, visible reduction to only distance-from-capital unrest.

**Architecture:** Preserve the raw hex-distance formula. Parameterize the existing capital-road BFS with an owned-road policy, then use one fresh pass-scoped context in the table-driven relief system. Explicit source metadata separates building-backed relief from direct-tech infrastructure relief so AI production, AI research, and pacing remain generic.

**Tech Stack:** TypeScript, Vitest, Vite, serializable GameState, DOM UI panels.

---

## File map

- Modify: src/systems/road-network.ts — strict owned-road capital connectivity and post-unlock AI target policy.
- Modify: src/systems/faction-system.ts — evaluation context, source metadata, Road & Post row, shared Courthouse formula.
- Modify: src/systems/unrest-guidance.ts and src/ui/unrest-guidance-copy.ts — typed recommendations and plain copy.
- Modify: src/ui/city-overview-panel.ts and src/ui/city-panel.ts — one fresh context per render.
- Modify: src/ai/ai-research.ts, src/ai/ai-production.ts, tests/systems/helpers/pacing-reference-economy.ts — generic metadata consumers.
- Modify: src/systems/tech-definitions-eras1-4.ts and .claude/rules/game-balance.md — honest text and inventory.
- Test: tests/systems/road-network.test.ts, tests/ai/basic-ai-worker-roads.test.ts, tests/systems/faction-system.test.ts, tests/systems/unrest-guidance.test.ts, tests/ui/unrest-guidance-copy.test.ts, tests/ui/city-overview-panel.test.ts, tests/ui/city-panel.test.ts, tests/ai/ai-production.test.ts, tests/ai/ai-research.test.ts.

## Player truth table

| Before | Action | Immediate visible result |
|---|---|---|
| Distant city; Military Logistics is available | Open city guidance | Research-first Military Logistics advice appears. |
| Distant city; tech complete; owned chain incomplete | Finish final owned road | Next render shows Road & Post Network negative row and removes road advice. |
| Connected city with Courthouse | Open city or overview panel | Both distinct relief rows show, with at least 2 sprawl pressure remaining. |
| Hot-seat handoff | Open Cities | Only the active civ's cities are shown; each calculation stays city-owner scoped. |

## Misleading UI risks

- Do not recommend roads across neutral, foreign, or water tiles.
- Do not recommend Military Logistics until road-building and tactics are complete.
- Do not repeat connection advice after strict owned connection exists.
- Do not modify or hide the positive Distance from capital row.

### Task 1: Policy-driven capital connectivity

**Files:**
- Modify: src/systems/road-network.ts:8-50
- Test: tests/systems/road-network.test.ts, tests/ai/basic-ai-worker-roads.test.ts

- [ ] **Step 1: Write failing tests**

Add an owned-road policy test matrix: full owned chain succeeds; one missing road, foreign road, neutral road, enemy road, water gap, and island fail; horizontal wrap succeeds; repeated calls return identical sets. Add an intermediate own-city-center case and a territorial-transfer case where the same finished road starts foreign and becomes valid only after tile ownership changes. Add an AI-worker regression: with Military Logistics complete, a foreign-road link does not make getRoadBuildTarget return null; it selects a missing buildable owned-territory segment toward the city.

- [ ] **Step 2: Run the failing test**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/road-network.test.ts

Expected: FAIL because the owned-road policy does not exist.

- [ ] **Step 3: Implement the minimal helper**

Add:
    export type CapitalRoadPolicy = 'any-road' | 'owned-road';

Give getCitiesConnectedToCapital a third optional policy argument defaulting to any-road. In its existing BFS, traverse a road when tile.hasRoad and either the policy is any-road or tile.owner equals civId. Keep own city centers traversable. Do not use roadOwner or read diplomacy.

In getRoadBuildTarget, select owned-road connectivity when the civ has Military Logistics and any-road otherwise. Existing AI callers then use the stricter legitimate target after the administration unlock without a new planner or AI-only benefit. Keep the target limited to a buildable tile; if no owned-territory route can be extended, return null rather than using foreign/neutral infrastructure.

- [ ] **Step 4: Verify**

Run: scripts/check-src-rule-violations.sh src/systems/road-network.ts && bash scripts/run-with-mise.sh yarn test --run tests/systems/road-network.test.ts tests/ai/basic-ai-worker-roads.test.ts tests/systems/road-system.test.ts tests/systems/pillage-system.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
    git add src/systems/road-network.ts tests/systems/road-network.test.ts tests/ai/basic-ai-worker-roads.test.ts
    git commit -m "feat(unrest): add owned road connectivity policy"

### Task 2: Table-driven Road & Post relief with bounded evaluation context

**Files:**
- Modify: src/systems/faction-system.ts:57-204,456-464
- Test: tests/systems/faction-system.test.ts

- [ ] **Step 1: Write failing system tests**

Use an Era-4, fully owned connected fixture and assert raw Distance from capital remains unchanged while Road & Post Network is negative. Prove no row without Military Logistics, with a disconnected route, or through foreign, neutral, enemy, or water tiles. Prove capital gets no row; road relief targets neither war nor conquest; road relief is no more than 35% rounded, cap 6, and leaves at least 4 distance pressure alone. Prove Courthouse plus roads leaves at least 2 total sprawl. Assert pillage/ownership loss removes relief, hot-seat currentPlayer changes do not, and repeated read-only calls are deterministic.

- [ ] **Step 2: Run the failing test**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts

Expected: FAIL because Road & Post Network does not exist.

- [ ] **Step 3: Implement the source and context**

Extend UnrestReliefSource with optional buildingId and researchUnlockTechId; source id is identity only. Add:
    export interface UnrestEvaluationContext {
      connectedOwnedRoadCityIdsByCivId: Map<string, Set<string>>;
    }
    export const createUnrestEvaluationContext = (): UnrestEvaluationContext => ({
      connectedOwnedRoadCityIdsByCivId: new Map(),
    });

Mark Courthouse and Military Administration with their buildingId. Add road-post-network with researchUnlockTechId military-logistics. Extract getCourthouseReliefAmount(positiveRows) and call it from both the Courthouse source and road source. Lazily resolve each civ's strict connected set with getCitiesConnectedToCapital(state, civId, 'owned-road').

Thread optional context through getUnrestReliefRows, getUnrestPressureBreakdown, and computeUnrestPressure; create a short-lived context only when omitted. In processFactionTurn, create one context before its city loop and pass it into every compute call.

Implement:
    candidate = Math.round(0.35 * distance)
    roadOnlyCap = Math.min(6, Math.max(0, distance - 4))
    combinedReserve = Math.max(0, distance + overextension - 2 - courthouseRelief)
    relief = Math.min(candidate, roadOnlyCap, combinedReserve)

Emit { label: 'Road & Post Network', amount: -relief } only when relief is positive.

- [ ] **Step 4: Verify**

Run: scripts/check-src-rule-violations.sh src/systems/faction-system.ts && bash scripts/run-with-mise.sh yarn test --run tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
    git add src/systems/faction-system.ts tests/systems/faction-system.test.ts
    git commit -m "feat(unrest): add road post administration relief"

### Task 3: Generic AI and pacing metadata consumers

**Files:**
- Modify: src/ai/ai-production.ts:307-339
- Modify: src/ai/ai-research.ts:39-87,371-390
- Modify: tests/systems/helpers/pacing-reference-economy.ts:48-52
- Test: tests/ai/ai-production.test.ts, tests/ai/ai-research.test.ts

- [ ] **Step 1: Write failing tests**

Prove a direct-tech source does not create a nonexistent production candidate and Courthouse remains normally production-scored. Use equal-breadth research candidates to prove a wide AI with two pressure-gated, disconnected owned cities receives a positive Military Logistics relief bonus while compact and already-connected variants receive zero. Repeat across challenge profiles and assert the same legality and bonus.

- [ ] **Step 2: Run the failing tests**

Run: bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts

Expected: FAIL because source ids are treated as building ids.

- [ ] **Step 3: Implement generic source consumption**

In AI production match source.buildingId to buildingId. In pacing build the exclusion set from sources with buildingId only. Rename the AI map to pressuredReliefCityIdsBySourceId. A candidate tech activates a source when its unlocksBuildings contains source.buildingId or tech.id equals source.researchUnlockTechId. In applyAIResearch create one UnrestEvaluationContext for its city scan and pass it to every breakdown; source eligibility remains metadata/target-row based and does not branch on military-logistics.

- [ ] **Step 4: Verify**

Run: scripts/check-src-rule-violations.sh src/ai/ai-production.ts src/ai/ai-research.ts && bash scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/systems/pacing-reference-economy.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
    git add src/ai/ai-production.ts src/ai/ai-research.ts tests/systems/helpers/pacing-reference-economy.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts
    git commit -m "feat(ai): value infrastructure unrest relief generically"

### Task 4: Truthful guidance and visible-panel context reuse

**Files:**
- Modify: src/systems/unrest-guidance.ts:14-275
- Modify: src/ui/unrest-guidance-copy.ts:8-47
- Modify: src/ui/city-overview-panel.ts:24-138
- Modify: src/ui/city-panel.ts:345-356
- Test: tests/systems/unrest-guidance.test.ts, tests/ui/unrest-guidance-copy.test.ts, tests/ui/city-overview-panel.test.ts, tests/ui/city-panel.test.ts

- [ ] **Step 1: Write failing recommendation and DOM tests**

Add kinds research-military-logistics and connect-city-road-network. Assert the research kind requires both prerequisites, connection kind requires completed tech plus strict disconnection, and neither appears after connection while a buildable Courthouse remains reachable. Render a city overview and city panel before/after completing the final road and assert the visible row/copy updates immediately.

- [ ] **Step 2: Run the failing tests**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/unrest-guidance.test.ts tests/ui/unrest-guidance-copy.test.ts tests/ui/city-overview-panel.test.ts tests/ui/city-panel.test.ts

Expected: FAIL because kinds, copy, and context-aware rendering do not exist.

- [ ] **Step 3: Implement typed resolver and copy**

Add exact copy:
    Research Military Logistics first (Tech screen), then roads can help your far cities stay connected.
    Connect this city to your capital with roads through your land to make it easier to govern.

Give public guidance helpers an optional UnrestEvaluationContext. The distance resolver returns research only when both prerequisites are completed; after tech completion it returns connection only if strict-disconnected, otherwise it falls through to Courthouse/garrison. Create one fresh context per city overview render and city-panel render, passing it to pressure and guidance calls. Add no button, route screen, or overlay.

- [ ] **Step 4: Verify**

Run: scripts/check-src-rule-violations.sh src/systems/unrest-guidance.ts src/ui/unrest-guidance-copy.ts src/ui/city-overview-panel.ts src/ui/city-panel.ts && bash scripts/run-with-mise.sh yarn test --run tests/systems/unrest-guidance.test.ts tests/ui/unrest-guidance-copy.test.ts tests/ui/city-overview-panel.test.ts tests/ui/city-panel.test.ts

Expected: PASS.

- [ ] **Step 5: Commit**

Run:
    git add src/systems/unrest-guidance.ts src/ui/unrest-guidance-copy.ts src/ui/city-overview-panel.ts src/ui/city-panel.ts tests/systems/unrest-guidance.test.ts tests/ui/unrest-guidance-copy.test.ts tests/ui/city-overview-panel.test.ts tests/ui/city-panel.test.ts
    git commit -m "feat(ui): guide road network administration"

### Task 5: Content honesty and balance inventory

**Files:**
- Modify: src/systems/tech-definitions-eras1-4.ts:61
- Modify: .claude/rules/game-balance.md:81-109
- Test: tests/systems/tech-system.test.ts, tests/systems/description-honesty.test.ts, tests/systems/pacing-audit.test.ts

- [ ] **Step 1: Write a failing description-honesty test**

Require Military Logistics text to name half-cost road movement and connected owned-road distance relief.

- [ ] **Step 2: Implement content and inventory**

Set its effect text to:
    Roads cost half movement; connected owned roads reduce distance unrest.

Add an Unrest Relief Inventory row with the exact formula, D/O definitions, cap 6, road-only floor 4, combined Courthouse floor 2, target row, Era-4 unlock, owned-territory rule, separate-row requirement, and AI/difficulty parity. Update the inventory rule so a relief source may identify either buildingId or researchUnlockTechId.

- [ ] **Step 3: Verify**

Run: bash scripts/run-with-mise.sh yarn test --run tests/systems/tech-system.test.ts tests/systems/description-honesty.test.ts tests/systems/pacing-audit.test.ts

Expected: PASS; no yield, tech cost, or reference-economy snapshot change is expected.

- [ ] **Step 4: Commit**

Run:
    git add src/systems/tech-definitions-eras1-4.ts .claude/rules/game-balance.md tests/systems/tech-system.test.ts tests/systems/description-honesty.test.ts
    git commit -m "docs: record road administration relief bounds"

### Task 6: Integration review and verification

**Files:**
- Modify: docs/superpowers/plans/2026-09-03-issue-927-road-post-administration.md — tick completed work only after it is done.

- [ ] **Step 1: Review the implementation diff**

Run:
    git diff --check origin/main...HEAD
    git diff --stat origin/main...HEAD
    git diff origin/main...HEAD -- src/systems/faction-system.ts src/systems/road-network.ts src/systems/unrest-guidance.ts src/ai/ai-research.ts src/ai/ai-production.ts

Confirm no base-distance rewrite, foreign-road/treaty condition, save schema field, global cache, duplicated Courthouse formula, or gameplay use of state.currentPlayer.

- [ ] **Step 2: Run targeted verification**

Run:
    scripts/check-src-rule-violations.sh src/systems/road-network.ts src/systems/faction-system.ts src/systems/unrest-guidance.ts src/ai/ai-research.ts src/ai/ai-production.ts src/ui/unrest-guidance-copy.ts src/ui/city-overview-panel.ts src/ui/city-panel.ts
    bash scripts/run-with-mise.sh yarn test --run tests/systems/road-network.test.ts tests/systems/road-system.test.ts tests/systems/pillage-system.test.ts tests/systems/faction-system.test.ts tests/systems/faction-happiness.test.ts tests/systems/unrest-guidance.test.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/ui/unrest-guidance-copy.test.ts tests/ui/city-overview-panel.test.ts tests/ui/city-panel.test.ts tests/storage/save-migrations.test.ts

Expected: PASS.

- [ ] **Step 3: Run full verification, separately**

Run:
    bash scripts/run-with-mise.sh yarn build
    bash scripts/run-with-mise.sh yarn test:durable
    bash scripts/run-with-mise.sh yarn test:durable:status
    git diff --check

Expected: build succeeds; durable status passes for current HEAD and working tree; diff check is silent.

- [ ] **Step 4: Commit plan status and prepare one focused PR**

Run:
    git add docs/superpowers/plans/2026-09-03-issue-927-road-post-administration.md
    git commit -m "docs: record road administration completion"

PR body must cover raw distance behavior, strict owned connectivity, formula/cap/floors, Courthouse and Military Administration separation, water/foreign roads, AI, guidance, hot-seat/save/performance, review findings, and verification.

## Plan self-review

- Spec coverage: Tasks 1–2 cover connectivity, formula, floors, ownership, water/pillage/wrap, hot seat, and no persistence. Task 3 covers AI/pacing metadata. Task 4 covers player-visible guidance. Task 5 records balance. Task 6 covers save regression, source checks, build, durable suite, and PR evidence.
- Placeholder scan: no unresolved implementation, testing, or command placeholder remains.
- Type consistency: CapitalRoadPolicy, UnrestEvaluationContext, buildingId, researchUnlockTechId, and pressuredReliefCityIdsBySourceId are defined before later use.

## Final inline plan review

- **Gameplay, fun, ages, and play styles:** the 35% cap/floors preserve distance, make worker investment legible, and avoid a mandatory tall-empire bonus.
- **Difficulty and AI:** rules remain profile-invariant. The existing worker targeter must use the owned-road policy after Military Logistics so AI does not treat foreign links as qualifying; Task 1 now has that regression.
- **UI, UX, and hot seat:** only existing, owner-scoped breakdown and guidance surfaces change; tests require advice removal and row appearance after the final road.
- **Architecture, extensibility, data, saves, and SFX:** one parameterized BFS, typed source metadata, and a short-lived context avoid new path models, persistent caches, schema changes, or audio work; later rail/telegraph can add another source.
- **Testing and implementation safety:** each behavior begins red, includes negative road/water/foreign/hot-seat cases, then runs targeted, source-rule, build, durable-suite, and real-diff checks.
