# MR 3 — Disguise System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traveling spy units can disguise as common unit types (barbarian, warrior, scout, archer, worker). Disguised spies appear as the fake unit type to enemies unless an enemy spy unit or scout_hound is nearby. Removing a disguise is free; putting one on costs the spy's turn.

**Prerequisite MRs:** MR 1 (physical spy units, `isSpyUnitType`), MR 2 (detection, `hasNearbyDetector` concept)

---

## Task 6: Disguise as Travel-Phase Mechanic

**Files:**
- Create: `src/systems/espionage-stealth.ts`
- Modify: `src/systems/espionage-system.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/espionage-stealth.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/espionage-stealth.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { GameState } from '@/core/types';
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';
import { createEspionageCivState, createSpyFromUnit, setDisguise } from '@/systems/espionage-system';

function makeStealthState(disguise?: string) {
  let civEsp = { ...createEspionageCivState(), maxSpies: 1 };
  const { state: esp } = createSpyFromUnit(civEsp, 'unit-1', 'player', 'spy_scout', 'stealth-seed');
  civEsp = disguise
    ? setDisguise(esp, 'unit-1', disguise as any)
    : esp;
  return {
    espionage: { player: civEsp, 'ai-egypt': createEspionageCivState() },
    units: {
      'unit-1': { id: 'unit-1', type: 'spy_scout', owner: 'player', position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 2, hasActed: false, hasMoved: false },
    },
    civilizations: {
      player: { techState: { completed: ['espionage-scouting', 'disguise'] } },
      'ai-egypt': { techState: { completed: [] } },
    },
  } as unknown as GameState;
}

describe('getVisibleUnitsForPlayer', () => {
  it('spy without disguise is visible to enemy as spy unit', () => {
    const state = makeStealthState();
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1']).toBeDefined();
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('spy disguised as barbarian appears as barbarian warrior to enemy', () => {
    const state = makeStealthState('barbarian');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('warrior');
    expect(visible['unit-1'].owner).toBe('barbarian');
  });

  it('spy disguised as barbarian appears as true self to owner', () => {
    const state = makeStealthState('barbarian');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'player');
    expect(visible['unit-1'].type).toBe('spy_scout');
  });

  it('enemy scout_hound unit sees through barbarian disguise', () => {
    const state = makeStealthState('barbarian');
    state.units['hound-1'] = { id: 'hound-1', type: 'scout_hound', owner: 'ai-egypt', position: { q: 5, r: 3 }, health: 100, movementPointsLeft: 3, hasActed: false, hasMoved: false };
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('spy_scout');
    expect(visible['unit-1'].owner).toBe('player');
  });

  it('spy disguised as archer appears as archer', () => {
    const state = makeStealthState('archer');
    const visible = getVisibleUnitsForPlayer(state.units, state, 'ai-egypt');
    expect(visible['unit-1'].type).toBe('archer');
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/espionage-stealth.test.ts
```

- [ ] **Step 3: Add `setDisguise` to `src/systems/espionage-system.ts`**

```typescript
export function setDisguise(
  state: EspionageCivState,
  spyId: string,
  disguiseAs: DisguiseType | null,
): EspionageCivState {
  const spy = state.spies[spyId];
  if (!spy) throw new Error(`Spy ${spyId} not found`);
  if (spy.status !== 'idle') throw new Error('Disguise can only be set while spy is on the map (idle)');
  return {
    ...state,
    spies: { ...state.spies, [spyId]: { ...spy, disguiseAs } },
  };
}
```

- [ ] **Step 4: Create `src/systems/espionage-stealth.ts`**

```typescript
// src/systems/espionage-stealth.ts
import type { Unit, GameState, UnitType } from '@/core/types';
import { UNIT_DEFINITIONS } from './unit-system';
import { isSpyUnitType } from './espionage-system';
import { hexDistance } from './hex-utils';

// Own spy units AND detection units (scout_hound) both see through all disguises.
function hasNearbyDetector(units: Record<string, Unit>, viewerCivId: string, spyPosition: { q: number; r: number }): boolean {
  for (const u of Object.values(units)) {
    if (u.owner !== viewerCivId) continue;
    const def = UNIT_DEFINITIONS[u.type];
    const isDetector = !!def?.spyDetectionChance || isSpyUnitType(u.type);
    if (!isDetector) continue;
    if (hexDistance(u.position, spyPosition) <= (def?.visionRange ?? 2)) return true;
  }
  return false;
}

const DISGUISE_TYPE_MAP: Record<string, UnitType> = {
  barbarian: 'warrior',
  warrior: 'warrior',
  scout: 'scout',
  archer: 'archer',
  worker: 'worker',
};

export function getVisibleUnitsForPlayer(
  units: Record<string, Unit>,
  state: GameState,
  viewerCivId: string,
): Record<string, Unit> {
  const result: Record<string, Unit> = {};

  for (const [id, unit] of Object.entries(units)) {
    if (unit.owner === viewerCivId) {
      result[id] = unit;
      continue;
    }

    const spyRecord = state.espionage?.[unit.owner]?.spies[id];
    const disguise = spyRecord?.disguiseAs;

    if (!disguise || !spyRecord || spyRecord.status !== 'idle') {
      result[id] = unit;
      continue;
    }

    // Own spy units and scout_hound units see through all disguises
    const detectByUnit = hasNearbyDetector(units, viewerCivId, unit.position);
    if (detectByUnit) {
      result[id] = unit;
      continue;
    }

    const fakeType = DISGUISE_TYPE_MAP[disguise] ?? 'warrior';
    const fakeOwner = disguise === 'barbarian' ? 'barbarian' : unit.owner;
    result[id] = { ...unit, type: fakeType as UnitType, owner: fakeOwner };
  }

  return result;
}
```

