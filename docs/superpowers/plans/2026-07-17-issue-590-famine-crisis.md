# Famine Crisis Archetype + Epidemic-Control Halving Implementation Plan

> **For agentic workers:** Execute inline in this session (project policy forbids subagents). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `famine` crisis archetype (re-homing crop-blight/locust-swarm from outbreak, adding failed-harvest/great-famine), make `epidemic-control` actually halve famine population loss, and audit every archetype-conditional branch in the crisis systems so famine gets an explicit, deliberate behavior everywhere outbreak/catastrophe are special-cased.

**Architecture:** Famine gets its own tick function (`tickFamineCrisis`) that shares outbreak's spread/quarantine/remedy/pop-loss shape but adds a food-surplus-driven passive auto-contain path. The crisis-yield seam (`getCrisisYieldMultiplier`) is generalized from a single scalar to a per-yield-type object so famine can penalize food only while outbreak/catastrophe keep penalizing all four yields.

**Tech Stack:** TypeScript, vitest. No new deps.

## Global Constraints (from issue #590 + user decisions this session)

- `CrisisArchetype` gains `'famine'`; tech text for `epidemic-control` ("City population loss from famine halved") must become true, scoped to famine only.
- Decision 1 (user): generalize `getCrisisYieldMultiplier` to return `{ food, production, gold, science }` rather than adding a parallel food-only function.
- Decision 2 (user): "containment accelerates while food surplus > 0" is a **new passive auto-contain path**, independent of remedy/quarantine (both remain available as player-driven alternatives).
- Saves: additive enum + flavors ⇒ no migration required, but add defensive `archetype` normalization from `flavorId` in `migrateSaveToCurrent`.
- Every `crisis.archetype === '...'` branch found in the audit below must get an explicit famine decision — no silent inheritance.
- Tech text for `epidemic-control` is UNCHANGED (it becomes honest, not rewritten).

---

## Branch audit (verified against current `main`, 2026-07-17)

