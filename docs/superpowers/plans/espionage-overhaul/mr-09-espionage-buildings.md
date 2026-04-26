# MR 9 — Espionage Buildings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three espionage-category buildings boost spy training, counter-intelligence, and captive handling. CI bonuses from older-era buildings fade when later-era security techs are researched (era adaptation mechanic).

**Prerequisite MRs:** MR 1–7 (`setCounterIntelligence` is **exported** from `espionage-system.ts` — `applyBuildingCI` lives in the same file so it can call `setCounterIntelligence` directly with no additional import)

**Buildings:**

| Building | Cost | Tech | Effect |
|----------|------|------|--------|
| Safehouse | 50 prod | `espionage-scouting` | −25% spy unit training cost |
| Intelligence Agency | 80 prod | `espionage-informants` | +20 CI/turn (halved to +10 when `digital-surveillance` researched) |
| Security Bureau | 120 prod | `counter-intelligence` | +30 CI/turn + captured spies 50% less likely to be turned; halved when `cyber-warfare` researched |

---

## Task 13: Safehouse, Intelligence Agency, Security Bureau

**Files:**
- Modify: `src/systems/city-system.ts`
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/core/turn-manager.ts`
- Create: `tests/systems/espionage-buildings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-buildings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { processCity, BUILDINGS } from '@/systems/city-system';
import { applyBuildingCI, createEspionageCivState } from '@/systems/espionage-system';

describe('espionage building definitions', () => {
  it('safehouse is defined with espionage category', () => {
    expect(BUILDINGS['safehouse']).toBeDefined();
    expect(BUILDINGS['safehouse'].category).toBe('espionage');
  });

  it('intelligence-agency is defined with espionage category', () => {
    expect(BUILDINGS['intelligence-agency']).toBeDefined();
    expect(BUILDINGS['intelligence-agency'].techRequired).toBe('espionage-informants');
  });

  it('security-bureau is defined with espionage category', () => {
    expect(BUILDINGS['security-bureau']).toBeDefined();
    expect(BUILDINGS['security-bureau'].techRequired).toBe('counter-intelligence');
  });
});

describe('applyBuildingCI', () => {
  it('intelligence-agency gives +20 CI per turn', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(20);
  });

  it('intelligence-agency CI halved (to +10) when digital-surveillance researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['digital-surveillance']);
    expect(result.counterIntelligence['c1']).toBe(10);
  });

  it('city without intelligence-agency gets no CI from that building', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: [] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBeUndefined();
  });

  it('security-bureau gives +30 CI per turn', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(30);
  });

  it('security-bureau CI halved (to +15) when cyber-warfare researched', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, ['cyber-warfare']);
    expect(result.counterIntelligence['c1']).toBe(15);
  });

  it('city without security-bureau gets no CI from that building', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: [] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBeUndefined();
  });

  it('both buildings stack CI', () => {
    const civEsp = createEspionageCivState();
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(50); // 20 + 30
  });

  it('CI is capped at 100', () => {
    const civEsp = { ...createEspionageCivState(), counterIntelligence: { c1: 90 } };
    const city = { id: 'c1', buildings: ['intelligence-agency', 'security-bureau'] } as any;
    const result = applyBuildingCI('c1', city, civEsp, []);
    expect(result.counterIntelligence['c1']).toBe(100);
  });
});

