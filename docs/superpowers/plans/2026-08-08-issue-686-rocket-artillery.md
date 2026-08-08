# Issue 686 Rocket Artillery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Rocket Artillery and deterministic, bounded saturation splash without leaking information or duplicating combat mutation paths.

**Architecture:** Unit catalog metadata declares the optional area-damage capability. A pure combat helper selects deterministic legal secondary targets from earned visibility, while `applyCombatOutcomeToState` remains the single mutation path used by players, AI, and pirates. `CombatResult` carries display-safe facts to the existing preview, history, notification, visual, and audio routes.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM combat presentation, seeded combat resolution.

---

## Files and responsibilities

- `src/core/types.ts`: Rocket Artillery unit/result/splash type contracts.
- `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras10.ts`, `src/systems/combat-role-definitions.ts`: catalog, gate, role, and honest text.
- `src/systems/combat-system.ts`: pure visible, stable, bounded splash selection and result facts.
- `src/systems/combat-reward-system.ts`: one post-primary state mutation path for secondary damage.
- `src/ai/ai-tactics.ts`: score legal visible secondary damage through the canonical resolver.
- `src/ui/combat-preview.ts`, `src/ui/notification-routing.ts`: plain-language preview/history/one notification group.
- `src/renderer/sprites/sprite-catalog.ts`: valid temporary Rocket Artillery catalog mapping.
- Mirrored `tests/**`: catalog, resolver, mutation, AI, UI, sprite, save-compatibility, solo, and hot-seat regressions.

## Task 1: Catalog, typed capability, and honest player text

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/tech-definitions-eras10.ts`
- Modify: `src/systems/combat-role-definitions.ts`
- Modify: `tests/systems/unit-system.test.ts`
- Modify: `tests/systems/city-system.test.ts`
- Modify: `tests/systems/combat-role-definitions.test.ts`
- Modify: `tests/systems/unit-chain-integrity.test.ts`
- Modify: `tests/ui/selected-unit-info.test.ts`
- Modify: `tests/ui/unit-role-presentation.test.ts`

- [ ] Write failing catalog tests for `rocket_artillery`: strength 57, movement 2, cost 260, `{ kind: 'bombard', range: 3, targets: ['unit', 'city'] }`, Rocketry gate, `artillery.obsoletedByTech === 'rocketry'`, and `artillery.upgradesTo === 'rocket_artillery'`.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-system.test.ts tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts`; confirm the feature assertions fail because the unit and edge are absent.
- [ ] Add `rocket_artillery` to `UnitType`, `UNIT_DEFINITIONS`, `TRAINABLE_UNITS`, Rocketry `unlocksUnits`, and typed siege role data. Define `UnitSplashCapability { damageFraction: 0.25; maxTargets: 2; label: string }` and set it only on Rocket Artillery. Replace Artillery’s obsolete “future content” strings with its real successor and give Rocket Artillery the 18-word plain-language role sentence.
- [ ] Add negative tests proving Artillery and other siege units have no splash capability and existing era/difficulty legality is unchanged.
- [ ] Re-run the focused catalog tests; inspect the production/selected-unit text for the exact player-facing contract.

## Task 2: Pure bounded splash selection and result facts

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/main.ts`
- Modify: `src/ai/ai-major-turn.ts`
- Modify: `src/ai/ai-tactics.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/air-operations-system.ts`
- Modify: `src/systems/minor-civ-system.ts`
- Modify: `src/systems/pirate-system.ts`
- Modify: `tests/systems/combat-system.test.ts`

- [ ] Write failing tests for exported `resolveBoundedSplash(state, attacker, defender, finalPrimaryDamage)`: a visible hostile military pair receives `Math.round(finalPrimaryDamage * 0.25)` in lexical ID order, with a maximum of two records.
- [ ] Add negative cases: allied unit, civilian, primary defender, city, embarked cargo, hidden hostile, non-adjacent hostile, a third eligible unit, a non-splash attacker, and zero primary damage all return no inappropriate record.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/combat-system.test.ts`; confirm failure is an absent helper/result shape, not fixture setup.
- [ ] Add serializable `CombatSplashHit { unitId; damage }` and optional `CombatResult.splashHits`. Add an optional final `state?: GameState` argument to `resolveCombat`; when supplied, use canonical hostility, fog, military-class, cargo, and hex-neighbor utilities to calculate the hit records after final primary damage. Sort IDs before slicing. The helper must not use RNG, mutate state, call `resolveCombat`, or inspect unearned information.
- [ ] Pass the pre-combat `GameState` from every production caller (`main`, AI-major, AI-tactics, basic AI, turn manager, air operations, minor-civ, and pirate systems). Keep test-only callers able to omit state and keep every non-Rocket result byte-for-byte equivalent apart from omitted optional fields.
- [ ] Re-run combat-system tests and add deterministic repeated-seed assertions.

