# Cuirassier Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver the Cuirassier as a save-safe, catalog-driven Era 6 heavy cavalry choice without changing Cavalry's current role.

**Architecture:** Add one typed `UnitType` and feed it through the existing catalog, eligibility, combat-modifier, role, presentation, sprite, audio, and AI seams. A schema-11 migration gives queued legacy Knights one completion only after their earlier obsolescence takes effect; it does not rewrite units, orders, or queue order.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM game UI, Yarn 4, existing serializable save migrations.

---

## Pre-plan inline review resolutions

| Dimension | Resolved implementation constraint |
| --- | --- |
| Balance and fun | Cuirassier is 52 strength / 3 movement / 150 production; Cavalry remains 44 / 4 / 140 with pursuit. Tests prove costs, movement, resources, and conditions prevent strict domination. |
| Ages and play styles | Plain role summary stays under 18 words; full technical facts remain reachable. Polearm counterplay protects defensive and casual play. |
| Difficulty and AI | All difficulties share the typed unit and combat rule. AI consumes catalog roles and owned resources only; no Cuirassier ID branch. |
| UI and hot seat | Production stays reachable, locked states explain both gates/resources, and combat facts are owner-scoped. Tests render solo and two-human fixtures. |
| Data and saves | Schema 11 appends one `knight` grace item per old queued Knight and normalizes only `cavalry`/`knight`; no unit or order conversion. |
| SFX and assets | Mechanics PR uses documented Knight fallback mappings. #708 and #714 own final replacements. |

## File map

- `src/core/types.ts` — stable `UnitType` union.
- `src/systems/unit-system.ts` — Cuirassier base statistics and honest description.
- `src/systems/city-system.ts` — trainable contract, explicit chain, production icon, and existing eligibility use.
- `src/systems/tech-definitions-eras5-7.ts` — Rifle Tactics unlock listing.
- `src/systems/unit-modifier-definitions.ts` — mounted class and canonical open-ground modifier.
- `src/systems/combat-role-definitions.ts` — concise role/facts and generic AI roles.
- `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts` — temporary catalog fallbacks and animal motion.
- `src/storage/save-migrations.ts` — schema 11 queue preservation and normalization.
- `tests/systems/*`, `tests/ai/*`, `tests/ui/*`, `tests/audio/*`, `tests/renderer/*`, `tests/storage/*` — behavior, catalog, player-surface, and migration coverage.

### Task 1: Establish Cuirassier catalog gates and chains with red tests

**Files:**
- Modify: `tests/systems/city-system.test.ts`
- Modify: `tests/systems/unit-chain-integrity.test.ts`
- Modify: `tests/systems/tech-unlocks-consistency.test.ts`
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/tech-definitions-eras5-7.ts`

- [ ] **Step 1: Write the failing catalog and gate tests.**

  Add tests that exercise the real eligibility helper rather than duplicating its filtering:

  ```ts
  it('cuirassier requires Rifle Tactics, Professional Army, Horses, and Iron', () => {
    const complete = getTrainableUnitsForCiv(
      ['rifle-tactics', 'professional-army'], undefined,
      new Set<ResourceType>(['horses', 'iron']),
    );
    expect(complete.find(unit => unit.type === 'cuirassier')).toMatchObject({
      cost: 150, techRequired: 'rifle-tactics', requiredTechs: ['professional-army'],
      resourceRequired: ['horses', 'iron'], upgradesTo: 'tank',
    });
    for (const [techs, resources] of [
      [['rifle-tactics'], ['horses', 'iron']],
      [['professional-army'], ['horses', 'iron']],
      [['rifle-tactics', 'professional-army'], ['horses']],
      [['rifle-tactics', 'professional-army'], ['iron']],
    ] as const) {
      expect(getTrainableUnitsForCiv([...techs], undefined, new Set<ResourceType>(resources))
        .some(unit => unit.type === 'cuirassier')).toBe(false);
    }
  });
  ```

  Add an explicit chain assertion:

  ```ts
  expect(TRAINABLE_UNITS.find(unit => unit.type === 'knight'))
    .toMatchObject({ obsoletedByTech: 'rifle-tactics', upgradesTo: 'cuirassier' });
  expect(TRAINABLE_UNITS.find(unit => unit.type === 'cuirassier'))
    .toMatchObject({ obsoletedByTech: 'tank-warfare', upgradesTo: 'tank' });
  expect(TECH_TREE.find(tech => tech.id === 'rifle-tactics')?.unlocksUnits)
    .toContain('cuirassier');
  ```

- [ ] **Step 2: Run the focused red tests.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts
  ```

  Expected: failures because `cuirassier` is not yet a `UnitType` or trainable unit.

