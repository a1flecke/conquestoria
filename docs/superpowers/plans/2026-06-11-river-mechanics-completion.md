# River Mechanics Completion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. The user explicitly requested inline execution with no subagents.

**Goal:** Complete issue 351 by applying the canonical river combat penalty across all combat actors and routing both worked-tile yield paths through the canonical river-yield helper without changing existing farm balance.

**Architecture:** `calculateCombatStrengths` derives river crossing directly from `GameMap.rivers`; both `resolveCombat` and the live combat preview consume its breakdown, so every actor and the player-facing forecast share one rule without new caller flags. `city-work-system` and `resource-system` delegate only the base river yield to `getRiverYieldBonus`; completed-farm food and existing Irrigation behavior remain caller-owned.

**Tech Stack:** TypeScript, Vitest, Vite, existing system helpers and seeded combat RNG.

---

### Task 1: Prove The Combat Contract

**Files:**
- Modify: `tests/systems/combat-system.test.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [x] **Step 1: Add deterministic resolver regressions**

Add a small handcrafted plains map fixture with an optional `rivers` array. Use identical warrior units and the same seed to assert that a river segment between attacker and defender lowers `defenderDamage` and raises `attackerDamage`. Add a negative test asserting an unrelated river segment produces exactly the same result as an empty river list.

- [x] **Step 2: Add the non-human parity regression**

Use `makeAiRebelState()` twice with full-health adjacent warriors. Add the river edge to one state, collect each `combat:resolved` event, and assert the AI's river-crossing result deals less defender damage than the otherwise identical no-river result.

- [x] **Step 3: Run the new tests and verify RED**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts tests/ai/basic-ai.test.ts
```

Expected: the new river comparisons fail because both combat paths currently produce identical damage.

### Task 2: Apply The Canonical Combat Penalty

**Files:**
- Modify: `src/systems/combat-system.ts`
- Test: `tests/systems/combat-system.test.ts`
- Test: `tests/ai/basic-ai.test.ts`

- [x] **Step 1: Implement the minimal resolver change**

Import `getRiverDefensePenalty` and `isRiverBetween` from `river-system`. After constructing attacker strength, apply:

```ts
atkStrength *= 1 + getRiverDefensePenalty(
  isRiverBetween(map, attacker.position, defender.position),
);
```

Do not add a context flag or modify any caller. Valid river segments already represent a single crossed edge in either direction, while non-adjacent ranged attacks have no matching segment.

- [x] **Step 2: Run the focused combat tests and verify GREEN**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts tests/ai/basic-ai.test.ts
```

Expected: both files pass, including direct resolver and AI parity coverage.

### Task 3: Characterize And Canonicalize River Yields

**Files:**
- Modify: `tests/systems/city-work-system.test.ts`
- Modify: `tests/systems/resource-system.test.ts`
- Modify: `src/systems/city-work-system.ts`
- Modify: `src/systems/resource-system.ts`

- [x] **Step 1: Add exact preservation regressions**

In `city-work-system.test.ts`, compare otherwise identical completed farms with and without `hasRiver`. With no completed technologies, assert the river variant has exactly `+1 gold`, exactly `+1 food`, and unchanged production. Keep the existing Irrigation tests as the production-gate coverage.

In `resource-system.test.ts`, compare otherwise identical cities working completed farms with and without `hasRiver`. Assert the river city total has exactly `+1 gold` and exactly `+1 food`, with production unchanged.

- [x] **Step 2: Run the characterization tests**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts
```

Expected: PASS, confirming the pre-refactor balance contract.

- [x] **Step 3: Replace both inline base-river bonuses**

In `city-work-system.ts`, import `getRiverYieldBonus`, call `addYield(total, getRiverYieldBonus(tile.hasRiver))`, and leave completed-farm food plus Irrigation production under the existing `tile.hasRiver` condition.

In `resource-system.ts`, import `getRiverYieldBonus`, obtain its `ResourceYield`, and add all four fields to the city total before the existing completed-farm food branch. Do not move farm food into the river helper or add technology inputs to it.

- [x] **Step 4: Re-run the yield tests and verify GREEN**

