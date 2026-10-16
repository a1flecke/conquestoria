# Keyboard, Focus and Dialog Acceptance (#1459)

What a player can do from the keyboard alone, how focus behaves, and what is deliberately
not claimed. This is a scoped acceptance record, **not** a WCAG conformance statement, and
nothing here was verified with a screen reader (see "Not tested").

How it is verified (Chromium, no pointer after the page loads, except where noted):

| Spec | What it proves |
|---|---|
| `tests/e2e/issue-1459-keyboard-only.spec.ts` | Select, move, open a panel, leave it, end the turn (map cursor + shared panel contract) |
| `tests/e2e/issue-1459-pregame-keyboard.spec.ts` | Main menu -> new game -> solo setup -> civilization picker -> start, backing out one screen at a time, the custom-civilization editor, and every hot-seat setup stage |
| `tests/e2e/issue-1459-ingame-a11y.spec.ts` | Council, Tech, Cities, Espionage, Diplomacy, Marketplace, message log, Victory, pause menu and a city panel; save with the keyboard, reload, continue |
| `tests/e2e/issue-1459-hotseat-later-stages.spec.ts` | Hot seat after the names: civilization pick, pass-the-device, personal difficulty, review, handoff, start |
| `tests/e2e/issue-1459-ceremonies-and-failures.spec.ts` | Wonder discovery and completion, beast slay, event-chain and world-race ceremonies mounted in a running campaign; a failing save and a failing map load, each retried by keyboard |
| `tests/e2e/issue-1459-hotseat-handoff.spec.ts` | The hot-seat handoff is a keyboard-complete dialog that hides the game from assistive technology |
| `tests/ui/pointer-only-controls.test.ts` | Source guard: no clickable `div`/`span` |
| `tests/ui/modal-contract.test.ts`, `tests/app/panel-focus-manager.test.ts` | What each dialog declares; focus restore across stacked screens |

Each browser spec runs the same checks on every screen (`tests/e2e/helpers/a11y-audit.ts`):
focus lands inside the screen; Tab and Shift+Tab never leave it; **axe-core** reports nothing
(`@axe-core/playwright`, all rules except the two below); and nothing the pointer treats as a
button is unreachable by keyboard (`findPointerOnlyControls`, which axe cannot do because a click
handler on a `div` carries no ARIA).

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
| `Tab`, `Enter`, `Space` | anywhere | Native buttons: toolbar, panel controls, every setup choice |
| `Escape` | a panel or dialog | Close the topmost panel, or activate a dialog's Cancel / Back |

No shortcut was added for #1459 beyond these: every gap found was a missing real control, not a
missing key.

The cursor starts on the selected unit, otherwise the middle of the view (or of the map if the
view is off it). It scrolls the camera when it leaves the screen. A caption (`role="status"`,
`aria-live="polite"`) shows and announces one sentence per tile, e.g. `Plains at 18, 4, your Warrior.`

## Critical-action inventory

| Action | Keyboard path | Tested by |
|---|---|---|
| Start a campaign (solo) | menu `New Game` -> `Solo` -> `Choose civilization` -> pick a card -> `Confirm` -> `Start Campaign` | pregame spec |
| Start a campaign (hot seat) | `Hot Seat` -> map size -> map type -> challenge -> player count -> names -> per-player civilization and difficulty -> review | pregame spec through "Player Names"; later-stages spec from the civilization pick through review, handoff and start |
| Back out of setup | `Escape` on each screen goes back one step, ending on the menu with `New Game` focused | pregame spec |
| Continue / load | menu `Continue`, opponent-challenge prompt, then the game | ingame spec |
| Select a unit / inspect a tile / move / attack | `N`, map cursor + `Enter` (shared tap path, so shared legality) | keyboard-only spec (move) |
| End turn | `E` or the End Turn button; the warning dialog is keyboard-complete | keyboard-only spec |
| Open / close a panel | toolbar button, `Escape`; focus enters, returns to the opener | ingame spec for 9 panels |
| City: queue production, switch section, cycle city, close | build items, section buttons (`aria-pressed`), `Previous`/`Next city`, `Close city panel`; also `Cities` overview -> `Open <city>` | ingame spec, `tests/ui/city-panel-keyboard.test.ts` |
| Decision dialogs (end-turn warning, delete, worker warnings, required choices, boon, city capture, Great General and beast-hoard choices, foreign-city entry, Great General commands) | focus on the safe control, Tab trapped, `Escape` = Cancel where one exists | `modal-contract.test.ts`; end-turn warning also by the keyboard-only spec |
| Ceremonies (wonder discovery/completion, beast slay, event-chain and world-race conclusions) | already focus themselves and answer `Escape`; now also named dialogs with a Tab trap | `modal-contract.test.ts` declares the contract; ceremonies spec drives it in a browser |
| Pause menu: resume, settings, new game | `Return to Game` first, `Escape` returns, the new-game confirmation starts on `Cancel`; every settings block is a named group | ingame spec |
| Manual save, failed-save recovery, reload | pause menu -> `Save Game` -> name -> `Save`; reload; `Continue` | ingame spec (success path); failure path by `tests/ui/save-panel.test.ts` |
| Hot-seat handoff | focus starts inside; the whole UI layer is `inert` + `aria-hidden`; `I'm <player>` then `Start Turn` by keyboard; focus is not stranded after | handoff spec |

## What the audit found, and fixed

Real failures, found by running the flows above (each has a regression):

