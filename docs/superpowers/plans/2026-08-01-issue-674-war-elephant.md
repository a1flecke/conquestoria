# War Elephant Corps Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver #674 as a save-safe Era 4 War Elephant shock unit with exact terrain, counter, Ivory, AI, UI, and temporary-asset behavior.

**Architecture:** Add the unit through the existing typed catalogs. Generalize combat exchange rules and counter selection at their shared system seams so player combat, previews, history, and AI see identical public results. Keep production discounts in the shared cost helper with a distinct live-resource/substitution boundary.

**Tech Stack:** TypeScript, Vitest, existing catalog-driven game systems, Canvas/DOM renderer catalogs, JSON save normalization.

---

## File map

- `src/core/types.ts`: add `war_elephant` and the public exchange-kind vocabulary.
- `src/systems/unit-system.ts`, `city-system.ts`, `combat-role-definitions.ts`, `ui/unit-role-presentation.ts`: unit definition, trainability/upgrade edge/pacing, and player/AI role presentation.
- `src/systems/unit-modifier-definitions.ts`, `unit-modifier-system.ts`, `combat-system.ts`: exact terrain modifiers, specific-counter precedence, and typed exchange rules.
- `src/systems/resource-advantages.ts`, `city-system.ts`: live-only Ivory advantage and explicit Circular Manufacturing boundary.
- `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`: exhaustive temporary fallback registrations linked to #708/#714.
- `tests/systems/*`, `tests/ai/*`, `tests/ui/*`, `tests/audio/*`, `tests/renderer/*`, `tests/storage/*`: behavior-first regressions.

## Player truth table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Owner has Tactics and selects War Elephant | Open unit information / choose it in city production | Plain-language role, stats, open/rough behavior, shock, polearm warning, successor state, and live-Ivory cost appear from canonical catalogs. |
| Owner attacks a non-polearm unit | Open combat preview, then resolve attack | Preview and combat history state that return damage is reduced by 15%. |
| Owner attacks Spearman or Pikeman | Open combat preview, then resolve attack | Preview shows the exact public 1.35 polearm counter and does not show shock reduction. |
| Rival takes the hot-seat turn | Inspects the same unit/panel | Public role/combat facts remain visible; owner-only incomplete-Tactics and resource guidance remain hidden. |

## Misleading UI risks

- “Open ground” must not imply volcanic or mountain terrain; the displayed and applied rough set is exactly forest, jungle, swamp, and hills.
- Ivory is a discount, never a production gate or a Circular Manufacturing substitute.
- Polearm counter must display and calculate 35%, not inherit the generic 50% anti-mounted label.
- No catalog surface may imply bespoke War Elephant art/audio has shipped while #708/#714 own that work.

## Interaction replay checklist

- Select a War Elephant before and after Tactics completion; verify the owner-only prerequisite difference.
- Preview and resolve against an ordinary defender, then a Spearman/Pikeman; reopen preview after each.
- Switch to a second human current player and inspect the unit again; verify no private prerequisite/resource leakage.

### Task 1: Establish the typed unit and catalog contract

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/unit-modifier-definitions.ts`, `src/ui/unit-role-presentation.ts`
- Test: `tests/systems/city-system.test.ts`, `tests/systems/unit-chain-integrity.test.ts`, `tests/ai/ai-unit-roles.test.ts`

- [ ] **Step 1: Write failing catalog and chain tests**

Add expectations that `war_elephant` has `{ strength: 43, movementPoints: 2, visionRange: 2, productionCost: 110 }`, is Tactics-gated, has `pacing.band === 'power-spike'`, is trainable without Ivory, and is the explicit `beast_handler` Tactics successor. Assert its AI roles equal `['mobile', 'capture']`, its role is shock with anti-mounted vulnerability, its public tactical facts name open ground, rough terrain, shock, polearms, and live Ivory, and Beast Handler is no longer terminal.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/ai/ai-unit-roles.test.ts`

Expected: failures naming missing `war_elephant` catalog/type/role entries.

- [ ] **Step 3: Add the minimum typed catalog entries**

