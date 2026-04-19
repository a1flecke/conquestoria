# MR 2 — Detection System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scout Hound units and passive city baseline detect spy units traveling near enemy cities. Detection is visible-to-player intel (not automatic teleportation or unit removal).

**Prerequisite MRs:** MR 1 (physical spy units, `isSpyUnitType`)

---

## Task 5: Passive Baseline Detection + Scout Hound

**Files:**
- Create: `src/systems/detection-system.ts`
- Modify: `src/core/turn-manager.ts`
- Create: `tests/systems/detection-system.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/detection-system.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import {
  getPassiveDetectionChance,
  processDetection,
} from '@/systems/detection-system';

function makeDetectionState(): GameState {
  // State with one idle spy unit (player's) near an enemy city
  // Enemy has no spy units
  return { /* minimal state */ } as any;
}

describe('passive baseline detection', () => {
  it('returns 0.05 for a city with population 1', () => {
    expect(getPassiveDetectionChance(1)).toBeCloseTo(0.05);
  });

  it('scales with population, max 0.20', () => {
    expect(getPassiveDetectionChance(10)).toBeCloseTo(0.20);
    expect(getPassiveDetectionChance(100)).toBeCloseTo(0.20);
  });
});

describe('scout_hound detection', () => {
  it('scout_hound within vision range has 35% chance to detect adjacent spy unit', () => {
    // Build a state where a scout_hound unit is adjacent to a spy unit
    // After processDetection, the spy should appear in recentDetections with some probability
    // We run 100 trials and check it's near 35%
    let detections = 0;
    for (let i = 0; i < 200; i++) {
      const state = buildDetectionState(`seed-${i}`);
      const bus = new (require('@/core/event-bus').EventBus)();
      const next = processDetection(state, bus);
      if ((next.espionage?.['ai-egypt']?.recentDetections ?? []).length > 0) {
        detections++;
      }
    }
    const rate = detections / 200;
    expect(rate).toBeGreaterThan(0.20);
    expect(rate).toBeLessThan(0.55);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/detection-system.test.ts
```

Expected: `getPassiveDetectionChance` not found.

- [ ] **Step 3: Create `src/systems/detection-system.ts`**

```typescript
// src/systems/detection-system.ts
import type { GameState, Unit } from '@/core/types';
import type { EventBus } from '@/core/event-bus';
import { UNIT_DEFINITIONS } from './unit-system';
import { hexDistance } from './hex-utils';
import { createRng } from './map-generator';
import { isSpyUnitType } from './espionage-system';

export function getPassiveDetectionChance(cityPopulation: number): number {
  return Math.min(0.20, 0.03 + cityPopulation * 0.017);
}

export function processDetection(state: GameState, bus: EventBus): GameState {
  const seed = `detection-${state.turn}`;
  const rng = createRng(seed);
  let nextState = state;

  for (const [spyUnitId, spyUnit] of Object.entries(state.units)) {
    if (!isSpyUnitType(spyUnit.type)) continue;

    // Only traveling (on-map idle) spies can be detected
    const spyRecord = state.espionage?.[spyUnit.owner]?.spies[spyUnitId];
    if (!spyRecord || spyRecord.status !== 'idle') continue;

    // 1. Scout Hound detection
    for (const [detectUnitId, detectUnit] of Object.entries(state.units)) {
      if (detectUnit.owner === spyUnit.owner) continue;
      const def = UNIT_DEFINITIONS[detectUnit.type];
      if (!def.spyDetectionChance) continue;
      const dist = hexDistance(detectUnit.position, spyUnit.position);
      if (dist > def.visionRange) continue;
      if (rng() < def.spyDetectionChance) {
        nextState = registerDetection(nextState, detectUnit.owner, spyUnit, false, bus);
      }
    }

    // 2. Passive baseline detection — only if spy is adjacent to or on an enemy city
    for (const city of Object.values(state.cities)) {
      if (city.owner === spyUnit.owner) continue;
      if (hexDistance(city.position, spyUnit.position) > 1) continue;
      const chance = getPassiveDetectionChance(city.population);
      if (rng() < chance) {
        nextState = registerDetection(nextState, city.owner, spyUnit, spyRecord.disguiseAs != null, bus);
      }
    }
  }

  return nextState;
}

function registerDetection(
  state: GameState,
  detectingCivId: string,
  spyUnit: Unit,
  wasDisguised: boolean,
  bus: EventBus,
): GameState {
  const civEsp = state.espionage?.[detectingCivId];
  if (!civEsp) return state;

  const detection = {
    position: { ...spyUnit.position },
    turn: state.turn,
    wasDisguised,
  };
  bus.emit('espionage:spy-detected-traveling', {
    detectingCivId,
    spyOwner: spyUnit.owner,
    spyUnitId: spyUnit.id,
    position: spyUnit.position,
    wasDisguised,
  });

  return {
    ...state,
    espionage: {
      ...state.espionage,
      [detectingCivId]: {
        ...civEsp,
        recentDetections: [...(civEsp.recentDetections ?? []), detection].slice(-20),
      },
    },
  };
}
```

- [ ] **Step 4: Wire `processDetection` in `src/core/turn-manager.ts`**

Add import: `import { processDetection } from '@/systems/detection-system';`

At end of the main civ loop (after espionage turn processing), add:
```typescript
newState = processDetection(newState, bus);
```

Also add the new event to `GameEventMap` in `types.ts`:
```typescript
'espionage:spy-detected-traveling': { detectingCivId: string; spyOwner: string; spyUnitId: string; position: HexCoord; wasDisguised: boolean };
```

- [ ] **Step 5: Run tests**

```bash
yarn test tests/systems/detection-system.test.ts
```

- [ ] **Step 6: Commit**

```bash
git add src/systems/detection-system.ts src/core/turn-manager.ts src/core/types.ts tests/systems/detection-system.test.ts
git commit -m "feat(espionage): detection system — scout hound units and passive baseline city detection"
```
