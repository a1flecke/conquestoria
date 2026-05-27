# Resource Accessibility MR 2b — Expedition Unit

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Expedition unit — a civilian explorer that can travel mountains/hills at full speed and plant Resource Outposts on distant resource tiles, immediately consuming itself. AI civs train and use Expeditions. All six end-to-end wirings required by `.claude/rules/end-to-end-wiring.md` are included.

**Architecture:** `'expedition'` is added to the `UnitType` union and wired into all six mandatory endpoints: `UNIT_DEFINITIONS`/`UNIT_DESCRIPTIONS`, `UNIT_SPRITE_CATALOG`/`UNIT_MOTION_STYLES`/`FALLBACK_ICONS`, `TRAINABLE_UNITS`/`PRODUCTION_ICONS`, `performEstablishOutpost` shared helper (actor-complete: used by both human and AI), selected-unit-info panel action, and AI training + use. The Expedition has no associated GameState record beyond the `Unit` itself, so no death-cleanup is needed.

**Depends on:** MR 2a (`'resource_outpost'` type + `getCivAvailableResources` outpost pass must exist).

**Tech Stack:** TypeScript, vitest, sprite-catalog (JSX runtime).

---

## Files

- Modify: `src/core/types.ts:268–275,283–296` — add `'expedition'` to `UnitType`; add `terrainCostOverrides` to `UnitDefinition`
- Modify: `src/systems/unit-system.ts:11,300–315` — add expedition to `UNIT_DEFINITIONS`/`UNIT_DESCRIPTIONS`; update `getMovementCostForUnit` to honour overrides
- Modify: `src/systems/city-system.ts:214,330` — add expedition to `TRAINABLE_UNITS` and `PRODUCTION_ICONS`
- Modify: `src/renderer/unit-visual-resolver.ts:7` — add expedition to `FALLBACK_ICONS`
- Modify: `src/renderer/sprites/sprite-catalog.ts:30,90` — add expedition to `UNIT_MOTION_STYLES` and `UNIT_SPRITE_CATALOG`
- Modify: `src/systems/resource-acquisition-system.ts` — add `canEstablishOutpost` and `performEstablishOutpost`
- Modify: `src/ui/selected-unit-info.ts:21–38,80` — add `onEstablishOutpost` callback and button
- Modify: `src/main.ts` — wire `onEstablishOutpost`
- Modify: `src/ai/basic-ai.ts` — add AI training and outpost action
- Modify: `tests/systems/unit-system.test.ts` — expedition definition test + movement cost test
- Modify: `tests/systems/city-system.test.ts` — expedition trainability + icon tests
- Modify: `tests/systems/resource-acquisition-system.test.ts` — `performEstablishOutpost` tests
- Modify: `tests/ui/selected-unit-info.test.ts` — action button test
- Modify: `tests/ai/basic-ai.test.ts` — AI expedition training test

> **Terrain movement note:** Current system has `mountain: Infinity` (impassable for all land units) and `hills: 2`. The spec says Expedition crosses hills AND mountains at full speed (cost 1). Task 1 wires `terrainCostOverrides` into `UnitDefinition` and `getMovementCostForUnit`/`getMovementBlockerReason` to enable this. Without this change the Expedition cannot enter mountain tiles, breaking the spec's core value proposition.

---

### Task 1: Add `'expedition'` to the type system (6 wiring endpoints)

All 6 must land in the same PR. The sprite catalog test will fail at build time if any are missing.

**Files:**
- `src/core/types.ts`
- `src/systems/unit-system.ts`
- `src/systems/city-system.ts`
- `src/renderer/unit-visual-resolver.ts`
- `src/renderer/sprites/sprite-catalog.ts`

- [ ] **Step 1: Add `'expedition'` to `UnitType` in `types.ts`**

Current `UnitType` (line 268):
```typescript
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'axeman' | 'spearman' | 'horseman' | 'cavalry' | 'knight'
  | 'crossbowman' | 'catapult' | 'ballista'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound' | 'shadow_warden' | 'war_hound'
  | 'caravan';
```

