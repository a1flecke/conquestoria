# MR 8 — Per-Era Spy Types + Universal Unit Upgrade System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All obsolete units (including spy units) can be upgraded to the current era's equivalent at half production cost in a home city. Obsolete embedded/infiltrated spy units auto-expire cleanly with a notification.

**Prerequisite MRs:** MR 1–7 (spy unit types and obsolescence fields already in place from MR 1)

---

## Task 11: Unit Upgrade System (all unit types)

**User value:** Obsolete units can be upgraded to the current era's equivalent at half production cost in a home city. Takes 1 turn. Heals unit to full health.

**Files:**
- Create: `src/systems/unit-upgrade-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Create: `tests/systems/unit-upgrade.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/unit-upgrade.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canUpgradeUnit, getUpgradeCost, applyUpgrade } from '@/systems/unit-upgrade-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
import type { Unit } from '@/core/types';

function makeUnit(type: string, position = { q: 0, r: 0 }): Unit {
  return { id: 'u1', type: type as any, owner: 'player', position, health: 70, movementPointsLeft: 2, hasActed: false, hasMoved: false };
}

describe('canUpgradeUnit', () => {
  it('spy_scout upgrades to spy_informant when espionage-informants researched', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants']);
    expect(result.canUpgrade).toBe(true);
    expect(result.targetType).toBe('spy_informant');
  });

  it('spy_scout does not upgrade when espionage-informants not researched', () => {
    const unit = makeUnit('spy_scout', { q: 0, r: 0 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting']);
    expect(result.canUpgrade).toBe(false);
  });

  it('cannot upgrade unit not standing on the city tile', () => {
    const unit = makeUnit('spy_scout', { q: 5, r: 5 });
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const result = canUpgradeUnit(unit, 'c1', { 'c1': city }, ['espionage-scouting', 'espionage-informants']);
    expect(result.canUpgrade).toBe(false);
  });
});

describe('getUpgradeCost', () => {
  it('returns half of the target unit production cost', () => {
    const cost = getUpgradeCost('spy_informant');
    expect(cost).toBe(25); // spy_informant costs 50, half = 25
  });
});

describe('applyUpgrade', () => {
  it('changes unit type and heals to full health', () => {
    const unit = makeUnit('spy_scout');
    const city = { id: 'c1', owner: 'player', position: { q: 0, r: 0 } } as any;
    const upgraded = applyUpgrade(unit, 'spy_informant', city);
    expect(upgraded.type).toBe('spy_informant');
    expect(upgraded.health).toBe(100);
    expect(upgraded.hasActed).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
yarn test tests/systems/unit-upgrade.test.ts
```

- [ ] **Step 3: Create `src/systems/unit-upgrade-system.ts`**

```typescript
import type { Unit, UnitType, City } from '@/core/types';
import { TRAINABLE_UNITS } from './city-system';
import { UNIT_DEFINITIONS } from './unit-system';

export interface UpgradeRequest {
  unitId: string;
  targetType: UnitType;
  cityId: string;
}

export function getUpgradeCost(targetType: UnitType): number {
  const entry = TRAINABLE_UNITS.find(u => u.type === targetType);
  return entry ? Math.ceil(entry.cost * 0.5) : 0;
}

export function canUpgradeUnit(
  unit: Unit,
  cityId: string,
  cities: Record<string, City>,
  completedTechs: string[],
): { canUpgrade: boolean; targetType: UnitType | null; cost: number } {
  const city = cities[cityId];
  if (!city || city.owner !== unit.owner) return { canUpgrade: false, targetType: null, cost: 0 };
  if (unit.position.q !== city.position.q || unit.position.r !== city.position.r) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  const currentEntry = TRAINABLE_UNITS.find(u => u.type === unit.type);
  if (!currentEntry?.obsoletedByTech || !completedTechs.includes(currentEntry.obsoletedByTech)) {
    return { canUpgrade: false, targetType: null, cost: 0 };
  }
  // Find the next unit in this upgrade chain: requires the same tech that obsoleted us,
  // and is not itself obsolete. Parentheses are critical here — && binds tighter than ||.
  const nextEntry = TRAINABLE_UNITS.find(u =>
    u.techRequired === currentEntry.obsoletedByTech &&
    (!u.obsoletedByTech || !completedTechs.includes(u.obsoletedByTech))
  );
  if (!nextEntry) return { canUpgrade: false, targetType: null, cost: 0 };
  return { canUpgrade: true, targetType: nextEntry.type, cost: getUpgradeCost(nextEntry.type) };
}

export function applyUpgrade(
  unit: Unit,
  targetType: UnitType,
  city: City,
): Unit {
  return {
    ...unit,
    type: targetType,
    health: 100,
    movementPointsLeft: UNIT_DEFINITIONS[targetType].movementPoints,
    hasActed: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
yarn test tests/systems/unit-upgrade.test.ts
```

- [ ] **Step 5: Add upgrade prompt to `src/ui/selected-unit-info.ts`**

Add `onUpgradeUnit?: (unitId: string, cityId: string) => void` to `SelectedUnitInfoCallbacks`.

In `renderSelectedUnitInfo`, for units on a home city tile, check `canUpgradeUnit`. If upgradeable, show:

```typescript
const upgradeable = checkUpgrade(unit, state);
if (upgradeable && callbacks.onUpgradeUnit) {
  const btn = makeButton(
    `Upgrade → ${upgradeable.targetTypeName} (${upgradeable.cost} prod, 1 turn)`,
    '#7c3aed',
    () => callbacks.onUpgradeUnit!(unitId, upgradeable.cityId),
  );
  actionsDiv.appendChild(btn);
}
```

Helper `checkUpgrade` finds the city the unit is currently standing on (owned by the same player) and calls `canUpgradeUnit`.

- [ ] **Step 6: Add upgrade prompt to `src/ui/city-panel.ts`**

In the city panel, show units currently in the city that are eligible for upgrade. For each such unit, show:
```
[Unit Name] — Upgrade to [Target] for [N] production
```
with an Upgrade button.

- [ ] **Step 7: Run full test suite**

```bash
yarn test
```

- [ ] **Step 8: Commit**

```bash
git add src/systems/unit-upgrade-system.ts src/core/turn-manager.ts src/ui/city-panel.ts src/ui/selected-unit-info.ts tests/systems/unit-upgrade.test.ts
git commit -m "feat(espionage): unit upgrade system — obsolete units upgradeable at half cost in home city"
```

---

## Task 12: Obsolescence Notifications

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/systems/espionage-system.ts`

- [ ] **Step 1: Write failing test**

Add to `tests/systems/unit-upgrade.test.ts`:

```typescript
describe('obsolescence notifications', () => {
  it('emits unit:obsolete for map units when tech completes', () => {
    // Build a state with a spy_scout unit and espionage-informants completing this turn
    // processTurn should emit unit:obsolete for the spy_scout
    const state = makeStateWithSpyScoutAndTechCompleting();
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('unit:obsolete', e => events.push(e));
    processTurn(state, bus);
    expect(events.length).toBeGreaterThan(0);
  });

  it('silently removes embedded spy when its era tech completes', () => {
    // Build state where spy_scout is embedded and espionage-informants completes
    // After processTurn, the spy record should be gone, no diplomatic penalty
    const state = makeStateWithEmbeddedSpyScoutAndTechCompleting();
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Implement obsolescence scan in `src/core/turn-manager.ts`**

When a tech completes, scan `state.units` for units owned by that civ of the obsoleted type. The tech completion is already emitted as `tech:completed`. Add a handler in `processTurn`:

```typescript
bus.on('tech:completed', ({ civId: completedCivId, techId }) => {
  const obsoletedTypes = TRAINABLE_UNITS
    .filter(u => u.obsoletedByTech === techId)
    .map(u => u.type);
  if (obsoletedTypes.length === 0) return;

  // Map units
  for (const [unitId, unit] of Object.entries(newState.units)) {
    if (unit.owner !== completedCivId) continue;
    if (!obsoletedTypes.includes(unit.type)) continue;
    bus.emit('unit:obsolete', { civId: completedCivId, unitId, unitType: unit.type });
  }

  // Embedded/infiltrated spy units
  const civEsp = newState.espionage?.[completedCivId];
  if (civEsp) {
    for (const [spyId, spy] of Object.entries(civEsp.spies)) {
      if (!obsoletedTypes.includes(spy.unitType)) continue;
      if (spy.status === 'embedded' || spy.status === 'stationed') {
        // Silently expire: remove spy record, notify owning player
        const { [spyId]: _removed, ...remainingSpies } = newState.espionage![completedCivId].spies;
        newState.espionage![completedCivId] = { ...newState.espionage![completedCivId], spies: remainingSpies };
        bus.emit('espionage:spy-expired', { civId: completedCivId, spyId, spyName: spy.name, unitType: spy.unitType });
      }
    }
  }
});
```

Add `'unit:obsolete'` and `'espionage:spy-expired'` to `GameEventMap` in `types.ts`.

In `main.ts`, show notification for expired spies:
```typescript
bus.on('espionage:spy-expired', ({ civId, spyName, unitType }) => {
  if (civId === gameState.currentPlayer) {
    showNotification(`${spyName}'s network has been dissolved (${unitType} era ended). No diplomatic penalty.`, 'info');
  }
});
```

- [ ] **Step 3: Run full test suite**

```bash
yarn test
```

- [ ] **Step 4: Commit**

```bash
git add src/core/turn-manager.ts src/core/types.ts tests/systems/unit-upgrade.test.ts
git commit -m "feat(espionage): obsolescence notifications — unit:obsolete event; embedded spies auto-expire cleanly"
```