- [ ] **Step 3: Add the minimal typed catalog data.**

  Add `cuirassier` beside the other mounted unit types. Define only the approved data:

  ```ts
  cuirassier: {
    type: 'cuirassier', name: 'Cuirassier', movementPoints: 3,
    visionRange: 2, strength: 52, canFoundCity: false,
    canBuildImprovements: false, productionCost: 150, cargoSize: 2,
  },
  ```

  Add this trainable record and retarget Knight, leaving Cavalry unchanged:

  ```ts
  { type: 'cuirassier', name: 'Cuirassier', cost: 150,
    techRequired: 'rifle-tactics', requiredTechs: ['professional-army'],
    resourceRequired: ['horses', 'iron'], obsoletedByTech: 'tank-warfare',
    upgradesTo: 'tank', pacing: { band: 'power-spike', role: 'early-military',
      impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05,
      situationality: 1, unlockBreadth: 1 } },
  ```

  Append `'cuirassier'` to Rifle Tactics `unlocksUnits` and add a production icon. Do
  not add it to Professional Army's unlock array: `requiredTechs` is the second,
  conjunctive gate.

- [ ] **Step 4: Run the catalog tests and source policy check.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras5-7.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit the catalog slice.**

  ```bash
  git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras5-7.ts tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts
  git commit -m "feat(combat): add Cuirassier catalog contract"
  ```

### Task 2: Add the canonical tactical rule, roles, and balance regressions

**Files:**
- Modify: `tests/systems/unit-modifier-system.test.ts`
- Modify: `tests/systems/combat-system.test.ts`
- Modify: `tests/ai/ai-unit-roles.test.ts`
- Modify: `src/systems/unit-modifier-definitions.ts`
- Modify: `src/systems/combat-role-definitions.ts`

- [ ] **Step 1: Write the failing modifier and role tests.**

  Add a test using `getCombatModifier`, not an alternate combat formula:

  ```ts
  it('Cuirassier gains exactly 15% only while initiating on open ground', () => {
    const open = getCombatModifier('cuirassier', 'attacker', baseCombatCtx({ targetTerrain: 'plains' }));
    const rough = getCombatModifier('cuirassier', 'attacker', baseCombatCtx({ targetTerrain: 'forest' }));
    const defending = getCombatModifier('cuirassier', 'defender', baseCombatCtx({ targetTerrain: 'plains' }));
    expect(open.mult).toBeCloseTo(1.15);
    expect(open.facts).toContainEqual(expect.objectContaining({
      key: 'unit:cuirassier:open-ground', outcome: 'applied', value: 1.15,
    }));
    expect(rough.mult).toBe(1);
    expect(defending.mult).toBe(1);
  });
  ```

  Add counter and non-domination tests:

  ```ts
  expect(getClassCounterMultiplier('pikeman', 'cuirassier', false)?.multiplier).toBe(1.5);
  expect(UNIT_DEFINITIONS.cuirassier.strength).toBeGreaterThan(UNIT_DEFINITIONS.cavalry.strength);
  expect(UNIT_DEFINITIONS.cuirassier.movementPoints).toBeLessThan(UNIT_DEFINITIONS.cavalry.movementPoints);
  expect(cuirassier.cost).toBeGreaterThan(cavalry.cost);
  expect(cuirassier.resourceRequired).toContain('iron');
  ```

  Assert Cuirassier's role summary is at most 18 words and its roles are exactly the
  existing generic `mobile` and `capture` roles.

