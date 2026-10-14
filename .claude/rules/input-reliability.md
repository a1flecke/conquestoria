---
paths:
  - "src/input/**"
  - "src/ui/**"
  - "src/app/controllers/**"
  - "tests/e2e/**"
---

# Input Reliability

## Use one semantic activation event

- A native `<button>` is activated by `click` for touch, mouse, keyboard, and assistive technology.
  Do not pair `touchend` and `click` and suppress duplicates with a timeout, timestamp cooldown, or
  module boolean. Main-thread scheduling can delay the reset while later click tasks continue.
- Use `touch-action: manipulation` when a touch-first button needs prompt native activation.
- If a control must reject overlap, tie that state to the real operation's promise or domain state,
  never an arbitrary wall-clock window.

## Async mutations are single-flight at their canonical owner

- An async mutation reachable from multiple entry points (button, keyboard, warning confirmation,
  recorder, AI/debug control) must coalesce at the shared controller/system that owns the mutation.
  Disabling one button is feedback, not the correctness boundary.
- Concurrent callers receive the same in-flight promise. Clear the flight in `finally` so later work
  can start after either success or failure.
- The initiating control must expose pending state truthfully: disable it, set `aria-busy="true"`,
  and show concise progress copy when the operation is long enough to observe. Restore all state from
  the same promise settlement.
- Regression tests must call through at least two overlapping requests and prove one mutation, then
  prove a request after settlement still runs.

## Touch classification belongs to the event stream

- Measure gesture duration with event timestamps from the same gesture, not `Date.now()` when the
  handler happens to run. Main-thread load must not turn a short tap into a long gesture.
- `touchcancel` is cleanup only. It must clear timers and candidate state and must never call tap,
  long-press, movement, or other gameplay callbacks.
- Starting a pinch or crossing the pan threshold cancels the tap candidate explicitly.
- Add negative regressions for cancellation and delayed processing whenever touch lifecycle code
  changes.

## Browser tests prove outcomes, not event delivery

- A resolved Playwright `.click()` proves only that Playwright dispatched input. For panel launchers,
  turn controls, and other stateful actions, retry only while a named semantic postcondition is absent
  (panel visible, busy state entered, prompt shown, turn changed). Guard toggle actions so a retry
  cannot close the surface it just opened.
- Raw coordinate clicks must inspect the current `elementFromPoint` result. If a known live overlay
  such as a notification owns the point, dismiss it through the UI, wait for that exact node to leave,
  recalculate the coordinate, and try again. Unknown interceptors fail with a diagnostic.
- Do not add unconditional retries that can repeat a completed mutation. Check the postcondition
  before every retry.

## Keyboard and focus: declare, don't re-implement (#1459)

- A registry panel or blocking decision dialog does not write its own focus entry, Tab trap, focus
  restore or Escape handling. `installPanelFocusManager` (`src/app/panel-focus-manager.ts`) applies one
  contract to every `PANEL_REGISTRY` panel; a new panel is covered by adding its registry entry.
- A new blocking decision dialog opts in with `markModal(root, { cancel, initialFocus })`
  (`src/ui/modal-contract.ts`): `initialFocus` is the **safe** choice (never the destructive
  confirm), `cancel` is what Escape activates, and a decision that must be made (required choice)
  declares no `cancel`. `tests/ui/modal-contract.test.ts` lists the current dialogs.
- Anything a pointer can click is a real control. A `div`/`span` with a click handler cannot be focused or
  activated from the keyboard (it shipped in the civilization cards, the whole city panel and several close marks);
  build a `<button type="button">` (inner blocks as `<span style="display:block">`), give a toggle `aria-pressed`,
  and give an icon-only button an `aria-label`. A container that keeps a pointer click as a *shortcut* must hold a
  real button doing the same job and say so with `data-pointer-shortcut`.
  `tests/ui/pointer-only-controls.test.ts` fails on the source shapes; `findPointerOnlyControls`
  (`tests/e2e/helpers/a11y-audit.ts`) checks the rendered screen.
- A pre-game screen, setup wizard stage, pause/menu overlay or one-shot decision is a modal screen: `markModal` it
  before it is appended (a wizard that re-renders one panel re-declares title, Back control and focus target per
  stage). A screen opened from another screen mounts in the **same layer**, not inside it, or the focus manager
  cannot see it. Never leave the stack with focus on the page body: the next Tab would land in the in-game toolbar
  behind the screen.
- Name every dialog (a heading or `aria-label`), label every field, and expose a selected choice with
  `aria-pressed`: colour or a border alone is not state.
- A new screen or panel is checked the way the existing ones are: add it to the keyboard specs (`issue-1459-*`) so
  focus entry, the Tab loop, axe-core (`auditWithAxe`) and the pointer-only detector run on it. A dialog without an
  accessible name or a button below 4.5:1 contrast fails there.
- Keyboard shortcuts must stay inert inside `[role="dialog"]`/`[aria-modal]` and text fields.
- Map keyboard access goes through `installKeyboardMapCursor` and ends in the same tap handler a
  pointer uses, so legality is shared. It describes only what the viewer's own visibility allows
  (`resolveTilePresentationForViewer`, `visibleUnitEntriesAtKey`) and is cleared on a viewer change.
- Supported keys and honest limits: `docs/keyboard-and-focus-acceptance.md`.
