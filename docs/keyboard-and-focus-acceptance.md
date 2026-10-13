# Keyboard, Focus and Dialog Acceptance (#1459)

What a player can do from the keyboard alone, how focus behaves, and what is deliberately
not claimed. This is a scoped acceptance record, **not** a WCAG conformance statement.

Verified by `tests/e2e/issue-1459-keyboard-only.spec.ts` (Chromium, no pointer after the
pre-game menu) plus the unit suites named in the last column.

## Supported keys

| Key | Where | Does |
|---|---|---|
| `N` | map | Select the next unit that still needs orders |
| `Arrow Left/Right` | map | Keyboard cursor: west / east |
| `Arrow Up/Down` | map | Keyboard cursor: north-east / south-west |
| `Shift+Arrow Up/Down` | map | Keyboard cursor: north-west / south-east |
| `Enter` or `Space` | map, cursor shown | Same as tapping that hex: select, move, attack, resolve a pending intent |
| `Escape` | map | Hide the cursor (and cancel an armed journey) |
| `F` / `B` / `G` | map, unit selected | Fortify / found city / start a journey |
| `C` / `T` / `E` | map or toolbar | Open Council (or centre on the unit) / Tech / end turn |
| `Tab`, `Enter`, `Space` | anywhere | Native buttons: toolbar, panel controls |
| `Escape` | a panel or dialog | Close the topmost panel, or activate a dialog's Cancel |

The cursor starts on the selected unit, otherwise the middle of the view (or of the map if the
view is off it). It scrolls the camera when it leaves the screen. A caption (`role="status"`,
`aria-live="polite"`) shows and announces one sentence per tile, e.g. `Plains at 18, 4, your Warrior.`

## Critical-action inventory

| Action | Keyboard path | Status |
|---|---|---|
| Start a campaign | native buttons on setup screens | works (native controls; not re-audited) |
| Select a unit | `N`, or cursor + `Enter` | **added**, e2e |
| Inspect a tile | cursor caption | **added**, unit tests incl. fog / unexplored |
| Move / attack | select, cursor to target, `Enter` (shared tap path, so shared legality) | **added**, e2e (move) |
| Cancel an intent | `Escape` | works (journey), cursor hide added |
| End turn | `E` or the End Turn button | works; its warning dialog is now keyboard-complete, e2e |
| Open / close a panel | toolbar button, `Escape`, focus enters and returns | **added** for all 19 registry panels, e2e |
| Decision dialogs (end-turn warning, delete, worker warnings, required choices, religion boon) | focus on the safe control, Tab trapped, Escape = Cancel where one exists | **added**, unit + e2e |
| Manual save, failed-save recovery | native buttons; busy/error handling from #1451/#1458 | unchanged, covered by `tests/ui/save-panel.test.ts` |
| Reload / continue | native buttons | unchanged |
| Hot-seat handoff | existing focus trap, `inert` + `aria-hidden` on the game; cursor and caption cleared on a viewer change | works; cursor reset **added** |

## Focus rules

- A registry panel (`PANEL_REGISTRY`) or a dialog marked with `markModal` (`src/ui/modal-contract.ts`)
  is handled by `installPanelFocusManager` (`src/app/panel-focus-manager.ts`): focus moves in when it
  opens, returns to the control that opened it when it closes (unless the player has since moved
  focus), and `role="dialog"` plus a name from its heading are applied.
- `Escape` closes only the topmost registry panel, and only once: a panel that already handled
  Escape is not followed by a second close. A dialog with no declared cancel (a required choice)
  ignores Escape, so a decision is never dismissed by accident.
- Shortcut letters are ignored from inside a dialog or a text field, so `E` cannot end the turn
  behind an open dialog.
- Hot seat: the cursor, its caption and its position are cleared when the viewer changes; the
  caption is built only from the viewer's own visibility.

## Known limitations (not claimed)

- Per-tile descriptions are one sentence (terrain, city, visible units); they do not replace the
  visual map for tactical reading.
- Cursor movement is by single hex; there is no jump-to-next-city/enemy key yet.
- The pre-game setup screens, the Council/Tech/City panels' internal controls and the older
  ceremonies were not audited for tab order or contrast beyond native control behaviour.
- No automated axe-style or contrast audit, and no screen-reader testing, has been done.
- Verified in Chromium only; Safari/iPad acceptance is out of scope (#1455 is closed not planned).