Add `| 'expedition'` at the end:
```typescript
export type UnitType =
  | 'settler' | 'worker' | 'scout' | 'warrior' | 'archer'
  | 'swordsman' | 'pikeman' | 'musketeer' | 'galley' | 'trireme'
  | 'axeman' | 'spearman' | 'horseman' | 'cavalry' | 'knight'
  | 'crossbowman' | 'catapult' | 'ballista'
  | 'spy_scout' | 'spy_informant' | 'spy_agent' | 'spy_operative' | 'spy_hacker'
  | 'scout_hound' | 'shadow_warden' | 'war_hound'
  | 'caravan'
  | 'expedition';
```

- [ ] **Step 2a: Add `terrainCostOverrides` to `UnitDefinition` in `types.ts`**

In `src/core/types.ts`, inside `UnitDefinition` (line 283), add the optional field:
```typescript
export interface UnitDefinition {
  type: UnitType;
  name: string;
  movementPoints: number;
  visionRange: number;
  strength: number;
  canFoundCity: boolean;
  canBuildImprovements: boolean;
  productionCost: number;
  domain?: 'land' | 'naval';
  spyDetectionChance?: number;
  attackProfile?: UnitAttackProfile;
  /**
   * Per-terrain movement cost overrides. If a terrain key appears here, this
   * unit uses that cost instead of the global default. Use 1 to make normally-
   * slow terrain cost 1, or 0.5 to halve cost. Set to 1 for 'mountain' to make
   * mountains passable by this unit.
   */
  terrainCostOverrides?: Partial<Record<string, number>>;
}
```

- [ ] **Step 2b: Update `getMovementCostForUnit` in `unit-system.ts` to honour overrides**

Current (line 310):
```typescript
export function getMovementCostForUnit(terrain: string, domain: 'land' | 'naval'): number {
  if (domain === 'naval') {
    return (terrain === 'ocean' || terrain === 'coast') ? 1 : Infinity;
  }
  return getMovementCost(terrain);
}
```

Replace with a version that accepts an optional override map:
```typescript
export function getMovementCostForUnit(
  terrain: string,
  domain: 'land' | 'naval',
  terrainCostOverrides?: Partial<Record<string, number>>,
): number {
  if (domain === 'naval') {
    return (terrain === 'ocean' || terrain === 'coast') ? 1 : Infinity;
  }
  if (terrainCostOverrides && terrain in terrainCostOverrides) {
    return terrainCostOverrides[terrain]!;
  }
  return getMovementCost(terrain);
}
```

Update the call site in `unit-movement-system.ts` (line 99, 104) to pass the unit's overrides:
```typescript
// In unit-movement-system.ts, when computing path cost, pass the unit's overrides:
const def = UNIT_DEFINITIONS[unit.type];
cost += tile ? getMovementCostForUnit(tile.terrain, domain, def?.terrainCostOverrides) : 1;
```

Also update `getMovementBlockerReason` in `unit-system.ts` (line 333): the mountain impassability check uses `isPassableForUnit` which calls `getMovementCostForUnit`. Update `isPassableForUnit` to also accept overrides:
```typescript
function isPassableForUnit(
  terrain: string,
  domain: 'land' | 'naval',
  terrainCostOverrides?: Partial<Record<string, number>>,
): boolean {
  return getMovementCostForUnit(terrain, domain, terrainCostOverrides) < Infinity;
}
```

And pass overrides through `getMovementBlockerReason`:
```typescript
export function getMovementBlockerReason(
  unit: Unit,
  to: HexCoord,
  map: GameMap,
  options: { visibilityState?: VisibilityState } = {},
): MovementBlockerReason | null {
  // ...
  const domain = UNIT_DEFINITIONS[unit.type]?.domain ?? 'land';
  const overrides = UNIT_DEFINITIONS[unit.type]?.terrainCostOverrides;
  if (!isPassableForUnit(tile.terrain, domain, overrides)) {
    // ...
  }
  // ...
}
```

