# Unit Obsolescence Coverage (#429) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the existing `obsoletedByTech` field to 12 more combat units in `TRAINABLE_UNITS` so obsolete units disappear from production once a later tier arrives, and add a completeness test so this can't silently regress again.

**Architecture:** Pure data change on the existing `TRAINABLE_UNITS` array in `src/systems/city-system.ts` plus a new `TERMINAL_COMBAT_UNITS` allowlist in the same file. No new mechanism — `getTrainableUnitsForCiv` (city-system.ts:1297-1317) already filters on `obsoletedByTech`, `processCity` (city-system.ts:1474) already calls it for queue dequeuing, and `basic-ai.ts:948` already calls it for AI training selection, and `turn-manager.ts:274-296` already emits a non-destructive `unit:obsolete` notification for existing map units. Every wiring point required by `end-to-end-wiring.md`'s "Trainable units must be wired end-to-end" rule already exists for units that have this field set — this plan only adds data.

**Tech Stack:** TypeScript, Vitest.

## Global Constraints
- Only `src/systems/city-system.ts` (data) and `tests/systems/city-system.test.ts` (tests) change. No changes to `tech-definitions.ts`, `turn-manager.ts`, `basic-ai.ts`, or `unit-system.ts` — verify this at the end of the plan.
- Units in scope for this PR: combat units only (`UNIT_DEFINITIONS[type].strength > 0`). Building obsolescence is explicitly out of scope — see the Follow-up task at the end.
- Do not touch `horseman`/`cavalry` without also handling the existing "cavalry dead-end guard" tests at `tests/systems/city-system.test.ts:852-860` — see Task 2.
- Every `obsoletedByTech` value used below is a tech id confirmed to exist in `tech-definitions-eras*.ts` (verified during planning): `rifled-infantry`, `tactics`, `navigation`, `caravels`, `mass-firepower`, `jet-aviation`, `tank-warfare`.
- Run `bash scripts/run-with-mise.sh yarn test` after each task; all tests must pass before moving to the next task.
- Out of scope, found during planning but deliberately not fixed here: the pre-existing `unit:obsolete` handler (`main.ts:3924`) logs a text notification but plays no SFX, unlike its sibling `tech:completed` (`main.ts:3565-3571`, which calls `SFX.research()`). This PR doesn't touch that handler — it's a pre-existing gap, not something this data change introduces, and picking the right stinger/cadence is a separate design decision. Note it for a future pass rather than silently drop it.

---

### Task 1: Chain the 9 non-cavalry units

**Files:**
- Modify: `src/systems/city-system.ts:940-991` (add `obsoletedByTech` to 9 `TRAINABLE_UNITS` entries)
- Test: `tests/systems/city-system.test.ts` (new `describe` block, add near the existing `'S4b — new unit entries'` block around line 861)

**Interfaces:**
- Consumes: `getTrainableUnitsForCiv(completedTechs: string[], civType?: string, availableResources?: Set<ResourceType>): TrainableUnitEntry[]` (already exists, `city-system.ts:1297`) — no changes to this function's signature or body.
- Produces: nothing new consumed by later tasks in this plan; Task 3's completeness test reads the same `TRAINABLE_UNITS` array this task modifies.

- [ ] **Step 1: Write the failing tests**

Add this new `describe` block in `tests/systems/city-system.test.ts`, right after the closing `});` of the `'S4b — new unit entries'` block (currently ends at line 861):

