# M4-playtest-fixes: Critical Gameplay & UX Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 critical issues found during playtesting that block casual 5-minute play sessions. These fixes take priority over new M4 features.

**Architecture:** All changes follow existing patterns — event-driven, seeded RNG, serializable state, mobile-first, `currentPlayer`-aware. No new systems; extends existing ones.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, EventBus, IndexedDB

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/storage/save-manager.ts` | Persistent storage fix: request durable storage, add localStorage fallback, visual save indicator (#38) |
| `src/storage/db.ts` | Add `navigator.storage.persist()` call, error handling for IndexedDB failures |
| `src/ui/save-panel.ts` | Add "Download Save" / "Import Save" buttons for manual backup (#38) |
| `src/systems/unit-system.ts` | Add `healUnit()`, `canHeal()`, `getUnmovedUnits()`, `getNextUnmovedUnit()` functions (#15, #25) |
| `src/core/turn-manager.ts` | Add auto-heal pass (units that didn't move heal HP), process Rohan cavalry heal (#15) |
| `src/core/types.ts` | Add `isResting` flag to Unit type, `NotificationEntry` type, update GameEvents (#15, #20) |
| `src/main.ts` | Unit cycling, rest button, notification rewrite, movement+attack highlighting, grid view tooltip (#25, #15, #20, #4, #31, #26) |
| `src/renderer/render-loop.ts` | Accept and render movement/attack highlights (#4) |
| `src/renderer/hex-renderer.ts` | Draw movement highlights (blue) and attack indicators (red) on hexes, fix map edge rendering (#4, #37) |
| `src/systems/combat-system.ts` | Tune Stone Age combat damage (#14) |
| `src/ui/city-panel.ts` | Add grid view description/help text (#31) |
| `tests/systems/playtest-fixes.test.ts` | Unit tests for healing, combat tuning, unit cycling |
| `tests/renderer/movement-highlights.test.ts` | Tests for highlight classification |
| `tests/storage/save-persistence.test.ts` | Tests for save fallback logic |

---

## Task 1: Fix Save Persistence (#38)

**Problem:** IndexedDB data is evicted by Safari after short periods. The title screen shows only "New Game" because `hasAutoSave()` returns false — saves silently vanish. This is the #1 blocker for 5-minute play sessions.

**Root Cause Investigation:** The auto-save code (`src/storage/save-manager.ts`) correctly writes to IndexedDB on every end-of-turn (`main.ts:696,723`). The `createSavePanel` (`src/ui/save-panel.ts:23-24`) correctly checks `hasAutoSave()` and `listSaves()`. The data is being written but iOS Safari evicts IndexedDB storage for web apps. The `navigator.storage.persist()` API can request durable storage, preventing eviction.

**Fix:** Three-layer approach: (1) request persistent storage, (2) localStorage backup for auto-save, (3) JSON file export/import.

**Files:**
- Modify: `src/storage/db.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `src/main.ts`
- Create: `tests/storage/save-persistence.test.ts`

### Step 1: Request persistent storage in db.ts

- [ ] In `src/storage/db.ts`, add a `requestPersistentStorage()` function that calls `navigator.storage.persist()` when available. Call it from `openDB()` on first open.

```typescript
let persistRequested = false;

async function requestPersistentStorage(): Promise<void> {
  if (persistRequested) return;
  persistRequested = true;
  try {
    if (navigator.storage?.persist) {
      const granted = await navigator.storage.persist();
      if (granted) {
        console.log('[save] Persistent storage granted');
      } else {
        console.warn('[save] Persistent storage denied — saves may be evicted');
      }
    }
  } catch {
    // Silently ignore — not all browsers support this
  }
}
```

Call `requestPersistentStorage()` at the top of `openDB()` (before the `indexedDB.open()` call). It's fire-and-forget; don't block on it.

### Step 2: Add localStorage fallback in save-manager.ts

- [ ] In `src/storage/save-manager.ts`, add a compressed localStorage backup that mirrors the auto-save. The auto-save state can be large, so we need to compress it.

Add a `LOCALSTORAGE_AUTOSAVE_KEY` constant: `'conquestoria-autosave'`.

Modify `autoSave()` to ALSO write a JSON string to `localStorage` after the IndexedDB write. Use `try/catch` around the localStorage write — if it exceeds the 5MB quota, log a warning but don't crash.

```typescript
export async function autoSave(state: GameState): Promise<void> {
  await dbPut(AUTO_SAVE_KEY, state);
  // Backup to localStorage (survives IndexedDB eviction on iOS Safari)
  try {
    localStorage.setItem(LOCALSTORAGE_AUTOSAVE_KEY, JSON.stringify(state));
  } catch {
    console.warn('[save] localStorage backup failed (quota exceeded?)');
  }
}
```

Modify `loadAutoSave()` to fall back to localStorage if IndexedDB returns undefined:

```typescript
export async function loadAutoSave(): Promise<GameState | undefined> {
  const idbSave = await dbGet<GameState>(AUTO_SAVE_KEY);
  if (idbSave) return idbSave;
  // Fallback: try localStorage
  try {
    const lsSave = localStorage.getItem(LOCALSTORAGE_AUTOSAVE_KEY);
    if (lsSave) {
      console.log('[save] Recovered auto-save from localStorage fallback');
      const parsed = JSON.parse(lsSave) as GameState;
      // Re-populate IndexedDB so future loads are fast
      await dbPut(AUTO_SAVE_KEY, parsed);
      return parsed;
    }
  } catch {
    console.warn('[save] localStorage fallback read failed');
  }
  return undefined;
}
```

Modify `hasAutoSave()` to also check localStorage:

```typescript
export async function hasAutoSave(): Promise<boolean> {
  const idbSave = await dbGet(AUTO_SAVE_KEY);
  if (idbSave !== undefined) return true;
  try {
    return localStorage.getItem(LOCALSTORAGE_AUTOSAVE_KEY) !== null;
  } catch {
    return false;
  }
}
```

Similarly update `deleteAutoSave()` to also remove the localStorage backup.

### Step 3: Add visual save indicator in main.ts

- [ ] In the `endTurn()` function in `src/main.ts`, after the `await autoSave(gameState)` calls (lines 696 and 723), briefly flash a save icon on the HUD. This reassures the player their game is saved.

Add a `showSaveIndicator()` function:

```typescript
function showSaveIndicator(): void {
  const hud = document.getElementById('hud');
  if (!hud) return;
  const indicator = document.createElement('span');
  indicator.textContent = ' Saved';
  indicator.style.cssText = 'color:#6b9b4b;font-size:11px;opacity:1;transition:opacity 1.5s;';
  hud.appendChild(indicator);
  setTimeout(() => { indicator.style.opacity = '0'; }, 500);
  setTimeout(() => indicator.remove(), 2000);
}
```

