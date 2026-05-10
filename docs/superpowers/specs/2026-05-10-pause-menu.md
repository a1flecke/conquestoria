---
# In-Game Pause Menu
**Issue:** #192 — Missing ability to start a new game without closing/reopening  
**Date:** 2026-05-10

---

## Problem

`showGameModeSelection()` is only reachable from:
1. The startup save panel (shown at app launch)
2. The victory panel (shown only on win)

During active play the only visible affordances are the primary action bar (Council, Tech, City, Intel, Diplo, Trade, End Turn) and three floating buttons (Next Unit, Notification Log, Icon Legend). None of these provide a path to "New Game" or "Save Game" — players must close the app or browser tab to escape an in-progress game.

---

## Design

### Entry point: "☰" floating button in the game shell

Add a `☰` button to `createGameShell`, positioned at `right: 132px` (immediately left of the existing 🗺️ at `right: 92px`). Requires adding `onOpenMenu: () => void` to `GameShellCallbacks` and `PrimaryActionBarCallbacks`.

Button style: matches existing floating buttons (same `cssText` pattern as `btn-notif-log`, `btn-icon-legend`).

### New file: `src/ui/pause-menu-panel.ts`

```
╔══════════════════════════════╗
║  ⏸ Paused                    ║
║  Turn 14 · Inca Empire       ║
╠══════════════════════════════╣
║  [Return to Game]            ║
║  [Save Game]                 ║
║  [New Game…]                 ║
╚══════════════════════════════╝
```

Panel is a centered overlay (`z-index: 55`, above all game chrome). All three buttons use `createGameButton` from `ui-kit.ts`:
- **Return to Game**: `'secondary'` variant — closes the panel, returns to active game
- **Save Game**: `'secondary'` variant — opens `createSavePanel(container, callbacks, 'save')` from the existing save system; when save completes or is cancelled, returns to pause menu
- **New Game…**: `'secondary'` variant — triggers the "Save First?" confirmation sub-flow below

### "New Game → Save First?" confirmation sub-flow

When the player taps "New Game…" from the pause menu, replace the pause menu body with a confirmation card (do not open a new overlay):

```
╔══════════════════════════════════╗
║  Start a new game?               ║
║  You have unsaved progress on    ║
║  turn 14. Save before leaving?   ║
╠══════════════════════════════════╣
║  [Save & Start New Game]         ║  → autosave → showGameModeSelection()
║  [Discard & Start New Game]      ║  → showGameModeSelection() directly
║  [Cancel]                        ║  → back to pause menu main view
╚══════════════════════════════════╝
```

- **Save & Start New Game** (`'primary'`): calls `autoSave(gameState)` (the existing autosave path already used on turn end), awaits completion, then closes the pause panel and calls `showGameModeSelection()`.
- **Discard & Start New Game** (`'danger'`): closes the pause panel and calls `showGameModeSelection()` directly. Text is intentionally explicit ("Discard") so players understand the consequence.
- **Cancel** (`'ghost'`): returns to the main pause menu view (swaps body content back, no new overlay).

The current-turn number and civilization name shown in the panel header come from `state.turn` and `state.civilizations[state.currentPlayer].name`.

### Wiring in `main.ts`

Add `onOpenMenu` callback to the `createGameShell` call:

```ts
onOpenMenu: () => {
  showPauseMenu(uiLayer, {
    turn: gameState.turn,
    civName: gameState.civilizations[gameState.currentPlayer].name,
    onResume: () => {},
    onSave: async (slotId, name) => {
      await saveGame(gameState, slotId, name);
      showNotification('Game saved.', 'info');
    },
    onNewGame: () => showGameModeSelection(),
    autoSave: () => autoSave(gameState),
  });
},
```

No changes to the existing `startGame()`, `autoSave()`, or `showGameModeSelection()` functions.

### Tests

`tests/ui/pause-menu-panel.test.ts`:
- Renders with correct turn number and civ name in header
- "Return to Game" calls `onResume` and removes panel
- "New Game…" swaps to the confirmation sub-view
- "Save & Start New Game" calls `autoSave` then `onNewGame`
- "Discard & Start New Game" calls `onNewGame` without `autoSave`
- "Cancel" (in sub-view) returns to the main pause view without calling `onNewGame`
- All buttons pass `createGameButton` styling contract (non-empty background/color)

---

## Acceptance criteria

- [ ] `☰` button visible in the game shell during active play on both desktop and web
- [ ] Pause menu opens, shows turn number and civ name
- [ ] "Return to Game" dismisses the menu
- [ ] "Save Game" opens save-to-slot flow and returns to pause menu on completion/cancel
- [ ] "New Game…" shows the save-first confirmation
- [ ] "Save & Start New Game" autosaves then navigates to game-mode-select
- [ ] "Discard & Start New Game" navigates to game-mode-select without saving
- [ ] "Cancel" in confirmation returns to pause menu main view
- [ ] All buttons styled via `createGameButton` (no browser-default chrome)
- [ ] `yarn test` and `yarn build` both clean
