# Issue #523 Dual-era Pacing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the one-foreign-tech world-era jump with derived civilization eras and a strict-majority World Age, then route every era-sensitive mechanic through its correct source.

**Architecture:** Keep serialized `GameState.era` as World Age. Derive civilization era from completed technology IDs using authored threshold data; derive World Age from active major civilizations. Introduce small pure resolver modules for world, combat, and neutral pressure, then migrate consumers through those helpers with no raw gameplay use of `state.era` left behind.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM UI, EventBus, serialized IndexedDB/localStorage saves, existing Web Audio system.

---

## File map

- `src/systems/era-pacing-profiles.ts`: authored personal-era threshold data.
- `src/systems/tech-definitions.ts`: canonical civilization-era and World-Age resolvers.
- `src/systems/era-resolution.ts` (create): combat and neutral-pressure era resolution, wrapped-distance candidate selection, target-safety predicates.
- `src/core/turn-manager.ts`: before/after era diff, owner-scoped NP maintenance, personal/world events.
- `src/systems/{combat,barbarian,minor-civ,crisis,national-project}-system.ts`: migrate direct era consumers.
- `src/{main.ts,ai,systems}/**`: pass `resolveCombatEra` to every `resolveCombat` call.
- `src/storage/save-migrations.ts`: schema v5 deterministic World-Age recalculation.
- `src/core/types.ts`, `src/ui/notification-routing.ts`, `src/audio/audio-system.ts`, `src/ui/tech-panel.ts`, and `src/main.ts:updateHUD`: events, viewer-safe UI, and audio routing.
- Mirrored tests under `tests/{systems,core,storage,ui,audio,ai}`.

## Task 1: Canonical personal and world-era logic

**Files:**
- Modify: `src/systems/era-pacing-profiles.ts`, `src/systems/tech-definitions.ts`
- Modify: `tests/systems/tech-definitions.test.ts`

- [ ] Write failing tests for `getEraAdvancementFraction(era)` returning `.5` for 2–3, `.6` for 4–8, `.55` for 9–12, and `1` for 13; test just-below/at each rounded-up boundary and excluded technologies.
- [ ] Add to `EraPacingProfile` and every authored profile: `advancementFraction: number`. Implement:

```ts
export function getEraAdvancementFraction(era: number): number {
  return requireEraPacingProfile(era).advancementFraction;
}
export function hasReachedEraThreshold(ids: readonly string[], era: number): boolean {
  const techs = getEraAdvancementTechs(era);
  return techs.length > 0 && techs.filter(t => new Set(ids).has(t.id)).length
    >= Math.ceil(techs.length * getEraAdvancementFraction(era));
}
```

