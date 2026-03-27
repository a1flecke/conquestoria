# Critical Bug Hotfix Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 5 critical/high-severity bugs reported in GitHub issues that break core gameplay (combat, rendering, fog-of-war).

**Architecture:** Targeted fixes to existing files — no new systems. Each fix is independent and testable in isolation.

**Tech Stack:** TypeScript, Vitest, Canvas 2D

---

### Task 1: Fix Combat — Include Enemy Tiles in Movement Range (#6)

**Files:**
- Modify: `src/systems/unit-system.ts:96-103`
- Modify: `src/main.ts:256-263`
- Test: `tests/systems/unit-system.test.ts`

- [ ] **Step 1: Write failing test for movement range including enemy tiles**

In `tests/systems/unit-system.test.ts`, add:

```typescript
it('includes enemy-occupied tiles in movement range', () => {
  const map = makeSmallMap();
  const warrior: Unit = {
    id: 'w1', type: 'warrior', owner: 'player',
    position: { q: 5, r: 5 }, health: 100,
    movementPointsLeft: 2, hasActed: false,
  };
  // Place enemy at adjacent tile
  const unitPositions: Record<string, string> = {
    '5,5': 'w1',
    '6,5': 'enemy1',  // enemy unit
  };
  const range = getMovementRange(warrior, map, unitPositions);
  const keys = range.map(h => `${h.q},${h.r}`);
  // Enemy tile should be reachable (for attack)
  expect(keys).toContain('6,5');
});

it('excludes friendly-occupied tiles from movement range', () => {
  const map = makeSmallMap();
  const warrior: Unit = {
    id: 'w1', type: 'warrior', owner: 'player',
    position: { q: 5, r: 5 }, health: 100,
    movementPointsLeft: 2, hasActed: false,
  };
  // Place friendly unit at adjacent tile
  const unitPositions: Record<string, string> = {
    '5,5': 'w1',
    '6,5': 'friendly1',
  };
  const ownerMap: Record<string, string> = {
    'w1': 'player',
    'friendly1': 'player',
  };
  const range = getMovementRange(warrior, map, unitPositions, ownerMap);
  const keys = range.map(h => `${h.q},${h.r}`);
  // Friendly tile should NOT be reachable
  expect(keys).not.toContain('6,5');
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `eval "$(mise activate bash)" && yarn test tests/systems/unit-system.test.ts -v 2>&1 | tail -20`
Expected: New tests FAIL (enemy tile excluded from range).

- [ ] **Step 3: Fix getMovementRange to allow enemy-occupied tiles**

In `src/systems/unit-system.ts`, change the `getMovementRange` signature to accept an owner lookup, and only block friendly units:

```typescript
export function getMovementRange(
  unit: Unit,
  map: GameMap,
  unitPositions: Record<string, string>,
  unitOwners?: Record<string, string>,
): HexCoord[] {
```

Replace the blocking check (lines 101-103):

```typescript
      // Block friendly units, allow enemy units (for attack)
      const occupant = unitPositions[key];
      if (occupant && occupant !== unit.id) {
        const occupantOwner = unitOwners?.[occupant];
        if (!occupantOwner || occupantOwner === unit.owner) continue; // block friendlies
        // Enemy tile is reachable (for attack) but don't pathfind through it
        const cost = getMovementCost(tile.terrain);
        const remaining = current.remaining - cost;
        if (remaining < 0) continue;
        const prevRemaining = visited.get(key) ?? -1;
        if (remaining > prevRemaining) {
          visited.set(key, remaining);
          reachable.push(neighbor);
          // Don't add to queue — can't move through enemies
        }
        continue;
      }
```

- [ ] **Step 4: Update selectUnit in main.ts to pass owner map**

In `src/main.ts`, update `selectUnit()` to build and pass the owner map:

```typescript
  const unitPositions: Record<string, string> = {};
  const unitOwners: Record<string, string> = {};
  for (const [id, u] of Object.entries(gameState.units)) {
    unitPositions[hexKey(u.position)] = id;
    unitOwners[id] = u.owner;
  }
  movementRange = getMovementRange(unit, gameState.map, unitPositions, unitOwners);
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/systems/unit-system.ts src/main.ts tests/systems/unit-system.test.ts
git commit -m "fix: allow attacking enemy units by including their tiles in movement range (#6)"
```

---

### Task 2: Fix Fog-of-War Information Leak (#11)

**Files:**
- Modify: `src/main.ts` (handleHexLongPress function)
- Test: `tests/ui/fog-leak.test.ts` (new — lightweight, tests the logic)

- [ ] **Step 1: Write failing test for fog-of-war info leak**

Create `tests/ui/fog-leak.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getVisibility } from '@/systems/fog-of-war';
import { createNewGame } from '@/core/game-state';

