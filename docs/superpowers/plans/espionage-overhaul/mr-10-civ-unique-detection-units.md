# MR 10 — Civ-Unique Detection Units

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 2–3 civilizations get unique detection units that replace the standard Scout Hound with improved or specialized capabilities.

**Prerequisite MRs:** MR 1–9

**Example unique units:**

| Unit | Replaces | Civ | Difference |
|------|----------|-----|------------|
| `shadow_warden` | `scout_hound` | Espionage-focused civ | Better detection (0.50 vs 0.35), higher vision |
| `war_hound` | `scout_hound` | Military-focused civ | Higher combat strength (12 vs 8), lower detection (0.30) |

---

## Task 14: Detection Unit System in Civ Definitions

**Files:**
- Modify: `src/core/types.ts` — add `detectionUnitReplacement` to `CivDefinition`-equivalent
- Modify: `src/systems/civ-definitions.ts` — add detection units to specific civs
- Modify: `src/systems/city-system.ts` — `getTrainableUnitsForCiv` uses civ-specific replacements
- Modify: `src/systems/unit-system.ts` — add definitions for unique detection units
- Create: `tests/systems/detection-system.test.ts` extended

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/detection-system.test.ts`:

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

  it('espionage-focused civ gets shadow_warden instead of scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'espionage_civ');
    const types = units.map(u => u.type);
    expect(types).toContain('shadow_warden');
    expect(types).not.toContain('scout_hound');
  });

  it('standard civ still gets scout_hound', () => {
    const units = getTrainableUnitsForCiv(['lookouts'], 'egypt');
    const types = units.map(u => u.type);
    expect(types).toContain('scout_hound');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/detection-system.test.ts
```

- [ ] **Step 3: Add `detectionUnitReplacement` to `CivDefinition` in `src/core/types.ts`**

Find the `CivDefinition` interface (or its equivalent in `civ-definitions.ts`) and add:

```typescript
detectionUnitReplacement?: {
  standard: UnitType;
  replacement: UnitType;
};
```

- [ ] **Step 4: Add unique detection unit definitions to `src/systems/unit-system.ts`**

In `UNIT_DEFINITIONS`:

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

In `UNIT_DESCRIPTIONS`:

```typescript
shadow_warden: 'Elite detection unit. 50% chance per turn to reveal disguised spies within vision range. Favored by intelligence-focused civilizations.',
war_hound: 'Combat-focused detection unit. Weaker spy detection (30%) but formidable in battle. Tears apart lightly-armored spy units.',
```

Also add `'shadow_warden' | 'war_hound'` to the `UnitType` union in `src/core/types.ts`.

- [ ] **Step 5: Update `getTrainableUnitsForCiv` in `src/systems/city-system.ts`**

Extend the signature to accept an optional `civType` parameter:

```typescript
export function getTrainableUnitsForCiv(completedTechs: string[], civType?: string): TrainableUnitEntry[] {
  const filtered = TRAINABLE_UNITS.filter(u => {
    if (u.techRequired && !completedTechs.includes(u.techRequired)) return false;
    if (u.obsoletedByTech && completedTechs.includes(u.obsoletedByTech)) return false;
    return true;
  });
  if (!civType) return filtered;
  const civDef = CIV_DEFINITIONS[civType];
  if (!civDef?.detectionUnitReplacement) return filtered;
  return filtered.map(u =>
    u.type === civDef.detectionUnitReplacement!.standard
      ? { ...u, type: civDef.detectionUnitReplacement!.replacement, name: UNIT_DEFINITIONS[civDef.detectionUnitReplacement!.replacement].name }
      : u
  );
}
```

Import `CIV_DEFINITIONS` and `UNIT_DEFINITIONS` in `city-system.ts`.

- [ ] **Step 6: Add `detectionUnitReplacement` to the relevant civs in `src/systems/civ-definitions.ts`**

Pick 2 existing civs and add the replacement:

```typescript
// Espionage-focused civ (e.g., Persia or whichever fits the lore):
'persia': {
  // ... existing fields ...
  detectionUnitReplacement: { standard: 'scout_hound', replacement: 'shadow_warden' },
},

// Military-focused civ (e.g., Rome):
'rome': {
  // ... existing fields ...
  detectionUnitReplacement: { standard: 'scout_hound', replacement: 'war_hound' },
},
```

- [ ] **Step 7: Update callers of `getTrainableUnitsForCiv`**

Find every call to `getTrainableUnitsForCiv` in the codebase and pass `civType` where available:
- `src/ui/city-panel.ts`: pass `state.civilizations[city.owner]?.civType`
- `src/ai/basic-ai.ts`: pass `civ.civType`

Calls in test files can pass `undefined` or omit the argument.

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/city-system.ts src/systems/civ-definitions.ts src/ui/city-panel.ts src/ai/basic-ai.ts tests/systems/detection-system.test.ts
git commit -m "feat(espionage): civ-unique detection units — shadow_warden, war_hound replace scout_hound for specific civs"
```