| Location | Current behavior | Famine decision |
|---|---|---|
| `crisis-system.ts:143` `getCrisisYieldMultiplier` | outbreak/catastrophe multiply all 4 yields uniformly | Generalize return type; famine multiplies `food` only, reusing `getOutbreakSeverityMultiplier`'s formula |
| `crisis-system.ts:601` `tickCrisisByArchetype` switch | `outbreak`/`catastrophe`/`hunt` cases, `default` no-ops | Add `case 'famine': return tickFamineCrisis(...)` |
| `crisis-system.ts:216-224` pop-loss branch (inside `tickOutbreakCrisis`) | Fixed interval, no tech check | New `tickFamineCrisis` duplicates this but halves the interval when target civ has `epidemic-control` |
| `ai-crisis-response.ts:127` `getCrisisResponseActions` crisis filter | `c.archetype === 'outbreak'` only | Widen to `(c.archetype === 'outbreak' || c.archetype === 'famine')` so AI quarantines/funds remedy for famine too |
| `crisis-interaction-definitions.ts:35` `send_aid` techRequired map | `{ outbreak: 'medicine', catastrophe: 'trade-routes' }`, no famine entry ⇒ **permanently unsatisfiable** for famine (per the file's own comment) | Add `famine: 'medicine'` — same tech, same behavior as outbreak, per "send-aid applies unchanged" |
| `crisis-interaction-system.ts:108` `applySendAid` catastrophe branch | credits gold to target civ | Famine: not this branch (famine isn't catastrophe-shaped) |
| `crisis-interaction-system.ts:124` `applySendAid` outbreak branch | writes `remedyCompletionByCity` | Widen to `(crisis.archetype === 'outbreak' || crisis.archetype === 'famine')` |
| `espionage-system.ts:744` `sabotage_relief` mission eligibility | hardcoded `getActiveCrisisForCiv(gameState, targetCivId, 'outbreak')` | **Explicit exclusion**: famine is NOT in scope for sabotage_relief in this MR (not in the issue's locked interfaces) — no code change, documented here so it reads as a decision, not an oversight |
| `city-panel.ts:318` crisis chip filter | `c.archetype === 'outbreak'` | New parallel `famineChips` block (own filter, own "−X% food" wording, own auto-contain progress line) — reuses the existing `data-quarantine-crisis`/`data-remedy-crisis` button wiring since those click handlers are already archetype-agnostic |

---

## Task 1: Types + save-migration normalization

**Files:**
- Modify: `src/core/types.ts:1867` (`CrisisArchetype`), `ActiveCrisis` interface (add `famineSurplusStreakByCity`)
- Modify: `src/storage/save-migrations.ts` (`migrateSaveToCurrent`)
- Test: `tests/storage/save-migrations.test.ts`

**Interfaces:**
- Produces: `CrisisArchetype = 'outbreak' | 'catastrophe' | 'hunt' | 'famine'`; `ActiveCrisis.famineSurplusStreakByCity?: Record<string, number>`

- [ ] **Step 1: Write the failing migration test**

```ts
// tests/storage/save-migrations.test.ts (new describe block)
describe('#590 MR3 — defensive crisis archetype normalization', () => {
  it('recomputes a stored crisis archetype from its flavorId', () => {
    const raw = {
      schemaVersion: CURRENT_SCHEMA_VERSION, // use whatever constant the file already exports/imports
      // ...minimal valid save shape the file's other tests already use as a base...
      activeCrises: {
        'crisis-1': {
          id: 'crisis-1', flavorId: 'crop-blight', archetype: 'outbreak', // stale: pre-#590 save
          targetCivId: 'p1', cityIds: ['c1'], tileKeys: [], startedTurn: 1, stage: 'active', turnsInStage: 1,
        },
      },
    };
    const migrated = migrateSaveToCurrent(raw);
    expect(migrated.activeCrises!['crisis-1'].archetype).toBe('famine');
  });
});
```

Before writing this, read `tests/storage/save-migrations.test.ts`'s existing base-fixture helper (there is one — every test in that file builds from a minimal valid save object) and use the SAME helper/base object rather than inventing a new one, so the test doesn't fail on unrelated missing fields.

- [ ] **Step 2: Run test to verify it fails**

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts`
Expected: FAIL — archetype stays `'outbreak'`.

- [ ] **Step 3: Add `'famine'` to `CrisisArchetype` and `famineSurplusStreakByCity` to `ActiveCrisis`**

```ts
// src/core/types.ts — replace the existing line
export type CrisisArchetype = 'outbreak' | 'catastrophe' | 'hunt' | 'famine';
```

```ts
// src/core/types.ts — inside `ActiveCrisis`, alongside remedyCompletionByCity
  famineSurplusStreakByCity?: Record<string, number>; // #590: consecutive turns of positive food surplus per city, toward passive auto-contain
```

- [ ] **Step 4: Add the defensive normalization to `migrateSaveToCurrent`**

Read `src/storage/save-migrations.ts` in full first — it's 283 lines, ends with a `return` of the fully-migrated `GameState`. Add the normalization as one of the last steps, right before that final return, using the same object-spread style as neighboring normalizations in that function:

```ts
  // #590 MR3: defensive re-derivation of stored crisis archetype from its flavorId.
  // Purely additive at the type level (famine is a new archetype value; no prior save
  // could have written it), but a save from before crop-blight/locust-swarm's re-home
  // would have `archetype: 'outbreak'` baked in for those two flavor ids — recompute
  // from the current flavor roster so an old save's outbreak-only code paths (remedy
  // wording, AI response filter) don't silently misfire on a now-famine flavor.
  if (migrated.activeCrises) {
    const fixedCrises: Record<string, ActiveCrisis> = {};
    for (const [id, crisis] of Object.entries(migrated.activeCrises)) {
      const flavor = getCrisisFlavor(crisis.flavorId);
      fixedCrises[id] = flavor ? { ...crisis, archetype: flavor.archetype } : crisis;
    }
    migrated = { ...migrated, activeCrises: fixedCrises };
  }
```

This requires importing `getCrisisFlavor` from `@/systems/crisis-flavor-definitions` at the top of `save-migrations.ts`. Confirm the local variable holding the in-progress result is actually named `migrated` (read the function first — if it uses a different name, e.g. `result` or `next`, match that name instead of introducing a new one).

- [ ] **Step 5: Run test to verify it passes**

Run: `bash scripts/run-with-mise.sh yarn test tests/storage/save-migrations.test.ts`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/types.ts src/storage/save-migrations.ts tests/storage/save-migrations.test.ts
git commit -m "feat(crisis): add famine archetype + defensive migration normalization (#590 MR3)"
```

---

## Task 2: Re-home crop-blight/locust-swarm, add failed-harvest + great-famine

**Files:**
- Modify: `src/systems/crisis-flavor-definitions.ts`
- Test: `tests/systems/crisis-flavor-definitions.test.ts`

**Interfaces:**
- Consumes: `CrisisArchetype` (Task 1), existing `countFarmsInTerritory`, `isPlainsOrGrasslandCity`, `nearTerrain` helpers already in this file.
- Produces: flavor ids `'failed-harvest'`, `'great-famine'`; `crop-blight`/`locust-swarm` now have `archetype: 'famine'`.

- [ ] **Step 1: Write failing tests**

```ts
// tests/systems/crisis-flavor-definitions.test.ts — add to existing describe or new one
describe('#590 MR3 — famine archetype', () => {
  it('re-homes crop-blight and locust-swarm to famine', () => {
    expect(getCrisisFlavor('crop-blight')!.archetype).toBe('famine');
    expect(getCrisisFlavor('locust-swarm')!.archetype).toBe('famine');
  });

  it('adds failed-harvest and great-famine as famine flavors', () => {
    expect(getCrisisFlavor('failed-harvest')!.archetype).toBe('famine');
    expect(getCrisisFlavor('great-famine')!.archetype).toBe('famine');
  });

  it('keeps red-tide and plague on outbreak (poisoning/disease theme unchanged)', () => {
    expect(getCrisisFlavor('red-tide')!.archetype).toBe('outbreak');
    expect(getCrisisFlavor('plague')!.archetype).toBe('outbreak');
  });

  it('great-famine is a later-era, more severe flavor than failed-harvest', () => {
    const mild = getCrisisFlavor('failed-harvest')!;
    const severe = getCrisisFlavor('great-famine')!;
    expect(severe.eraBand[0]).toBeGreaterThan(mild.eraBand[0]);
    expect(severe.severityByChallenge.standard.yieldPenalty).toBeGreaterThan(mild.severityByChallenge.standard.yieldPenalty);
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-flavor-definitions.test.ts`
Expected: FAIL (crop-blight/locust-swarm still `'outbreak'`; failed-harvest/great-famine don't exist).

- [ ] **Step 3: Re-home crop-blight and locust-swarm**

In `src/systems/crisis-flavor-definitions.ts`, change only the `archetype` field on the two existing entries:

```ts
  {
    id: 'crop-blight',
    archetype: 'famine', // #590 MR3: re-homed from outbreak — famine, not disease
    // ...rest of the entry (eraBand, geographyPredicate, spreadBoostPredicate,
    // severityByChallenge, displayNamesByEra, advisorLine, responseActions) UNCHANGED...
```

```ts
  {
    id: 'locust-swarm',
    archetype: 'famine', // #590 MR3: re-homed from outbreak — famine, not disease
    // ...rest UNCHANGED...
```

- [ ] **Step 4: Add the two new flavors**

Append after the `locust-swarm` entry (before `red-tide`, so the file keeps outbreak/famine flavors grouped):

```ts
  {
    id: 'failed-harvest',
    archetype: 'famine',
    // Mild, era-agnostic: any city can have a bad growing season, no terrain gate.
    // Grace-period floor is era 2 (see crop-blight's comment above) — same convention.
    eraBand: [2, 12],
    geographyPredicate: () => true,
    severityByChallenge: {
      explorer: { yieldPenalty: 0.10, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.15, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: 4,    autoExpireTurns: null },
    },
    displayNamesByEra: { 2: 'A Thin Harvest', 5: 'The Lean Season', 8: 'The Failed Crop' },
    advisorLine: '{name} has left the granaries near {city} half-empty! Quarantine the city to stop the spread, or import grain to speed recovery.',
    responseActions: ['quarantine', 'remedy'],
  },
  {
    id: 'great-famine',
    archetype: 'famine',
    // Severe, later-era escalation of the same farmland geography crop-blight uses —
    // deliberately not a new geography concept, just a worse version for later eras.
    eraBand: [6, 12],
    geographyPredicate: (state, city) =>
      countFarmsInTerritory(state, city) >= 2 || isPlainsOrGrasslandCity(state, city),
    spreadBoostPredicate: (state, city) => nearTerrain(state, city, ['plains'], 2),
    severityByChallenge: {
      explorer: { yieldPenalty: 0.20, popLossEveryNTurnsIgnored: null, autoExpireTurns: 5 },
      standard: { yieldPenalty: 0.30, popLossEveryNTurnsIgnored: null, autoExpireTurns: null },
      veteran:  { yieldPenalty: 0.40, popLossEveryNTurnsIgnored: 2,    autoExpireTurns: null },
    },
    displayNamesByEra: { 6: 'The Great Famine', 9: 'The Starving Time' },
    advisorLine: '{name} devastates the countryside near {city}! Quarantine the city to stop the spread, or import grain to speed recovery.',
    responseActions: ['quarantine', 'remedy'],
  },
```

- [ ] **Step 5: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-flavor-definitions.test.ts`
Expected: PASS

- [ ] **Step 6: Run the wonder/description-honesty style generic suites that scan all flavors**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-flavor-definitions.test.ts tests/systems/crisis-system.test.ts`
Expected: any pre-existing generic "every flavor has X" test still passes for the 2 new flavors. If one fails (e.g. a display-name-collision-style check), fix the new flavors' data, not the test.

- [ ] **Step 7: Commit**

```bash
git add src/systems/crisis-flavor-definitions.ts tests/systems/crisis-flavor-definitions.test.ts
git commit -m "feat(crisis): re-home crop-blight/locust-swarm to famine, add failed-harvest + great-famine (#590 MR3)"
```

---

## Task 3: Generalize `getCrisisYieldMultiplier` to per-yield-type

**Files:**
- Modify: `src/systems/crisis-system.ts:143-157`
- Modify: `src/core/turn-manager.ts:241-253`
- Modify: `src/ui/city-panel.ts:147-164`
- Modify (assertions only): `tests/systems/crisis-outbreak.test.ts`, `tests/systems/crisis-catastrophe.test.ts`, `tests/systems/crisis-system.test.ts`

**Interfaces:**
- Produces: `getCrisisYieldMultiplier(state, cityId): { food: number; production: number; gold: number; science: number }` (was `number`).

- [ ] **Step 1: Update the three existing tests to the new shape FIRST (TDD: these should fail against current code)**

`tests/systems/crisis-outbreak.test.ts` — replace:
```ts
  it('applies yield multiplier: afflicted, quarantined, unaffected', () => {
    const { state } = withCrisis();
    expect(getCrisisYieldMultiplier(state, 'c1')).toBeCloseTo(0.75); // standard yieldPenalty 0.25
    expect(getCrisisYieldMultiplier(state, 'c2')).toBe(1);

    const { state: quarantined } = withCrisis({ quarantinedCityIds: ['c1'] });
    expect(getCrisisYieldMultiplier(quarantined, 'c1')).toBeCloseTo(0.5); // 1 - 2*0.25
  });
```
with:
```ts
  it('applies yield multiplier to all four yields uniformly: afflicted, quarantined, unaffected', () => {
    const { state } = withCrisis();
    const afflicted = getCrisisYieldMultiplier(state, 'c1');
    expect(afflicted.food).toBeCloseTo(0.75); // standard yieldPenalty 0.25
    expect(afflicted.production).toBeCloseTo(0.75);
    expect(afflicted.gold).toBeCloseTo(0.75);
    expect(afflicted.science).toBeCloseTo(0.75);
    expect(getCrisisYieldMultiplier(state, 'c2').food).toBe(1);

    const { state: quarantined } = withCrisis({ quarantinedCityIds: ['c1'] });
    expect(getCrisisYieldMultiplier(quarantined, 'c1').food).toBeCloseTo(0.5); // 1 - 2*0.25
  });
```

`tests/systems/crisis-catastrophe.test.ts` — replace:
```ts
    expect(getCrisisYieldMultiplier(state, cityId)).toBe(1);
```
with:
```ts
    expect(getCrisisYieldMultiplier(state, cityId).food).toBe(1);
```
and replace:
```ts
    expect(getCrisisYieldMultiplier(next, cityId)).toBeCloseTo(0.8);
```
with:
```ts
    expect(getCrisisYieldMultiplier(next, cityId).food).toBeCloseTo(0.8);
    expect(getCrisisYieldMultiplier(next, cityId).production).toBeCloseTo(0.8);
```

`tests/systems/crisis-system.test.ts` — replace:
```ts
    expect(getCrisisYieldMultiplier(state, 'ai-city')).toBeCloseTo(std);
```
with:
```ts
    expect(getCrisisYieldMultiplier(state, 'ai-city').food).toBeCloseTo(std);
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-outbreak.test.ts tests/systems/crisis-catastrophe.test.ts tests/systems/crisis-system.test.ts`
Expected: FAIL with type errors / `.food` being read off a `number` (TS will actually fail to compile at `yarn build` time too, but vitest's esbuild transform is permissive — you should still see runtime failures like "Cannot read properties of undefined").

- [ ] **Step 3: Generalize `getCrisisYieldMultiplier` in `crisis-system.ts`**

Replace lines 143-157:
```ts
export function getCrisisYieldMultiplier(state: GameState, cityId: string): number {
  let multiplier = 1;
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (!crisis.cityIds.includes(cityId)) continue;
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) continue;
    const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];
    if (crisis.archetype === 'outbreak') {
      multiplier *= getOutbreakSeverityMultiplier(severity, crisis.quarantinedCityIds?.includes(cityId) ?? false);
    } else if (crisis.archetype === 'catastrophe' && crisis.stage === 'recovery') {
      multiplier *= getCatastropheRecoveryMultiplier(severity);
    }
  }
  return multiplier;
}
```
with:
```ts
export interface CrisisYieldMultiplier {
  food: number;
  production: number;
  gold: number;
  science: number;
}

// Outbreak/catastrophe penalize all four yields uniformly (general disruption).
// Famine (#590 MR3) penalizes food only — reuses the same quarantine-doubling/floor
// formula as outbreak (getOutbreakSeverityMultiplier), just scoped to one yield key.
export function getCrisisYieldMultiplier(state: GameState, cityId: string): CrisisYieldMultiplier {
  let result: CrisisYieldMultiplier = { food: 1, production: 1, gold: 1, science: 1 };
  for (const crisis of Object.values(state.activeCrises ?? {})) {
    if (!crisis.cityIds.includes(cityId)) continue;
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) continue;
    const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];
    if (crisis.archetype === 'outbreak') {
      const m = getOutbreakSeverityMultiplier(severity, crisis.quarantinedCityIds?.includes(cityId) ?? false);
      result = { food: result.food * m, production: result.production * m, gold: result.gold * m, science: result.science * m };
    } else if (crisis.archetype === 'catastrophe' && crisis.stage === 'recovery') {
      const m = getCatastropheRecoveryMultiplier(severity);
      result = { food: result.food * m, production: result.production * m, gold: result.gold * m, science: result.science * m };
    } else if (crisis.archetype === 'famine') {
      const m = getOutbreakSeverityMultiplier(severity, crisis.quarantinedCityIds?.includes(cityId) ?? false);
      result = { ...result, food: result.food * m };
    }
  }
  return result;
}
```

- [ ] **Step 4: Update `turn-manager.ts` caller**

Read `src/core/turn-manager.ts:224-253` first to confirm line numbers haven't drifted, then replace:
```ts
      const unrestMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city))
        * getCrisisYieldMultiplier(newState, cityId);
```
with:
```ts
      const baseYieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
      const crisisMultiplier = getCrisisYieldMultiplier(newState, cityId);
      const unrestMultiplier = {
        food: baseYieldMultiplier * crisisMultiplier.food,
        production: baseYieldMultiplier * crisisMultiplier.production,
        gold: baseYieldMultiplier * crisisMultiplier.gold,
        science: baseYieldMultiplier * crisisMultiplier.science,
      };
```
and replace the `yields` object immediately below (currently `* unrestMultiplier` on all four lines):
```ts
      const yields = {
        food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food       + (npCivBonuses.food       ?? 0) + empireFlatFoodForCity + resilienceBonus) * unrestMultiplier),
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production + (npCivBonuses.production ?? 0) + empireFlatProductionForCity + resilienceBonus) * unrestMultiplier * (1 + (empireTechPercents.production ?? 0) / 100)),
        gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier * (1 + (empireTechPercents.gold ?? 0) / 100)),
        science:    Math.floor((baseYields.science    + (wonderCityBonuses.science    ?? 0) + resourceYieldBonus.science + networkGovernanceScienceForCity) * unrestMultiplier * (1 + (empireTechPercents.science ?? 0) / 100)),
      };
```
with:
```ts
      const yields = {
        food:       Math.floor((baseYields.food       + (wonderCityBonuses.food       ?? 0) + resourceYieldBonus.food       + (npCivBonuses.food       ?? 0) + empireFlatFoodForCity + resilienceBonus) * unrestMultiplier.food),
        production: Math.floor((baseYields.production + (wonderCityBonuses.production ?? 0) + resourceYieldBonus.production + (npCivBonuses.production ?? 0) + empireFlatProductionForCity + resilienceBonus) * unrestMultiplier.production * (1 + (empireTechPercents.production ?? 0) / 100)),
        gold:       Math.floor((baseYields.gold       + (wonderCityBonuses.gold       ?? 0) + resourceYieldBonus.gold)       * unrestMultiplier.gold * (1 + (empireTechPercents.gold ?? 0) / 100)),
        science:    Math.floor((baseYields.science    + (wonderCityBonuses.science    ?? 0) + resourceYieldBonus.science + networkGovernanceScienceForCity) * unrestMultiplier.science * (1 + (empireTechPercents.science ?? 0) / 100)),
      };
```

- [ ] **Step 5: Update `city-panel.ts` caller**

Replace:
```ts
  const baseYields = calculateProjectedCityYields(state, city.id);
  const yieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city))
    * getCrisisYieldMultiplier(state, city.id);
```
with:
```ts
  const baseYields = calculateProjectedCityYields(state, city.id);
  const baseYieldMultiplier = Math.min(getUnrestYieldMultiplier(city), getOccupiedCityYieldMultiplier(city));
  const crisisMultiplier = getCrisisYieldMultiplier(state, city.id);
  const yieldMultiplier = {
    food: baseYieldMultiplier * crisisMultiplier.food,
    production: baseYieldMultiplier * crisisMultiplier.production,
    gold: baseYieldMultiplier * crisisMultiplier.gold,
    science: baseYieldMultiplier * crisisMultiplier.science,
  };
```
and replace:
```ts
  const yields = {
    food: Math.floor(baseYields.food * yieldMultiplier),
    production: Math.floor(baseYields.production * yieldMultiplier),
    gold: Math.floor(baseYields.gold * yieldMultiplier),
    science: Math.floor(baseYields.science * yieldMultiplier),
  };
```
with:
```ts
  const yields = {
    food: Math.floor(baseYields.food * yieldMultiplier.food),
    production: Math.floor(baseYields.production * yieldMultiplier.production),
    gold: Math.floor(baseYields.gold * yieldMultiplier.gold),
    science: Math.floor(baseYields.science * yieldMultiplier.science),
  };
```

- [ ] **Step 6: Run full crisis + turn-manager + city-panel test files to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-outbreak.test.ts tests/systems/crisis-catastrophe.test.ts tests/systems/crisis-system.test.ts tests/core/turn-manager.test.ts tests/ui/city-panel.test.ts`
Expected: PASS. If `turn-manager.test.ts` or `city-panel.test.ts` don't exist under those exact names, run `find tests -iname '*turn-manager*' -o -iname '*city-panel*'` first and use the real paths.

- [ ] **Step 7: Run `yarn build` to catch any other TS caller of `getCrisisYieldMultiplier` this plan missed**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: 0 type errors. If it surfaces another caller not covered above, fix it the same way (split scalar multiplier into the 4-key object) before moving on.

- [ ] **Step 8: Commit**

```bash
git add src/systems/crisis-system.ts src/core/turn-manager.ts src/ui/city-panel.ts tests/systems/crisis-outbreak.test.ts tests/systems/crisis-catastrophe.test.ts tests/systems/crisis-system.test.ts
git commit -m "refactor(crisis): generalize getCrisisYieldMultiplier to per-yield-type (#590 MR3)"
```

---

## Task 4: Famine tick function + epidemic-control halving + dispatch wiring

**Files:**
- Modify: `src/systems/crisis-system.ts` (add `tickFamineCrisis`, wire into `tickCrisisByArchetype`)
- Test: `tests/systems/crisis-famine.test.ts` (new file, mirrors `crisis-outbreak.test.ts`'s structure)

**Interfaces:**
- Consumes: `resolveCivDefinition` (`@/systems/civ-registry`), `calculateProjectedCityYields` (`@/systems/city-work-system`), `ActiveCrisis.famineSurplusStreakByCity` (Task 1).
- Produces: `tickFamineCrisis(state, crisis, bus): { crisis: ActiveCrisis | null; state: GameState }`; `FAMINE_CONTAINMENT_SURPLUS_TURNS` constant (exported for tests).

- [ ] **Step 1: Write failing tests**

```ts
// tests/systems/crisis-famine.test.ts
import { describe, it, expect } from 'vitest';
import { EventBus } from '@/core/event-bus';
import type { ActiveCrisis, GameState } from '@/core/types';
import { processCrisisTurn, FAMINE_CONTAINMENT_SURPLUS_TURNS } from '@/systems/crisis-system';
import { makeCrisisFixture } from './helpers/crisis-fixture';

function withFamineCrisis(overrides: Partial<ActiveCrisis> = {}) {
  const { state, civId } = makeCrisisFixture({ era: 3, turn: 40, challenge: 'standard' });
  const crisis: ActiveCrisis = {
    id: 'crisis-1', flavorId: 'crop-blight', archetype: 'famine', targetCivId: civId,
    cityIds: ['c1'], tileKeys: [], startedTurn: 38, stage: 'active', turnsInStage: 2,
    ...overrides,
  };
  return {
    state: { ...state, activeCrises: { [crisis.id]: crisis } },
    civId,
    crisis,
  };
}

describe('#590 MR3 — famine resolver', () => {
  it('ticks turnsInStage each turn', () => {
    const { state } = withFamineCrisis();
    const next = processCrisisTurn(state, new EventBus());
    expect(next.activeCrises!['crisis-1'].turnsInStage).toBe(3);
  });

  it('halves the effective pop-loss interval when the target civ has epidemic-control', () => {
    const { state, civId } = withFamineCrisis({ turnsInStage: 2 }); // veteran-only branch: force veteran challenge
    const veteranState: GameState = {
      ...state,
      civilizations: {
        ...state.civilizations,
        [civId]: { ...state.civilizations[civId], challenge: 'veteran' },
      },
    };
    // crop-blight veteran popLossEveryNTurnsIgnored = 3. Without the tech, turnsInStage
    // 3, 6, 9... trigger loss. With epidemic-control, effective interval doubles to 6.
    let withoutTech = veteranState;
    let withTech: GameState = {
      ...veteranState,
      civilizations: {
        ...veteranState.civilizations,
        [civId]: { ...veteranState.civilizations[civId], techState: { ...veteranState.civilizations[civId].techState, completed: ['epidemic-control'] } },
      },
    };
    for (let i = 0; i < 6; i++) {
      withoutTech = processCrisisTurn(withoutTech, new EventBus());
      withTech = processCrisisTurn(withTech, new EventBus());
    }
    const popWithoutTech = withoutTech.cities['c1'].population;
    const popWithTech = withTech.cities['c1'].population;
    expect(popWithTech).toBeGreaterThan(popWithoutTech); // halved interval = less loss over the same span
  });

  it('auto-contains a city after N consecutive turns of positive food surplus, independent of remedy', () => {
    const { state } = withFamineCrisis();
    // makeCrisisFixture's city 'c1' — read the fixture to confirm its population/yield
    // shape gives a positive food surplus by default (population low enough relative to
    // worked-tile yields); if not, override population down via cities override so the
    // surplus is unambiguously positive for this test.
    let working = state;
    for (let i = 0; i < FAMINE_CONTAINMENT_SURPLUS_TURNS; i++) {
      working = processCrisisTurn(working, new EventBus());
    }
    expect(working.activeCrises?.['crisis-1']).toBeUndefined(); // resolved — no code path funded a remedy
  });

  it('resets the surplus streak if surplus drops before reaching the threshold', () => {
    // A city whose surplus flips positive/negative each turn never reaches the streak
    // threshold — this proves the streak is CONSECUTIVE, not cumulative.
    // (Implementation detail for whoever writes this: force alternating surplus by
    // toggling city.population between two ticks via direct state overrides between
    // processCrisisTurn calls, then assert the crisis is still active after
    // FAMINE_CONTAINMENT_SURPLUS_TURNS ticks.)
  });

  it('quarantine stops spread but does not block the passive food-surplus auto-contain path', () => {
    const { state } = withFamineCrisis({ quarantinedCityIds: ['c1'] });
    let working = state;
    for (let i = 0; i < FAMINE_CONTAINMENT_SURPLUS_TURNS; i++) {
      working = processCrisisTurn(working, new EventBus());
    }
    expect(working.activeCrises?.['crisis-1']).toBeUndefined();
  });
});
```

Before finalizing this test file, read `tests/systems/helpers/crisis-fixture.ts` in full (not just the excerpt already seen) to learn the exact shape of `makeCrisisFixture`'s returned city `c1` (population, worked tiles) so the surplus-sign assumptions above are correct rather than guessed — adjust the fixture overrides in each test until the surplus sign is unambiguous and documented in a comment.

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-famine.test.ts`
Expected: FAIL — `tickFamineCrisis`/dispatch doesn't exist yet, `FAMINE_CONTAINMENT_SURPLUS_TURNS` isn't exported.

- [ ] **Step 3: Add imports needed for the new function**

At the top of `src/systems/crisis-system.ts`, add:
```ts
import { resolveCivDefinition } from './civ-registry';
import { calculateProjectedCityYields } from './city-work-system';
```

- [ ] **Step 4: Add `tickFamineCrisis`**

Insert after `tickOutbreakCrisis` (after line 248, before `const CATASTROPHE_RECOVERY_WINDOW_TURNS = 5;`):

```ts
// ── Famine resolver (#590 MR3) ───────────────────────────────────────────────

// Consecutive turns a city's food surplus must stay positive before the famine
// auto-resolves out of that city — independent of remedy/quarantine (issue #590:
// "containment accelerates while the afflicted city's food surplus > 0"). Shorter
// than plague's autoExpireTurns (5) since this is a player-influenceable mechanic
// (farms, granary, aid can all push surplus positive), not a pure timer.
export const FAMINE_CONTAINMENT_SURPLUS_TURNS = 3;

function tickFamineCrisis(
  state: GameState,
  crisis: ActiveCrisis,
  bus: EventBus,
): { crisis: ActiveCrisis | null; state: GameState } {
  const flavor = getCrisisFlavor(crisis.flavorId);
  if (!flavor) return { crisis: null, state };

  let working: ActiveCrisis = { ...crisis, turnsInStage: crisis.turnsInStage + 1 };
  let nextState = state;
  const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];

  if (working.sabotage && working.sabotage.untilTurn <= state.turn) {
    working = { ...working, sabotage: undefined };
  }
  const remedyPaused = working.sabotage !== undefined && working.sabotage.untilTurn > state.turn;

  // Remedy completion — identical shape to tickOutbreakCrisis, plus clearing any
  // surplus-streak bookkeeping for a city that just left via remedy.
  if (working.remedyCompletionByCity && !remedyPaused) {
    const remaining: Record<string, number> = {};
    let cityIds = working.cityIds;
    let quarantinedCityIds = working.quarantinedCityIds;
    let surplusStreak = working.famineSurplusStreakByCity;
    for (const [cityId, completionTurn] of Object.entries(working.remedyCompletionByCity)) {
      if (state.turn >= completionTurn) {
        cityIds = cityIds.filter(id => id !== cityId);
        quarantinedCityIds = quarantinedCityIds?.filter(id => id !== cityId);
        if (surplusStreak && cityId in surplusStreak) {
          const { [cityId]: _removed, ...rest } = surplusStreak;
          surplusStreak = rest;
        }
      } else {
        remaining[cityId] = completionTurn;
      }
    }
    working = { ...working, cityIds, quarantinedCityIds, remedyCompletionByCity: remaining, famineSurplusStreakByCity: surplusStreak };
  }

  if (working.cityIds.length === 0) {
    bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'contained' });
    return { crisis: null, state: nextState };
  }

  // Explorer auto-expiry — identical to tickOutbreakCrisis.
  if (severity.autoExpireTurns !== null && working.turnsInStage >= severity.autoExpireTurns) {
    bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'expired' });
    return { crisis: null, state: nextState };
  }

  // Veteran pop loss — epidemic-control (era 6 tech) halves the effective interval.
  // Scoped to famine only: the tech's promise text says "population loss from famine",
  // never disease — plague/red-tide (still outbreak) are intentionally unaffected.
  if (severity.popLossEveryNTurnsIgnored !== null) {
    const targetCiv = nextState.civilizations[working.targetCivId];
    const hasEpidemicControl = targetCiv?.techState.completed.includes('epidemic-control') ?? false;
    const effectiveInterval = hasEpidemicControl
      ? severity.popLossEveryNTurnsIgnored * 2
      : severity.popLossEveryNTurnsIgnored;
    if (working.turnsInStage % effectiveInterval === 0) {
      const cities = { ...nextState.cities };
      for (const cityId of working.cityIds) {
        if (working.quarantinedCityIds?.includes(cityId)) continue;
        if (working.remedyCompletionByCity?.[cityId] !== undefined) continue;
        const city = cities[cityId];
        if (!city) continue;
        cities[cityId] = { ...city, population: Math.max(1, city.population - 1) };
      }
      nextState = { ...nextState, cities };
    }
  }

  // Spread — identical shape to tickOutbreakCrisis.
  const owner = working.targetCivId;
  for (const cityId of [...working.cityIds]) {
    if (working.quarantinedCityIds?.includes(cityId)) continue;
    const city = nextState.cities[cityId];
    if (!city) continue;
    const rng = seededLcg(nextState.turn * 104729 + hashString(working.id + cityId));
    const boost = flavor.spreadBoostPredicate?.(nextState, city) ? 0.15 : 0;
    if (rng() >= 0.20 + boost) continue;
    const candidates = Object.values(nextState.cities)
      .filter(c => c.owner === owner && !working.cityIds.includes(c.id));
    if (candidates.length === 0) continue;
    const target = candidates.reduce((closest, c) =>
      mapDistance(nextState.map, c.position, city.position) < mapDistance(nextState.map, closest.position, city.position) ? c : closest);
    working = { ...working, cityIds: [...working.cityIds, target.id] };
    bus.emit('crisis:spread', { crisisId: working.id, fromCityId: cityId, toCityId: target.id });
  }

  // Passive auto-contain: consecutive turns of positive food surplus resolve a city
  // out of the crisis on its own, independent of remedy/quarantine (issue #590). Not
  // blocked by quarantine — quarantine's job is stopping SPREAD, not the afflicted
  // city's own recovery.
  const civ = nextState.civilizations[owner];
  const bonusEffect = civ ? resolveCivDefinition(nextState, civ.civType)?.bonusEffect : undefined;
  const nextSurplusStreak: Record<string, number> = { ...(working.famineSurplusStreakByCity ?? {}) };
  let remainingCityIds = working.cityIds;
  for (const cityId of working.cityIds) {
    const city = nextState.cities[cityId];
    if (!city) continue;
    const projectedYields = calculateProjectedCityYields(nextState, cityId, bonusEffect);
    const surplus = projectedYields.food - city.population;
    if (surplus > 0) {
      const streak = (nextSurplusStreak[cityId] ?? 0) + 1;
      if (streak >= FAMINE_CONTAINMENT_SURPLUS_TURNS) {
        remainingCityIds = remainingCityIds.filter(id => id !== cityId);
        delete nextSurplusStreak[cityId];
      } else {
        nextSurplusStreak[cityId] = streak;
      }
    } else {
      delete nextSurplusStreak[cityId];
    }
  }
  working = {
    ...working,
    cityIds: remainingCityIds,
    quarantinedCityIds: working.quarantinedCityIds?.filter(id => remainingCityIds.includes(id)),
    famineSurplusStreakByCity: Object.keys(nextSurplusStreak).length > 0 ? nextSurplusStreak : undefined,
  };

  if (working.cityIds.length === 0) {
    bus.emit('crisis:resolved', { crisisId: working.id, flavorId: working.flavorId, civId: working.targetCivId, outcome: 'contained' });
    return { crisis: null, state: nextState };
  }

  return { crisis: working, state: nextState };
}
```

- [ ] **Step 5: Wire into `tickCrisisByArchetype`**

Replace:
```ts
  switch (crisis.archetype) {
    case 'outbreak':
      return tickOutbreakCrisis(state, crisis, bus);
    case 'catastrophe':
      return tickCatastropheCrisis(state, crisis, bus);
    case 'hunt':
      return tickHuntCrisis(state, crisis, bus);
    default:
      // Not yet implemented (MR4's uprising lives in faction-system.ts, not here) —
      // leave untouched rather than silently dropping or mutating a crisis type this
      // resolver doesn't know.
      return { crisis, state };
  }
```
with:
```ts
  switch (crisis.archetype) {
    case 'outbreak':
      return tickOutbreakCrisis(state, crisis, bus);
    case 'catastrophe':
      return tickCatastropheCrisis(state, crisis, bus);
    case 'hunt':
      return tickHuntCrisis(state, crisis, bus);
    case 'famine':
      return tickFamineCrisis(state, crisis, bus);
    default:
      // Not yet implemented (MR4's uprising lives in faction-system.ts, not here) —
      // leave untouched rather than silently dropping or mutating a crisis type this
      // resolver doesn't know.
      return { crisis, state };
  }
```

- [ ] **Step 6: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-famine.test.ts`
Expected: PASS. If the surplus-sign assumptions from Step 1 were wrong, adjust the fixture overrides (not the implementation) until the test's stated intent (positive surplus → auto-contain; oscillating surplus → never contains) is actually what's being exercised.

- [ ] **Step 7: Commit**

```bash
git add src/systems/crisis-system.ts tests/systems/crisis-famine.test.ts
git commit -m "feat(crisis): implement famine resolver with epidemic-control pop-loss halving (#590 MR3)"
```

---

## Task 5: Scheduler weighting — `getFamineFragility`

**Files:**
- Modify: `src/systems/crisis-system.ts` (`maybeStartCrisis`, around line 90-99)
- Test: `tests/systems/crisis-system.test.ts`

**Interfaces:**
- Produces: `getFamineFragility(state, civId): number` (0..1)

- [ ] **Step 1: Write failing tests**

```ts
// tests/systems/crisis-system.test.ts — new describe block
describe('#590 MR3 — famine fragility scheduler weighting', () => {
  it('returns 1.0 when every city has food surplus <= 1', () => {
    // Build a minimal civ+cities fixture (reuse makeCrisisFixture or a hand-built
    // literal state, matching this file's existing minimal-literal-state style) where
    // every city's calculateProjectedCityYields food yield equals or barely exceeds
    // population. Assert getFamineFragility(state, civId) === 1.
  });

  it('returns 0 when every city has ample food surplus', () => {
    // Same shape, but cities sized so food yield is well above population + 1.
    // Assert getFamineFragility(state, civId) === 0.
  });

  it('food-poor civs see famine flavors selected far more often than food-rich civs over many seeds', () => {
    // Statistical test (per .claude/rules/strategy-game-mechanics.md "write balance
    // tests with statistical sampling"): run maybeStartCrisis-equivalent selection
    // (or processCrisisScheduler across N distinct turn/civId seeds) for a food-poor
    // fixture and a food-rich fixture, count how often the resulting crisis's flavor
    // has archetype 'famine' vs total crises started, and assert the food-poor rate
    // is meaningfully higher (e.g. at least 3x) than the food-rich rate, and that the
    // food-rich rate is NOT exactly zero (spec: "rarely", not "never").
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-system.test.ts`
Expected: FAIL — `getFamineFragility` doesn't exist.

- [ ] **Step 3: Add `getFamineFragility` beside the existing scheduler weights**

Insert directly above `maybeStartCrisis` (before line 61):

```ts
// Fraction of a civ's cities with food surplus <= +1 (#590 MR3). Multiplies famine
// flavor selection weight in maybeStartCrisis below — food-poor civs see famine flavors
// far more often; food-rich civs still see them occasionally (floor, not zero) since a
// famine can plausibly strike even a well-fed empire.
const FAMINE_WEIGHT_FLOOR = 0.1;

export function getFamineFragility(state: GameState, civId: string): number {
  const civ = state.civilizations[civId];
  if (!civ || civ.cities.length === 0) return 0;
  const bonusEffect = resolveCivDefinition(state, civ.civType)?.bonusEffect;
  const fragileCount = civ.cities.filter(cityId => {
    const city = state.cities[cityId];
    if (!city) return false;
    const projectedYields = calculateProjectedCityYields(state, cityId, bonusEffect);
    return projectedYields.food - city.population <= 1;
  }).length;
  return fragileCount / civ.cities.length;
}
```

- [ ] **Step 4: Apply the weight in `maybeStartCrisis`'s `weightedPick` call**

Replace:
```ts
  const history = civ.recentCrisisHistory ?? [];
  const flavor = weightedPick(eligible, eligible.map(f => history.includes(f.id) ? 0.25 : 1.0), rng);
```
with:
```ts
  const history = civ.recentCrisisHistory ?? [];
  const famineFragility = getFamineFragility(state, civId);
  const flavor = weightedPick(eligible, eligible.map(f => {
    const repeatPenalty = history.includes(f.id) ? 0.25 : 1.0;
    if (f.archetype !== 'famine') return repeatPenalty;
    return repeatPenalty * (FAMINE_WEIGHT_FLOOR + (1 - FAMINE_WEIGHT_FLOOR) * famineFragility);
  }), rng);
```

- [ ] **Step 5: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-system.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/systems/crisis-system.ts tests/systems/crisis-system.test.ts
git commit -m "feat(crisis): weight famine flavor selection by food fragility (#590 MR3)"
```

---

## Task 6: AI response policy + send-aid branch audit

**Files:**
- Modify: `src/ai/ai-crisis-response.ts:127`
- Modify: `src/systems/crisis-interaction-definitions.ts:35`
- Modify: `src/systems/crisis-interaction-system.ts:108-127`
- Test: `tests/ai/ai-crisis-response.test.ts`, `tests/systems/crisis-interaction-system.test.ts`

**Interfaces:**
- Consumes: `CrisisArchetype` (Task 1).

- [ ] **Step 1: Write failing AI-response test**

```ts
// tests/ai/ai-crisis-response.test.ts — add near existing outbreak coverage
describe('#590 MR3 — AI responds to famine crises', () => {
  it('quarantines and funds remedy for an AI civ\'s own famine crisis, same as outbreak', () => {
    // Mirror this file's existing outbreak fixture pattern exactly, but with
    // archetype: 'famine', flavorId: 'crop-blight'. Assert getCrisisResponseActions
    // returns both a 'quarantine' and (once affordable) a 'fund-remedy' action for it.
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-crisis-response.test.ts`
Expected: FAIL — famine crises are filtered out entirely (empty actions array).

- [ ] **Step 3: Widen the archetype filter in `ai-crisis-response.ts`**

Replace:
```ts
  const crises = Object.values(state.activeCrises ?? {})
    .filter((c): c is ActiveCrisis => c.targetCivId === civId && c.archetype === 'outbreak')
    .sort((a, b) => a.id.localeCompare(b.id));
```
with:
```ts
  // Famine (#590 MR3) reuses the same quarantine/fund-remedy response shape as
  // outbreak — both are attrition-style crises with cityIds-based spread/containment.
  const crises = Object.values(state.activeCrises ?? {})
    .filter((c): c is ActiveCrisis => c.targetCivId === civId && (c.archetype === 'outbreak' || c.archetype === 'famine'))
    .sort((a, b) => a.id.localeCompare(b.id));
```

- [ ] **Step 4: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ai/ai-crisis-response.test.ts`
Expected: PASS.

- [ ] **Step 5: Write failing send-aid test**

```ts
// tests/systems/crisis-interaction-system.test.ts — add near existing outbreak/catastrophe coverage
describe('#590 MR3 — send_aid on famine crises', () => {
  it('gates on medicine tech, same as outbreak', () => {
    // Mirror this file's existing outbreak send-aid fixture, but archetype: 'famine'.
    // Assert canSendAid returns { ok: false, reason: 'no-tech', techId: 'medicine' }
    // before the actor has medicine, and { ok: true, ... } after.
  });

  it('writes remedyCompletionByCity like outbreak (not a target gold credit like catastrophe)', () => {
    // After applySendAid on a famine crisis with medicine researched, assert
    // remedyCompletionByCity[cityId] is set to turn+2, and assert the actor's gold
    // decreased while the TARGET civ's gold did NOT increase (that's the catastrophe
    // branch's behavior, not famine's).
  });
});
```

- [ ] **Step 6: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-interaction-system.test.ts`
Expected: FAIL — `no-tech` resolves to `undefined` techId (permanently unsatisfiable), remedy never written.

- [ ] **Step 7: Add the famine tech-gate row**

Replace in `src/systems/crisis-interaction-definitions.ts`:
```ts
  { id: 'send_aid', techRequired: { outbreak: 'medicine', catastrophe: 'trade-routes' }, kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
```
with:
```ts
  // #590 MR3: famine reuses outbreak's medicine gate exactly — "send-aid diplomacy
  // interaction applies unchanged" means the same tech, the same behavior.
  { id: 'send_aid', techRequired: { outbreak: 'medicine', catastrophe: 'trade-routes', famine: 'medicine' }, kind: 'overt', targetReputationDelta: 15, witnessReputationDelta: 4, oncePerCrisisPerActor: true },
```

- [ ] **Step 8: Widen the outbreak-shaped branch in `applySendAid`**

Replace:
```ts
  const updatedCrisis: ActiveCrisis = {
    ...crisis,
    aidedByCivIds: [...(crisis.aidedByCivIds ?? []), actorCivId],
    ...(crisis.archetype === 'outbreak' ? {
      remedyCompletionByCity: { ...(crisis.remedyCompletionByCity ?? {}), [city.id]: nextState.turn + 2 },
    } : {}),
  };
```
with:
```ts
  const updatedCrisis: ActiveCrisis = {
    ...crisis,
    aidedByCivIds: [...(crisis.aidedByCivIds ?? []), actorCivId],
    ...((crisis.archetype === 'outbreak' || crisis.archetype === 'famine') ? {
      remedyCompletionByCity: { ...(crisis.remedyCompletionByCity ?? {}), [city.id]: nextState.turn + 2 },
    } : {}),
  };
```

Leave the `crisis.archetype === 'catastrophe'` gold-credit branch untouched — famine is not catastrophe-shaped.

- [ ] **Step 9: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/systems/crisis-interaction-system.test.ts`
Expected: PASS.

- [ ] **Step 10: Commit**

```bash
git add src/ai/ai-crisis-response.ts src/systems/crisis-interaction-definitions.ts src/systems/crisis-interaction-system.ts tests/ai/ai-crisis-response.test.ts tests/systems/crisis-interaction-system.test.ts
git commit -m "feat(crisis): wire famine into AI response policy + send-aid interaction (#590 MR3)"
```

---

## Task 7: City panel — famine chips (food-specific display, honest wording)

**Files:**
- Modify: `src/ui/city-panel.ts`
- Test: `tests/ui/city-panel.test.ts`

**Interfaces:**
- Consumes: `callbacks.onQuarantineCrisis`, `callbacks.onRemedyCrisis` (already exist, archetype-agnostic).

- [ ] **Step 1: Write failing test**

```ts
// tests/ui/city-panel.test.ts — add near existing outbreak crisis-chip coverage
describe('#590 MR3 — famine crisis chip', () => {
  it('renders a food-specific penalty line and a quarantine/import-grain button for an active famine crisis', () => {
    // Mirror this file's existing outbreak crisis-chip test fixture, but with a
    // famine-archetype crisis (flavorId: 'crop-blight', archetype: 'famine') affecting
    // the rendered city. Assert the panel's crisis text mentions "food" (not the
    // generic "yields" wording outbreak chips use) and that a quarantine button and an
    // "Import Grain" labeled remedy button are both present and wired to
    // data-quarantine-crisis / data-remedy-crisis attributes.
  });

  it('shows auto-contain progress once the city has accrued a positive food-surplus streak', () => {
    // With crisis.famineSurplusStreakByCity: { [cityId]: 2 } and
    // FAMINE_CONTAINMENT_SURPLUS_TURNS = 3, assert the panel shows a legible
    // "1 more turn of surplus" (or equivalent) status line — per
    // .claude/rules/end-to-end-wiring.md, computed streak progress must render.
  });
});
```

- [ ] **Step 2: Run to verify failure**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts`
Expected: FAIL — no famine chip section exists; famine crises render nothing.

- [ ] **Step 3: Add the `famineChips` builder**

Insert immediately after the existing `catastropheCrises`/`catastropheChips` block (after line 368, `}).filter((c): c is NonNullable<typeof c> => c !== null);` for catastrophe), before `const catastropheSectionHtml = ...`:

```ts
  const famineCrises = Object.values(state.activeCrises ?? {})
    .filter(c => c.archetype === 'famine' && c.cityIds.includes(city.id));
  const famineChips = famineCrises.map(crisis => {
    const flavor = getCrisisFlavor(crisis.flavorId);
    if (!flavor) return null;
    const severity = flavor.severityByChallenge[resolvePressureSeverityForCiv(state, crisis.targetCivId)];
    const civ = state.civilizations[crisis.targetCivId];
    const isQuarantined = crisis.quarantinedCityIds?.includes(city.id) ?? false;
    const remedyCompletionTurn = crisis.remedyCompletionByCity?.[city.id];
    const remedyPending = remedyCompletionTurn !== undefined;
    const remedyCost = getCityAppeaseCost(city);
    const canAffordRemedy = (civ?.gold ?? 0) >= remedyCost;
    const foodPenaltyPct = Math.round(severity.yieldPenalty * 100);
    const surplusStreak = crisis.famineSurplusStreakByCity?.[city.id] ?? 0;
    const turnsToAutoContain = Math.max(0, FAMINE_CONTAINMENT_SURPLUS_TURNS - surplusStreak);

    const quarantineDisabled = isQuarantined || !callbacks.onQuarantineCrisis;
    const quarantineLabel = isQuarantined ? 'Quarantined' : 'Quarantine (free)';
    const remedyDisabled = remedyPending || !canAffordRemedy || !callbacks.onRemedyCrisis;
    const remedyLabel = remedyPending
      ? 'Grain shipment underway'
      : !canAffordRemedy
        ? `Not enough gold (needs ${remedyCost})`
        : `Import Grain (${remedyCost} gold)`;

    return {
      crisis, flavor, isQuarantined, remedyPending, remedyCompletionTurn, foodPenaltyPct,
      surplusStreak, turnsToAutoContain,
      quarantineDisabled, quarantineLabel, remedyDisabled, remedyLabel,
    };
  }).filter((c): c is NonNullable<typeof c> => c !== null);
  const famineSectionHtml = famineChips.map((chip, idx) => `
    <div style="background:rgba(217,150,80,0.12);border:1px solid rgba(217,150,80,0.35);border-radius:8px;padding:10px 12px;margin-bottom:16px;font-size:12px;">
      <div style="font-weight:bold;color:#e8a85a;margin-bottom:4px;" data-text="famine-stage-${idx}"></div>
      <div style="margin-bottom:4px;opacity:0.85;" data-text="famine-advisor-${idx}"></div>
      <div style="margin-bottom:8px;opacity:0.7;" data-text="famine-progress-${idx}"></div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;">
        <button type="button" data-quarantine-crisis="${chip.crisis.id}:${city.id}" ${chip.quarantineDisabled ? 'disabled' : ''} title="${chip.quarantineLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${chip.quarantineDisabled ? 'default' : 'pointer'};background:${chip.quarantineDisabled ? 'rgba(255,255,255,0.08)' : '#4a90d9'};color:${chip.quarantineDisabled ? 'rgba(255,255,255,0.4)' : '#fff'};border:none;">${chip.quarantineLabel}</button>
        <button type="button" data-remedy-crisis="${chip.crisis.id}:${city.id}" ${chip.remedyDisabled ? 'disabled' : ''} title="${chip.remedyLabel}" style="min-height:44px;padding:7px 12px;border-radius:6px;font-size:12px;font-weight:bold;cursor:${chip.remedyDisabled ? 'default' : 'pointer'};background:${chip.remedyDisabled ? 'rgba(255,255,255,0.08)' : '#d4aa2c'};color:${chip.remedyDisabled ? 'rgba(255,255,255,0.4)' : '#1a1a1a'};border:none;">${chip.remedyLabel}</button>
      </div>
    </div>`).join('');
```

- [ ] **Step 4: Insert `famineSectionHtml` into the panel's HTML template**

Find where `crisisSectionHtml` and `catastropheSectionHtml` are interpolated into the panel's outer template literal (search for `${crisisSectionHtml}` in the file) and add `${famineSectionHtml}` immediately adjacent to them, in the same container div.

- [ ] **Step 5: Populate the dynamic text via `setText`, mirroring the outbreak block**

Insert after the existing `crisisChips.forEach(...)` block (after line 849):

```ts
  famineChips.forEach((chip, idx) => {
    const displayName = getCrisisDisplayName(chip.flavor, state.era);
    const stageText = chip.remedyPending
      ? `Grain shipment underway — arrives in ${Math.max(0, chip.remedyCompletionTurn! - state.turn)} turn${Math.max(0, chip.remedyCompletionTurn! - state.turn) === 1 ? '' : 's'}`
      : chip.isQuarantined
        ? `Quarantined — spread stopped, −${chip.foodPenaltyPct}% food`
        : `⚠️ ${displayName} — −${chip.foodPenaltyPct}% food`;
    setText(`famine-stage-${idx}`, stageText);
    const advisorLine = chip.flavor.advisorLine
      .replace('{name}', displayName)
      .replace('{city}', city.name);
    setText(`famine-advisor-${idx}`, advisorLine);
    const progressText = chip.surplusStreak > 0
      ? `Food surplus is recovering — ${chip.turnsToAutoContain} more turn${chip.turnsToAutoContain === 1 ? '' : 's'} of surplus ends the famine here`
      : 'Build farms or a granary to run a food surplus and end the famine naturally';
    setText(`famine-progress-${idx}`, progressText);
  });
```

- [ ] **Step 6: Import `FAMINE_CONTAINMENT_SURPLUS_TURNS`**

Add `FAMINE_CONTAINMENT_SURPLUS_TURNS` to the existing `@/systems/crisis-system` import in `city-panel.ts`.

- [ ] **Step 7: Run to verify pass**

Run: `bash scripts/run-with-mise.sh yarn test tests/ui/city-panel.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/ui/city-panel.ts tests/ui/city-panel.test.ts
git commit -m "feat(crisis): render famine crisis chips with food-specific wording + auto-contain progress (#590 MR3)"
```

---

## Task 8: Full gates + PR

- [ ] **Step 1: Full test suite**

Run: `bash scripts/run-with-mise.sh yarn test`
Expected: 0 failures. Pay particular attention to any generic "every crisis flavor..." or "every archetype..." test elsewhere in the suite that this plan didn't anticipate — fix the new content, not the test, unless the test's assumption is genuinely outbreak-only and needs a famine carve-out documented inline.

- [ ] **Step 2: Full build (type-check)**

Run: `bash scripts/run-with-mise.sh yarn build`
Expected: 0 errors.

- [ ] **Step 3: Manual solo + hot-seat playtest with a forced famine (per issue gates)**

Start the dev server, use a debug/console path (or a short-lived test seed) to force a famine crisis onto a city in both a solo game and a 2-player hot-seat game; confirm:
- The city panel shows the food-specific chip (not generic "yields" wording).
- Quarantine and "Import Grain" buttons both work and disable correctly.
- Passing turns with a food surplus visibly counts down toward auto-contain.
- The panel is correct for BOTH hot-seat players (uses `state.currentPlayer`, not a hardcoded civ).

- [ ] **Step 4: Write the PR body**

Must include: the branch-audit table from this plan's top (verbatim or lightly edited), the save decision (additive + defensive normalization), and reference to `#590` and `#587` — never `closes #524` or `closes #590` (per [[feedback_pr_body_closes_keyword]] — this MR issue and the index issue both stay open until the arc's later MRs land; only the index issue owner decides when to close things, manually).

- [ ] **Step 5: Open the PR**

```bash
gh pr create --title "feat(crisis): famine archetype + epidemic-control halving (#590 MR3)" --body "$(cat <<'EOF'
...
EOF
)"
```