Add `war_elephant` to `UnitType`, `UNIT_DEFINITIONS`, `TRAINABLE_UNITS`, `UNIT_CLASS_BY_TYPE`, and `UNIT_ROLE_DEFINITIONS`. Add typed public tactical-fact text to `UnitRoleDefinition` and project it through `getUnitRolePresentation`, rather than reconstructing unit-ID strings in panels. Use the approved cost/stats/Tactics/upgrade metadata and the <=18-word role summary. Replace Beast Handler’s terminal reason with the explicit `obsoletedByTech: 'tactics', upgradesTo: 'war_elephant'` edge; give War Elephant its terminal reason.

- [ ] **Step 4: Run focused tests and commit**

Run the Step 2 command. Expected: PASS.

Commit: `feat(combat): add War Elephant catalog contract`

### Task 2: Implement exact terrain, polearm, and shock exchange rules

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-modifier-definitions.ts`, `src/systems/unit-modifier-system.ts`, `src/systems/combat-system.ts`
- Test: `tests/systems/unit-modifier-system.test.ts`, `tests/systems/combat-system.test.ts`, `tests/ui/combat-preview.test.ts`

- [ ] **Step 1: Write failing combat tests**

Test a War Elephant initiating attack: `1.20` on plains, `0.85` on each of forest/jungle/swamp/hills, and no rough penalty on volcanic/mountain. Test Spearman/Pikeman against War Elephant return `1.35`, while Spearman/Pikeman versus Knight retain `1.50`. Test a non-polearm defender’s return damage is multiplied by `0.85`, a polearm defender remains `1`, and the public exchange label appears in preview/history.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/ui/combat-preview.test.ts`

Expected: failures for absent terrain rule, 1.35 override, and shock exchange kind/label.

- [ ] **Step 3: Generalize the shared rules without per-consumer branches**

Add a typed terrain-set condition for War Elephant rather than reusing Chariot’s broad rough predicate. Add typed exchange-rule definitions and make `getCombatExchangeModifiers` select them from public attacker/defender types, retaining air behavior as rules. Add exact-defender counter precedence before generic class counters, so the War Elephant row replaces rather than stacks with anti-cavalry. Extend exchange summary type/label so preview and combat notification consume the shared result.

- [ ] **Step 4: Run focused tests and commit**

Run the Step 2 command. Expected: PASS.

Commit: `feat(combat): add War Elephant tactical rules`

### Task 3: Make Ivory a live-only production advantage

**Files:**
- Modify: `src/systems/resource-advantages.ts`, `src/systems/city-system.ts`
- Test: `tests/systems/production-costs.test.ts`, `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write failing production tests**

Assert War Elephant is legal without Ivory and costs 110. Assert live Ivory changes only its new city-production cost to `ceil(110 * 0.85)`. Assert no Ivory discount applies to another unit, to an upgrade/crisis caller, or when `materialSubstitution: 'ivory'` is supplied; preserve existing strategic-resource substitution behavior.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/production-costs.test.ts tests/systems/city-system.test.ts`

Expected: failures because Ivory has no advantage row and the API cannot distinguish live versus substituted material.

- [ ] **Step 3: Separate live resource and substitute eligibility**

Add Ivory as a `war_elephant` 15% advantage and extend the resource-advantage definition/helper to evaluate live resources separately from one optional substitution. Mark Ivory live-only; retain substitution behavior for existing eligible strategic-resource rows. Pass the two inputs explicitly from `getProductionCostForItem`.

- [ ] **Step 4: Run focused tests and commit**

Run the Step 2 command. Expected: PASS.

Commit: `feat(economy): add live Ivory War Elephant discount`