| Failure | Where | Fix |
|---|---|---|
| Civilization cards were clickable `div`s: **only "Surprise Me" could be reached** without a pointer | civilization picker | real `<button aria-pressed>` cards; disabled civilizations leave the tab order |
| Hot-seat map-size and player-count cards were clickable `div`s | hot-seat setup | real buttons |
| Build items, section tabs, previous/next/close in the city panel were clickable `div`/`span`s: **a city could not be managed by keyboard** | city panel | real buttons; section buttons carry `aria-pressed` |
| City overview rows, notification-log jump rows, trade-route rows, diplomacy/marketplace close marks | several | a real button inside, the row kept as a pointer shortcut (`data-pointer-shortcut`) |
| Setup screens were not managed: focus stayed on the page body, so the **first Tab went to the in-game toolbar hidden behind the screen** (13 stops before "New Game") | menu, mode select, campaign setup, picker, custom civ, hot-seat setup, pause menu | each declares `markModal`; the existing focus manager enters, traps, restores and handles Escape |
| Back from "New Game" did nothing: a blank screen with no way forward but a reload | new-game screen | returns to the main menu |
| Stacked screens (picker over setup) did not restore focus to the control that opened them | focus manager | the opener is whatever held focus when the screen appeared |
| Unlabeled text fields (axe `label`, critical) | new-game title, custom-civilization fields, save name, player names | labelled |
| Selected setup choices (map, size, rivals, difficulty, traits) were gold borders only | campaign setup, custom civ, hot seat | `aria-pressed`; the chosen civilization is announced through a live region |
| Dialogs without an accessible name (axe `aria-dialog-name`, serious) | Espionage, message log | named |
| Emoji-only toolbar buttons were announced by their emoji's name ("scroll") | toolbar | `aria-label` from the title; the legend toggle reports `aria-expanded` |
| Two identical "Explorer / Standard / Veteran" groups, and anonymous `On`/`Off` button groups | pause menu | each block is a named group |
| White-on-colour buttons below 4.5:1 (axe `color-contrast`, serious) | save panel: Save, Load, Delete, Continue | darker backgrounds |

Older ceremonies and one-shot decisions (city capture, beast hoard, Great General choice and
commands, foreign-city entry, establish route) now declare the same contract. The required
choices start on the safe or first option and ignore `Escape`; the previews that spend something
start on `Cancel`.

## Focus rules

- A registry panel (`PANEL_REGISTRY`) or a screen/dialog marked with `markModal`
  (`src/ui/modal-contract.ts`) is handled by `installPanelFocusManager`
  (`src/app/panel-focus-manager.ts`): focus moves in when it opens, returns to the control that
  opened it when it closes (unless the player has since moved focus), and `role="dialog"` plus a
  name from its heading are applied. A multi-stage wizard (hot-seat setup) re-declares its title,
  Back control and focus target at every stage.
- `Escape` closes only the topmost registry panel, and only once: a panel that already handled
  Escape is not followed by a second close. A dialog with no declared cancel (a required choice, a
  ceremony that owns its own Escape) is never dismissed by the shared handler.
- Shortcut letters are ignored from inside a dialog or a text field, so `E` cannot end the turn
  behind an open dialog.
- Registry panels (Council, Tech, ...) are **non-modal**: Tab can leave them, by design, to reach the
  toolbar. Screens and decision dialogs are modal: Tab wraps inside.
- Hot seat: the cursor, its caption and its position are cleared when the viewer changes; the
  caption is built only from the viewer's own visibility. The handoff makes the entire UI layer
  `inert` and `aria-hidden` while it is up, so nothing of the previous player's view is exposed.

## Deliberate limitations (not claimed)

- **The map is a canvas.** Per-tile descriptions are one sentence (terrain, city, visible units);
  they do not replace the visual map for tactical reading, and there is no spatial overview
  equivalent. Cursor movement is by single hex; there is no jump-to-next-city/enemy key.
- **Browser zoom is disabled** (`user-scalable=no`), because pinch is a map gesture. axe's
  `meta-viewport` rule is switched off for that reason and it is a genuine WCAG 1.4.4 gap for
  touch users who need magnification.
- axe's `region` rule is switched off: a canvas game has no document landmarks; each screen and
  dialog is exposed as a named `role="dialog"` instead.
- **The Tech panel is one Tab stop per technology (about 100).** There is no roving focus and no
  skip link; `Focus` / `Known tree` / `All techs` change what is listed but not the stop count.
- Toast notifications, the advisor, the map context menu and the unit info panel were not audited.

## Not tested (explicit gaps)

- **No screen reader** (VoiceOver, NVDA, JAWS) was used. Accessible names, roles and live
  regions are asserted from the DOM and axe, which is necessary but not sufficient.
- **No human tested this**, keyboard-only or otherwise.
- Chromium only. Safari/iPad acceptance is out of scope (#1455 is closed not planned).
- The ceremonies are driven in a browser by mounting the real factory in a running campaign, not by the game event that normally raises them; the event-to-ceremony wiring is covered by unit tests only.
- A failing save is simulated by making IndexedDB writes throw, and a failing map load by aborting the map-data request; other failure causes (a corrupt save file, a network drop mid-write) were not driven.
- Contrast was checked only where axe reached it: text on the screens listed above, in their default
  state. Hover/focus/disabled states, the HUD, canvas overlays and every panel not in the table were
  not audited, and a visible focus indicator was not independently measured.
- Reduced-motion and high-contrast preferences were not checked against these flows.