- [ ] **Step 2c: Add expedition to `UNIT_DEFINITIONS` in `unit-system.ts`**

`UNIT_DEFINITIONS` is a `Record<UnitType, UnitDefinition>` — TypeScript will error until `expedition` is added. The existing `caravan` entry is at lines 153–158. Add after it:

```typescript
  expedition: {
    type: 'expedition',
    name: 'Expedition',
    movementPoints: 3,
    visionRange: 2,
    strength: 0,            // non-combat: any enemy on its tile destroys it
    canFoundCity: false,
    canBuildImprovements: false,
    productionCost: 18,
    domain: 'land',
    // Expedition crosses hills and mountains at full movement speed
    terrainCostOverrides: { hills: 1, mountain: 1 },
  },
```

- [ ] **Step 2d: Write and run a movement cost test**

In `tests/systems/unit-system.test.ts`, add:
```typescript
describe('Expedition terrain movement', () => {
  it('has movement cost 1 on hills (override)', () => {
    const def = UNIT_DEFINITIONS['expedition'];
    const cost = getMovementCostForUnit('hills', 'land', def.terrainCostOverrides);
    expect(cost).toBe(1);
  });

  it('can enter mountains (cost 1, not Infinity)', () => {
    const def = UNIT_DEFINITIONS['expedition'];
    const cost = getMovementCostForUnit('mountain', 'land', def.terrainCostOverrides);
    expect(cost).toBe(1);
    expect(cost).not.toBe(Infinity);
  });

  it('warriors still cannot enter mountains', () => {
    const def = UNIT_DEFINITIONS['warrior'];
    const cost = getMovementCostForUnit('mountain', 'land', def.terrainCostOverrides);
    expect(cost).toBe(Infinity);
  });
});
```

Run:
```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/unit-system.test.ts 2>&1 | grep -E "PASS|FAIL|terrain movement"
```
Expected: All 3 pass.

- [ ] **Step 3: Add expedition to `UNIT_DESCRIPTIONS` in `unit-system.ts`**

`UNIT_DESCRIPTIONS` is a `Record<UnitType, string>` at line 257. Add after the caravan entry:

```typescript
  expedition: 'Civilian explorer. Crosses hills and mountains at full speed. '
            + 'When standing on a resource tile (outside city territory), use '
            + '"Establish Outpost" to plant a flag — the unit is consumed '
            + 'immediately and the outpost completes in 2 turns, granting the '
            + 'resource and charging 2 gold/turn upkeep. Requires Foraging tech.',
```

- [ ] **Step 4: Add expedition to `TRAINABLE_UNITS` and `PRODUCTION_ICONS` in `city-system.ts`**

In `TRAINABLE_UNITS` (around line 244, after the caravan entry), add:
```typescript
  // Resource Accessibility — exploration unit
  { type: 'expedition', name: 'Expedition', cost: 18, techRequired: 'foraging' },
```

In `PRODUCTION_ICONS` (around line 394, after `caravan`), add:
```typescript
  expedition: '🧭',
```

- [ ] **Step 5: Add expedition to `FALLBACK_ICONS` in `unit-visual-resolver.ts`**

After the `caravan` entry (line 36):
```typescript
  expedition: '🧭',  // compass; dedicated SVG sprite TBD via Claude Design
```

- [ ] **Step 6: Add expedition to `UNIT_MOTION_STYLES` and `UNIT_SPRITE_CATALOG` in `sprite-catalog.ts`**

In `UNIT_MOTION_STYLES` (line 30), add after `caravan: 'humanoid'`:
```typescript
  expedition: 'humanoid',
```

In `UNIT_SPRITE_CATALOG` (line 117), add after `caravan`:
```typescript
  expedition: withMotion('expedition', ScoutSprite), // uses explorer fallback; dedicated sprite TBD via Claude Design
```

