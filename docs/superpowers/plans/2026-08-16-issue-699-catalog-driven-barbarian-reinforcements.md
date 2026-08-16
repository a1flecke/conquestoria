# Catalog-Driven Barbarian Reinforcements Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Activate #699's bounded barbarian reinforcements through the existing eligibility catalog so every future unit is explicitly eligible or excluded.

**Architecture:** `barbarian-roster.ts` remains the complete classification table. `barbarian-force-composer.ts` becomes the sole selector of a legal reinforcement from era, existing camp force, coarse local observations, and deterministic seed. `processPurposefulBarbarians` supplies only camp-local inputs; the turn manager continues creating the selected unit.

**Tech Stack:** TypeScript, Vitest, serializable `GameState`, existing seeded LCG utilities.

---

## Scope and current seams

#696 already adds `BARBARIAN_ELIGIBILITY_BY_UNIT` as `Record<UnitType, BarbarianEligibility>`; #697 already has an inert deterministic composer; and #698 persists camp-local `armor` / `air` observations. The only missing connection is `chooseBarbarianSpawnType()` in `src/systems/barbarian-system.ts`, which still reads the legacy `BARBARIAN_ROSTER_BY_ERA`.

No new UI, notification, save shape, unit type, art/audio asset, difficulty legality rule, resource rule, or mass upgrade belongs here. #700 retains global spawn-cap and balance auditing. “Bounded” in this change means declared era windows, role shares, mutual exclusions, and per-camp specialist caps.

## Task 1: Make the catalog executable and future-safe

**Files:**
- Modify: `src/systems/barbarian-force-composer.ts`
- Modify: `tests/systems/barbarian-roster.test.ts`
- Modify: `tests/systems/barbarian-force-composer.test.ts`

- [ ] **Step 1: Write the failing catalog tests.** Keep the existing exact-key assertion between `UNIT_DEFINITIONS` and `BARBARIAN_ELIGIBILITY_BY_UNIT`, then add a generic loop over every entry. It must prove eligible entries appear at their lower boundary, disappear one era below and (when finite) one era above, and observation-gated entries require their own typed observation. Do not use the #699 eight-unit list as production logic.

```ts
it('makes every eligible catalog entry selectable only in its declared window', () => {
  for (const [unitType, eligibility] of Object.entries(BARBARIAN_ELIGIBILITY_BY_UNIT) as [UnitType, BarbarianEligibility][]) {
    if (eligibility.status === 'excluded') continue;
    const observedThreats = eligibility.requiresObservation ? [eligibility.requiresObservation] : [];
    expect(getBarbarianReinforcementCandidates({ era: eligibility.eraWindow.min, observedThreats }))
      .toContain(unitType);
    expect(getBarbarianReinforcementCandidates({ era: eligibility.eraWindow.min - 1, observedThreats }))
      .not.toContain(unitType);
    if (eligibility.eraWindow.max !== undefined) {
      expect(getBarbarianReinforcementCandidates({ era: eligibility.eraWindow.max + 1, observedThreats }))
        .not.toContain(unitType);
    }
  }
});
```

- [ ] **Step 2: Run RED.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-roster.test.ts tests/systems/barbarian-force-composer.test.ts`

Expected: FAIL because `getBarbarianReinforcementCandidates` does not exist.

- [ ] **Step 3: Export the pure candidate query from the existing composer.** Reuse `candidateForContext()` and `candidatesFor()`; do not copy eligibility conditions into the roster or barbarian system.

```ts
export interface BarbarianReinforcementCandidateContext {
  era: number;
  observedThreats?: readonly BarbarianObservationRequirement[];
}

export function getBarbarianReinforcementCandidates(
  context: BarbarianReinforcementCandidateContext,
): UnitType[] {
  return candidatesFor({
    ...context, era: normalizeEra(context.era),
    forceSize: 1, escalated: false, seed: 0,
  }).map(candidate => candidate.unitType);
}
```

- [ ] **Step 4: Run GREEN.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-roster.test.ts tests/systems/barbarian-force-composer.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/systems/barbarian-force-composer.ts tests/systems/barbarian-roster.test.ts tests/systems/barbarian-force-composer.test.ts
git commit -m "test(699): enforce catalog-driven barbarian eligibility"
```

## Task 2: Select one bounded reinforcement against the existing camp force

**Files:**
- Modify: `src/systems/barbarian-force-composer.ts`
- Modify: `tests/systems/barbarian-force-composer.test.ts`