## Task 3: Shared post-primary state mutation

**Files:**
- Modify: `src/systems/combat-reward-system.ts`
- Modify: `tests/systems/combat-reward-system.test.ts`
- Modify: `tests/ai/ai-tactics.test.ts`
- Modify: `tests/systems/pirate-system.test.ts`

- [ ] Write failing outcome tests that apply a precomputed `splashHits` result: secondary units lose capped health after primary resolution, a lethally hit secondary target is removed from unit/civilization/cargo state, and a target already removed by primary combat is ignored safely.
- [ ] Add negative assertions that secondary damage produces no extra reward, experience, diplomacy record, capture, retaliation, recursive splash, or duplicate combat event.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/combat-reward-system.test.ts tests/ai/ai-tactics.test.ts tests/systems/pirate-system.test.ts`; confirm the secondary-state assertions fail before mutation code exists.
- [ ] Apply `result.splashHits` after normal primary/capture resolution through a focused helper that uses the existing removal logic. Thread all mutation copies immutably and preserve one result/event per primary attack.
- [ ] Add player-versus-AI and pirate-path parity fixtures that call their real combat routes and compare the same eligible secondary health outcomes.
- [ ] Re-run the focused outcome/AI/pirate tests.

## Task 4: AI valuation and player-visible, hot-seat-safe presentation

**Files:**
- Modify: `src/ai/ai-tactics.ts`
- Modify: `src/ui/combat-preview.ts`
- Modify: `src/ui/notification-routing.ts`
- Modify: `tests/ai/ai-tactics.test.ts`
- Modify: `tests/ui/combat-preview.test.ts`
- Modify: `tests/ui/combat-resolved-presentation.test.ts`
- Modify: `tests/presentation/register-combat-presentation.test.ts`

**Player Truth Table**

| Before | Action | Immediate visible result |
| --- | --- | --- |
| A visible Rocket Artillery target has two legal nearby enemies | Preview the attack | Plain text says the primary strike can damage up to two nearby visible enemies and shows the exact bounded amount. |
| The same attack resolves for the current viewer | Attack | Existing combat visual and one grouped notification report the primary result plus the number of secondary hits. |
| Another hot-seat player cannot see the combat | Handoff/render | No target identity, notification, visual, or audio signal is delivered. |

**Misleading UI Risks**

- Do not claim splash when the target count is zero or a candidate is hidden/civilian/cargo.
- Do not name a filtered secondary target in a viewer’s preview or history.
- Do not show multiple combat notifications for one primary attack.

**Interaction Replay Checklist**

- Preview a two-target strike, resolve it, inspect the open combat/notification surface.
- Repeat against a target with zero eligible secondary units.
- Change `currentPlayer` between the same result’s presentation and confirm the non-viewer receives nothing.

- [ ] Write failing tests for a public preview/notification summary derived from `splashHits`, including zero-hit omission and exact count/damage text.
- [ ] Write a failing AI tactical-score fixture with one visible eligible secondary and one hidden candidate; assert only the visible damage changes the chosen score.
- [ ] Run the focused AI/UI/presentation tests and confirm failures are feature-absence failures.
- [ ] Route summary text from the result facts, not a UI rescan. Reuse the existing combat resolved event and sound director route; do not add a Rocket-specific SFX, extra event, panel, or button.
- [ ] Re-run the focused tests, including the hot-seat visibility negative case.

## Task 5: Temporary rendering, saves, balance, and integration verification

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/systems/city-defense.test.ts`

- [ ] Write a failing sprite-catalog coverage assertion for Rocket Artillery and a save regression that loads a pre-feature `GameState` fixture, then trains/upgrades and resolves a Rocket Artillery attack without a schema migration.
- [ ] Run the targeted sprite/storage test; confirm missing catalog entry and the pre-feature save scenario fail as expected.
- [ ] Register the approved temporary siege sprite fallback. Keep `splashHits` event-local: the audited save format contains no persisted combat result/history, so add no normalizer or schema version.
- [ ] Add deterministic balance fixtures covering Artillery predecessor, Rocket Artillery, a same-era generalist, direct-engagement counterplay, and one secondary hit; assert no secondary hit one-shots a healthy peer.
- [ ] Run `scripts/check-src-rule-violations.sh` for every changed `src/` file; then run all mirrored tests in one command, `./scripts/run-with-mise.sh yarn build`, `./scripts/run-with-mise.sh yarn test:durable`, and `./scripts/run-with-mise.sh yarn test:durable:status`.
- [ ] Inspect `git diff --check`, `git diff --stat origin/main...HEAD`, `git diff --stat`, and full source diff before commit/PR.