- [ ] **Step 7: Build — must succeed**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: Build succeeds. If the sprite catalog test is wired into build, it will also pass.

- [ ] **Step 8: Run unit and city system tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/unit-system.test.ts tests/systems/city-system.test.ts tests/renderer/sprites/sprite-catalog.test.ts 2>&1 | tail -15
```
Expected: All pass. In particular, the `'expedition'` in `UnitType` union test, `PRODUCTION_ICONS['expedition']` coverage test, and sprite-catalog exhaustive coverage test must all pass.

- [ ] **Step 9: Commit**

```bash
git add src/core/types.ts src/systems/unit-system.ts src/systems/unit-movement-system.ts \
        src/systems/city-system.ts src/renderer/unit-visual-resolver.ts \
        src/renderer/sprites/sprite-catalog.ts tests/systems/unit-system.test.ts
git commit -m "feat(expedition): expedition UnitType — all 6 wirings + hills/mountain terrain override"
```

---

### Task 2: Write failing tests for `performEstablishOutpost`

**Files:**
- Modify: `tests/systems/resource-acquisition-system.test.ts`

- [ ] **Step 1: Add the test suite**

Add a new describe block in `tests/systems/resource-acquisition-system.test.ts`:

```typescript
import { canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';

describe('performEstablishOutpost', () => {
  function makeStateWithExpedition(opts: {
    resource: string | null;
    improvement: string;
    tileInCityTerritory: boolean;
    civTechs: string[];
  }): { state: GameState; unitId: string } {
    const state = createMinimalGameState();
    const civId = 'player';
    const pos = { q: 5, r: 5 };
    const tileKey = hexKey(pos);

    // Place resource tile
    state.map.tiles[tileKey] = {
      coord: pos,
      terrain: 'hills',
      elevation: 'flat',
      resource: opts.resource,
      improvement: opts.improvement as ImprovementType,
      improvementTurnsLeft: 0,
      owner: opts.tileInCityTerritory ? civId : null,
      hasRiver: false,
      wonder: null,
    };

    if (opts.tileInCityTerritory) {
      const cityId = state.civilizations[civId].cities[0];
      if (state.cities[cityId]) {
        state.cities[cityId].ownedTiles.push(pos);
      }
    }

    state.civilizations[civId].techState.completed = opts.civTechs;

    // Add expedition unit on the tile
    const unitId = 'unit-test-expedition';
    state.units[unitId] = {
      id: unitId,
      type: 'expedition',
      owner: civId,
      position: { ...pos },
      movementPointsLeft: 3,
      health: 100,
      experience: 0,
      hasMoved: false,
      hasActed: false,
      isResting: false,
    };

    return { state, unitId };
  }

  it('sets tile.improvement = resource_outpost, improvementTurnsLeft = 2, owner = civId; removes unit', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['bronze-working'],
    });
    const newState = performEstablishOutpost(state, unitId);
    const tile = newState.map.tiles[hexKey({ q: 5, r: 5 })];
    expect(tile.improvement).toBe('resource_outpost');
    expect(tile.improvementTurnsLeft).toBe(2);
    expect(tile.owner).toBe('player');
    expect(newState.units[unitId]).toBeUndefined(); // unit consumed
  });

  it('is unavailable when tile is already in civ city territory (canEstablishOutpost = false)', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: true,
      civTechs: ['bronze-working'],
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('is unavailable when tile has no resource', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: null,
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['foraging'],
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('is unavailable when civ lacks the enabling tech', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',        // iron requires 'bronze-working'
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: [],            // no techs researched
    });
    expect(canEstablishOutpost(state, unitId)).toBe(false);
  });

  it('returns a new state object (immutability)', () => {
    const { state, unitId } = makeStateWithExpedition({
      resource: 'iron',
      improvement: 'none',
      tileInCityTerritory: false,
      civTechs: ['bronze-working'],
    });
    const newState = performEstablishOutpost(state, unitId);
    expect(newState).not.toBe(state);
  });
});
```

- [ ] **Step 2: Run to confirm failure**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | grep -E "FAIL|performEstablishOutpost|canEstablishOutpost"
```
Expected: Tests fail — functions not yet exported.