- [ ] **Step 1: Write the failing selector tests.** Prove a fixed context repeats exactly; an unobserved camp cannot select Anti-Tank Gun/Mobile AA; an existing Mobile AA prevents another; Cavalry and Cuirassier cannot coexist; and every returned type belongs to the generic candidate query.

```ts
it('selects only a catalog candidate legal for the current camp context', () => {
  const context = {
    era: 10, escalated: false, seed: 429,
    assignedUnitTypes: ['tank', 'rifleman'],
    observedThreats: ['armor', 'air'],
  } as const;
  const selected = selectBarbarianReinforcement(context);

  expect(selected).toBeDefined();
  expect(getBarbarianReinforcementCandidates(context)).toContain(selected);
  expect(selectBarbarianReinforcement(context)).toBe(selected);
});

it('honors per-camp and mutual-exclusion metadata from existing units', () => {
  expect(selectBarbarianReinforcement({
    era: 10, escalated: false, seed: 1,
    assignedUnitTypes: ['mobile_aa'], observedThreats: ['air'],
  })).not.toBe('mobile_aa');
  expect(selectBarbarianReinforcement({
    era: 6, escalated: false, seed: 1,
    assignedUnitTypes: ['cavalry'], observedThreats: [],
  })).not.toBe('cuirassier');
});
```

- [ ] **Step 2: Run RED.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-force-composer.test.ts`

Expected: FAIL because `selectBarbarianReinforcement` is absent.

- [ ] **Step 3: Implement the selector inside the composer.** Add a context with `assignedUnitTypes`, `escalated`, and `seed`. Convert only catalog-eligible assigned types to internal `Candidate` values and use the existing `canAddCandidate()` predicate with `forceSize: assigned.length + 1`. Return `undefined` when every candidate violates a cap; do not bypass a cap as fallback. Keep `composeBarbarianForce()` and route both APIs through the same candidate/cap helpers.

```ts
export interface BarbarianReinforcementContext extends BarbarianReinforcementCandidateContext {
  assignedUnitTypes: readonly UnitType[];
  escalated: boolean;
  seed: number;
}

export function selectBarbarianReinforcement(
  context: BarbarianReinforcementContext,
): UnitType | undefined {
  const normalized = { ...context, era: normalizeEra(context.era) };
  const forceSize = context.assignedUnitTypes.length + 1;
  const force = context.assignedUnitTypes
    .map(type => candidateForContext(type, { ...normalized, forceSize }))
    .filter((candidate): candidate is Candidate => candidate !== null);
  const selectionContext = { ...normalized, forceSize };
  const legal = candidatesFor(selectionContext)
    .filter(candidate => canAddCandidate(candidate, force, selectionContext));
  return legal.length === 0
    ? undefined
    : weightedPick(legal, legal.map(candidate => candidate.eligibility.weight), seededLcg(context.seed)).unitType;
}
```

- [ ] **Step 4: Run GREEN.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-force-composer.test.ts`

Expected: PASS, including the original prospective-force cap tests.

- [ ] **Step 5: Commit.**

```bash
git add src/systems/barbarian-force-composer.ts tests/systems/barbarian-force-composer.test.ts
git commit -m "feat(699): select bounded camp reinforcements"
```

## Task 3: Wire the live selector to only camp-local facts

**Files:**
- Modify: `src/systems/barbarian-system.ts`
- Modify: `tests/systems/barbarian-system.test.ts`
- Modify: `tests/core/turn-manager.test.ts`

- [ ] **Step 1: Write failing end-to-end tests.** Through `processPurposefulBarbarians()`, make a camp due at era 9/10 and assert a selected unit is a generic legal candidate. Prove current armor observation permits the armor counter, a missing/expired observation does not, existing Mobile AA blocks a second one, and existing barbarians stay unchanged after an era change. Through `processTurn()`, assert the selected unit is created as `barbarian` and assigned to its spawning camp.

```ts
it('uses only active camp-local pressure for a due reinforcement', () => {
  const state = purposefulState();
  state.turn = 20;
  state.barbarianCamps['camp-a'] = { ...state.barbarianCamps['camp-a'], spawnCooldown: 1 };
  state.barbarianCampPressure = { 'camp-a': { armorLastObservedTurn: 20 } };

  const result = processPurposefulBarbarians(state);
  const spawnedType = result.spawnedUnits.find(spawn => spawn.campId === 'camp-a')?.unitType;

  expect(spawnedType).toBeDefined();
  expect(getBarbarianReinforcementCandidates({ era: 9, observedThreats: ['armor'] }))
    .toContain(spawnedType);
});
```

