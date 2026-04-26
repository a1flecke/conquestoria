# MR 10 — Civ-Unique Detection Units

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2–3 civilizations get unique detection units that replace the standard Scout Hound with improved or specialized capabilities.

**Prerequisite MRs:** MR 1–9

**Example unique units:**

| Unit | Replaces | Civ | Difference |
|------|----------|-----|------------|
| `shadow_warden` | `scout_hound` | Persia (espionage-focused) | Better detection (0.50 vs 0.35), higher vision |
| `war_hound` | `scout_hound` | Rome (military-focused) | Higher combat strength (12 vs 8), lower detection (0.30) |

**Implementation approach:** Unique units are added to `TRAINABLE_UNITS` with two new optional fields: `civTypeRequired` (only show for that civ) and `replacesUnit` (hide the standard unit for that civ). No changes needed to `civ-definitions.ts` or `CivDefinition`.

---

## Task 14: Detection Unit System in Civ Definitions

**Files:**
- Modify: `src/core/types.ts` — add `'shadow_warden' | 'war_hound'` to `UnitType`; add `civTypeRequired` and `replacesUnit` to `TrainableUnitEntry`
- Modify: `src/systems/city-system.ts` — add unique units to `TRAINABLE_UNITS`; extend `getTrainableUnitsForCiv` with `civType` param; add optional `civType` param to `processCity`
- Modify: `src/systems/unit-system.ts` — add `UNIT_DEFINITIONS` and `UNIT_DESCRIPTIONS` entries
- Modify: `src/core/turn-manager.ts` — pass `civ.civType` to `processCity`
- Modify: `src/ui/city-panel.ts` — replace direct `TRAINABLE_UNITS.filter` with `getTrainableUnitsForCiv(completedTechs, civType)`
- Modify: `src/ai/basic-ai.ts` — pass `civ.civType` to `getTrainableUnitsForCiv`
- Modify: `tests/systems/detection-system.test.ts` — extend with civ-unique tests

- [ ] **Step 1: Write failing tests**

Append to `tests/systems/detection-system.test.ts` (after the existing imports and describe blocks):

```typescript
import { getTrainableUnitsForCiv } from '@/systems/city-system';

describe('civ-unique detection units', () => {
  it('shadow_warden is defined in UNIT_DEFINITIONS', async () => {
    const { UNIT_DEFINITIONS } = await import('@/systems/unit-system');
    expect(UNIT_DEFINITIONS['shadow_warden']).toBeDefined();
    expect(UNIT_DEFINITIONS['shadow_warden'].spyDetectionChance).toBe(0.50);
  });

  it('war_hound is defined in UNIT_DEFINITIONS', async () => {
    const { UNIT_DEFINITIONS } = await import('@/systems/unit-system');
    expect(UNIT_DEFINITIONS['war_hound']).toBeDefined();
    expect(UNIT_DEFINITIONS['war_hound'].strength).toBeGreaterThan(10);
  });

  it('persia gets shadow_warden instead of scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'persia');
    const types = units.map(u => u.type);
    expect(types).toContain('shadow_warden');
    expect(types).not.toContain('scout_hound');
  });

  it('rome gets war_hound instead of scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'rome');
    const types = units.map(u => u.type);
    expect(types).toContain('war_hound');
    expect(types).not.toContain('scout_hound');
  });

  it('standard civ still gets scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'egypt');
    const types = units.map(u => u.type);
    expect(types).toContain('scout_hound');
    expect(types).not.toContain('shadow_warden');
    expect(types).not.toContain('war_hound');
  });

  it('civType undefined returns no unique units', () => {
    const units = getTrainableUnitsForCiv(['lookouts']);
    const types = units.map(u => u.type);
    expect(types).toContain('scout_hound');
    expect(types).not.toContain('shadow_warden');
    expect(types).not.toContain('war_hound');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/detection-system.test.ts
```

- [ ] **Step 3: Extend `TrainableUnitEntry` and add to `UnitType` in `src/core/types.ts`**

Add `'shadow_warden' | 'war_hound'` to the `UnitType` union (after `'scout_hound'`):

```typescript
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound' | 'shadow_warden' | 'war_hound';
```

Add two optional fields to the `TrainableUnitEntry` interface:

```typescript
export interface TrainableUnitEntry {
  type: UnitType;
  name: string;
  cost: number;
  techRequired?: string;
  obsoletedByTech?: string;
  civTypeRequired?: string;   // only shown/available for this civ
  replacesUnit?: UnitType;    // hides this standard unit when civTypeRequired matches
}
```

- [ ] **Step 4: Add unit definitions to `src/systems/unit-system.ts`**

`UNIT_DEFINITIONS` is `Record<UnitType, UnitDefinition>` — add two new entries after `scout_hound`:

