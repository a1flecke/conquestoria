# Anti-Tank Gun Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` to
> implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a save-safe, class-driven Anti-Tank Gun and a bounded AI response to
observed armor without hidden-roster knowledge.

**Architecture:** Add a stable `anti_tank_gun` catalog entry, classify it through the
existing `armor` class-counter system, and give it a typed `anti-armor` AI role. A
prepared-turn helper turns `MajorCivPerception` observations into normal force demand;
normal production scoring and residual queue accounting stay authoritative. Reuse the
existing visibility decay and no-persisted-field approach.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM UI, serializable game state, Yarn 4.

## File map

- `src/core/types.ts` — stable `UnitType` and `AIStrategicRole` members.
- `src/systems/unit-system.ts`, `src/systems/city-system.ts`,
  `src/systems/tech-definitions-eras9.ts` — stats, trainability, description, icon,
  and Tank Warfare unlock.
- `src/systems/unit-modifier-definitions.ts`, `src/systems/unit-modifier-system.ts`,
  `src/systems/combat-role-definitions.ts` — typed armor counter, excluded-class
  non-armor tradeoff, and catalog-driven roles.
- `src/ai/ai-prepared-turn.ts`, `src/ai/ai-unit-assignment.ts`,
  `src/ai/ai-major-turn.ts`, `src/ai/ai-unit-roles.ts`, `src/ai/ai-production.ts`,
  `src/ai/ai-personality.ts` — bounded perception-derived demand, compatible plan
  assignment, tactical participation, and production eligibility.
- `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts` — temporary
  catalog fallback coverage.
- `tests/systems/*`, `tests/ai/*`, `tests/ui/*`, `tests/storage/*`, `tests/audio/*`,
  `tests/renderer/*` — targeted contract regressions.

## Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Tank Warfare missing | Open city production | Locked catalog explains Tank Warfare; the unit is not actionable. |
| Tank Warfare complete | Open city production | Anti-Tank Gun is reachable with cost, range, and tradeoff. |
| Known armor target | Preview or resolve attack | “Anti-armor ×1.50” is shown and applied. |
| Known non-armor target | Preview or resolve attack | “Anti-Tank Gun non-armor penalty ×0.85” is shown and applied. |
| Unit is queued | Confirm production | The open city panel rerenders queue order and ETA immediately. |
| Human handoff | Open/refresh production or preview | Only the current player’s tech, queue, and earned target facts are visible. |

## Misleading UI risks

- “Anti-Tank” never means a universal +50% bonus: the preview must show the −15%
  non-armor fact for a known non-armor target.
- A recommended production ordering cannot hide legal alternatives; the existing
  full-catalog affordance remains reachable and tested.
- AI memory must not become a player-visible detection claim, notification, sound, or
  private-queue leak.

## Interaction replay checklist

- Open the locked catalog, expand its explanatory entries, satisfy Tank Warfare, and
  reopen it as the same player.
- Preview armor and non-armor targets, resolve combat via the canonical non-UI path,
  then reopen the preview surface.
- Queue the unit and assert the still-open city panel reflects its queue/ETA state.
- Change `currentPlayer`, reopen production and preview, and assert that no prior
  player’s tech gate, queued item, or target fact survives.

### Task 1: Establish catalog, gate, and class-driven combat contract

**Files:**

- Modify: `tests/systems/city-system.test.ts`,
  `tests/systems/tech-unlocks-consistency.test.ts`,
  `tests/systems/unit-modifier-system.test.ts`, `tests/systems/combat-system.test.ts`,
  `tests/systems/unit-chain-integrity.test.ts`
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`,
  `src/systems/city-system.ts`, `src/systems/tech-definitions-eras9.ts`,
  `src/systems/unit-modifier-definitions.ts`, `src/systems/unit-modifier-system.ts`,
  `src/systems/combat-role-definitions.ts`

- [ ] **Step 1: Write failing catalog and combat regressions.**

  Assert `anti_tank_gun` has exactly 170 production, 43 strength, 2 movement, and a
  range-1 unit attack; Tank Warfare is its only unlock gate; and the city catalog does
  not offer it beforehand. Assert its class-counter fact applies at ×1.50 to Tank and
  to a test fixture classified as `armor`, but the same attacker receives ×0.85 versus
  a known non-armor unit. Assert neither modifier when the Anti-Tank Gun defends.
  Add an exchange fixture that remains inside the accepted 20–40% anti-armor counter
  band without asserting an invalid raw-strength ranking.

- [ ] **Step 2: Run focused red tests.**

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/systems/unit-chain-integrity.test.ts
  ```

