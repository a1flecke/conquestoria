# M4-playtest-fixes: Critical Gameplay & UX Fixes

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix 9 critical issues found during playtesting that block casual 5-minute play sessions. These fixes take priority over new M4 features.

**Architecture:** All changes follow existing patterns — event-driven, seeded RNG, serializable state, mobile-first, `currentPlayer`-aware. No new systems; extends existing ones.

**Tech Stack:** TypeScript, Vitest, Canvas 2D, EventBus, IndexedDB

---

## File Structure

| File | Responsibility |
|------|---------------|
| `src/storage/save-manager.ts` | Persistent storage fix: localStorage fallback, visual save indicator (#38) |
| `src/storage/db.ts` | Add `navigator.storage.persist()` call on first open (#38) |
| `src/ui/save-panel.ts` | Add "Export Save" / "Import Save" buttons for manual backup (#38) |
| `src/systems/unit-system.ts` | Add `healUnit()`, `canHeal()`, `restUnit()`, `getUnmovedUnits()` functions (#15, #25) |
| `src/core/turn-manager.ts` | Add auto-heal pass before unit reset (#15) |
| `src/core/types.ts` | Add `isResting` flag to Unit type, `NotificationEntry` type (#15, #20) |
| `src/main.ts` | Unit cycling, rest button, notification rewrite, movement+attack highlighting, auto-save on game start (#25, #15, #20, #4, #26, #38) |
| `src/renderer/render-loop.ts` | Accept and render movement/attack highlights (#4) |
| `src/renderer/hex-renderer.ts` | Extract tile rendering helper, fix map edge rendering with optimized ghost tiles (#37) |
| `src/systems/combat-system.ts` | Tune Stone Age combat damage (#14) |
| `src/ui/city-grid.ts` | Add grid view description/help text and building info on tap (#31) |
| `src/input/touch-handler.ts` | Wrap hex coordinates for cylindrical map (#37) |
| `src/input/mouse-handler.ts` | Wrap hex coordinates for cylindrical map (#37) |
| `src/renderer/camera.ts` | No changes needed — `centerOn(coord: HexCoord)` already exists |
| `tests/systems/playtest-fixes.test.ts` | Unit tests for healing, combat tuning, unit cycling, notifications |
| `tests/renderer/movement-highlights.test.ts` | Tests for highlight classification |
| `tests/storage/save-persistence.test.ts` | Tests for save fallback logic |
| `.claude/rules/end-to-end-wiring.md` | New rule: computed data must be rendered, user actions need feedback (#4, #37) |
| `.claude/rules/strategy-game-mechanics.md` | New rule: core mechanics checklist, balance testing, storage resilience (#15, #26, #14, #38) |
| `.claude/rules/ui-panels.md` | Updated: unit info panel and notification rules (#20, #26) |
| `CLAUDE.md` | Updated: computed-data rendering, map wrapping, XSS prevention rules |

---

## Task 1: Fix Save Persistence (#38)

**Problem:** IndexedDB data is evicted by Safari after short periods (even 24 hours). The title screen shows only "New Game" because `hasAutoSave()` returns false — saves silently vanish. This is the #1 blocker for 5-minute play sessions.

**Root Cause:** The auto-save code (`src/storage/save-manager.ts`) correctly writes to IndexedDB on every end-of-turn (`main.ts:696,723`). Safari evicts IndexedDB storage for web apps that lack persistent storage grants. The `navigator.storage.persist()` API can request durable storage to prevent eviction.

**Fix:** Three-layer approach: (1) request persistent storage on first DB open, (2) localStorage backup for auto-save, (3) JSON file export/import. Also auto-save on game creation so turn-1 closes don't lose the game.

**Files:**
- Modify: `src/storage/db.ts`
- Modify: `src/storage/save-manager.ts`
- Modify: `src/ui/save-panel.ts`
- Modify: `src/main.ts`
- Create: `tests/storage/save-persistence.test.ts`

### Step 1: Request persistent storage in db.ts

- [ ] In `src/storage/db.ts`, add a `requestPersistentStorage()` function and call it from `openDB()` using a guard to ensure it only fires once:

```typescript
let persistRequested = false;

function requestPersistentStorage(): void {
  if (persistRequested) return;
  persistRequested = true;
  // Fire-and-forget — don't block DB operations
  if (navigator.storage?.persist) {
    navigator.storage.persist().then(granted => {
      console.log(granted ? '[save] Persistent storage granted' : '[save] Persistent storage denied — saves may be evicted');
    }).catch(() => { /* not supported */ });
  }
}
```

Add `requestPersistentStorage();` as the first line inside `openDB()`. The guard ensures it only runs once despite `openDB()` being called on every DB operation.

### Step 2: Add localStorage fallback in save-manager.ts

- [ ] In `src/storage/save-manager.ts`, add a localStorage backup that mirrors the auto-save.

Add a constant: `const LOCALSTORAGE_AUTOSAVE_KEY = 'conquestoria-autosave';`

**Note on size:** GameState serialized as JSON can be 1-3MB for a mid-game save. localStorage has a ~5MB limit. This is sufficient for auto-save backup. If quota is exceeded, the fallback silently fails and IndexedDB remains the primary store.

Modify `autoSave()`:

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

Modify `loadAutoSave()` to fall back to localStorage:

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

Update `deleteAutoSave()` to also remove the localStorage backup:

```typescript
export async function deleteAutoSave(): Promise<void> {
  await dbDelete(AUTO_SAVE_KEY);
  try { localStorage.removeItem(LOCALSTORAGE_AUTOSAVE_KEY); } catch { /* ignore */ }
}
```

### Step 3: Add visual save indicator in main.ts

- [ ] In `src/main.ts`, add a `showSaveIndicator()` function:

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

Call `showSaveIndicator()` after each `await autoSave(gameState)` in `endTurn()` (lines 696 and 723).

### Step 4: Auto-save on game creation

- [ ] In `src/main.ts`, in the `startGame()` function (around line 1062), add an auto-save after the game is initialized so the wife doesn't lose her game if she closes before ending turn 1:

```typescript
function startGame(): void {
  centerOnCurrentPlayer();
  renderLoop.setGameState(gameState);
  updateHUD();
  // ... existing input setup ...

  // Auto-save immediately so the game persists even before first end-turn
  autoSave(gameState).catch(() => { /* non-critical */ });
}
```

### Step 5: Add JSON export/import in save-panel.ts

- [ ] In `src/ui/save-panel.ts`, add imports at the top: `import { loadAutoSave, autoSave } from '@/storage/save-manager';`

In `renderStartButtons()`, after the Continue button, add export/import buttons. Only show export if `hasAuto` is true or `saves.length > 0`:

```typescript
${(hasAuto || saves.length > 0) ? `
  <div style="display:flex;gap:8px;justify-content:center;margin-top:8px;">
    <button id="btn-export" style="padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:12px;cursor:pointer;">Export Save</button>
    <label style="padding:8px 14px;border-radius:10px;background:rgba(255,255,255,0.1);border:1px solid rgba(255,255,255,0.2);color:white;font-size:12px;cursor:pointer;">Import Save<input type="file" accept=".json" id="import-file" style="display:none;"></label>
  </div>
` : ''}
```

**Note:** The `saves` variable needs to be passed to `renderStartButtons()`. Update its signature: `function renderStartButtons(hasAuto: boolean, savesCount: number)` and pass `saves.length` from `createSavePanel()`.

Bind the export button in `createSavePanel()`:

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
    // Validate critical fields exist
    if (typeof state.turn !== 'number' || !state.civilizations || !state.map?.tiles || !state.units) {
      throw new Error('Invalid save');
    }
    await autoSave(state);
    panel.remove();
    callbacks.onContinue();
  } catch {
    alert('Invalid save file — could not load');
  }
});
```

### Step 6: Write tests

- [ ] Create `tests/storage/save-persistence.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { autoSave, loadAutoSave, hasAutoSave, deleteAutoSave } from '@/storage/save-manager';
import * as db from '@/storage/db';

vi.mock('@/storage/db');

const LOCALSTORAGE_KEY = 'conquestoria-autosave';

describe('save persistence (#38)', () => {
  const mockState = {
    turn: 5,
    civilizations: { player: { name: 'Test' } },
    map: { tiles: {}, width: 10, height: 10, wrapsHorizontally: true, rivers: [] },
    units: {},
  } as any;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  it('autoSave writes to both IndexedDB and localStorage', async () => {
    vi.mocked(db.dbPut).mockResolvedValue(undefined);
    await autoSave(mockState);
    expect(db.dbPut).toHaveBeenCalledWith('autosave', mockState);
    expect(localStorage.getItem(LOCALSTORAGE_KEY)).not.toBeNull();
    expect(JSON.parse(localStorage.getItem(LOCALSTORAGE_KEY)!).turn).toBe(5);
  });

  it('loadAutoSave returns IDB save when available', async () => {
    vi.mocked(db.dbGet).mockResolvedValue(mockState);
    const result = await loadAutoSave();
    expect(result).toEqual(mockState);
  });

  it('loadAutoSave falls back to localStorage when IDB returns undefined', async () => {
    vi.mocked(db.dbGet).mockResolvedValue(undefined);
    vi.mocked(db.dbPut).mockResolvedValue(undefined);
    localStorage.setItem(LOCALSTORAGE_KEY, JSON.stringify(mockState));
    const result = await loadAutoSave();
    expect(result).toEqual(mockState);
    // Should re-populate IDB
    expect(db.dbPut).toHaveBeenCalledWith('autosave', mockState);
  });

  it('loadAutoSave returns undefined when both stores empty', async () => {
    vi.mocked(db.dbGet).mockResolvedValue(undefined);
    const result = await loadAutoSave();
    expect(result).toBeUndefined();
  });

  it('hasAutoSave checks localStorage fallback', async () => {
    vi.mocked(db.dbGet).mockResolvedValue(undefined);
    expect(await hasAutoSave()).toBe(false);
    localStorage.setItem(LOCALSTORAGE_KEY, '{}');
    expect(await hasAutoSave()).toBe(true);
  });

  it('deleteAutoSave clears both stores', async () => {
    vi.mocked(db.dbDelete).mockResolvedValue(undefined);
    localStorage.setItem(LOCALSTORAGE_KEY, '{}');
    await deleteAutoSave();
    expect(db.dbDelete).toHaveBeenCalledWith('autosave');
    expect(localStorage.getItem(LOCALSTORAGE_KEY)).toBeNull();
  });

  it('autoSave handles localStorage quota exceeded gracefully', async () => {
    vi.mocked(db.dbPut).mockResolvedValue(undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota exceeded');
    });
    // Should not throw
    await autoSave(mockState);
    expect(db.dbPut).toHaveBeenCalled();
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 2: Unit Healing (#15)

**Problem:** No general healing mechanic exists. Damaged units stay damaged forever (except Rohan cavalry on grasslands and wonder-specific healing). Combat feels punishing and units feel disposable.

**Fix:** Two healing modes: (1) **Auto-heal** — units that didn't move or attack this turn recover HP passively at end of turn. (2) **Explicit Rest action** — a "Rest & Heal" button on the unit info panel that skips the unit's turn and heals more. Healing is faster in friendly territory and in cities. All unit types can rest (workers get hurt by tribal village illness).

**Files:**
- Modify: `src/core/types.ts`
- Modify: `src/systems/unit-system.ts`
- Modify: `src/core/turn-manager.ts`
- Modify: `src/main.ts`
- Create: `tests/systems/playtest-fixes.test.ts`

### Step 1: Add isResting flag to Unit type

- [ ] In `src/core/types.ts`, in the `Unit` interface (line 114), add `isResting: boolean;` after the `hasActed` field (line 123):

```typescript
export interface Unit {
  id: string;
  type: UnitType;
  owner: string;
  position: HexCoord;
  movementPointsLeft: number;
  health: number;
  experience: number;
  hasMoved: boolean;
  hasActed: boolean;
  isResting: boolean;     // true when unit chose Rest & Heal action
}
```

### Step 2: Add healing functions to unit-system.ts

- [ ] In `src/systems/unit-system.ts`, add these constants and functions after the existing `resetUnitTurn()` function (after line 93):

```typescript
/** Base healing rates */
export const HEAL_PASSIVE = 5;         // HP per turn if unit didn't move
export const HEAL_REST = 15;           // HP per turn if unit chose to Rest
export const HEAL_FRIENDLY_BONUS = 5;  // Extra HP in friendly territory
export const HEAL_CITY_BONUS = 10;     // Extra HP when inside a city

export function canHeal(unit: Unit): boolean {
  return unit.health < 100 && unit.movementPointsLeft > 0 && !unit.hasMoved;
}

export function restUnit(unit: Unit): Unit {
  return {
    ...unit,
    isResting: true,
    hasMoved: true,
    hasActed: true,
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

### Step 3: Update createUnit and resetUnitTurn to include isResting

- [ ] In `src/systems/unit-system.ts`, in `createUnit()` (around line 59-71), add `isResting: false` after `hasActed: false` (line 69).

- [ ] In `resetUnitTurn()` (line 86-92), add `isResting: false` after `hasActed: false` (line 91):

```typescript
export function resetUnitTurn(unit: Unit): Unit {
  return {
    ...unit,
    movementPointsLeft: UNIT_DEFINITIONS[unit.type].movementPoints,
    hasMoved: false,
    hasActed: false,
    isResting: false,
  };
}
```

### Step 4: Process healing in turn-manager.ts

- [ ] In `src/core/turn-manager.ts`, import `healUnit` from `@/systems/unit-system` (add to existing import on line 3).

**CRITICAL: The healing pass MUST come BEFORE `resetUnitTurn`.** The healing logic checks `hasMoved` and `isResting`, which get cleared by `resetUnitTurn`. Insert the healing loop BEFORE line 110 ("Reset unit movement"):

```typescript
    // Heal units that didn't move this turn (MUST run before resetUnitTurn clears hasMoved/isResting)
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

    // Reset unit movement (existing code at line 110)
```

The Rohan cavalry heal is a separate civ bonus processed elsewhere — it stacks with generic healing. Verify no double-counting.

### Step 5: Add Rest button to unit info panel in main.ts

- [ ] In `src/main.ts`, add `canHeal`, `restUnit` to the import from `@/systems/unit-system` (line 9).

In the `selectUnit()` function (around line 321), after the existing action buttons (found city, build farm, build mine), add a Rest button. **All unit types can rest** (workers get hurt by tribal village illness):

```typescript
if (canHeal(unit)) {
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
  selectNextUnit();
});
```

Note: calls `selectNextUnit()` from Task 3 — if implementing in order, temporarily use `deselectUnit()` and replace after Task 3.

### Step 6: Write tests

- [ ] In `tests/systems/playtest-fixes.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { canHeal, restUnit, healUnit, resetUnitTurn, resetUnitId,
  HEAL_PASSIVE, HEAL_REST, HEAL_FRIENDLY_BONUS, HEAL_CITY_BONUS } from '@/systems/unit-system';
import type { Unit } from '@/core/types';

describe('unit healing (#15)', () => {
  beforeEach(() => resetUnitId());

  const makeUnit = (overrides: Partial<Unit> = {}): Unit => ({
    id: 'unit-1', type: 'warrior', owner: 'player',
    position: { q: 0, r: 0 }, movementPointsLeft: 2,
    health: 60, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  });

  it('canHeal returns true for damaged unmoved unit', () => {
    expect(canHeal(makeUnit())).toBe(true);
  });

  it('canHeal returns false for full health', () => {
    expect(canHeal(makeUnit({ health: 100 }))).toBe(false);
  });

  it('canHeal returns false for moved unit', () => {
    expect(canHeal(makeUnit({ hasMoved: true, movementPointsLeft: 0 }))).toBe(false);
  });

  it('canHeal returns true for damaged worker', () => {
    expect(canHeal(makeUnit({ type: 'worker', health: 80 }))).toBe(true);
  });

  it('restUnit sets isResting, hasMoved, hasActed and consumes movement', () => {
    const rested = restUnit(makeUnit());
    expect(rested.isResting).toBe(true);
    expect(rested.hasMoved).toBe(true);
    expect(rested.hasActed).toBe(true);
    expect(rested.movementPointsLeft).toBe(0);
  });

  it('healUnit passive heals unmoved unit', () => {
    const healed = healUnit(makeUnit(), false, false);
    expect(healed.health).toBe(60 + HEAL_PASSIVE);
  });

  it('healUnit rest heals more than passive', () => {
    const resting = makeUnit({ isResting: true, hasMoved: true });
    const healed = healUnit(resting, false, false);
    expect(healed.health).toBe(60 + HEAL_REST);
  });

  it('healUnit adds friendly territory bonus', () => {
    const healed = healUnit(makeUnit(), true, false);
    expect(healed.health).toBe(60 + HEAL_PASSIVE + HEAL_FRIENDLY_BONUS);
  });

  it('healUnit adds city bonus stacked with territory', () => {
    const healed = healUnit(makeUnit(), true, true);
    expect(healed.health).toBe(60 + HEAL_PASSIVE + HEAL_FRIENDLY_BONUS + HEAL_CITY_BONUS);
  });

  it('healUnit caps at 100', () => {
    const healed = healUnit(makeUnit({ health: 98 }), true, true);
    expect(healed.health).toBe(100);
  });

  it('healUnit skips moved units that are not resting', () => {
    const moved = makeUnit({ hasMoved: true });
    expect(healUnit(moved, false, false).health).toBe(60);
  });

  it('resetUnitTurn clears isResting', () => {
    const resting = makeUnit({ isResting: true, hasMoved: true, movementPointsLeft: 0 });
    const reset = resetUnitTurn(resting);
    expect(reset.isResting).toBe(false);
    expect(reset.hasMoved).toBe(false);
    expect(reset.movementPointsLeft).toBeGreaterThan(0);
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

### Step 1: Add getUnmovedUnits to unit-system.ts

- [ ] In `src/systems/unit-system.ts`, add after the healing functions:

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

- [ ] In `src/main.ts`, add `getUnmovedUnits` to the import from `@/systems/unit-system` (line 9).

After the `deselectUnit()` function (around line 369), add:

```typescript
function selectNextUnit(): void {
  const unmoved = getUnmovedUnits(gameState.units, gameState.currentPlayer);
  if (unmoved.length === 0) {
    deselectUnit();
    return;  // Silent — no annoying "all units moved" message
  }

  // Pick the next unit after the currently selected one
  let nextUnit: Unit;
  if (selectedUnitId) {
    const currentIdx = unmoved.findIndex(u => u.id === selectedUnitId);
    nextUnit = unmoved[(currentIdx + 1) % unmoved.length];
  } else {
    nextUnit = unmoved[0];
  }

  selectUnit(nextUnit.id);
  renderLoop.camera.centerOn(nextUnit.position);
}
```

**Note:** `Camera.centerOn()` already takes a `HexCoord` directly (see `camera.ts:25`). No wrapper function needed.

### Step 3: Add "Next Unit" button to bottom bar

- [ ] In `src/main.ts`, in the `createUI()` function (search for `bottomBar`), add a "Next" button **before** the End Turn button:

```typescript
bottomBar.appendChild(createButton('Next', '⏩', () => selectNextUnit()));
bottomBar.appendChild(endTurnBtn);  // End Turn stays last
```

Move the existing `bottomBar.appendChild(endTurnBtn)` line to after the new button so the order is: Tech | City | Diplo | Trade | Next | End Turn.

### Step 4: Auto-select next unit after actions

- [ ] In `src/main.ts`, replace `deselectUnit()` with `selectNextUnit()` at these locations **only when the unit's turn is done** (no movement points left):

1. **After combat** (around line 556, `SFX.combat(); deselectUnit();`): replace `deselectUnit()` with `selectNextUnit()`.

2. **After founding a city** (around line 398, `deselectUnit()`): replace with `selectNextUnit()`.

3. **After building an improvement** (search for `btn-build-farm` and `btn-build-mine` handlers, around line 428): replace `deselectUnit()` with `selectNextUnit()`.

4. **After movement when movement points exhausted** (around line 625, where it checks `movementPointsLeft > 0`): in the else branch (no points left), call `selectNextUnit()` instead of `deselectUnit()`.

5. **After rest** (the new Rest button handler from Task 2): already calls `selectNextUnit()`.

**Be careful:** When the unit still has movement points after moving, keep it selected (re-call `selectUnit()`), do NOT call `selectNextUnit()`.

### Step 5: Auto-select first unit at start of turn

- [ ] In `src/main.ts`, at the end of `endTurn()`:
  - **Solo mode** (around line 717, after `advisorSystem.check(gameState)`): add `selectNextUnit();`
  - **Hot seat** (in the `onReady` callback around line 701): add `selectNextUnit();` after `updateHUD();`

### Step 6: Write tests

- [ ] Add to `tests/systems/playtest-fixes.test.ts`:

```typescript
import { getUnmovedUnits } from '@/systems/unit-system';

describe('unit cycling (#25)', () => {
  const makeUnit = (id: string, overrides: Partial<Unit> = {}): Unit => ({
    id, type: 'warrior', owner: 'player',
    position: { q: 0, r: 0 }, movementPointsLeft: 2,
    health: 100, experience: 0, hasMoved: false, hasActed: false, isResting: false,
    ...overrides,
  });

  it('returns only unmoved units for the given owner', () => {
    const units: Record<string, Unit> = {
      'u1': makeUnit('u1'),
      'u2': makeUnit('u2', { hasMoved: true, movementPointsLeft: 0 }),
      'u3': makeUnit('u3', { owner: 'ai-1' }),
      'u4': makeUnit('u4'),
    };
    const result = getUnmovedUnits(units, 'player');
    expect(result.map(u => u.id)).toEqual(['u1', 'u4']);
  });

  it('returns empty array when all units have moved', () => {
    const units: Record<string, Unit> = {
      'u1': makeUnit('u1', { hasMoved: true, movementPointsLeft: 0 }),
    };
    expect(getUnmovedUnits(units, 'player')).toEqual([]);
  });

  it('returns empty array when no units exist for owner', () => {
    expect(getUnmovedUnits({}, 'player')).toEqual([]);
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 4: Notification System Overhaul (#20)

**Problem:** Notifications auto-dismiss after 4 seconds with no queue. There are 43+ calls to `showNotification()`. Multiple events fire per turn end, creating a wall of toasts that vanish before reading.

**Fix:** Replace the fire-and-forget toast system with a sequential notification queue + notification log. Notifications display one at a time with longer timeouts. A tap dismisses and shows the next. A small history button opens a scrollable log.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/core/types.ts`

### Step 1: Add NotificationEntry type

- [ ] In `src/core/types.ts`, add near the other utility types:

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
let currentDismissTimer: ReturnType<typeof setTimeout> | null = null;

function showNotification(message: string, type: 'info' | 'success' | 'warning' = 'info'): void {
  notificationQueue.push({ message, type });
  notificationLog.push({ message, type, turn: gameState?.turn ?? 0 });
  // Keep log bounded
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
    if (currentDismissTimer) clearTimeout(currentDismissTimer);
    currentDismissTimer = null;
    notif.style.opacity = '0';
    setTimeout(() => {
      notif.remove();
      displayNextNotification();
    }, 200);
  };

  notif.addEventListener('click', dismiss);
  // Clear any existing notification in the area
  area.innerHTML = '';
  area.appendChild(notif);

  // Auto-dismiss after 6 seconds
  currentDismissTimer = setTimeout(() => {
    if (notif.parentNode) dismiss();
  }, 6000);

  SFX.notification();
}
```

### Step 3: Add notification log button

- [ ] In `src/main.ts`, in `createUI()`, after creating the notification area div (`notifArea`), add a log button:

```typescript
const logBtn = document.createElement('button');
logBtn.textContent = '📜';
logBtn.style.cssText = 'position:absolute;top:40px;right:12px;z-index:21;background:rgba(0,0,0,0.6);border:1px solid rgba(255,255,255,0.2);border-radius:8px;color:white;font-size:14px;padding:4px 8px;cursor:pointer;';
logBtn.addEventListener('click', () => toggleNotificationLog());
uiLayer.appendChild(logBtn);
```

Add `toggleNotificationLog()`:

```typescript
function toggleNotificationLog(): void {
  const existing = document.getElementById('notification-log');
  if (existing) { existing.remove(); return; }

  const uiLayer = document.getElementById('ui-layer');
  if (!uiLayer) return;

  const panel = document.createElement('div');
  panel.id = 'notification-log';
  panel.style.cssText = 'position:absolute;top:70px;right:12px;width:280px;max-height:300px;overflow-y:auto;background:rgba(10,10,30,0.95);border:1px solid rgba(255,255,255,0.15);border-radius:10px;z-index:25;padding:12px;';

  const colors = { info: '#e8c170', success: '#6b9b4b', warning: '#d94a4a' };

  // Build log HTML — use textContent-equivalent escaping for message text
  const header = document.createElement('div');
  header.style.cssText = 'font-size:13px;color:#e8c170;margin-bottom:8px;display:flex;justify-content:space-between;';
  header.innerHTML = '<span>Message Log</span><span id="close-log" style="cursor:pointer;opacity:0.6;">✕</span>';
  panel.appendChild(header);

  if (notificationLog.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:11px;opacity:0.5;text-align:center;';
    empty.textContent = 'No messages yet';
    panel.appendChild(empty);
  } else {
    // Most recent first
    for (let i = notificationLog.length - 1; i >= 0; i--) {
      const entry = notificationLog[i];
      const row = document.createElement('div');
      row.style.cssText = 'font-size:11px;padding:4px 0;border-bottom:1px solid rgba(255,255,255,0.05);';
      const turnSpan = document.createElement('span');
      turnSpan.style.cssText = `color:${colors[entry.type]};opacity:0.7;margin-right:4px;`;
      turnSpan.textContent = `T${entry.turn}`;
      row.appendChild(turnSpan);
      row.appendChild(document.createTextNode(entry.message));
      panel.appendChild(row);
    }
  }

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

**Note:** The log uses `textContent` and `createTextNode()` instead of `innerHTML` for message text, preventing XSS from game-generated messages that could contain angle brackets.

### Step 4: Write tests

- [ ] Add to `tests/systems/playtest-fixes.test.ts`:

```typescript
describe('notification queue (#20)', () => {
  it('NotificationEntry type has required fields', () => {
    const entry: NotificationEntry = { message: 'test', type: 'info', turn: 1 };
    expect(entry.message).toBe('test');
    expect(entry.type).toBe('info');
    expect(entry.turn).toBe(1);
  });
});
```

(Notification queue behavior is primarily DOM-dependent and best verified via manual testing. The type test ensures the interface is importable.)

- [ ] Run: `yarn test` and `yarn build`

---

## Task 5: Movement & Attack Highlighting (#4)

**Problem:** When a unit is selected, the movement range is calculated (`main.ts:333`) but **never rendered on screen**. The `drawHexHighlight()` function exists in `hex-renderer.ts:205` but is never called from the render loop. Players cannot see where their unit can move or which hexes would trigger an attack.

**Fix:** Pass movement/attack data to the render loop. Render blue highlights for move-to hexes and red highlights for attack-target hexes. Show a combat preview panel with an explicit Attack button instead of auto-attacking.

**Files:**
- Modify: `src/main.ts`
- Modify: `src/renderer/render-loop.ts`
- Modify: `src/systems/combat-system.ts` (import `getTerrainDefenseBonus`)
- Create: `tests/renderer/movement-highlights.test.ts`

### Step 1: Add highlight state to RenderLoop

- [ ] In `src/renderer/render-loop.ts`, add imports:

```typescript
import { drawHexHighlight } from './hex-renderer';
import { hexToPixel } from '@/systems/hex-utils';
import type { HexCoord } from '@/core/types';
```

Add a type and fields to the `RenderLoop` class:

```typescript
export interface HexHighlight {
  coord: HexCoord;
  type: 'move' | 'attack';
}

// Inside the class:
private highlights: HexHighlight[] = [];

setHighlights(highlights: HexHighlight[]): void {
  this.highlights = highlights;
}

clearHighlights(): void {
  this.highlights = [];
}
```

### Step 2: Render highlights in the render loop

- [ ] In `src/renderer/render-loop.ts`, in `render()`, after minor civ territory rendering but **before** `drawCities()` and `drawUnits()` (so highlights appear behind entities), add:

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

- [ ] In `src/main.ts`, add `HexHighlight` to imports from `@/renderer/render-loop`.

In `selectUnit()`, after `movementRange = getMovementRange(...)` (line 333), classify each hex:

```typescript
// Classify hexes as move or attack targets and send to renderer
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

### Step 4: Clear highlights on deselect

- [ ] In `deselectUnit()` (around line 369), add `renderLoop.clearHighlights();` after clearing `movementRange`.

### Step 5: Add combat preview with explicit Attack button

- [ ] In `src/main.ts`, add `getTerrainDefenseBonus` to imports from `@/systems/combat-system`.

In `handleHexTap()`, where it handles attacking an enemy unit (around line 477, the `if (unitAtHex && unitAtHex[1].owner !== gameState.currentPlayer)` block), replace the immediate attack resolution with a combat preview panel:

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
          <div>${atkDef.name} (${atkStr})</div>
          <div style="color:${oddsColor};font-weight:bold;">${odds}</div>
          <div>${defDef.name} (${defStr})</div>
        </div>
        <div style="font-size:10px;opacity:0.6;margin-bottom:8px;">${ownerName} · HP: ${defender.health}/100${terrainBonus > 0 ? ` · +${Math.round(terrainBonus * 100)}% terrain` : ''}</div>
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

### Step 6: Extract attack logic into executeAttack()

- [ ] Extract the existing attack code (lines ~479-556) into a new function. This is the code that handles war declaration, combat resolution, damage application, camp destruction, and city capture. Move it verbatim:

```typescript
function executeAttack(attackerId: string, defenderId: string, defender: Unit, targetKey: string): void {
  const attacker = gameState.units[attackerId];
  if (!attacker) return;
  // ... all existing attack logic from the current inline code ...
  // At the end, call selectNextUnit() instead of deselectUnit()
}
```

### Step 7: Write tests

- [ ] Create `tests/renderer/movement-highlights.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import type { HexHighlight } from '@/renderer/render-loop';
import type { HexCoord } from '@/core/types';
import { hexKey } from '@/systems/hex-utils';

// Mirror the classification logic from main.ts for testability
function classifyHighlights(
  movementRange: HexCoord[],
  unitPositions: Record<string, string>,
  unitOwners: Record<string, string>,
  currentPlayer: string,
): HexHighlight[] {
  return movementRange.map(coord => {
    const key = hexKey(coord);
    const occupantId = unitPositions[key];
    if (occupantId && unitOwners[occupantId] !== currentPlayer) {
      return { coord, type: 'attack' as const };
    }
    return { coord, type: 'move' as const };
  });
}

describe('movement highlights (#4)', () => {
  it('classifies empty hex as move', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }], {}, {}, 'player',
    );
    expect(highlights).toEqual([{ coord: { q: 1, r: 0 }, type: 'move' }]);
  });

  it('classifies enemy-occupied hex as attack', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }],
      { '1,0': 'enemy-unit' },
      { 'enemy-unit': 'ai-1' },
      'player',
    );
    expect(highlights).toEqual([{ coord: { q: 1, r: 0 }, type: 'attack' }]);
  });

  it('classifies barbarian-occupied hex as attack', () => {
    const highlights = classifyHighlights(
      [{ q: 2, r: 0 }],
      { '2,0': 'barb-1' },
      { 'barb-1': 'barbarian' },
      'player',
    );
    expect(highlights[0].type).toBe('attack');
  });

  it('mixed range produces correct types', () => {
    const highlights = classifyHighlights(
      [{ q: 1, r: 0 }, { q: 2, r: 0 }, { q: 3, r: 0 }],
      { '2,0': 'enemy-1' },
      { 'enemy-1': 'ai-1' },
      'player',
    );
    expect(highlights.map(h => h.type)).toEqual(['move', 'attack', 'move']);
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 6: Stone Age Combat Balance (#14)

**Problem:** Early-game combat between warriors (strength 10) takes too many rounds. With base damage 30-50 and the strength ratio formula, evenly matched warriors deal ~15-25 damage per attack — 4-5 attacks to kill, tedious across multiple turns.

**Fix:** Scale base damage by era — early eras deal proportionally more damage for faster, more decisive fights.

**Files:**
- Modify: `src/systems/combat-system.ts`
- Modify: `src/main.ts` (pass era)
- Modify: `src/core/turn-manager.ts` (pass era)
- Modify: `src/ai/basic-ai.ts` (pass era)

### Step 1: Add era-scaled damage

- [ ] In `src/systems/combat-system.ts`, add `era` parameter to `resolveCombat`:

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

Replace the base damage line (line 86) with:

```typescript
// Era-scaled base damage: early eras deal more for faster combat
// Era 0-1 (Stone/Tribal): 45-70, Era 2 (Bronze): 40-60, Era 3+ (Iron+): 30-50
const eraScale = era !== undefined && era <= 1 ? 1.5 : era === 2 ? 1.2 : 1.0;
const baseDamage = (30 + rng() * 20) * eraScale;
```

### Step 2: Pass era from all callers

- [ ] `src/main.ts` — in `executeAttack()` (or current attack code): pass `gameState.era` as last argument.
- [ ] `src/core/turn-manager.ts` — all `resolveCombat` calls: pass `newState.era`.
- [ ] `src/ai/basic-ai.ts` — the `resolveCombat` call (around line 94): pass `newState.era`.

### Step 3: Write balance test

- [ ] Add to `tests/systems/playtest-fixes.test.ts`:

```typescript
import { resolveCombat } from '@/systems/combat-system';
import { createUnit, resetUnitId } from '@/systems/unit-system';
import type { GameMap, HexTile } from '@/core/types';

describe('Stone Age combat balance (#14)', () => {
  beforeEach(() => resetUnitId());

  const makePlainsTile = (q: number, r: number): HexTile => ({
    coord: { q, r }, terrain: 'plains', elevation: 'flat',
    resource: null, improvement: 'none', improvementTurnsLeft: 0,
    owner: null, hasRiver: false,
  });

  const makeMap = (): GameMap => ({
    width: 10, height: 10, wrapsHorizontally: false, rivers: [],
    tiles: { '1,0': makePlainsTile(1, 0) },
  });

  it('stone age warrior vs warrior resolves in 2-4 hits on average', () => {
    let totalHitsToKill = 0;
    const trials = 30;

    for (let i = 0; i < trials; i++) {
      const attacker = createUnit('warrior', 'player', { q: 0, r: 0 });
      const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 });

      let hits = 0;
      let hp = 100;
      while (hp > 0 && hits < 10) {
        const result = resolveCombat(
          { ...attacker, health: 100 },
          { ...defender, health: hp },
          makeMap(),
          i * 1000 + hits,
          undefined,
          0, // Stone Age era
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

  it('later era combat is slower than stone age', () => {
    const attacker = createUnit('warrior', 'player', { q: 0, r: 0 });
    const defender = createUnit('warrior', 'ai-1', { q: 1, r: 0 });

    const stoneResult = resolveCombat(attacker, defender, makeMap(), 42, undefined, 0);
    const ironResult = resolveCombat(attacker, defender, makeMap(), 42, undefined, 3);
    // Same seed, same units — stone age should deal more damage
    expect(stoneResult.defenderDamage).toBeGreaterThan(ironResult.defenderDamage);
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 7: Map Edge Rendering Fix (#37)

**Problem:** The map is cylindrical (`wrapsHorizontally: true`) but the renderer doesn't draw tiles across the wrap boundary. This creates visible empty strips on the left/right edges.

**Fix:** Render "ghost" copies of edge tiles at their wrapped positions. Optimize by only checking tiles near the edges, not iterating the entire map twice.

**Files:**
- Modify: `src/renderer/hex-renderer.ts`
- Modify: `src/input/touch-handler.ts`
- Modify: `src/input/mouse-handler.ts`

### Step 1: Extract tile rendering helper

- [ ] In `src/renderer/hex-renderer.ts`, the tile rendering + terrain label code appears in `drawHexMap()` (lines 70-85). Extract it into a helper to avoid duplicating it for ghost tiles:

```typescript
function drawTileAtScreen(
  ctx: CanvasRenderingContext2D,
  screen: { x: number; y: number },
  scaledSize: number,
  tile: HexTile,
  isVillage: boolean,
  currentPlayer: string | undefined,
  zoom: number,
): void {
  drawHex(ctx, screen.x, screen.y, scaledSize, tile, isVillage, currentPlayer);
  if (shouldShowTerrainLabel(zoom)) {
    const label = getTerrainLabel(tile.terrain);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.font = `${Math.round(scaledSize * 0.22)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(label, screen.x, screen.y + scaledSize * 0.45);
  }
}
```

Refactor `drawHexMap()` to use this helper for the main loop:

```typescript
for (const tile of Object.values(map.tiles)) {
  if (!camera.isHexVisible(tile.coord)) continue;
  const pixel = hexToPixel(tile.coord, size);
  const screen = camera.worldToScreen(pixel.x, pixel.y);
  const scaledSize = size * camera.zoom;
  const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
  drawTileAtScreen(ctx, screen, scaledSize, tile, isVillage, currentPlayer, camera.zoom);
}
```

### Step 2: Add optimized ghost tile rendering

- [ ] After the main loop, add ghost rendering **only for tiles near the edges** (within 3 columns of the boundary):

```typescript
// Render wrap-around ghost tiles for seamless horizontal wrapping
if (map.wrapsHorizontally) {
  const edgeMargin = 3; // Only check tiles within 3 columns of edge
  for (const tile of Object.values(map.tiles)) {
    const q = tile.coord.q;
    const isNearLeftEdge = q < edgeMargin;
    const isNearRightEdge = q >= map.width - edgeMargin;

    if (isNearLeftEdge) {
      // Draw ghost at +width (tile from left edge visible on right side)
      const ghostCoord: HexCoord = { q: q + map.width, r: tile.coord.r };
      if (camera.isHexVisible(ghostCoord)) {
        const pixel = hexToPixel(ghostCoord, size);
        const screen = camera.worldToScreen(pixel.x, pixel.y);
        const scaledSize = size * camera.zoom;
        const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
        drawTileAtScreen(ctx, screen, scaledSize, tile, isVillage, currentPlayer, camera.zoom);
      }
    }

    if (isNearRightEdge) {
      // Draw ghost at -width (tile from right edge visible on left side)
      const ghostCoord: HexCoord = { q: q - map.width, r: tile.coord.r };
      if (camera.isHexVisible(ghostCoord)) {
        const pixel = hexToPixel(ghostCoord, size);
        const screen = camera.worldToScreen(pixel.x, pixel.y);
        const scaledSize = size * camera.zoom;
        const isVillage = villagePositions?.has(`${tile.coord.q},${tile.coord.r}`) ?? false;
        drawTileAtScreen(ctx, screen, scaledSize, tile, isVillage, currentPlayer, camera.zoom);
      }
    }
  }
}
```

**Performance:** For a 40-wide map with `edgeMargin=3`, this checks only ~6 columns × height rows ≈ 150 tiles for ghost rendering instead of the full 1000. The `isHexVisible()` cull further reduces actual draw calls.

### Step 3: Also wrap rivers near edges

- [ ] In `drawRivers()`, when either endpoint is near the edge, also draw the river at the wrapped position. Add after the main river loop:

```typescript
if (map.wrapsHorizontally) {
  for (const river of map.rivers) {
    const fq = river.from.q;
    const tq = river.to.q;
    if (fq >= map.width - 3 || fq < 3 || tq >= map.width - 3 || tq < 3) {
      for (const offset of [map.width, -map.width]) {
        const ghostFrom: HexCoord = { q: river.from.q + offset, r: river.from.r };
        const ghostTo: HexCoord = { q: river.to.q + offset, r: river.to.r };
        if (!camera.isHexVisible(ghostFrom) && !camera.isHexVisible(ghostTo)) continue;
        // Draw river at offset position (same drawing code as main loop)
        const fromPixel = hexToPixel(ghostFrom, camera.hexSize);
        const toPixel = hexToPixel(ghostTo, camera.hexSize);
        const fromScreen = camera.worldToScreen(fromPixel.x, fromPixel.y);
        const toScreen = camera.worldToScreen(toPixel.x, toPixel.y);
        const midX = (fromScreen.x + toScreen.x) / 2;
        const midY = (fromScreen.y + toScreen.y) / 2;
        const dx = toScreen.x - fromScreen.x;
        const dy = toScreen.y - fromScreen.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len === 0) continue;
        const perpX = (-dy / len) * camera.hexSize * camera.zoom * 0.3;
        const perpY = (dx / len) * camera.hexSize * camera.zoom * 0.3;
        ctx.beginPath();
        ctx.moveTo(midX - perpX, midY - perpY);
        ctx.lineTo(midX + perpX, midY + perpY);
        ctx.stroke();
      }
    }
  }
}
```

### Step 4: Wrap tap coordinates in input handlers

- [ ] The hex coordinate conversion happens in the input handlers via `camera.screenToHex()`, NOT in main.ts. The wrapping must happen there.

In `src/input/touch-handler.ts`, import `wrapHexCoord` from `@/systems/hex-utils` and the `GameMap` type. The touch handler needs access to the map width. The cleanest approach: add a `mapWidth` parameter to the `InputCallbacks` interface, or pass a coordinate-wrapping function.

**Simplest approach:** Wrap in `handleHexTap()` in main.ts, since that's where the coord arrives. In `src/main.ts`, at the top of `handleHexTap(coord)` (line 433):

```typescript
function handleHexTap(rawCoord: HexCoord): void {
  const coord = gameState.map.wrapsHorizontally
    ? wrapHexCoord(rawCoord, gameState.map.width)
    : rawCoord;
  // ... rest of function unchanged
```

Import `wrapHexCoord` from `@/systems/hex-utils` (add to existing import on line 8).

Do the same for `handleHexLongPress` if it exists — search for it and apply the same wrapping.

- [ ] Run: `yarn test` and `yarn build`

---

## Task 8: Grid View Help Text (#31)

**Problem:** The city panel "Grid" tab shows a 5x5 building placement grid with no explanation. User says: "Not sure what it is, what to do with it, or really anything about it."

**Fix:** Add a brief description at the top and building info on tap (shown inline, not via `alert()`).

**Files:**
- Modify: `src/ui/city-grid.ts`

### Step 1: Add help text to grid view

- [ ] In `src/ui/city-grid.ts`, in `createCityGrid()` (line 50), replace line 76:

```typescript
let html = '<div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;max-width:380px;margin:0 auto;">';
```

With:

```typescript
let html = `
  <div style="font-size:12px;color:rgba(255,255,255,0.7);margin-bottom:10px;padding:0 4px;line-height:1.4;">
    <strong style="color:#e8c170;">City Layout</strong> — Tap empty slots to place buildings. Adjacent buildings can boost each other. Edge slots show the terrain they sit on.
    ${suggestedBuilding ? `<div style="color:#e8c170;margin-top:4px;">Suggested: <strong>${suggestedBuilding}</strong></div>` : ''}
  </div>
  <div style="display:grid;grid-template-columns:repeat(5,1fr);gap:3px;max-width:380px;margin:0 auto;">`;
```

### Step 2: Add inline building info on tap

- [ ] In the building slot rendering (around line 103-122), add `class="grid-building" data-building="${building}"` to the built building's outer div.

After the closing grid div, add a detail area:

```typescript
html += '</div>'; // close grid
html += '<div id="grid-detail" style="margin-top:8px;font-size:11px;color:rgba(255,255,255,0.6);min-height:24px;padding:0 4px;"></div>';
```

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
    const detailEl = panel.querySelector('#grid-detail');
    if (detailEl) {
      detailEl.textContent = ''; // Clear via DOM, not innerHTML
      const strong = document.createElement('strong');
      strong.style.color = '#e8c170';
      strong.textContent = bDef.name;
      detailEl.appendChild(strong);
      detailEl.appendChild(document.createTextNode(`: ${bDef.description} — ${yieldText}`));
    }
  });
});
```

- [ ] Run: `yarn test` and `yarn build`

---

## Task 9: Unit Introspection (#26)

**Problem:** Tapping enemy units shows minimal info. The user wants to know: "What is this? Is this a barbarian? Whose troop is this?"

**Current behavior:** Tapping an enemy unit shows: `"[Owner] [UnitType] · HP: X/100 · Str: Y"` in a red panel. Insufficient.

**Fix:** Enhance info panels with: unit description, owner civ name + color, relationship status, and a civ-colored left border.

**Files:**
- Modify: `src/systems/unit-system.ts`
- Modify: `src/main.ts`

### Step 1: Add unit descriptions to unit-system.ts

- [ ] In `src/systems/unit-system.ts`, add a `UNIT_DESCRIPTIONS` record after `UNIT_DEFINITIONS`. **Must match the actual `UnitType` union** (`types.ts:101`): `settler | worker | scout | warrior | archer | swordsman | pikeman | musketeer | galley | trireme`.

```typescript
export const UNIT_DESCRIPTIONS: Record<UnitType, string> = {
  settler: 'Civilian unit that can found new cities',
  worker: 'Civilian unit that builds tile improvements',
  scout: 'Fast exploration unit with extended vision',
  warrior: 'Basic melee fighter — your first line of defense',
  archer: 'Ranged unit that attacks from a distance',
  swordsman: 'Stronger melee fighter, requires Bronze Working',
  pikeman: 'Anti-cavalry specialist, requires Fortification',
  musketeer: 'Gunpowder infantry, requires Tactics',
  galley: 'Coastal vessel for transport and exploration',
  trireme: 'Warship with strong naval combat capabilities',
};
```

### Step 2: Enhance enemy unit info panel in main.ts

- [ ] Add `UNIT_DESCRIPTIONS` to the import from `@/systems/unit-system` (line 9).

In `handleHexTap()`, replace the enemy unit info display (around lines 446-466) with:

```typescript
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
    const mc = Object.values(gameState.minorCivs ?? {}).find(m => m.id === enemyUnit.owner);
    const mcDef = mc ? MINOR_CIV_DEFINITIONS.find(d => d.id === mc.definitionId) : undefined;
    ownerName = mcDef?.name ?? 'City-State';
    ownerColor = mcDef?.color ?? '#888';
  } else {
    const civ = gameState.civilizations[enemyUnit.owner];
    ownerName = civ?.name ?? enemyUnit.owner;
    ownerColor = civ?.color ?? '#888';
  }

  const atWar = !isBarbarian && !isMinorCiv && currentCiv()?.diplomacy?.atWarWith.includes(enemyUnit.owner);
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

**Note:** Minor civ lookup uses `Object.values(gameState.minorCivs).find(m => m.id === enemyUnit.owner)` instead of direct key lookup, because minor civ keys may not match unit owner IDs.

### Step 3: Enhance friendly unit info panel

- [ ] In `selectUnit()` (around line 347-358), update the info panel HTML to include a description and owner-colored border:

```typescript
panel.innerHTML = `
  <div style="background:rgba(0,0,0,0.85);border-radius:12px;padding:12px 16px;border-left:4px solid ${currentCiv()?.color ?? '#e8c170'};">
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

- [ ] Run: `yarn test` and `yarn build`

---

## Task 10: Prevent Recurrence — Claude Rules & CLAUDE.md Updates

**Problem:** Many of these 9 issues stem from recurring patterns: code computed but never wired to the renderer (#4, #37), fundamental game mechanics missing (#15, #26), ephemeral user feedback (#20), storage not tested on target platform (#38), UI without context (#31, #25). These are systemic, not one-off mistakes.

**Root Cause Analysis:**

| Pattern | Issues | Prevention |
|---------|--------|------------|
| Computed but not wired | #4 (highlights), #37 (wrapping) | New rule: end-to-end-wiring.md |
| Missing core mechanics | #15 (healing), #26 (unit info) | New rule: strategy-game-mechanics.md |
| Ephemeral user feedback | #20 (notifications), #4 (preview) | Updated rule: ui-panels.md |
| Platform storage gaps | #38 (saves) | New rule: strategy-game-mechanics.md |
| UI without context | #31 (grid), #26 (info), #25 (cycling) | Updated: CLAUDE.md + ui-panels.md |
| Untuned balance | #14 (combat) | New rule: strategy-game-mechanics.md |

**Fix:** Create new `.claude/rules/` files and update existing ones. These are path-scoped rules that load automatically when Claude works on matching files.

**Files:**
- Create: `.claude/rules/end-to-end-wiring.md` (paths: `src/**`)
- Create: `.claude/rules/strategy-game-mechanics.md` (paths: `src/systems/**`, `src/core/**`)
- Modify: `.claude/rules/ui-panels.md` — add Unit Info Panels and Notifications sections
- Modify: `CLAUDE.md` — add rules about computed-but-not-rendered, map wrapping, UI self-explanatory, XSS prevention

### Step 1: Create end-to-end-wiring.md

- [ ] Create `.claude/rules/end-to-end-wiring.md` with `paths: ["src/**"]`:
  - Never compute without rendering — if data is calculated, it must reach the screen
  - Every user action needs visible feedback (combat preview, movement highlights, building info)
  - Coordinate transforms must work end-to-end (rendering + input)
  - After implementing system logic, trace: state → compute → UI/renderer → user sees it

### Step 2: Create strategy-game-mechanics.md

- [ ] Create `.claude/rules/strategy-game-mechanics.md` with `paths: ["src/systems/**", "src/core/**"]`:
  - Core mechanics checklist: healing, unit identity, combat preview, unit cycling, persistent notifications
  - Balance testing across eras (statistical sampling)
  - Storage resilience: IndexedDB + localStorage fallback + `navigator.storage.persist()` + manual export/import
  - Auto-save on game creation, not just turn end

### Step 3: Update ui-panels.md

- [ ] Add to `.claude/rules/ui-panels.md`:
  - **Unit Info Panels section**: all entities must be identifiable on tap, enemy units show owner/color/relationship, use textContent not innerHTML
  - **Notifications section**: queue-based, persistent log (50 entries), turn numbers in log entries

### Step 4: Update CLAUDE.md

- [ ] Add to `CLAUDE.md` Game System Rules section:
  - Computed data must be rendered — dead computed data is a bug
  - Map wrapping in both rendering and input
  - UI elements must be self-explanatory
  - Use textContent/createTextNode for dynamic DOM text

- [ ] Verify all 4 rules files load correctly: `ls .claude/rules/`

---

## Implementation Order

Tasks should be implemented in this order due to dependencies:

1. **Task 1: Save Persistence (#38)** — independent, highest priority
2. **Task 2: Unit Healing (#15)** — adds `isResting` to Unit type, needed by Task 3
3. **Task 3: Unit Cycling (#25)** — depends on Task 2 (rest button calls selectNextUnit)
4. **Task 5: Movement & Attack Highlighting (#4)** — depends on Task 3 (executeAttack calls selectNextUnit)
5. **Task 4: Notification Overhaul (#20)** — independent, but best after combat changes
6. **Task 6: Combat Balance (#14)** — independent, simple
7. **Task 7: Map Edge Rendering (#37)** — independent, renderer-only
8. **Task 8: Grid View Help (#31)** — independent, simple
9. **Task 9: Unit Introspection (#26)** — independent, simple

Tasks 6-9 are independent and can be parallelized.

10. **Task 10: Claude Rules Updates** — independent, do FIRST (rules guide implementation of all other tasks)

---

## Testing Strategy

**Automated tests** (in vitest):
- Save persistence: IDB/localStorage fallback, quota exceeded, delete clears both
- Healing: passive vs rest, territory/city bonuses, cap at 100, moved units skip, resetUnitTurn clears isResting
- Unit cycling: getUnmovedUnits filters correctly
- Movement highlights: hex classification (move vs attack vs barbarian)
- Combat balance: Stone Age resolves in 2-4 hits, later eras are slower
- Notification: type interface is correct

**Manual test checklist:**
- Play 3 turns, close Safari tab, reopen — verify "Continue" button appears
- Export save, delete game, import save — verify game resumes
- Select warrior, verify blue (move) and red (attack) hex highlights
- Tap red hex — verify combat preview with Attack/Cancel buttons
- Tap Rest button on damaged unit, end turn — verify HP increases
- Move all units — verify auto-cycle to next unmoved unit, silent deselect after last
- Pan camera to left/right map edge — verify seamless terrain wrapping
- Open city panel Grid tab — verify help text and tap-to-see building info
- Tap enemy unit — verify owner name, color border, description, relationship tag

Run after each task: `yarn test && yarn build`
