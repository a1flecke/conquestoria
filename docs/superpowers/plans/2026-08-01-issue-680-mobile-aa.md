# Mobile AA Field Protection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship Mobile AA as an Air Superiority land support unit whose radius-1 +8
air-defense coverage, viewer-safe presentation, and AI escort behavior work identically
for human, AI, solo, and hot-seat paths.

**Architecture:** Add typed air-defense capability metadata to definitions and derive
both city and unit providers through one resolver/enumeration seam. Feed observed air
pressure into the existing prepared-AI force-demand path and give units with that
capability a visibility-safe tactical escort rank. The renderer consumes the same
viewer-filtered provider enumeration; saves store no new fields.

**Tech Stack:** TypeScript, Vitest, Canvas renderer, DOM UI, existing AI prepared-turn
and tactical ranking systems.

---

## File structure

- `src/core/types.ts` — stable `mobile_aa` type, `air-defense` AI role, and one typed
  capability shape shared by unit and building definitions.
- `src/systems/unit-system.ts`, `src/systems/city-system.ts`,
  `src/systems/tech-definitions-eras9.ts`, `src/systems/combat-role-definitions.ts` —
  catalog, player-facing copy, exact balance, role, and unlock wiring.
- `src/systems/air-defense-system.ts` — generic unit/building provider enumeration,
  strongest-only resolution, and viewer-filtered overlay data.
- `src/ai/ai-prepared-turn.ts`, `src/ai/ai-unit-roles.ts`,
  `src/ai/ai-unit-assignment.ts`, `src/ai/ai-personality.ts`, `src/ai/ai-tactics.ts` —
  observed-air demand and legal field-escort decisions.
- `src/renderer/render-loop.ts`, `src/renderer/sprites/sprite-catalog.ts`,
  `src/audio/sfx-catalog.ts` — remote-field overlay and registered visual/audio fallback.
- Mirrored system, AI, renderer, UI, storage, and catalog tests — regression proof.

## Player truth table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Air Superiority is incomplete | Open a city production surface | Mobile AA stays unavailable with the gate named. |
| Air Superiority is complete | Open the same surface | Mobile AA appears with 175 cost, range 1, weak direct-combat role, and adjacent +8 air defense. |
| A friendly unit is adjacent to Mobile AA | Preview an air attack | The preview shows `Mobile AA +8` and uses the increased defense. |
| A stronger provider covers the defender | Preview the same attack | Only the stronger provider applies; Mobile AA is shown as superseded when the viewer knows it. |
| Mobile AA is far from every city | Toggle AA coverage | Its labelled radius is rendered for the owner/currently visible viewer. |
| Sound is muted | Resolve protected air combat | The normal visible combat fact remains; no render-loop sound is scheduled. |
| Hot-seat player changes | Refresh overlay/preview | Provider labels and positions are re-filtered for the new `state.currentPlayer`. |

## Misleading UI risks

- “+8 defense” is never displayed without “against air attacks.”
- The overlay must enumerate field units, not only cities, and must never reveal an
  unobserved enemy provider.
- The strongest-only rule must not be described as additive coverage.
- AI remembered sightings may create one bounded production demand but must never
  create a tactical escort target; the user must not see or hear hidden intel.

### Task 1: Establish the catalog contract and failing regressions

**Files:**
- Modify: `src/core/types.ts:357-428`
- Modify: `src/systems/unit-system.ts:340-360,695-765`
- Modify: `src/systems/city-system.ts:1149-1165,1615-1625`
- Modify: `src/systems/tech-definitions-eras9.ts:13-17`
- Modify: `src/systems/combat-role-definitions.ts:60-72`
- Modify: `src/renderer/sprites/sprite-catalog.ts:145-165,295-310`
- Modify: `src/audio/sfx-catalog.ts:326-425`
- Test: `tests/systems/city-system.test.ts`
- Test: `tests/systems/tech-unlocks-consistency.test.ts`
- Test: `tests/systems/unit-system.test.ts`
- Test: `tests/ai/ai-unit-roles.test.ts`
- Test: `tests/renderer/sprites/v2/index.test.ts`
- Test: `tests/audio/sfx-catalog.test.ts`

- [ ] **Step 1: Write catalog tests before production changes**

  Add assertions equivalent to:

  ```ts
  expect(UNIT_DEFINITIONS.mobile_aa).toMatchObject({
    type: 'mobile_aa', strength: 32, movementPoints: 2, productionCost: 175,
    domain: 'land', attackProfile: { kind: 'ranged', range: 1, targets: ['unit'] },
  airDefenseProvider: { radius: 1, defenseModifier: 8,
      stackingGroup: 'ground-air-defense' },
  });
  expect(TECH_TREE.find(tech => tech.id === 'air-superiority')?.unlocksUnits)
    .toContain('mobile_aa');
  expect(getAIStrategicRoles('mobile_aa')).toContain('air-defense');
  ```