- [ ] **Step 5: Wire `getVisibleUnitsForPlayer` in `src/renderer/render-loop.ts`**

In `render-loop.ts`, add import and apply before `drawUnits`:

```typescript
import { getVisibleUnitsForPlayer } from '@/systems/espionage-stealth';

// In private render() method, replace:
drawUnits(this.ctx, this.state.units, this.camera, playerVis, this.state, this.state.currentPlayer, colorLookup);

// With:
const visibleUnits = getVisibleUnitsForPlayer(this.state.units, this.state, this.state.currentPlayer);
drawUnits(this.ctx, visibleUnits, this.camera, playerVis, this.state, this.state.currentPlayer, colorLookup);
```

- [ ] **Step 6: Add disguise actions to `src/ui/selected-unit-info.ts`**

Add `onSetDisguise?: (unitId: string, disguise: DisguiseType | null) => void` to `SelectedUnitInfoCallbacks`.

In `renderSelectedUnitInfo`, after the existing actions, add for idle spy units:

```typescript
if (isSpyUnitType(unit.type) && !unit.hasActed && callbacks.onSetDisguise) {
  const spy = state.espionage?.[unit.owner]?.spies[unitId];
  const ownerTechs = state.civilizations[unit.owner]?.techState.completed ?? [];
  
  const disguiseOptions: Array<{ label: string; value: DisguiseType | null; tech?: string }> = [
    { label: 'No Disguise', value: null },        // always available; removing disguise is free
    { label: 'As Barbarian', value: 'barbarian', tech: 'espionage-informants' },
    { label: 'As Warrior', value: 'warrior', tech: 'espionage-informants' },
    { label: 'As Scout', value: 'scout', tech: 'spy-networks' },
    { label: 'As Archer', value: 'archer', tech: 'spy-networks' },
    { label: 'As Worker', value: 'worker', tech: 'cryptography' },
  ].filter(opt => !opt.tech || ownerTechs.includes(opt.tech));

  if (disguiseOptions.length > 1) {
    const disguiseSection = document.createElement('div');
    disguiseSection.style.cssText = 'margin-top:8px;display:flex;flex-wrap:wrap;gap:6px;';
    const label = document.createElement('div');
    label.textContent = 'Set disguise (costs this turn\'s move):';
    label.style.cssText = 'font-size:10px;opacity:0.6;width:100%;';
    disguiseSection.appendChild(label);
    for (const opt of disguiseOptions) {
      const active = (spy?.disguiseAs ?? null) === opt.value;
      disguiseSection.appendChild(
        makeButton(active ? `✓ ${opt.label}` : opt.label, active ? '#7c3aed' : '#374151',
          () => callbacks.onSetDisguise!(unitId, opt.value))
      );
    }
    actionsDiv.appendChild(disguiseSection);
  }
}
```

- [ ] **Step 7: Wire `onSetDisguise` in `src/main.ts`**

```typescript
onSetDisguise: (unitId, disguise) => {
  const unit = gameState.units[unitId];
  if (!unit || unit.hasActed || !gameState.espionage?.[gameState.currentPlayer]) return;
  gameState.espionage![gameState.currentPlayer] = setDisguise(
    gameState.espionage![gameState.currentPlayer], unitId, disguise,
  );
  if (disguise !== null) {
    // Putting on a disguise costs the spy's turn; removing one is free.
    gameState.units[unitId] = { ...unit, hasActed: true, movementPointsLeft: 0 };
  }
  renderLoop.setGameState(gameState);
  showNotification(disguise ? `Spy disguised as ${disguise}.` : 'Disguise removed.', 'info');
},
```

- [ ] **Step 8: Run full test suite**

```bash
yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/espionage-stealth.ts src/systems/espionage-system.ts src/renderer/render-loop.ts src/ui/selected-unit-info.ts src/main.ts tests/systems/espionage-stealth.test.ts
git commit -m "feat(espionage): disguise system — spy units can disguise as common units during travel; seen through by spy/scout-hound units"
```