- [ ] **Step 2: Run the tactical red tests.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/ai/ai-unit-roles.test.ts
  ```

  Expected: failures for the absent modifier, mounted class, and role data.

- [ ] **Step 3: Implement the typed modifier and role data.**

  Add Cuirassier to `UNIT_CLASS_BY_TYPE` as `mounted`, then add the canonical row:

  ```ts
  { source: unit('cuirassier'), effect: 'combatStrength', mode: 'multiplier',
    value: 1.15, unitTypes: ['cuirassier'], when: 'attacking',
    condition: 'onOpenGround', factKey: 'unit:cuirassier:open-ground',
    label: 'Cuirassier open-ground charge' },
  ```

  Add one `UNIT_ROLE_DEFINITIONS.cuirassier` entry with `shock`, `mobile`, `capture`,
  `mounted`, `anti-mounted` vulnerability, and a concise plain-language summary. Add
  public tactical facts only for mechanics the player can inspect; do not invent a
  new `breakthrough` AI role.

- [ ] **Step 4: Verify player-visible combat facts and shared combat use.**

  Add a `tests/ui/combat-preview.test.ts` assertion that an owner sees “Cuirassier
  open-ground charge” for plains and an ignored/not-applied fact for forest. Add a
  system test that passes a Cuirassier through `buildCombatContextForDefender` and
  `resolveCombat`, proving the same modifier facts are present for a non-UI caller.

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/systems/unit-modifier-definitions.ts src/systems/combat-role-definitions.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/ai/ai-unit-roles.test.ts tests/ui/combat-preview.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit the tactical slice.**

  ```bash
  git add src/systems/unit-modifier-definitions.ts src/systems/combat-role-definitions.ts tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/ai/ai-unit-roles.test.ts tests/ui/combat-preview.test.ts
  git commit -m "feat(combat): add Cuirassier tactical rules"
  ```

### Task 3: Verify generic AI, difficulty parity, and player-visible catalog behavior

**Files:**
- Modify: `tests/ai/ai-production.test.ts`
- Modify: `tests/ai/ai-research.test.ts`
- Modify: `tests/ui/city-panel.test.ts`
- Modify: `tests/core/opponent-challenge.test.ts`

- [ ] **Step 1: Write failing AI and difficulty tests without changing AI code.**

  Use a fixture with only the AI's own complete techs and Horses/Iron. Assert
  `generateAIProductionCandidates` includes `cuirassier` when a `mobile` or `capture`
  demand exists and excludes it when Iron is unavailable. Test `planAIResearch` still
  considers Rifle Tactics but gives its known resource-mismatch penalty when Iron is
  absent. Iterate `explorer`, `standard`, and `veteran` fixtures and assert identical
  Cuirassier definition, eligibility, and modifier results; assert the challenge
  profiles add no combat bonus.

- [ ] **Step 2: Run the AI/difficulty red tests.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/core/opponent-challenge.test.ts
  ```

  Expected: catalog expectations fail until Task 1 and Task 2 data exists; no new AI
  implementation should be required.

- [ ] **Step 3: Write failing solo and hot-seat rendered-DOM tests.**

  In `tests/ui/city-panel.test.ts`, use the existing locked-catalog fixture to prove:

  ```ts
  expect(lockedHtml).toContain('Cuirassier');
  expect(lockedHtml).toContain('Rifle Tactics');
  expect(lockedHtml).toContain('Professional Army');
  expect(lockedHtml).toContain('Horses');
  expect(lockedHtml).toContain('Iron');
  ```

  Then create a two-human fixture in which Player 1 has both gates/resources and
  Player 2 lacks Professional Army. Render each owner's city with the matching
  `currentPlayer`; assert only Player 1 gets the trainable Cuirassier item while
  Player 2 receives the explanatory locked entry. This proves no other human's
  research is used at handoff.

- [ ] **Step 4: Run the player-surface tests and make only data corrections required by failures.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/ui/city-panel.test.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/core/opponent-challenge.test.ts
  ```

  Expected: PASS without new UI or AI branches. If a test fails, fix the shared catalog
  data or test fixture; do not special-case a player ID, difficulty, or Cuirassier in
  UI/AI production logic.

- [ ] **Step 5: Commit the AI and UI coverage slice.**

  ```bash
  git add tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/ui/city-panel.test.ts tests/core/opponent-challenge.test.ts
  git commit -m "test(combat): cover Cuirassier AI and player catalog parity"
  ```

### Task 4: Register temporary visual and audio fallbacks

**Files:**
- Modify: `src/renderer/sprites/sprite-catalog.ts`
- Modify: `src/audio/sfx-catalog.ts`
- Modify: `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `tests/audio/sfx-catalog.test.ts`

- [ ] **Step 1: Add red catalog tests.**

  Extend the mounted combat set and animal locomotion set with `cuirassier`, and
  assert `UNIT_SPRITE_CATALOG.cuirassier`, `UNIT_SFX.cuirassier`, and
  `getLocomotionClass('cuirassier')` are present. Keep the tests focused on catalog
  coverage and fallback identity rather than asserting bespoke assets that #708/#714
  have not delivered.

- [ ] **Step 2: Run the asset red tests.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts
  ```

  Expected: failures for missing Cuirassier entries.

- [ ] **Step 3: Add documented temporary mappings.**

  Add the animal motion entry and map Cuirassier to `KnightSprite`:

  ```ts
  // Temporary Knight silhouette; #708 owns Cuirassier's distinct final sprite.
  cuirassier: withMotion('cuirassier', KnightSprite),
  ```

  Reuse `UNIT_SFX.knight` through a named `KNIGHT_SFX` constant rather than copying
  track literals, then map Cuirassier to it with a `#714` temporary-fallback comment.
  Add `cuirassier: 'animal'` to locomotion. Do not create a new sound event, mixer
  path, or audio-only mechanic.