- [ ] **Step 2: Run the focused catalog tests and confirm failure**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-system.test.ts tests/ai/ai-unit-roles.test.ts tests/renderer/sprites/v2/index.test.ts tests/audio/sfx-catalog.test.ts`

  Expected: failure because `mobile_aa` and its catalogs do not exist.

- [ ] **Step 3: Add the minimal typed catalog implementation**

  Add `'mobile_aa'` to `UnitType`; add `'air-defense'` to `AIStrategicRole`; and make
  `UnitDefinition.airDefenseProvider` and `Building.airDefenseProvider` the same
  optional typed capability object, omitting derived `id`, `label`, and `kind` because
  the owning catalog supplies those fields. Define:

  ```ts
  mobile_aa: {
    type: 'mobile_aa', name: 'Mobile AA', movementPoints: 2, visionRange: 2,
    strength: 32, canFoundCity: false, canBuildImprovements: false,
    productionCost: 175, domain: 'land',
    attackProfile: { kind: 'ranged', range: 1, targets: ['unit'] },
    airDefenseProvider: { radius: 1, defenseModifier: 8,
      stackingGroup: 'ground-air-defense' },
  }
  ```

  Add the Anti-Air Battery's matching `Building.airDefenseProvider` capability, then add
  the trainable entry at Air Superiority, its unlock-array member and effect copy, a
  plain description, `ground-air-defense` combat role with `['air-defense']`, a
  production icon, and explicit temporary vehicle-compatible sprite/locomotion/SFX
  mappings. Do not add an upgrade chain or a unit-ID combat modifier branch.

- [ ] **Step 4: Run the focused catalog tests and confirm pass**

  Run the Step 2 command. Expected: all selected tests pass, including generic unlock,
  sprite, and audio catalog coverage.

- [ ] **Step 5: Commit the catalog slice**

  ```bash
  git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras9.ts src/systems/combat-role-definitions.ts src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests
  git commit -m "feat(combat): add Mobile AA catalog (#680)"
  ```

### Task 2: Generalize coverage resolution and prove combat behavior

**Files:**
- Modify: `src/systems/air-defense-system.ts:1-29`
- Test: `tests/systems/air-defense-system.test.ts`
- Test: `tests/systems/air-domain.test.ts`
- Test: `tests/ui/combat-resolved-presentation.test.ts`

- [ ] **Step 1: Write failing resolver and preview tests**

  Cover a Mobile AA at distance 1, distance 2, wrapped-map adjacency, movement/removal,
  and a stronger same-group provider. Assert both the numeric result and facts:

  ```ts
  expect(resolveAirDefenseCoverage(state, adjacentDefender, 'owner'))
    .toMatchObject({ flatDefenseModifier: 8,
      providers: [expect.objectContaining({ id: 'unit:aa:mobile_aa', radius: 1 })] });
  expect(resolveAirDefenseCoverage(state, distantDefender, 'owner').flatDefenseModifier)
    .toBe(0);
  expect(calculateCombatStrengths(groundAttacker, adjacentDefender, map, context)
    .defenderStrength).toBe(baseDefenderStrength);
  ```

  Add a real combat-preview/presentation test showing `Mobile AA +8` for an air attack
  and no all-purpose ground-defense claim.

- [ ] **Step 2: Run the focused resolver tests and confirm failure**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts tests/systems/air-domain.test.ts tests/ui/combat-resolved-presentation.test.ts`

  Expected: Mobile AA providers are not yet enumerated.

- [ ] **Step 3: Implement typed provider enumeration without ID branches**

  Refactor `providersFor()` into a generic enumeration that reads `BUILDINGS` metadata and
  `UNIT_DEFINITIONS[unit.type].airDefenseProvider`, filters matching ownership and
  radius with the existing wrapped-distance helper, and constructs stable IDs such as
  `city:<id>:anti_air_battery` and `unit:<id>:mobile_aa`. Keep
  `selectStrongestAirDefenseProviders()` as the only stacking evaluator. Export a
  viewer-filtered `getKnownAirDefenseProviders(state, viewerId)` helper that returns
  cloned provider positions and uses the existing `known()` policy.

  Preserve the resolver’s true numerical modifier for combat resolution while filtering
  provider identities/facts for viewers who have not observed the provider. Do not make
  a player’s fog state alter underlying combat math.