Call `showSaveIndicator()` after each `await autoSave(gameState)` in `endTurn()`.

### Step 4: Add JSON export/import in save-panel.ts

- [ ] In `src/ui/save-panel.ts`, add a "Download Save" button in `renderStartButtons()` and a hidden file input for importing.

In `renderStartButtons()`, after the Continue button, add:

```typescript
<button id="btn-export" style="padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:12px;cursor:pointer;">Export Save</button>
<label id="btn-import" style="padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:12px;cursor:pointer;">Import Save<input type="file" accept=".json" id="import-file" style="display:none;"></label>
```

Only show the "Export Save" button if `hasAuto` is true or `saves.length > 0`.

In `createSavePanel()`, bind the export button:

```typescript
document.getElementById('btn-export')?.addEventListener('click', async () => {
  const state = await loadAutoSave();
  if (!state) return;
  const blob = new Blob([JSON.stringify(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `conquestoria-turn${state.turn}.json`;
  a.click();
  URL.revokeObjectURL(url);
});
```

Bind the import file input:

```typescript
document.getElementById('import-file')?.addEventListener('change', async (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  try {
    const text = await file.text();
    const state = JSON.parse(text) as GameState;
    if (!state.turn || !state.civilizations) throw new Error('Invalid save');
    await autoSave(state);
    panel.remove();
    callbacks.onContinue();
  } catch {
    alert('Invalid save file');
  }
});
```

Add imports at the top of `save-panel.ts`: `import { loadAutoSave, autoSave } from '@/storage/save-manager';`

### Step 5: Write tests

- [ ] Create `tests/storage/save-persistence.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('save persistence', () => {
  // Test that autoSave writes to both IndexedDB and localStorage
  // Test that loadAutoSave falls back to localStorage when IDB returns undefined
  // Test that hasAutoSave checks localStorage fallback
  // Test that deleteAutoSave clears both stores
});
```

The tests should mock `dbGet`/`dbPut` from `db.ts` and use `vi.spyOn(Storage.prototype, 'setItem')`.

- [ ] Run: `yarn test` and `yarn build`

---

## Task 2: Unit Healing (#15)

**Problem:** No general healing mechanic exists. Damaged units stay damaged forever (except Rohan cavalry on grasslands and wonder-specific healing). Combat feels punishing and units feel disposable.

**Fix:** Two healing modes: (1) **Auto-heal** — units that didn't move or attack this turn recover HP passively. (2) **Explicit Rest action** — a "Rest" button on the unit info panel that skips the unit's turn and heals more. Healing is faster in friendly territory and on favorable terrain.

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/playtest-fixes.test.ts`

### Step 1: Add isResting flag to Unit type

- [ ] In `src/core/types.ts`, find the `Unit` interface (search for `export interface Unit`). Add `isResting: boolean;` field after the `hasMoved` field.

### Step 2: Add healing functions to unit-system.ts

- [ ] In `src/systems/unit-system.ts`, add these functions after the existing `moveUnit()` function:

```typescript
/** Base healing rates */
const HEAL_PASSIVE = 5;         // HP per turn if unit didn't move
const HEAL_REST = 15;           // HP per turn if unit chose to Rest
const HEAL_FRIENDLY_BONUS = 5;  // Extra HP in friendly territory
const HEAL_CITY_BONUS = 10;     // Extra HP when inside a city

export function canHeal(unit: Unit): boolean {
  return unit.health < 100 && unit.movementPointsLeft > 0 && !unit.hasMoved;
}

export function restUnit(unit: Unit): Unit {
  return {
    ...unit,
    isResting: true,
    hasMoved: true,
    movementPointsLeft: 0,
  };
}

export function healUnit(
  unit: Unit,
  isInFriendlyTerritory: boolean,
  isInCity: boolean,
): Unit {
  if (unit.health >= 100) return unit;

  // Units that moved or attacked don't auto-heal
  if (unit.hasMoved && !unit.isResting) return unit;

  let healAmount = unit.isResting ? HEAL_REST : HEAL_PASSIVE;
  if (isInFriendlyTerritory) healAmount += HEAL_FRIENDLY_BONUS;
  if (isInCity) healAmount += HEAL_CITY_BONUS;

  return {
    ...unit,
    health: Math.min(100, unit.health + healAmount),
  };
}
```

Also export the constants for tests: `export { HEAL_PASSIVE, HEAL_REST, HEAL_FRIENDLY_BONUS, HEAL_CITY_BONUS };`

### Step 3: Update createUnit to include isResting

- [ ] In `src/systems/unit-system.ts`, in the `createUnit()` function (around line 59-71), add `isResting: false` to the returned Unit object, right after `hasMoved: false`.

### Step 4: Process healing in turn-manager.ts

- [ ] In `src/core/turn-manager.ts`, import `healUnit` from `unit-system.ts`.

After the `resetUnitTurn` calls (search for `resetUnitTurn` — it should be in the per-civ unit processing section), add a healing pass. Find where units get their movement points reset at end of turn. **Before** resetting movement/hasMoved, process healing:

```typescript
// Heal units that didn't move this turn
for (const unitId of civ.units) {
  const unit = newState.units[unitId];
  if (!unit || unit.health >= 100) continue;

  const unitKey = `${unit.position.q},${unit.position.r}`;
  const tile = newState.map.tiles[unitKey];
  const isInFriendlyTerritory = tile?.owner === civId;
  const isInCity = Object.values(newState.cities).some(
    c => c.position.q === unit.position.q && c.position.r === unit.position.r && c.owner === civId,
  );
  newState.units[unitId] = healUnit(unit, isInFriendlyTerritory, isInCity);
}
```

The Rohan cavalry heal bonus is already handled in the turn manager via civ bonuses — verify it doesn't double-count. The generic healing is additive; Rohan's bonus is separate and can stack.

### Step 5: Add Rest button to unit info panel in main.ts

- [ ] In `src/main.ts`, in the `selectUnit()` function (around line 321), import `canHeal`, `restUnit` from `unit-system.ts`.

After the existing action buttons (found city, build farm, build mine), add a Rest button for combat units that can heal:

```typescript
if (canHeal(unit) && !def.canFoundCity && !def.canBuildImprovements) {
  actions += '<button id="btn-rest" style="padding:8px 16px;border-radius:8px;background:#4a90d9;border:none;color:white;cursor:pointer;">Rest & Heal</button> ';
}
```

After the existing event listeners (btn-found-city, btn-build-farm, btn-build-mine), add:

```typescript
document.getElementById('btn-rest')?.addEventListener('click', () => {
  if (!selectedUnitId) return;
  const u = gameState.units[selectedUnitId];
  if (!u) return;
  gameState.units[selectedUnitId] = restUnit(u);
  showNotification(`${UNIT_DEFINITIONS[u.type].name} is resting (will heal)`, 'info');
  deselectUnit();
});
```

### Step 6: Reset isResting on unit turn reset

- [ ] In `src/systems/unit-system.ts`, find `resetUnitTurn` (if it exists) or in `src/core/turn-manager.ts` where unit movement points are reset at start of turn. Ensure `isResting` is set to `false` when the unit's turn starts.

Search for where `hasMoved` is set to `false` and `movementPointsLeft` is restored. Add `isResting: false` alongside.

### Step 7: Write tests

- [ ] In `tests/systems/playtest-fixes.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { canHeal, restUnit, healUnit, HEAL_PASSIVE, HEAL_REST, HEAL_FRIENDLY_BONUS, HEAL_CITY_BONUS } from '@/systems/unit-system';

