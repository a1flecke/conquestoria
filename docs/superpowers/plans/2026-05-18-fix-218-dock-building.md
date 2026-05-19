# Fix #218: Dock Building (Fishing Tech Payoff) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Dock building (coastal cities only, requires `fishing` tech, +2 food +1 gold) so players have a meaningful city action after researching fishing, and fire a guidance notification when the tech completes.

**Architecture:** Four layers of change — types, system, sprite, notification. The `Building` interface gains `coastalRequired?: boolean`. `getAvailableBuildings` gains a `mapTiles` parameter (all three callers must be updated). A new `DockSprite` with SMIL wave and boat-rock animations is added to the sprite system. A one-liner notification fires in the `tech:completed` handler.

**Tech Stack:** TypeScript, custom JSX sprite runtime (no React), vitest

---

### Task 1: Write failing tests

**Files:**
- Modify: `tests/systems/city-system.test.ts`

- [ ] **Step 1: Add imports at the top of `tests/systems/city-system.test.ts`**

Ensure these are imported (add if missing):

```typescript
import { generateMap } from '@/systems/map-generator';
import { foundCity, getAvailableBuildings, BUILDINGS } from '@/systems/city-system';
```

- [ ] **Step 2: Add coastal-gating tests inside `describe('getAvailableBuildings', ...)`**

```typescript
  it('excludes coastalRequired buildings from inland cities', () => {
    const map = generateMap(30, 30, 'coastal-test');
    // Find a land tile with no adjacent water tiles
    const inlandTile = Object.values(map.tiles).find(t =>
      t.terrain === 'grassland' &&
      !Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    )!;
    const city = foundCity('p1', inlandTile.coord, map, mkC());
    const available = getAvailableBuildings(city, ['fishing'], map.tiles);
    expect(available.find(b => b.id === 'dock')).toBeUndefined();
  });

  it('includes dock for coastal cities with fishing tech', () => {
    const map = generateMap(30, 30, 'coastal-test');
    // Find a tile adjacent to ocean or coast
    const coastalTile = Object.values(map.tiles).find(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Object.values(map.tiles).some(n =>
        Math.abs(n.coord.q - t.coord.q) <= 1 &&
        Math.abs(n.coord.r - t.coord.r) <= 1 &&
        (n.terrain === 'ocean' || n.terrain === 'coast')
      )
    );
    if (!coastalTile) return; // skip if map seed has no coastal grassland

    // Give the city ownedTiles that include a water tile
    const waterTile = Object.values(map.tiles).find(t =>
      t.terrain === 'ocean' || t.terrain === 'coast'
    )!;
    const city = {
      ...foundCity('p1', coastalTile.coord, map, mkC()),
      ownedTiles: [coastalTile.coord, waterTile.coord],
    };
    const available = getAvailableBuildings(city, ['fishing'], map.tiles);
    expect(available.find(b => b.id === 'dock')).toBeDefined();
  });

  it('excludes dock from coastal city without fishing tech', () => {
    const map = generateMap(30, 30, 'coastal-test');
    const waterTile = Object.values(map.tiles).find(t => t.terrain === 'ocean' || t.terrain === 'coast')!;
    const nearTile = Object.values(map.tiles).find(t =>
      (t.terrain === 'grassland' || t.terrain === 'plains') &&
      Math.abs(t.coord.q - waterTile.coord.q) <= 1 &&
      Math.abs(t.coord.r - waterTile.coord.r) <= 1
    );
    if (!nearTile) return; // skip if map seed has no such tile
    const city = {
      ...foundCity('p1', nearTile.coord, map, mkC()),
      ownedTiles: [nearTile.coord, waterTile.coord],
    };
    const available = getAvailableBuildings(city, [], map.tiles); // no fishing tech
    expect(available.find(b => b.id === 'dock')).toBeUndefined();
  });
```

