# #685 Siege Workshop Classical Siege Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Siege Workshop's existing city-local 20% production discount apply to the complete classical siege family: Catapult, Ballista, and Trebuchet.

**Architecture:** Add `classical-siege` to the existing typed production-discount family metadata and assign it only to the three classical siege units. Replace the bespoke Siege Workshop unit-ID list with a configuration row consumed by the same generic family-discount resolver used for mounted buildings. The current Black Powder obsolescence remains the era boundary, so Cannon and later artillery are excluded.

**Tech Stack:** TypeScript, Vitest, existing city production and combat-role catalog systems.

---

## File structure

- `src/core/types.ts` owns the typed set of permitted production-discount families.
- `src/systems/combat-role-definitions.ts` owns per-unit roster metadata.
- `src/systems/city-system.ts` owns building definitions, city-local cost calculation, and the shared data-driven discount resolver.
- `tests/systems/combat-role-definitions.test.ts` proves the metadata boundary.
- `tests/systems/city-system.test.ts` proves actual player/AI production-cost behavior and description honesty.
- `tests/systems/catalog-id-integrity.test.ts` validates only remaining explicit city-system unit-ID lists; its obsolete Siege Workshop list import is removed because typed role metadata now owns that boundary.

### Task 1: Define the classical-siege catalog boundary

**Files:**

- Modify: `src/core/types.ts:966`
- Modify: `src/systems/combat-role-definitions.ts:54-57`
- Test: `tests/systems/combat-role-definitions.test.ts:42-55`

- [ ] **Step 1: Write the failing metadata test**

  Extend the production-discount-family test with the intended family and explicit negative:

  ```ts
  for (const type of ['catapult', 'ballista', 'trebuchet'] as const) {
    expect(getUnitRoleDefinition(type)?.productionDiscountFamily, type).toBe('classical-siege');
  }
  expect(getUnitRoleDefinition('cannon')?.productionDiscountFamily).toBeUndefined();
  ```

- [ ] **Step 2: Run the focused test to verify it fails**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-role-definitions.test.ts`

  Expected: FAIL because the three definitions do not yet expose `classical-siege`.

- [ ] **Step 3: Add the minimal typed metadata**

  Change `UnitRoleDefinition['productionDiscountFamily']` to allow
  `'classical-siege'`, then add that value only to the `catapult`, `ballista`,
  and `trebuchet` role definitions. Leave `cannon` without a production
  discount family.

- [ ] **Step 4: Run the focused metadata test to verify it passes**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-role-definitions.test.ts`

  Expected: PASS.

### Task 2: Make Siege Workshop consume typed family metadata

**Files:**

- Modify: `src/systems/city-system.ts:186,1273-1311`
- Test: `tests/systems/city-system.test.ts:1812-1867`
- Modify: `tests/systems/catalog-id-integrity.test.ts:11,38-46`

- [ ] **Step 1: Write failing city-production tests**

  Replace the Catapult-only test with this parameterized positive proof and
  add the explicit Cannon negative:

  ```ts
  it.each(['catapult', 'ballista', 'trebuchet'] as const)(
    'siege-workshop grants %s the typed classical-siege 20% discount',
    (unitType) => {
      const base = getProductionCostForItem(unitType, { city: noBuildings });
      const discounted = getProductionCostForItem(unitType, {
        city: { buildings: ['siege-workshop'] },
      });
      expect(discounted).toBe(Math.ceil(base * 0.80));
    },
  );

  it('siege-workshop excludes gunpowder Cannon', () => {
    const base = getProductionCostForItem('cannon', { city: noBuildings });
    const discounted = getProductionCostForItem('cannon', {
      city: { buildings: ['siege-workshop'] },
    });
    expect(discounted).toBe(base);
  });
  ```

- [ ] **Step 2: Run the focused city-system test to verify it fails**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts`

  Expected: FAIL because Ballista/Trebuchet are not both correctly handled by
  the intended typed-family contract and Cannon currently receives the
  hard-coded Workshop discount.

- [ ] **Step 3: Implement the generic building-family row**

  Remove `SIEGE_UNIT_TYPES`. Rename the mounted-only configuration interface
  and array to describe any building family discount, append:

  ```ts
  { buildingId: 'siege-workshop', productionDiscountFamily: 'classical-siege', multiplier: 0.80 },
  ```

  Resolve the trainable unit's `productionDiscountFamily` once, iterate every
  configured family row, and retain the existing `Math.min` best-discount
  behavior. Update the Siege Workshop description to say: `Siege engine
  fabrication. Reduces Catapult, Ballista, and Trebuchet training cost by 20%
  in this city.` Remove the obsolete `SIEGE_UNIT_TYPES` import and validator
  row from `catalog-id-integrity.test.ts`; the dedicated typed metadata test
  now owns the classical-siege catalog boundary.

- [ ] **Step 4: Run the focused city-system test to verify it passes**

  Run: `bash scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts`

  Expected: PASS; the description, all three classical units, unrelated units,
  and Cannon retain the specified behavior.

### Task 3: Validate the complete change

**Files:**

- Verify: `src/core/types.ts`
- Verify: `src/systems/combat-role-definitions.ts`
- Verify: `src/systems/city-system.ts`
- Verify: `tests/systems/combat-role-definitions.test.ts`
- Verify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Run source-policy validation**

  Run:

  ```bash
  scripts/check-src-rule-violations.sh src/core/types.ts src/systems/combat-role-definitions.ts src/systems/city-system.ts
  ```

  Expected: exit 0 with no rule violations.

- [ ] **Step 2: Run the mirrored regression suite**

  Run:

  ```bash
  bash scripts/run-with-mise.sh yarn test --run tests/systems/combat-role-definitions.test.ts tests/systems/city-system.test.ts
  tests/systems/catalog-id-integrity.test.ts
  ```

  Expected: PASS. These shared catalog and cost tests cover both solo and
  hot-seat civilizations because neither path receives a special resolver.

- [ ] **Step 3: Run the production build**

  Run: `bash scripts/run-with-mise.sh yarn build`

  Expected: exit 0.

- [ ] **Step 4: Review the final change**

  Run:

  ```bash
  git diff --check origin/main...HEAD
  git diff --stat origin/main...HEAD
  git diff origin/main...HEAD -- src/core/types.ts src/systems/combat-role-definitions.ts src/systems/city-system.ts tests/systems/combat-role-definitions.test.ts tests/systems/city-system.test.ts tests/systems/catalog-id-integrity.test.ts
  git status --short
  ```

  Expected: only the #685 metadata, resolver, description, tests, and its
  design/plan documents are present; no unrelated behavior changes.

- [ ] **Step 5: Commit the implementation**

  ```bash
  git add src/core/types.ts src/systems/combat-role-definitions.ts src/systems/city-system.ts tests/systems/combat-role-definitions.test.ts tests/systems/city-system.test.ts tests/systems/catalog-id-integrity.test.ts
  git commit -m "fix(combat): apply Siege Workshop to classical siege family (#685)"
  ```