```typescript
describe('#429 — expanded obsolescence coverage', () => {
  const CASES: Array<{
    type: UnitType;
    unlockTech?: string;
    obsoleteTech: string;
    resources?: ResourceType[];
  }> = [
    { type: 'warrior', obsoleteTech: 'rifled-infantry' },
    { type: 'archer', unlockTech: 'archery', obsoleteTech: 'tactics' },
    { type: 'swordsman', unlockTech: 'bronze-working', obsoleteTech: 'rifled-infantry', resources: ['iron'] },
    { type: 'pikeman', unlockTech: 'fortification', obsoleteTech: 'rifled-infantry' },
    { type: 'galley', unlockTech: 'galleys', obsoleteTech: 'navigation' },
    { type: 'trireme', unlockTech: 'triremes', obsoleteTech: 'caravels' },
    { type: 'grenadier', unlockTech: 'grenade-warfare', obsoleteTech: 'mass-firepower' },
    { type: 'rifleman', unlockTech: 'rifled-infantry', obsoleteTech: 'mass-firepower' },
    { type: 'biplane', unlockTech: 'air-superiority', obsoleteTech: 'jet-aviation' },
  ];

  for (const c of CASES) {
    it(`${c.type}: still trainable before ${c.obsoleteTech} completes`, () => {
      const techs = c.unlockTech ? [c.unlockTech] : [];
      const units = getTrainableUnitsForCiv(techs, undefined, new Set<ResourceType>(c.resources ?? []));
      expect(units.some(u => u.type === c.type)).toBe(true);
    });

    it(`${c.type}: no longer trainable once ${c.obsoleteTech} completes`, () => {
      const techs = c.unlockTech ? [c.unlockTech, c.obsoleteTech] : [c.obsoleteTech];
      const units = getTrainableUnitsForCiv(techs, undefined, new Set<ResourceType>(c.resources ?? []));
      expect(units.some(u => u.type === c.type)).toBe(false);
    });
  }
});
```

