# #721 Tactical Legendary-Wonder Rewards Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the reusable, definition-driven tactical-effect vocabulary and canonical resolvers required by the three future military legendary wonders, without adding those wonder definitions.

**Architecture:** `LegendaryWonderReward.tacticalEffects` is a discriminated, serializable data contract. A new leaf resolver reads completed-wonder definitions and supplies training, healing, Citadel defense, AA radius, interception, and AI-value queries to existing canonical systems. Runtime grant/claim state is owner scoped and normalized once; no resolver switches on a wonder ID.

**Tech Stack:** TypeScript, Vitest, Vite, serialized `GameState` migrations, existing legendary-wonder, combat-context, turn-manager, and air-defense systems.

---

## Current-main audit

- Base: `f4a3196d8945b7fe8da2e4878a8795089661c083` (`origin/main`), after #720 / PR #903.
- `LegendaryWonderReward` currently contains only text/yield/research values and `getLegendaryWonderDefinitions()` deep-clones only yield objects. Add typed effects and clone their arrays/role lists.
- Unit creation is centralized in `processTurn()` in `src/core/turn-manager.ts`; Barracks XP is applied there. A tactical training helper must run after unit construction and existing civilian/spy filtering, before air basing/store insertion.
- Existing turn-end healing computes `getHealingBonus()` and then calls `healUnit()` only when `getRestAvailability(unit.landSupply).canRest`. Fort healing must contribute to that bonus, never mutate health separately.
- `buildCombatContextForDefender()` is the shared human/AI/preview seam. Citadel defense belongs there with a visible public fact.
- `providersForOwner()` in `src/systems/air-defense-system.ts` is the single AA provider source. SAM already requires Radar and has radius 2; only that city provider may become radius 3.
- `resolveAirStrike()` selects/settles the interceptor and already persists #720 success facts. The first-interception effect must be claimed before `resolveCombat`, regardless of combat success, without modifying #720 success-fact semantics.
- Current schema is 21. Use 22 only if the owner-era XP grants and owner-turn interception claims are persisted here; do not reserve later versions.
- The approved legendary roster intentionally contains none of #722–#724. This PR therefore has no player-reachable tactical effect; generic resolver tests inject typed effects and production calls remain inert until those definition PRs land.

## Player truth and non-goals

There is no new action, queue, or panel in this foundation. Existing wonder cards continue showing the existing reward `summary`; no UI can claim an effect before a future definition includes it. The future definitions must provide plain first-sentence reward descriptions with exact values, caps, reset timing, exclusions, and supersession rules.

Misleading-state guardrail: a resolver may return an effect only when its definition belongs to a wonder completed by that owner. A merely seeded, questing, building, rival-owned, hidden, or lost-race project must return none. No audio, visual, overlay, notification, or strategic-deterrence surface changes in this issue.

## Files and responsibilities

- Modify `src/core/types.ts`: discriminated tactical effect definitions, owner-scoped effect runtime state, and `LegendaryWonderReward.tacticalEffects`.
- Modify `src/core/game-state.ts`: initialize empty tactical-effect state for new and hot-seat games.
- Create `src/systems/legendary-wonder-tactical-effects.ts`: definition selection, effect resolution, deterministic training grant/claim mutation, healing bonus query, Citadel defense query, SAM-radius override, and generic AI value query.
- Modify `src/systems/legendary-wonder-definitions.ts`: deep clone tactical effects and nested arrays.
- Modify `src/core/turn-manager.ts`: apply a resolved training grant and Fort-healing bonus through existing canonical paths.
- Modify `src/systems/unit-modifier-system.ts`: accept the resolved Fort-healing flat bonus as a labeled ordinary healing contribution.
- Modify `src/systems/combat-context.ts` and its shared combat context type: apply the non-stacking Citadel multiplier/fact to every preview and caller.
- Modify `src/systems/air-defense-system.ts`: map qualifying SAM providers to the resolved radius without changing provider strength/stacking/visibility.
- Modify `src/systems/air-operations-system.ts`: atomically claim the first eligible owner-turn interception before settlement and add its visible combat fact.
- Modify `src/storage/save-migrations.ts`: schema-22 initialization/validation/dedupe/idempotence for tactical runtime state, only after confirming no competing schema has landed.
- Tests: `tests/systems/legendary-wonder-tactical-effects.test.ts`, plus mirrored turn-manager, unit-modifier, combat-context, air-defense, air-operations, legendary-wonder-definitions, game-state, and save-migrations suites.