- [ ] Add `resolveWorldAge(civilizations: Record<string, Civilization>): number`. Filter `!civ.isEliminated`, calculate each eligible civ with `resolveCivilizationEra`, and return the largest candidate with at least `Math.floor(active.length / 2) + 1` civs at or above it; return `1` for no active majors.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/systems/tech-definitions.test.ts`; commit `feat(era): derive personal and majority world ages`.

## Task 2: Turn transition and owner-scoped national projects

**Files:**
- Modify: `src/core/types.ts`, `src/core/turn-manager.ts`, `src/systems/national-project-system.ts`
- Test: `tests/core/turn-manager.test.ts`, `tests/systems/national-project-system.test.ts`

- [ ] Add failing tests proving: one AI personal-era advance leaves World Age unchanged; a strict majority advances World Age; a rival cannot dequeue/expire/fade another civ's national project; the owner crossing its own window does.
- [ ] Add event payload `civilization:era-advanced: { civId: string; previousEra: number; era: number }`; retain `era:advanced` as World-Age-only.
- [ ] In `processTurn`, build `previousEraByCiv` before research/turn work and `nextEraByCiv` after it. Emit personal events only for increases. Set `newState.era = resolveWorldAge(newState.civilizations)` and emit `era:advanced` only when this World Age rises.
- [ ] Change `expireNationalProjects`, project multiplier/yield helpers, and queue-window checks to accept/derive the relevant `civId` and call `resolveCivilizationEra(state.civilizations[civId].techState.completed)`. Do not loop all cities only when World Age changed.
- [ ] Run the two mirrored suites; commit `fix(era): scope project lifecycle to owning civ`.

## Task 3: Shared combat-era resolver and every caller

**Files:**
- Create: `src/systems/era-resolution.ts`
- Modify: `src/systems/combat-system.ts`, `src/main.ts`, `src/core/turn-manager.ts`, `src/ai/{ai-tactics,ai-major-turn,basic-ai}.ts`, `src/systems/{air-operations,pirate,minor-civ}-system.ts`
- Test: `tests/systems/combat-system.test.ts` plus mirrored AI/air/pirate/minor suites that contain each caller

- [ ] Write failing resolver tests for major-major (`min` personal era), major-neutral (neutral pressure era capped by major), and deterministic fallback for unknown/neutral owners.
- [ ] Implement `resolveCombatEra(state, attacker, defender)` in `era-resolution.ts`; use `classifyOwner`, `resolveCivilizationEra`, and a neutral-pressure resolver. Return `Math.min(attackerEra, defenderEra)`.
- [ ] Replace the optional raw numeric `era` argument at every `resolveCombat` invocation with `resolveCombatEra(state, attacker, defender)`. Keep `resolveCombat` pure and numeric; callers own state lookup.
- [ ] Add a mixed-era combat regression that proves the early multiplier is selected from the lower participant era for a human path and an AI/non-human path.
- [ ] Run all identified mirrored tests in one command and `scripts/check-src-rule-violations.sh` for changed source files; commit `fix(combat): resolve pacing from participants`.

## Task 4: Target-safe neutral pressure and crises

**Files:**
- Modify: `src/systems/era-resolution.ts`, `src/systems/{barbarian,minor-civ,crisis}-system.ts`
- Test: `tests/systems/{barbarian-system,minor-civ-system,crisis-system}.test.ts`

- [ ] Write failing tests for intended-target era, median of city owners inside seven hexes (including wrapped maps/tie ordering), empty-candidate no-upgrade behavior, and a high-tier neutral unit declining an early-era target.
- [ ] Implement `NEUTRAL_PRESSURE_LOCAL_RADIUS = 7`, `resolveNeutralPressureEra(state, position, intendedTargetId?)`, and `canNeutralPressureEngage(state, neutralUnit, targetOwnerId)`. Sort candidates by civ ID before median selection; use wrapped distance where the map wraps.
- [ ] Update barbarian spawn selection to resolve a camp's deterministic intended target before selecting its roster. Filter raid/city/unit attack plans with `canNeutralPressureEngage`; patrol or choose another eligible target when blocked.
- [ ] Update minor-civ upgrade processing to use local pressure and target-safe combat/attack selection. Update crisis scheduler, flavor band, beast hunt selection, and destructive crisis checks to use `resolveCivilizationEra` of `targetCivId`.
- [ ] Run three mirrored suites and add human/AI parity assertions; commit `fix(pressure): cap neutral tiers to local targets`.

## Task 5: Save migration and raw-era audit

**Files:**
- Modify: `src/storage/save-migrations.ts`, `tests/storage/save-migrations.test.ts`
- Modify every classified gameplay caller discovered by `rg -n 'state\\.era' src`

- [ ] Write a failing schema-v4 fixture with a legacy artificially high `state.era`, one slower human, and an active owner-valid NP queue. Assert v5 recalculates strict-majority World Age, preserves the valid queue, emits no events, and is idempotent on second load.
- [ ] Bump `CURRENT_SAVE_SCHEMA_VERSION` to `5`, add `migrateDualEraWorldAge(state)` using `resolveWorldAge`, and register it as migration 5. Do not restore deleted historical projects or create notifications.
- [ ] Classify each `state.era` hit as World-Age presentation/music, owner/target gameplay, neutral pressure, or legacy-only. Replace every gameplay hit with the correct helper and leave a short local comment only where World Age is intentionally retained.
- [ ] Run `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/storage/save-manager.test.ts` and source-rule checks; commit `fix(storage): migrate saves to majority world age`.

## Task 6: Player-visible transition, audio, and hot-seat privacy

**Files:**
- Modify: `src/main.ts:updateHUD`, `src/ui/tech-panel.ts`, `src/ui/notification-routing.ts`, `src/core/types.ts`, `src/audio/audio-system.ts`
- Test: `tests/ui/tech-panel.test.ts`, relevant HUD/notification tests, `tests/audio/audio-system.integration.test.ts`

### Player Truth Table

| Before | Event/action | Immediate visible result |
|---|---|---|
| Tech panel shows `16 / 18` | Active player completes qualifying tech | Panel rerenders `17 / 18`; if threshold crossed, Your Era changes and personal notification appears. |
| HUD shows Your Era 4, World Age 3 | Majority crosses Era 4 | HUD rerenders World Age 4; shared notification appears without naming a rival. |
| Hot-seat seat A ends turn | Seat B becomes current player | Personal era/progress changes to B only; aggregate World Age remains visible. |

### Misleading UI Risks

- World Age must never be labeled as the player’s unlock era.
- A rival’s completed-tech count must never be inferred from the majority counter.
- “Next era” means the current viewer’s personal threshold, not World Age.

- [ ] Write failing DOM tests for exact `Your Era`, `World Age`, personal progress/threshold copy, immediate rerender after a research completion, and hot-seat viewer switch privacy.
- [ ] In `updateHUD` in `src/main.ts`, replace the single `Turn ${gameState.turn} · Era ${gameState.era}` text with `Turn … · Your Era … · World Age …`, deriving Your Era from `gameState.currentPlayer`. Add a tech-panel progress block using safe `textContent`; include the currently applicable percentage and qualifying count.
- [ ] Route `civilization:era-advanced` only to its human `civId` notification sink. Keep `era:advanced` aggregate. Add a small UI SFX dispatch for personal advancement; preserve the existing world `era:advanced` music transition and ensure muted audio dispatches neither cue.
- [ ] Run UI/audio suites; commit `feat(ui): distinguish personal era from world age`.

## Task 7: End-to-end balance verification

**Files:**
- Modify/create only focused tests under `tests/simulation`, `tests/core`, and existing domain suites

- [ ] Add deterministic seeded scenarios for Explorer, Standard, and Veteran that prove an advanced AI cannot force an early-era human's projects, neutral pressure, or crises to advance; assert the strict-majority World Age still changes once enough civs qualify.
- [ ] Add hot-seat replay coverage: each seat receives only its own personal transition after handoff, both see the aggregate World Age, and no stale panel remains after a second transition.
- [ ] Run source-rule checks, all changed mirrored tests, `bash scripts/run-with-mise.sh yarn build`, and `bash scripts/run-with-mise.sh yarn test`. Inspect `git diff --stat origin/main...HEAD`, `git diff --stat`, and the full source diff before commit.
- [ ] Commit `test(era): cover dual-era solo and hot-seat pacing`.

## Plan self-review

Spec coverage: Tasks 1–2 implement the dual clocks and graduated thresholds; 3–4 migrate direct/neutral pressure; 5 protects saves and audits raw reads; 6 provides UI/audio/hot-seat behavior; 7 verifies difficulty, AI, regression, and balance. The plan contains no postponed behavior: each spec rule has a code owner and a regression.

Implementation review corrections already applied: World-Age audio remains on existing `era:advanced`; personal transitions use a separate filtered event and UI cue; neutral locality is fixed at seven hexes; all combat callers are explicitly enumerated and audited rather than assuming a single turn-manager path.
