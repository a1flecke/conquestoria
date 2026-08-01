# Armored Car Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver Armored Car as a save-safe, catalog-driven Era 9 reconnaissance and pursuit unit with a legal Cavalry-to-helicopter succession.

**Approved adjustment:** Motorized Transport costs 240 science (retuned from the issue's
190 after the live pacing audit measured eight turns; 240 reaches the 10-turn floor).

**Architecture:** Add the stable `armored_car` definition and feed it through current catalog, role, modifier, ZOC-class, presentation, AI, sprite, and audio seams. Reuse `evaluateUnitUpgrade` and `baseNewAirUnit` for the host-city Helicopter Base transition; do not add an Armored-Car-specific conversion path or migration.

**Tech Stack:** TypeScript, Vitest, Canvas/DOM game UI, Yarn 4, serializable save state.

---

## File map

- `src/core/types.ts` — stable `UnitType` member.
- `src/systems/unit-system.ts` — exact stats and honest description.
- `src/systems/city-system.ts`, `src/systems/tech-definitions-eras9.ts` — production, explicit succession, icon, and Motorized Transport unlock.
- `src/systems/unit-modifier-definitions.ts`, `src/systems/combat-role-definitions.ts` — pursuit fact and definition-driven recon/mobile/pursuit role.
- `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts` — documented Tank visual and Knight audio temporary fallbacks.
- `tests/systems/*`, `tests/ai/*`, `tests/ui/*`, `tests/audio/*`, `tests/renderer/*`, `tests/storage/*` — contract coverage.

## Player Truth Table

| Before | Action | Immediate visible result |
| --- | --- | --- |
| Motorized Transport missing | Open production catalog | Expanded locked catalog names Motorized Transport; Armored Car is not actionable. |
| Motorized Transport complete | Open production catalog | Armored Car is actionable with cost and concise role. |
| Target health is 60+ | Preview attack | “Armored Car pursuit ×1.15 (not active)” is shown. |
| Target health is below 60 | Preview attack | “Armored Car pursuit ×1.15” is shown and calculated. |
| Car is outside a friendly Helicopter Base city or base is full | Inspect upgrade | No confirmation button; the visible reason names city/base or capacity. |
| Car occupies a friendly open-slot Helicopter Base city | Confirm upgrade | It becomes a based Attack Helicopter; selected-unit information refreshes. |

## Misleading UI Risks

- “Pursuit” is conditional, never an unconditional combat claim; test 60 and 59 health.
- “Upgrades to Attack Helicopter” is not a promise of immediate conversion; test city, building, and full-base failures.
- The full explanatory production catalog must remain reachable after recommendation ordering; test the existing `data-locked-show-more` path.

## Interaction Replay Checklist

- Open a locked production catalog, expand its explanatory entries, then satisfy Motorized Transport and reopen it.
- Preview at 60 and 59 health, then resolve through the non-UI combat path.
- Inspect the missing-base and full-base upgrade states, then upgrade in a valid host city and rerender selected-unit information.
- Change `currentPlayer`, reopen the city/selected-unit panel, and verify no prior human’s tech, base slot, or fact remains visible.

### Task 1: Establish the typed catalog and explicit chain

**Files:**
- Modify: `tests/systems/city-system.test.ts`, `tests/systems/unit-chain-integrity.test.ts`, `tests/systems/tech-unlocks-consistency.test.ts`, `tests/systems/unit-upgrade.test.ts`
- Modify: `src/core/types.ts`, `src/systems/unit-system.ts`, `src/systems/city-system.ts`, `src/systems/tech-definitions-eras9.ts`

- [ ] **Step 1: Write failing catalog, gate, and explicit-chain tests.**

  ```ts
  const armoredCar = 'armored_car' as UnitType;
  expect(getTrainableUnitsForCiv(['motorized-transport']).find(unit => unit.type === armoredCar))
    .toMatchObject({ cost: 168, techRequired: 'motorized-transport', upgradesTo: 'attack_helicopter' });
  expect(TRAINABLE_UNITS.find(unit => unit.type === 'cavalry'))
    .toMatchObject({ upgradesTo: armoredCar, obsoletedByTech: 'motorized-transport' });
  expect(TECH_TREE.find(tech => tech.id === 'motorized-transport')?.unlocksUnits)
    .toContain(armoredCar);
  expect(getCanonicalUpgradeTarget(makeUnit('cavalry'), ['rifle-tactics', 'professional-army', 'motorized-transport']))
    .toBe(armoredCar);
  ```

  Add negative assertions: missing Motorized Transport keeps Armored Car unavailable;
  requesting Tank or Attack Helicopter directly from Cavalry returns `invalid-target`.