### Task 1: Define and normalize the tactical-effect contract

**Files:** `src/core/types.ts`, `src/core/game-state.ts`, `src/storage/save-migrations.ts`, `tests/storage/save-migrations.test.ts`, `tests/core/game-state.test.ts`

- [ ] Write failing tests that migrate schema 21 saves with absent, duplicate, malformed, cross-owner, and current tactical state; assert new/hot-seat games start empty and normalization is idempotent.
- [ ] Run the focused migration/game-state tests; confirm the new state and normalizer APIs are absent.
- [ ] Add effect variants with exact fields: role XP (`roles`, `experience`, `maxGrantsPerEra`, `aiValue`), Fort healing (`amount`, `aiValue`), adjacent Citadel defense (`multiplier`, `stackingGroup`, `excludedRoles`, `aiValue`), AA extension (`providerKind: 'sam-site'`, `radius`, `aiValue`), and first-interception (`multiplier`, `stackingGroup`, `aiValue`). Add `legendaryWonderTacticalEffects` state containing per-owner `{ era, grantedRoles }` and `{ claimedTurn }` records.
- [ ] Advance to schema 22 and normalize only structurally valid nonempty owner/role/turn data. Never reconstruct grants or claims from units/history.
- [ ] Re-run the focused migration/game-state tests; commit `feat(547): define tactical wonder effect state`.

### Task 2: Add the leaf resolver and immutable definition retrieval

**Files:** `src/systems/legendary-wonder-tactical-effects.ts`, `src/systems/legendary-wonder-definitions.ts`, `tests/systems/legendary-wonder-tactical-effects.test.ts`, `tests/systems/legendary-wonder-definitions.test.ts`

- [ ] Write failing resolver tests using supplied typed definitions: completed owner sees effects; rival, uncompleted, seeded, and unknown definitions see none; strongest same-group effect wins by explicit deterministic order; AI value sums only active effects.
- [ ] Add a definition-clone regression: mutate returned effect role list and prove a second `getLegendaryWonderDefinitions()` call is unchanged.
- [ ] Implement `getCompletedLegendaryWonderTacticalEffects(state, civId, definitions = getLegendaryWonderDefinitions())` and typed selectors. Selectors must use `completedLegendaryWonders[wonderId].ownerId === civId`, sorted wonder/effect order, never an ID branch.
- [ ] Implement `getTacticalWonderAiValue` and pure queries for training, healing, Citadel defense, SAM radius, and eligible first-interception modifier.
- [ ] Re-run resolver/definition tests; commit `feat(547): resolve tactical wonder effects from definitions`.

### Task 3: Apply role-training XP through the existing training seam

**Files:** `src/core/turn-manager.ts`, `src/systems/legendary-wonder-tactical-effects.ts`, `tests/core/turn-manager.test.ts`, `tests/systems/legendary-wonder-tactical-effects.test.ts`

- [ ] Write failing tests for a provided completed effect: first new land combat unit in each allowed role gains exactly +10 XP; Barracks stacks normally; second same-role unit, fifth role/cap breach, civilian, spy, air, naval, upgrade/capture/crisis path, rival owner, and later call in same era do not gain it.
- [ ] Add era-transition test: a new era makes the role eligible again; unused prior-era roles do not transfer; human and AI turn processing call the identical helper.
- [ ] Implement one immutable `applyLegendaryWonderTrainingEffects(state, input)` result containing updated state, unit XP bonus, and public explanation data. Call it immediately after `createUnit`/existing Barracks handling and before the unit is based or stored.
- [ ] Re-run focused training tests; commit `feat(547): apply per-era tactical training rewards`.

### Task 4: Integrate Fort healing and adjacent Citadel defense