- [ ] **Step 2: Run tests to verify the "no longer trainable" half fails**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "#429"`
Expected: the 9 "still trainable before" tests PASS (nothing has changed those units' current availability); the 9 "no longer trainable once" tests FAIL, because none of these 9 units has `obsoletedByTech` set yet, so `getTrainableUnitsForCiv` still returns them even after the obsoleting tech completes.

- [ ] **Step 3: Add `obsoletedByTech` to the 9 entries**

In `src/systems/city-system.ts`, modify these 9 lines inside the `TRAINABLE_UNITS` array (each gets one new `obsoletedByTech: '...'` property added to its existing object literal — no other fields change):

```typescript
  { type: 'warrior', name: 'Warrior', cost: 8, obsoletedByTech: 'rifled-infantry', pacing: { band: 'starter', role: 'early-military', impact: 1, scope: 'military', snowball: 1, urgency: 1.2, situationality: 1, unlockBreadth: 1 } },
  { type: 'archer', name: 'Archer', cost: 35, techRequired: 'archery', obsoletedByTech: 'tactics', pacing: { band: 'power-spike', role: 'ranged-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1.05, situationality: 1, unlockBreadth: 1 } },
```
```typescript
  { type: 'swordsman',    name: 'Swordsman',    cost: 50,  techRequired: 'bronze-working',   resourceRequired: ['iron'],   obsoletedByTech: 'rifled-infantry',        pacing: { band: 'power-spike', role: 'melee-breakpoint',       impact: 1.2,  scope: 'military', snowball: 1,   urgency: 1,    situationality: 1,    unlockBreadth: 1 } },
  { type: 'pikeman',      name: 'Pikeman',      cost: 70,  techRequired: 'fortification',    obsoletedByTech: 'rifled-infantry',                                        pacing: { band: 'power-spike', role: 'anti-cavalry-breakpoint', impact: 1.15, scope: 'military', snowball: 1,   urgency: 1,    situationality: 1.05, unlockBreadth: 1 } },
```
```typescript
  { type: 'galley',          name: 'Galley',          cost: 40,  techRequired: 'galleys',            coastalRequired: true, obsoletedByTech: 'navigation' },
```
```typescript
  { type: 'trireme',         name: 'Trireme',         cost: 70,  techRequired: 'triremes',           coastalRequired: true, obsoletedByTech: 'caravels', pacing: { band: 'power-spike', role: 'naval-breakpoint', impact: 1.15, scope: 'military', snowball: 1, urgency: 1, situationality: 1.1, unlockBreadth: 1 } },
```
```typescript
  { type: 'grenadier',    name: 'Grenadier',    cost: 130, techRequired: 'grenade-warfare',  obsoletedByTech: 'mass-firepower',                                                                       pacing: { band: 'power-spike', role: 'anti-fortification',   impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.3,  unlockBreadth: 1 } },
  { type: 'rifleman',     name: 'Rifleman',     cost: 145, techRequired: 'rifled-infantry',  obsoletedByTech: 'mass-firepower',                                                                        pacing: { band: 'power-spike', role: 'ranged-infantry',      impact: 1.3,  scope: 'military', snowball: 1.2, urgency: 1.1,  situationality: 1.2,  unlockBreadth: 1 } },
```
```typescript
  { type: 'biplane',             name: 'Biplane',             cost: 200, techRequired: 'air-superiority', obsoletedByTech: 'jet-aviation', pacing: { band: 'power-spike', role: 'air-strike', impact: 1.5, scope: 'military', snowball: 1.4, urgency: 1.2, situationality: 1.3, unlockBreadth: 1 } },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "#429"`
Expected: all 18 tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): add obsoletedByTech to 9 pre-modern combat units (#429)"
```

---

### Task 2: Cavalry line — obsolete horseman/cavalry/knight together at tank-warfare

**Files:**
- Modify: `src/systems/city-system.ts:958-960` (add `obsoletedByTech: 'tank-warfare'` to `horseman`, `cavalry`, `knight`)
- Modify: `tests/systems/city-system.test.ts:852-860` (replace the two existing "cavalry dead-end guard" tests)
- Test: `tests/systems/city-system.test.ts` (add new tests in the same block)

**Interfaces:**
- Consumes: same `getTrainableUnitsForCiv` as Task 1.
- Produces: nothing new for later tasks.

**Context:** `docs/superpowers/specs/2026-05-24-marketplace-s4b-strategic-prerequisites-design.md:123` documents why `horseman`/`cavalry` originally shipped without `obsoletedByTech`: `knight` (their naive "next tier") requires `resourceRequired: ['horses', 'iron']`, one resource more than `horseman` (`['horses']` only) — obsoleting them at `knight`'s tech (`iron-forging`) would strand an iron-poor civ with zero cavalry options. The user asked for cavalry to obsolete eventually regardless. Resolution: obsolete all three (`horseman`, `cavalry`, `knight`) together at `tank-warfare` (era 9) — `tank` (`techRequired: 'tank-warfare'`) has **no** `resourceRequired` at all, so every civ has an unconditional replacement the moment the whole line retires, and `horseman` stays usable for iron-poor civs all the way to era 9 instead of vanishing at era 3.

- [ ] **Step 1: Replace the existing guard tests and add new ones**

In `tests/systems/city-system.test.ts`, replace lines 852-860 (the two `it('... has no obsoletedByTech (cavalry dead-end guard)', ...)` blocks) with:

```typescript
  it('horseman obsoletes at tank-warfare, not iron-forging (avoids the resource dead-end)', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'horseman');
    expect(entry?.obsoletedByTech).toBe('tank-warfare');
  });

  it('cavalry obsoletes at tank-warfare, not iron-forging (avoids the resource dead-end)', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'cavalry');
    expect(entry?.obsoletedByTech).toBe('tank-warfare');
  });

  it('knight obsoletes at tank-warfare', () => {
    const entry = TRAINABLE_UNITS.find(u => u.type === 'knight');
    expect(entry?.obsoletedByTech).toBe('tank-warfare');
  });

  it('dead-end prevention: iron-poor civ still has tank once tank-warfare completes, even though it never had cavalry or knight', () => {
    const noIron = getTrainableUnitsForCiv(
      ['horseback-riding', 'tank-warfare'],
      undefined,
      new Set<ResourceType>(['horses']),
    );
    expect(noIron.some(u => u.type === 'cavalry')).toBe(false);
    expect(noIron.some(u => u.type === 'knight')).toBe(false);
    expect(noIron.some(u => u.type === 'horseman')).toBe(false);
    expect(noIron.some(u => u.type === 'tank')).toBe(true);
  });

  it('horseman remains trainable for an iron-poor civ all the way up to tank-warfare (no premature dead-end)', () => {
    const midGame = getTrainableUnitsForCiv(
      ['horseback-riding', 'iron-forging'],
      undefined,
      new Set<ResourceType>(['horses']),
    );
    expect(midGame.some(u => u.type === 'horseman')).toBe(true);
  });
```

- [ ] **Step 2: Run tests to verify failures**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "tank-warfare"`
Expected: FAIL — `horseman`/`cavalry`/`knight` don't have `obsoletedByTech` set yet, so the first three tests fail with `expected undefined to be 'tank-warfare'`. The dead-end-prevention and "remains trainable" tests should already PASS (they don't depend on the new field).

- [ ] **Step 3: Add `obsoletedByTech: 'tank-warfare'` to the three entries**

In `src/systems/city-system.ts`, modify:

```typescript
  { type: 'horseman',     name: 'Horseman',     cost: 55,  techRequired: 'horseback-riding', resourceRequired: ['horses'],           obsoletedByTech: 'tank-warfare',                        pacing: { band: 'power-spike', role: 'basic-cavalry',         impact: 1.15, scope: 'military', snowball: 1,   urgency: 1.05, situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'cavalry',      name: 'Cavalry',      cost: 60,  techRequired: 'horseback-riding', resourceRequired: ['horses', 'iron'],   obsoletedByTech: 'tank-warfare',                        pacing: { band: 'power-spike', role: 'heavy-cavalry',         impact: 1.2,  scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
  { type: 'knight',       name: 'Knight',       cost: 80,  techRequired: 'iron-forging',     resourceRequired: ['horses', 'iron'],   obsoletedByTech: 'tank-warfare',                        pacing: { band: 'power-spike', role: 'heavy-cavalry-apex',    impact: 1.25, scope: 'military', snowball: 1.1, urgency: 1,    situationality: 1.1,  unlockBreadth: 1 } },
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "tank-warfare"`
Expected: all 5 tests PASS.

- [ ] **Step 5: Run the full city-system suite to confirm no other test depended on the old "never obsoletes" behavior**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts`
Expected: all tests PASS. If any other test elsewhere asserted horseman/cavalry stay in a trainable list at a very late tech state, it will now fail — investigate and update it to match the new intended behavior rather than reverting this change.

- [ ] **Step 6: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): obsolete horseman/cavalry/knight together at tank-warfare (#429)

Resolves the original 'cavalry dead-end guard' concern (obsoleting at
iron-forging would strand iron-poor civs with zero cavalry options)
by retiring the whole line at tank-warfare instead, whose replacement
(Tank) has no resource requirement."
```

---

### Task 3: TERMINAL_COMBAT_UNITS allowlist + completeness test

**Files:**
- Modify: `src/systems/city-system.ts` (add `TERMINAL_COMBAT_UNITS` export right after the `TRAINABLE_UNITS` array, i.e. after line 992 as it exists after Task 1/2's edits)
- Test: `tests/systems/city-system.test.ts` (new `describe` block)

**Interfaces:**
- Consumes: `TRAINABLE_UNITS` (existing), `UNIT_DEFINITIONS` from `@/systems/unit-system` (existing, already imported in the test file).
- Produces: `export const TERMINAL_COMBAT_UNITS: Partial<Record<UnitType, string>>` — a new export from `city-system.ts` that any future PR extending `TRAINABLE_UNITS` must update if it adds a combat unit with no obsoletion path.

- [ ] **Step 1: Write the failing completeness test**

Add this new `describe` block in `tests/systems/city-system.test.ts`, after the `'#429 — expanded obsolescence coverage'` block added in Task 1:

```typescript
describe('#429 — unit obsolescence completeness', () => {
  const UTILITY_TYPES: UnitType[] = ['worker', 'settler', 'troop_transport', 'caravan', 'expedition'];

  it('every combat-capable trainable unit has obsoletedByTech or a TERMINAL_COMBAT_UNITS entry', () => {
    const missing: string[] = [];
    for (const entry of TRAINABLE_UNITS) {
      if (UTILITY_TYPES.includes(entry.type)) continue;
      const strength = UNIT_DEFINITIONS[entry.type]?.strength ?? 0;
      if (strength <= 0) continue;
      if (entry.obsoletedByTech) continue;
      if (TERMINAL_COMBAT_UNITS[entry.type]) continue;
      missing.push(entry.type);
    }
    expect(missing, `combat units missing an obsolescence decision: ${missing.join(', ')}`).toEqual([]);
  });

  it('every TERMINAL_COMBAT_UNITS entry has a non-empty reason', () => {
    for (const [type, reason] of Object.entries(TERMINAL_COMBAT_UNITS)) {
      expect(reason.length, `${type} needs a real reason, not an empty string`).toBeGreaterThan(0);
    }
  });

  it('TERMINAL_COMBAT_UNITS does not list a unit that already has obsoletedByTech (no contradictory entries)', () => {
    for (const type of Object.keys(TERMINAL_COMBAT_UNITS)) {
      const entry = TRAINABLE_UNITS.find(u => u.type === type);
      expect(entry?.obsoletedByTech, `${type} is in TERMINAL_COMBAT_UNITS but also has obsoletedByTech set`).toBeUndefined();
    }
  });
});
```

Also add `TERMINAL_COMBAT_UNITS` to the existing import block at the top of the test file. The current import (lines 1-18) reads:

```typescript
import {
  foundCity,
  getAvailableBuildings,
  getTrainableUnitsForCity,
  isCityCoastal,
  getTrainableUnitsForCiv,
  getProductionCostForItem,
  processCity,
  completeCityProductionItem,
  BUILDINGS,
  CITY_NAMES,
  TRAINABLE_UNITS,
  PRODUCTION_ICONS,
  getCatalogProductionCost,
  getProductionDisplayName,
  getProductionIconForItem,
  getSettlerProductionCost,
} from '@/systems/city-system';
```

Add `TERMINAL_COMBAT_UNITS,` as a new line directly after `PRODUCTION_ICONS,`.

- [ ] **Step 2: Run tests to verify the first test fails**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "unit obsolescence completeness"`
Expected: FAIL on the first test — `TERMINAL_COMBAT_UNITS` doesn't exist yet (TypeScript compile error / import failure), and even once it exists as an empty object, 12 units (`tank`, `submarine`, `jet_fighter`, `carrier`, `attack_helicopter`, `missile_submarine`, `scout`, `observation_balloon`, `spy_hacker`, `scout_hound`, `shadow_warden`, `war_hound`) will be reported missing.

- [ ] **Step 3: Add the allowlist**

In `src/systems/city-system.ts`, immediately after the closing `];` of the `TRAINABLE_UNITS` array, add:

```typescript
/**
 * Combat-capable units (UNIT_DEFINITIONS[type].strength > 0) intentionally left without
 * obsoletedByTech, with a reason each. Enforced by the completeness test in
 * tests/systems/city-system.test.ts — a new combat unit added to TRAINABLE_UNITS without
 * either obsoletedByTech or an entry here will fail that test.
 */
export const TERMINAL_COMBAT_UNITS: Partial<Record<UnitType, string>> = {
  tank: 'current top-tier armor, no later replacement in the roster yet',
  submarine: 'current top-tier submarine, no later replacement in the roster yet',
  jet_fighter: 'current air-combat apex, no later replacement in the roster yet',
  carrier: 'current top-tier naval projection, no later replacement in the roster yet',
  attack_helicopter: 'era 11, newest air-assault unit, no later replacement yet',
  missile_submarine: 'era 11, newest naval-deterrent unit, no later replacement yet',
  scout: 'recon unit, strength is a self-defense stat not its primary role, no replacement chain',
  observation_balloon: 'recon unit (air-recon role), strength is a self-defense stat, no replacement chain',
  spy_hacker: 'terminal tier of the espionage chain (spy_operative already obsoletes into this at cyber-warfare), no further replacement yet',
  scout_hound: 'recon/detection unit, strength is a self-defense stat, no replacement chain',
  shadow_warden: 'civ-specific (Persia) recon/detection replacement for scout_hound, same reasoning',
  war_hound: 'civ-specific (Rome) recon/detection replacement for scout_hound, same reasoning',
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "unit obsolescence completeness"`
Expected: all 3 tests PASS.

- [ ] **Step 5: Run the full test file once more**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts`
Expected: all tests PASS (this is the full regression check for everything touched in Tasks 1-3).

- [ ] **Step 6: Commit**

```bash
git add src/systems/city-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): add TERMINAL_COMBAT_UNITS allowlist + completeness test (#429)

Closes the gap class this issue reports: a future combat unit added
to TRAINABLE_UNITS without an obsolescence decision now fails CI
instead of silently sitting in production queues forever."
```

---

### Task 4: Prove the existing dequeue and AI-selection plumbing picks up the new data

**Files:**
- Test: `tests/systems/city-system.test.ts` (add to the existing `describe('processCity — resource dequeue', ...)` block, and a new small block for the AI-selection-pool check)

**Interfaces:**
- Consumes: `processCity` (existing, `city-system.ts:1474`), `getTrainableUnitsForCiv` (existing).
- Produces: nothing new — this task is regression coverage only, proving `end-to-end-wiring.md`'s "Tech-gated dequeue" rule already holds for the units this PR just chained, with no code changes to `processCity` or `basic-ai.ts` required.

- [ ] **Step 1: Write the failing test for queue dequeue**

Inside the existing `describe('processCity — resource dequeue', ...)` block in `tests/systems/city-system.test.ts` (it already has `mkMap2`/`mkBaseCity2`/`mkC` helpers in scope — reuse them, do not redefine), add:

```typescript
  it('#429 regression: dequeues a queued warrior once rifled-infantry completes', () => {
    // productionProgress + productionYield (0 + 3 = 3) stays well under warrior's
    // production cost (8), so removal from the queue can only be the obsoletedByTech
    // dequeue path, not the unit completing production this turn.
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['warrior'], productionProgress: 0 };
    const result = processCity(city, map, 2, 3, undefined, ['rifled-infantry'], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).not.toContain('warrior');
    expect(result.city.productionProgress).toBe(0);
  });

  it('#429 regression: keeps a queued warrior when rifled-infantry has not been researched', () => {
    const map = mkMap2();
    const city: City = { ...mkBaseCity2(map), productionQueue: ['warrior'], productionProgress: 0 };
    const result = processCity(city, map, 2, 3, undefined, [], undefined, 1, new Set<ResourceType>());
    expect(result.city.productionQueue).toContain('warrior');
  });
```

**Note (caught during implementation):** the original version of this step used `productionProgress: 5`, which combined with `productionYield: 3` reaches exactly `warrior`'s production cost (8) in one turn — the "dequeues" test passed, but for the wrong reason (the unit completing production, not the obsoletedByTech dequeue path), and this was only caught because the sibling "keeps queued" test failed unexpectedly. Fixed to `productionProgress: 0` so progress (3) stays well under the cost and any removal is unambiguously the dequeue path.

This depends on Task 1 already being complete (warrior needs `obsoletedByTech: 'rifled-infantry'` set) — if run before Task 1, the first test fails because nothing dequeues warrior.

- [ ] **Step 2: Run to verify current state**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "#429 regression"`
Expected: both PASS immediately, since Task 1 already added `obsoletedByTech: 'rifled-infantry'` to `warrior` and `processCity` already calls `getTrainableUnitsForCiv` internally (city-system.ts:1513) with no changes needed. This step is a **verification that the existing plumbing needs no new code**, not a red-green cycle — confirm it passes on the first run, since that is the expected (and desired) outcome here.

- [ ] **Step 3: Add the AI-selection-pool regression**

Add a new `describe` block:

```typescript
describe('#429 regression: AI training selection respects new obsolescence data', () => {
  it('warrior drops out of the AI-visible trainable pool once rifled-infantry completes (same getTrainableUnitsForCiv call basic-ai.ts:948 uses)', () => {
    const before = getTrainableUnitsForCiv([], 'rome', new Set<ResourceType>());
    const after = getTrainableUnitsForCiv(['rifled-infantry'], 'rome', new Set<ResourceType>());
    expect(before.some(u => u.type === 'warrior')).toBe(true);
    expect(after.some(u => u.type === 'warrior')).toBe(false);
  });
});
```

- [ ] **Step 4: Run to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test -- city-system.test.ts -t "AI training selection"`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: all tests PASS project-wide (not just this file) — this confirms nothing else in the codebase depended on the old horseman/cavalry-never-obsoletes behavior or on any of the other 9 units remaining permanently trainable.

- [ ] **Step 6: Run the build**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: exits 0 — this is the only command that runs `tsc`, and it must pass before any push per `hooks-and-tooling.md`.

- [ ] **Step 7: Commit**

```bash
git add tests/systems/city-system.test.ts
git commit -m "test(city): regression coverage proving dequeue + AI selection already respect new obsolescence data (#429)"
```

---

### Task 5: File the building-obsolescence follow-up issue

**Files:** none (GitHub issue only, no code)

**Interfaces:** none.

- [ ] **Step 1: Create the follow-up issue**

Run:
```bash
gh issue create --repo a1flecke/conquestoria \
  --title "Building obsolescence (follow-up to #429)" \
  --body "$(cat <<'EOF'
## Context
#429 added obsoletedByTech coverage for combat units in TRAINABLE_UNITS. The original issue also asked about building obsolescence (e.g. Stable feels obsolete once cavalry lines fully retire; Granary/Market should probably never obsolete) — that half was explicitly deferred to keep #429 reviewable.

## Scope
- Design a `Building` equivalent to `obsoletedByTech` (likely `obsoletedByTech?: string` on `Building`, mirroring the unit field).
- Needs a criteria discussion before implementation: which buildings should ever obsolete vs. remain permanently useful (Granary/Market: never; Stable: plausibly once the cavalry line fully retires at tank-warfare, per #429's resolution).
- Extend `getAvailableBuildings` (city-system.ts) to filter on it, mirroring `getTrainableUnitsForCiv`.
- Add a completeness test mirroring #429's TERMINAL_COMBAT_UNITS/completeness-test pattern.

## Related
- #429 (unit obsolescence — merged)
EOF
)"
```
Expected: prints the new issue URL.

- [ ] **Step 2: No commit needed — this step only creates a GitHub issue.**

---

## Final verification checklist (run after all tasks complete)

- [x] `git diff origin/main --stat` shows only `src/systems/city-system.ts`, `tests/systems/city-system.test.ts`, and this plan doc changed.
- [x] `bash scripts/run-with-mise.sh yarn build` exits 0.
- [x] `bash scripts/run-with-mise.sh yarn test` exits 0 (4722 passed, up from a 4695 baseline — the 27 tests this plan added).
- [x] 30 `TRAINABLE_UNITS` entries now carry `obsoletedByTech` (18 that already existed + 12 added by this plan); `grep -c "obsoletedByTech" src/systems/city-system.ts` reports 33 because it also matches 2 JSDoc comment lines and 1 code line in the existing filter check — grep counts lines, not occurrences, so verify with the data-line count above, not the raw grep number.
- [x] Follow-up issue filed: https://github.com/a1flecke/conquestoria/issues/443