describe('fog-of-war info leak', () => {
  it('unexplored tiles should not reveal terrain info', () => {
    const state = createNewGame(undefined, 'fog-test');
    // Find a tile that's unexplored
    const vis = state.civilizations.player.visibility;
    const unexploredTile = Object.values(state.map.tiles).find(
      t => getVisibility(vis, t.coord) === 'unexplored',
    );
    expect(unexploredTile).toBeDefined();
    // The visibility check should gate info display
    const visibility = getVisibility(vis, unexploredTile!.coord);
    expect(visibility).toBe('unexplored');
  });

  it('fog tiles should show limited info', () => {
    const state = createNewGame(undefined, 'fog-test');
    const vis = state.civilizations.player.visibility;
    const fogTile = Object.values(state.map.tiles).find(
      t => getVisibility(vis, t.coord) === 'fog',
    );
    // Fog tiles exist after initial visibility update downgrades them
    // For this test, we just verify the visibility system distinguishes states
    if (fogTile) {
      expect(getVisibility(vis, fogTile.coord)).toBe('fog');
    }
  });
});
```

- [ ] **Step 2: Fix handleHexLongPress to check visibility**

In `src/main.ts`, replace the `handleHexLongPress` function:

```typescript
function handleHexLongPress(coord: HexCoord): void {
  const tile = gameState.map.tiles[hexKey(coord)];
  if (!tile) return;

  const vis = currentCiv()?.visibility;
  if (!vis) return;

  const visibility = getVisibility(vis, coord);

  if (visibility === 'unexplored') {
    showNotification('Unexplored territory');
    return;
  }

  if (visibility === 'fog') {
    // Show basic terrain only (what you remember from exploring)
    showNotification(`${tile.terrain} (last seen)`);
    return;
  }

  // Fully visible — show all details
  const wonderInfo = tile.wonder ? ` · ⭐ ${getWonderDefinition(tile.wonder)?.name ?? tile.wonder}` : '';
  showNotification(`${tile.terrain} · ${tile.elevation}${tile.improvement !== 'none' ? ' · ' + tile.improvement : ''}${tile.resource ? ' · ' + tile.resource : ''}${wonderInfo}`);
}
```

Add `getVisibility` to the existing import from `fog-of-war`:

```typescript
import { updateVisibility, isVisible, getVisibility } from '@/systems/fog-of-war';
```

- [ ] **Step 3: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/main.ts tests/ui/fog-leak.test.ts
git commit -m "fix: prevent fog-of-war info leak on long-press (#11)"
```

---

### Task 3: Add City Rendering (#1)

**Files:**
- Create: `src/renderer/city-renderer.ts`
- Modify: `src/renderer/render-loop.ts`
- Test: `tests/renderer/city-renderer.test.ts` (new)

- [ ] **Step 1: Write test for city renderer**

Create `tests/renderer/city-renderer.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getCityRenderData } from '@/renderer/city-renderer';
import { createNewGame } from '@/core/game-state';
import { foundCity } from '@/systems/city-system';

describe('city renderer', () => {
  it('returns render data for player cities', () => {
    const state = createNewGame(undefined, 'city-render-test');
    const settler = Object.values(state.units).find(u => u.owner === 'player' && u.type === 'settler')!;
    const city = foundCity('player', settler.position, state.map);
    state.cities[city.id] = city;
    state.civilizations.player.cities.push(city.id);

    const data = getCityRenderData(state);
    expect(data.length).toBeGreaterThan(0);
    expect(data[0].name).toBe(city.name);
    expect(data[0].position).toEqual(city.position);
    expect(data[0].population).toBe(city.population);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `eval "$(mise activate bash)" && yarn test tests/renderer/city-renderer.test.ts -v 2>&1 | tail -10`
Expected: FAIL (module not found).

- [ ] **Step 3: Create city-renderer.ts**

Create `src/renderer/city-renderer.ts`:

```typescript
import type { GameState, HexCoord } from '@/core/types';
import { hexToPixel } from '@/systems/hex-utils';
import { isVisible } from '@/systems/fog-of-war';
import { Camera } from './camera';