### Task 4: Wire temporary presentation and catalog-driven AI coverage

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`
- Test: `tests/renderer/sprites/sprite-catalog.test.ts`, `tests/audio/sfx-catalog.test.ts`, `tests/ai/ai-production.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/ui/unit-role-presentation.test.ts`

- [ ] **Step 1: Write failing presentation and AI tests**

Assert every sprite/SFX catalog covers `war_elephant`, the fallback path emits expected attack/death cues, and unit information renders its plain-language summary plus typed tactical facts. Add catalog-driven AI candidate fixtures for Explorer, Standard, and Veteran with Tactics completed: War Elephant must be eligible when mobile/capture demand exists and must use the same live-Ivory cost; no fixture may inspect rival resources or research. Difficulty must not alter unit legality, cost, or public exchange rules.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts tests/ai/ai-production.test.ts tests/ui/selected-unit-info.test.ts tests/ui/unit-role-presentation.test.ts`

Expected: failures for missing exhaustive asset entries and missing War Elephant AI/presentation coverage.

- [ ] **Step 3: Register catalog fallbacks and preserve shared consumers**

Register the approved temporary animal visual and beast-combat SFX fallback with `#708`/`#714` comments. Do not add AI unit-ID conditions: rely on Task 1 roles and existing candidate/production helpers. Render Task 1’s typed public tactical facts in selected-unit and city production role surfaces, while keeping completed-prerequisite state owner-scoped.

- [ ] **Step 4: Run focused tests and commit**

Run the Step 2 command. Expected: PASS.

Commit: `feat(presentation): wire War Elephant fallbacks`

### Task 5: Prove persistence and complete vertical regression verification

**Files:**
- Test: `tests/storage/save-persistence.test.ts` or `tests/storage/save-migrations.test.ts`, plus all Task 1–4 test files

- [ ] **Step 1: Write failing save and hot-seat boundary tests**

Create a pre-#674-shaped save containing a Beast Handler and queue entry; loading must preserve both without a schema change. Round-trip a current save containing a War Elephant unit and queue. Add owner/rival selected-unit presentation assertions proving public role facts render for both but incomplete Tactics/live-resource guidance is owner-scoped.

- [ ] **Step 2: Run the focused tests and verify red**

Run: `./scripts/run-with-mise.sh yarn test --run tests/storage/save-persistence.test.ts tests/storage/save-migrations.test.ts tests/ui/selected-unit-info.test.ts`

Expected: a meaningful red failure for the unimplemented new save/UI expectation, not a test setup error.

- [ ] **Step 3: Add only the compatibility/presentation code demanded by red tests**

If normalization already preserves plain unit/queue records, add no migration and assert `CURRENT_SAVE_SCHEMA_VERSION` is unchanged. Otherwise make the smallest idempotent normalizer change. Keep viewer filtering in the existing presentation helper, never in renderer state reads.

- [ ] **Step 4: Run focused checks, inspect, and commit**

Run: `scripts/check-src-rule-violations.sh` with every changed `src/` file, then the focused test command from Step 2 plus Tasks 1–4 focused tests. Inspect `git diff --check`, `git diff --stat origin/main...HEAD`, and full `git diff origin/main...HEAD`.

Commit: `test(combat): cover War Elephant persistence and hot seat`

### Task 6: Release verification

**Files:** none expected.

- [ ] **Step 1: Run required release checks**

Run: `./scripts/run-with-mise.sh yarn build`

Run: `./scripts/run-with-mise.sh yarn test:durable`

Run: `./scripts/run-with-mise.sh yarn test:durable:status`

Expected: build succeeds and durable status confirms a pass for the current `HEAD` and working tree.

- [ ] **Step 2: Final review**

Run `git status --short --branch`, `git diff --check origin/main...HEAD`, `git diff --stat origin/main...HEAD`, and inspect the complete source diff. Confirm the web build retains `/conquestoria/` behavior (no distribution files are changed).

## Plan self-review

- Spec coverage: Tasks 1–5 map every #674 rule, including balance, exact terrain, polearms, shock, UI/UX, AI/difficulty, live Ivory, saves, assets, solo, and hot-seat behavior.
- Placeholder scan: no TBD/TODO/“appropriate handling” placeholders remain.
- Type consistency: `war_elephant`, typed exchange rules, live-resource/substitution inputs, and exact-counter precedence are introduced before all consuming tasks.
