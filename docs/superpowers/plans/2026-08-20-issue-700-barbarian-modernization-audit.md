# #700 Barbarian Modernization Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bound modernized barbarian camp forces and prove their composition, difficulty, persistence, notification, solo, and hot-seat behavior.

**Architecture:** Keep roster legality in `barbarian-roster.ts`, cap selection in the pure composer, and lifecycle/target-profile sequencing in `barbarian-system.ts`. The turn manager remains the only entity creator; the existing raider presentation route remains the only notification consumer.

**Tech Stack:** TypeScript, Vitest, serializable `GameState`, seeded selection, existing event bus.

---

### Task 1: Lock the bounded camp-force contract

**Files:**
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `src/systems/barbarian-system.ts`

- [ ] Write a failing long-quiet-period fixture with a due camp at strength 10 and ten assigned barbarian units. Assert `processPurposefulBarbarians()` proposes no spawn, leaves the active force intact, keeps strength at 10, and still advances the deterministic cooldown. Add the companion nine-unit case that produces exactly one legal reinforcement and caps the returned strength at 10.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-system.test.ts`; confirm the cap fixture fails because the live system proposes another reinforcement and permits strength 11.
- [ ] In `processPurposefulBarbarians()`, derive assigned units before admitting a due spawn; only call `selectBarbarianReinforcement()` when `assigned.length < Math.min(camp.strength, 10)`. Preserve occupancy selection, seeded selection, cooldown reset, and turn-manager spawning. In `processBarbarians()`, replace uncapped `strength + 1` with `Math.min(10, strength + 1)`.
- [ ] Add a two-camp fixture proving each camp independently respects its own cap and neither camp's units count toward the other's force.
- [ ] Re-run the focused test and commit with `fix(700): bound barbarian camp force growth`.

### Task 2: Make difficulty selection target-scoped

**Files:**
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `src/systems/barbarian-system.ts`
- Test: `tests/core/turn-manager.test.ts`

- [ ] Write failing fixtures with equal visible worker/resource choices for a human Explorer, a human Veteran, and an AI target. Assert the resource-vs-worker preference uses the selected target's profile; assert AI is Standard regardless of the game-wide challenge; assert a targetless patrol is Standard. Add a two-human hot-seat fixture that swaps `currentPlayer` without swapping each target's saved challenge.
- [ ] Run the barbarian-system test and confirm it fails because `defaultProfile` is calculated from `resolveOpponentChallenge(state)` before the target is chosen.
- [ ] Refactor only the planning seam: return candidate raid plans before choosing their priority, resolve each candidate plan's owner through the existing city/unit/resource source, and compare them with `OPPONENT_CHALLENGE_PROFILES[resolvePressureSeverityForCiv(state, owner)]`. Use `standard` when the plan has no owner. Do not pass a difficulty argument to the composer or alter roster legality.
- [ ] Through `processTurn()`, prove spawned type legality is identical for Explorer, Standard, and Veteran while the expected raid-plan preference can differ.
- [ ] Re-run focused tests and commit with `fix(700): scope barbarian decisions to target challenge`.

### Task 3: Complete the deterministic balance matrix

**Files:**
- Modify: `tests/systems/barbarian-force-composer.test.ts`
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `tests/systems/barbarian-pressure.test.ts`

- [ ] Add table-driven contexts for E2–4 Chariot, E4–6 Trebuchet, E6–8 Cavalry/Cuirassier exclusion, E9–11 Armored Car, armor-gated Anti-Tank Gun, air-gated single Mobile AA, and E10+ Mechanized Infantry. For three fixed seeds per context, assert legal window, role percentages, mutual exclusion, and per-camp/pre-escalation cap compliance.
- [ ] Add negative fixtures: missing/expired pressure, distant unseen armor, unrelated resource/research/current-viewer changes, excluded units, and legacy catalog-eligible assigned units outside their original window. All must leave selection legal and deterministic.
- [ ] Add lifecycle fixtures for due/non-due cooldowns, blocked spawn tiles, impassable tiles, strength cap, no legal candidate, and exact camp-home mapping after `processTurn()` creates the unit.
- [ ] Run `scripts/check-src-rule-violations.sh src/systems/barbarian-system.ts` and `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-force-composer.test.ts tests/systems/barbarian-pressure.test.ts tests/systems/barbarian-system.test.ts tests/core/turn-manager.test.ts`; commit with `test(700): audit barbarian balance and parity`.

### Task 4: Prove load and presentation safety

**Files:**
- Modify: `tests/storage/save-migrations.test.ts`
- Modify: `tests/presentation/register-raider-presentation.test.ts`
- Modify: `tests/ui/notification-routing.test.ts`
- Modify: `tests/systems/world-pressure-notification-volume.test.ts`

- [ ] Add a schema-13 and current-schema camp fixture with valid and expired pressure, a due cooldown, camp-home mapping, and human challenges. Migrate/load each, process the next due turn, and assert the selected type and normalized pressure equal a freshly constructed equivalent state. Assert migration remains idempotent and does not introduce a schema bump.
- [ ] Add presentation/routing fixtures that a visible camp spawn yields one concise role-readable notification per camp to only viewers who can see it; muted/reduced-motion behavior retains text/icon feedback; an incoming hot-seat viewer with no visibility receives nothing.
- [ ] Extend the existing notification-volume simulation only if barbarian spawn routing changes; preserve its three-notification-per-turn upper bound.
- [ ] Run the storage, presentation, routing, and notification-volume tests; commit with `test(700): cover saves and safe barbarian presentation`.

### Task 5: Sync the delivery record and verify

**Files:**
- Modify: `docs/superpowers/plans/2026-08-20-issue-700-barbarian-modernization-audit.md`
- Modify: `docs/superpowers/specs/2026-08-20-issue-700-barbarian-modernization-audit-design.md` only if implementation changes an approved constraint.

- [ ] Mark completed plan tasks and record the implementation PR number in the plan header before publication.
- [ ] Run `git diff --check`, `git diff --stat origin/main...HEAD`, and `git diff --stat`; inspect the full source and test diff.
- [ ] Run `scripts/check-src-rule-violations.sh` for each changed source file, then `bash scripts/run-with-mise.sh yarn build`, `bash scripts/run-with-mise.sh yarn test:durable`, and `bash scripts/run-with-mise.sh yarn test:durable:status` as separate commands.
- [ ] Commit plan-status synchronization with `docs(700): record barbarian audit completion`.

## Plan self-review

- The cap task owns the new bounded-force behavior; it does not change unit legality.
- The target-profile task resolves the review finding without leaking target state into the composer.
- The audit matrix covers different eras, play styles, difficulties, player ages through readable visible feedback, AI, solo, hot-seat, persistence, and regressions.
- No task adds a player action, queue, or filtered UI surface; the existing notification route is tested as a viewer-scoped passive surface.