- [ ] **Step 2: Run RED.**

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-system.test.ts tests/core/turn-manager.test.ts`

Expected: FAIL because live selection still calls `chooseBarbarianSpawnType()`.

- [ ] **Step 3: Replace only the legacy selector.** Delete `chooseBarbarianSpawnType()`. For each due camp, retain its current nearest-city target/era calculation, read `getActiveCampPressure(observationState, camp.id, state.turn)`, and call the composer. Keep occupancy checks, coordinate selection, cooldown updates, the turn-manager creation mutation, camp-home mapping, and event emission unchanged. Omit a spawn only when no bounded candidate is legal.

```ts
const observedThreats = getActiveCampPressure(observationState, camp.id, state.turn);
const unitType = selectBarbarianReinforcement({
  era: resolveNeutralPressureEra(state, camp.position, target?.owner) ?? 1,
  assignedUnitTypes: assigned.map(unit => unit.type),
  observedThreats,
  escalated: camp.strength >= 8,
  seed,
});
if (spawnPosition && unitType) {
  spawnedUnits.push({ ...spawn, position: spawnPosition, unitType });
}
```

- [ ] **Step 4: Run targeted GREEN and source rules.**

Run: `scripts/check-src-rule-violations.sh src/systems/barbarian-system.ts src/systems/barbarian-force-composer.ts`

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-roster.test.ts tests/systems/barbarian-force-composer.test.ts tests/systems/barbarian-system.test.ts tests/core/turn-manager.test.ts`

Expected: PASS.

- [ ] **Step 5: Commit.**

```bash
git add src/systems/barbarian-system.ts tests/systems/barbarian-system.test.ts tests/core/turn-manager.test.ts
git commit -m "feat(699): wire catalog into barbarian reinforcements"
```

## Task 4: Complete the generic regression matrix and verify

**Files:** Review all source and test files modified in Tasks 1–3.

- [ ] **Step 1: Add reviewed-window fixtures.** Table-drive Chariot E2–4, Trebuchet E4–6, Cavalry/Cuirassier E6–8 mutual exclusion, Armored Car E9–11, armor-gated Anti-Tank Gun E9+, air-gated one-per-camp Mobile AA E10+, and Mechanized Infantry E10+. These fixtures must call the generic APIs, never a hardcoded selector branch.

- [ ] **Step 2: Add negative and parity coverage.** Prove excluded naval/air/unique/crisis/deterrence units are never candidates; the same camp input has identical legality for Explorer, Standard, and Veteran; and candidate selection reads neither global unit state, player research, resources, nor current viewer. Verify saved observations and their expiry through the existing #698 pressure test path.

- [ ] **Step 3: Run narrow verification.**

Run: `scripts/check-src-rule-violations.sh src/systems/barbarian-roster.ts src/systems/barbarian-force-composer.ts src/systems/barbarian-system.ts`

Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/barbarian-roster.test.ts tests/systems/barbarian-force-composer.test.ts tests/systems/barbarian-pressure.test.ts tests/systems/barbarian-system.test.ts tests/core/turn-manager.test.ts`

Expected: PASS.

- [ ] **Step 4: Review and run PR-grade verification.**

Run: `git diff --check`

Run: `git diff --stat origin/main...HEAD`

Run: `git diff --stat`

Run: `bash scripts/run-with-mise.sh yarn build`

Run: `bash scripts/run-with-mise.sh yarn test:durable`

Run: `bash scripts/run-with-mise.sh yarn test:durable:status`

Expected: every command exits zero; durable status belongs to the current `HEAD` and working tree.

- [ ] **Step 5: Commit the matrix.**

```bash
git add tests/systems/barbarian-roster.test.ts tests/systems/barbarian-force-composer.test.ts tests/systems/barbarian-system.test.ts tests/core/turn-manager.test.ts
git commit -m "test(699): cover bounded reinforcement contract"
```

The PR description must state that #699 activates #696–#698, that every future `UnitType` requires typed eligibility/exclusion, and that #700 owns broad spawn-cap/balance audit.

## Plan self-review

- **Coverage:** Task 1 makes future omissions fail in the catalog; Task 2 applies one shared cap-aware selector; Task 3 reaches the real turn path; Task 4 covers exact approved windows and verification.
- **No scope drift:** This plan adds no persistence or presentation behavior and preserves #700's audit ownership.
- **Type consistency:** candidate context contains era/observations; reinforcement context adds assigned types, escalation, and seed; the live caller can derive each from existing camp-local state.