- [ ] **Step 3: Implement catalog data and modifiers through canonical seams.**

  Add the stable union member and definition; add a Trainable Unit entry and Tank
  Warfare `unlocksUnits` entry; include an honest concise description and production
  icon. Add the unit to the typed class map as a land/gunpowder combatant. Extend the
  class-counter schema with a mutually exclusive `defenderClass`/`excludedDefenderClass`
  match, then encode ×1.50 against `armor` and ×0.85 excluding `armor`; the evaluator
  runs only for the attacker, so future armor units work automatically without a Tank
  branch. Give the unit only the `anti-armor` strategic role. Add that role to combat
  classification and narrowly make it compatible with a required `frontline` slot for
  assignment, while keeping production demand matching exact so generic frontline
  demand cannot train specialists.

- [ ] **Step 4: Verify the canonical source paths.**

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras9.ts src/systems/unit-modifier-definitions.ts src/systems/unit-modifier-system.ts src/systems/combat-role-definitions.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/systems/unit-chain-integrity.test.ts
  ```

- [ ] **Step 5: Commit the catalog/combat slice.**

  ```bash
  git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras9.ts src/systems/unit-modifier-definitions.ts src/systems/unit-modifier-system.ts src/systems/combat-role-definitions.ts tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/systems/unit-chain-integrity.test.ts
  git commit -m "feat(combat): add Anti-Tank Gun counter"
  ```

### Task 2: Add bounded observed-armor AI demand

**Files:**

- Modify: `tests/ai/ai-perception.test.ts`, `tests/ai/ai-prepared-turn.test.ts`,
  `tests/ai/ai-production.test.ts`, `tests/ai/ai-unit-roles.test.ts`,
  `tests/ai/ai-research.test.ts`, `tests/ai/ai-major-turn.test.ts`
- Modify: `src/core/types.ts`, `src/ai/ai-prepared-turn.ts`,
  `src/ai/ai-unit-assignment.ts`, `src/ai/ai-major-turn.ts`, `src/ai/ai-unit-roles.ts`,
  `src/ai/ai-production.ts`, `src/ai/ai-personality.ts`

- [ ] **Step 1: Write failing perception and anti-spam tests.**

  Build fixtures where a contacted hostile Tank is: visible; a trusted fog-memory seen
  one turn ago; a six-or-more-turn stale memory; a legacy/untrusted snapshot; and a
  wholly hidden live unit. Assert only visible armor creates immediate demand, recent
  trusted memory creates at most one lower-priority demand, and all other cases create
  none. Assert the formula `min(visibleArmorCount, max(1, floor(maxPrimaryForce / 3)))`
  yields a cap of one on Explorer and two on Standard/Veteran, while a remembered
  sighting produces one slot only when visible armor produces none. Assert owned guns
  populate `assigned`, validly queued guns reduce the production residual, and a
  single sighting cannot queue specialists across multiple cities. Assert an existing
  gun can fill a frontline assignment and generate a visible-target tactical action,
  while generic frontline production cannot select it. A barbarian/camp must not gain
  eligibility from unseen armor.

- [ ] **Step 2: Run focused red tests.**

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/ai/ai-perception.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-production.test.ts tests/ai/ai-unit-roles.test.ts tests/ai/ai-research.test.ts
  ```

- [ ] **Step 3: Implement a small perception-to-demand helper.**

  Extend `AIStrategicRole`, `COMBAT_ROLES`, role ordering/weight sets, and one shared
  compatibility predicate for `anti-armor`. Use that predicate both when assigning a
  unit to a `frontline` slot and when `hasRequiredRoles` verifies that assignment;
  otherwise its exact-role check would reject the specialist. Implement one helper that reads only
  `MajorCivPerception`: count visible relevant hostile armor; calculate
  `counterCap = max(1, floor(profile.maxPrimaryForce / 3))`; set desired to
  `min(visibleArmorCount, counterCap)`; otherwise set one lower-priority desired slot
  for any positive-confidence remembered armor; and count owned anti-armor units into
  `assigned` before merging. Extend the prepared-demand merge interface to preserve
  explicit desired/assigned values instead of adding an uncapped `+1` seed. Reuse
  normal residual queued-unit accounting and generic production matching. Do not
  persist the signal, read raw enemy `state.units`, alter tactical target selection,
  or bypass ordinary city trainability.

