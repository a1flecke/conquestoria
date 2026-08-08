# Issue 688 Tank Depot Armored Family Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give Tank Depot a city-local 10% armored production discount and +5 armored city healing without changing unit legality, saves, or viewer privacy.

**Architecture:** Replace the single `productionDiscountFamily` with a typed `localInfrastructureFamilies` list, migrating every existing family assignment so no Stable/Cavalry Academy/Siege Workshop effect regresses. Armored Car then belongs to both mounted-light-support and armored; Tank Depot's cost multiplier and healing bonus are centralized in typed local-infrastructure data. Production cost and turn-time healing consume that data; no unit or building ID branch is allowed in either evaluator.

**Tech Stack:** TypeScript and Vitest.

---

## File map

- `src/core/types.ts` — local-infrastructure family type/list and healing-context input.
- `src/systems/combat-role-definitions.ts` — four armored recipients.
- `src/systems/city-system.ts` — typed Tank Depot data, production lookup, plain-language description.
- `src/systems/unit-modifier-system.ts` — canonical local-city healing input.
- `src/core/turn-manager.ts` — derive city-local qualification for every owner.
- Tests: `combat-role-definitions`, `city-system`, `unit-modifier-system`, `turn-manager`, `ai-production`, and, only if needed, `save-migrations`.

No new button, queue, panel, filter, animation, notification, or SFX is introduced. The existing Tank Depot description must state both numeric benefits before a player selects it.

### Task 1: Establish typed membership and truthful description

**Files:** `src/core/types.ts:978-980`, `src/systems/combat-role-definitions.ts`, `src/systems/city-system.ts:680-688`; tests `tests/systems/combat-role-definitions.test.ts:42-62`, `tests/systems/city-system.test.ts:1817-1895`.

- [ ] Write RED tests:

```ts
for (const type of ['armored_car', 'tank', 'mechanized_infantry', 'main_battle_tank'] as const) {
  expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies).toContain('armored');
}
expect(getUnitRoleDefinition('armored_car')?.localInfrastructureFamilies)
  .toEqual(expect.arrayContaining(['mounted-light-support', 'armored']));
for (const type of ['anti_tank_gun', 'mobile_aa'] as const) {
  expect(getUnitRoleDefinition(type)?.localInfrastructureFamilies).not.toContain('armored');
}
expect(BUILDINGS.tank_depot.description).toContain('10%');
expect(BUILDINGS.tank_depot.description).toContain('+5');
```

- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/combat-role-definitions.test.ts tests/systems/city-system.test.ts`; confirm RED.
- [ ] Add a typed `LocalInfrastructureFamily` union and `localInfrastructureFamilies` list. Migrate every current one-family role definition to the equivalent list; give Armored Car both `mounted-light-support` and `armored`, and the other three recipients only `armored`. Revise Tank Depot description in plain language. Add typed configuration `{ buildingId: 'tank_depot', family: 'armored', productionMultiplier: 0.90, cityHealingBonus: 5 }` alongside existing local-infrastructure definitions.
- [ ] Re-run the same command; confirm GREEN.
- [ ] Commit: `git add src/core/types.ts src/systems/combat-role-definitions.ts src/systems/city-system.ts tests/systems/combat-role-definitions.test.ts tests/systems/city-system.test.ts && git commit -m "feat(688): define Tank Depot armored family"`.

### Task 2: Route the production discount through the canonical cost path

**Files:** `src/systems/city-system.ts:1275-1312`; tests `tests/systems/city-system.test.ts`, `tests/ai/ai-production.test.ts:125-145`.

- [ ] Write RED tests:

```ts
it.each(['armored_car', 'tank', 'mechanized_infantry', 'main_battle_tank'] as const)(
  'Tank Depot discounts %s', type => {
    const base = getProductionCostForItem(type, { city: { buildings: [] } });
    expect(getProductionCostForItem(type, { city: { buildings: ['tank_depot'] } }))
      .toBe(Math.ceil(base * 0.90));
  },
);
it.each(['anti_tank_gun', 'mobile_aa'] as const)('Tank Depot excludes %s', type => {
  expect(getProductionCostForItem(type, { city: { buildings: ['tank_depot'] } }))
    .toBe(getProductionCostForItem(type, { city: { buildings: [] } }));
});
```

- [ ] Add the matching AI candidate ETA test modeled on the Cavalry Academy test: a Tank Depot city has fewer Tank production turns than the same city without it.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/city-system.test.ts tests/ai/ai-production.test.ts`; confirm RED.
- [ ] Make `getBuildingDiscountMultiplier` select the strongest matching typed local-infrastructure production multiplier from every member of a unit's `localInfrastructureFamilies` list. Add a regression that Armored Car still receives its Stable discount as well as its Tank Depot discount without multiplying the two local building discounts. Do not alter eligibility, tech/resource checks, or AI scoring; AI must retain its existing `getProductionCostForItem` call.
- [ ] Re-run the command; confirm GREEN. Commit with `feat(688): apply Tank Depot armored production discount`.