---

### Task 3: Implement `canEstablishOutpost` and `performEstablishOutpost`

**Files:**
- Modify: `src/systems/resource-acquisition-system.ts`

- [ ] **Step 1: Add imports**

At the top of `resource-acquisition-system.ts`, add `hexKey` if not already imported, and import `RESOURCE_DEFINITIONS` if not imported:

```typescript
import type { GameState, ResourceType } from '@/core/types';
import { hexKey } from './hex-utils';
import { RESOURCE_DEFINITIONS } from './trade-system';
```

- [ ] **Step 2: Add `canEstablishOutpost`**

After `getCivAvailableResources`, add:

```typescript
/**
 * Returns true when an Expedition unit can use "Establish Outpost" at its
 * current position. All four conditions from the spec must be met:
 *   1. Unit is an Expedition.
 *   2. Tile has a resource.
 *   3. Civ has researched the tech that enables that resource.
 *   4. Tile's improvement is 'none' (not already improved or outposted).
 *   5. Tile is NOT in this civ's city territory (worker path applies there).
 */
export function canEstablishOutpost(state: GameState, unitId: string): boolean {
  const unit = state.units[unitId];
  if (!unit || unit.type !== 'expedition') return false;

  const tileKey = hexKey(unit.position);
  const tile = state.map.tiles[tileKey];
  if (!tile || !tile.resource || tile.improvement !== 'none') return false;

  const civ = state.civilizations[unit.owner];
  if (!civ) return false;

  const def = RESOURCE_DEFINITIONS.find(d => d.id === tile.resource);
  if (!def || !civ.techState.completed.includes(def.tech)) return false;

  // Check tile is not in any of this civ's city territory
  for (const cityId of civ.cities) {
    const city = state.cities[cityId];
    if (!city) continue;
    if (city.ownedTiles.some(coord => hexKey(coord) === tileKey)) return false;
  }

  return true;
}

/**
 * Shared actor-complete helper: establishes a Resource Outpost on the tile
 * the Expedition stands on, and immediately removes the Expedition unit.
 * Called by both the human-player action and the AI.
 *
 * Precondition: canEstablishOutpost(state, unitId) === true.
 * Returns a new GameState (immutable spread-copy).
 */
export function performEstablishOutpost(state: GameState, unitId: string): GameState {
  const unit = state.units[unitId];
  if (!unit) return state;

  const tileKey = hexKey(unit.position);
  const existingTile = state.map.tiles[tileKey];
  if (!existingTile) return state;

  const civId = unit.owner;

  // Spread-copy the tile with outpost data
  const updatedTile = {
    ...existingTile,
    improvement: 'resource_outpost' as const,
    improvementTurnsLeft: 2,
    improvementOwner: civId,
    owner: civId,
  };

  // Remove unit from state.units
  const { [unitId]: _removed, ...remainingUnits } = state.units;

  return {
    ...state,
    units: remainingUnits,
    map: {
      ...state.map,
      tiles: {
        ...state.map.tiles,
        [tileKey]: updatedTile,
      },
    },
  };
}
```

- [ ] **Step 3: Run the performEstablishOutpost tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/systems/resource-acquisition-system.test.ts 2>&1 | tail -15
```
Expected: All performEstablishOutpost tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/systems/resource-acquisition-system.ts tests/systems/resource-acquisition-system.test.ts
git commit -m "feat(expedition): canEstablishOutpost + performEstablishOutpost shared helper"
```

---

### Task 4: Wire "Establish Outpost" action in selected-unit-info and main.ts

**Files:**
- Modify: `src/ui/selected-unit-info.ts:21–38`
- Modify: `src/main.ts` (~line 1419 where `onEstablishRoute` is wired)