- [ ] **Step 4: Verify non-omniscience and difficulty parity.**

  Add/retain tests for Explorer, Standard, and Veteran that prove equal catalog,
  counter, and information legality while only the documented one/two-unit cap changes
  with their existing force profile. Verify standard AI research/production sees the
  new role from catalog data, tactics can use it only against visible targets, and no
  difficulty sees hidden armor.

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/ai/ai-prepared-turn.ts src/ai/ai-unit-assignment.ts src/ai/ai-major-turn.ts src/ai/ai-unit-roles.ts src/ai/ai-production.ts src/ai/ai-personality.ts
  ./scripts/run-with-mise.sh yarn test --run tests/ai/ai-perception.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-production.test.ts tests/ai/ai-unit-roles.test.ts tests/ai/ai-research.test.ts tests/ai/ai-major-turn.test.ts
  ```

- [ ] **Step 5: Commit the AI slice.**

  ```bash
  git add src/core/types.ts src/ai/ai-prepared-turn.ts src/ai/ai-unit-assignment.ts src/ai/ai-major-turn.ts src/ai/ai-unit-roles.ts src/ai/ai-production.ts src/ai/ai-personality.ts tests/ai/ai-perception.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-production.test.ts tests/ai/ai-unit-roles.test.ts tests/ai/ai-research.test.ts tests/ai/ai-major-turn.test.ts
  git commit -m "feat(ai): counter observed armor with Anti-Tank Guns"
  ```

### Task 3: Prove player surfaces, save safety, hot-seat isolation, and media fallbacks

**Files:**

- Modify: `tests/ui/city-panel.test.ts`, `tests/ui/combat-preview.test.ts`,
  `tests/storage/save-migrations.test.ts`, `tests/audio/sfx-catalog.test.ts`,
  `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`

- [ ] **Step 1: Write failing rendered/UI and persistence regressions.**

  Exercise the city panel's existing locked/full-catalog affordance before and after
  Tank Warfare. Queue Anti-Tank Gun and assert the open panel's visible queue and ETA
  update. Preview known armor and non-armor targets and assert the precise active
  fact. In a two-human fixture, switch `currentPlayer` and prove private tech/queue
  state and concealed facts do not render. Round-trip a state containing the new unit,
  a queued new unit, trusted observations, and malformed legacy snapshots through the
  current save normalizer; assert no schema version change and no exception.

- [ ] **Step 2: Run focused red tests.**

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/storage/save-migrations.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts
  ```

- [ ] **Step 3: Register documented temporary fallbacks.**

  Register `anti_tank_gun` in the sprite and SFX catalogs with appropriate existing
  temporary fallbacks and comments naming the dedicated asset follow-up. Do not add a
  separate audio event, queue mutation, or save migration: canonical combat event
  presentation, existing panel refresh, mixer/mute behavior, and serializable unit
  state remain authoritative.

- [ ] **Step 4: Verify surface and save contracts.**

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
  ./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/storage/save-migrations.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts
  ```

- [ ] **Step 5: Commit the end-to-end slice.**

  ```bash
  git add src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/storage/save-migrations.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts
  git commit -m "test(combat): cover Anti-Tank Gun player paths"
  ```

### Task 4: Final review and verification

- [ ] **Step 1: Inspect source and test deltas.**

  ```bash
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD
  git diff
  ```

- [ ] **Step 2: Run required verification.**

  ```bash
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test:durable
  ./scripts/run-with-mise.sh yarn test:durable:status
  ```

- [ ] **Step 3: Perform the final inline review.**

  Confirm exact unit envelope, typed armor/non-armor modifiers, no Tank-specific
  branches, only earned visible/recent trusted AI intelligence, decay and force-budget
  cap, no tactical use of stale intelligence, equivalent difficulty legality, complete
  production/preview rendering, hot-seat isolation, unchanged save schema, valid media
  fallbacks, and deterministic solo/hot-seat regression coverage. Fix all findings
  before creating the pull request.