describe('unit healing (#15)', () => {
  const makeUnit = (overrides = {}) => ({
    id: 'unit-1', type: 'warrior' as const, owner: 'player',
    position: { q: 0, r: 0 }, movementPointsLeft: 2,
    health: 60, experience: 0, hasMoved: false, isResting: false,
    ...overrides,
  });

  it('canHeal returns true for damaged unmoved unit', () => {
    expect(canHeal(makeUnit())).toBe(true);
  });

  it('canHeal returns false for full health', () => {
    expect(canHeal(makeUnit({ health: 100 }))).toBe(false);
  });

  it('canHeal returns false for moved unit', () => {
    expect(canHeal(makeUnit({ hasMoved: true }))).toBe(false);
  });

  it('restUnit sets isResting and consumes movement', () => {
    const rested = restUnit(makeUnit());
    expect(rested.isResting).toBe(true);
    expect(rested.hasMoved).toBe(true);
    expect(rested.movementPointsLeft).toBe(0);
  });

  it('healUnit passive heals unmoved unit', () => {
    const healed = healUnit(makeUnit(), false, false);
    expect(healed.health).toBe(60 + HEAL_PASSIVE);
  });

  it('healUnit rest heals more', () => {
    const resting = makeUnit({ isResting: true, hasMoved: true });
    const healed = healUnit(resting, false, false);
    expect(healed.health).toBe(60 + HEAL_REST);
  });

  it('healUnit adds friendly territory bonus', () => {
    const healed = healUnit(makeUnit(), true, false);
    expect(healed.health).toBe(60 + HEAL_PASSIVE + HEAL_FRIENDLY_BONUS);
  });

  it('healUnit adds city bonus', () => {
    const healed = healUnit(makeUnit(), true, true);
    expect(healed.health).toBe(60 + HEAL_PASSIVE + HEAL_FRIENDLY_BONUS + HEAL_CITY_BONUS);
  });

  it('healUnit caps at 100', () => {
    const almost = makeUnit({ health: 98 });
    const healed = healUnit(almost, true, true);
    expect(healed.health).toBe(100);
  });

  it('healUnit skips moved units that are not resting', () => {
    const moved = makeUnit({ hasMoved: true });
    const healed = healUnit(moved, false, false);
    expect(healed.health).toBe(60); // unchanged
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 3: Unit Cycling / Next Unit (#25)

**Problem:** No way to automatically cycle to the next unit that needs orders. Player must manually scroll the map to find unmoved units, wasting precious time in short sessions.

**Fix:** After completing a unit's action (move, attack, rest, build), auto-select the next unmoved unit and center the camera. Add a "Next Unit" button to the bottom bar.

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/main.ts`
- Modify: `src/renderer/render-loop.ts`

### Step 1: Add getNextUnmovedUnit to unit-system.ts

- [ ] In `src/systems/unit-system.ts`, add:

```typescript
export function getUnmovedUnits(
  units: Record<string, Unit>,
  owner: string,
): Unit[] {
  return Object.values(units).filter(
    u => u.owner === owner && u.movementPointsLeft > 0 && !u.hasMoved,
  );
}
```

### Step 2: Add selectNextUnit function in main.ts

- [ ] In `src/main.ts`, after the `deselectUnit()` function (around line 369), add:

```typescript
function selectNextUnit(): void {
  const unmoved = getUnmovedUnits(gameState.units, gameState.currentPlayer);
  if (unmoved.length === 0) {
    showNotification('All units have moved', 'info');
    return;
  }

  // If we have a currently selected unit, pick the next one after it in the list
  let nextUnit: Unit;
  if (selectedUnitId) {
    const currentIdx = unmoved.findIndex(u => u.id === selectedUnitId);
    nextUnit = unmoved[(currentIdx + 1) % unmoved.length];
  } else {
    nextUnit = unmoved[0];
  }

  selectUnit(nextUnit.id);
  centerOnHex(nextUnit.position);
}
```

Import `getUnmovedUnits` from `unit-system.ts` at the top of `main.ts` (add to the existing import on line 9).

### Step 3: Add centerOnHex helper in main.ts

- [ ] In `src/main.ts`, add a `centerOnHex()` helper that centers the camera on a hex coordinate. The RenderLoop exposes `camera` as a public property.

```typescript
function centerOnHex(coord: HexCoord): void {
  const pixel = hexToPixel(coord, renderLoop.camera.hexSize);
  renderLoop.camera.centerOn(pixel.x, pixel.y);
}
```

Import `hexToPixel` from `@/systems/hex-utils` (add to the existing import on line 8). Check if `Camera` has a `centerOn` method. If not, add one:

In `src/renderer/camera.ts`, check for a method that sets the camera position. If there's a `panTo(x, y)` or `setPosition(x, y)`, use that. If not, add:

```typescript
centerOn(worldX: number, worldY: number): void {
  this.x = worldX - this.viewportWidth / 2 / this.zoom;
  this.y = worldY - this.viewportHeight / 2 / this.zoom;
}
```

Ensure `viewportWidth` and `viewportHeight` are stored by the Camera class (set in `setViewport()`).

### Step 4: Add "Next Unit" button to bottom bar

- [ ] In `src/main.ts`, in the `createUI()` function (search for `bottomBar`), after the End Turn button, add:

```typescript
const nextUnitBtn = createButton('Next', '⏩', () => selectNextUnit());
```

Add it to the bottom bar: `bottomBar.appendChild(nextUnitBtn);` — insert it **before** the End Turn button so the flow is: Tech | City | Diplo | Trade | Next | End Turn.

### Step 5: Auto-select next unit after actions

- [ ] In `src/main.ts`, after every unit action completion, call `selectNextUnit()` instead of just `deselectUnit()`. These locations are:

1. **After movement** (around line 625, where it checks `movementPointsLeft > 0`): when movement points are exhausted, call `selectNextUnit()` instead of `deselectUnit()`.

2. **After combat** (around line 556, `SFX.combat(); deselectUnit();`): replace `deselectUnit()` with `selectNextUnit()`.

3. **After rest** (the new Rest button handler from Task 2): replace `deselectUnit()` with `selectNextUnit()`.

4. **After founding a city** (around line 398, `deselectUnit()`): replace with `selectNextUnit()`.

5. **After building an improvement** (search for `btn-build-farm` and `btn-build-mine` handlers): replace `deselectUnit()` with `selectNextUnit()`.

Be careful: `selectNextUnit()` should NOT be called if the current unit still has movement points left. Only call it when the unit's turn is done.

### Step 6: Auto-select first unit at start of turn

- [ ] In `src/main.ts`, at the end of the `endTurn()` function, after the turn is processed and the HUD is updated (around line 716-717 for solo mode, and in the `onReady` callback for hot seat around line 701-702), call `selectNextUnit()`.

- [ ] Run: `yarn test` and `yarn build`

---

## Task 4: Notification System Overhaul (#20)

**Problem:** Notifications auto-dismiss after 4 seconds with no queue. There are 43+ calls to `showNotification()`. Multiple events fire per turn end, creating a wall of toasts that vanish before reading. Begin-of-turn messages are especially bad.

**Fix:** Replace the fire-and-forget toast system with a sequential notification queue + notification log. Notifications display one at a time with longer timeouts. A tap dismisses the current notification and shows the next. A small "history" button lets the player scroll through past notifications.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/core/types.ts`

### Step 1: Add NotificationEntry type

- [ ] In `src/core/types.ts`, add near the other UI-related types:

```typescript
export interface NotificationEntry {
  message: string;
  type: 'info' | 'success' | 'warning';
  turn: number;
}
```

### Step 2: Rewrite showNotification in main.ts

- [ ] In `src/main.ts`, replace the current `showNotification()` function (lines 153-176) with a queue-based system:

```typescript
const notificationQueue: Array<{ message: string; type: 'info' | 'success' | 'warning' }> = [];
const notificationLog: NotificationEntry[] = [];
let isShowingNotification = false;

function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  notificationQueue.push({ message, type });
  notificationLog.push({ message, type, turn: gameState?.turn ?? 0 });
  // Keep log from growing unbounded
  if (notificationLog.length > 50) notificationLog.shift();
  if (!isShowingNotification) displayNextNotification();
}

function displayNextNotification(): void {
  const area = document.getElementById('notifications');
  if (!area) return;

  const next = notificationQueue.shift();
  if (!next) {
    isShowingNotification = false;
    return;
  }

  isShowingNotification = true;
  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };
  const notif = document.createElement('div');
  notif.style.cssText = `background:${colors[next.type]}ee;color:#1a1a2e;padding:10px 14px;border-radius:10px;font-size:12px;cursor:pointer;transition:opacity 0.3s;max-width:90%;`;
  notif.textContent = next.message;

  // Show queue count if more pending
  if (notificationQueue.length > 0) {
    const badge = document.createElement('span');
    badge.style.cssText = 'margin-left:8px;font-size:10px;opacity:0.7;';
    badge.textContent = `(${notificationQueue.length} more)`;
    notif.appendChild(badge);
  }

  const dismiss = () => {
    notif.style.opacity = '0';
    setTimeout(() => {
      notif.remove();
      displayNextNotification();
    }, 200);
  };

  notif.addEventListener('click', dismiss);
  // Clear any existing notifications in the area
  area.innerHTML = '';
  area.appendChild(notif);

  // Auto-dismiss after 6 seconds (longer than before)
  setTimeout(() => {
    if (notif.parentNode) dismiss();
  }, 6000);

  SFX.notification();
}
```

### Step 3: Add notification log button

- [ ] In `src/main.ts`, in the `createUI()` function, add a small "Log" button in the notification area that opens a scrollable history panel:

After creating the notification area div (`notifArea`), add:

```typescript
const logBtn = document.createElement('button');
logBtn.textContent = '📜';
logBtn.style.cssText = 'position:absolute;top:40px;right:12px;z-index:21;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:14px;padding:4px 8px;cursor:pointer;';
logBtn.addEventListener('click', () => toggleNotificationLog());
uiLayer.appendChild(logBtn);
```

Add the `toggleNotificationLog()` function:

```typescript
function toggleNotificationLog(): void {
  const existing = document.getElementById('notification-log');
  if (existing) { existing.remove(); return; }

  const uiLayer = document.getElementById('ui-layer');
  if (!uiLayer) return;

  const panel = document.createElement('div');
  panel.id = 'notification-log';
  panel.style.cssText = 'position:absolute;top:70px;right:12px;width:280px;max-height:300px;overflow-y:auto;background:rgba(10,10,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:10px;z-index:25;padding:12px;';

  let html = '<div style="font-size:13px;color:#e8c170;margin-bottom:8px;display:flex;justify-content:space-between;"><span>Message Log</span><span id="close-log" style="cursor:pointer;opacity:0.6;">✕</span></div>';
  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };

  // Show most recent first
  for (let i = notificationLog.length - 1; i >= 0; i--) {
    const entry = notificationLog[i];
    html += `<div style="font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);"><span style="color:${colors[entry.type]};opacity:0.7;">T${entry.turn}</span> ${entry.message}</div>`;
  }

  if (notificationLog.length === 0) {
    html += '<div style="font-size:11px;opacity:0.5;text-align:center;">No messages yet</div>';
  }

  panel.innerHTML = html;
  uiLayer.appendChild(panel);

  document.getElementById('close-log')?.addEventListener('click', () => panel.remove());
  // Close on tap outside after a brief delay
  setTimeout(() => {
    const handler = (e: Event) => {
      if (!panel.contains(e.target as Node)) {
        panel.remove();
        document.removeEventListener('click', handler);
      }
    };
    document.addEventListener('click', handler);
  }, 100);
}
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 5: Movement & Attack Highlighting (#4)

**Problem:** When a unit is selected, the movement range is calculated (`main.ts:333`) but **never rendered on screen**. The `drawHexHighlight()` function exists in `hex-renderer.ts` but is never called from the render loop. Players literally cannot see where their unit can move or which hexes would trigger an attack. This is the primary reason combat is confusing.

**Fix:** Pass movement/attack data to the render loop. Render blue highlights for move-to hexes and red highlights for attack-target hexes. When a unit is selected, the cursor (tap target) on enemy-occupied hexes within range shows a red attack indicator.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/renderer/hex-renderer.ts`
- Create: `tests/renderer/movement-highlights.test.ts`

### Step 1: Add highlight state to RenderLoop

- [ ] In `src/renderer/render-loop.ts`, add a public field for highlights:

```typescript
import { drawHexHighlight } from './hex-renderer';
import { hexToPixel } from '@/systems/hex-utils';
import type { HexCoord } from '@/core/types';

export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack';
}
```

Add a field to the `RenderLoop` class:

```typescript
private highlights: HexHighlight[] = [];

setHighlights(highlights: HexHighlight[]): void {
  this.highlights = highlights;
}

clearHighlights(): void {
  this.highlights = [];
}
```

### Step 2: Render highlights in the render loop

- [ ] In `src/renderer/render-loop.ts`, in the `render()` method, after `drawHexMap()` and rivers/territory but **before** `drawCities()` and `drawUnits()` (so highlights appear behind units), add:

```typescript
// Draw movement/attack highlights
for (const highlight of this.highlights) {
  if (!this.camera.isHexVisible(highlight.coord)) continue;
  const pixel = hexToPixel(highlight.coord, this.camera.hexSize);
  const screen = this.camera.worldToScreen(pixel.x, pixel.y);
  const scaledSize = this.camera.hexSize * this.camera.zoom;
  const color = highlight.type === 'move' ? 'rgba(74, 144, 217, 0.3)' : 'rgba(217, 74, 74, 0.4)';
  drawHexHighlight(this.ctx, screen.x, screen.y, scaledSize, color);
}
```

### Step 3: Classify movement range into move vs attack in main.ts

- [ ] In `src/main.ts`, in the `selectUnit()` function, after `movementRange = getMovementRange(...)` (line 333), classify each hex as move or attack:

```typescript
// Classify hexes as move or attack targets
const highlights: HexHighlight[] = movementRange.map(coord => {
  const key = hexKey(coord);
  const occupantId = unitPositions[key];
  if (occupantId && unitOwners[occupantId] !== gameState.currentPlayer) {
    return { coord, type: 'attack' as const };
  }
  return { coord, type: 'move' as const };
});
renderLoop.setHighlights(highlights);
```

Import `HexHighlight` from `render-loop.ts`.

### Step 4: Clear highlights on deselect

- [ ] In `src/main.ts`, in `deselectUnit()` (around line 369), add:

```typescript
renderLoop.clearHighlights();
```

Also clear highlights at the start of `selectUnit()` to prevent stale highlights from a previous selection.

### Step 5: Add combat prediction tooltip

- [ ] In `src/main.ts`, when the player taps an enemy unit that's within attack range (around line 477 where the attack check happens), show a brief prediction before the attack:

Actually, to keep this simple and mobile-friendly, instead of a pre-attack confirmation, enhance the **enemy unit info panel** (lines 455-466) to include a predicted combat outcome when one of our units is selected:

```typescript
if (!selectedUnitId) {
  // Existing enemy info display (no changes)
} else {
  // Show combat preview
  const attacker = gameState.units[selectedUnitId];
  const seed = gameState.turn * 16807 + attacker.id.charCodeAt(0) + enemyUnit.id.charCodeAt(0);
  // Don't actually resolve — just show strength comparison
  const atkDef = UNIT_DEFINITIONS[attacker.type];
  const defDef = UNIT_DEFINITIONS[enemyUnit.type];
  const atkStr = Math.round(atkDef.strength * (attacker.health / 100));
  const defStr = Math.round(defDef.strength * (enemyUnit.health / 100));
  const odds = atkStr > defStr ? 'Favorable' : atkStr === defStr ? 'Even' : 'Risky';
  const oddsColor = atkStr > defStr ? '#6b9b4b' : atkStr === defStr ? '#e8c170' : '#d94a4a';
}
```

Actually, this gets complex. Let's keep the simple approach: the red hex highlighting already tells the player "you can attack here." But let's add the combat preview to the info panel. When a unit is selected AND an enemy is tapped that's in range, show a brief combat preview panel before attacking:

In the `handleHexTap()` function, in the section where it handles attack (around line 477), wrap the attack logic in a confirmation UI if it's the player's first combat ever. After the first combat, just do the attack directly. 

**Simplest approach:** When the player taps a red-highlighted (attack) hex, show the enemy unit info WITH a strength comparison and an "Attack" button, rather than auto-attacking. This gives the player a chance to see the odds and back out.

Modify the attack code at line 477 to show a combat preview panel instead of immediately resolving:

```typescript
if (unitAtHex && unitAtHex[1].owner !== gameState.currentPlayer) {
  const attacker = gameState.units[selectedUnitId];
  const defender = unitAtHex[1];
  const atkDef = UNIT_DEFINITIONS[attacker.type];
  const defDef = UNIT_DEFINITIONS[defender.type];
  const atkStr = Math.round(atkDef.strength * (attacker.health / 100));
  const defTile = gameState.map.tiles[hexKey(defender.position)];
  const terrainBonus = defTile ? getTerrainDefenseBonus(defTile.terrain) : 0;
  const defStr = Math.round(defDef.strength * (defender.health / 100) * (1 + terrainBonus));

  const ownerName = defender.owner === 'barbarian' ? 'Barbarian' :
    (gameState.civilizations[defender.owner]?.name ?? defender.owner);

  const odds = atkStr > defStr ? 'Favorable' : atkStr === defStr ? 'Even' : 'Risky';
  const oddsColor = atkStr > defStr ? '#6b9b4b' : atkStr === defStr ? '#e8c170' : '#d94a4a';

  const panel = document.getElementById('info-panel');
  if (panel) {
    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="background:rgba(100,0,0,0.9);border-radius:12px;padding:12px 16px;">
        <div style="font-size:13px;color:#e8c170;margin-bottom:6px;">Combat Preview</div>
        <div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:8px;">
          <div>⚔️ ${atkDef.name} (${atkStr})</div>
          <div style="color:${oddsColor};font-weight:bold;">${odds}</div>
          <div>🛡️ ${defDef.name} (${defStr})</div>
        </div>
        <div style="font-size:10px;opacity:0.6;margin-bottom:8px;">${ownerName} · HP: ${defender.health}/100${terrainBonus > 0 ? ` · +${Math.round(terrainBonus * 100)}% terrain defense` : ''}</div>
        <div style="display:flex;gap:8px;">
          <button id="btn-attack" style="flex:1;padding:8px;border-radius:8px;background:#d94a4a;border:none;color:white;font-weight:bold;cursor:pointer;">Attack</button>
          <button id="btn-cancel-attack" style="flex:1;padding:8px;border-radius:8px;background:rgba(255,255,255,0.15);border:none;color:white;cursor:pointer;">Cancel</button>
        </div>
      </div>
    `;

    document.getElementById('btn-cancel-attack')?.addEventListener('click', deselectUnit);
    document.getElementById('btn-attack')?.addEventListener('click', () => {
      executeAttack(selectedUnitId!, unitAtHex[0], unitAtHex[1], key);
    });
    return; // Don't auto-attack — wait for button press
  }
}
```

Import `getTerrainDefenseBonus` from `combat-system.ts`.

### Step 6: Extract attack logic into executeAttack()

- [ ] Extract the existing attack code (lines ~479-556) into a new `executeAttack(attackerId, defenderId, defender, targetKey)` function. This is the code that handles war declaration, combat resolution, damage application, camp destruction, and city capture. Move it verbatim into the new function and call it from the Attack button handler.

The function signature:

```typescript
function executeAttack(attackerId: string, defenderId: string, defender: Unit, targetKey: string): void {
  // ... existing attack logic moved here ...
  // At the end, call selectNextUnit() instead of deselectUnit()
}
```

### Step 7: Write tests

- [ ] Create `tests/renderer/movement-highlights.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';

describe('movement highlights (#4)', () => {
  it('classifies empty reachable hexes as move', () => {
    // Test that hexes without enemy units get type 'move'
  });

  it('classifies enemy-occupied hexes as attack', () => {
    // Test that hexes with enemy units get type 'attack'
  });

  it('classifies friendly-occupied hexes correctly', () => {
    // Friendly hexes should not appear in movement range at all (handled by getMovementRange)
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 6: Stone Age Combat Balance (#14)

**Problem:** Early-game combat between warriors (strength 10) takes too many rounds. With base damage 30-50 and the strength ratio formula, evenly matched warriors deal ~15-25 damage per attack. That's 4-5 attacks to kill a full-health unit — spread across multiple turns, it's tedious.

**Current formula** (`src/systems/combat-system.ts:77-95`):
- `baseDamage = 30 + rng() * 20` (range 30-50)
- `defenderDamage = baseDamage * adjustedRatio` (where adjustedRatio ≈ 0.5 for even strength)
- Result: ~15-25 damage per attack for equal-strength units

**Fix:** Increase base damage for Stone Age era so early combat resolves in 2-3 attacks. Scale damage by era — early eras deal proportionally more damage so fights are quick and decisive.

**Files:**
- Modify: `src/systems/combat-system.ts`

### Step 1: Add era-scaled damage

- [ ] In `src/systems/combat-system.ts`, modify the `resolveCombat` function. Add an optional `era` parameter:

```typescript
export function resolveCombat(
  attacker: Unit,
  defender: Unit,
  map: GameMap,
  seed?: number,
  context?: CombatContext,
  era?: number,
): CombatResult {
```

Change the base damage calculation (line 86) to scale with era:

```typescript
// Era-scaled base damage: early eras deal more proportional damage for faster combat
// Era 0-1 (Stone/Tribal): 45-70, Era 2 (Bronze): 40-60, Era 3+ (Iron+): 30-50
const eraScale = era !== undefined && era <= 1 ? 1.5 : era === 2 ? 1.2 : 1.0;
const baseDamage = (30 + rng() * 20) * eraScale;
```

This means Stone Age warrior vs warrior deals ~22-35 damage per attack, resolving in 2-3 rounds.

### Step 2: Pass era from callers

- [ ] In `src/main.ts`, where `resolveCombat` is called (inside `executeAttack()` or the current attack code), pass `gameState.era`:

```typescript
const result = resolveCombat(unit, unitAtHex[1], gameState.map, seed, undefined, gameState.era);
```

- [ ] In `src/core/turn-manager.ts`, where `resolveCombat` is called for barbarian/AI combat, pass `state.era`:

```typescript
const result = resolveCombat(attacker, defender, newState.map, seed, undefined, newState.era);
```

- [ ] In `src/ai/basic-ai.ts`, where `resolveCombat` is called (around line 94), pass `newState.era`:

```typescript
const result = resolveCombat(unit, occupant, newState.map, seed, undefined, newState.era);
```

### Step 3: Verify balance

- [ ] Run existing combat tests to ensure they still pass. Add a test to `tests/systems/playtest-fixes.test.ts`:

```typescript
import { resolveCombat } from '@/systems/combat-system';
import { createUnit } from '@/systems/unit-system';

describe('Stone Age combat balance (#14)', () => {
  it('stone age warrior vs warrior resolves in 2-3 hits', () => {
    // Simulate multiple combats with different seeds
    let totalHitsToKill = 0;
    const trials = 20;

    for (let i = 0; i < trials; i++) {
      const attacker = createUnit('warrior', 'player', { q: 0, r: 0 });
      const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 });
      const map = { width: 10, height: 10, tiles: { '1,0': { coord: { q: 1, r: 0 }, terrain: 'plains', elevation: 'flat', resource: null, improvement: 'none', improvementTurnsLeft: 0, owner: null, hasRiver: false } }, wrapsHorizontally: false, rivers: [] };

      let hits = 0;
      let hp = 100;
      while (hp > 0 && hits < 10) {
        const result = resolveCombat(
          { ...attacker, health: 100 },
          { ...defender, health: hp },
          map as any,
          i * 1000 + hits,
          undefined,
          0, // Stone Age
        );
        hp -= result.defenderDamage;
        hits++;
      }
      totalHitsToKill += hits;
    }

    const avgHits = totalHitsToKill / trials;
    expect(avgHits).toBeGreaterThanOrEqual(2);
    expect(avgHits).toBeLessThanOrEqual(4);
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 7: Map Edge Rendering Fix (#37)

**Problem:** The map is cylindrical (`wrapsHorizontally: true`) but the renderer doesn't draw tiles across the wrap boundary. This creates visible empty columns on the left and right edges of the map — a dark background strip that looks broken.

**Current behavior:** `drawHexMap()` in `src/renderer/hex-renderer.ts:67` iterates all tiles and checks `camera.isHexVisible()`. Tiles at q=0 and q=width-1 render fine, but when the camera pans to show the "other side" of the wrap, there are no tiles to draw there.

**Fix:** In the hex rendering loop, for tiles near the map edges, also render "ghost" copies at their wrapped positions. This means a tile at q=0 also gets drawn at q=mapWidth (and vice versa), creating a seamless wrap.

**Files:**
- Modify: `src/renderer/hex-renderer.ts`

### Step 1: Modify drawHexMap to render wrap ghosts

- [ ] In `src/renderer/hex-renderer.ts`, in `drawHexMap()` (line 58), after the main tile rendering loop, add a second pass for wrap-around tiles. Alternatively, modify the loop to also check wrapped coordinates.

The cleanest approach: after the existing for-of loop over tiles, add wrap rendering:

```typescript
// Render wrap-around ghost tiles for seamless horizontal wrapping
if (map.wrapsHorizontally) {
  for (const tile of Object.values(map.tiles)) {
    // Ghost at +width (right side wraps to show left-side tiles)
    const ghostRight: HexCoord = { q: tile.coord.q + map.width, r: tile.coord.r };
    if (camera.isHexVisible(ghostRight)) {
      const pixel = hexToPixel(ghostRight, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;
      const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
      drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer);
      if (shouldShowTerrainLabel(camera.zoom)) {
        const label = getTerrainLabel(tile.terrain);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.font = `${Math.round(scaledSize * 0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, screen.x, screen.y + scaledSize * 0.45);
      }
    }

    // Ghost at -width (left side wraps to show right-side tiles)
    const ghostLeft: HexCoord = { q: tile.coord.q - map.width, r: tile.coord.r };
    if (camera.isHexVisible(ghostLeft)) {
      const pixel = hexToPixel(ghostLeft, size);
      const screen = camera.worldToScreen(pixel.x, pixel.y);
      const scaledSize = size * camera.zoom;
      const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
      drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer);
      if (shouldShowTerrainLabel(camera.zoom)) {
        const label = getTerrainLabel(tile.terrain);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.font = `${Math.round(scaledSize * 0.22)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, screen.x, screen.y + scaledSize * 0.45);
      }
    }
  }
}
```

**Performance note:** This doubles tile iteration, but tiles outside the viewport are culled by `camera.isHexVisible()`. Only edge tiles that wrap into view are drawn — typically a thin column. This should be fine.

### Step 2: Also wrap rivers, units, cities, fog

- [ ] Apply the same ghost rendering to `drawRivers()` in the same file. For rivers where either endpoint is near the edge, also draw the river at the wrapped position.

- [ ] In `src/renderer/render-loop.ts`, the wrap rendering needs to also apply to units, cities, and fog near the edges. The simplest approach: in `render-loop.ts`, check if the camera is looking near a map edge and offset entity positions accordingly. 

However, this is complex to do for all renderers. **A simpler approach for now:** clamp the camera pan so it doesn't go past the edge. This means the player can't see the "other side" by panning, which avoids the gap. Then later, full wrap rendering can be added.

Actually, the user specifically said "The world is supposed to wrap left/right (east/west)" and the screenshot shows the gap. Let me go with the full approach but keep it focused:

**Practical approach:** Only wrap the hex map rendering (Task 7 Step 1 handles this). For units, cities, and fog near the wrap boundary, also render ghosts. Add a helper:

```typescript
function getWrapOffsets(map: GameMap): number[] {
  return map.wrapsHorizontally ? [0, map.width, -map.width] : [0];
}
```

Then in `render-loop.ts`, when calling `drawUnits` and `drawCities`, also pass information about wrapping so they can render ghost copies. This requires modifying each renderer.

**For this fix, focus on the most visible issue: the hex terrain rendering.** Units and cities at the very edge are rare. Add a TODO comment for unit/city/fog wrap rendering.

### Step 3: Handle tap-to-coordinate wrapping

- [ ] In `src/main.ts`, when converting a screen tap to hex coordinates, the coordinate needs to be wrapped back to canonical range. After getting `coord` from `pixelToHex()`, apply:

```typescript
import { wrapHexCoord } from '@/systems/hex-utils';
// ... after converting tap to hex coordinate:
const wrappedCoord = gameState.map.wrapsHorizontally
  ? wrapHexCoord(coord, gameState.map.width)
  : coord;
```

Check if this is already being done. Search for where `pixelToHex` is called in `main.ts` and ensure the result is wrapped.

- [ ] Run: `yarn test` and `yarn build`

---

## Task 8: Grid View Help Text (#31)

**Problem:** The city panel has a "Grid" tab that shows a 5x5 building placement grid, but there's no explanation of what it is or how to use it. The user says "Not sure what it is, what to do with it, or really anything about it."

**Fix:** Add a brief description at the top of the grid view explaining what it is, and add tap-to-explain on grid slots.

**Files:**
- Modify: `src/ui/city-grid.ts`

### Step 1: Add help text to grid view

- [ ] In `src/ui/city-grid.ts`, in the `createCityGrid()` function (line 50), at the top of the `html` string (before the grid div), add a brief explanation:

Change line 76 from:
```typescript
let html = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;max-width:380px;margin:0 auto;">';
```

To:
```typescript
let html = `
  <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:10px;padding:0 4px;line-height:1.4;">
    <strong style="color:#e8c170;">City Layout</strong> — Tap empty slots to place buildings. Adjacent buildings can boost each other. Edge slots show the terrain they sit on.
    ${suggestedBuilding ? `<div style="color:#e8c170;margin-top:4px;">✨ Suggested: <strong>${suggestedBuilding}</strong></div>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;max-width:380px;margin:0 auto;">`;
```

### Step 2: Add tooltip on building tap

- [ ] In the building slot rendering (around line 103-122 in `createCityGrid()`), make built buildings tappable to show info. Add a `data-building` attribute to built building divs:

Add `class="grid-building" data-building="${building}"` to the built building div.

After the existing click handler setup (line 164-178), add:

```typescript
panel.querySelectorAll('.grid-building').forEach(el => {
  el.addEventListener('click', () => {
    const buildingId = (el as HTMLElement).dataset.building!;
    const bDef = BUILDINGS[buildingId];
    if (!bDef) return;
    const yields: string[] = [];
    if (bDef.yields.food > 0) yields.push(`+${bDef.yields.food} food`);
    if (bDef.yields.production > 0) yields.push(`+${bDef.yields.production} production`);
    if (bDef.yields.gold > 0) yields.push(`+${bDef.yields.gold} gold`);
    if (bDef.yields.science > 0) yields.push(`+${bDef.yields.science} science`);
    const yieldText = yields.length > 0 ? yields.join(', ') : 'no direct yields';
    alert(`${bDef.name}: ${bDef.description}\nYields: ${yieldText}`);
  });
});
```

Note: Using `alert()` is simple and works on mobile. If we want something prettier, we could use `showNotification()` but that requires importing it or passing it as a callback. For now, `alert()` is fine — it's a tooltip, not a game action.

Actually, better approach — show it inline in the grid panel instead of an alert. Add a detail area below the grid:

After the grid div, add: `html += '<div id="grid-detail" style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.6);min-height:30px;padding:0 4px;"></div>';`

Then in the click handler, instead of `alert()`:

```typescript
const detailEl = panel.querySelector('#grid-detail');
if (detailEl) {
  detailEl.innerHTML = `<strong style="color:#e8c170;">${bDef.name}</strong>: ${bDef.description}<br>Yields: ${yieldText}`;
}
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 9: Unit Introspection (#26)

**Problem:** The user can't get information on enemy units or their own units easily. Tapping an enemy unit when no friendly unit is selected does show basic info (`main.ts:446-466`), but the info is minimal (name, HP, strength). The user wants to know: "What is this? Is this a barbarian? Whose troop is this?"

**Current behavior:** Tapping an enemy unit shows: `"[Owner] [UnitType] · HP: X/100 · Str: Y"` in a red info panel. This exists but is insufficient.

**Fix:** Enhance the enemy unit info panel with more details: unit type description, owner civ name and color, combat strength context, and a civ-colored border. Also improve the friendly unit info panel with similar enhancements.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/systems/unit-system.ts`

### Step 1: Add unit descriptions to unit-system.ts

- [ ] In `src/systems/unit-system.ts`, add a `UNIT_DESCRIPTIONS` record after `UNIT_DEFINITIONS`:

```typescript
export const UNIT_DESCRIPTIONS: Record<UnitType, string> = {
  settler: 'Civilian unit that can found new cities',
  worker: 'Civilian unit that builds improvements on tiles',
  scout: 'Fast exploration unit with extended vision',
  warrior: 'Basic melee fighter — your first line of defense',
  archer: 'Ranged unit that attacks from a distance',
  swordsman: 'Stronger melee fighter, requires Bronze Working',
  pikeman: 'Anti-cavalry specialist, requires Fortification',
  musketeer: 'Gunpowder infantry, requires Tactics',
  galley: 'Basic naval transport, can navigate coastal waters',
  caravel: 'Ocean-going vessel for deep sea exploration',
  spy: 'Covert agent for espionage missions',
  horseman: 'Fast mounted warrior, good for flanking',
  catapult: 'Siege unit effective against city walls',
};
```

Adjust the UnitType list to match whatever types actually exist in the codebase. Check the `UnitType` union in `types.ts` and cover all of them.

### Step 2: Enhance enemy unit info panel in main.ts

- [ ] In `src/main.ts`, find the enemy unit info display (around line 446-466). Replace the minimal display with a richer panel:

```typescript
// Show enemy unit info (if no unit selected for attack)
if (!selectedUnitId) {
  const enemyUnit = unitAtHex[1];
  const def = UNIT_DEFINITIONS[enemyUnit.type];
  const desc = UNIT_DESCRIPTIONS[enemyUnit.type] ?? '';
  const isBarbarian = enemyUnit.owner === 'barbarian';
  const isMinorCiv = enemyUnit.owner.startsWith('mc-');
  let ownerName: string;
  let ownerColor: string;

  if (isBarbarian) {
    ownerName = 'Barbarian';
    ownerColor = '#8b4513';
  } else if (isMinorCiv) {
    const mcDef = MINOR_CIV_DEFINITIONS.find(d => d.id === gameState.minorCivs[enemyUnit.owner]?.definitionId);
    ownerName = mcDef?.name ?? 'City-State';
    ownerColor = mcDef?.color ?? '#888';
  } else {
    const civ = gameState.civilizations[enemyUnit.owner];
    ownerName = civ?.name ?? enemyUnit.owner;
    ownerColor = civ?.color ?? '#888';
  }

  const atWar = !isBarbarian && !isMinorCiv && currentCiv().diplomacy?.atWarWith.includes(enemyUnit.owner);
  const relationshipTag = isBarbarian ? 'Hostile' : atWar ? 'At War' : 'Neutral';
  const relColor = isBarbarian || atWar ? '#d94a4a' : '#e8c170';

  const panel = document.getElementById('info-panel');
  if (panel) {
    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="background:rgba(40,20,20,0.92);border-radius:12px;padding:12px 16px;border-left:4px solid ${ownerColor};">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <div style="font-size:10px;color:${ownerColor};">${ownerName} <span style="color:${relColor};font-size:9px;">(${relationshipTag})</span></div>
            <strong>${def.name}</strong> · HP: ${enemyUnit.health}/100 · Str: ${def.strength}
          </div>
          <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
        </div>
        <div style="font-size:10px;opacity:0.6;margin-top:4px;">${desc}</div>
      </div>
    `;
    document.getElementById('btn-deselect')?.addEventListener('click', deselectUnit);
  }
  return;
}
```

Import `UNIT_DESCRIPTIONS` from `unit-system.ts` (add to the existing import on line 9).

### Step 3: Enhance friendly unit info panel

- [ ] In `src/main.ts`, in the `selectUnit()` function (around line 347-358), enhance the friendly unit info panel similarly:

```typescript
panel.innerHTML = `
  <div style="background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;border-left:4px solid ${currentCiv().color ?? '#e8c170'};">
    <div style="display:flex;justify-content:space-between;align-items:center;">
      <div>
        <strong>${def.name}</strong> · HP: ${unit.health}/100 · Moves: ${unit.movementPointsLeft}/${def.movementPoints}
      </div>
      <span id="btn-deselect" style="cursor:pointer;font-size:18px;opacity:0.6;">✕</span>
    </div>
    <div style="font-size:10px;opacity:0.6;margin-top:2px;">${UNIT_DESCRIPTIONS[unit.type] ?? ''}</div>
    <div style="margin-top:8px;display:flex;gap:8px;flex-wrap:wrap;">${actions}</div>
  </div>
`;
```

### Step 4: Also show info on tap of empty tile with city

- [ ] Verify that tapping on a city (no unit) already shows city info. If not, this is a separate enhancement. For now, focus on unit introspection.

- [ ] Run: `yarn test` and `yarn build`

---

## Implementation Order

Tasks should be implemented in this order due to dependencies:

1. **Task 1: Save Persistence (#38)** — independent, highest priority
2. **Task 2: Unit Healing (#15)** — adds `isResting` to Unit type, needed by Task 3
3. **Task 3: Unit Cycling (#25)** — depends on Task 2 (rest button integrates with next-unit)
4. **Task 5: Movement & Attack Highlighting (#4)** — depends on Task 3 (selectNextUnit refactors deselect)
5. **Task 4: Notification Overhaul (#20)** — independent, but best after combat changes
6. **Task 6: Combat Balance (#14)** — independent, simple
7. **Task 7: Map Edge Rendering (#37)** — independent, renderer-only
8. **Task 8: Grid View Help (#31)** — independent, simple
9. **Task 9: Unit Introspection (#26)** — independent, simple

Tasks 6-9 are independent and can be parallelized.

---

## Testing Strategy

- Unit tests for healing logic, combat balance, save fallback
- Manual test: play 3 turns on iOS Safari, close tab, reopen — verify save persists
- Manual test: select warrior, verify blue/red hex highlights appear
- Manual test: tap Rest button, end turn, verify HP increases
- Manual test: move all units, verify auto-cycle works
- Manual test: pan to map edge, verify no gap

Run after each task: `yarn test && yarn build`
