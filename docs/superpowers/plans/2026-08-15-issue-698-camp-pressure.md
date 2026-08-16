# Camp-Local Pressure Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist expiring, non-omniscient armor and air observations for each barbarian camp without changing reinforcement behavior.

**Architecture:** `barbarian-pressure.ts` owns the typed coarse record, normalization, expiry, and observation predicates. Existing barbarian sensing, combat outcomes, and air-strike resolution call it at their mutation sources. Save schema 14 initializes and normalizes the record; #699 remains its only reinforcement consumer.

**Tech Stack:** TypeScript, Vitest, serializable `GameState`, axial hex helpers, save migrations.

---

## File structure

- Create: `src/systems/barbarian-pressure.ts` — coarse-state mutation, cleanup, active query, observation predicates.
- Modify: `src/core/types.ts`, `src/systems/barbarian-system.ts`, `src/systems/combat-reward-system.ts`, `src/systems/air-operations-system.ts`, `src/storage/save-migrations.ts`.
- Test: `tests/systems/barbarian-pressure.test.ts`, `tests/systems/barbarian-system.test.ts`, `tests/systems/air-operations-system.test.ts`, `tests/storage/save-migrations.test.ts`.

### Task 1: Typed coarse state and expiry

**Files:** Create `src/systems/barbarian-pressure.ts`, `tests/systems/barbarian-pressure.test.ts`; modify `src/core/types.ts`.

- [ ] **Step 1: Write failing expiry and data-minimization tests.**

```ts
it('keeps armor through T + 10 and expires it at T + 11', () => {
  const next = recordCampPressure(state, 'camp-a', 'armor', 40);
  expect(getActiveCampPressure(next, 'camp-a', 50)).toEqual(['armor']);
  expect(getActiveCampPressure(next, 'camp-a', 51)).toEqual([]);
});
it('stores only a renewed scalar turn', () => {
  const next = recordCampPressure(recordCampPressure(state, 'camp-a', 'armor', 12), 'camp-a', 'armor', 15);
  expect(next.barbarianCampPressure?.['camp-a']).toEqual({ armorLastObservedTurn: 15 });
});
```

- [ ] **Step 2: Run:** `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-pressure.test.ts`. **Expected:** FAIL because the module is absent.
- [ ] **Step 3: Implement** `BarbarianPressureKind`, `BarbarianCampPressure`, `recordCampPressure`, `getActiveCampPressure`, and `normalizeBarbarianCampPressure`. The record accepts only existing camp IDs and finite integer turns from zero through `state.turn`.
- [ ] **Step 4: Re-run the focused test.** **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add src/core/types.ts src/systems/barbarian-pressure.ts tests/systems/barbarian-pressure.test.ts && git commit -m "feat(698): add camp pressure state"`.

### Task 2: Camp-sensed local observation

**Files:** Modify `src/systems/barbarian-pressure.ts`, `src/systems/barbarian-system.ts`, `tests/systems/barbarian-pressure.test.ts`, `tests/systems/barbarian-system.test.ts`.

- [ ] **Step 1: Write failing positive and negative sensing tests.**

```ts
it('records a sensed tank within six hexes but not a distant tank in GameState', () => {
  expect(getActiveCampPressure(observeCampPressureFromSensedUnits(localArmorState, 'camp-a', assigned),  'camp-a', 20)).toContain('armor');
  expect(getActiveCampPressure(observeCampPressureFromSensedUnits(distantArmorState, 'camp-a', assigned), 'camp-a', 20)).not.toContain('armor');
});
it('requires a local sensed air base for air pressure', () => {
  expect(getActiveCampPressure(observeCampPressureFromSensedUnits(localBasedAircraftState, 'camp-a', assigned), 'camp-a', 20)).toContain('air');
  expect(getActiveCampPressure(observeCampPressureFromSensedUnits(unbasedAircraftState, 'camp-a', assigned), 'camp-a', 20)).not.toContain('air');
});
```

- [ ] **Step 2: Run:** `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-pressure.test.ts tests/systems/barbarian-system.test.ts`. **Expected:** FAIL with no active facts.
- [ ] **Step 3: Implement** `observeCampPressureFromSensedUnits(state, campId, assignedUnits)`. Reuse the planner’s existing sensed-unit list; armor requires `getUnitRoleDefinition(unit.type)?.localInfrastructureFamilies?.includes('armored') === true` and map distance no greater than six. Air requires a valid `airBase` whose resolved base position is sensed and no greater than six. Call it once per camp without changing plans, spawns, orders, or the composer.
- [ ] **Step 4: Re-run focused tests.** **Expected:** PASS, and serialized planner state does not contain a distant unit ID.
- [ ] **Step 5: Commit:** `git add src/systems/barbarian-pressure.ts src/systems/barbarian-system.ts tests/systems/barbarian-pressure.test.ts tests/systems/barbarian-system.test.ts && git commit -m "feat(698): observe local camp pressure"`.

### Task 3: Attack and air-strike provenance

**Files:** Modify `src/systems/barbarian-pressure.ts`, `src/systems/combat-reward-system.ts`, `src/systems/air-operations-system.ts`, `tests/systems/barbarian-pressure.test.ts`, `tests/systems/air-operations-system.test.ts`.

- [ ] **Step 1: Write failing source-path tests.**

```ts
it('records armor when an armored attacker attacks a defender assigned to camp-a', () => {
  expect(getActiveCampPressure(recordCampPressureFromCombatOutcome(state, tank, assignedRaider), 'camp-a', state.turn)).toContain('armor');
});
it('records air only after a successful local air strike', () => {
  const result = resolveAirStrike(stateWithNearbyCamp, 'biplane-1', nearbyTarget);
  expect(getActiveCampPressure(result.state, 'camp-a', stateWithNearbyCamp.turn)).toContain('air');
});
```

Test non-armored attackers, unassigned barbarians, failed/out-of-range strikes, and strikes beyond six hexes as negative cases.

- [ ] **Step 2: Run:** `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-pressure.test.ts tests/systems/air-operations-system.test.ts`. **Expected:** FAIL with absent facts.
- [ ] **Step 3: Implement** `recordCampPressureFromCombatOutcome` using only the defender’s current home-camp mapping and `getUnitRoleDefinition(attacker.type)?.localInfrastructureFamilies?.includes('armored') === true`. In `resolveAirStrike`, call `recordCampPressureFromAirStrike(nextState, striker, target)` only after successful resolution; it validates `striker.airBase` and camps within six hexes. Neither helper emits UI, audio, or events.
- [ ] **Step 4: Re-run focused tests.** **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add src/systems/barbarian-pressure.ts src/systems/combat-reward-system.ts src/systems/air-operations-system.ts tests/systems/barbarian-pressure.test.ts tests/systems/air-operations-system.test.ts && git commit -m "feat(698): record camp combat observations"`.