- [ ] **Step 4: Run focused resolver tests and source rules**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/air-defense-system.ts
  ./scripts/run-with-mise.sh yarn test --run tests/systems/air-defense-system.test.ts tests/systems/air-domain.test.ts tests/ui/combat-resolved-presentation.test.ts
  ```

  Expected: all selected tests pass.

- [ ] **Step 5: Commit the resolver slice**

  ```bash
  git add src/core/types.ts src/systems/air-defense-system.ts tests/systems/air-defense-system.test.ts tests/systems/air-domain.test.ts tests/ui/combat-resolved-presentation.test.ts
  git commit -m "feat(combat): resolve Mobile AA field coverage (#680)"
  ```

### Task 3: Render viewer-safe field coverage and preserve save/audio behavior

**Files:**
- Modify: `src/renderer/render-loop.ts:545-548`
- Test: `tests/renderer/air-defense-overlay.test.ts`
- Test: `tests/renderer/render-loop-wrap.test.ts`
- Test: `tests/storage/save-persistence.test.ts`
- Test: `tests/storage/save-file-transfer.test.ts`
- Test: `tests/core/hotseat-events.test.ts`

- [ ] **Step 1: Write failing remote-overlay, save, and hot-seat tests**

  Add tests that a remote Mobile AA creates one overlay radius even when no city is
  covered, an unseen rival Mobile AA creates no radius/label, and switching the viewer
  only reveals the new current player’s owned or visible providers. Add a save
  export/import/normalization round-trip with an ordinary Mobile AA and an old save
  lacking it. Assert muted presentation retains the visible `Mobile AA +8` fact rather
  than relying on a sound call.

- [ ] **Step 2: Run focused presentation/storage tests and confirm failure**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/renderer/air-defense-overlay.test.ts tests/renderer/render-loop-wrap.test.ts tests/storage/save-persistence.test.ts tests/storage/save-file-transfer.test.ts tests/core/hotseat-events.test.ts`

  Expected: the remote unit is absent because rendering currently samples city coverage.

- [ ] **Step 3: Wire the renderer to the shared viewer-safe enumeration**

  Replace the city-coordinate `flatMap(resolveAirDefenseCoverage(...))` in
  `RenderLoop.render()` with `getKnownAirDefenseProviders(this.state, viewerId)`. Keep
  `drawAirDefenseOverlay()` presentation-only. Do not add serialized fields, a schema
  version, sound polling, or a `currentPlayer === 'player'` branch. Use existing combat
  facts as the muted visual warning and existing registered unit SFX/mixer routing for
  any normal combat audio.