- [ ] **Step 4: Verify asset coverage.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
  ./scripts/run-with-mise.sh yarn test --run tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts
  ```

  Expected: PASS.

- [ ] **Step 5: Commit the fallback slice.**

  ```bash
  git add src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests/renderer/sprites/sprite-catalog.test.ts tests/audio/sfx-catalog.test.ts
  git commit -m "feat(presentation): wire Cuirassier fallbacks"
  ```

### Task 5: Preserve queued Knights through schema 11 exactly once

**Files:**
- Modify: `src/storage/save-migrations.ts`
- Modify: `tests/storage/save-migrations.test.ts`
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Write migration and production red tests.**

  Create a schema-10 save with `['knight', 'knight']` queued and Rifle Tactics already
  completed. Assert migration to schema 11 keeps the queue order and records
  `legacyTechGrace: ['knight', 'knight']`; a second load is identical. Add malformed
  current-save tests asserting `['horseman', 'cavalry', 'knight']` normalizes to
  `['cavalry', 'knight']` and object-shaped grace is removed.

  In city processing, give a grace-backed queued Knight enough production to finish,
  then assert the first completion consumes one grace item and leaves the second queue
  slot; the second completion consumes the final item; a newly queued Knight without
  grace is dropped after Rifle Tactics. Assert neither test changes existing unit IDs
  or non-Knight queue order.

- [ ] **Step 2: Run the migration red tests.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/systems/city-system.test.ts
  ```

  Expected: failures because schema 11 and Knight grace do not yet exist.

- [ ] **Step 3: Implement schema 11 with deterministic normalization.**

  Set `CURRENT_SAVE_SCHEMA_VERSION = 11`. Add `migrateRetimedKnight`, patterned after
  the existing Cavalry migration but preserving only matching queued Knight entries:

  ```ts
  const existingGrace = Array.isArray(city.legacyTechGrace)
    ? city.legacyTechGrace.filter(item => item === 'cavalry' || item === 'knight')
    : [];
  const queuedKnights = city.productionQueue.filter(item => item === 'knight');
  const legacyTechGrace = [...existingGrace, ...queuedKnights];
  ```

  Register it as migration 11 and update the current-save normalizer to retain only
  `cavalry` and `knight`. Preserve the existing duplicate-per-queue-slot behavior;
  do not deduplicate grace arrays.

- [ ] **Step 4: Run save and production verification.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/storage/save-migrations.ts src/systems/city-system.ts
  ./scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/systems/city-system.test.ts
  ```

  Expected: PASS, including schema-0/current/idempotent/malformed coverage.

- [ ] **Step 5: Commit the compatibility slice.**

  ```bash
  git add src/storage/save-migrations.ts tests/storage/save-migrations.test.ts tests/systems/city-system.test.ts
  git commit -m "fix(combat): preserve queued Knights across Cuirassier retime"
  ```

### Task 6: Final review and verification

**Files:**
- Review: all files changed by Tasks 1-5

- [ ] **Step 1: Inspect source changes and both branch deltas.**

  Run:

  ```bash
  git diff --check
  git diff --stat origin/main...HEAD
  git diff --stat
  git diff origin/main...HEAD
  git diff
  ```

  Confirm Cavalry remains unchanged, all Cuirassier behavior is typed data, no player
  ID/difficulty/AI special case exists, and asset comments link only #708/#714.

- [ ] **Step 2: Run the complete focused regression set and source rule checker.**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras5-7.ts src/systems/unit-modifier-definitions.ts src/systems/combat-role-definitions.ts src/storage/save-migrations.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-modifier-system.test.ts tests/systems/combat-system.test.ts tests/ai/ai-unit-roles.test.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts tests/storage/save-migrations.test.ts tests/core/opponent-challenge.test.ts
  ```

  Expected: PASS.

- [ ] **Step 3: Run release verification for the exact worktree state.**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test:durable
  ./scripts/run-with-mise.sh yarn test:durable:status
  ```

  Expected: build passes; durable status reports a passing result for the current HEAD
  and clean/unchanged worktree state.

- [ ] **Step 4: Commit any review-only corrections.**

  ```bash
  git add -A
  git commit -m "test(combat): verify Cuirassier delivery"
  ```

  Do not create an empty commit. If no corrections are needed, record the clean review
  in the PR body instead.

## Plan self-review

- **Spec coverage:** Tasks 1-2 cover the exact unit, chain, gates, counter, balance,
  and player facts. Task 3 covers AI, difficulty, solo, and hot-seat behavior. Task 4
  covers sprite/SFX fallbacks. Task 5 covers schema-11 data compatibility. Task 6
  covers policy, full verification, and diff review.
- **No partial player surface:** every player-visible production/combat claim is backed
  by existing live panel/preview paths and rendered-DOM tests; final artwork/audio is
  explicitly deferred to existing #708/#714 child issues.
- **No placeholders:** all implementation and verification steps name concrete files,
  commands, properties, and expected results.