**Files:** `src/systems/legendary-wonder-tactical-effects.ts`, `src/systems/unit-modifier-system.ts`, `src/core/turn-manager.ts`, `src/systems/combat-context.ts`, `src/systems/combat-system.ts`, `tests/systems/unit-modifier-system.test.ts`, `tests/core/turn-manager.test.ts`, `tests/systems/combat-context.test.ts`

- [ ] Write failing healing tests proving +5 applies only to a supplied friendly land combat unit on a completed owned Fort/Citadel and still fails the existing no-rest/no-supply/committed-route/pillaged/foreign/air/naval/civilian gates.
- [ ] Write failing combat-context tests proving one occupied owned Citadel grants +5% defense, two Citadels do not stack, empty/pillaged/Fort-tier/foreign sources do not qualify, siege recipients are excluded, and the resulting public preview fact appears for both human and AI callers.
- [ ] Extend `HealingModifierContext` with `tacticalFortHealingBonus` and label it in `getHealingBonus`; calculate it before the existing supply/rest gate in turn manager.
- [ ] Implement a Citadel resolver based on the existing tier helper, map adjacency, source occupancy, owner equality, role metadata, and deterministic stacking group selection. Feed its multiplier/fact into shared combat context rather than a UI-only preview.
- [ ] Re-run focused healing/combat-context tests; commit `feat(547): apply tactical fortification effects`.

### Task 5: Integrate SAM radius and first owner-turn interception

**Files:** `src/systems/legendary-wonder-tactical-effects.ts`, `src/systems/air-defense-system.ts`, `src/systems/air-operations-system.ts`, `src/systems/combat-context.ts`, `tests/systems/air-defense-system.test.ts`, `tests/systems/air-operations-system.test.ts`, `tests/systems/combat-context.test.ts`

- [ ] Write failing AA tests proving only a completed-owner, Radar-supported SAM provider reaches radius 3; Mobile AA, Anti-Air Battery, Missile Cruiser, no-Radar SAM, rival, and unknown-viewer overlays remain unchanged; strongest-source results remain unchanged except newly covered hexes.
- [ ] Write failing interception tests proving the first selected eligible interception under expanded SAM coverage receives exactly +10%, records one owner-turn claim before combat, and a failed interception still consumes it. Prove a second interception, one outside expanded coverage, a different owner, next owner turn, preview, and #720 successful-interception fact retain their specified behavior.
- [ ] Extend provider construction with the resolver's radius only for `sam_site`; preserve original label, defense strength, stacking group, and viewer filtering.
- [ ] Resolve/claim the interception modifier before `resolveCombat`, pass its fact through `buildCombatContextForDefender`, and retain the existing post-settlement successful-interception ledger append unchanged.
- [ ] Re-run focused AA/air/context tests; commit `feat(547): apply tactical air-defense effects`.

### Task 6: Complete review, verification, and focused PR

**Files:** all changed files and `docs/superpowers/plans/2026-08-27-issue-721-tactical-wonder-rewards.md`

- [ ] Perform an inline architecture/design/test review against the design doc: confirm no wonder-ID branches, all definitions are inert until a completed future wonder declares them, no Agent 2 strategic-deterrence file changed, and no visual/audio asset or final media issue was absorbed.
- [ ] Add or correct concrete negative tests found in review; update this plan's task checkboxes only after each task is genuinely complete. Do not mark it merged until the PR merges.
- [ ] Run `scripts/check-src-rule-violations.sh` on every changed `src` file, all mirrored focused tests in one command, `git diff --check`, `bash scripts/run-with-mise.sh yarn build`, `bash scripts/run-with-mise.sh yarn test:durable`, `bash scripts/run-with-mise.sh yarn test:durable:status`, and `./scripts/run-wonder-regressions.sh`.
- [ ] Inspect `git diff --stat origin/main...HEAD`, the committed diff, and the uncommitted diff; verify no source change lies outside #721.
- [ ] Create one PR titled `feat(547): add definition-driven tactical wonder rewards (#721)`. Its body must document stale assumptions, pre/post review findings, AI/difficulty/privacy/save/balance implications, temporary visual/audio status, exclusions, and exact verification. Update #547 only after merge.
