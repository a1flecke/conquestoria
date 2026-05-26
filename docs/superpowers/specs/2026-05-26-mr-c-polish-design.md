---
name: mr-c-polish-design
description: Design spec for MR-C fixing #276 (city icon centering) and #279 (hotkeys + multi-turn journey)
metadata:
  type: project
---

# MR-C — Polish: City Icon & Keyboard Navigation

**Issues:** #276, #279
**Depends on:** MR-A (shares `turn-manager.ts` and `types.ts` — must be merged first)
**Followed by:** MR-B

## Sub-tracks

MR-C has two independent sub-tracks. Sub-track 1 (#276) is trivial. Sub-track 2 (#279) is substantial and should be treated as two sequential tasks within the same MR: (a) simple hotkeys, (b) `g`-key journey.

---

## Sub-track 1 — City icon centering (#276)

### Problem

Canvas `textBaseline = 'middle'` aligns to the x-height midpoint of the font metrics, not the visual center of emoji glyphs. The result is a consistent upward visual bias.

### Fix (`src/renderer/city-renderer.ts`)

Add a named ratio constant at the top of the file:

```ts
const CITY_ICON_EMOJI_Y_NUDGE_RATIO = 0.08;
```

At each `ctx.fillText(icon, screen.x, screen.y)` call for the main city icon (lines ~127, ~129), change to:

```ts
ctx.fillText(icon, screen.x, screen.y + size * CITY_ICON_EMOJI_Y_NUDGE_RATIO);
```

Do **not** apply this nudge to the corner-badge emoji (`⛓`, `👑`, `☹`, `⚡`, `🔥`, production icons) — those are positioned relative to `screen.x ± size * 0.45, screen.y ± size * 0.45` and may need separate tuning if they turn out off.

### Tests

Visual only — no unit test. Verify manually by running the dev server and inspecting at default zoom and pinch-zoomed.

---

## Sub-track 2a — Simple hotkeys (#279 partial)

### Keys

| Key | Action | Condition |
|-----|--------|-----------|
| `c` | Center map on selected unit | Unit is selected |
| `f` | Fortify selected unit | Unit is selected, unit can act, not already fortified |
| `b` | Build city (settler) | Selected unit is a settler, can act |
| `n` | Cycle to next unmoved unit | Always |

These wire into existing actions already reachable via touch. Hotkeys are additive — no touch flow changes.

**Mobile note:** Register keyboard listeners unconditionally (mobile browsers connected to physical keyboards should also benefit). `CLAUDE.md` says mobile-first; keyboard is secondary, not absent.

### Implementation (`src/main.ts` or a new `src/input/keyboard-shortcuts.ts`)

Add a `keydown` listener. Extract the handler to `src/input/keyboard-shortcuts.ts` so `main.ts` stays lean. The handler receives the current `selectedUnitId` and `gameState` and dispatches to the same callbacks already wired to touch actions (fortify, settle, end-turn-cycle-unit, camera center).

```ts
export function handleHotkey(
  key: string,
  context: HotkeyContext,
): void
```

Where `HotkeyContext` carries `{ selectedUnitId, gameState, camera, onFortify, onSettle, onNextUnit }`.

### Tests

Unit test `keyboard-shortcuts.ts`: for each key, assert the right callback is invoked with the right args given a mock context.

---

## Sub-track 2b — `g`-key journey / auto-move (#279 full)

### Problem

Players cannot tell a unit to travel to a distant destination and have it automatically step there each turn. The request includes: destination selection UI, path preview, per-turn auto-advance, interruption on block, and "no path" feedback.

### Existing infrastructure

`findPath(from, to, map, domain)` already exists in `src/systems/unit-system.ts` and is used by the AI and caravans. No new pathfinding needed.

### State model (`src/core/types.ts`)

Extend `UnitAutomation`:

```ts
automation?: 
  | { mode: 'auto-explore' }
  | { mode: 'journey'; destination: HexCoord };
```

Store **destination only** — do not store the full computed path. Recompute one step per turn via `findPath` so the route adapts if the world changes (enemy blocks a tile, war opens new paths). The full path is computed transiently during render for the overlay and discarded.

### Journey lifecycle

**Activation (`src/main.ts` + `src/input/keyboard-shortcuts.ts`):**
1. Player presses `g` while a unit is selected.
2. Game enters "destination selection" mode: a new input state flag `pendingJourneyUnitId` is set.
3. Tapping a hex resolves destination:
   - `findPath(unit.position, dest, map, domain)` — if null, show toast "No path to that destination" and cancel.
   - If path exists, set `unit.automation = { mode: 'journey', destination: dest }` and show path overlay.
4. Player can press `Escape` or tap the unit again to cancel pending selection.

**Per-turn advance (`src/core/turn-manager.ts`):**
After the `auto-explore` automation block (lines ~265–270), add:

```ts
if (unit.automation?.mode === 'journey') {
  const path = findPath(unit.position, unit.automation.destination, state.map, domain);
  if (!path || path.length < 2) {
    // Destination unreachable this turn — clear and notify
    newState.units[unitId] = { ...unit, automation: undefined };
    _bus.emit('unit:journey-blocked', { unitId, position: unit.position });
  } else {
    const nextStep = path[1];
    const moved = executeUnitMove(newState, unitId, nextStep, {});
    newState = moved.state ?? newState;
    // Clear automation if destination reached
    if (hexKey(nextStep) === hexKey(unit.automation.destination)) {
      newState.units[unitId] = { ...newState.units[unitId], automation: undefined };
    }
  }
}
```

**Interruption triggers:**
- War declared against unit owner → clear `automation` for all affected owner's journey units via `unit:journey-blocked` event.
- Enemy unit moves onto path tile → detected next turn when `findPath` returns null or a longer reroute.
- Player manually moves unit → existing `executeUnitMove` clears `automation` (add this guard).

**Path overlay (`src/renderer/hex-renderer.ts`):**
When a unit with `automation.mode === 'journey'` is selected, compute the path transiently and draw a dashed line overlay along each step. Turn count label at destination: `Math.ceil(path.length / unit.movementPoints)`. If path is null, show the destination hex in red with an ✗.

During pending destination selection, draw a live path preview updating on each hover/touch-move.

### Events (`src/core/types.ts`)

Add to `GameEvents`:

```ts
'unit:journey-blocked': { unitId: string; position: HexCoord };
```

`main.ts` listens and appends a civ-log notification: "Your [unit type] was blocked and stopped at [coord]."

### Error Handling

- `findPath` returns null → clear automation, emit `journey-blocked`.
- Unit runs out of movement mid-journey (last step left more than 1 hex away) → stop for this turn, resume next turn.
- Unit enters enemy territory mid-journey (war) → blocked event.

### Tests

1. `automation` state set correctly after `g`-key + valid destination tap.
2. No-path destination: `findPath` returns null → automation not set, toast shown.
3. Per-turn advance: unit steps one hex toward destination each turn.
4. Destination reached: automation cleared.
5. Path blocked mid-journey: `journey-blocked` event fires, automation cleared.
6. Escape during pending selection: `pendingJourneyUnitId` cleared, no state change.