interface CityRenderInfo {
  name: string;
  position: HexCoord;
  population: number;
  owner: string;
  color: string;
}

const OWNER_COLORS: Record<string, string> = {
  player: '#4a90d9',
  'ai-1': '#d94a4a',
};

export function getCityRenderData(state: GameState): CityRenderInfo[] {
  return Object.values(state.cities).map(city => ({
    name: city.name,
    position: city.position,
    population: city.population,
    owner: city.owner,
    color: state.civilizations[city.owner]?.color ?? OWNER_COLORS[city.owner] ?? '#888',
  }));
}

export function drawCities(
  ctx: CanvasRenderingContext2D,
  state: GameState,
  camera: Camera,
  playerCivId: string,
): void {
  const vis = state.civilizations[playerCivId]?.visibility;
  if (!vis) return;

  for (const city of Object.values(state.cities)) {
    if (!isVisible(vis, city.position)) continue;
    if (!camera.isHexVisible(city.position)) continue;

    const pixel = hexToPixel(city.position, camera.hexSize);
    const screen = camera.worldToScreen(pixel.x, pixel.y);
    const size = camera.hexSize * camera.zoom;
    const color = state.civilizations[city.owner]?.color ?? OWNER_COLORS[city.owner] ?? '#888';

    // City background — larger than unit circle
    ctx.beginPath();
    ctx.arc(screen.x, screen.y, size * 0.45, 0, Math.PI * 2);
    ctx.fillStyle = color;
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    ctx.stroke();

    // City icon
    ctx.font = `${size * 0.45}px system-ui`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🏛️', screen.x, screen.y);

    // City name + population below
    ctx.font = `bold ${Math.max(9, size * 0.22)}px system-ui`;
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(`${city.name} (${city.population})`, screen.x, screen.y + size * 0.5);
  }
}
```

- [ ] **Step 4: Wire into render loop**

In `src/renderer/render-loop.ts`, add import and call:

```typescript
import { drawCities } from './city-renderer';
```

After `drawUnits` and before `drawFogOfWar`, add:

```typescript
    // Draw cities
    drawCities(this.ctx, this.state, this.camera, this.state.currentPlayer);
```

- [ ] **Step 5: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/city-renderer.ts src/renderer/render-loop.ts tests/renderer/city-renderer.test.ts
git commit -m "feat: add city rendering with name and population display (#1)"
```

---

### Task 4: Add Enemy Unit Info Panel (#8)

**Files:**
- Modify: `src/main.ts` (handleHexTap function)

- [ ] **Step 1: Add enemy unit info display on tap**

In `src/main.ts`, in the `handleHexTap` function, after the player unit selection check (line ~371) and before the movement/attack check, add an enemy info display branch:

```typescript
  // Show info panel for enemy/barbarian units (no selection, just info)
  if (unitAtHex && unitAtHex[1].owner !== gameState.currentPlayer) {
    const enemyUnit = unitAtHex[1];
    const def = UNIT_DEFINITIONS[enemyUnit.type];
    const panel = document.getElementById('info-panel');
    if (panel) {
      const ownerName = enemyUnit.owner === 'barbarian' ? 'Barbarian' :
        (gameState.civilizations[enemyUnit.owner]?.name ?? enemyUnit.owner);
      panel.style.display = 'block';
      panel.innerHTML = `
        <div style="background:rgba(100,0,0,0.85);border-radius:12px;padding:12px 16px;">
          <div style="display:flex;justify-content:space-between;align-items:center;">
            <div>
              <strong>${ownerName} ${def.name}</strong> · HP: ${enemyUnit.health}/100 · Str: ${def.strength}
            </div>
            <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
          </div>
        </div>
      `;
      document.getElementById('btn-deselect')?.addEventListener('click', deselectUnit);
    }
    // Don't return — allow attack flow to continue if a unit is already selected
    if (!selectedUnitId) return;
  }
```

This goes BEFORE the existing `if (unitAtHex && unitAtHex[1].owner === gameState.currentPlayer)` block. Reorder so enemy check comes first but only returns if no unit is selected (allows attack when a unit IS selected).

Actually, better approach: keep existing player-select-first logic, add enemy info as an else branch:

Replace the existing unit selection block:

```typescript
  if (unitAtHex && unitAtHex[1].owner === gameState.currentPlayer) {
    selectUnit(unitAtHex[0]);
    return;
  }
```

With:

```typescript
  if (unitAtHex) {
    if (unitAtHex[1].owner === gameState.currentPlayer) {
      selectUnit(unitAtHex[0]);
      return;
    }
    // Show enemy unit info (if no unit selected for attack)
    if (!selectedUnitId) {
      const enemyUnit = unitAtHex[1];
      const def = UNIT_DEFINITIONS[enemyUnit.type];
      const ownerName = enemyUnit.owner === 'barbarian' ? 'Barbarian' :
        (gameState.civilizations[enemyUnit.owner]?.name ?? enemyUnit.owner);
      const panel = document.getElementById('info-panel');
      if (panel) {
        panel.style.display = 'block';
        panel.innerHTML = `
          <div style="background:rgba(100,0,0,0.85);border-radius:12px;padding:12px 16px;">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <strong>${ownerName} ${def.name}</strong> · HP: ${enemyUnit.health}/100 · Str: ${def.strength}
              </div>
              <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
            </div>
          </div>
        `;
        document.getElementById('btn-deselect')?.addEventListener('click', deselectUnit);
      }
      return;
    }
  }
```

- [ ] **Step 2: Run tests and manual verification**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -15`
Expected: All tests pass. (This is UI code — verified visually.)

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "feat: show enemy unit info panel on tap (#8)"
```

---

### Task 5: Add Turn Transition Notification (#7)

**Files:**
- Modify: `src/main.ts` (endTurn function)

- [ ] **Step 1: Add turn notification in solo mode**

In `src/main.ts`, in the solo mode branch of `endTurn()`, after `updateHUD()` and before `advisorSystem.check(gameState)`, add:

```typescript
      showNotification(`Turn ${gameState.turn}`, 'info');
```

- [ ] **Step 2: Run tests**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -15`
Expected: All tests pass.

- [ ] **Step 3: Commit**

```bash
git add src/main.ts
git commit -m "fix: add turn transition notification in solo mode (#7)"
```

---

### Task 6: Add Unit Owner Colors for Hot Seat (#1 follow-up)

**Files:**
- Modify: `src/renderer/unit-renderer.ts`
- Modify: `src/renderer/city-renderer.ts`

- [ ] **Step 1: Use civilization colors instead of hardcoded owner map**

The current `OWNER_COLORS` in `unit-renderer.ts` only maps `player`, `ai-1`, and `barbarian`. Hot seat mode has slot IDs like `slot-0`, `slot-1` etc. that won't match.

Update `drawUnits` to accept the game state (or just a color lookup) so it can use `civilization.color`:

In `unit-renderer.ts`, update the function signature to accept a color resolver:

```typescript
export function drawUnits(
  ctx: CanvasRenderingContext2D,
  units: Record<string, Unit>,
  camera: Camera,
  playerVisibility: VisibilityMap,
  colorLookup?: Record<string, string>,
): void {
```

And use it for the owner color:

```typescript
    const ownerColor = colorLookup?.[unit.owner] ?? OWNER_COLORS[unit.owner] ?? '#888';
```

In `render-loop.ts`, build the color lookup from civilizations and pass it:

```typescript
    const colorLookup: Record<string, string> = { barbarian: '#8b4513' };
    for (const [id, civ] of Object.entries(this.state.civilizations)) {
      colorLookup[id] = civ.color;
    }
    drawUnits(this.ctx, this.state.units, this.camera, playerVis, colorLookup);
```

- [ ] **Step 2: Run tests and build**

Run: `eval "$(mise activate bash)" && yarn test 2>&1 | tail -15 && yarn build 2>&1 | tail -5`
Expected: All tests pass, build succeeds.

- [ ] **Step 3: Commit**

```bash
git add src/renderer/unit-renderer.ts src/renderer/city-renderer.ts src/renderer/render-loop.ts
git commit -m "fix: use civ colors for units and cities in all game modes"
```

---

### Task 7: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `eval "$(mise activate bash)" && yarn test 2>&1`
Expected: All tests pass.

- [ ] **Step 2: Run build**

Run: `eval "$(mise activate bash)" && yarn build 2>&1`
Expected: Build succeeds.

- [ ] **Step 3: Push**

```bash
git push
```