- [ ] **Step 1: Add `onEstablishOutpost` to `SelectedUnitInfoCallbacks`**

In `src/ui/selected-unit-info.ts`, inside the `SelectedUnitInfoCallbacks` interface, add after `onEstablishRoute`:

```typescript
  onEstablishOutpost?: (unitId: string) => void;
```

- [ ] **Step 2: Add the button rendering logic**

In `renderSelectedUnitInfo`, import `canEstablishOutpost`:

```typescript
import { canEstablishOutpost } from '@/systems/resource-acquisition-system';
```

Then, in the actions rendering section (where the "Rest", "Establish Route" buttons are built), add:

```typescript
  if (unit.type === 'expedition' && !unit.hasActed && callbacks.onEstablishOutpost) {
    if (canEstablishOutpost(state, unitId)) {
      const btn = makeButton('🚩 Establish Outpost', '#4a7c59');
      btn.title = 'Plant a Resource Outpost on this tile. Expedition is consumed immediately. Outpost completes in 2 turns.';
      btn.style.cssText += ';min-height:44px;width:100%;margin-top:6px;';
      btn.addEventListener('click', () => callbacks.onEstablishOutpost!(unitId));
      actionsDiv.appendChild(btn);
    }
  }
```

- [ ] **Step 3: Write a failing selected-unit-info test**

In `tests/ui/selected-unit-info.test.ts`, add:

```typescript
import { canEstablishOutpost } from '@/systems/resource-acquisition-system';

describe('Expedition — Establish Outpost action', () => {
  it('renders the Establish Outpost button when canEstablishOutpost is true', () => {
    const state = createMinimalGameState();
    const pos = { q: 3, r: 3 };
    const tileKey = hexKey(pos);

    // Set up eligible tile
    state.map.tiles[tileKey] = {
      coord: pos, terrain: 'hills', elevation: 'flat',
      resource: 'iron', improvement: 'none', improvementTurnsLeft: 0,
      owner: null, hasRiver: false, wonder: null,
    };
    state.civilizations['player'].techState.completed = ['bronze-working'];

    const unitId = 'u-expedition';
    state.units[unitId] = {
      id: unitId, type: 'expedition', owner: 'player', position: { ...pos },
      movementPointsLeft: 3, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };

    const container = document.createElement('div');
    let outpostCalled = false;
    renderSelectedUnitInfo(container, state, unitId, {
      onEstablishOutpost: () => { outpostCalled = true; },
    });

    const btn = container.querySelector('button') as HTMLButtonElement | null;
    expect(btn?.textContent).toContain('Establish Outpost');
    btn?.click();
    expect(outpostCalled).toBe(true);
  });

  it('does NOT render the button when the tile is in city territory', () => {
    const state = createMinimalGameState();
    const pos = { q: 3, r: 3 };
    const tileKey = hexKey(pos);

    state.map.tiles[tileKey] = {
      coord: pos, terrain: 'hills', elevation: 'flat',
      resource: 'iron', improvement: 'none', improvementTurnsLeft: 0,
      owner: 'player', hasRiver: false, wonder: null,
    };
    // Put tile in city territory
    const cityId = state.civilizations['player'].cities[0];
    state.cities[cityId].ownedTiles.push(pos);
    state.civilizations['player'].techState.completed = ['bronze-working'];

    const unitId = 'u-expedition-blocked';
    state.units[unitId] = {
      id: unitId, type: 'expedition', owner: 'player', position: { ...pos },
      movementPointsLeft: 3, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };

    const container = document.createElement('div');
    renderSelectedUnitInfo(container, state, unitId, {
      onEstablishOutpost: () => {},
    });

    const buttons = Array.from(container.querySelectorAll('button'));
    expect(buttons.some(b => b.textContent?.includes('Establish Outpost'))).toBe(false);
  });
});
```

Run to confirm failure:
```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/selected-unit-info.test.ts 2>&1 | grep -E "FAIL|Establish Outpost"
```

