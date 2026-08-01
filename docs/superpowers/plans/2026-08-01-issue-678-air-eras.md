# Issue 678 Air-Era Fighter Split Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a Biplane → World War II Fighter → Jet Fighter progression with correct air operations, upgrades, catalog wiring, and save-safe queues.

**Architecture:** Keep unit identity, fighter capabilities, roles, tech gates, assets, and AI behavior in typed catalogs. Add one definition-driven interception-strength multiplier, consumed only by the canonical interceptor resolution, and one idempotent save repair for legacy Biplane queues invalidated by the new Air Superiority obsolescence.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM renderer, versioned JSON saves.

---

### Task 1: Define and expose the three-era fighter catalog

**Files:**
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras9.ts`, `src/systems/tech-definitions-eras10.ts`, `src/systems/combat-role-definitions.ts`, `src/systems/unit-modifier-definitions.ts`
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/city-system.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts`, `tests/ai/ai-unit-roles.test.ts`

- [ ] Write failing expectations for Biplane at Aviation, World War II Fighter at Air Superiority, its exact 240/42/4/8 carrier operation contract, explicit upgrade edges, and the postwar Jet Fighter description.
- [ ] Run the focused tests and confirm the new fighter is absent.
- [ ] Add `wwii_fighter` and typed interception metadata; move Biplane to Aviation and obsolete it at Air Superiority; add World War II Fighter and obsolete it at Jet Aviation; retitle Jet Fighter copy as postwar.
- [ ] Add typed role and counter facts, production icon, and complete structured tech unlock arrays.
- [ ] Re-run the focused tests and confirm all pass.

### Task 2: Apply the interception bonus only during interception

**Files:**
- Modify: `src/systems/air-operations-system.ts`, `src/systems/combat-system.ts`, `src/systems/combat-context.ts` as required by the existing canonical resolver
- Test: `tests/systems/air-operations-system.test.ts`, `tests/systems/combat-system.test.ts`

- [ ] Write failing tests proving World War II Fighter receives +20% only while intercepting, while a normal strike and another fighter do not inherit it.
- [ ] Run those tests and confirm the bonus is absent.
- [ ] Thread the typed fact through canonical air-strike interception resolution without an ID switch; record the applied fact for preview/history.
- [ ] Re-run tests and confirm deterministic selection, existing bomber counter-fire, and modifier facts remain intact.

### Task 3: Preserve legacy queued Biplanes and catalog fallbacks

**Files:**
- Modify: `src/storage/save-migrations.ts`, `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`
- Test: `tests/storage/save-migrations.test.ts`, `tests/renderer/sprites/sprite-catalog.test.ts`, `tests/audio/sfx-catalog.test.ts`

- [ ] Write failing save tests for legacy/current Biplane queues after Air Superiority, idempotent repair, and malformed/full-base safety.
- [ ] Run the migration test and confirm legacy queues are dropped today.
- [ ] Add a current-schema normalization repair that converts only now-illegal legacy Biplane queue items to World War II Fighter, leaving actual Biplane units and all other queue order intact.
- [ ] Register temporary fighter sprite and air SFX fallbacks.
- [ ] Re-run migration, sprite, and audio tests.

### Task 4: Prove solo, AI, hot-seat, UI, and balance behavior

**Files:**
- Test: `tests/ai/ai-production.test.ts`, `tests/ai/ai-unit-roles.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/ui/notification-routing.test.ts`, `tests/simulation/ai-playability-fixture.ts` if its catalog fixture requires the new progression

**Player Truth Table:**

| Before | Action | Immediate visible result |
|---|---|---|
| Airfield and Aviation | Select Biplane | Plain-language early-fighter identity and legal range/actions are visible |
| Air Superiority | Select World War II Fighter | Intercept, strike, and rebase remain visible; range reads `4/8` |
| Two-player hot seat | One player resolves interception | Only involved players receive details; a third player sees no hidden event |

**Misleading UI Risks:** World War II Fighter must not be described as a bomber, Jet Fighter must not be described as World War II-era, and carrier eligibility must agree with base compatibility.

**Interaction Replay Checklist:** Select each fighter, inspect the range/base line, begin interception, resolve an enemy strike, hand off the hot seat, and reopen the selected-unit panel.

- [ ] Write failing AI candidate/role and visible-panel tests for the new fighter and a hot-seat notification isolation test.
- [ ] Run the focused tests and confirm the catalog item and its plain-language presentation are absent.
- [ ] Use the existing definition-driven AI and selected-unit paths; add only the necessary test fixtures, not bespoke runtime branches.
- [ ] Run all mirrored tests, source-rule checks, build, and full suite.