```typescript
shadow_warden: {
  type: 'shadow_warden', name: 'Shadow Warden',
  movementPoints: 3, visionRange: 4, strength: 6,
  canFoundCity: false, canBuildImprovements: false, productionCost: 45,
  spyDetectionChance: 0.50,
},
war_hound: {
  type: 'war_hound', name: 'War Hound',
  movementPoints: 4, visionRange: 3, strength: 12,
  canFoundCity: false, canBuildImprovements: false, productionCost: 45,
  spyDetectionChance: 0.30,
},
```

`UNIT_DESCRIPTIONS` is `Record<UnitType, string>` — add:

```typescript
shadow_warden: 'Elite detection unit. 50% chance per turn to reveal disguised spies within vision range. Favored by intelligence-focused civilizations.',
war_hound: 'Combat-focused detection unit. Weaker spy detection (30%) but formidable in battle. Tears apart lightly-armored spy units.',
```

- [ ] **Step 5: Add unique units to `TRAINABLE_UNITS` and update `getTrainableUnitsForCiv` in `src/systems/city-system.ts`**

After the `scout_hound` entry in `TRAINABLE_UNITS`:

```typescript
{ type: 'shadow_warden', name: 'Shadow Warden', cost: 45, techRequired: 'lookouts', civTypeRequired: 'persia', replacesUnit: 'scout_hound' },
{ type: 'war_hound', name: 'War Hound', cost: 45, techRequired: 'lookouts', civTypeRequired: 'rome', replacesUnit: 'scout_hound' },
```

Replace `getTrainableUnitsForCiv` with:

```typescript
export function getTrainableUnitsForCiv(completedTechs: string[], civType?: string): TrainableUnitEntry[] {
  const replacedForCiv = new Set(
    TRAINABLE_UNITS
      .filter(u => u.civTypeRequired === civType && u.replacesUnit)
      .map(u => u.replacesUnit!),
  );
  return TRAINABLE_UNITS.filter(u => {
    if (u.techRequired && !completedTechs.includes(u.techRequired)) return false;
    if (u.obsoletedByTech && completedTechs.includes(u.obsoletedByTech)) return false;
    if (u.civTypeRequired && u.civTypeRequired !== civType) return false;
    if (replacedForCiv.has(u.type)) return false;
    return true;
  });
}
```

No new imports needed — `TRAINABLE_UNITS` is already in scope.

- [ ] **Step 6: Add optional `civType` parameter to `processCity` in `src/systems/city-system.ts`**

The function at line ~156 currently drops queued units that aren't trainable. Extend it to pass civType through:

Current signature:
```typescript
export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
  bonusEffect?: CivBonusEffect,
  completedTechs: string[] = [],
): CityProcessResult {
```

New signature (add civType as last optional param):
```typescript
export function processCity(
  city: City,
  map: GameMap,
  foodYield: number,
  productionYield: number = 0,
  bonusEffect?: CivBonusEffect,
  completedTechs: string[] = [],
  civType?: string,
): CityProcessResult {
```

Change the internal call from:
```typescript
const trainable = getTrainableUnitsForCiv(completedTechs);
```
to:
```typescript
const trainable = getTrainableUnitsForCiv(completedTechs, civType);
```

- [ ] **Step 7: Update `processCity` caller in `src/core/turn-manager.ts`**

Find the single `processCity(...)` call (line ~93). Add `civ.civType` as the last argument:

```typescript
const result = processCity(city, newState.map, yields.food, effectiveProduction, civDef?.bonusEffect, civ.techState.completed, civ.civType);
```

- [ ] **Step 8: Update `city-panel.ts` to use `getTrainableUnitsForCiv`**

In `src/ui/city-panel.ts`, around line 72, find:
```typescript
const availableUnits = TRAINABLE_UNITS.filter(u => !u.techRequired || completedTechs.includes(u.techRequired));
```

Replace with:
```typescript
const civType = state.civilizations[city.owner]?.civType;
const availableUnits = getTrainableUnitsForCiv(completedTechs, civType);
```

Also add `getTrainableUnitsForCiv` to the import from `@/systems/city-system` at the top of the file.

Note: The existing `TRAINABLE_UNITS.find(u => u.type === currentItem)` calls for queue name display (lines ~89, ~192, ~219) will still work correctly because unique units are now in `TRAINABLE_UNITS`.

- [ ] **Step 9: Update `basic-ai.ts` caller**

Find the `getTrainableUnitsForCiv(civ.techState.completed)` call around line 668 in `src/ai/basic-ai.ts`.

Change to:
```typescript
const availableSpyTypes = getTrainableUnitsForCiv(civ.techState.completed, civ.civType)
```

- [ ] **Step 10: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 11: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/core/turn-manager.ts src/ui/city-panel.ts src/ai/basic-ai.ts tests/systems/detection-system.test.ts docs/superpowers/plans/espionage-overhaul/mr-10-civ-unique-detection-units.md
git commit -m "feat(espionage): MR10 civ-unique detection units — shadow_warden (Persia), war_hound (Rome) replace scout_hound"
```