- [ ] **Step 3: Run the tests to confirm they fail**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts
```

Expected: compile error — `getAvailableBuildings` does not yet accept a third argument, and `dock` doesn't exist.

---

### Task 2: Update types and system

**Files:**
- Modify: `src/core/types.ts` (Building interface, line ~294)
- Modify: `src/systems/city-system.ts` (BUILDINGS, getAvailableBuildings, PRODUCTION_ICONS)
- Modify: `src/ui/city-panel.ts`
- Modify: `src/ai/basic-ai.ts`
- Modify: `src/systems/planning-system.ts`

- [ ] **Step 4: Add `coastalRequired` to the `Building` interface in `src/core/types.ts`**

Find the `Building` interface (around line 294):

```typescript
export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  adjacencyBonuses?: AdjacencyBonus[];
  pacing?: PacingMetadata;
}
```

Add `coastalRequired?: boolean`:

```typescript
export interface Building {
  id: string;
  name: string;
  category?: BuildingCategory;
  yields: ResourceYield;
  productionCost: number;
  description: string;
  techRequired?: string | null;
  coastalRequired?: boolean;
  adjacencyBonuses?: AdjacencyBonus[];
  pacing?: PacingMetadata;
}
```

- [ ] **Step 5: Add `dock` to `BUILDINGS` and `PRODUCTION_ICONS` in `src/systems/city-system.ts`**

In the `BUILDINGS` object (after the `harbor` entry at line ~55), add:

```typescript
  dock: {
    id: 'dock',
    name: 'Dock',
    category: 'economy' as BuildingCategory,
    yields: { food: 2, production: 0, gold: 1, science: 0 },
    productionCost: 60,
    description: 'Harbor for fishing boats. Boosts coastal city food and trade.',
    techRequired: 'fishing',
    coastalRequired: true,
    adjacencyBonuses: [],
  },
```

In `PRODUCTION_ICONS` (after the `harbor` entry), add:

```typescript
  dock: '🚢',
```

- [ ] **Step 6: Add `isCityCoastal` helper and update `getAvailableBuildings` in `src/systems/city-system.ts`**

Add this helper just before `getAvailableBuildings`:

```typescript
export function isCityCoastal(city: City, mapTiles: GameMap['tiles']): boolean {
  return city.ownedTiles.some(coord => {
    const tile = mapTiles[`${coord.q},${coord.r}`];
    return tile?.terrain === 'ocean' || tile?.terrain === 'coast';
  });
}
```

Replace `getAvailableBuildings` (lines 287–293):

```typescript
export function getAvailableBuildings(
  city: City,
  completedTechs: string[],
  mapTiles: GameMap['tiles'],
): Building[] {
  const coastal = isCityCoastal(city, mapTiles);
  return Object.values(BUILDINGS).filter(b => {
    if (city.buildings.includes(b.id)) return false;
    if (b.techRequired && !completedTechs.includes(b.techRequired)) return false;
    if (b.coastalRequired && !coastal) return false;
    return true;
  });
}
```

Add the `GameMap` import at the top of `city-system.ts` if it isn't already there:

```typescript
import type { Building, BuildingCategory, City, GameMap, ... } from '@/core/types';
```

(Check the existing import and add `GameMap` to the list if missing.)

- [ ] **Step 7: Update the three callers of `getAvailableBuildings`**

**`src/ui/city-panel.ts`** — find `getAvailableBuildings(city, ...)` and add `state.map.tiles`:
```typescript
getAvailableBuildings(city, currentCiv.techState.completed, state.map.tiles)
```

**`src/ai/basic-ai.ts`** — find its call and add the map tiles (the AI already has `state`):
```typescript
getAvailableBuildings(city, civ.techState.completed, state.map.tiles)
```

**`src/systems/planning-system.ts`** — find its call and add the map tiles:
```typescript
getAvailableBuildings(city, civ.techState.completed, state.map.tiles)
```

- [ ] **Step 8: Update existing `getAvailableBuildings` calls in tests**

In `tests/systems/city-system.test.ts`, the existing tests call `getAvailableBuildings(city, [])` with two args. Add a third arg `map.tiles` (the `map` variable is already in scope in those tests):

```typescript
const available = getAvailableBuildings(city, [], map.tiles);
```

Do this for all three existing calls at lines ~96, ~105, and ~289.

- [ ] **Step 9: Run the system tests**

```bash
bash scripts/run-with-mise.sh yarn test tests/systems/city-system.test.ts
```

Expected: all tests `PASS`.

- [ ] **Step 10: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: no regressions. (The production-icon coverage test should pass because `dock: '🚢'` was added in Step 5.)

- [ ] **Step 11: Commit system layer**

```bash
git add src/core/types.ts src/systems/city-system.ts src/ui/city-panel.ts src/ai/basic-ai.ts src/systems/planning-system.ts tests/systems/city-system.test.ts
git commit -m "feat(city): add Dock building gated on fishing tech + coastal cities