### Task 4: Save migration and camp cleanup

**Files:** Modify `src/storage/save-migrations.ts`, `src/systems/barbarian-system.ts`, `tests/storage/save-migrations.test.ts`, `tests/systems/barbarian-system.test.ts`.

- [ ] **Step 1: Write failing migration and cleanup tests.**

```ts
it('migrates schema 13 data to schema 14 and idempotently removes invalid pressure', () => {
  const migrated = migrateSaveToCurrent({ ...save, saveSchemaVersion: 13, barbarianCampPressure: { 'camp-a': { armorLastObservedTurn: 4, airLastObservedTurn: -1 }, gone: { armorLastObservedTurn: 3 } } });
  expect(migrated.saveSchemaVersion).toBe(14);
  expect(migrated.barbarianCampPressure).toEqual({ 'camp-a': { armorLastObservedTurn: 4 } });
  expect(migrateSaveToCurrent(migrated)).toEqual(migrated);
});
it('removes pressure with a destroyed camp', () => {
  expect(applyCampDestruction(stateWithPressure, 'player', 'camp-a', 9).state.barbarianCampPressure?.['camp-a']).toBeUndefined();
});
```

Also cover schema 0, current round-trip, mid-turn saves, future/malformed turn values, three difficulty labels with identical observation facts, and two-human current-player changes after reload.

- [ ] **Step 2: Run:** `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/systems/barbarian-system.test.ts`. **Expected:** FAIL because current schema is 13 and destroyed camps retain pressure.
- [ ] **Step 3: Set** `CURRENT_SAVE_SCHEMA_VERSION = 14`, add `14: migrateBarbarianCampPressure`, unconditionally run `normalizeBarbarianCampPressure` after migrations, and remove the record in `applyCampDestruction` with immutable spread-copy. Do not import the #697 composer.
- [ ] **Step 4: Re-run:** `bash scripts/run-with-mise.sh yarn test --run tests/storage/save-migrations.test.ts tests/systems/barbarian-system.test.ts tests/systems/barbarian-pressure.test.ts`. **Expected:** PASS.
- [ ] **Step 5: Commit:** `git add src/storage/save-migrations.ts src/systems/barbarian-system.ts tests/storage/save-migrations.test.ts tests/systems/barbarian-system.test.ts tests/systems/barbarian-pressure.test.ts && git commit -m "feat(698): persist camp pressure observations"`.

### Task 5: Validate the inert delivery boundary

**Files:** No production changes.

- [ ] **Step 1: Run source rules.** `scripts/check-src-rule-violations.sh src/core/types.ts src/systems/barbarian-pressure.ts src/systems/barbarian-system.ts src/systems/combat-reward-system.ts src/systems/air-operations-system.ts src/storage/save-migrations.ts`. **Expected:** exit 0.
- [ ] **Step 2: Run focused regressions.** `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-pressure.test.ts tests/systems/barbarian-system.test.ts tests/systems/air-operations-system.test.ts tests/storage/save-migrations.test.ts`. **Expected:** PASS.
- [ ] **Step 3: Inspect the exact boundary.** `git diff --check && git diff --stat origin/main...HEAD && git diff origin/main...HEAD`. **Expected:** no composer import, roster change, notification, UI, renderer, or audio behavior.
- [ ] **Step 4: Run delivery proof separately:** `bash scripts/run-with-mise.sh yarn build`, then `bash scripts/run-with-mise.sh yarn test:durable`, then `bash scripts/run-with-mise.sh yarn test:durable:status`. **Expected:** all exit 0 for current HEAD and working tree.

## Plan self-review

- Tasks 1–4 cover serializable state, 10-turn inclusive expiry, all allowed provenance, negative information boundaries, cleanup, schema 0/13/current migration, solo difficulty parity, and hot-seat save isolation.
- This issue adds no player action or display; UI truth-table and queue requirements do not apply. Tests prove that pressure never enters current-viewer UI, notification, audio, or animation state.
- Every new behavior is typed and metadata-driven; future unit types join through roles and `airOperation`, not ID switches.
