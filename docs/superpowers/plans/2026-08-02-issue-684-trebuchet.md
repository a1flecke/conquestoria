# Trebuchet Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a distinct Era-4 Trebuchet that is effective against cities and intentionally poor against units.

**Architecture:** Define the unit, its dual prerequisite, explicit succession, player-facing description, and AI role in the existing typed catalogs. Reuse the shared combat-context and modifier-fact paths so player, AI, preview, history, and hot-seat all see the same outcome. Do not implement Fort/Citadel penetration: the target Fort state is owned by later #690–#691 work.

**Tech Stack:** TypeScript, Vitest, typed unit/tech/production catalogs, Canvas sprite catalog.

---

### Task 1: Establish the public catalog contract

**Files:**
- Modify: `tests/systems/city-system.test.ts`
- Modify: `tests/systems/unit-chain-integrity.test.ts`
- Modify: `tests/systems/tech-unlocks-consistency.test.ts`
- Modify: `tests/systems/unit-system.test.ts`
- Modify: `tests/ai/ai-unit-roles.test.ts`
- Modify: `tests/ai/ai-production.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/tech-definitions-eras1-4.ts`
- Modify: `src/systems/combat-role-definitions.ts`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

- [x] Write failing catalog tests proving Siege Warfare and Fortresses are both required; the tech exposes Trebuchet; Catapult upgrades to Trebuchet while Ballista still upgrades to Cannon; Trebuchet has the specified 125/27/1/range-2 bombard profile; and catalog-driven AI classifies it as siege/ranged.
- [x] Run the focused tests and confirm they fail because `trebuchet` is not defined.
- [x] Add the minimum typed catalog entries, use an existing valid temporary siege sprite, and leave all saved object shapes unchanged.
- [x] Re-run the focused tests and confirm they pass.
- [x] Additional pacing fix: cost 125 in an era-4 `power-spike` slot exceeded the pacing-audit
      window (11-turn max at 10 production/turn; Trebuchet estimates 13). Reassigned Trebuchet's
      `pacing.band` to `marquee` (window [10,16]) rather than lowering the spec'd cost — matches
      how the dual Siege Warfare + Fortresses gate and higher cost already set it apart from
      Catapult/Ballista. See `.claude/rules/game-balance.md` pacing rules and
      `tests/systems/pacing-audit.test.ts`.

### Task 2: Establish target-specific combat behavior

**Files (actual, revised from the original plan — see note below):**
- Modify: `tests/systems/combat-system.test.ts`
- Modify: `tests/systems/city-siege-system.test.ts`
- Modify: `src/systems/unit-modifier-definitions.ts`
- Modify: `src/systems/combat-system.ts`
- Modify: `src/systems/city-siege-system.ts`
- Modify: `src/core/types.ts` (`UnitDefinition.cityAssaultMultiplier`, new `CombatExchangeKind`)
- Modify: `src/systems/unit-system.ts` (`cityAssaultMultiplier: 1.25` on the Trebuchet definition)

- [x] Write failing tests that prove Trebuchet deals 25% more damage to cities, 20% less damage to units, and reports applied/ignored facts through the same canonical context used by preview and AI; prove Catapult is unaffected.
- [x] Run those tests and confirm their expected failures.
- [x] Add the smallest typed, target-kind-aware modifier contract; do not introduce a Trebuchet ID branch in a UI or AI caller.
- [x] Re-run combat and modifier tests and confirm they pass.

**Implementation note (deviates from the original file list above):** the two Trebuchet effects
route through two *different* existing canonical mechanisms, not `combat-context.ts`/
`unit-modifier-system.ts`:
- **+25% city assault** is undefended-city capture (`calculateCityAssaultStrengths` in
  `city-siege-system.ts`, issue #522) — an architecturally separate path from unit-vs-unit combat
  that has no `CombatContext`/modifier-fact machinery at all (none of its other multipliers —
  veterancy, river, health — report facts either). Added `UnitDefinition.cityAssaultMultiplier`,
  consumed with the same `?? 1` fallback pattern the function already uses for
  `options.attackerMultiplier`.
- **−20% vs units** is unit-vs-unit combat (`resolveCombat`). Battleship's existing
  "+20% vs city/coastal target" bonus (`unit-modifier-definitions.ts` `UNIT_MODIFIERS`,
  condition `vsCityOrCoastalTarget`) looked like the precedent at first, but that path scales
  *combat strength* (nonlinear via the win-ratio formula), while the spec wants a clean 20% cut
  off *final damage* — the same shape as the existing `war_elephant` "shock" exchange
  (`COMBAT_EXCHANGE_RULES` / `getCombatExchangeModifiers` in `combat-system.ts`). Added a new
  `'siege-anti-personnel'` `CombatExchangeRule` kind following that exact pattern. This still
  satisfies "reports facts through the canonical context used by preview and AI": the result's
  `exchange.label` is what `src/ui/combat-preview.ts`'s `formatCombatPreviewDetails` already
  surfaces for war_elephant's shock label, and `resolveCombat` is the single function every
  attack path (human, AI) calls — no ID branch outside the two data tables.

### Task 3: Regressions and delivery review

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts` (Trebuchet → `CatapultSprite`, documented placeholder)
- Modify: `src/audio/sfx-catalog.ts` (Trebuchet → shared `CATAPULT_SFX` object, same reuse-by-reference
  pattern as `chariot: HORSEMAN_SFX` / `armored_car: KNIGHT_SFX` — not a fresh `real()` call, which
  would duplicate Catapult's SFX ids/file paths and fail the catalog's uniqueness tests)
- Modify: `tests/audio/sfx-catalog.test.ts` (count comment; unchanged count since the reuse is by
  reference, not a new entry)

- [x] Add coverage for a valid temporary sprite catalog entry and a plain, honest Trebuchet description. (`tests/systems/unit-system.test.ts` already asserts the catalog contract; existing generic tests — `tests/renderer/sprites/sprite-catalog.test.ts` completeness check, `tests/systems/description-honesty.test.ts` denylist — auto-cover new catalog/description entries with no changes needed, per their own generic-over-all-entries design.)
- [x] Run all mirrored focused tests, source-rule checks, build, and durable verification. `yarn test`: 439/439 files, 7371 passed. `yarn build`: clean tsc + vite build. Hook smoke tests: all pass.
- [x] Inspect committed and uncommitted diffs against `origin/main`; verify no persistence schema changed and no Fort-specific dark behavior was added. Diff touches only catalog/combat/audio/sprite files (see `git diff --stat origin/main`); no save-schema files; Fortresses tech only gained a factual `unlocks` text line, no new Fort/Citadel mechanic.
