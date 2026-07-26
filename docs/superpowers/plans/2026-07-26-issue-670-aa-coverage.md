# Ground Anti-Aircraft Coverage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the city-only Anti-Air Battery boolean with canonical, viewer-safe ground anti-aircraft coverage that selects the strongest applicable provider in a stacking group.

**Architecture:** `air-defense-system.ts` owns typed provider definitions, operational filtering, distance calculations, and revision-scoped coverage caching. Combat context resolves coverage once and passes its serializable modifier facts into the existing combat/preview pipeline; air operations and future AI callers consume the same helper. The default-off overlay renders only the current viewer's known providers and has no player-facing toggle until the live map-control seam is identified and wired in the same change.

**Tech Stack:** TypeScript, Vitest, Canvas 2D renderer, existing fog-of-war and combat-modifier facts.

---

## File map

- `src/core/types.ts`: serializable anti-aircraft provider, coverage, and cache-key contracts.
- `src/systems/air-defense-system.ts`: provider catalog and canonical resolution, including visibility filtering and wrapped-map distance.
- `src/systems/combat-context.ts`: replaces `defenderCityHasAntiAir` with coverage obtained from the canonical helper.
- `src/systems/combat-system.ts`: applies the resolved flat modifier and emits applied/superseded modifier facts.
- `src/systems/air-operations-system.ts`: obtains defensive coverage through the same helper for strike resolution.
- `src/ui/combat-preview.ts`: shows coverage facts already emitted by combat; it must not infer providers from city state.
- `src/renderer/air-defense-overlay.ts`: pure renderer that draws viewer-safe provider ranges when passed enabled state.
- `tests/systems/air-defense-system.test.ts`: canonical system and privacy regressions.
- `tests/systems/air-domain.test.ts`, `tests/systems/air-operations-system.test.ts`, `tests/ui/combat-preview.test.ts`, `tests/renderer/air-defense-overlay.test.ts`: consumer and rendered-result regressions.

## Player Truth Table

| Before | Action | Immediate visible result |
|---|---|---|
| A viewer knows an Anti-Air Battery at a defended city | Opens combat preview for an air strike | Preview lists `Anti-Air Battery +8` from canonical modifier facts. |
| A viewer knows two same-group providers covering a defender | Opens combat preview | Preview shows the strongest applied source and the weaker source as superseded; strength does not add. |
| A viewer cannot see an enemy provider | Opens preview or coverage overlay | Neither provider identity nor coverage geometry is exposed. |
| Coverage overlay is disabled | Enables the map coverage toggle | Only current-viewer-known ranges appear; camera pan/zoom and reduced-motion state remain unchanged. |

## Misleading UI Risks

- “Covered” means at least one operational provider in the relevant stacking group can defend that hex against an air attacker; an out-of-radius, inactive, hidden, or wrong-domain provider is not coverage.
- A total must never imply additive immunity: same-group providers resolve to one strongest modifier, and losing providers are explicitly superseded in exact details.
- The overlay must not use raw state for an enemy viewer; its input is the viewer-filtered coverage result.

## Interaction Replay Checklist

- Open a preview against a locally covered defender and confirm the +8 row appears.
- Repeat with a land attacker and confirm no AA row appears.
- Add an overlapping same-group source, reopen preview, and confirm the original +8 stays the only applied total.
- Toggle the overlay on, pan/zoom, toggle it off, and confirm the map remains usable and no stale range marks remain.
- Switch hot-seat viewer, refresh the overlay, and confirm only the new viewer's earned provider knowledge remains.

### Task 1: Define canonical data and lock the legacy regression

**Files:**
- Modify: `tests/systems/air-domain.test.ts`
- Create: `tests/systems/air-defense-system.test.ts`
- Modify: `src/core/types.ts`

- [ ] **Step 1: Write failing system tests.** Add fixtures with a city Anti-Air Battery, a synthetic higher same-group provider, a disabled provider, and an unseen hostile provider. Assert radius boundaries, +8 legacy parity, strongest-only behavior, no effect for land attackers, and a viewer result that excludes unknown provider IDs and coordinates.
- [ ] **Step 2: Run the new test file.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts`; expect import/module failure because the canonical resolver does not exist.
- [ ] **Step 3: Add serializable contracts.** Define `AirDefenseProviderKind`, `AirDefenseProviderDefinition`, `AirDefenseCoverageEntry`, and `AirDefenseCoverageResult` in `src/core/types.ts`. Use stable provider IDs, a radius, flat defense modifier, stacking group, operational predicate discriminant, and viewer-visible label metadata; do not add save-schema state.
- [ ] **Step 4: Commit the red contract/test checkpoint.** Commit only the test and type contract with `test(combat): specify ground AA coverage` after confirming it remains red for the missing resolver.

### Task 2: Implement the canonical coverage resolver

**Files:**
- Create: `src/systems/air-defense-system.ts`
- Test: `tests/systems/air-defense-system.test.ts`

- [ ] **Step 1: Implement provider collection.** Start with the existing `anti_air_battery` city building as a radius-0, +8, `ground-air-defense` provider. Keep future Mobile AA, SAM, and Missile Cruiser definitions out of this slice until their units/buildings exist.
- [ ] **Step 2: Implement `resolveAirDefenseCoverage(state, defender, viewerId)`.** Use `hexDistance`/`wrappedHexDistance`, include only operational providers in range, group by `stackingGroup`, choose highest modifier with stable ID tie-breaking, and return applied plus superseded entries. Filter the presentation result against `getVisibility` for `viewerId`; owners may always see their own providers.
- [ ] **Step 3: Add revision-scoped caching.** Cache only immutable computed results behind a deterministic key comprising state turn/revision inputs, target coordinate, defending owner, attacker domain, and viewer ID. Return fresh arrays/objects to prevent caller mutation from poisoning a later read.
- [ ] **Step 4: Run the resolver tests.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts tests/systems/air-domain.test.ts`; expect all added tests to pass.