- [ ] **Step 4: Wire `onEstablishOutpost` in `main.ts`**

In `src/main.ts`, find where `renderSelectedUnitInfo` is called with its callbacks object (around line 1256). Add `onEstablishOutpost` to the callbacks:

```typescript
      onEstablishOutpost: (unitId) => {
        if (!canEstablishOutpost(gameState, unitId)) return;
        gameState = performEstablishOutpost(gameState, unitId);
        saveGame(gameState);
        selectedUnitId = null; // unit was consumed
        renderLoop.render(gameState);
        showNotification('Expedition planted a flag! Outpost completes in 2 turns.', 'success');
      },
```

Also add the imports in main.ts if not already present:
```typescript
import { canEstablishOutpost, performEstablishOutpost } from '@/systems/resource-acquisition-system';
```

- [ ] **Step 5: Run selected-unit-info tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ui/selected-unit-info.test.ts 2>&1 | grep -E "PASS|FAIL|Establish Outpost"
```
Expected: Both tests pass.

- [ ] **Step 6: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```
Expected: Succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/ui/selected-unit-info.ts src/main.ts tests/ui/selected-unit-info.test.ts
git commit -m "feat(expedition): Establish Outpost action in selected-unit-info panel"
```

---

### Task 5: AI parity — train and use Expeditions

**Files:**
- Modify: `src/ai/basic-ai.ts`
- Modify: `tests/ai/basic-ai.test.ts`

- [ ] **Step 1: Write a failing AI test**

In `tests/ai/basic-ai.test.ts`, add:

```typescript
describe('Expedition AI parity', () => {
  it('queues an Expedition when foraging tech researched and a far resource tile exists', () => {
    const state = createMinimalAiState({ civId: 'ai-1' });
    // Give AI foraging tech
    state.civilizations['ai-1'].techState.completed = ['foraging'];
    // Place a resource tile at hex distance > 2 from all cities (outside territory)
    state.map.tiles[hexKey({ q: 20, r: 20 })] = {
      coord: { q: 20, r: 20 }, terrain: 'forest', elevation: 'flat',
      resource: 'ivory', improvement: 'none', improvementTurnsLeft: 0,
      owner: null, hasRiver: false, wonder: null,
    };
    // No existing uncommitted expedition
    const aiCities = state.civilizations['ai-1'].cities;
    state.cities[aiCities[0]].productionQueue = [];

    const newState = runBasicAi(state, 'ai-1');

    const cityQueue = newState.cities[aiCities[0]].productionQueue;
    expect(cityQueue).toContain('expedition');
  });

  it('calls performEstablishOutpost when Expedition is adjacent to eligible resource tile', () => {
    const state = createMinimalAiState({ civId: 'ai-1' });
    state.civilizations['ai-1'].techState.completed = ['foraging', 'bronze-working'];

    const pos = { q: 20, r: 20 };
    const tileKey = hexKey(pos);
    state.map.tiles[tileKey] = {
      coord: pos, terrain: 'hills', elevation: 'flat',
      resource: 'iron', improvement: 'none', improvementTurnsLeft: 0,
      owner: null, hasRiver: false, wonder: null,
    };

    // Place expedition unit on the resource tile
    state.units['ai-exp-1'] = {
      id: 'ai-exp-1', type: 'expedition', owner: 'ai-1', position: { ...pos },
      movementPointsLeft: 3, health: 100, experience: 0,
      hasMoved: false, hasActed: false, isResting: false,
    };

    const newState = runBasicAi(state, 'ai-1');

    // Unit should be gone (consumed by outpost)
    expect(newState.units['ai-exp-1']).toBeUndefined();
    // Tile should have outpost
    expect(newState.map.tiles[tileKey].improvement).toBe('resource_outpost');
  });
});
```

Run to confirm failure:
```bash
bash scripts/run-with-mise.sh yarn test -- tests/ai/basic-ai.test.ts 2>&1 | grep -E "FAIL|Expedition AI"
```

- [ ] **Step 2: Implement AI training logic in `basic-ai.ts`**

Find the section where caravan training is handled (around line 536). After the caravan block, add an expedition training block:

```typescript
      // Train Expedition when: foraging tech, an unowned resource tile within
      // 8 hex distance exists, and civ has no uncommitted expedition unit.
      const hasForagingTech = civ.techState.completed.includes('foraging');
      const hasUncommittedExpedition = Object.values(newState.units).some(
        u => u.owner === civId && u.type === 'expedition' && !u.hasActed,
      );
      if (hasForagingTech && !hasUncommittedExpedition && trainableUnits.includes('expedition')) {
        const cityPos = state.cities[cityId]?.position;
        if (cityPos) {
          const hasNearbyResource = Object.values(newState.map.tiles).some(tile => {
            if (!tile.resource || tile.owner !== null) return false;
            const dist = map.wrapsHorizontally
              ? wrappedHexDistance(tile.coord, cityPos, map.width)
              : hexDistance(tile.coord, cityPos);
            return dist <= 8;
          });
          if (hasNearbyResource) {
            city.productionQueue = ['expedition'];
          }
        }
      }
