# Issue 547 Foundations and Legibility Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Explicit user approval
> is required before using subagents in this repository.

**Goal:** Establish save-safe upgrade, prerequisite, role, preview, and anti-aircraft
contracts before any new roster item becomes reachable.

**Architecture:** Extend typed definitions in `src/core/types.ts`, then place eligibility
and calculation logic in focused system helpers. Existing production, research, upgrade,
AI, and presentation callers delegate to those helpers. Tests reject inferred edges,
partial conjunctive gates, hidden-information leaks, and UI/gameplay drift.

**Tech Stack:** TypeScript, Vitest, DOM tests, Canvas presentation helpers.

---

## Task 1: Fix upgrade integrity

**Files:** Modify `src/systems/unit-upgrade-system.ts`, `src/core/types.ts`,
`src/ui/selected-unit-info.ts`; test `tests/systems/unit-upgrade.test.ts`,
`tests/ai/ai-upgrades.test.ts`, `tests/ui/selected-unit-info.test.ts`,
`tests/storage/save-migrations.test.ts`.

1. Add failing tests proving `applyUpgrade` preserves health percentage and experience,
   consumes movement/action, reports every missing requirement, and cannot produce an
   unbased or over-capacity aircraft.
2. Add an `UpgradeEvaluation` result with `targetType`, `cost`, `missing[]`,
   `destination`, and preserved-state preview. Replace the current single
   `'missing-building'` result without weakening existing callers.
3. Route domain changes through the canonical base-capacity checks and air-base assignment
   used by `src/systems/air-operations-system.ts`.
4. Render source → target, cost, health, experience, and all blockers in the live selected
   unit surface; assert immediate post-upgrade refresh and 44-pixel action target.
5. Add a legacy round trip and AI caller parity test; run the execution loop.

## Task 2: Add conjunctive prerequisites

**Files:** Modify `src/core/types.ts`, `src/systems/city-system.ts`,
`src/systems/unit-upgrade-system.ts`, `src/ai/ai-production.ts`,
`src/ai/ai-research.ts`, `src/ui/city-panel.ts`, `src/ui/tech-panel.ts`; add
`src/systems/production-prerequisites.ts`; test mirrored files plus
`tests/systems/tech-unlocks-consistency.test.ts`.

1. Write negative tests proving one of two required technologies is insufficient in
   production, upgrades, AI candidacy, research planning, city UI, and unlock copy.
2. Add optional `requiredTechs` to trainable/building definitions and implement
   `evaluateProductionPrerequisites(definition, context)` returning ordered satisfied and
   missing facts. During migration, a legacy `techRequired` contributes one required ID.
3. Replace caller-local single-tech checks with the helper; do not change legendary
   wonder `requiredTechs`.
4. Render `Requires A + B` with individual satisfied states and keep blocked catalog items
   reachable in the explanatory view.
5. Add catalog coverage rejecting empty, duplicate, missing, and permanently unreachable
   prerequisite IDs.

## Task 3: Define roles, counters, and explicit upgrade families

**Files:** Modify `src/core/types.ts`, `src/systems/unit-system.ts`,
`src/systems/city-system.ts`, `src/ai/ai-unit-roles.ts`; add
`src/systems/combat-role-definitions.ts`; test `tests/ai/ai-unit-roles.test.ts`,
`tests/systems/unit-chain-integrity.test.ts`, `tests/systems/unit-system.test.ts`.

1. Add failing full-catalog tests for primary role, optional secondary roles, explicit
   `upgradesTo`, valid targets, acyclic chains, documented domain changes, and nonempty
   role summaries.
2. Define `CombatRole`, `UpgradeFamily`, typed counter relationships, and presentation
   metadata; populate every existing trainable unit before enabling strict coverage.
3. Refactor AI role lookup to consume definitions and remove equivalent unit-ID rosters.
4. Reject accidental terminal combat units unless explicitly `terminal: true` with a
   player-facing reason.
5. Verify existing civ replacements retain their intended successor and strategic role.

## Task 4: Expose roles and upgrade chains

**Files:** Modify `src/ui/city-panel.ts`, `src/ui/selected-unit-info.ts`,
`src/ui/tech-panel.ts`; add `src/ui/unit-role-presentation.ts`; test mirrored UI files.

1. Build a Player Truth Table for eligible, blocked, obsolete, upgradeable, and terminal
   states, including current-player changes.
2. Add failing rendered-DOM tests for an 18-word-or-shorter role summary, icon-plus-text
   counters, acronym expansion, expandable exact values, and the full reachable catalog.
3. Implement a pure presentation model derived from definitions and canonical
   prerequisites; recommendations reorder but never filter the full list.
4. Add one-time viewer-scoped hints and negative tests for cross-player dismissal leakage.
5. Replay queue/add/upgrade/current-player interactions and assert the same panel updates
   immediately without reopening.

## Task 5: Expose named modifiers in preview and history

**Files:** Modify `src/systems/combat-context.ts`,
`src/systems/unit-modifier-system.ts`, `src/ui/combat-preview.ts`,
`src/ui/combat-resolved-presentation.ts`; test mirrored files.

1. Add failing tests for applied, ignored, capped, and superseded modifier rows using the
   exact gameplay result.
2. Introduce serializable `CombatModifierFact` values containing key, label parameters,
   source scope, signed value, and stacking outcome.
3. Have combat calculation emit facts at evaluation time; never reconstruct one-time
   effects by scanning final state.
4. Render concise rows by default and an exact calculation expansion; redact unauthorized
   source identity while preserving the visible total.
5. Add human, AI-triggered, and hot-seat viewer tests plus no-color-only assertions.

## Task 6: Canonical ground AA coverage

**Files:** Modify `src/core/types.ts`, `src/systems/combat-system.ts`,
`src/systems/air-operations-system.ts`; add `src/systems/air-defense-system.ts`,
`src/renderer/air-defense-overlay.ts`; test mirrored systems plus
`tests/ui/combat-preview.test.ts` and a new
`tests/renderer/air-defense-overlay.test.ts`.

1. Add tests for radius, operational status, strongest-source same-group stacking, no
   hidden provider/aircraft leak, and identical legality across all difficulties.
2. Define `AirDefenseProviderDefinition` and
   `resolveAirDefenseCoverage(state, defender, viewerId)` with revision-scoped caching.
3. Route city, unit, naval, interception, preview, and AI threat evaluation through the
   helper; preserve the existing Anti-Air Battery +8 behavior.
4. Add a default-off current-viewer overlay with icon/text legend, reduced-motion
   treatment, pan/zoom stability, and 44-pixel toggle.
5. Run deterministic air-exchange fixtures proving one provider changes expected damage
   by 20–35% and stacking cannot nullify air play.

## Foundation merge checkpoint

Run full build/tests and inspect the six PRs together for type duplication, UI truth
drift, hidden-information leaks, and dead branches. No new unit definition may be
reachable before this checkpoint is green.