### Task 3: Route combat and air operations through coverage facts

**Files:**
- Modify: `src/systems/combat-context.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/systems/air-operations-system.ts`
- Modify: `tests/systems/air-domain.test.ts`
- Modify: `tests/systems/air-operations-system.test.ts`

- [ ] **Step 1: Write failing consumer tests.** Assert direct combat and `resolveAirStrike` receive the same +8 result from the canonical resolver, and that an overlapping same-group source is listed as `superseded` rather than added to defender strength.
- [ ] **Step 2: Run those focused tests.** Run `./scripts/run-with-mise.sh yarn test --run tests/systems/air-domain.test.ts tests/systems/air-operations-system.test.ts`; expect the new same-group fact assertions to fail because consumers still use `defenderCityHasAntiAir`.
- [ ] **Step 3: Replace the boolean seam.** Have `buildCombatContextForDefender` resolve coverage using the attacker owner as viewer for preview/legal combat facts, pass the applied modifier and all coverage facts as `CombatModifierFact`s, and delete `defenderCityHasAntiAir`. In `calculateCombatStrengths`, apply only the canonical applied flat bonus for air-domain attackers.
- [ ] **Step 4: Use the same context in air operations.** Ensure both interceptor and target exchanges call their existing `buildCombatContextForDefender` path; do not duplicate provider scanning in `air-operations-system.ts`.
- [ ] **Step 5: Run focused consumers.** Re-run the Task 3 command and `scripts/check-src-rule-violations.sh src/systems/air-defense-system.ts src/systems/combat-context.ts src/systems/combat-system.ts src/systems/air-operations-system.ts`; expect success.

### Task 4: Present facts and viewer-safe range geometry

**Files:**
- Modify: `src/ui/combat-preview.ts`
- Create: `src/renderer/air-defense-overlay.ts`
- Modify: `tests/ui/combat-preview.test.ts`
- Create: `tests/renderer/air-defense-overlay.test.ts`

- [ ] **Step 1: Write failing presentation tests.** Assert the combat preview emits `Anti-Air Battery +8` from supplied applied facts, emits a readable superseded row when supplied a superseded fact, and never derives labels from buildings. Assert the renderer produces no elements for an empty/hidden result, adds icon-and-text legend data for visible ranges, and marks reduced motion without changing camera transforms.
- [ ] **Step 2: Run presentation tests.** Run `./scripts/run-with-mise.sh yarn test --run tests/ui/combat-preview.test.ts tests/renderer/air-defense-overlay.test.ts`; expect renderer module failure and missing superseded output.
- [ ] **Step 3: Render only canonical facts.** Extend preview formatting for `superseded` facts without inventing providers. Implement the overlay as a pure, current-viewer-filtered render helper that receives coverage entries, camera state, and reduced-motion state; it must not read `GameState` directly.
- [ ] **Step 4: Wire only a complete live control.** Identify the existing map controls’ renderer lifecycle and add a 44-pixel, icon-plus-text, default-off toggle using `createGameButton`; pass `state.currentPlayer` and fresh resolver output on every render. If no stable control seam exists, omit the toggle and overlay from this PR rather than shipping unreachable UI.
- [ ] **Step 5: Run presentation tests and source checks.** Run the Task 4 test command plus `scripts/check-src-rule-violations.sh src/ui/combat-preview.ts src/renderer/air-defense-overlay.ts`; expect success.

### Task 5: Verify deterministic balance and complete review

**Files:**
- Test: `tests/systems/air-defense-system.test.ts`

- [ ] **Step 1: Add a deterministic air-exchange fixture.** Use a fixed combat seed to prove one +8 provider changes expected air damage within the approved 20–35% envelope, while two same-group providers have the exact same outcome as the stronger provider alone.
- [ ] **Step 2: Run focused verification.** Run the mirrored system/UI/renderer tests in one command and all changed-source rule checks.
- [ ] **Step 3: Inspect diffs.** Run `git diff --check`, `git diff --stat origin/main...HEAD`, `git diff --stat`, and inspect each full diff. Confirm no save version changed and no unreleased future provider appears.
- [ ] **Step 4: Run release verification.** Run `./scripts/run-with-mise.sh yarn build` and `./scripts/run-with-mise.sh yarn test`; record their exit codes and summaries.
- [ ] **Step 5: Commit the implementation.** Commit the focused change with a conventional subject such as `feat(combat): add canonical ground AA coverage`.

## Plan self-review

- Exact contract coverage: typed providers, operational/radius filtering, strongest same-group stacking, viewer filtering, existing +8 parity, cache behavior, canonical combat/air caller reuse, preview facts, and overlay boundaries each map to a task.
- Scope control: future source types are typed but not made reachable; no save schema or speculative AI policy is introduced.
- Negative coverage: land attacker, inactive/out-of-range provider, hidden provider, and superseded provider are explicit test cases.
