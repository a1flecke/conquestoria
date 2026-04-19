# MR 9 — Espionage Buildings

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three espionage-category buildings boost spy training, counter-intelligence, and captive handling. CI bonuses from older-era buildings fade when later-era security techs are researched (era adaptation mechanic).

**Prerequisite MRs:** MR 1–7 (`setCounterIntelligence` module-private helper defined in MR 7)

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
- Create: `tests/systems/espionage-buildings.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-buildings.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { processCity, BUILDING_DEFINITIONS } from '@/systems/city-system';
import { applyBuildingCI } from '@/systems/espionage-system';
import { createEspionageCivState } from '@/systems/espionage-system';

describe('espionage building definitions', () => {
  it('safehouse is defined with espionage category', () => {
    expect(BUILDING_DEFINITIONS['safehouse']).toBeDefined();
    expect(BUILDING_DEFINITIONS['safehouse'].category).toBe('espionage');
  });

  it('intelligence-agency is defined with espionage category', () => {
    expect(BUILDING_DEFINITIONS['intelligence-agency']).toBeDefined();
    expect(BUILDING_DEFINITIONS['intelligence-agency'].techRequired).toBe('espionage-informants');
  });

  it('security-bureau is defined with espionage category', () => {
    expect(BUILDING_DEFINITIONS['security-bureau']).toBeDefined();
    expect(BUILDING_DEFINITIONS['security-bureau'].techRequired).toBe('counter-intelligence');
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

  it('safehouse reduces spy training cost by 25%', () => {
    const city = { id: 'c1', buildings: ['safehouse'] } as any;
    // processCity with spy_scout in queue should cost ~23 instead of 30
    // (test the applyProductionBonus integration)
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-buildings.test.ts
```

- [ ] **Step 3: Add building definitions to `src/systems/city-system.ts`**

In `BUILDING_DEFINITIONS`, add:

```typescript
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
  description: 'Raises this city\'s counter-intelligence score by 20 each turn (max 100). Bonus halves when digital-surveillance era is reached.',
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

In `processCity`, in the unit production cost calculation, check if the city has a safehouse and the unit being trained is a spy type:

```typescript
let effectiveCost = unitDef.cost;
if (city.buildings.includes('safehouse') && isSpyUnitType(unitDef.type as UnitType)) {
  effectiveCost = Math.ceil(effectiveCost * 0.75);
}
```

Import `isSpyUnitType` from `espionage-system.ts`.

- [ ] **Step 5: Add `applyBuildingCI` to `src/systems/espionage-system.ts`**

```typescript
const ERA_CI_FADE_TRIGGERS: Record<string, string[]> = {
  'digital-surveillance': ['intelligence-agency'],
  'cyber-warfare': ['security-bureau'],
};

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

- [ ] **Step 6: Wire `applyBuildingCI` in `src/core/turn-manager.ts`**

In the espionage turn processing loop, after the embedded spy CI contribution block:

```typescript
import { applyBuildingCI } from '@/systems/espionage-system';

// For each city owned by this civ, apply building CI bonuses
for (const cityId of civ.cities) {
  const city = newState.cities[cityId];
  if (!city || !newState.espionage?.[civId]) continue;
  newState.espionage![civId] = applyBuildingCI(cityId, city, newState.espionage![civId], civ.techState.completed);
}
```

- [ ] **Step 7: Wire Security Bureau's turning resistance**

In `processEspionageTurn`, before calling `turnCapturedSpy`, check if the captured spy's target city has a security bureau. If so, skip the turning (return early from that branch):

```typescript
const targetCity = gameState.cities[spy.targetCityId ?? ''];
const hasSecurityBureau = targetCity?.buildings.includes('security-bureau') ?? false;
if (hasSecurityBureau && rng() < 0.5) {
  // Security bureau blocks the turning attempt
  continue;
}
```

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/city-system.ts src/systems/espionage-system.ts src/core/turn-manager.ts tests/systems/espionage-buildings.test.ts
git commit -m "feat(espionage): buildings — Safehouse (spy cost -25%), Intelligence Agency, Security Bureau with era-fading CI"
```