Dock (cost 60, +2 food, +1 gold, 1 gold maintenance) is the
infrastructure payoff for the fishing tech track. Only coastal cities
— those with an ocean or coast tile in ownedTiles — can build it.

Adds coastalRequired?: boolean to the Building interface, a new
isCityCoastal() helper, and updates getAvailableBuildings() to accept
mapTiles and filter accordingly. Updates all three callers.

Partial fix for #218"
```

---

### Task 3: Add the DockSprite

**Files:**
- Modify: `src/renderer/sprites/buildings.tsx`
- Modify: `src/renderer/sprites/sprite-catalog.ts`

The sprite catalog test asserts every building ID in `BUILDINGS` has an entry — it will fail until both steps below are done.

- [ ] **Step 12: Add `DockSprite` to `src/renderer/sprites/buildings.tsx`**

Add the following after `HarborSprite` (around line 349), before the `/* === MILITARY ===` comment:

```tsx
export function DockSprite({ palette, svgOnly = false }: BuildingSpriteProps): string {
  return (
    <BuildingFrame label="Dock" sub="Food" category="food" svgOnly={svgOnly}>
      {/* water background */}
      <rect x="0" y="118" width="192" height="42" fill={P.ground.water} />

      {/* animated wave line 1 */}
      <path id="dock-wave1" d="M0,124 Q24,120 48,124 T96,124 T144,124 T192,124" stroke="#fff" strokeWidth="0.6" fill="none" opacity="0.5">
        <animate attributeName="d"
          values="M0,124 Q24,120 48,124 T96,124 T144,124 T192,124;M0,126 Q24,122 48,126 T96,122 T144,126 T192,126;M0,124 Q24,120 48,124 T96,124 T144,124 T192,124"
          dur="3s" repeatCount="indefinite" calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>

      {/* animated wave line 2 */}
      <path d="M0,132 Q24,128 48,132 T96,132 T144,132 T192,132" stroke="#fff" strokeWidth="0.4" fill="none" opacity="0.3">
        <animate attributeName="d"
          values="M0,132 Q24,128 48,132 T96,132 T144,132 T192,132;M0,130 Q24,134 48,130 T96,134 T144,130 T192,130;M0,132 Q24,128 48,132 T96,132 T144,132 T192,132"
          dur="3s" begin="1.5s" repeatCount="indefinite" calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1" />
      </path>

      {/* pier planks */}
      <rect x="60" y="90" width="72" height="34" fill={P.wood.mid} stroke={P.ink.line} strokeWidth="1" />
      <path d="M60,90 H132 M60,100 H132 M60,110 H132 M60,120 H132" stroke={P.wood.dark} strokeWidth="0.6" />

      {/* pier posts into water */}
      <line x1="72"  y1="120" x2="72"  y2="160" stroke={P.wood.dark} strokeWidth="3" />
      <line x1="96"  y1="120" x2="96"  y2="160" stroke={P.wood.dark} strokeWidth="3" />
      <line x1="120" y1="120" x2="120" y2="160" stroke={P.wood.dark} strokeWidth="3" />

      {/* small boat with rocking animation — pivot at waterline centre (146, 116) */}
      <g transform="translate(146 116)">
        <animateTransform attributeName="transform"
          type="rotate"
          values="0 0 0;1.5 0 0;0 0 0;-1.5 0 0;0 0 0"
          dur="4s" begin="0.8s" repeatCount="indefinite" calcMode="spline"
          keySplines="0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1;0.4 0 0.6 1"
          additive="sum" />
        <path d="M-16,-4 Q6,-8 16,-4 Q12,6 0,8 Q-12,6 -16,-4 Z" fill={P.wood.light} stroke={P.ink.line} strokeWidth="1" />
        <line x1="0" y1="-8" x2="0" y2="-28" stroke={P.wood.dark} strokeWidth="1.5" />
        <path d="M0,-26 L14,-18 L14,-8 L0,-8 Z" fill={P.cloth.linen} stroke={P.ink.line} strokeWidth="0.6" />
      </g>

      {/* civ banner */}
      <Banner x={96} y={62} palette={palette} scale={0.7} />
    </BuildingFrame>
  );
}
```

- [ ] **Step 13: Register `DockSprite` in `src/renderer/sprites/sprite-catalog.ts`**

Find the `BUILDING_SPRITE_CATALOG` object. Add `DockSprite` to the import at the top of the file:

```typescript
import {
  // ... existing imports ...
  DockSprite,
  HarborSprite,
  // ...
} from './buildings';
```

And add to the catalog object (after the `harbor` entry):

```typescript
  dock:                   DockSprite,