- [ ] **Step 4: Run focused presentation/storage tests and source rules**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/render-loop.ts
  ./scripts/run-with-mise.sh yarn test --run tests/renderer/air-defense-overlay.test.ts tests/renderer/render-loop-wrap.test.ts tests/storage/save-persistence.test.ts tests/storage/save-file-transfer.test.ts tests/core/hotseat-events.test.ts
  ```

  Expected: all selected tests pass; old and new saves require no migration.

- [ ] **Step 5: Commit the presentation slice**

  ```bash
  git add src/renderer/render-loop.ts tests/renderer tests/storage tests/core
  git commit -m "fix(ui): show Mobile AA field coverage safely (#680)"
  ```

### Task 4: Give the AI bounded observed-air production and escort behavior

**Files:**
- Modify: `src/ai/ai-prepared-turn.ts:122-148,527-538`
- Modify: `src/ai/ai-unit-roles.ts:5-48`
- Modify: `src/ai/ai-unit-assignment.ts:50-68`
- Modify: `src/ai/ai-personality.ts:54-80`
- Modify: `src/ai/ai-tactics.ts:612-648`
- Test: `tests/ai/ai-unit-roles.test.ts`
- Test: `tests/ai/ai-production.test.ts`
- Test: `tests/ai/ai-prepared-turn.test.ts`
- Test: `tests/ai/ai-tactics.test.ts`
- Test: `tests/ai/ai-perception.test.ts`

- [ ] **Step 1: Write failing AI tests**

  Add a visible hostile WWII Fighter whose definition has `strike` and whose visible
  position is within operational range of a high-value friendly formation, then assert a
  Mobile AA chooses a legal radius-1 escort move. The fixture must hide the aircraft's
  base and assert the action remains unchanged, proving the decision uses only the
  visible aircraft type, position, and public definition—not `airBase` or hidden state.
  Add negative cases for an unseen live aircraft, hidden base, stale/remembered
  aircraft, no legally threatened formation, and an occupied/illegal destination.
  Parameterize Explorer, Standard, and Veteran to prove each receives the same legal
  visible inputs and never chooses a hidden-information action.

  Add a prepared-force-demand test parallel to Anti-Tank Gun: one currently visible
  hostile air threat yields at most one `air-defense` demand; a trusted memory may yield
  at most one lower-priority production caution; existing/queued Mobile AA reduces the
  residual. Assert no demand derives from an unobserved global unit.

- [ ] **Step 2: Run focused AI tests and confirm failure**

  Run: `./scripts/run-with-mise.sh yarn test --run tests/ai/ai-unit-roles.test.ts tests/ai/ai-production.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-tactics.test.ts tests/ai/ai-perception.test.ts`

  Expected: `air-defense` is unknown and Mobile AA has no production demand or escort
  action.

- [ ] **Step 3: Implement catalog-driven, information-safe AI behavior**

  Add `air-defense` to role ordering and combat-production weighting. In
  `ai-prepared-turn.ts`, implement `observedAirDefenseDemand()` beside
  `observedArmorDemand()`: inspect only `MajorCivPerception.units`, require a hostile
  unit with `domain === 'air'`, cap desired at one, count owned `air-defense` units,
  and use the existing merged residual path. Never read raw enemy `state.units` for
  intelligence.

  In `ai-tactics.ts`, add a helper that accepts only a Mobile-AA-capable unit, visible
  perceived hostile air units, and friendly non-transport candidates. A threat is valid
  only when its visible aircraft type has a `strike` mission and its visible position is
  within that public definition's `airOperation.operationalRange` of the friendly
  candidate. Do not inspect the hostile unit's `airBase`, action state, or any other
  raw-state private field; this is intentionally conservative observed pressure. Rank
  legal destinations that leave the candidate within the provider radius by protected
  production cost, threat proximity, shortest movement, then coordinate key. Return
  these moves ahead of ordinary plan-progress moves; retain normal `rankMoves()` when
  the helper returns none. Use the existing deterministic challenge selector only after
  generating the same legal action list for every level.

- [ ] **Step 4: Run focused AI tests and source rules**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/ai/ai-prepared-turn.ts src/ai/ai-unit-roles.ts src/ai/ai-unit-assignment.ts src/ai/ai-personality.ts src/ai/ai-tactics.ts
  ./scripts/run-with-mise.sh yarn test --run tests/ai/ai-unit-roles.test.ts tests/ai/ai-production.test.ts tests/ai/ai-prepared-turn.test.ts tests/ai/ai-tactics.test.ts tests/ai/ai-perception.test.ts
  ```

  Expected: visible threat produces a bounded legal escort; all hidden-intel and
  remembered-tactical negatives pass across every difficulty.

- [ ] **Step 5: Commit the AI slice**

  ```bash
  git add src/ai tests/ai
  git commit -m "feat(ai): escort formations with observed Mobile AA (#680)"
  ```

### Task 5: Run end-to-end verification and review the full delta

**Files:**
- Review: `origin/main...HEAD` and working tree delta
- Test: all touched focused tests above

- [ ] **Step 1: Run the complete required checks**

  Run:

  ```bash
  ./scripts/run-with-mise.sh yarn build
  ./scripts/run-with-mise.sh yarn test
  ```

  Expected: both commands exit 0. If a full-suite session has incomplete output, run
  `./scripts/run-with-mise.sh yarn test:durable` once and confirm with
  `./scripts/run-with-mise.sh yarn test:durable:status` for the current HEAD/worktree.

- [ ] **Step 2: Inspect both review diffs**

  Run:

  ```bash
  git diff --check
  git diff --stat origin/main...HEAD
  git diff origin/main...HEAD
  git diff --stat
  git diff
  ```

  Confirm: no Mobile-AA-specific raw-state intelligence read, no stacking bypass, no
  source-only feature left unrendered, no stale open-panel/overlay behavior, and no
  hot-seat `player` hardcode.

- [ ] **Step 3: Commit any verification-only correction**

  ```bash
  git add <exact corrected paths>
  git commit -m "test(combat): cover Mobile AA regressions (#680)"
  ```

  Do not create an empty commit when no correction is needed.

## Plan self-review

- Spec coverage: Tasks 1–2 implement the exact roster, combat, and data contract;
  Task 3 handles remote overlay, UI truth, muted accessibility, saves, solo, and hot
  seat; Task 4 implements bounded AI production/escort behavior and difficulty parity;
  Task 5 verifies the complete player-visible and source delta.
- Placeholder scan: no deferred implementation, unspecified edge case, or generic
  “write tests” instruction remains; every task names its files, tests, commands, and
  expected result.
- Type consistency: shared `UnitDefinition`/`Building.airDefenseProvider`,
  `AIStrategicRole` value `air-defense`, `getKnownAirDefenseProviders()`, and
  `observedAirDefenseDemand()` are introduced before their consumers and used
  consistently throughout the plan.
