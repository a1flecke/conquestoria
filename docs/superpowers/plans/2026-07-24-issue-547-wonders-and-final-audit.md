# Issue 547 Wonders and Final Audit Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use
> superpowers:subagent-driven-development (recommended) or
> superpowers:executing-plans to implement this plan task-by-task. Repository subagent
> approval rules still apply.

**Goal:** Add three believable military legendary wonders through generic typed quest and
reward contracts, then prove the full combat program is balanced, save-safe, accessible,
and regression-free.

**Architecture:** New history facts are emitted at combat/training/fort/interception
mutation sources. Definition metadata describes quest evaluation and reward scope.
Legendary wonder systems, AI, panels, landmarks, Codex, and persistence consume generic
contracts without wonder-ID branches.

**Tech Stack:** TypeScript, Vitest, existing legendary wonder systems, Canvas landmarks,
DOM panels, Web Audio.

---

## Task 56: Add typed military quest facts

**Files:** Modify `src/core/types.ts`,
`src/systems/legendary-wonder-history.ts`,
`src/systems/legendary-wonder-system.ts`,
`src/systems/legendary-wonder-definitions.ts`,
`src/systems/combat-system.ts`, `src/systems/improvement-turn-system.ts`,
`src/systems/air-operations-system.ts`, `src/storage/save-migrations.ts`; test all
mirrored legendary/history/combat/save files.

Add failing human and non-human tests for unit-role fielding, surviving combat wins,
distinct-territory Fort completion, Fort/Citadel repels, and successful interceptions.
Define exact viewer-safe fact payloads and quest metadata; emit once from mutations, not
final-state scans. Normalize idempotently and process every eligible project in one turn.

## Task 57: Add typed tactical reward effects

**Files:** Modify `src/core/types.ts`,
`src/systems/legendary-wonder-system.ts`,
`src/systems/legendary-wonder-production.ts`,
`src/ai/ai-production.ts`; add
`src/systems/legendary-wonder-military-effects.ts`; test definitions, system, production,
AI, and UI presentation.

Add generic metadata/evaluators for per-era role training experience, fort healing,
adjacent Citadel defense, AA radius extension, and first-interception modifier. Test
host-city versus empire scope, nonstacking, per-owner/per-turn or per-era resets, exact
exclusions, AI valuation, and no duplicate local yield/effect.

## Task 58: Add Terracotta Army

Add the exact Era 3 cost/gates/Stone definition, four units across three roles plus three
surviving wins quest, and capped per-era role experience reward. Test one-tech/one-role
negative cases, no duplication, exclusions, rollover, global uniqueness, same-civ
self-competition, AI, save/load, panel/Codex truth, and representative builder/world-actor
completion.

## Task 59: Add Crac des Chevaliers

Add the exact Era 5 cost/gates/Stone definition, three Forts in distinct city territories
plus two repels quest, +5 occupying heal, and adjacent Citadel +5% nonstacking reward.
Test spelling/search alias, distinct territory, empty/pillaged/siege exclusions, AI Fort
planning, viewer-safe rival intel, global/local uniqueness, save/load, and UI scope label.

## Task 60: Add NORAD

Add exact Era 11 cost/gates definition, three distinct-city operational Radars plus three
successful interceptions quest, radius-3 Radar+SAM extension, and first eligible
interception +10% per owner turn. Test conjunctive gates, operational status, no hidden
aircraft/base intel, first/later interception, hot-seat owner reset, AI air-defense
planning, global/local uniqueness, save/load, and expanded acronym copy.

## Task 61: Visual wonder batch

Modify `src/systems/legendary-wonder-landmark-catalog.ts`,
`src/renderer/wonders/legendary-wonder-bespoke-assets.ts`, and focused assets to add
distinct Terracotta Army, Crac des Chevaliers, and NORAD landmarks. Add failing roster,
catalog, landmark, renderer, and Codex presentation tests. Inspect map/fog/completed/lost
states and reduced motion; record provenance and remove temporary mappings.

## Task 62: Audio wonder batch

Register construction/completion identities in the existing audio catalogs/director.
Add failing catalog, provenance, live-event routing, mute/volume, missing-asset, and
hot-seat information-isolation tests. Coalesce simultaneous completion presentation and
retain full visual/text ceremony when muted.

## Task 63: Final integration and release audit

1. Rebase on latest main and inventory all 62 predecessor merges against the parent
   dependency graph.
2. Run catalog integrity, production reachability, role/upgrade-chain, tech consistency,
   AI production/research/upgrades/assignment, combat, air, improvement, barbarian,
   crisis, notification-volume, save migration/persistence, solo, hot-seat, renderer,
   sprite, audio, and legendary wonder suites.
3. Execute the six seeded play scenarios on Explorer, Standard, and Veteran; separately
   target a computer civilization to prove Standard-severity world pressure.
4. Round-trip schema-0, each retained migration fixture, current saves, Cavalry queues,
   upgrades, Fort/AA states, both crises at every phase, and all wonder counters/rewards.
5. Run `scripts/check-src-rule-violations.sh` on every source file changed by the audit,
   `./scripts/run-wonder-regressions.sh`, `./scripts/run-with-mise.sh yarn build`, and
   `./scripts/run-with-mise.sh yarn test`.
6. Confirm the web bundle still uses `/conquestoria/`. Run Tauri build/checks only if the
   program touched platform/distribution paths; otherwise record that shared code required
   no distribution fork.
7. Inspect full `origin/main...HEAD` and uncommitted diffs, resolve every regression, and
   attach measured balance, accessibility, solo/hot-seat, migration, and check evidence.

## Interactive UI guardrails

For Tasks 58–60, Player Truth Tables cover locked, questing, ready, building, completed,
lost, rival-known, and rival-hidden states. Misleading UI tests reject prose-implied
scope, stale quest progress, hidden rival facts, duplicate reward labels, and unexplained
nonstacking. Interaction replay covers seed, event progress, build start, simultaneous
race, completion, current-player switch, save/load, and immediate panel refresh.

The program is complete only after Task 63 passes; “core mechanics complete” and “full
program complete” remain separate parent milestones.