- [ ] **Step 2: Run focused red tests.**

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-upgrade.test.ts
  ```

  Expected: `armored_car` is absent from the union/catalog.

- [ ] **Step 3: Implement only the typed catalog contract.**

  ```ts
  // UNIT_DEFINITIONS
  armored_car: { type: 'armored_car', name: 'Armored Car', movementPoints: 4,
    visionRange: 3, strength: 48, canFoundCity: false,
    canBuildImprovements: false, productionCost: 168 },
  // TRAINABLE_UNITS
  { type: 'armored_car', name: 'Armored Car', cost: 168,
    techRequired: 'motorized-transport', upgradesTo: 'attack_helicopter',
    pacing: { band: 'power-spike', role: 'light-mobile-recon', impact: 1.2,
      scope: 'military', snowball: 1.05, urgency: 1, situationality: 1.25, unlockBreadth: 1 } },
  ```

  Add `armored_car` to `UnitType`, retarget Cavalry’s `upgradesTo` and
  `obsoletedByTech`, add `unlocksUnits: ['armored_car']` to Motorized Transport, a
  production icon, and an honest description stating pursuit/no control.

- [ ] **Step 4: Run source policy and focused tests.**

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras9.ts
  bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-upgrade.test.ts
  ```

- [ ] **Step 5: Commit the catalog slice.**

  ```bash
  git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/tech-definitions-eras9.ts tests/systems/city-system.test.ts tests/systems/unit-chain-integrity.test.ts tests/systems/tech-unlocks-consistency.test.ts tests/systems/unit-upgrade.test.ts
  git commit -m "feat(combat): add Armored Car catalog contract"
  ```

### Task 2: Add pursuit, recon ZOC semantics, roles, and balance evidence

**Files:**
- Modify: `tests/systems/unit-modifier-system.test.ts`, `tests/systems/zone-of-control-system.test.ts`, `tests/systems/combat-system.test.ts`, `tests/ai/ai-unit-roles.test.ts`
- Modify: `src/systems/unit-modifier-definitions.ts`, `src/systems/combat-role-definitions.ts`

- [ ] **Step 1: Write failing tactical tests.**

  ```ts
  expect(getCombatModifier('armored_car', 'attacker', baseCombatCtx({ opponentHealth: 59 })).facts)
    .toContainEqual(expect.objectContaining({ key: 'unit:armored-car:pursuit', value: 1.15, outcome: 'applied' }));
  expect(getCombatModifier('armored_car', 'attacker', baseCombatCtx({ opponentHealth: 60 })).mult).toBe(1);
  expect(isZocEligibleCombatUnit(createUnit('armored_car', 'p1', { q: 0, r: 0 }, counters))).toBe(false);
  expect(getZoneOfControlAt(state, armoredCar, destination)).toEqual({ limited: false, sourceUnitIds: [] });
  ```

  Assert the role presentation is 18 words or fewer and carries `recon`, `mobile`, and
  `pursuit`; compare exact stats and deterministic exchanges against Cavalry, Tank,
  Attack Helicopter, and Rifleman without asserting raw-strength monotonicity.