```

- [ ] **Step 14: Run the full test suite**

```bash
bash scripts/run-with-mise.sh yarn test
```

Expected: all tests pass. The sprite catalog coverage test now includes `dock`.

- [ ] **Step 15: Commit sprite**

```bash
git add src/renderer/sprites/buildings.tsx src/renderer/sprites/sprite-catalog.ts
git commit -m "feat(sprite): add DockSprite with wave ripple and boat rock animation

Pier planks, animated water surface (SMIL animate on wave paths),
and a small fishing boat with a 4s pitch-rock animateTransform.
SMIL animations are used instead of CSS so they work in svgOnly mode
(image preloader path) where the style tag is stripped.

Partial fix for #218"
```

---

### Task 4: Fire guidance notification on fishing tech completion

**Files:**
- Modify: `src/main.ts` (around line 2383)

- [ ] **Step 16: Update the `tech:completed` handler in `src/main.ts`**

Find the handler:

```typescript
bus.on('tech:completed', ({ civId, techId }) => {
  appendToCivLog(civId, `Research complete: ${techId}!`, 'success');
  if (civId === gameState.currentPlayer) SFX.research();
});
```

Replace with:

```typescript
bus.on('tech:completed', ({ civId, techId }) => {
  appendToCivLog(civId, `Research complete: ${techId}!`, 'success');
  if (techId === 'fishing') {
    appendToCivLog(civId, 'Fishing unlocked — build a Dock in your coastal cities to boost food and trade.', 'info');
  }
  if (civId === gameState.currentPlayer) SFX.research();
});
```

- [ ] **Step 17: Run the full test suite and build**

```bash
bash scripts/run-with-mise.sh yarn test
bash scripts/run-with-mise.sh yarn build
```

Expected: tests pass, build succeeds (type-checks clean).

- [ ] **Step 18: Final commit**

```bash
git add src/main.ts
git commit -m "feat(notification): guide player to Dock after fishing tech

Players who completed rafts+fishing had no visible next step.
A one-liner info notification in the tech:completed handler tells
them to open a coastal city's build queue.

Fixes #218"
```
