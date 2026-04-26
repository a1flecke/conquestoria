# MR 8 — Per-Era Spy Types + Universal Unit Upgrade System

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** All obsolete units (including spy units) can be upgraded to the current era's equivalent at half cost in a home city. Obsolete embedded/infiltrated/on-mission spy units auto-expire cleanly with a notification.

**Prerequisite MRs:** MR 1–7 (spy unit types and obsolescence fields already in place from MR 1)

**Cost model:** Upgrades cost gold (half the target unit's production cost from `TRAINABLE_UNITS`). The codebase has no per-civ floating production stockpile — `civ.gold` is the correct deduction target. The button label says "gold", not "prod".

---

## Task 11: Unit Upgrade System (all unit types)

**User value:** Obsolete units can be upgraded to the next era equivalent at half gold cost when standing on a home city tile. The unit consumes its action for the turn and heals to full health on upgrade.

**Files:**
- Create: `src/systems/unit-upgrade-system.ts`
- Modify: `src/ui/selected-unit-info.ts`
- Modify: `src/ui/city-panel.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/unit-upgrade.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/systems/unit-upgrade.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canUpgradeUnit, getUpgradeCost, applyUpgrade } from '@/systems/unit-upgrade-system';
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
    expect(cost).toBe(25); // spy_informant costs 50 in TRAINABLE_UNITS, half = 25
  });
});

describe('applyUpgrade', () => {
  it('changes unit type, heals to full health, and consumes action', () => {
    const unit = makeUnit('spy_scout');
    const upgraded = applyUpgrade(unit, 'spy_informant');
    expect(upgraded.type).toBe('spy_informant');
    expect(upgraded.health).toBe(100);
    expect(upgraded.hasActed).toBe(true);
    expect(upgraded.movementPointsLeft).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
scripts/run-with-mise.sh yarn test tests/systems/unit-upgrade.test.ts
```

- [ ] **Step 3: Create `src/systems/unit-upgrade-system.ts`**

```typescript
import type { Unit, UnitType, City } from '@/core/types';
import { TRAINABLE_UNITS } from './city-system';
import { UNIT_DEFINITIONS } from './unit-system';

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
  // Find next unit in this upgrade chain: requires the same tech that obsoleted us,
  // and is not itself already obsoleted by a further tech.
  const nextEntry = TRAINABLE_UNITS.find(u =>
    u.techRequired === currentEntry.obsoletedByTech &&
    (!u.obsoletedByTech || !completedTechs.includes(u.obsoletedByTech))
  );
  if (!nextEntry) return { canUpgrade: false, targetType: null, cost: 0 };
  return { canUpgrade: true, targetType: nextEntry.type, cost: getUpgradeCost(nextEntry.type) };
}

// Returns a new Unit with the upgraded type, full health, and action consumed.
// Caller is responsible for deducting civ.gold by getUpgradeCost(targetType).
export function applyUpgrade(unit: Unit, targetType: UnitType): Unit {
  return {
    ...unit,
    type: targetType,
    health: 100,
    movementPointsLeft: 0,
    hasActed: true,
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
scripts/run-with-mise.sh yarn test tests/systems/unit-upgrade.test.ts
```

- [ ] **Step 5: Add upgrade button to `src/ui/selected-unit-info.ts`**

**5a — Interface change:** Add `onUpgradeUnit?: (unitId: string, cityId: string) => void` to `SelectedUnitInfoCallbacks`.

**5b — Add import:** At the top of `selected-unit-info.ts`, add:

```typescript
import { canUpgradeUnit } from '@/systems/unit-upgrade-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system'; // already imported — no change needed
```

`UNIT_DEFINITIONS` is already imported. Only add the `canUpgradeUnit` import.

**5c — Render upgrade button:** After the embed block (near end of `renderSelectedUnitInfo`, before `actionsDiv` is appended to wrapper), add:

```typescript
// Upgrade button — only when unit is on an owned city tile and upgrade is available
if (callbacks.onUpgradeUnit) {
  // Find the home city this unit is standing on
  const homeCity = Object.values(state.cities).find(
    c => c.owner === unit.owner &&
         c.position.q === unit.position.q &&
         c.position.r === unit.position.r,
  );
  if (homeCity) {
    const completedTechs = state.civilizations[unit.owner]?.techState?.completed ?? [];
    const upgrade = canUpgradeUnit(unit, homeCity.id, state.cities, completedTechs);
    if (upgrade.canUpgrade && upgrade.targetType) {
      const targetName = UNIT_DEFINITIONS[upgrade.targetType].name;
      const btn = makeButton(
        `Upgrade → ${targetName} (${upgrade.cost} gold)`,
        '#7c3aed',
        () => callbacks.onUpgradeUnit!(unitId, homeCity.id),
      );
      actionsDiv.appendChild(btn);
    }
  }
}
```

- [ ] **Step 6: Wire `onUpgradeUnit` in `src/main.ts`**

In `main.ts`, inside the `renderSelectedUnitInfo` call (around line 995), add `onUpgradeUnit` to the callbacks object:

```typescript
onUpgradeUnit: (uid, cityId) => {
  const unit = gameState.units[uid];
  if (!unit || unit.owner !== gameState.currentPlayer) return;
  const civ = gameState.civilizations[gameState.currentPlayer];
  const completedTechs = civ?.techState?.completed ?? [];
  const upgrade = canUpgradeUnit(unit, cityId, gameState.cities, completedTechs);
  if (!upgrade.canUpgrade || !upgrade.targetType) return;
  if (civ.gold < upgrade.cost) {
    showNotification('Not enough gold to upgrade!', 'warning');
    return;
  }
  gameState.civilizations[gameState.currentPlayer] = { ...civ, gold: civ.gold - upgrade.cost };
  gameState.units[uid] = applyUpgrade(unit, upgrade.targetType);
  renderLoop.setGameState(gameState);
  updateHUD();
  selectUnit(uid);
  const targetName = UNIT_DEFINITIONS[upgrade.targetType].name;
  showNotification(`Upgraded to ${targetName}!`, 'success');
},
```

Add the required imports to the top of `main.ts` (they may already be partially imported — only add what's missing):

```typescript
import { canUpgradeUnit, applyUpgrade } from '@/systems/unit-upgrade-system';
```

`UNIT_DEFINITIONS` is already imported in main.ts via the existing unit-system imports — verify with `grep UNIT_DEFINITIONS src/main.ts`. If not present, add it.

- [ ] **Step 7: Add upgrade section to `src/ui/city-panel.ts`**

**7a — Interface change:** Add `onUpgradeUnit?: (unitId: string) => void` to `CityPanelCallbacks`.

**7b — Add imports at top of `city-panel.ts`:**

```typescript
import { canUpgradeUnit, getUpgradeCost } from '@/systems/unit-upgrade-system';
import { UNIT_DEFINITIONS } from '@/systems/unit-system';
```

**7c — Build upgrade section using DOM API** (not innerHTML, per XSS rules). Add this block after the `container.appendChild(panel)` call (around line 228) and before the `rerenderPanel` definition:

```typescript
// Upgradeable units section — units standing on this city that can be upgraded
const completedTechs = state.civilizations[state.currentPlayer]?.techState?.completed ?? [];
const upgradeableUnits = Object.values(state.units).filter(u =>
  u.owner === city.owner &&
  u.position.q === city.position.q &&
  u.position.r === city.position.r &&
  canUpgradeUnit(u, city.id, state.cities, completedTechs).canUpgrade,
);

if (upgradeableUnits.length > 0 && callbacks.onUpgradeUnit) {
  const upgradeSection = document.createElement('div');
  upgradeSection.style.cssText = 'margin-top:16px;';

  const header = document.createElement('div');
  header.style.cssText = 'font-size:12px;font-weight:bold;color:#a78bfa;margin-bottom:8px;';
  header.textContent = 'Upgradeable Units';
  upgradeSection.appendChild(header);

  for (const u of upgradeableUnits) {
    const upgrade = canUpgradeUnit(u, city.id, state.cities, completedTechs);
    if (!upgrade.canUpgrade || !upgrade.targetType) continue;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;justify-content:space-between;align-items:center;background:rgba(255,255,255,0.06);border-radius:8px;padding:8px;margin-bottom:6px;';

    const info = document.createElement('span');
    info.style.cssText = 'font-size:12px;';
    const currentName = UNIT_DEFINITIONS[u.type]?.name ?? u.type;
    const targetName = UNIT_DEFINITIONS[upgrade.targetType].name;
    info.textContent = `${currentName} → ${targetName} (${upgrade.cost} gold)`;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.textContent = 'Upgrade';
    btn.style.cssText = 'padding:4px 10px;border-radius:6px;background:#7c3aed;border:none;color:white;cursor:pointer;font-size:11px;';
    btn.addEventListener('click', () => callbacks.onUpgradeUnit!(u.id));

    row.appendChild(info);
    row.appendChild(btn);
    upgradeSection.appendChild(row);
  }

  // Insert before the close/nav buttons by appending to the list view
  const listViewEl = panel.querySelector('#city-list-view');
  listViewEl ? listViewEl.appendChild(upgradeSection) : panel.appendChild(upgradeSection);
}
```

**7d — Wire `onUpgradeUnit` in `main.ts`** where `createCityPanel` is called. Add to the callbacks object:

```typescript
onUpgradeUnit: (unitId) => {
  const unit = gameState.units[unitId];
  if (!unit || unit.owner !== gameState.currentPlayer) return;
  const civ = gameState.civilizations[gameState.currentPlayer];
  const completedTechs = civ?.techState?.completed ?? [];
  // Find the city the unit is on (the panel already knows which city, but we derive it cleanly)
  const homeCity = Object.values(gameState.cities).find(
    c => c.owner === unit.owner &&
         c.position.q === unit.position.q &&
         c.position.r === unit.position.r,
  );
  if (!homeCity) return;
  const upgrade = canUpgradeUnit(unit, homeCity.id, gameState.cities, completedTechs);
  if (!upgrade.canUpgrade || !upgrade.targetType) return;
  if (civ.gold < upgrade.cost) {
    showNotification('Not enough gold to upgrade!', 'warning');
    return;
  }
  gameState.civilizations[gameState.currentPlayer] = { ...civ, gold: civ.gold - upgrade.cost };
  gameState.units[unitId] = applyUpgrade(unit, upgrade.targetType);
  renderLoop.setGameState(gameState);
  updateHUD();
  showNotification(`Upgraded to ${UNIT_DEFINITIONS[upgrade.targetType].name}!`, 'success');
},
```

- [ ] **Step 8: Run full test suite**

```bash
scripts/run-with-mise.sh yarn test
```

- [ ] **Step 9: Commit**

```bash
git add src/systems/unit-upgrade-system.ts src/ui/city-panel.ts src/ui/selected-unit-info.ts src/main.ts tests/systems/unit-upgrade.test.ts
git commit -m "feat(espionage): unit upgrade system — obsolete units upgradeable at half gold cost in home city"
```

---

## Task 12: Obsolescence Notifications

**Files:**
- Modify: `src/core/turn-manager.ts`
- Modify: `src/core/types.ts`
- Modify: `src/main.ts`
- Modify: `tests/systems/unit-upgrade.test.ts`

- [ ] **Step 1: Write failing tests**

Add to `tests/systems/unit-upgrade.test.ts`:

```typescript
import { EventBus } from '@/core/event-bus';
import { processTurn } from '@/core/turn-manager';
import type { GameState, Spy } from '@/core/types';

// Minimal GameState for obsolescence tests. processTurn requires a valid civilizations map,
// a map with tiles, and the standard espionage shape.
function makeObsolescenceState(overrides: {
  unitOnMap?: boolean;
  spyStatus?: 'embedded' | 'stationed' | 'on_mission';
} = {}): GameState {
  const civId = 'player';
  // Spy_scout is obsoleted by 'espionage-informants'. Set research so tech completes this turn.
  const spy: Spy = {
    id: 'spy1',
    name: 'Agent Fox',
    owner: civId,
    unitType: 'spy_scout',
    status: overrides.spyStatus ?? 'embedded',
    experience: 0,
    cooldownTurns: 0,
    infiltrationCityId: overrides.spyStatus === 'stationed' ? 'enemy-city' : undefined,
    missionHistory: [],
    promotions: [],
  };
  return {
    turn: 1,
    currentPlayer: civId,
    map: { tiles: {}, width: 1, height: 1 },
    cities: {},
    units: overrides.unitOnMap
      ? { u1: { id: 'u1', type: 'spy_scout', owner: civId, position: { q: 0, r: 0 }, health: 100, movementPointsLeft: 2, hasActed: false, hasMoved: false } }
      : {},
    civilizations: {
      [civId]: {
        id: civId, name: 'Player', color: '#fff', civType: 'default',
        gold: 0, goldPerTurn: 0,
        units: overrides.unitOnMap ? ['u1'] : [],
        cities: [],
        techState: {
          completed: ['espionage-scouting'],
          currentResearch: 'espionage-informants',
          researchProgress: 9999, // will complete this turn
          queue: [],
        },
        diplomacy: { relationships: {}, atWarWith: [], treaties: [], vassalage: { overlord: null, vassals: [] } },
        visibility: { tiles: {} },
      },
    },
    espionage: {
      [civId]: {
        maxSpies: 2,
        spies: { spy1: spy },
        counterIntelligence: {},
      },
    },
  } as unknown as GameState;
}

describe('obsolescence notifications', () => {
  it('emits unit:obsolete for map spy_scout units when espionage-informants completes', () => {
    const state = makeObsolescenceState({ unitOnMap: true });
    const bus = new EventBus();
    const events: unknown[] = [];
    bus.on('unit:obsolete', e => events.push(e));
    processTurn(state, bus);
    expect(events.length).toBeGreaterThan(0);
  });

  it('silently removes embedded spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ spyStatus: 'embedded' });
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });

  it('silently removes stationed spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ spyStatus: 'stationed' });
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });

  it('silently removes on_mission spy_scout when espionage-informants completes', () => {
    const state = makeObsolescenceState({ spyStatus: 'on_mission' });
    const bus = new EventBus();
    const next = processTurn(state, bus);
    const spies = Object.values(next.espionage?.['player']?.spies ?? {});
    expect(spies.filter(s => s.unitType === 'spy_scout')).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run to verify failure**

```bash
scripts/run-with-mise.sh yarn test tests/systems/unit-upgrade.test.ts
```

- [ ] **Step 3: Add new event types to `src/core/types.ts`**

Locate the espionage events in `GameEventMap` (around line 1039–1042, near `'espionage:spy-promoted'`). Add:

```typescript
'unit:obsolete': { civId: string; unitId: string; unitType: UnitType };
'espionage:spy-expired': { civId: string; spyId: string; spyName: string; unitType: UnitType };
```

- [ ] **Step 4: Add inline obsolescence scan to `src/core/turn-manager.ts`**

**Do NOT use `bus.on('tech:completed', ...)` inside `processTurn` — registering a listener inside a function that also emits that event causes a new subscription on every turn call.**

Instead, add a synchronous inline block immediately after the existing `bus.emit('tech:completed', ...)` at line 152. The full block (with surrounding context) looks like:

```typescript
if (researchResult.completedTech) {
  const techId = researchResult.completedTech;
  bus.emit('tech:completed', { civId, techId });

  // Inline obsolescence scan — runs once per completed tech, no bus listener needed
  const obsoletedTypes = TRAINABLE_UNITS
    .filter(u => u.obsoletedByTech === techId)
    .map(u => u.type);

  if (obsoletedTypes.length > 0) {
    // Map units owned by this civ
    for (const [unitId, unit] of Object.entries(newState.units)) {
      if (unit.owner !== civId) continue;
      if (!obsoletedTypes.includes(unit.type as any)) continue;
      bus.emit('unit:obsolete', { civId, unitId, unitType: unit.type as any });
    }

    // Off-map spy records: embedded, stationed, or on_mission
    const civEsp = newState.espionage?.[civId];
    if (civEsp) {
      for (const [spyId, spy] of Object.entries(civEsp.spies)) {
        if (!obsoletedTypes.includes(spy.unitType as any)) continue;
        if (spy.status !== 'embedded' && spy.status !== 'stationed' && spy.status !== 'on_mission') continue;
        const { [spyId]: _removed, ...remainingSpies } = newState.espionage![civId].spies;
        newState.espionage![civId] = { ...newState.espionage![civId], spies: remainingSpies };
        bus.emit('espionage:spy-expired', { civId, spyId, spyName: spy.name, unitType: spy.unitType });
      }
    }
  }
}
```

Also add `TRAINABLE_UNITS` to the imports at the top of `turn-manager.ts` if not already present:

```typescript
import { TRAINABLE_UNITS } from '@/systems/city-system';
```

Verify with `grep "TRAINABLE_UNITS" src/core/turn-manager.ts` first.

- [ ] **Step 5: Wire notification in `src/main.ts`**

Add a new `bus.on` handler near the other espionage handlers (around line 2114):

```typescript
bus.on('espionage:spy-expired', ({ civId, spyName, unitType }) => {
  if (civId === gameState.currentPlayer) {
    showNotification(`${spyName}'s network dissolved — ${unitType} era ended. No diplomatic penalty.`, 'info');
  }
});
```

- [ ] **Step 6: Run full test suite**

```bash
scripts/run-with-mise.sh yarn test
```

- [ ] **Step 7: Commit**

```bash
git add src/core/turn-manager.ts src/core/types.ts src/main.ts tests/systems/unit-upgrade.test.ts
git commit -m "feat(espionage): obsolescence notifications — unit:obsolete event; off-map spies auto-expire on era tech"
```