- [ ] **Step 2: Run the tactical red tests.**

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/systems/zone-of-control-system.test.ts tests/systems/combat-system.test.ts tests/ai/ai-unit-roles.test.ts
  ```

- [ ] **Step 3: Implement definition-driven facts only.**

  ```ts
  armored_car: ['recon'],
  { source: unit('armored_car'), effect: 'combatStrength', mode: 'multiplier', value: 1.15,
    unitTypes: ['armored_car'], when: 'attacking', condition: 'opponentBelow60HP',
    factKey: 'unit:armored-car:pursuit', label: 'Armored Car pursuit' },
  ```

  Add a concise `role('reconnaissance', ...)` record with generic secondary
  `mobile`/`pursuit` roles. Do not modify ZOC code: the tested `recon` classification
  is its canonical input.

- [ ] **Step 4: Verify human and non-human calculations.**

  Add the same modifier-fact assertion through `buildCombatContextForDefender` and
  `resolveCombat`; add AI candidate/research tests that use only owned Motorized
  Transport and observed demand. Run the command in Step 2 plus
  `tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts`.

- [ ] **Step 5: Commit tactical behavior.**

  ```bash
  git add src/systems/unit-modifier-definitions.ts src/systems/combat-role-definitions.ts tests/systems/unit-modifier-system.test.ts tests/systems/zone-of-control-system.test.ts tests/systems/combat-system.test.ts tests/ai/ai-unit-roles.test.ts tests/ai/ai-production.test.ts tests/ai/ai-research.test.ts
  git commit -m "feat(combat): add Armored Car pursuit rules"
  ```

### Task 3: Cover player surfaces, host-city air upgrade, saves, and fallbacks

**Files:**
- Modify: `tests/systems/unit-upgrade.test.ts`, `tests/storage/save-migrations.test.ts`, `tests/ui/city-panel.test.ts`, `tests/ui/combat-preview.test.ts`, `tests/ui/selected-unit-info.test.ts`, `tests/audio/sfx-catalog.test.ts`, `tests/renderer/sprites/sprite-catalog.test.ts`
- Modify: `src/renderer/sprites/sprite-catalog.ts`, `src/audio/sfx-catalog.ts`

- [ ] **Step 1: Write failing player and persistence regressions.**

  ```ts
  expect(evaluateUnitUpgrade(state, 'car', 'attack_helicopter').missing)
    .toContainEqual({ kind: 'air-base', reason: 'base-full' });
  expect(applyUnitUpgradeToState(validState, 'car', 'attack_helicopter').state.units.car)
    .toMatchObject({ type: 'attack_helicopter', airBase: { kind: 'city', cityId: city.id } });
  expect(formatCombatPreviewDetails('Rival', 60, preview)).toContain('Armored Car pursuit ×1.15 (not active)');
  ```

  Add a hot-seat production test that expands locked entries for a player without
  Motorized Transport, then confirms only the current owner sees the actionable car.
  Add selected-unit DOM tests for missing building, full capacity, valid confirmation,
  and post-callback refresh. Round-trip a state containing Armored Car, a based
  helicopter, and a full Helicopter Base through current save normalization; assert its
  schema version is unchanged.

- [ ] **Step 2: Run focused red tests.**

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade.test.ts tests/storage/save-migrations.test.ts tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/ui/selected-unit-info.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts
  ```

- [ ] **Step 3: Register fallbacks and wire no new UI mutation path.**

  Add `armored_car` to sprite motion/catalog with `TankSprite`, and to `UNIT_SFX` and
  locomotion with the existing Tank fallback; comment that #709 and #715 own bespoke
  replacements. The existing selected-unit upgrade callback must continue to call
  `applyUnitUpgradeToState`; add no UI-only upgrade mutation or schema migration.

- [ ] **Step 4: Verify focused surfaces and source rules.**

  ```bash
  scripts/check-src-rule-violations.sh src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts
  bash scripts/run-with-mise.sh yarn test --run tests/systems/unit-upgrade.test.ts tests/storage/save-migrations.test.ts tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/ui/selected-unit-info.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts
  ```

- [ ] **Step 5: Commit end-to-end coverage.**

  ```bash
  git add src/renderer/sprites/sprite-catalog.ts src/audio/sfx-catalog.ts tests/systems/unit-upgrade.test.ts tests/storage/save-migrations.test.ts tests/ui/city-panel.test.ts tests/ui/combat-preview.test.ts tests/ui/selected-unit-info.test.ts tests/audio/sfx-catalog.test.ts tests/renderer/sprites/sprite-catalog.test.ts
  git commit -m "test(combat): cover Armored Car player and save paths"
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

- [ ] **Step 2: Run required full verification.**

  ```bash
  bash scripts/run-with-mise.sh yarn build
  bash scripts/run-with-mise.sh yarn test:durable
  bash scripts/run-with-mise.sh yarn test:durable:status
  ```

  Expected: build exits 0 and durable status names the current clean `HEAD` as passed.

- [ ] **Step 3: Perform the final inline review.**

  Confirm the final diff preserves the 48/4/3/168 contract, 59/60 threshold, no-ZOC
  recon classification, explicit chain, host-city base capacity, owned-state AI,
  accessible explanations, hot-seat isolation, unchanged schema, and #709/#715
  fallback ownership. Fix every finding before PR creation.
