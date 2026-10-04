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