```

- [ ] **Step 3: Implement AI Expedition use logic in `basic-ai.ts`**

After the caravan route-establishment block (around line 451), add:

```typescript
  // --- Handle expedition outpost establishment ---
  const idleExpeditions = civ.units
    .map(id => newState.units[id])
    .filter((u): u is Unit => !!u && u.type === 'expedition' && !u.hasActed && !u.hasMoved);

  for (const exp of idleExpeditions) {
    if (canEstablishOutpost(newState, exp.id)) {
      newState = performEstablishOutpost(newState, exp.id);
      continue; // unit consumed
    }
    // If not on an eligible tile, move toward the nearest unowned resource tile
    const nearest = findNearestResourceTile(newState, exp, civId);
    if (nearest) {
      // Move one step toward nearest (use existing AI movement helper if available)
      newState = moveUnitToward(newState, exp.id, nearest, bus);
    }
  }
```

You will need to implement `findNearestResourceTile` as a local helper:
```typescript
function findNearestResourceTile(
  state: GameState,
  unit: Unit,
  civId: string,
): HexCoord | null {
  const civ = state.civilizations[civId];
  if (!civ) return null;
  const completedTechs = new Set(civ.techState.completed);
  const resourceDefMap = new Map(RESOURCE_DEFINITIONS.map(d => [d.id, d]));

  let best: { coord: HexCoord; dist: number } | null = null;
  for (const tile of Object.values(state.map.tiles)) {
    if (!tile.resource || tile.owner !== null || tile.improvement !== 'none') continue;
    const def = resourceDefMap.get(tile.resource);
    if (!def || !completedTechs.has(def.tech)) continue;

    const dist = state.map.wrapsHorizontally
      ? wrappedHexDistance(tile.coord, unit.position, state.map.width)
      : hexDistance(tile.coord, unit.position);

    if (!best || dist < best.dist) best = { coord: tile.coord, dist };
  }
  return best?.coord ?? null;
}
```

- [ ] **Step 4: Run the AI tests**

```bash
bash scripts/run-with-mise.sh yarn test -- tests/ai/basic-ai.test.ts 2>&1 | grep -E "PASS|FAIL|Expedition AI"
```
Expected: Both AI expedition tests pass.

- [ ] **Step 5: Run full test suite**

```bash
bash scripts/run-with-mise.sh yarn test 2>&1 | tail -10
```
Expected: All tests pass.

- [ ] **Step 6: Build**

```bash
bash scripts/run-with-mise.sh yarn build 2>&1 | grep -E "error TS|built in"
```

- [ ] **Step 7: Commit**

```bash
git add src/ai/basic-ai.ts tests/ai/basic-ai.test.ts
git commit -m "feat(expedition): AI trains and uses Expedition units for resource outposts"
```