describe('safehouse spy training cost reduction', () => {
  const baseCity = {
    id: 'c1',
    food: 0, foodNeeded: 10, population: 1,
    productionProgress: 0,
    productionQueue: ['spy_scout'],
    buildings: ['safehouse'],
    ownedTiles: [],
    buildingGrid: {},
  } as any;

  const baseMap = { tiles: {}, width: 10, height: 10, wrap: false } as any;

  it('safehouse reduces spy_scout training cost by 25% (30 → 23)', () => {
    // spy_scout costs 30; with safehouse 25% discount: ceil(30 * 0.75) = 23
    const city = { ...baseCity, productionProgress: 22 };
    const result = processCity(city, baseMap, 0, 0, undefined, ['espionage-scouting']);
    // Progress 22 < 23 — not complete yet
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionProgress: 23 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result2.completedUnit).toBe('spy_scout');
  });

  it('safehouse does NOT reduce training cost for non-spy units', () => {
    // warrior costs 8; safehouse discount should not apply
    const city = { ...baseCity, productionQueue: ['warrior'], productionProgress: 7 };
    const result = processCity(city, baseMap, 0, 0, undefined, []);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, productionQueue: ['warrior'], productionProgress: 8 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, []);
    expect(result2.completedUnit).toBe('warrior');
  });

  it('without safehouse spy_scout requires full 30 production', () => {
    const city = { ...baseCity, buildings: [], productionProgress: 29 };
    const result = processCity(city, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result.completedUnit).toBeNull();

    const city2 = { ...baseCity, buildings: [], productionProgress: 30 };
    const result2 = processCity(city2, baseMap, 0, 0, undefined, ['espionage-scouting']);
    expect(result2.completedUnit).toBe('spy_scout');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/espionage-buildings.test.ts
```

- [ ] **Step 3: Add building definitions to `src/systems/city-system.ts`**

In `BUILDINGS`, add an `// Espionage` section after the Culture section (after the closing `forum` entry, before the `};` that closes the object):

```typescript
  // Espionage
  safehouse: {
    id: 'safehouse', name: 'Safehouse', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 50,
    description: 'Reduces spy unit training cost by 25%.',
    techRequired: 'espionage-scouting', adjacencyBonuses: [],
  },
  'intelligence-agency': {
    id: 'intelligence-agency', name: 'Intelligence Agency', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 80,
    description: "Raises this city's counter-intelligence score by 20 each turn (max 100). Bonus halves when digital-surveillance era is reached.",
    techRequired: 'espionage-informants', adjacencyBonuses: [],
  },
  'security-bureau': {
    id: 'security-bureau', name: 'Security Bureau', category: 'espionage',
    yields: { food: 0, production: 0, gold: 0, science: 0 },
    productionCost: 120,
    description: 'Raises CI by 30 each turn and makes captured spies 50% less likely to be turned. Bonus halves at cyber-warfare era.',
    techRequired: 'counter-intelligence', adjacencyBonuses: [],
  },
```

- [ ] **Step 4: Wire Safehouse 25% spy training cost reduction in `src/systems/city-system.ts`**

First add an import for `isSpyUnitType` at the top of `city-system.ts` (alongside the existing imports):

```typescript
import { isSpyUnitType } from './espionage-system';
```

Then in `processCity`, find the existing unit cost block (the lines that check `unitDef` and compare to `Math.round(unitDef.cost * unitCostMult)`):

**Before:**
```typescript
    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const unitCostMult = unitDef ? applyProductionBonus(currentItem, bonusEffect) : 1;
    if (unitDef && newProgress >= Math.round(unitDef.cost * unitCostMult)) {
      newQueue.shift();
      newProgress = 0;
      completedUnit = unitDef.type;
    }
```

**After:**
```typescript
    const unitDef = TRAINABLE_UNITS.find(u => u.type === currentItem);
    const unitCostMult = unitDef ? applyProductionBonus(currentItem, bonusEffect) : 1;
    const safehouseMult = (unitDef && city.buildings.includes('safehouse') && isSpyUnitType(unitDef.type as UnitType))
      ? 0.75
      : 1;
    if (unitDef && newProgress >= Math.ceil(unitDef.cost * unitCostMult * safehouseMult)) {
      newQueue.shift();
      newProgress = 0;
      completedUnit = unitDef.type;
    }
```

Use `Math.ceil` so that 30 × 0.75 = 22.5 rounds up to 23, matching the test.

- [ ] **Step 5: Add `applyBuildingCI` to `src/systems/espionage-system.ts`**

Add after the `setCounterIntelligence` export (currently around line 755):

```typescript
export function applyBuildingCI(
  cityId: string,
  city: { buildings: string[] },
  civEsp: EspionageCivState,
  completedTechs: string[],
): EspionageCivState {
  let ciBonus = 0;
  if (city.buildings.includes('intelligence-agency')) {
    const faded = completedTechs.includes('digital-surveillance');
    ciBonus += faded ? 10 : 20;
  }
  if (city.buildings.includes('security-bureau')) {
    const faded = completedTechs.includes('cyber-warfare');
    ciBonus += faded ? 15 : 30;
  }
  if (ciBonus === 0) return civEsp;
  const current = civEsp.counterIntelligence[cityId] ?? 0;
  return setCounterIntelligence(civEsp, cityId, Math.min(100, current + ciBonus));
}
```

`setCounterIntelligence` is already exported from this file — call it directly, no additional import needed.

- [ ] **Step 6: Wire `applyBuildingCI` in `src/core/turn-manager.ts`**

Extend the existing espionage import line (line 40) to include `applyBuildingCI`:

```typescript
import { processEspionageTurn, isSpyUnitType, createSpyFromUnit, processInterrogation, applyBuildingCI } from '@/systems/espionage-system';
```

Then add a new block **immediately after** the embedded-spy per-turn CI block (the `{ let espionage = newState.espionage ?? {}; ... newState = { ...newState, espionage }; }` block that ends around line 583). Use the same spread pattern — never mutate `newState.espionage![civId]` directly:

```typescript
  // Building CI bonuses per turn (Intelligence Agency + Security Bureau)
  {
    let espionage = newState.espionage ?? {};
    for (const [civId, civ] of Object.entries(newState.civilizations)) {
      if (!espionage[civId]) continue;
      for (const cityId of civ.cities) {
        const city = newState.cities[cityId];
        if (!city) continue;
        const updated = applyBuildingCI(cityId, city, espionage[civId], civ.techState.completed);
        if (updated !== espionage[civId]) {
          espionage = { ...espionage, [civId]: updated };
        }
      }
    }
    newState = { ...newState, espionage };
  }
```

- [ ] **Step 7: Wire Security Bureau's turning resistance in `src/systems/espionage-system.ts`**

In `processEspionageTurn` (around line 1059), find the captured spy turning block:

```typescript
      if (spy.status === 'captured' && !spy.turnedBy && captorId && canTurnCapturedSpy) {
        state.espionage = turnCapturedSpy(state.espionage!, captorId, civId, spy.id, state.turn);
        bus.emit('espionage:spy-detected', {
          detectingCivId: captorId,
          spyOwner: civId,
          spyId: spy.id,
          cityId: spy.targetCityId ?? '',
        });
      }
```

Replace with:

```typescript
      if (spy.status === 'captured' && !spy.turnedBy && captorId && canTurnCapturedSpy) {
        const targetCity = spy.targetCityId ? state.cities[spy.targetCityId] : null;
        const hasSecurityBureau = targetCity?.buildings.includes('security-bureau') ?? false;
        if (hasSecurityBureau) {
          const turnRng = createRng(`sec-bureau-${spy.id}-${state.turn}`);
          if (turnRng() < 0.5) continue; // Security bureau blocks 50% of turning attempts
        }
        state.espionage = turnCapturedSpy(state.espionage!, captorId, civId, spy.id, state.turn);
        bus.emit('espionage:spy-detected', {
          detectingCivId: captorId,
          spyOwner: civId,
          spyId: spy.id,
          cityId: spy.targetCityId ?? '',
        });
      }
```

`createRng` is already imported at the top of `espionage-system.ts`. Use `state.cities` (the function parameter name) — not `gameState`.

- [ ] **Step 8: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

- [ ] **Step 9: Type-check**

```bash
bash scripts/run-with-mise.sh yarn build
```

- [ ] **Step 10: Commit**

```bash
git add src/systems/city-system.ts src/systems/espionage-system.ts src/core/turn-manager.ts tests/systems/espionage-buildings.test.ts
git commit -m "feat(espionage): buildings — Safehouse (spy cost -25%), Intelligence Agency, Security Bureau with era-fading CI"
```