### Task 3: Route city healing through canonical turn processing

**Files:** `src/systems/unit-modifier-system.ts:190-238`, `src/core/turn-manager.ts:588-620`; tests `tests/systems/unit-modifier-system.test.ts:507-575`, `tests/core/turn-manager.test.ts`.

- [ ] Write RED canonical-healing tests:

```ts
expect(getHealingBonus({ ...baseHealCtx(), inFriendlyCity: true, localCityHealingBonus: 5 }).flat).toBe(5);
expect(getHealingBonus({ ...baseHealCtx(), inFriendlyCity: false, localCityHealingBonus: 5 }).flat).toBe(0);
```

- [ ] Add a `processTurn` fixture with a Tank Depot city containing damaged Tank and Anti-Tank Gun units, plus a damaged Tank in another friendly city. Assert only the eligible Tank at the depot gets +5. Repeat for an AI-owned city and two human owners to prove shared-path and hot-seat isolation.
- [ ] Run `./scripts/run-with-mise.sh yarn test --run tests/systems/unit-modifier-system.test.ts tests/core/turn-manager.test.ts`; confirm RED.
- [ ] Add optional `localCityHealingBonus` to `HealingModifierContext`; `getHealingBonus` adds it only in a friendly city. In `processTurn`, resolve the unit's own friendly city, its buildings, and its family, then derive the bonus from the same typed configuration. Emit no event, toast, log, or SFX.
- [ ] Re-run the command; confirm GREEN. Commit with `feat(688): heal armored units at Tank Depots`.

### Task 4: Prove save stability and complete verification

- [ ] Inspect `tests/storage/save-migrations.test.ts`. Only if it lacks a Tank Depot city, add a JSON round-trip fixture proving `buildings: ['tank_depot']` remains unchanged. Do not bump the schema or add a migration: modifier metadata is static.
- [ ] Run:

```bash
scripts/check-src-rule-violations.sh src/core/types.ts src/systems/combat-role-definitions.ts src/systems/city-system.ts src/systems/unit-modifier-system.ts src/core/turn-manager.ts
./scripts/run-with-mise.sh yarn test --run tests/systems/combat-role-definitions.test.ts tests/systems/city-system.test.ts tests/systems/unit-modifier-system.test.ts tests/core/turn-manager.test.ts tests/ai/ai-production.test.ts tests/storage/save-migrations.test.ts
./scripts/run-with-mise.sh yarn build
```

- [ ] Confirm all commands pass. Inspect `git diff --check origin/main...HEAD`, `git diff --stat origin/main...HEAD`, and the full diff. Commit a save test only if one was added.

## Self-review

The tasks cover balance bounds, casual/expert-readable UI copy, every difficulty mode's shared rules, AI cost use, passive-SFX restraint, serializable saves, solo/AI/hot-seat parity, exclusions, and TypeScript/source-rule verification. No interactive UI guardrail applies because the delivery adds no action or derived UI surface.