Run:

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts
```

Expected: PASS with exact yield preservation.

### Task 4: Verify The Complete Change

**Files:**
- Review: all changed files

- [x] **Step 1: Run source policy checks**

```bash
scripts/check-src-rule-violations.sh src/systems/combat-system.ts src/systems/city-work-system.ts src/systems/resource-system.ts src/systems/unit-system.ts src/systems/unit-movement-system.ts src/ui/combat-preview.ts src/main.ts
```

Expected: exit 0 with no rule violations.

- [x] **Step 2: Run all targeted regressions together**

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts tests/systems/river-system.test.ts tests/systems/unit-system.test.ts tests/systems/unit-movement-system.test.ts tests/ai/basic-ai.test.ts tests/ui/combat-preview.test.ts
```

Expected: all selected test files pass.

- [x] **Step 3: Run TypeScript and production build verification**

```bash
./scripts/run-with-mise.sh yarn build
```

Expected: TypeScript and Vite production build exit 0.

- [x] **Step 4: Run the full suite**

```bash
./scripts/run-with-mise.sh yarn test
```

Expected: all Vitest files and hook smoke tests pass.

- [x] **Step 5: Inspect committed and uncommitted scope**

Run `git diff --stat origin/main...HEAD`, `git diff --stat`, `git diff origin/main...HEAD`, and `git diff`. Confirm the branch contains only issue 351 documentation, combat wiring, canonical river-yield wiring, and their regressions.

- [x] **Step 6: Commit the implementation**

```bash
git add docs/superpowers/specs/2026-06-11-river-mechanics-completion-design.md docs/superpowers/plans/2026-06-11-river-mechanics-completion.md src/systems/combat-system.ts src/systems/city-work-system.ts src/systems/resource-system.ts tests/systems/combat-system.test.ts tests/systems/city-work-system.test.ts tests/systems/resource-system.test.ts tests/ai/basic-ai.test.ts
git commit -m "feat(river): complete combat and yield mechanics"
```

### Review Correction: Keep Combat Preview Honest

**Files:**
- Modify: `src/systems/combat-system.ts`
- Modify: `src/main.ts`
- Create: `src/ui/combat-preview.ts`
- Modify: `tests/systems/combat-system.test.ts`
- Create: `tests/ui/combat-preview.test.ts`

- [x] **Step 1: Add a failing shared-strength regression**

Prove the strength breakdown exposes `-0.2` for a river crossing, reduces attacker strength by exactly 20 percent, preserves defender strength, and recognizes a river segment stored in reverse direction.

- [x] **Step 2: Share strength calculation between resolution and preview**

Move veterancy, terrain, wonder, fortification, civilization, and river modifiers into `calculateCombatStrengths`. Use its returned strengths in `resolveCombat` and in the live Combat Preview.

- [x] **Step 3: Add and wire a tested player-facing warning**

Use `formatCombatPreviewDetails` to show `-20% river crossing` only when the shared breakdown reports the penalty. Preserve terrain and defender-health details.

- [x] **Step 4: Run focused review regressions**

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/combat-system.test.ts tests/ai/basic-ai.test.ts tests/ui/combat-preview.test.ts
```

Expected: all focused combat and presentation tests pass.

### Review Correction: Canonicalize Movement Step Cost

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/unit-movement-system.ts`
- Modify: `tests/systems/unit-system.test.ts`

- [x] **Step 1: Add failing route and blocker regressions**

Prove pathfinding avoids a two-river shortcut when a cheaper detour exists, Bridge Building restores the shortcut, and blocker messaging reports insufficient movement when river cost is the deciding factor.

- [x] **Step 2: Introduce one movement-step cost helper**

Implement `getMovementStepCost` with terrain, unit domain, naval exemption, Bridge Building, and river-edge handling. Use it from pathfinding, movement range, blocker messaging, and execution.

- [x] **Step 3: Run focused movement regressions**

```bash
./scripts/run-with-mise.sh yarn vitest run tests/systems/unit-system.test.ts tests/systems/unit-movement-system.test.ts
```

Expected: all movement routing, highlighting, validation, and execution tests pass.
